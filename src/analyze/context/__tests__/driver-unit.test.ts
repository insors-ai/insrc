/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Driver pure-function unit tests -- the bits of driver.ts that DON'T
 * touch the LLM.
 *
 * The driver's end-to-end behavior (tool-loop convergence, schema retry
 * loop, real Ollama failures) is exercised in driver.live.test.ts
 * against the project's installed Ollama. This file pins:
 *
 *   - _stableStringifyForTest: deterministic key derivation
 *   - _classifyOllamaErrorForTest: ECONNREFUSED / fetch failed /
 *     "Ollama is not running" / "Model not found" all map to
 *     ShaperLlmUnavailableError
 *   - _deriveEmptyLayersForTest: walks the seven layers, returns the
 *     names of all-empty-string entries
 *   - The typed error classes carry the right name + message shape
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/driver-unit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ShaperLlmUnavailableError,
	ShaperPromptMissingError,
	ShaperSchemaUnrecoverable,
	ShaperToolLoopExhausted,
	_classifyOllamaErrorForTest,
	_deriveEmptyLayersForTest,
	_renderUpstreamSectionForTest,
	_stableStringifyForTest,
} from '../driver.js';
import type {
	AnalyzeContextBundle,
	ClassificationShapeInput,
	RunShapeInput,
	TaskShapeInput,
} from '../types.js';
import type {
	AnalyzeTaskTemplate,
	ClassifiedIntent,
	PlannedTask,
} from '../../../shared/analyze-types.js';

// ---------------------------------------------------------------------------
// _stableStringifyForTest
// ---------------------------------------------------------------------------

test('stable stringify produces identical output for object key permutations', () => {
	const a = { foo: 1, bar: { x: 10, y: 20 }, baz: [1, 2, 3] };
	const b = { baz: [1, 2, 3], bar: { y: 20, x: 10 }, foo: 1 };
	assert.equal(_stableStringifyForTest(a), _stableStringifyForTest(b));
});

test('stable stringify is order-stable for Maps with reverse insertion', () => {
	const m1 = new Map<string, unknown>();
	m1.set('alpha', 1);
	m1.set('beta',  2);
	const m2 = new Map<string, unknown>();
	m2.set('beta',  2);
	m2.set('alpha', 1);
	assert.equal(_stableStringifyForTest(m1), _stableStringifyForTest(m2));
});

test('stable stringify treats different values as distinct', () => {
	assert.notEqual(_stableStringifyForTest({ a: 1 }), _stableStringifyForTest({ a: 2 }));
});

test('stable stringify is deterministic for arrays (insertion order matters)', () => {
	// Arrays SHOULD be order-sensitive -- they are ordered collections.
	assert.notEqual(_stableStringifyForTest([1, 2]), _stableStringifyForTest([2, 1]));
});

// ---------------------------------------------------------------------------
// _classifyOllamaErrorForTest
// ---------------------------------------------------------------------------

test('classifyOllamaError(ECONNREFUSED) -> ShaperLlmUnavailableError', () => {
	const err = new Error('connect ECONNREFUSED 127.0.0.1:11434');
	const out = _classifyOllamaErrorForTest(err);
	assert.ok(out instanceof ShaperLlmUnavailableError);
	assert.match(out.message, /ECONNREFUSED/);
});

test('classifyOllamaError("Ollama is not running. Start it...") -> ShaperLlmUnavailableError', () => {
	const err = new Error('Ollama is not running. Start it with: ollama serve');
	const out = _classifyOllamaErrorForTest(err);
	assert.ok(out instanceof ShaperLlmUnavailableError);
});

test('classifyOllamaError("Model not found ...") -> ShaperLlmUnavailableError', () => {
	const err = new Error('Model not found in Ollama. Pull it with: ollama pull qwen3-coder');
	const out = _classifyOllamaErrorForTest(err);
	assert.ok(out instanceof ShaperLlmUnavailableError);
});

test('classifyOllamaError("fetch failed") -> ShaperLlmUnavailableError (retries exhausted by provider)', () => {
	const err = new Error('fetch failed');
	const out = _classifyOllamaErrorForTest(err);
	assert.ok(out instanceof ShaperLlmUnavailableError);
});

test('classifyOllamaError("Did not receive done...") -> ShaperLlmUnavailableError (retries exhausted)', () => {
	// By the time this reaches the driver, the provider has burned
	// through its transient-retry budget -- so the failure is terminal
	// from the driver's perspective.
	const err = new Error('Did not receive done or success response in stream');
	const out = _classifyOllamaErrorForTest(err);
	assert.ok(out instanceof ShaperLlmUnavailableError);
});

