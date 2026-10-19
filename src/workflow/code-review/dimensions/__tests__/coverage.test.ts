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
		{ severity: 'HIGH', location: 'src/a.ts:1', message: 'promised test missing', expectationRef: 'alpha exercised', confidence: 'breach', findingKind: 'promised-test' },
	] });
	const res = await judgeCoverage(subject(['src/a.ts'], [{ level: 'unit', name: 'alpha exercised' }]), groundingTwoFiles(), provider);
	assert.equal(res.dimension, 'coverage');
	assert.equal(res.findings.length, 1);
	// ISSUE-b47dadc7: a promised-test HIGH names the plan's test exactly as listed.
	assert.equal(res.findings[0]!.severity, 'HIGH');
	assert.equal(res.findings[0]!.expectationRef, 'alpha exercised');
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
		{ severity: 'HIGH', location: 'src/a.ts:2', message: 'alpha has no reaching test', expectationRef: 'alpha', confidence: 'breach', findingKind: 'symbol-coverage', symbolId: 'e0' },
	] });
	const res = await judgeCoverage(subject(), groundingTwoFiles(), provider);
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.expectationRef, 'alpha');
	// ISSUE-b47dadc7: with no test record the edge-free symbol is no-edge-no-tests, so the HIGH stands.
	assert.equal(res.findings[0]!.severity, 'HIGH');
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
		{ severity: 'HIGH', location: 'src/a.ts:1', message: 'no test at all',            expectationRef: 'alpha',           confidence: 'breach', findingKind: 'symbol-coverage', symbolId: 'e0' },
		{ severity: 'MED',  location: 'src/b.ts:1', message: 'present but pass unverified', expectationRef: 'beta reaching test', confidence: 'observation', findingKind: 'symbol-coverage', symbolId: 'e1' },
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
		{ severity: 'HIGH', location: 'src/a.ts:1',      message: 'in scope',     expectationRef: 'alpha', confidence: 'breach', findingKind: 'symbol-coverage', symbolId: 'e0' },
		{ severity: 'HIGH', location: 'src/other.ts:9',  message: 'out of scope', expectationRef: 'gamma', confidence: 'breach', findingKind: 'symbol-coverage', symbolId: 'e0' },
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

test('buildCoveragePrompt: a null test record degrades the pass-state to unverified in the prompt', () => {
	const user = buildCoveragePrompt(subject(['src/a.ts'], [], null), groundingTwoFiles(), undefined).find(m => m.role === 'user')!.content as string;
	assert.match(user, /No test record is available/);
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
	// ISSUE-b47dadc7: findingKind is required and symbolId optional.
	assert.deepEqual(Object.keys(items.properties).sort(), ['confidence', 'expectationRef', 'findingKind', 'location', 'message', 'severity', 'symbolId']);
	assert.deepEqual([...items.required].sort(), ['findingKind', 'location', 'message', 'severity']);
});

test('buildCoveragePrompt: symbols, then promised tests, then the output-shape reminder are TRAILING (in order)', () => {
	const user = buildCoveragePrompt(subject(['src/a.ts'], [{ level: 'unit', name: 'x' }]), groundingTwoFiles(), undefined).find(m => m.role === 'user')!.content as string;
	const iSymbols  = user.indexOf('changed symbols');
	const iPromised = user.indexOf('promised tests');
	const iOutput   = user.indexOf('## Output');
	assert.ok(iSymbols < iPromised, 'symbols come before promised tests');
	assert.ok(iPromised < iOutput, 'output shape comes last (trailing)');
});

// ---- ISSUE-1102dc71 S001/t2: pass-state from the Story's test record ----

type FileRun = { file?: unknown; exitCode?: unknown; timedOut?: unknown; titles?: unknown; durationMs?: number; otherFailures?: string[] };
const run = (file: string, titles: readonly [string, string][], over: Partial<FileRun> = {}): FileRun =>
	({ file, exitCode: 0, timedOut: false, durationMs: 1, otherFailures: [], titles: titles.map(([title, result]) => ({ title, result })), ...over });
