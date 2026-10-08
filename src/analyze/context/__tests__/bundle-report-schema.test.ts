/**
 * The answer report in the bundle's schema, and the schema a model is given
 * (LLD-b9d5c5c40df5a574-s1, task t12).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../shared/types.js';
import { ANALYZE_CONTEXT_BUNDLE_SCHEMA, modelFacingBundleSchema, SCHEMA_VERSION, validateBundleWithErrors } from '../schema.js';
import { _stripMetaFromSchemaForTest, finalizeSynthesize, SynthesizerSchemaUnrecoverable } from '../synthesizer.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const LAYERS = { system: 's', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };
const META = { mode: 'run', shaper: 'code', toolCalls: 2, modelId: 'm', emptyLayers: [], schemaVersion: SCHEMA_VERSION };
const REPORT = {
	completeness: {
		complete: false,
		incomplete: [{ sourceId: 'search.text [e2]', sourceKind: 'lookup', reason: 'limit of 30 hits reached' }],
		failed:     [{ sourceId: 't03', sourceKind: 'plan-task', reason: 'runtime-threw' }],
		basisNotes: ['a note'],
	},
};

test('the stored bundle schema accepts a report and the schema version is 2', () => {
	assert.equal(SCHEMA_VERSION, 2);

	assert.deepEqual(validateBundleWithErrors({ ...LAYERS, meta: META, report: REPORT }), { ok: true, errors: [] });
	// The report is optional: a classification or task bundle has none.
	assert.equal(validateBundleWithErrors({ ...LAYERS, meta: META }).ok, true);
	// The fields Stories s2 and s3 will type are already allowed.
	assert.equal(validateBundleWithErrors({ ...LAYERS, meta: META, report: { ...REPORT, answerFailure: 'model-failed', measure: { n: 1 }, handling: 'x' } }).ok, true);

	// It is still a checked shape, not a free field.
	assert.equal(validateBundleWithErrors({ ...LAYERS, meta: META, report: {} }).ok, false, 'completeness is required');
	assert.equal(validateBundleWithErrors({ ...LAYERS, meta: META, report: { ...REPORT, verdict: 'fine' } }).ok, false, 'unknown fields are rejected');
	assert.equal(validateBundleWithErrors({
		...LAYERS, meta: META,
		report: { completeness: { complete: true, incomplete: [{ sourceId: 'x', sourceKind: 'guess', reason: '' }], failed: [] } },
	}).ok, false, 'a source is a lookup or a plan task');

	// A bundle stamped at the old version is not a valid bundle now.
	const old = validateBundleWithErrors({ ...LAYERS, meta: { ...META, schemaVersion: 1 } });
	assert.equal(old.ok, false);
	assert.match(old.errors.join(' '), /schemaVersion/);
});

test('the model-facing schema has neither meta nor report at both sites, on the first call and on a later one, and rejects an answer that carries a report', () => {
	const stored = ANALYZE_CONTEXT_BUNDLE_SCHEMA as unknown as { properties: Record<string, unknown> };
	assert.ok('report' in stored.properties && 'meta' in stored.properties, 'the stored schema has both');

	// --- site 1: the answer-writing call, and the step tool's check of an agent's bundle ---
	const first = _stripMetaFromSchemaForTest(ANALYZE_CONTEXT_BUNDLE_SCHEMA as unknown as Record<string, unknown>);
	const later = _stripMetaFromSchemaForTest(ANALYZE_CONTEXT_BUNDLE_SCHEMA as unknown as Record<string, unknown>);
	assert.equal(first, later, 'one kept schema: the provider compiles it once');
	for (const schema of [first, later]) {
		const props = (schema as { properties: Record<string, unknown> }).properties;
		assert.deepEqual(Object.keys(props).sort(), ['artefacts', 'focus', 'structure', 'summary', 'surface', 'system', 'upstream']);
		assert.equal('$id' in schema, false, "not the stored schema's identity");
		assert.equal('definitions' in schema, false);
	}
	assert.equal(validateAgainstSchema(first as StructuredSchema, LAYERS).ok, true);
	const withReport = validateAgainstSchema(first as StructuredSchema, { ...LAYERS, report: REPORT });
	assert.equal(withReport.ok, false, "a model's answer that states its own completeness fails validation");
	assert.equal(validateAgainstSchema(first as StructuredSchema, { ...LAYERS, meta: META }).ok, false);

	// --- site 2: the tool loop's final answer. It was given the stored schema whole; it now has no report. ---
	const loopFirst = modelFacingBundleSchema({ withMeta: true });
	const loopLater = modelFacingBundleSchema({ withMeta: true });
	assert.equal(loopFirst, loopLater);
	const loopProps = (loopFirst as { properties: Record<string, unknown> }).properties;
	assert.equal('report' in loopProps, false);
	assert.equal('meta' in loopProps, true, 'this call may still fill meta, as before; the caller stamps over it');
	assert.equal(validateAgainstSchema(loopFirst as StructuredSchema, { ...LAYERS, meta: META }).ok, true);
	assert.equal(validateAgainstSchema(loopFirst as StructuredSchema, { ...LAYERS, meta: META, report: REPORT }).ok, false);

	// Building the model-facing forms left the stored schema as it was.
	assert.ok('report' in stored.properties && 'meta' in stored.properties);

	// The step tool checks an agent's bundle with the same layers-only schema.
	assert.deepEqual(finalizeSynthesize(LAYERS), LAYERS);
	assert.throws(() => finalizeSynthesize({ ...LAYERS, report: REPORT }), SynthesizerSchemaUnrecoverable);
});

test('no source file under src/mcp/analyze-step writes a literal schema version', () => {
	const files: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			if (name === '__tests__') continue;
			const full = join(dir, name);
			if (statSync(full).isDirectory()) walk(full);
			else if (name.endsWith('.ts')) files.push(full);
		}
	};
	walk(join(SRC, 'mcp', 'analyze-step'));
	assert.ok(files.length >= 6, 'the step tool\'s source files were found');

	const literal = /schemaVersion\s*:\s*\d/;
	const offenders = files.filter(f => literal.test(readFileSync(f, 'utf8'))).map(f => f.slice(SRC.length + 1));
	assert.deepEqual(offenders, []);
	// The check sees a literal when there is one.
	assert.ok(literal.test('schemaVersion: 1,'));
	assert.equal(literal.test('schemaVersion: SCHEMA_VERSION,'), false);
	// And the two phases that stamp a version refer to the constant.
	for (const phase of ['start.ts', 'bundle.ts']) {
		assert.match(readFileSync(join(SRC, 'mcp', 'analyze-step', 'phases', phase), 'utf8'), /schemaVersion:\s*SCHEMA_VERSION/, phase);
	}
});
