/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildExtractPrompt, EXTRACT_SCHEMA } from '../../../workflow/review/extract.js';
import { buildVerifyPrompt, VERIFY_SCHEMA } from '../../../workflow/review/verify.js';
import type { Claim, Evidence, ReviewReport } from '../../../workflow/review/types.js';
import { handleReviewStep } from '../handler.js';
import { _clearReviewStateStoreForTests } from '../state-store.js';

// ---------------------------------------------------------------------------
// Fixture: a temp repo + a persisted artifact (md + json with meta.workflow).
// The artifact claims "two" exported constants but the repo has THREE.
// ---------------------------------------------------------------------------

const ARTIFACT_MD = [
	'# Story s1',
	'',
	'- t1: extend the two exported constants in foo.',
	'- t2: beta constant defined at src/foo.ts:2.',
	'',
].join('\n');

function makeFixture(): { repo: string; mdPath: string; jsonPath: string; cleanup: () => void } {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-review-step-'));
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(
		join(repo, 'src', 'foo.ts'),
		['export const alpha = 1;', 'export const beta = 2;', 'export const gamma = 3;', ''].join('\n'),
	);
	// Side-by-side md + json under docs/stub (the layout jsonPathForMd resolves
	// by extension swap), so the tool can map md → json deterministically.
	const dir = join(repo, 'docs', 'stub');
	mkdirSync(dir, { recursive: true });
	const mdPath = join(dir, 's1.md');
	const jsonPath = join(dir, 's1.json');
	writeFileSync(mdPath, ARTIFACT_MD);
	writeFileSync(
		jsonPath,
		JSON.stringify(
			{ meta: { workflow: 'plan' }, body: { tasks: ['extend the two exported constants in foo.'] } },
			null,
			2,
		) + '\n',
	);
	return { repo, mdPath, jsonPath, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Canned controller outputs
// ---------------------------------------------------------------------------

const CLAIMS = {
	claims: [
		{
			id: 'c-inv', ref: 's1/t1', kind: 'inventory',
			text: 'There are exactly two exported constants in foo.',
			anchors: ['src/foo.ts'],
			probe: { greps: ['^export const'] },
		},
		{
			id: 'c-cite', ref: 's1/t2', kind: 'citation',
			text: 'beta constant defined at src/foo.ts:2.',
			anchors: ['src/foo.ts:2'],
			probe: { reads: ['src/foo.ts:2'] },
		},
	],
};

// One HIGH (with an auto-fix) + one LOW.
const VERDICTS = {
	verdicts: [
		{
			claimId: 'c-inv',
			severity: 'HIGH',
			evidence: 'ripgrep re-derived THREE `export const` sites, not two.',
			action: 'Correct the count to three.',
			fixability: 'auto',
			proposedFix: {
				rationale: 'Grep found three exported constants.',
				artifactEdits: [{ find: 'two exported constants', replace: 'three exported constants' }],
			},
		},
		{
			claimId: 'c-cite',
			severity: 'LOW',
			evidence: 'read src/foo.ts:2 → `export const beta = 2;` confirms the citation.',
			action: 'none — verified sound',
			fixability: 'manual',
		},
	],
};

function parse(env: { content: { text: string }[] }): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first);
	return JSON.parse(first.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// (1) Full loop: start → claims → verdicts → done(block), meta.review stamped
// ---------------------------------------------------------------------------

test('review-step drives the full loop and stamps meta.review with model=client', async () => {
	_clearReviewStateStoreForTests();
	const fx = makeFixture();
	try {
		// --- start ---
		const startOut = parse(await handleReviewStep({ phase: 'start', artifact: fx.mdPath, repo: fx.repo }));
		assert.equal(startOut['next'], 'emit_claims');
		assert.equal(startOut['stage'], 'plan');
		assert.ok(typeof startOut['state'] === 'string' && (startOut['state'] as string).length > 0, 'state token present');
		const startPrompt = startOut['prompt'] as { system: string; user: string };
		assert.ok(startPrompt.system.length > 0 && startPrompt.user.includes('two exported constants'), 'extract prompt carries the artifact');
		assert.ok((startOut['schema'] as Record<string, unknown>)['properties'], 'extract schema present');
		const state1 = startOut['state'] as string;

		// --- claims ---
		const claimsOut = parse(await handleReviewStep({ phase: 'claims', claims: CLAIMS, state: state1 }));
		assert.equal(claimsOut['next'], 'emit_verdicts');
		assert.equal(claimsOut['state'], state1, 'state token is stable across turns');
		const evidence = claimsOut['evidence'] as Evidence[];
		assert.ok(Array.isArray(evidence) && evidence.length === 2, 'evidence gathered for both claims');
		// The deterministic grep re-derived THREE export-const sites.
		const invEv = evidence.find(e => e.claimId === 'c-inv');
		assert.ok(invEv, 'inventory evidence present');
		assert.equal(invEv.grepResults.flatMap(g => g.matches).filter(m => m.includes('export const')).length, 3, 'grep found 3 export-const sites');
		// The citation read confirmed the real line.
		const citeEv = evidence.find(e => e.claimId === 'c-cite');
		assert.ok(citeEv);
		assert.equal(citeEv.reads[0]?.found, true);
		assert.match(citeEv.reads[0]?.line ?? '', /beta = 2/);
		const verifyPrompt = claimsOut['prompt'] as { system: string; user: string };
		assert.ok(verifyPrompt.user.includes('c-inv') && verifyPrompt.user.includes('c-cite'), 'batched prompt names both claims');

		// --- verdicts ---
		const doneOut = parse(await handleReviewStep({ phase: 'verdicts', verdicts: VERDICTS, state: state1 }));
		assert.equal(doneOut['next'], 'done');
		assert.equal(doneOut['verdict'], 'block', 'a HIGH finding blocks (default blockOn HIGH+MED)');
		assert.deepEqual(doneOut['counts'], { high: 1, med: 0, low: 1 });
		assert.equal(doneOut['applied'], 1, 'the one auto-fix was applied');
		assert.ok(typeof doneOut['report'] === 'string' && (doneOut['report'] as string).includes('BLOCK'), 'rendered report returned');

		// --- persistence: meta.review stamped with model=client ---
		const persisted = JSON.parse(readFileSync(fx.jsonPath, 'utf8')) as { meta: { review?: ReviewReport }; body: unknown };
		const review = persisted.meta.review;
		assert.ok(review, 'meta.review stamped on the json');
		assert.equal(review.model, 'client', 'review model is the controller, not the daemon provider');
		assert.equal(review.verdict, 'block');
		assert.deepEqual(review.counts, { high: 1, med: 0, low: 1 });
		assert.equal(review.stage, 'plan');
		// The auto-fix rewrote the body too (two → three).
		assert.match(JSON.stringify(persisted.body), /three exported constants/);
		// The amended md carries the applied fix + a rendered review section.
		const amendedMd = readFileSync(fx.mdPath, 'utf8');
		assert.match(amendedMd, /three exported constants/);
		assert.match(amendedMd, /<!-- insrc:review -->/);
	} finally {
		fx.cleanup();
	}
});

// ---------------------------------------------------------------------------
// (2) A stale state token errors cleanly.
// ---------------------------------------------------------------------------

test('review-step verdicts with an unknown state token returns an error envelope', async () => {
	_clearReviewStateStoreForTests();
	const env = await handleReviewStep({ phase: 'verdicts', verdicts: VERDICTS, state: 'no-such-token' });
	assert.equal(env.isError, true);
	const out = parse(env);
	assert.equal(out['next'], 'error');
});

// ---------------------------------------------------------------------------
// (3) The extract / verify prompt + schema exports compile + shape-check.
// ---------------------------------------------------------------------------

test('buildExtractPrompt / EXTRACT_SCHEMA export the expected shape', () => {
	const p = buildExtractPrompt('# artifact body', 'plan');
	assert.ok(p.system.length > 0);
	assert.ok(p.user.includes('# artifact body'), 'artifact markdown at the prompt tail');
	const schema = EXTRACT_SCHEMA as { required?: string[]; properties?: Record<string, unknown> };
	assert.deepEqual(schema.required, ['claims']);
	assert.ok(schema.properties && 'claims' in schema.properties);
});

test('buildVerifyPrompt / VERIFY_SCHEMA export the expected shape', () => {
	const claim: Claim = { id: 'c1', kind: 'inventory', text: 'two things', anchors: ['src/x.ts'], probe: { greps: ['thing'] } };
	const evidence: Evidence = { claimId: 'c1', grepResults: [{ pattern: 'thing', matches: ['src/x.ts:1:thing'], truncated: false }], reads: [] };
	const p = buildVerifyPrompt(claim, evidence);
	assert.ok(p.system.length > 0);
	assert.ok(p.user.includes('two things'), 'premise present');
	assert.ok(p.user.includes('src/x.ts:1:thing'), 'gathered evidence at the prompt tail');
	const schema = VERIFY_SCHEMA as { required?: string[]; properties?: Record<string, unknown> };
	assert.deepEqual(schema.required, ['severity', 'evidence', 'action', 'fixability']);
	assert.ok(schema.properties && 'fixability' in schema.properties);
});
