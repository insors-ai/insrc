/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { admitStandaloneBuild } from '../../../../workflow/runners/build/admission.js';
import { standaloneEpicHashFromFocus } from '../../../../workflow/runners/build/standalone-record.js';
import { handleBuildStep } from '../handler.js';
import type { BuildStepImplement, BuildStepError } from '../types.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';
import { seedIssue } from '../../../../workflow/__tests__/helpers/approved-issue.js';

// ---------------------------------------------------------------------------
// admitStandaloneBuild — the no-plan admission
// ---------------------------------------------------------------------------

test('admitStandaloneBuild: trivial (no LLD) is admitted under an approved ISSUE', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sa-'));
	try {
		seedIssue(dir, '0123456789abcdef');
		const v = admitStandaloneBuild(dir, '0123456789abcdef', 's1', false);
		assert.equal(v.admitted, true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('admitStandaloneBuild: Small with a missing LLD refuses (plan-missing)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sa-'));
	try {
		const v = admitStandaloneBuild(dir, standaloneEpicHashFromFocus('x'), 's1', true);
		assert.equal(v.admitted, false);
		if (!v.admitted) assert.equal(v.refusal.reason, 'plan-missing');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// handleBuildStep[implement] standalone branch
// ---------------------------------------------------------------------------

async function implement(input: Record<string, unknown>): Promise<BuildStepImplement | BuildStepError> {
	const env = await handleBuildStep({ phase: 'implement', target: '(ignored)', ...input });
	return JSON.parse((env as { content: { text: string }[] }).content[0]!.text);
}

test('trivial standalone build: admits, renders a scope-driven prompt, and persists a BUILD record', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sa-'));
	try {
		const hash = '0123456789abcdef';
		seedIssue(dir, hash);
		const out = await implement({
			repo: dir,
			standalone: { standalone: true, epicHash: hash, sizeClass: 'trivial', focus: 'Fix a typo in the status log line', triageRationale: 'one-line mechanical edit' },
		});
		assert.equal(out.next, 'implement');
		const impl = out as BuildStepImplement;
		assert.match(impl.prompt, /standalone trivial feature/);
		assert.match(impl.prompt, /Fix a typo in the status log line/);

		// The BUILD record is on disk, under the ISSUE's hash.
		const json = join(dir, '.insrc/artifacts', `BUILD-${hash}-s1.json`);
		assert.ok(existsSync(json), 'standalone BUILD record json written');
		const rec = JSON.parse(readFileSync(json, 'utf8'));
		assert.equal(rec.meta.standalone, true);
		assert.equal(rec.meta.sizeClass, 'trivial');
		assert.equal(rec.meta.triageRationale, 'one-line mechanical edit');
		// T3 (LLD-1716f77ba9ba017b-S001): the Trivial implement write is the controller's.
		assert.equal(rec.meta.authoredBy, 'controller');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sa-'));
	try {
		for (const sizeClass of ['trivial'] as const) {
			const out = await implement({ repo: dir, standalone: { standalone: true, sizeClass, focus: 'Fix a typo in the status log line' } });
			assert.equal(out.next, 'error');
			assert.equal((out as BuildStepError).error.code, 'no-identity');
			assert.match((out as BuildStepError).error.message, /approved ISSUE/);
		}
		// No hash is minted from the focus: nothing is written under it, or at all.
		const minted = standaloneEpicHashFromFocus('Fix a typo in the status log line');
		assert.equal(existsSync(join(dir, '.insrc/artifacts', `BUILD-${minted}-s1.json`)), false);
		const artifacts = join(dir, '.insrc/artifacts');
		assert.deepEqual(existsSync(artifacts) ? readdirSync(artifacts) : [], [], 'no artifact written');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sa-'));
	try {
		const call = (epicHash: string) => implement({ repo: dir, standalone: { standalone: true, epicHash, sizeClass: 'trivial', focus: 'Fix a typo' } });
		const absent = await call('1111111111111111');
		assert.equal(absent.next, 'refused', JSON.stringify(absent));
		const ra = (absent as unknown as { refusal: { reason: string; message: string } }).refusal;
		assert.equal(ra.reason, 'no-head');
		assert.match(ra.message, /no ISSUE exists under 1111111111111111/);
		assert.equal(existsSync(join(dir, '.insrc/artifacts', 'BUILD-1111111111111111-s1.json')), false, 'no BUILD record');

		seedIssue(dir, '2222222222222222', { approved: false });
		const draft = await call('2222222222222222');
		assert.equal(draft.next, 'refused');
		const rd = (draft as unknown as { refusal: { reason: string; message: string } }).refusal;
		assert.equal(rd.reason, 'no-head');
		assert.match(rd.message, /ISSUE-2222222222222222 is not approved/);
		assert.equal(existsSync(join(dir, '.insrc/artifacts', 'BUILD-2222222222222222-s1.json')), false, 'no BUILD record');

		seedIssue(dir, '3333333333333333');
		const ok = await call('3333333333333333');
		assert.equal(ok.next, 'implement', 'an approved ISSUE admits the build');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('trivial standalone build without a focus is an error (no-scope)', async () => {
	const out = await implement({ repo: '/repo', standalone: { standalone: true, sizeClass: 'trivial' } });
	assert.equal(out.next, 'error');
	assert.equal((out as BuildStepError).error.code, 'no-scope');
});

test('Small standalone build without an epicHash is an error (no-identity)', async () => {
	const out = await implement({ repo: '/repo', standalone: { standalone: true, sizeClass: 'small', focus: 'add a flag' } });
	assert.equal(out.next, 'error');
	assert.equal((out as BuildStepError).error.code, 'no-identity');
});
