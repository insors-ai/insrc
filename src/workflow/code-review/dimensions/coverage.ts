/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S004 — the COVERAGE dimension judge.
 *
 * `judgeCoverage` assesses whether the Story's new/changed behaviour is actually
 * exercised by passing tests. It mirrors the shipped adherence (S002) and
 * conventions (S003) judges seam-for-seam, but is the ONE dimension that reasons
 * over TWO inputs:
 *   - the sc2 grounding's `testsReaching` edges (test-entity -> this symbol): a
 *     changed symbol with an empty `testsReaching` is a not-exercised gap (ac2);
 *   - the approved PLAN's promised per-task tests (`approvedPlan.body.tasks[].tests`):
 *     a promised test absent from the grounding is a missing-test finding (ac1).
 * It:
 *   - issues exactly ONE serial provider call (k4, no Promise.all), wrapped in
 *     withStructuredRetry so an unvalidatable output PROPAGATES a failure rather
 *     than a fabricated "fully covered" pass (S006 ac5);
 *   - reasons only over the LLMProvider abstraction (k3) at whatever tier the
 *     orchestrator resolved (k10);
 *   - distinguishes a present-but-failing/unverified test (confidence:'observation')
 *     from a wholly-missing one (confidence:'breach') (ac3), and NEVER asserts a
 *     pass-state the test record does not support — where the record is absent the
 *     pass-state is framed 'unverified' (the judge runs even with a null testRecord);
 *   - excludes pre-existing gaps in touched-but-unchanged neighbours (ac4/c105):
 *     the grounding is already scoped to the Story's own symbols, plus the shared
 *     changedFiles scope-drop; and
 *   - runs no tests and modifies no file on disk (read-only; S001 ac5).
 *
 * Evidence classes (ISSUE-b47dadc7): {@link prepareCoverageGrounding} keeps only
 * the coverage-eligible symbols and gives each one class from its testsReaching
 * edges and the Story's test record; {@link normalizeCoverageFindings} then keeps
 * a HIGH only for a test the approved plan promised or a symbol with no edge and
 * no passing Story test file, and lowers every other HIGH to LOW with the reason.
 * The controller path uses the same two helpers.
 */

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import type {
	ChangedSymbolSummary, CodeReviewSubject, CodeReviewGrounding, CoverageEvidence, CoverageFindingKind,
	DimensionResult, DimensionFinding, JudgeContext, LoweredFinding, ReviewDimension,
} from '../types.js';
import { isCoverageEligible } from '../grounding.js';
import { modelDimensionAdapter, runDimensionJob, type ModelDimensionSpec } from '../../review-pipeline/code-review.js';
import { coverageObligations } from '../../review-pipeline/adapters/code-review-obligations.js';
import { testRecordView } from './test-record-view.js';

const DIMENSION: ReviewDimension = 'coverage';

/** The model's raw coverage output, validated against COVERAGE_FINDINGS_SCHEMA.
 *  Per-finding shape maps 1:1 onto sc3 DimensionFinding minus the fixed
 *  `dimension` (the judge stamps that); `confidence` carries the ac3 tier —
 *  'breach' for a wholly-missing test / not-exercised symbol, 'observation' for a
 *  present-but-failing/unverified test. */
interface CoverageOutput {
	readonly findings: readonly {
		readonly severity: 'HIGH' | 'MED' | 'LOW';
		readonly location: string;
		readonly message:  string;
		readonly expectationRef?: string;
		readonly confidence?: 'breach' | 'observation';
		readonly findingKind: CoverageFindingKind;
		readonly symbolId?: string;
	}[];
}

/** ajv/JSON schema the model output is validated against (t1). Structurally
 *  identical to CONVENTIONS_FINDINGS_SCHEMA (the adherence shape + the optional
 *  `confidence` enum); `dimension` is fixed by the judge, so the model never
 *  emits it. */
