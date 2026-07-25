/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the model-attribution shim (S004 — sc5): attributionOf,
 * modelSummary, singleModelAttribution. Pure projection/aggregation/legacy-read
 * logic — no run driven.
 *
 * Run: npx tsx --test src/workflow/__tests__/attribution.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ArtifactMetaBase, OutputModelStamp } from '../types.js';
import { attributionOf, modelSummary, singleModelAttribution } from '../attribution.js';

/** Minimal meta stub — only the fields the shim reads. */
function meta(over: Partial<ArtifactMetaBase>): ArtifactMetaBase {
	return {
		workflow: 'stub', runId: 'r', repoPath: '/r', createdAt: '2026-01-01T00:00:00Z',
		elapsedMs: 1, repoIndexedAt: null, schemaVersion: 1, ...over,
	} as ArtifactMetaBase;
}

const CHEAP: OutputModelStamp = { role: 'analyze.narrow', tier: 'cheap', runner: 'ollama', model: 'qwen-small' };
const MID:   OutputModelStamp = { role: 'synthesize', tier: 'mid', runner: 'cli-claude', model: 'sonnet' };

// ── attributionOf ───────────────────────────────────────────────────────────

test('attributionOf returns the stored aggregate when present (authoritative)', () => {
	const m = meta({ attribution: { outputs: [CHEAP, MID] }, model: 'stale-scalar' });
	assert.deepEqual(attributionOf(m), [CHEAP, MID]); // dual-source: aggregate wins, scalar ignored
});

test('attributionOf preserves multiplicity — repeated identical rows are not deduped', () => {
	const m = meta({ attribution: { outputs: [MID, MID, MID] } });
	assert.equal(attributionOf(m).length, 3);
});

test('attributionOf on a zero-output NEW artifact returns [] (empty aggregate is authoritative)', () => {
	assert.deepEqual(attributionOf(meta({ attribution: { outputs: [] } })), []);
});

test('attributionOf shims a legacy scalar into a single (legacy)-role stamp', () => {
	const out = attributionOf(meta({ model: 'ollama:qwen3.6:35b-a3b' }));
	assert.equal(out.length, 1);
	assert.equal(out[0]!.role, '(legacy)');
	assert.equal(out[0]!.runner, 'ollama');
	assert.equal(out[0]!.model, 'qwen3.6:35b-a3b');
});

test('attributionOf on a pre-attribution artifact (neither field) returns [] — no fabricated model', () => {
	assert.deepEqual(attributionOf(meta({})), []);
});

// ── modelSummary ─────────────────────────────────────────────────────────────

test('modelSummary collapses a homogeneous run to a single runner:model', () => {
	assert.equal(modelSummary(meta({ attribution: { outputs: [MID, MID] } })), 'cli-claude:sonnet');
});

test('modelSummary renders a heterogeneous run as mixed(...)', () => {
	const s = modelSummary(meta({ attribution: { outputs: [CHEAP, MID] } }));
	assert.match(s, /^mixed\(2: /);
	assert.match(s, /ollama:qwen-small/);
	assert.match(s, /cli-claude:sonnet/);
});

test('modelSummary of a legacy artifact returns its original scalar label unchanged', () => {
	assert.equal(modelSummary(meta({ model: 'ollama:qwen3-test' })), 'ollama:qwen3-test');
});

test('modelSummary of a fully-unattributed artifact reads "unknown"', () => {
	assert.equal(modelSummary(meta({})), 'unknown');
});

// ── singleModelAttribution (client-driven write path) ────────────────────────

test('singleModelAttribution wraps a client label into one (client)-role stamp', () => {
	const a = singleModelAttribution('client');
	assert.equal(a.outputs.length, 1);
	assert.equal(a.outputs[0]!.role, '(client)');
	assert.equal(a.outputs[0]!.model, 'client');
});

test('singleModelAttribution parses an ollama:<model> label into runner+model', () => {
	const a = singleModelAttribution('ollama:qwen3-test');
	assert.equal(a.outputs[0]!.runner, 'ollama');
	assert.equal(a.outputs[0]!.model, 'qwen3-test');
});
