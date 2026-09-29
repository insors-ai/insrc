/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S004) unit tests — the first-class 'ux' dimension judge + the hasUxAcceptance
 * inclusion gate, plus the verification that hasDiagramReferences now EXCLUDES a
 * ux-mock-only subject (t4). Deterministic — no provider used.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/code-review/dimensions/__tests__/ux.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { judgeUx, hasUxAcceptance, adherenceSelectionOf } from '../ux/index.js';
import { hasDiagramReferences } from '../diagram/index.js';
import type { CodeReviewSubject, CodeReviewGrounding } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';
import type { UxDefinition } from '../../../artifacts/companion/ux.js';
import type { AdherenceSelection } from '../../../artifacts/companion/adherence.js';
import type { CompanionArtifactRef } from '../../../artifacts/companion/types.js';

const grounding: CodeReviewGrounding = { symbols: [] };
const provider = {} as unknown as LLMProvider;

const validUx: UxDefinition = { type: 'AdaptiveCard', body: [{ type: 'TextBlock', text: 'hi' }] };

function subject(body: { uxDefinition?: UxDefinition; adherence?: AdherenceSelection; companions?: readonly CompanionArtifactRef[] }, repoPath = '/repo'): CodeReviewSubject {
	return {
		repoPath, epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: ['src/a.ts'],
		approvedLld: { meta: {}, body } as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: null,
		buildRecord: null,
	};
}

// ── hasUxAcceptance gate ──────────────────────────────────────────────────────

test('hasUxAcceptance: true for a uxDefinition, an adherence selection incl \'ux\', or a ux-mock companion; false otherwise', () => {
	assert.equal(hasUxAcceptance(subject({ uxDefinition: validUx })), true);
	assert.equal(hasUxAcceptance(subject({ adherence: { dimensions: ['ux'] } })), true);
	assert.equal(hasUxAcceptance(subject({ companions: [{ kind: 'ux-mock', relPath: 'a.html', title: 'UX' }] })), true);
	assert.equal(hasUxAcceptance(subject({ adherence: { dimensions: ['diagram-er'] } })), false);
	assert.equal(hasUxAcceptance(subject({})), false);
});

test('adherenceSelectionOf: reads the recorded selection ([] when absent)', () => {
	assert.deepEqual(adherenceSelectionOf(subject({ adherence: { dimensions: ['ux', 'diagram-er'] } })), ['ux', 'diagram-er']);
	assert.deepEqual(adherenceSelectionOf(subject({})), []);
});

// ── hasDiagramReferences EXCLUDES ux-mock (t4) ────────────────────────────────

test('hasDiagramReferences: FALSE for a ux-mock-only subject (excludes ux-mock; counts only diagram-*)', () => {
	assert.equal(hasDiagramReferences(subject({ companions: [{ kind: 'ux-mock', relPath: 'a.html', title: 'UX' }] })), false);
	// a diagram-* companion still triggers diagram (no regression)
	assert.equal(hasDiagramReferences(subject({ companions: [{ kind: 'diagram-mermaid', relPath: 'a.html', title: 'ER' }] })), true);
});

// ── judgeUx ───────────────────────────────────────────────────────────────────

test('judgeUx: a schema-valid uxDefinition → dimension:ux, no findings', async () => {
	const res = await judgeUx(subject({ uxDefinition: validUx }), grounding, provider);
	assert.equal(res.dimension, 'ux');
	assert.deepEqual(res.findings, []);
});

test('judgeUx: adherence requires \'ux\' but no uxDefinition / no ux-mock evidence → HIGH breach (ac2)', async () => {
	const res = await judgeUx(subject({ adherence: { dimensions: ['ux'] } }), grounding, provider);
	assert.ok(res.findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach' && /UX acceptance required/i.test(f.message)));
});

test('judgeUx: a schema-invalid uxDefinition folds a HIGH breach through the dimension', async () => {
	const res = await judgeUx(subject({ uxDefinition: { type: 'AdaptiveCard', body: [{ type: 'Bogus' }] } as unknown as UxDefinition }), grounding, provider);
	assert.ok(res.findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach'));
});

test('judgeUx: a referenced-but-absent ux-mock companion file → HIGH breach', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'ux-review-'));
	const res = await judgeUx(
		subject({ uxDefinition: validUx, companions: [{ kind: 'ux-mock', relPath: 'docs/x/S004/ux-mock.html', title: 'UX mock' }] }, repo),
		grounding, provider,
	);
	assert.ok(res.findings.some(f => f.severity === 'HIGH' && /missing/i.test(f.message)));
	rmSync(repo, { recursive: true, force: true });
});

test('judgeUx: a present ux-mock companion file → no absent-file breach', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'ux-review-'));
	writeFileSync(join(repo, 'ux-mock.html'), '<html></html>');
	const res = await judgeUx(
		subject({ uxDefinition: validUx, companions: [{ kind: 'ux-mock', relPath: 'ux-mock.html', title: 'UX mock' }] }, repo),
		grounding, provider,
	);
	assert.ok(!res.findings.some(f => /missing/i.test(f.message)));
	rmSync(repo, { recursive: true, force: true });
});

test('judgeUx: an unknown recorded adherence member → HIGH breach', async () => {
	const res = await judgeUx(subject({ uxDefinition: validUx, adherence: { dimensions: ['bogus'] as unknown as AdherenceSelection['dimensions'] } }), grounding, provider);
	assert.ok(res.findings.some(f => f.severity === 'HIGH' && /unknown adherence dimension/i.test(f.message)));
});
