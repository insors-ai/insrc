/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b47dadc7 S001/t7 — coverage evidence classes and finding normalisation.
 * prepareCoverageGrounding keeps the eligible symbols and gives each one class
 * from its testsReaching edges and the Story's test record; normalizeCoverageFindings
 * keeps a HIGH only for a promised test or a 'no-edge-no-tests' symbol and lowers
 * every other HIGH to LOW with the reason; a diff review lists no symbols.
 *
 * Run: npx tsx --test src/workflow/code-review/dimensions/__tests__/coverage-evidence.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCoveragePrompt, judgeCoverage, normalizeCoverageFindings, prepareCoverageGrounding } from '../coverage.js';
import { runCodeReview, type JudgeSlot } from '../../runner.js';
import type { ChangedSymbolSummary, CodeReviewGrounding, CodeReviewSubject, DimensionFinding, DimensionResult } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';
import { enveloped, unenveloped } from '../../../review-pipeline/__tests__/enveloped.js';

const PROMISED = "src/a.test.ts: 'alpha works'";

const run = (file: string, result: 'pass' | 'fail') => ({ file, exitCode: result === 'pass' ? 0 : 1, timedOut: false, durationMs: 1, otherFailures: [], titles: [{ title: 't', result }] });

function subject(opts: { files?: readonly ReturnType<typeof run>[] | 'none' | 'malformed' | undefined; plan?: boolean | undefined } = {}): CodeReviewSubject {
	const files = opts.files ?? 'none';
	const testRecord = files === 'none' ? null
		: files === 'malformed' ? { meta: {}, body: { tasks: [{ taskId: 't1', ranAt: '2026-10-18T00:00:00.000Z', tests: [], files: [{ file: 'src/a.test.ts', titles: 'garbage' }] }] } }
		: { meta: {}, body: { tasks: [{ taskId: 't1', ranAt: '2026-10-18T00:00:00.000Z', testsPassed: true, tests: [], files }] } };
	return {
		repoPath: '/repo', epicHash: 'b47dadc7cf0cccb1', storyId: 'S001', changedFiles: ['src/a.ts', 'src/b.ts', 'docs/x.md'],
		approvedLld: { meta: { epicSlug: 'x', createdAt: '2026-10-18T00:00:00.000Z', epicCreatedAt: '2026-10-18T00:00:00.000Z' }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: opts.plan === false ? null : { body: { tasks: [{ tests: [{ level: 'unit', name: PROMISED }] }] } } as unknown as CodeReviewSubject['approvedPlan'],
		buildRecord: null,
		testRecord: testRecord as unknown as CodeReviewSubject['testRecord'],
	};
}

const sym = (entityId: string, over: Partial<ChangedSymbolSummary> = {}): ChangedSymbolSummary => ({
	entityId, file: 'src/a.ts', kind: 'function', name: entityId, signature: `${entityId}()`,
	callers: [], callees: [], testsReaching: [], coverageEligible: true, ...over,
});

const GROUNDING: CodeReviewGrounding = { symbols: [
	sym('reached', { testsReaching: ['src/a.test.ts#helper'] }),
	sym('reachedFailing', { testsReaching: ['src/b.test.ts#helper'] }),
	sym('edgeFree'),
	sym('section', { file: 'docs/x.md', kind: 'section', coverageEligible: false }),
	sym('legacy', { file: 'src/b.ts', kind: 'method', coverageEligible: undefined }),
	sym('legacyType', { file: 'src/b.ts', kind: 'type', coverageEligible: undefined }),
] };

const classes = (g: CodeReviewGrounding): Record<string, string | undefined> => Object.fromEntries(g.symbols.map(s => [s.entityId, s.coverageEvidence]));

test('evidence classes follow testsReaching and the test record', () => {
	const prepared = prepareCoverageGrounding(subject({ files: [run('src/a.test.ts', 'pass'), run('src/b.test.ts', 'fail')] }), GROUNDING, 'full');
	assert.deepEqual(classes(prepared), {
		reached: 'reached-passing',
		reachedFailing: 'reached-not-passing',
		edgeFree: 'no-edge-story-tests-pass',
		legacy: 'no-edge-story-tests-pass',   // a summary without the flag is classified by kind and file
	}, 'the section and the type are not eligible; each eligible symbol has exactly one class');
});

const finding = (over: Partial<DimensionFinding>): DimensionFinding => ({ dimension: 'coverage', severity: 'HIGH', location: 'src/a.ts:1', message: 'm', confidence: 'breach', ...over });
const sev = (r: DimensionResult): string[] => r.findings.map(f => `${f.severity}/${f.confidence}`);

test('with no test record, a malformed record, or no passing file, an edge-free symbol is no-edge-no-tests and its HIGH is kept', () => {
	for (const files of ['none', 'malformed', [run('src/b.test.ts', 'fail')]] as const) {
		const s = subject({ files });
		const prepared = prepareCoverageGrounding(s, GROUNDING, 'full');
		assert.equal(classes(prepared)['edgeFree'], 'no-edge-no-tests', JSON.stringify(files));
		const out = normalizeCoverageFindings({ dimension: 'coverage', findings: [finding({ findingKind: 'symbol-coverage', symbolId: 'edgeFree' })] }, prepared, s);
		assert.deepEqual(sev(out), ['HIGH/breach']);
		assert.equal(out.lowered, undefined);
	}
});

test('a HIGH with no findingKind, an unknown or ambiguous symbolId, or on a diff review is lowered; a promised-test HIGH and a no-edge-no-tests symbol HIGH are kept', async () => {
	const s = subject();
	const prepared = prepareCoverageGrounding(s, { symbols: [...GROUNDING.symbols, sym('edgeFree', { file: 'src/b.ts' })] }, 'full');
	const out = normalizeCoverageFindings({ dimension: 'coverage', findings: [
		finding({}),                                                                  // no findingKind
		finding({ findingKind: 'symbol-coverage', symbolId: 'nope' }),               // unknown
		finding({ findingKind: 'symbol-coverage', symbolId: 'edgeFree' }),           // ambiguous: two symbols
		finding({ findingKind: 'symbol-coverage', symbolId: 'reached' }),            // class reached-not-passing (no record)
		finding({ findingKind: 'symbol-coverage' }),                                  // no symbolId
		finding({ findingKind: 'other' }),
		finding({ findingKind: 'promised-test', expectationRef: ` ${PROMISED} ` }),  // kept (trimmed)
		finding({ findingKind: 'symbol-coverage', symbolId: 'legacy' }),             // kept: no-edge-no-tests
		finding({ severity: 'MED', confidence: 'observation', findingKind: 'other' }), // non-HIGH unchanged
	] }, prepared, s);
	assert.deepEqual(sev(out), ['LOW/observation', 'LOW/observation', 'LOW/observation', 'LOW/observation', 'LOW/observation', 'LOW/observation', 'HIGH/breach', 'HIGH/breach', 'MED/observation']);
	assert.deepEqual(out.lowered?.map(l => l.reason), [
		'the finding has no findingKind',
		'symbolId nope is not a listed symbol',
		'symbolId edgeFree matches 2 listed symbols',
		"the symbol's evidence is reached-not-passing, not no-edge-no-tests",
		'the finding names no symbolId',
		'only a promised test or a symbol with no edge and no passing test may be HIGH',
	]);

	// On a diff review there are no prepared symbols, so a symbol finding is lowered.
	const diff = prepareCoverageGrounding(s, GROUNDING, 'degraded');
	const d = normalizeCoverageFindings({ dimension: 'coverage', findings: [finding({ findingKind: 'symbol-coverage', symbolId: 'edgeFree' })] }, diff, s);
	assert.deepEqual(sev(d), ['LOW/observation']);
	assert.match(d.lowered![0]!.reason, /diff review cannot grade symbol coverage/);

	// Through the judge and the runner: a review whose only HIGH was lowered does not fold to block.
	const provider = { completeStructured: async (_m: unknown, schema: unknown) => enveloped(schema, { findings: [{ severity: 'HIGH', location: 'src/a.ts:1', message: 'graph gap', confidence: 'breach', findingKind: 'symbol-coverage', symbolId: 'reached' }] }) } as unknown as LLMProvider;
	const judges: JudgeSlot[] = [
		{ dimension: 'adherence', judge: async () => ({ dimension: 'adherence', findings: [] }) },
		{ dimension: 'conventions', judge: async () => ({ dimension: 'conventions', findings: [] }) },
		{ dimension: 'coverage', judge: judgeCoverage },
		{ dimension: 'quality', judge: async () => ({ dimension: 'quality', findings: [] }) },
	];
	const review = await runCodeReview(s, provider, { runId: 'r', modelLabel: 'm' }, { judges, assembleGrounding: async () => GROUNDING, write: () => {} });
	assert.ok(review.ok, review.ok ? '' : review.error);
	if (!review.ok) return;
	assert.deepEqual(review.artifact.body.counts, { high: 0, med: 0, low: 1 });
	assert.notEqual(review.artifact.body.verdict, 'block');
});

test('a promised-test HIGH is kept only when its expectationRef is a test the approved plan promised; with no plan it is lowered', () => {
	const withPlan = subject();
	const keep = normalizeCoverageFindings({ dimension: 'coverage', findings: [
		finding({ findingKind: 'promised-test', expectationRef: PROMISED }),
		finding({ findingKind: 'promised-test', expectationRef: `unit: ${PROMISED}` }),
		finding({ findingKind: 'promised-test' }),
	] }, { symbols: [] }, withPlan);
	assert.deepEqual(sev(keep), ['HIGH/breach', 'LOW/observation', 'LOW/observation']);
	assert.deepEqual(keep.lowered?.map(l => l.reason), [`"unit: ${PROMISED}" is not a test the approved plan promised`, '"" is not a test the approved plan promised']);

	const noPlan = subject({ plan: false });
	const lowered = normalizeCoverageFindings({ dimension: 'coverage', findings: [finding({ findingKind: 'promised-test', expectationRef: PROMISED })] }, { symbols: [] }, noPlan);
	assert.deepEqual(sev(lowered), ['LOW/observation']);
	assert.equal(lowered.lowered![0]!.reason, 'no plan was approved, so no test was promised');
});

const userOf = (msgs: ReturnType<typeof buildCoveragePrompt>): string => msgs.find(m => m.role === 'user')!.content as string;
const systemOf = (msgs: ReturnType<typeof buildCoveragePrompt>): string => msgs.find(m => m.role === 'system')!.content as string;

test('the coverage prompt lists only eligible symbols', async () => {
	let prompt = '';
	const provider = { completeStructured: async (msgs: ReturnType<typeof buildCoveragePrompt>, schema: unknown) => { prompt = userOf(unenveloped(msgs)); return enveloped(schema, { findings: [] }); } } as unknown as LLMProvider;
	await judgeCoverage(subject(), GROUNDING, provider, { groundingMode: 'full' });
	const listed = JSON.parse(prompt.split('```json\n')[1]!.split('\n```')[0]!) as ChangedSymbolSummary[];
	assert.deepEqual(listed.map(s => [s.entityId, s.coverageEvidence]), [
		['reached', 'reached-not-passing'], ['reachedFailing', 'reached-not-passing'], ['edgeFree', 'no-edge-no-tests'], ['legacy', 'no-edge-no-tests'],
	], 'each eligible symbol with its entityId and class; the section and the type are not listed');
});

test('a diff review lists no symbols and grades only the promised tests', async () => {
	let msgs: ReturnType<typeof buildCoveragePrompt> = [];
	const provider = { completeStructured: async (m: ReturnType<typeof buildCoveragePrompt>, schema: unknown) => { msgs = unenveloped(m); return enveloped(schema, { findings: [] }); } } as unknown as LLMProvider;
	await judgeCoverage(subject(), GROUNDING, provider, { groundingMode: 'degraded' });
	// includes + a short message, not assert.match: a failing match on the whole
	// prompt made node:test spin while formatting it.
	assert.ok(systemOf(msgs).includes('DIFF review: there is no graph, so symbol coverage CANNOT be graded'), 'the system prompt says symbol coverage cannot be graded');
	assert.ok(userOf(msgs).includes('None listed: this is a diff review, so symbol coverage cannot be graded'), 'the user prompt lists no symbols and says why');
	for (const s of GROUNDING.symbols) assert.ok(!userOf(msgs).includes(`"entityId": "${s.entityId}"`), `${s.entityId} is not listed`);
	assert.ok(userOf(msgs).includes(PROMISED), 'the promised tests are still listed');
});
