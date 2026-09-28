/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) unit tests — the per-type diagram handler registry + the thin
 * judgeDiagram dispatcher + the ER handler. Proves: S003 registers only 'er'; a
 * duplicate throws; judgeDiagram dispatches a companion to its owning handler (spy)
 * and aggregates; a companion no handler owns yields a LOW observation; the ER
 * handler validates the JSON element and flags a referenced-but-absent companion
 * file (ac3). Deterministic — no provider used.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/code-review/dimensions/__tests__/diagram.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	registerDiagramHandler,
	diagramHandlerFor,
	DuplicateDiagramHandlerError,
	_unregisterDiagramHandlerForTests,
	type DiagramAdherenceHandler,
} from '../diagram/registry.js';
import { judgeDiagram, hasDiagramReferences } from '../diagram/index.js';
import { erDiagramHandler } from '../diagram/handlers/er.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionFinding } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';
import type { ErDefinition } from '../../../artifacts/companion/er.js';
import type { CompanionArtifactRef } from '../../../artifacts/companion/types.js';

const grounding: CodeReviewGrounding = { symbols: [] };
const provider = {} as unknown as LLMProvider;

const validEr: ErDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};

/** A CodeReviewSubject carrying an approved LLD body with the given ER/companions. */
function subject(body: { erDefinition?: ErDefinition; companions?: readonly CompanionArtifactRef[] }, repoPath = '/repo'): CodeReviewSubject {
	return {
		repoPath, epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: ['src/a.ts'],
		approvedLld: { meta: {}, body } as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: null,
		buildRecord: null,
	};
}

afterEach(() => { _unregisterDiagramHandlerForTests('ux'); });   // drop any spy peer

// ── registry ──────────────────────────────────────────────────────────────────

test('registry: S003 registers the ER handler; a duplicate registration throws (fail-fast)', () => {
	assert.equal(diagramHandlerFor('er'), erDiagramHandler);
	assert.throws(() => registerDiagramHandler(erDiagramHandler), DuplicateDiagramHandlerError);
});

// ── judgeDiagram dispatch ───────────────────────────────────────────────────────

test('judgeDiagram: dispatches an erDefinition-bearing body to the ER handler (sound → no findings)', async () => {
	const res = await judgeDiagram(subject({ erDefinition: validEr }), grounding, provider);
	assert.equal(res.dimension, 'diagram');
	assert.deepEqual(res.findings, []);
});

test('judgeDiagram: a dangling erDefinition folds a HIGH breach through the dimension', async () => {
	const dangling: ErDefinition = { classes: { Order: { attributes: { customer: { range: 'Customer' } } } } };
	const res = await judgeDiagram(subject({ erDefinition: dangling }), grounding, provider);
	assert.ok(res.findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach'));
});

test('judgeDiagram: dispatches a companion to its owning registered handler (spy) + aggregates', async () => {
	const seen: string[] = [];
	const spy: DiagramAdherenceHandler = {
		type: 'ux',
		appliesTo: (ref) => ref.kind === 'ux-mock',
		// eslint-disable-next-line @typescript-eslint/require-await
		judge: async () => { seen.push('ux'); return [{ dimension: 'diagram', severity: 'MED', location: 'x:1', message: 'ux checked' } as DimensionFinding]; },
	};
	registerDiagramHandler(spy);
	const res = await judgeDiagram(subject({ companions: [{ kind: 'ux-mock', relPath: 'docs/x/ux.html', title: 'UX' }] }), grounding, provider);
	assert.deepEqual(seen, ['ux']);
	assert.ok(res.findings.some(f => f.message === 'ux checked'));
});

test('judgeDiagram: a companion no handler owns yields ONE LOW observation (never throws)', async () => {
	// No 'ux' handler is registered here (afterEach dropped it).
	const res = await judgeDiagram(subject({ companions: [{ kind: 'ux-mock', relPath: 'docs/x/ux.html', title: 'UX' }] }), grounding, provider);
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.severity, 'LOW');
	assert.equal(res.findings[0]!.confidence, 'observation');
	assert.match(res.findings[0]!.message, /no registered diagram handler/);
});

// ── ER handler: referenced-but-absent companion (ac3) ───────────────────────────

test('ER handler: a referenced-but-absent companion file → HIGH breach (ac3)', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'er-review-'));
	const res = await judgeDiagram(
		subject({ erDefinition: validEr, companions: [{ kind: 'diagram-mermaid', relPath: 'docs/epics/x/S001/er-model.html', title: 'ER model' }] }, repo),
		grounding, provider,
	);
	assert.ok(res.findings.some(f => f.severity === 'HIGH' && /missing/i.test(f.message)));
	rmSync(repo, { recursive: true, force: true });
});

test('ER handler: a present companion file → no absent-file breach', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'er-review-'));
	const rel = 'er-model.html';
	writeFileSync(join(repo, rel), '<html></html>');
	const res = await judgeDiagram(
		subject({ erDefinition: validEr, companions: [{ kind: 'diagram-mermaid', relPath: rel, title: 'ER model' }] }, repo),
		grounding, provider,
	);
	assert.ok(!res.findings.some(f => /missing/i.test(f.message)));
	rmSync(repo, { recursive: true, force: true });
});

// ── hasDiagramReferences gate ────────────────────────────────────────────────

test('hasDiagramReferences: true for an erDefinition and/or a diagram companion; false otherwise', () => {
	assert.equal(hasDiagramReferences(subject({ erDefinition: validEr })), true);
	assert.equal(hasDiagramReferences(subject({ companions: [{ kind: 'diagram-mermaid', relPath: 'a.html', title: 't' }] })), true);
	assert.equal(hasDiagramReferences(subject({})), false);
});
