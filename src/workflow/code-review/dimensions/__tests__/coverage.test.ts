/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { judgeCoverage, buildCoveragePrompt, COVERAGE_FINDINGS_SCHEMA } from '../coverage.js';
import type { CodeReviewSubject, CodeReviewGrounding, ChangedSymbolSummary } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';

// ---- fixtures ----

type PromisedTest = { level: string; name: string };

const subject = (
	changedFiles: readonly string[] = ['src/a.ts', 'src/b.ts'],
	promisedTests: readonly PromisedTest[] = [],
	buildRecord: unknown = { changedFiles },
): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e', storyId: 's4', changedFiles,
	approvedLld:  { body: { framework: 'x' } } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: { body: { tasks: [{ tests: promisedTests }] } } as unknown as CodeReviewSubject['approvedPlan'],
	buildRecord: buildRecord as CodeReviewSubject['buildRecord'],
});

/** grounding(symbols) — a factory letting testsReaching be empty vs populated per symbol. */
const grounding = (symbols: readonly Partial<ChangedSymbolSummary>[]): CodeReviewGrounding => ({
	symbols: symbols.map((s, i) => ({
		entityId: `e${i}`, file: 'src/a.ts', kind: 'function', name: `fn${i}`,
		signature: `fn${i}(): void`, callers: [], callees: [], testsReaching: [],
		...s,
	})),
});

/** Two-file default grounding: one uncovered (src/a.ts), one covered (src/b.ts). */
const groundingTwoFiles = (): CodeReviewGrounding => grounding([
	{ file: 'src/a.ts', name: 'alpha', testsReaching: [] },
	{ file: 'src/b.ts', name: 'beta',  testsReaching: ['test:beta-spec'] },
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

// ---- ac1: promised-but-missing test => HIGH breach naming the test ----

test('judgeCoverage: a promised test absent from the grounding is a HIGH missing-promised-test finding (ac1)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:1', message: 'promised test missing', expectationRef: 'unit: alpha exercised', confidence: 'breach' },
	] });
	const res = await judgeCoverage(subject(['src/a.ts'], [{ level: 'unit', name: 'alpha exercised' }]), groundingTwoFiles(), provider);
	assert.equal(res.dimension, 'coverage');
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.expectationRef, 'unit: alpha exercised');
	assert.equal(res.findings[0]!.confidence, 'breach');
});

test('buildCoveragePrompt: serializes the approvedPlan promised tests into the trailing payload (ac1)', () => {
	const msgs = buildCoveragePrompt(subject(['src/a.ts'], [{ level: 'unit', name: 'alpha exercised' }]), groundingTwoFiles(), undefined);
	const user = msgs.find(m => m.role === 'user')!.content as string;
	assert.match(user, /promised tests/i);
	assert.match(user, /alpha exercised/);
});

// ---- ac2: zero-testsReaching => not-exercised; populated => no gap ----

test('judgeCoverage: a changed symbol with testsReaching.length===0 is a HIGH not-exercised finding (ac2)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:2', message: 'alpha has no reaching test', expectationRef: 'alpha', confidence: 'breach' },
	] });
	const res = await judgeCoverage(subject(), groundingTwoFiles(), provider);
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.expectationRef, 'alpha');
});

test('judgeCoverage: a changed symbol WITH testsReaching yields no not-exercised finding (ac2)', async () => {
	// The covered symbol (beta, src/b.ts) produces no finding; the model returns [].
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeCoverage(subject(), grounding([{ file: 'src/b.ts', name: 'beta', testsReaching: ['test:beta-spec'] }]), provider);
	assert.deepEqual(res.findings, []);
});

// ---- ac3: present-failing (observation) distinct from missing (breach) ----

test('judgeCoverage: a present-but-failing/unverified test (observation) is distinct from a wholly-missing test (breach) (ac3)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:1', message: 'no test at all',            expectationRef: 'alpha',           confidence: 'breach' },
		{ severity: 'MED',  location: 'src/b.ts:1', message: 'present but pass unverified', expectationRef: 'beta reaching test', confidence: 'observation' },
	] });
	const res = await judgeCoverage(subject(['src/a.ts', 'src/b.ts']), groundingTwoFiles(), provider);
	assert.equal(res.findings.length, 2);
	const byConf = Object.fromEntries(res.findings.map(f => [f.confidence, f.message]));
	assert.ok(byConf['breach']!.includes('no test'));
	assert.ok(byConf['observation']!.includes('unverified'));
});

test('buildCoveragePrompt: charge distinguishes present-failing from no-test and forbids an unsupported pass-state (ac3)', () => {
	const sys = buildCoveragePrompt(subject(), groundingTwoFiles(), undefined).find(m => m.role === 'system')!.content as string;
	assert.match(sys, /present but failing\/unverified|DISTINGUISH/);
	assert.match(sys, /[Nn]ever assert a pass-state/);
});

// ---- ac4: out-of-scope drop + pre-existing-gap exclusion in the charge ----

test('judgeCoverage: a finding whose location file is outside changedFiles is dropped (ac4)', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:1',      message: 'in scope',     expectationRef: 'alpha', confidence: 'breach' },
		{ severity: 'HIGH', location: 'src/other.ts:9',  message: 'out of scope', expectationRef: 'gamma', confidence: 'breach' },
	] });
	const res = await judgeCoverage(subject(['src/a.ts', 'src/b.ts']), groundingTwoFiles(), provider);
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.location, 'src/a.ts:1');
});

