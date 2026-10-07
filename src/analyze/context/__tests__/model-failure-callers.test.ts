/**
 * The analyzer decides "the model call failed" in eight places. All of
 * them use isModelCallFailure; none holds its own list of failure
 * texts. This file covers the six outside the planning and
 * answer-writing calls (those two are in model-failure.test.ts), and
 * guards against a ninth copy.
 *
 * Pure over their inputs -- no LMDB, no LLM.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ModelCallFailedError } from '../../../agent/providers/model-call-error.js';
import {
	ClassifierLlmUnavailableError,
	ClassifierSchemaUnrecoverable,
	_classifyErrorForTest as classifierClassify,
} from '../../classifier/driver.js';
import {
	ScopePickerLlmUnavailableError,
	ScopePickerSchemaUnrecoverable,
	_classifyErrorForTest as scopePickerClassify,
} from '../../classifier/scope-picker.js';
import {
	PlanBuilderLlmUnavailableError,
	PlanBuilderSchemaUnrecoverable,
	_classifyErrorForTest as plannerClassify,
} from '../../planner/driver.js';
import { _classifyErrorForTest as aggregatorClassify } from '../../runtimes/shared/aggregator.js';
import { _classifyErrorCodeForTest as summariserClassify } from '../../summariser/driver.js';
import {
	ShaperLlmUnavailableError,
	_classifyOllamaErrorForTest as toolLoopClassify,
} from '../driver.js';

const ANALYZE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A failed CLI call, a failed sampling request, and a failed local call. */
const CALL_FAILURES: readonly Error[] = [
	new Error('claude exited with 1. stderr=overloaded stdout='),
	new Error('codex emitted error event: {"type":"error"}'),
	new ModelCallFailedError('client declined the sampling request'),
	new Error('Ollama is not running at http://localhost:11434'),
];

/** The model answered, in a shape that cannot be used. */
const SHAPE_FAILURES: readonly Error[] = [
	new Error('claude envelope had is_error=false but no structured_output field'),
	new Error('codex agent_message.text was not parseable JSON: Unexpected token. text=hi'),
	new Error('structured-output: validation failed after 3 attempts: /scope must be string'),
];

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		if (name === '__tests__' || name === 'node_modules') continue;
		const abs = join(dir, name);
		if (statSync(abs).isDirectory()) out.push(...sourceFiles(abs));
		else if (name.endsWith('.ts')) out.push(abs);
	}
	return out;
}

test('source search: the failure-text list exists only in model-failure.ts', () => {
	const files = sourceFiles(ANALYZE_ROOT);
	assert.ok(files.length > 100, `walked ${files.length} files under src/analyze`);
	// 'ECONNREFUSED' is in every copy of the list and nowhere else in
	// the analyzer's source.
	const holders = files
		.filter(f => readFileSync(f, 'utf8').includes('ECONNREFUSED'))
		.map(f => relative(ANALYZE_ROOT, f));
	assert.deepEqual(holders, ['context/model-failure.ts']);
});

test('each of the six callers classifies a CLI call failure as its model-unavailable error and a shape failure as its schema error', () => {
	for (const err of CALL_FAILURES) {
		const label = `${err.name}: ${err.message}`;
		assert.ok(plannerClassify(err) instanceof PlanBuilderLlmUnavailableError, `planner: ${label}`);
		assert.match(aggregatorClassify(err).message, /^aggregator-llm-unavailable: /, `aggregator: ${label}`);
		assert.ok(classifierClassify(err) instanceof ClassifierLlmUnavailableError, `classifier: ${label}`);
		assert.ok(scopePickerClassify(err) instanceof ScopePickerLlmUnavailableError, `scope picker: ${label}`);
		assert.equal(summariserClassify(err), 'llm-unavailable', `summariser: ${label}`);
		assert.ok(toolLoopClassify(err) instanceof ShaperLlmUnavailableError, `tool loop: ${label}`);
	}
	for (const err of SHAPE_FAILURES) {
		const label = err.message;
		assert.ok(plannerClassify(err) instanceof PlanBuilderSchemaUnrecoverable, `planner: ${label}`);
		assert.match(aggregatorClassify(err).message, /^aggregator-schema-unrecoverable: /, `aggregator: ${label}`);
		assert.ok(classifierClassify(err) instanceof ClassifierSchemaUnrecoverable, `classifier: ${label}`);
		assert.ok(scopePickerClassify(err) instanceof ScopePickerSchemaUnrecoverable, `scope picker: ${label}`);
		assert.notEqual(summariserClassify(err), 'llm-unavailable', `summariser: ${label}`);
		// The tool loop has no schema class of its own: it hands back
		// the error it was given for its caller to wrap.
		assert.equal(toolLoopClassify(err), err, `tool loop: ${label}`);
	}
});

test('a typed sampling failure reaches each caller\'s error as the client\'s own words', () => {
	const err = new ModelCallFailedError('client declined');
	assert.match(plannerClassify(err).message, /client declined$/);
	assert.ok(!plannerClassify(err).message.includes('Model call failed:'), 'no doubled prefix');
	assert.equal(aggregatorClassify(err).message, 'aggregator-llm-unavailable: client declined');
	assert.match(classifierClassify(err).message, /client declined$/);
	assert.match(scopePickerClassify(err).message, /client declined$/);
	assert.match(toolLoopClassify(err).message, /client declined$/);
});
