/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { admitStandaloneBuild } from '../../../workflow/runners/build/admission.js';
import { standaloneEpicHashFromFocus } from '../../../workflow/runners/build/standalone-record.js';
import { handleBuildStep } from '../handler.js';
import type { BuildStepImplement, BuildStepError } from '../types.js';

// ---------------------------------------------------------------------------
// admitStandaloneBuild — the no-plan admission
// ---------------------------------------------------------------------------

test('admitStandaloneBuild: trivial (no LLD) is admitted directly', () => {
	const v = admitStandaloneBuild('/repo', '0123456789abcdef', 'S001', false);
	assert.equal(v.admitted, true);
});

test('admitStandaloneBuild: Small with a missing LLD refuses (plan-missing)', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-sa-'));
	try {
		const v = admitStandaloneBuild(dir, standaloneEpicHashFromFocus('x'), 'S001', true);
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
		const out = await implement({
			repo: dir,
			standalone: { standalone: true, sizeClass: 'trivial', focus: 'Fix a typo in the status log line', triageRationale: 'one-line mechanical edit' },
		});
		assert.equal(out.next, 'implement');
		const impl = out as BuildStepImplement;
		assert.match(impl.prompt, /standalone trivial feature/);
		assert.match(impl.prompt, /Fix a typo in the status log line/);

		// The tracking record is on disk (the trivial change's only ledger entry).
		const hash = standaloneEpicHashFromFocus('Fix a typo in the status log line');
		const json = join(dir, '.insrc/artifacts', `BUILD-${hash}-S001.json`);
		assert.ok(existsSync(json), 'standalone BUILD record json written');
		const rec = JSON.parse(readFileSync(json, 'utf8'));
		assert.equal(rec.meta.standalone, true);
		assert.equal(rec.meta.sizeClass, 'trivial');
		assert.equal(rec.meta.triageRationale, 'one-line mechanical edit');
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