test('buildCoveragePrompt: charge instructs excluding pre-existing gaps in touched-but-unchanged neighbours (ac4)', () => {
	const sys = buildCoveragePrompt(subject(), groundingTwoFiles(), undefined).find(m => m.role === 'system')!.content as string;
	assert.match(sys, /pre-existing gaps|touched-but-unchanged|THIS Story/);
});

// ---- exactly one call ----

test('judgeCoverage: issues exactly ONE completeStructured call, no other provider method (k3/k4)', async () => {
	const { provider, calls } = fakeProvider({ findings: [] });
	await judgeCoverage(subject(), groundingTwoFiles(), provider);
	assert.equal(calls(), 1);
});

// ---- retry exhaustion propagates ----

test('judgeCoverage: invalid model output exhausts the retry cap and PROPAGATES (no fabricated pass)', async () => {
	const { provider } = fakeProvider({ wrong: true });   // no `findings` => schema-invalid every attempt
	await assert.rejects(() => judgeCoverage(subject(), groundingTwoFiles(), provider));
});

// ---- edge cases: empty grounding + no promised tests; all-covered ----

test('judgeCoverage: empty grounding + no promised tests yields a valid empty result (edge)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeCoverage(subject(['src/a.ts'], []), grounding([]), provider);
	assert.deepEqual(res, { dimension: 'coverage', findings: [] });
});

test('judgeCoverage: all-covered => empty findings, no manufactured finding (edge)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeCoverage(subject(), grounding([{ file: 'src/a.ts', testsReaching: ['test:x'] }]), provider);
	assert.deepEqual(res.findings, []);
});

// ---- null buildRecord tolerance ----

test('judgeCoverage: runs and returns a valid result with subject.buildRecord===null', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeCoverage(subject(['src/a.ts'], [], null), groundingTwoFiles(), provider);
	assert.deepEqual(res, { dimension: 'coverage', findings: [] });
});

test('buildCoveragePrompt: a null buildRecord degrades the pass-state to unverified in the prompt', () => {
	const user = buildCoveragePrompt(subject(['src/a.ts'], [], null), groundingTwoFiles(), undefined).find(m => m.role === 'user')!.content as string;
	assert.match(user, /No build record is available/);
	assert.match(user, /UNVERIFIED/);
});

// ---- S001: plan-null softening (mode B/C) ----

/** A mode-B/C subject with NO approved plan. */
const subjectNoPlan = (changedFiles: readonly string[] = ['src/a.ts']): CodeReviewSubject => ({
	...subject(changedFiles), approvedPlan: null,
});

test('buildCoveragePrompt: plan present keeps the promised-tests section + the missing-promised-test HIGH rule', () => {
	const msgs = buildCoveragePrompt(subject(['src/a.ts'], [{ level: 'unit', name: 'alpha exercised' }]), groundingTwoFiles(), undefined);
	const sys  = msgs.find(m => m.role === 'system')!.content as string;
	const user = msgs.find(m => m.role === 'user')!.content as string;
	assert.match(sys, /missing-promised-test finding/);
	assert.match(user, /each should be present and passing/);
});

test('buildCoveragePrompt: plan null emits an empty promised-tests list + softened testsReaching-only framing (no throw)', () => {
	// No throw proves promisedTestsOf tolerates the null plan.
	const msgs = buildCoveragePrompt(subjectNoPlan(), groundingTwoFiles(), undefined);
	const sys  = msgs.find(m => m.role === 'system')!.content as string;
	const user = msgs.find(m => m.role === 'user')!.content as string;
	assert.match(sys, /No plan was approved/);
	assert.match(sys, /do NOT report any missing-promised-test finding/);
	assert.ok(!/missing-promised-test finding naming/.test(sys), 'the promised-test HIGH rule is omitted when no plan');
	assert.match(user, /none — no plan was approved/);
	assert.match(user, /\[\]/, 'the promised-tests payload is an empty list');
});

// ---- t1: schema shape + prompt trailing ----

test('COVERAGE_FINDINGS_SCHEMA: per-finding requires severity/location/message; expectationRef + confidence optional', () => {
	const items = (COVERAGE_FINDINGS_SCHEMA as { properties: { findings: { items: { properties: Record<string, unknown>; required: string[] } } } }).properties.findings.items;
	assert.deepEqual(Object.keys(items.properties).sort(), ['confidence', 'expectationRef', 'location', 'message', 'severity']);
	assert.deepEqual([...items.required].sort(), ['location', 'message', 'severity']);
});

test('buildCoveragePrompt: symbols, then promised tests, then the output-shape reminder are TRAILING (in order)', () => {
	const user = buildCoveragePrompt(subject(['src/a.ts'], [{ level: 'unit', name: 'x' }]), groundingTwoFiles(), undefined).find(m => m.role === 'user')!.content as string;
	const iSymbols  = user.indexOf('changed symbols');
	const iPromised = user.indexOf('promised tests');
	const iOutput   = user.indexOf('## Output');
	assert.ok(iSymbols < iPromised, 'symbols come before promised tests');
	assert.ok(iPromised < iOutput, 'output shape comes last (trailing)');
});
