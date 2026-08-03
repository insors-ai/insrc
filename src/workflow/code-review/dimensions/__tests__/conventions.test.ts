/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judgeConventions, buildConventionsPrompt, CONVENTIONS_FINDINGS_SCHEMA } from '../conventions.js';
import type { CodeReviewSubject, CodeReviewGrounding } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';

// ---- fixtures ----

const subject = (changedFiles: readonly string[] = ['src/a.ts', 'src/b.ts']): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e', storyId: 's3', changedFiles,
	approvedLld:  { body: { framework: 'x' } } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } }     as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});

/** grounding(n) spans ≥2 files (a.ts / b.ts alternating) for the cross-module-sampling case. */
const grounding = (n = 2): CodeReviewGrounding => ({
	symbols: Array.from({ length: n }, (_, i) => ({
		entityId: `e${i}`, file: i % 2 === 0 ? 'src/a.ts' : 'src/b.ts', kind: 'function', name: `fn${i}`,
		signature: `fn${i}(): void`, callers: [], callees: [], testsReaching: [],
	})),
});

/** A fake LLMProvider that scripts completeStructured and counts calls; any
 *  OTHER provider method is absent, so the judge touching one would throw. */
function fakeProvider(scripted: unknown): { provider: LLMProvider; calls: () => number } {
	let n = 0;
	const provider = {
		completeStructured: async () => { n++; return scripted; },
	} as unknown as LLMProvider;
	return { provider, calls: () => n };
}

// ---- ac1: documented-rule breach mapped with expectationRef + confidence:'breach' ----

test('judgeConventions: documented-rule breach maps with rule id in expectationRef, confidence:breach, dimension:conventions (ac1)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'MED', location: 'src/a.ts:3', message: 'missing .js extension', expectationRef: 'import-js-ext', confidence: 'breach' },
	] });
	const res = await judgeConventions(subject(), grounding(), provider);
	assert.equal(res.dimension, 'conventions');
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.dimension, 'conventions');
	assert.equal(res.findings[0]!.expectationRef, 'import-js-ext');
	assert.equal(res.findings[0]!.confidence, 'breach');
	assert.equal(res.findings[0]!.location, 'src/a.ts:3');
});

test('buildConventionsPrompt: embeds the DOCUMENTED_RULES baseline (rule ids present) (ac1)', () => {
	const user = buildConventionsPrompt(subject(), grounding(), undefined).find(m => m.role === 'user')!.content as string;
	assert.match(user, /import-js-ext/);
	assert.match(user, /no-promise-all-llm/);
	assert.match(user, /daemon-owns-storage/);
	assert.match(user, /structured-grounding/);
});

// ---- ac2: each TS-rule breach reported individually with its location ----

test('judgeConventions: three distinct TS-rule breaches each survive individually with their location (ac2)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'MED', location: 'src/a.ts:1', message: 'missing .js ext',           expectationRef: 'import-js-ext',       confidence: 'breach' },
		{ severity: 'MED', location: 'src/a.ts:2', message: 'value import of a type',     expectationRef: 'import-type',         confidence: 'breach' },
		{ severity: 'LOW', location: 'src/b.ts:9', message: 'console.log used',           expectationRef: 'logger-not-console',  confidence: 'breach' },
	] });
	const res = await judgeConventions(subject(), grounding(), provider);
	assert.equal(res.findings.length, 3);
	assert.deepEqual(res.findings.map(f => f.location), ['src/a.ts:1', 'src/a.ts:2', 'src/b.ts:9']);
	assert.deepEqual(res.findings.map(f => f.expectationRef), ['import-js-ext', 'import-type', 'logger-not-console']);
});