test('classifyOllamaError("ECONNRESET") -> ShaperLlmUnavailableError', () => {
	const err = new Error('socket ECONNRESET');
	const out = _classifyOllamaErrorForTest(err);
	assert.ok(out instanceof ShaperLlmUnavailableError);
});

test('classifyOllamaError("socket hang up") -> ShaperLlmUnavailableError', () => {
	const err = new Error('socket hang up');
	const out = _classifyOllamaErrorForTest(err);
	assert.ok(out instanceof ShaperLlmUnavailableError);
});

test('classifyOllamaError(arbitrary other Error) -> original error', () => {
	const err = new Error('something unrelated');
	const out = _classifyOllamaErrorForTest(err);
	assert.equal(out, err);
});

test('classifyOllamaError(non-Error value) -> wraps in Error', () => {
	const out = _classifyOllamaErrorForTest('string thrown');
	assert.ok(out instanceof Error);
	assert.equal(out.message, 'string thrown');
});

// ---------------------------------------------------------------------------
// _deriveEmptyLayersForTest
// ---------------------------------------------------------------------------

function bundleWith(overrides: Partial<AnalyzeContextBundle>): AnalyzeContextBundle {
	return {
		system:    '',
		focus:     '',
		summary:   '',
		structure: '',
		surface:   '',
		artefacts: '',
		upstream:  '',
		...overrides,
	};
}

test('deriveEmptyLayers on an all-empty bundle returns every layer', () => {
	const out = _deriveEmptyLayersForTest(bundleWith({}));
	assert.deepEqual([...out].sort(), [
		'artefacts',
		'focus',
		'structure',
		'summary',
		'surface',
		'system',
		'upstream',
	]);
});

test('deriveEmptyLayers on a fully-populated bundle returns []', () => {
	const out = _deriveEmptyLayersForTest(bundleWith({
		system:    's',
		focus:     'f',
		summary:   'sm',
		structure: 'st',
		surface:   'su',
		artefacts: 'a',
		upstream:  'u',
	}));
	assert.deepEqual(out, []);
});

test('deriveEmptyLayers treats whitespace-only bodies as empty', () => {
	const out = _deriveEmptyLayersForTest(bundleWith({
		summary: '   \n\n  ',
		surface: 'real content',
	}));
	assert.ok(out.includes('summary'));
	assert.ok(!out.includes('surface'));
});

test('deriveEmptyLayers preserves the spec render order in its return', () => {
	const out = _deriveEmptyLayersForTest(bundleWith({ summary: 'x', artefacts: 'y' }));
	// Expected to be in render order: system, focus, structure, surface, upstream
	// (summary + artefacts are non-empty)
	assert.deepEqual([...out], ['system', 'focus', 'structure', 'surface', 'upstream']);
});

// ---------------------------------------------------------------------------
// Typed error classes
// ---------------------------------------------------------------------------

test('ShaperLlmUnavailableError carries the cause in its message', () => {
	const e = new ShaperLlmUnavailableError('ECONNREFUSED');
	assert.equal(e.name, 'ShaperLlmUnavailableError');
	assert.match(e.message, /Local Ollama unavailable/);
	assert.match(e.message, /ECONNREFUSED/);
});

test('ShaperToolLoopExhausted carries the turn count in its message', () => {
	const e = new ShaperToolLoopExhausted(3);
	assert.equal(e.name, 'ShaperToolLoopExhausted');
	assert.match(e.message, /maxToolTurns=3/);
});

test('ShaperSchemaUnrecoverable carries the retry count + reasons in its message', () => {
	const e = new ShaperSchemaUnrecoverable(3, ['missing required field summary', 'invalid type']);
	assert.equal(e.name, 'ShaperSchemaUnrecoverable');
	assert.match(e.message, /3 retries/);
	assert.match(e.message, /missing required field summary/);
	assert.match(e.message, /invalid type/);
});

test('ShaperPromptMissingError carries the absolute prompt path', () => {
	const e = new ShaperPromptMissingError('/abs/path/to/prompt.md');
	assert.equal(e.name, 'ShaperPromptMissingError');
	assert.match(e.message, /\/abs\/path\/to\/prompt\.md/);
});

// ---------------------------------------------------------------------------
// renderUpstreamSection (P6 missing-upstream rendering)
// ---------------------------------------------------------------------------