export const COVERAGE_FINDINGS_SCHEMA: StructuredSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['findings'],
	properties: {
		findings: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['severity', 'location', 'message', 'findingKind'],
				properties: {
					severity:       { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
					location:       { type: 'string' },   // `file:line` inside the changed set
					message:        { type: 'string' },
					expectationRef: { type: 'string' },   // the uncovered symbol / missing promised test
					confidence:     { type: 'string', enum: ['breach', 'observation'] },
					findingKind:    { type: 'string', enum: ['symbol-coverage', 'promised-test', 'other'] },
					symbolId:       { type: 'string' },   // the listed symbol's entityId (symbol-coverage)
				},
			},
		},
	},
};

/** Flatten the approved plan's promised per-task tests into a flat list the
 *  prompt can name (ac1). Tolerates a plan stub whose tasks/tests are absent. */
export function promisedTestsOf(subject: CodeReviewSubject): { level?: string | undefined; name: string }[] {
	// A null approvedPlan (mode B/C) has no promised tests. Guard the null
	// BEFORE the cast — the cast only tolerated a missing body.tasks, not a
	// genuinely absent plan.
	if (subject.approvedPlan === null) return [];
	const tasks = (subject.approvedPlan as { body?: { tasks?: readonly { tests?: readonly { level?: string | undefined; name: string }[] }[] } }).body?.tasks ?? [];
	const out: { level?: string | undefined; name: string }[] = [];
	for (const t of tasks) {
		for (const tr of t.tests ?? []) out.push(tr);
	}
	return out;
}

/** The test file of a `<test file>#<caller>` testsReaching entry. */
function reachingFile(entry: string): string {
	const i = entry.lastIndexOf('#');
	return i >= 0 ? entry.slice(0, i) : entry;
}

/** One symbol's evidence class: edges and a passing reaching file; edges
 *  otherwise; no edge but a passing Story test file; no edge and nothing passing. */
function evidenceOf(symbol: ChangedSymbolSummary, passingFiles: ReadonlySet<string>): CoverageEvidence {
	if (symbol.testsReaching.length > 0) {
		return symbol.testsReaching.some(t => passingFiles.has(reachingFile(t))) ? 'reached-passing' : 'reached-not-passing';
	}
	return passingFiles.size > 0 ? 'no-edge-story-tests-pass' : 'no-edge-no-tests';
}

/**
 * The grounding the coverage dimension judges (ISSUE-b47dadc7): only the
 * coverage-eligible symbols, each with its evidence class. A symbol without the
 * eligibility flag (a grounding from before it existed) is classified by kind and
 * file. With no test record, or one with no passing file, an edge-free symbol is
 * 'no-edge-no-tests'. A diff review ('degraded') has no symbols to grade.
 */
export function prepareCoverageGrounding(
	subject:       CodeReviewSubject,
	grounding:     CodeReviewGrounding,
	groundingMode: 'full' | 'degraded',
): CodeReviewGrounding {
	if (groundingMode === 'degraded') return { symbols: [] };
	const view = testRecordView(subject);
	const passingFiles = new Set((view?.files ?? []).filter(f => f.state === 'passing').map(f => f.file));
	return {
		symbols: grounding.symbols
			.filter(s => s.coverageEligible ?? isCoverageEligible(s.kind, s.file))
			.map(s => ({ ...s, coverageEligible: true, coverageEvidence: evidenceOf(s, passingFiles) })),
	};
}

/** Why a coverage HIGH may not stand, or undefined when it may. */
function whyLowered(f: DimensionFinding, prepared: CodeReviewGrounding, promised: ReadonlySet<string>): string | undefined {
	switch (f.findingKind) {
		case 'promised-test': {
			const ref = f.expectationRef?.trim() ?? '';
			if (promised.has(ref)) return undefined;
			return promised.size === 0
				? 'no plan was approved, so no test was promised'
				: `"${ref}" is not a test the approved plan promised`;
		}
		case 'symbol-coverage': {
			if (f.symbolId === undefined) return 'the finding names no symbolId';
			const matches = prepared.symbols.filter(s => s.entityId === f.symbolId);
			if (matches.length === 0) {
				return prepared.symbols.length === 0
					? 'no symbol is graded in this review (a diff review cannot grade symbol coverage)'
					: `symbolId ${f.symbolId} is not a listed symbol`;
			}
			if (matches.length > 1) return `symbolId ${f.symbolId} matches ${matches.length} listed symbols`;
			const evidence = matches[0]!.coverageEvidence;
			return evidence === 'no-edge-no-tests' ? undefined : `the symbol's evidence is ${evidence ?? 'unknown'}, not no-edge-no-tests`;
		}
		case 'other':
			return 'only a promised test or a symbol with no edge and no passing test may be HIGH';
		default:
			return 'the finding has no findingKind';
	}
}

