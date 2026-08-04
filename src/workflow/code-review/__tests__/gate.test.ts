/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { enforceCodeReviewGate, type CodeReviewGateResult } from '../gate.js';
import { codeReviewArtifactPaths } from '../../storage.js';
import { CONFIG_CATALOG } from '../../../config/config-catalog.js';

const EPIC = 'e1';
const STORY = 's7';

/** A tmp repo dir with an optional CR-<epic>-<story>.json written under it. */
function withRepo(recordJson: string | undefined): { repoPath: string; cleanup: () => void } {
	const repoPath = mkdtempSync(join(tmpdir(), 'cr-gate-'));
	if (recordJson !== undefined) {
		const jsonPath = codeReviewArtifactPaths(repoPath, EPIC, STORY).json;
		mkdirSync(join(jsonPath, '..'), { recursive: true });
		writeFileSync(jsonPath, recordJson, 'utf8');
	}
	return { repoPath, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) };
}

/** Serialize a CR record with the given verdict + counts (the fields the gate reads). */
function crRecord(verdict: string, counts = { high: 0, med: 0, low: 0 }): string {
	return JSON.stringify({
		meta: { workflow: 'code-review', epicHash: EPIC, storyId: STORY },
		body: { kind: 'code-review', epicHash: EPIC, storyId: STORY, subject: { changedFiles: [] }, dimensions: [], verdict, counts },
	}, null, 2) + '\n';
}

function run(recordJson: string | undefined, opts?: Parameters<typeof enforceCodeReviewGate>[3]): CodeReviewGateResult {
	const { repoPath, cleanup } = withRepo(recordJson);
	try {
		return enforceCodeReviewGate(repoPath, EPIC, STORY, opts);
	} finally {
		cleanup();
	}
}

// ---- ac1: enforce on + block + no override => blocked ----

test('enforce on + verdict block + no override => { status:blocked } with the reason + counts (ac1)', () => {
	const res = run(crRecord('block', { high: 2, med: 1, low: 0 }), { enforce: true });
	assert.equal(res.status, 'blocked');
	assert.ok(res.status === 'blocked' && res.verdict === 'block');
	assert.ok(res.status === 'blocked' && res.message.includes('HIGH 2'));
	assert.ok(res.status === 'blocked' && res.counts.high === 2 && res.counts.med === 1);
});

// ---- ac2: enforce on + block + override => overridden ----

test('enforce on + verdict block + overrideReview => { status:overridden } recording the reason + at (ac2)', () => {
	const res = run(crRecord('block', { high: 1, med: 0, low: 0 }), { enforce: true, overrideReview: 'shipping under deadline' });
	assert.equal(res.status, 'overridden');
	assert.ok(res.status === 'overridden' && res.overrideReason === 'shipping under deadline');
	assert.ok(res.status === 'overridden' && typeof res.at === 'string' && res.at.length > 0);
	assert.ok(res.status === 'overridden' && res.verdict === 'block');
});

// ---- ac3: warn => warn under enforce on AND off ----

test('verdict warn => { status:warn } (allowed, warnings surfaced) under enforce on AND off (ac3)', () => {
	for (const enforce of [true, false]) {
		const res = run(crRecord('warn', { high: 0, med: 3, low: 1 }), { enforce });
		assert.equal(res.status, 'warn', `enforce=${enforce}`);
		assert.ok(res.status === 'warn' && res.counts.med === 3);
		assert.ok(res.status === 'warn' && res.advisory !== true, 'a genuine warn is NOT flagged advisory');
	}
});

// ---- ac4: pass => pass; the gate is pure + writes nothing ----

test('verdict pass => { status:pass }; the gate never approves and writes nothing (ac4/read-only)', () => {
	const { repoPath, cleanup } = withRepo(crRecord('pass'));
	try {
		const jsonPath = codeReviewArtifactPaths(repoPath, EPIC, STORY).json;
		const before = readFileSync(jsonPath, 'utf8');
		const res = enforceCodeReviewGate(repoPath, EPIC, STORY, { enforce: true });
		assert.equal(res.status, 'pass');
		assert.equal(readFileSync(jsonPath, 'utf8'), before, 'the CR json bytes are unchanged (read-only, no approval side-effect)');
	} finally {
		cleanup();
	}
});

// ---- critique 1: enforce off + block => non-blocking advisory (distinct from a genuine warn) ----

test('enforce OFF + verdict block => a non-blocking advisory warn (advisory:true + demoted-block message), distinct from a genuine warn (critique 1)', () => {
	const res = run(crRecord('block', { high: 1, med: 0, low: 0 }), { enforce: false });
	assert.equal(res.status, 'warn');
	assert.ok(res.status === 'warn' && res.advisory === true, 'the demoted block is flagged advisory:true');
	assert.ok(res.status === 'warn' && /block/i.test(res.message) && /enforce/i.test(res.message), 'the message names the demoted block verdict + that enforcement is off');
});

// ---- ac4 / additive: absent record => no-review ----

test('absent CR record => { status:no-review } (strictly additive; completion unchanged) (ac4)', () => {
	const res = run(undefined, { enforce: true });
	assert.equal(res.status, 'no-review');
});

// ---- fail-open: malformed + unknown-verdict => no-review ----

test('a malformed CR json => { status:no-review } (fail-open, never a spurious block)', () => {
	const res = run('{ this is not valid json', { enforce: true });
	assert.equal(res.status, 'no-review');
});

test('a CR record whose verdict is outside the ReviewVerdict union => { status:no-review } (fail-open)', () => {
	const res = run(crRecord('exploded'), { enforce: true });
	assert.equal(res.status, 'no-review');
});

// ---- override is a no-op on a non-block verdict ----

test('an overrideReview reason on a non-block verdict (pass/warn) is a no-op (no overridden status)', () => {
	const pass = run(crRecord('pass'), { enforce: true, overrideReview: 'ignore me' });
	assert.equal(pass.status, 'pass');
	const warn = run(crRecord('warn', { high: 0, med: 1, low: 0 }), { enforce: true, overrideReview: 'ignore me' });
	assert.equal(warn.status, 'warn');
});

// ---- critique 2: readEnforceFlag fail-safe (never throws; opts.enforce omitted reads config) ----

test('readEnforceFlag fail-safe: opts.enforce omitted on a block record NEVER throws and yields a valid outcome (default false path)', () => {
	// opts.enforce omitted => the gate reads the real config via readEnforceFlag,
	// which defaults to false + never throws. The outcome must be a valid status
	// (advisory warn when the flag is off/absent, or blocked if the machine opted in) —
	// never a thrown error.
	let res: CodeReviewGateResult | undefined;
	assert.doesNotThrow(() => { res = run(crRecord('block', { high: 1, med: 0, low: 0 })); });
	assert.ok(res && ['blocked', 'overridden', 'warn'].includes(res.status), 'a valid outcome, never a throw');
});

// ---- t1: CONFIG_CATALOG declares codeReview.enforce (default false) ----

test('CONFIG_CATALOG declares codeReview.enforce with type boolean + default false', () => {
	const entry = CONFIG_CATALOG.find(o => o.path === 'codeReview.enforce');
	assert.ok(entry, 'codeReview.enforce is present in CONFIG_CATALOG');
	assert.equal(entry!.type, 'boolean');
	assert.equal(entry!.default, false);
});