function classificationInputs(): ClassificationShapeInput {
	return {
		scopeRef:   { kind: 'workspace', value: '/ws' },
		userPrompt: 'hello',
	};
}

function runInputs(): RunShapeInput {
	const intent: ClassifiedIntent = {
		target:    'code',
		scope:     'M',
		focused:   false,
		scopeRef:  { kind: 'repo', value: '/repo' },
		reasoning: 'test',
	};
	return { intent };
}

function taskInputs(upstream: ReadonlyMap<string, unknown | null>): TaskShapeInput {
	const intent: ClassifiedIntent = {
		target:    'code',
		scope:     'S',
		focused:   true,
		focus:     'test',
		scopeRef:  { kind: 'repo', value: '/repo' },
		reasoning: 'test',
	};
	const task: PlannedTask = {
		taskId:   't99',
		template: 'code.structure.dep-tree',
		kind:      'leaf',
		params:    {},
		produces:  ['out'],
		rationale: 'driver-unit fixture',
	};
	const template: AnalyzeTaskTemplate = {
		id:       'code.structure.dep-tree',
		target:   'code',
		family:   'structure',
		kind:     'leaf',
		revision: 'pre-registry',
	};
	return { intent, task, template, upstreamTasks: upstream };
}

test('renderUpstreamSection: classification mode returns empty string', () => {
	const out = _renderUpstreamSectionForTest(classificationInputs());
	assert.equal(out, '');
});

test('renderUpstreamSection: run mode returns empty string', () => {
	const out = _renderUpstreamSectionForTest(runInputs());
	assert.equal(out, '');
});

test('renderUpstreamSection: task mode with empty upstream map returns empty string', () => {
	const out = _renderUpstreamSectionForTest(taskInputs(new Map()));
	assert.equal(out, '');
});

test('renderUpstreamSection: task mode with one populated upstream renders a JSON block', () => {
	const upstream = new Map<string, unknown>([
		['t01', { foo: 1, bar: ['a', 'b'] }],
	]);
	const out = _renderUpstreamSectionForTest(taskInputs(upstream));
	assert.match(out, /^Upstream task outputs:/);
	assert.match(out, /### t01/);
	assert.match(out, /```json/);
	assert.match(out, /"foo":\s*1/);
	assert.match(out, /"bar":\s*\["a","b"\]/);
});

test('renderUpstreamSection: null upstream value renders [unavailable: ...] marker', () => {
	const upstream = new Map<string, unknown | null>([
		['t02', null],
	]);
	const out = _renderUpstreamSectionForTest(taskInputs(upstream));
	assert.match(out, /### t02/);
	assert.match(out, /\[unavailable: upstream task t02 failed/);
	assert.match(out, /surface this in the bundle's `upstream` layer/);
	// Must NOT emit a JSON block for the null value.
	assert.equal(out.includes('```json'), false);
});

test('renderUpstreamSection: undefined upstream value also renders unavailable marker', () => {
	const upstream = new Map<string, unknown>();
	upstream.set('t03', undefined);
	const out = _renderUpstreamSectionForTest(taskInputs(upstream));
	assert.match(out, /\[unavailable: upstream task t03 failed/);
});

test('renderUpstreamSection: mixed populated + null upstream renders both', () => {
	const upstream = new Map<string, unknown | null>([
		['t01', { ok: true }],
		['t02', null],
		['t03', { count: 7 }],
	]);
	const out = _renderUpstreamSectionForTest(taskInputs(upstream));
	assert.match(out, /### t01[\s\S]*```json[\s\S]*"ok"\s*:\s*true/);
	assert.match(out, /### t02[\s\S]*\[unavailable: upstream task t02 failed/);
	assert.match(out, /### t03[\s\S]*```json[\s\S]*"count"\s*:\s*7/);
});

test('renderUpstreamSection: upstream task ids are sorted alphabetically', () => {
	const upstream = new Map<string, unknown>([
		['tbb', { x: 2 }],
		['taa', { x: 1 }],
		['tcc', { x: 3 }],
	]);
	const out = _renderUpstreamSectionForTest(taskInputs(upstream));
	const aaIdx = out.indexOf('### taa');
	const bbIdx = out.indexOf('### tbb');
	const ccIdx = out.indexOf('### tcc');
	assert.ok(aaIdx >= 0 && bbIdx >= 0 && ccIdx >= 0);
	assert.ok(aaIdx < bbIdx);
	assert.ok(bbIdx < ccIdx);
});