/**
 * Keep a coverage HIGH only when it is a test the approved plan promised, or a
 * symbol whose evidence is 'no-edge-no-tests'; lower every other HIGH to LOW /
 * 'observation' and record why on the result (ISSUE-b47dadc7). Non-HIGH findings
 * are unchanged. Used by the daemon judge and the controller path alike.
 */
export function normalizeCoverageFindings(
	result:   DimensionResult,
	prepared: CodeReviewGrounding,
	subject:  CodeReviewSubject,
): DimensionResult {
	const promised = new Set(promisedTestsOf(subject).map(t => t.name.trim()));
	const lowered: LoweredFinding[] = [];
	const findings = result.findings.map((f): DimensionFinding => {
		if (f.severity !== 'HIGH') return f;
		const reason = whyLowered(f, prepared, promised);
		if (reason === undefined) return f;
		lowered.push({
			location: f.location, reason,
			...(f.symbolId !== undefined ? { symbolId: f.symbolId } : {}),
			...(f.expectationRef !== undefined ? { expectationRef: f.expectationRef } : {}),
		});
		return { ...f, severity: 'LOW', confidence: 'observation' };
	});
	return {
		...result, findings,
		...(lowered.length > 0 ? { lowered: [...(result.lowered ?? []), ...lowered] } : {}),
	};
}

/** The pass-state evidence for ac3: the Story's test record, per file from its
 *  latest run (ISSUE-1102dc71). With no test record every pass-state is
 *  unverified, rather than blocking the judge or asserting a green. */
function testRecordSection(subject: CodeReviewSubject): string {
	const view = testRecordView(subject);
	if (view === null) {
		return '## Test-record results (from the build gate)\nNo test record is available — treat every test\'s pass-state as UNVERIFIED (never assert a green).';
	}
	return [
		'## Test-record results (from the build gate): each test file from its latest run, and each BUILD task\'s result',
		'```json', JSON.stringify(view, null, 2), '```',
	].join('\n');
}

/** Build the coverage prompt (t1). Structural reference (the changed symbols with
 *  their testsReaching, then the promised tests, then the output-shape reminder)
 *  goes TRAILING per the repo's prompt-structure rule; the present-failing-vs-
 *  no-test and pre-existing-gap-exclusion disciplines are explicit. */