test('CONVENTIONS_FINDINGS_SCHEMA: per-finding requires severity/location/message; expectationRef + confidence optional (ac2)', () => {
	const items = (CONVENTIONS_FINDINGS_SCHEMA as { properties: { findings: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.findings.items;
	assert.deepEqual(Object.keys(items.properties).sort(), ['confidence', 'expectationRef', 'location', 'message', 'severity']);
	assert.deepEqual([...items.required].sort(), ['location', 'message', 'severity']);
});

// ---- ac3: thin-sample idiom drift => confidence:'observation', not breach ----

test('judgeConventions: thin-sample idiom drift is tagged confidence:observation, not breach (ac3)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'LOW', location: 'src/a.ts:5', message: 'naming departs from module idiom', expectationRef: 'module-naming-idiom', confidence: 'observation' },
	] });
	const res = await judgeConventions(subject(), grounding(), provider);
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.confidence, 'observation');
});

test('buildConventionsPrompt: system charge carries the breach-vs-observation low-confidence discipline (ac3)', () => {
	const sys = buildConventionsPrompt(subject(), grounding(4), undefined).find(m => m.role === 'system')!.content as string;
	assert.match(sys, /observation/);
	assert.match(sys, /too few examples|too few|sample the idiom across the TOUCHED MODULES/i);
});

// ---- ac4: Promise.all-over-LLM breach reported against the serial-calls rule ----

test('judgeConventions: a Promise.all-over-LLM breach maps against the no-promise-all-llm rule with confidence:breach (ac4)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:12', message: 'Promise.all over provider.embed', expectationRef: 'no-promise-all-llm', confidence: 'breach' },
	] });
	const res = await judgeConventions(subject(), grounding(), provider);
	assert.equal(res.findings[0]!.expectationRef, 'no-promise-all-llm');
	assert.equal(res.findings[0]!.confidence, 'breach');
});

// ---- ac5: daemon-owns-storage / structured-grounding breaches + out-of-scope drop ----

test('judgeConventions: direct-storage (k5) and raw-dump (k6) breaches map through; out-of-changedFiles dropped (ac5)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:7',      message: 'opens LMDB directly',      expectationRef: 'daemon-owns-storage', confidence: 'breach' },
		{ severity: 'HIGH', location: 'src/b.ts:4',      message: 'reads raw file contents',  expectationRef: 'structured-grounding', confidence: 'breach' },
		{ severity: 'HIGH', location: 'src/other.ts:99', message: 'out of scope',             expectationRef: 'daemon-owns-storage', confidence: 'breach' },
	] });
	const res = await judgeConventions(subject(['src/a.ts', 'src/b.ts']), grounding(), provider);
	assert.equal(res.findings.length, 2);
	assert.deepEqual(res.findings.map(f => f.expectationRef), ['daemon-owns-storage', 'structured-grounding']);
	assert.ok(!res.findings.some(f => f.location.startsWith('src/other.ts')));
});

// ---- exactly one call ----

test('judgeConventions: issues exactly ONE completeStructured call, no other provider method (k3/k4)', async () => {
	const { provider, calls } = fakeProvider({ findings: [] });
	await judgeConventions(subject(), grounding(), provider);
	assert.equal(calls(), 1);
});

// ---- retry exhaustion propagates ----

test('judgeConventions: invalid model output exhausts the retry cap and PROPAGATES (no fabricated pass)', async () => {
	const { provider } = fakeProvider({ wrong: true });   // no `findings` => schema-invalid every attempt
	await assert.rejects(() => judgeConventions(subject(), grounding(), provider));
});

// ---- edge cases: empty grounding + clean code ----

test('judgeConventions: empty grounding still yields a valid empty result (edge)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeConventions(subject(), grounding(0), provider);
	assert.deepEqual(res, { dimension: 'conventions', findings: [] });
});

test('judgeConventions: clean code => empty findings, no manufactured finding (edge)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeConventions(subject(), grounding(), provider);
	assert.deepEqual(res.findings, []);
});

// ---- prompt trailing ----

test('buildConventionsPrompt: the output-shape reminder is TRAILING (after the documented rules, after the symbols)', () => {
	const user = buildConventionsPrompt(subject(), grounding(), undefined).find(m => m.role === 'user')!.content as string;
	assert.ok(user.indexOf('Documented rules') > user.indexOf('changed symbols'), 'documented rules come after the symbols');
	assert.ok(user.indexOf('## Output') > user.indexOf('Documented rules'), 'output shape comes last (trailing)');
});