const task = (taskId: string, ranAt: string | undefined, files: unknown) => ({ taskId, ...(ranAt !== undefined ? { ranAt } : {}), testsPassed: true, tests: [], files });
const withRecords = (tasks: readonly unknown[], buildTasks?: readonly unknown[]): CodeReviewSubject => ({
	...subject(['src/a.ts']),
	buildRecord: { meta: {}, body: buildTasks === undefined ? {} : { tasks: buildTasks } } as unknown as CodeReviewSubject['buildRecord'],
	testRecord: { meta: {}, body: { tasks } } as unknown as CodeReviewSubject['testRecord'],
});
/** The JSON test-record section of the prompt, parsed. */
function viewOf(s: CodeReviewSubject): { files: { file: string; state: string; reason?: string | undefined; decidedBy: { taskId: string }; titles: { title: string; result: string }[]; notInLatestRun: string[] }[]; buildTasks: { taskId: string; passed: string }[]; notes: string[] } {
	const user = buildCoveragePrompt(s, groundingTwoFiles(), undefined).find(m => m.role === 'user')!.content as string;
	const at = user.indexOf('## Test-record results');
	assert.ok(at >= 0 && at < user.indexOf('## Output'), 'the section is present, before the output reminder');
	const json = user.slice(at).split('```json\n')[1]!.split('\n```')[0]!;
	return JSON.parse(json);
}