export function buildCoveragePrompt(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	extraNote: string | undefined,
	opts?:     { readonly groundingMode?: 'full' | 'degraded' | undefined },
): LLMMessage[] {
	const hasPlan = subject.approvedPlan !== null;
	const degraded = opts?.groundingMode === 'degraded';
	const system = [
		'You are an independent code reviewer judging COVERAGE: whether a Story\'s new/changed behaviour is actually exercised by passing tests.',
		degraded
			? 'This is a DIFF review: there is no graph, so symbol coverage CANNOT be graded and no symbols are listed. Judge ONLY the promised tests against the test-record results; do NOT report any not-exercised or symbol-coverage finding.'
			: 'Each listed symbol (a function, method or class in a non-test file) carries its `entityId` and a `coverageEvidence` class, computed from its `testsReaching` edges and the Story\'s test record. Grade it by that class: "no-edge-no-tests" (no test reaches it and no Story test file passes) is a not-exercised gap — report it HIGH, findingKind:"symbol-coverage", `symbolId` set to its entityId, confidence:"breach"; "no-edge-story-tests-pass" (the graph shows no edge, but the Story\'s test files pass) may be reported only as an observation (LOW/MED, confidence:"observation"), because the graph may have missed the edge; "reached-passing" needs no finding; "reached-not-passing" is present-but-failing/unverified (confidence:"observation").',
		'Every finding carries `findingKind`: "symbol-coverage" for a finding about a listed symbol (with its `symbolId`), "promised-test" for a finding about a test the plan promised (naming it in `expectationRef` exactly as listed), "other" for anything else. Only a "promised-test" finding naming a promised test, or a "symbol-coverage" finding on a "no-edge-no-tests" symbol, may be HIGH.',
		// The promised-tests rule applies ONLY when a plan was approved. With no
		// plan there is no promised-tests list, so judge testsReaching coverage
		// of the changed symbols only and never report a "missing promised test".
		hasPlan
			? 'For each test the approved plan PROMISED (listed below), report whether it is present or missing. A promised test with no corresponding test in the grounding is a HIGH missing-promised-test finding, findingKind:"promised-test", naming the test in `expectationRef`, confidence:"breach".'
			: 'No plan was approved, so there is no promised-tests list — judge the coverage of the listed symbols ONLY; do NOT report any missing-promised-test finding.',
		'DISTINGUISH a test that is present but does NOT pass (or whose pass-state cannot be confirmed) from a wholly-missing test: the former is a distinct finding with confidence:"observation" and a message saying "present but failing/unverified" — NOT reported as "no test". Never assert a pass-state the test record does not support.',
		'Each `testsReaching` entry is `<test file>#<caller>`: the caller is the function in that test file that reaches the symbol, often a helper rather than a test, so NEVER match the caller name against test titles. Judge a reaching entry by its TEST FILE in the test-record results below: a file whose state is passing means the symbol is exercised by passing tests; a file whose state is failing is present-but-failing; a file whose state is unverified, or a test file the record does not list, is unverified. A title listed under notInLatestRun, or a failing or skipped title, is unverified or present-but-failing in the same way. With no test record, every pass-state is unverified.',
		hasPlan
			? 'Do NOT report pre-existing gaps in touched-but-unchanged neighbours — coverage is scoped to THIS Story\'s changed behaviour only. If every changed symbol is exercised and every promised test is present and passing, return an EMPTY findings array. Never manufacture findings.'
			: 'Do NOT report pre-existing gaps in touched-but-unchanged neighbours — coverage is scoped to THIS Story\'s changed behaviour only. If every changed symbol is exercised, return an EMPTY findings array. Never manufacture findings.',
		// ISSUE-11e2b8a7: a smoke or live test cannot be run by the gate; its result is the builder's report.
		...((testRecordView(subject)?.reportedTests?.length ?? 0) > 0
			? ['The test-record results also list `reportedTests`: named tests the gate cannot run (smoke / live), each with the result and evidence the BUILDER reported. Grade a promised test that appears there against that entry: a reported pass means the test is present and passed as reported by the builder (no missing-promised-test finding); a reported fail is present-but-failing. Name the source as "reported by the builder" in any finding about it.']
			: []),
		'Reason only over the structured symbol summaries + testsReaching edges, the promised-tests list and the test-record results provided — you are not given raw file contents and you cannot run any test.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');

	// Structural payload trailing: the changed symbols (with testsReaching), then
	// the promised tests + test-record results, then the output-shape reminder — last.
	const user = [
		...(degraded
			? ['## The Story\'s changed symbols', 'None listed: this is a diff review, so symbol coverage cannot be graded.']
			: ['## The Story\'s changed symbols (functions, methods and classes in non-test files, each with its entityId, test-reaching edges and coverageEvidence)',
				'```json', JSON.stringify(grounding.symbols, null, 2), '```']),
		hasPlan
			? '## The approved plan\'s promised tests (each should be present and passing)'
			: '## The approved plan\'s promised tests (none — no plan was approved)',
		'```json', JSON.stringify(promisedTestsOf(subject), null, 2), '```',
		testRecordSection(subject),
		'## Output',
		'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "findingKind": "symbol-coverage|promised-test|other", "symbolId": "the listed symbol\'s entityId (symbol-coverage)", "expectationRef": "the uncovered symbol or missing promised test", "confidence": "breach|observation" } ] }.',
		'Each finding.location MUST be a file within the Story\'s changed set. Return an empty findings array if the changed behaviour is fully covered.',
	].join('\n');

	return [
		{ role: 'system', content: system },
		{ role: 'user',   content: user },
	];
}

