/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judgeQuality, buildQualityPrompt, QUALITY_FINDINGS_SCHEMA } from '../quality.js';
import type { CodeReviewSubject, CodeReviewGrounding, ChangedSymbolSummary } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';

// ---- fixtures ----

const subject = (changedFiles: readonly string[] = ['src/a.ts', 'src/b.ts']): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e', storyId: 's5', changedFiles,
	approvedLld:  { body: { framework: 'x' } } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [] } }     as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: null,
});

/** grounding(symbols) — populate signature/callers/callees so a duplication finding can name a counterpart. */
const grounding = (symbols: readonly Partial<ChangedSymbolSummary>[]): CodeReviewGrounding => ({
	symbols: symbols.map((s, i) => ({
		entityId: `e${i}`, file: 'src/a.ts', kind: 'function', name: `fn${i}`,
		signature: `fn${i}(): void`, callers: [], callees: [], testsReaching: [],
		...s,
	})),
});

/** Default: one symbol whose callees include an existing counterpart (for duplication). */
const groundingWithCounterpart = (): CodeReviewGrounding => grounding([
	{ file: 'src/a.ts', name: 'alpha', signature: 'alpha(): void', callees: ['existing:betaHelper'] },
]);

/** A fake LLMProvider that scripts completeStructured and counts calls; any
 *  OTHER provider method is absent, so the judge touching one would throw. */
function fakeProvider(scripted: unknown): { provider: LLMProvider; calls: () => number } {
	let n = 0;
	const provider = {
		completeStructured: async () => { n++; return scripted; },
	} as unknown as LLMProvider;
	return { provider, calls: () => n };
}

// ---- ac1: the four risk classes each map with location + severity ----

test('judgeQuality: the four risk classes each map to a finding with location + severity (ac1)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:1', message: 'correctness risk' },
		{ severity: 'MED',  location: 'src/a.ts:2', message: 'avoidable complexity' },
		{ severity: 'MED',  location: 'src/b.ts:3', message: 'duplication', counterpartRef: 'existing:betaHelper' },
		{ severity: 'HIGH', location: 'src/b.ts:4', message: 'unhandled error path' },
	] });
	const res = await judgeQuality(subject(), groundingWithCounterpart(), provider);
	assert.equal(res.dimension, 'quality');
	assert.equal(res.findings.length, 4);
	assert.ok(res.findings.every(f => f.severity && f.location.includes(':')));
});

test('QUALITY_FINDINGS_SCHEMA: distinctive field is counterpartRef (not expectationRef); shape 1:1 with sc3 (ac1)', () => {
	const items = (QUALITY_FINDINGS_SCHEMA as { properties: { findings: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.findings.items;
	assert.deepEqual(Object.keys(items.properties).sort(), ['confidence', 'counterpartRef', 'location', 'message', 'severity']);
	assert.ok(!('expectationRef' in items.properties), 'quality emits counterpartRef, NOT expectationRef');
	assert.deepEqual([...items.required].sort(), ['location', 'message', 'severity']);
});

// ---- ac2: a duplication finding maps counterpartRef through ----

test('judgeQuality: a duplication finding maps counterpartRef through naming the existing symbol (ac2)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'MED', location: 'src/a.ts:5', message: 'reimplements betaHelper', counterpartRef: 'existing:betaHelper' },
	] });
	const res = await judgeQuality(subject(), groundingWithCounterpart(), provider);
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.dimension, 'quality');
	assert.equal(res.findings[0]!.counterpartRef, 'existing:betaHelper');
});

test('buildQualityPrompt: charge instructs counterpartRef on duplication and the payload includes the callers/callees edges (ac2)', () => {
	const msgs = buildQualityPrompt(subject(), groundingWithCounterpart(), undefined);
	const sys = msgs.find(m => m.role === 'system')!.content as string;
	const user = msgs.find(m => m.role === 'user')!.content as string;
	assert.match(sys, /counterpartRef/);
	assert.match(user, /callee|callees/);
	assert.match(user, /existing:betaHelper/);   // the neighbour edge is serialized
});

// ---- ac3: matter-of-taste at LOW, never HIGH ----

test('judgeQuality: a matter-of-taste finding maps through at LOW severity (ac3)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'LOW', location: 'src/a.ts:9', message: 'naming preference', confidence: 'observation' },
	] });
	const res = await judgeQuality(subject(), groundingWithCounterpart(), provider);
	assert.equal(res.findings[0]!.severity, 'LOW');
});

test('buildQualityPrompt: charge caps matters of taste at LOW severity, never HIGH (ac3)', () => {
	const sys = buildQualityPrompt(subject(), groundingWithCounterpart(), undefined).find(m => m.role === 'system')!.content as string;
	assert.match(sys, /TASTE|taste/);
	assert.match(sys, /LOW and NEVER HIGH|never block|NEVER HIGH/);
});

// ---- ac4: exactly one call through the injected provider ----

test('judgeQuality: issues exactly ONE completeStructured call, no other provider method (ac4/k3/k4)', async () => {
	const { provider, calls } = fakeProvider({ findings: [] });
	await judgeQuality(subject(), groundingWithCounterpart(), provider);
	assert.equal(calls(), 1);
});

// ---- out-of-scope drop ----

test('judgeQuality: a finding whose location file is outside changedFiles is dropped', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:1',      message: 'in scope' },
		{ severity: 'HIGH', location: 'src/other.ts:9',  message: 'out of scope' },
	] });
	const res = await judgeQuality(subject(['src/a.ts', 'src/b.ts']), groundingWithCounterpart(), provider);
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.location, 'src/a.ts:1');
});

// ---- retry exhaustion propagates ----

test('judgeQuality: invalid model output exhausts the retry cap and PROPAGATES (no fabricated pass)', async () => {
	const { provider } = fakeProvider({ wrong: true });   // no `findings` => schema-invalid every attempt
	await assert.rejects(() => judgeQuality(subject(), groundingWithCounterpart(), provider));
});

// ---- edge cases ----

test('judgeQuality: empty grounding yields a valid empty result (edge)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeQuality(subject(), grounding([]), provider);
	assert.deepEqual(res, { dimension: 'quality', findings: [] });
});

test('judgeQuality: no-risk code => empty findings, no manufactured finding (edge)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeQuality(subject(), groundingWithCounterpart(), provider);
	assert.deepEqual(res.findings, []);
});

// ---- prompt trailing ----

test('buildQualityPrompt: the output-shape reminder is TRAILING (after the changed symbols)', () => {
	const user = buildQualityPrompt(subject(), groundingWithCounterpart(), undefined).find(m => m.role === 'user')!.content as string;
	assert.ok(user.indexOf('## Output') > user.indexOf('changed symbols'), 'output shape comes after the symbols (trailing)');
});