test("the coverage prompt shows each test file from its latest run by ranAt, even when that task is stored first; a newer timed-out or title-less run supersedes an older passing title, which is not shown as passing; a title missing from a newer successful run is unverified; a tie or missing ranAt is decided by the failing run; a record with a task missing files, a file missing titles or an unknown result is rendered without throwing and notes the skipped part; with no test record the every-test-unverified rule stays; a newer malformed entry for a file (titles missing) is a barrier: the file is unverified and the older pass is not shown; the BUILD record's per-task passed is shown, and a record without tasks or without passed shows 'unavailable'", () => {
	const T1 = '2026-10-17T01:00:00.000Z';
	const T2 = '2026-10-17T02:00:00.000Z';
	const one = (tasks: readonly unknown[]) => viewOf(withRecords(tasks)).files[0]!;

	// A re-run task stored FIRST with the newer ranAt decides; it now fails.
	let f = one([task('t1', T2, [run('a.test.ts', [['x', 'fail']], { exitCode: 1 })]), task('t2', T1, [run('a.test.ts', [['x', 'pass']])])]);
	assert.equal(f.decidedBy.taskId, 't1');
	assert.equal(f.state, 'failing');
	assert.deepEqual(f.titles, [{ title: 'x', result: 'fail' }]);

	// A newer timed-out run, and a newer title-less run, supersede an older pass.
	f = one([task('t1', T1, [run('a.test.ts', [['x', 'pass']])]), task('t2', T2, [run('a.test.ts', [], { exitCode: null, timedOut: true })])]);
	assert.equal(f.decidedBy.taskId, 't2');
	assert.equal(f.state, 'failing');
	assert.deepEqual(f.titles, []);
	assert.deepEqual(f.notInLatestRun, ['x'], 'the older pass is listed only as not in the latest run');
	assert.match(f.reason ?? '', /timed out/, 'the reason names the timeout');
	f = one([task('t1', T1, [run('a.test.ts', [['x', 'pass']])]), task('t2', T2, [run('a.test.ts', [])])]);
	assert.equal(f.state, 'unverified');

	// A title missing from a newer SUCCESSFUL run is unverified (not in the latest run).
	f = one([task('t1', T1, [run('a.test.ts', [['x', 'pass'], ['y', 'pass']])]), task('t2', T2, [run('a.test.ts', [['x', 'pass']])])]);
	assert.equal(f.state, 'passing');
	assert.deepEqual(f.notInLatestRun, ['y']);

	// A tie, or no valid ranAt on either, is decided by the failing run, in either storage order.
	for (const [a, b] of [[T1, T1], [undefined, undefined], [undefined, 'not a time']] as const) {
		for (const order of [0, 1]) {
			const pass = task('tp', a, [run('a.test.ts', [['x', 'pass']])]);
			const fail = task('tf', b, [run('a.test.ts', [['x', 'fail']], { exitCode: 1 })]);
			f = one(order === 0 ? [pass, fail] : [fail, pass]);
			assert.equal(f.decidedBy.taskId, 'tf', `tie ${String(a)}/${String(b)} order ${order}`);
			assert.equal(f.state, 'failing');
		}
	}

	// A newer malformed entry (titles missing) is a barrier: unverified, and the older pass is not shown.
	f = one([task('t1', T1, [run('a.test.ts', [['x', 'pass']])]), task('t2', T2, [{ file: 'a.test.ts', exitCode: 0, timedOut: false }])]);
	assert.equal(f.decidedBy.taskId, 't2');
	assert.equal(f.state, 'unverified');
	assert.deepEqual(f.titles, []);
	assert.ok(!JSON.stringify(f.titles).includes('pass'));
	// An unknown result is malformed too.
	f = one([task('t1', T1, [run('a.test.ts', [['x', 'pass']])]), task('t2', T2, [run('a.test.ts', [['x', 'maybe']])])]);
	assert.equal(f.state, 'unverified');

	// A task with no files list, and a file entry with no file name, are noted and skipped; nothing throws.
	const v = viewOf(withRecords([task('t1', T1, undefined), task('t2', T1, [{ exitCode: 0 }, run('b.test.ts', [['z', 'pass']])])]));
	assert.deepEqual(v.files.map(x => x.file), ['b.test.ts']);
	assert.equal(v.notes.length, 2);
	assert.ok(v.notes.some(n => n.includes('t1') && n.includes('no files list')));
	assert.ok(v.notes.some(n => n.includes('t2') && n.includes('no file name')));

	// The BUILD record's per-task passed is shown; missing tasks or passed show 'unavailable'.
	assert.deepEqual(viewOf(withRecords([], [{ id: 't1', passed: true }, { id: 't2', passed: false }, { id: 't3' }])).buildTasks,
		[{ taskId: 't1', passed: 'pass' }, { taskId: 't2', passed: 'fail' }, { taskId: 't3', passed: 'unavailable' }]);
	assert.deepEqual(viewOf(withRecords([])).buildTasks, [{ taskId: '(all)', passed: 'unavailable' }]);

	// With no test record the every-test-unverified rule stays.
	const user = buildCoveragePrompt({ ...subject(['src/a.ts']), testRecord: null }, groundingTwoFiles(), undefined).find(m => m.role === 'user')!.content as string;
	assert.match(user, /No test record is available — treat every test's pass-state as UNVERIFIED/);
	assert.ok(!user.includes('```json\n{\n  "files"'));
});

test('buildCoveragePrompt: a testsReaching entry is joined to its test FILE in the test record, never to a title by its caller name (ISSUE-1102dc71)', () => {
	const s = withRecords([task('t1', '2026-10-17T01:00:00.000Z', [run('src/__tests__/a.test.ts', [['the real test title', 'pass']])])]);
	const g = grounding([{ file: 'src/a.ts', name: 'alpha', testsReaching: ['src/__tests__/a.test.ts#mkFixture'] }]);
	const msgs = buildCoveragePrompt(s, g, undefined);
	const sys  = msgs.find(m => m.role === 'system')!.content as string;
	const user = msgs.find(m => m.role === 'user')!.content as string;
	assert.match(sys, /`<test file>#<caller>`/);
	assert.match(sys, /NEVER match the caller name against test titles/);
	assert.match(sys, /Judge a reaching entry by its TEST FILE/);
	assert.doesNotMatch(sys, /does not cover is unverified/, 'the old title-matching rule is gone');
	// The two sides of the join are both in the prompt: the entry names the file the record lists.
	assert.ok(user.includes('"src/__tests__/a.test.ts#mkFixture"'));
	assert.ok(user.includes('"file": "src/__tests__/a.test.ts"'));
});