/** Extract the repo-relative file from a `file:line` location. */
function fileOf(location: string): string {
	const i = location.indexOf(':');
	return i >= 0 ? location.slice(0, i) : location;
}

/** Today's coverage judgement as a pipeline spec: the prompt over the prepared
 *  grounding (coverage-eligible symbols with their evidence), and the mapping, scoped
 *  to the changed set and normalised ONCE over the dimension's result. */
export function coverageSpec(subject: CodeReviewSubject): ModelDimensionSpec<CoverageOutput> {
	const changed = new Set(subject.changedFiles);
	return {
		dimension: DIMENSION,
		schema:    COVERAGE_FINDINGS_SCHEMA,
		prompt:    (grounding, mode, note) => buildCoveragePrompt(subject, prepareCoverageGrounding(subject, grounding, mode), note, { groundingMode: mode }),
		// The rows the prompt carries: only eligible symbols, each with its coverage evidence.
		materialGrounding: (grounding, mode) => prepareCoverageGrounding(subject, grounding, mode),
		// Each promised test, with its record evidence; with no symbols (a diff review) too.
		obligations: () => coverageObligations(promisedTestsOf(subject), testRecordView(subject)),
		// A divided review: chunks grade the symbols they hold and note the promised tests; each test is judged at gather.
		chunk: {
			kind: 'coverage', findings: COVERAGE_FINDINGS_SCHEMA,
			obligationFraming: 'You are an independent code reviewer judging COVERAGE of ONE test the approved plan PROMISED: whether it is present and passing. Report only findings about this promised test, each with findingKind "promised-test"; never grade a symbol here.',
			judge: 'Judge this promised test on its record evidence below and the notes. A test the record shows present and passing, or reported passed by the builder, needs no finding. A test present but failing, or whose pass-state cannot be confirmed, is a finding with confidence "observation" saying "present but failing/unverified", not "no test". A test no test file names and no reported result covers is a HIGH missing-promised-test finding, findingKind "promised-test", confidence "breach". Never assert a pass-state the record does not support; name a reported result as "reported by the builder".',
			framing: 'You are an independent code reviewer judging COVERAGE: whether a Story\'s new/changed behaviour is actually exercised by passing tests. Each listed symbol carries its entityId and a coverageEvidence class: "no-edge-no-tests" is a not-exercised gap (HIGH, confidence "breach"); "no-edge-story-tests-pass" may be reported only as an observation (LOW/MED), because the graph may have missed the edge; "reached-passing" needs no finding; "reached-not-passing" is present-but-failing or unverified (confidence "observation"). Coverage is scoped to THIS Story\'s changed behaviour; never report a pre-existing gap, and never assert a pass-state the test record does not support.',
		},
		toResult:  (output, grounding, mode) => normalizeCoverageFindings({
			dimension: DIMENSION,
			findings: output.findings
				.filter(f => changed.has(fileOf(f.location)))   // scope to the Story's own changes
				.map((f): DimensionFinding => ({
					dimension: DIMENSION,
					severity:  f.severity,
					location:  f.location,
					message:   f.message,
					...(f.expectationRef !== undefined ? { expectationRef: f.expectationRef } : {}),
					...(f.confidence     !== undefined ? { confidence:     f.confidence     } : {}),
					findingKind: f.findingKind,
					...(f.symbolId       !== undefined ? { symbolId:       f.symbolId       } : {}),
				})),
		}, prepareCoverageGrounding(subject, grounding, mode), subject),
	};
}

/**
 * The coverage judge: one review-pipeline job (Epic 8315a11f), whose single call
 * is today's prompt and schema with the repo as cwd. The pipeline re-issues a
 * failed call once and propagates a second failure (never a fabricated pass).
 */
export async function judgeCoverage(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	provider:  LLMProvider,
	context?:  JudgeContext,
): Promise<DimensionResult> {
	return runDimensionJob((s, budgetPolicy) => modelDimensionAdapter(coverageSpec(subject), subject, s, budgetPolicy.totalTokens * 3, 'daemon', budgetPolicy), subject, grounding, provider, context);
}
