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
 *     pass-state the buildRecord does not support — where the record is absent the
 *     pass-state is framed 'unverified' (the judge runs even with a null buildRecord);
 *   - excludes pre-existing gaps in touched-but-unchanged neighbours (ac4/c105):
 *     the grounding is already scoped to the Story's own symbols, plus the shared
 *     changedFiles scope-drop; and
 *   - runs no tests and modifies no file on disk (read-only; S001 ac5).
 */

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { validateAgainstSchema, type StructuredCall, type StructuredValidator } from '../../../agent/providers/structured-output.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult, DimensionFinding, ReviewDimension } from '../types.js';

const DIMENSION: ReviewDimension = 'coverage';
const MAX_ATTEMPTS = 3;

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
				required: ['severity', 'location', 'message'],
				properties: {
					severity:       { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
					location:       { type: 'string' },   // `file:line` inside the changed set
					message:        { type: 'string' },
					expectationRef: { type: 'string' },   // the uncovered symbol / missing promised test
					confidence:     { type: 'string', enum: ['breach', 'observation'] },
				},
			},
		},
	},
};

/** Flatten the approved plan's promised per-task tests into a flat list the
 *  prompt can name (ac1). Tolerates a plan stub whose tasks/tests are absent. */
function promisedTestsOf(subject: CodeReviewSubject): { level?: string; name: string }[] {
	const tasks = (subject.approvedPlan as { body?: { tasks?: readonly { tests?: readonly { level?: string; name: string }[] }[] } }).body?.tasks ?? [];
	const out: { level?: string; name: string }[] = [];
	for (const t of tasks) {
		for (const tr of t.tests ?? []) out.push(tr);
	}
	return out;
}

/** A short pass-state summary of the build record for ac3. A null buildRecord
 *  degrades to 'unverified' rather than blocking the judge or asserting a green. */
function buildRecordSummary(subject: CodeReviewSubject): string {
	return subject.buildRecord === null
		? 'No build record is available — treat every test\'s pass-state as UNVERIFIED (never assert a green).'
		: 'A build record is present — use it as the only source of pass/fail; where it does not confirm a green, treat the pass-state as UNVERIFIED.';
}

/** Build the coverage prompt (t1). Structural reference (the changed symbols with
 *  their testsReaching, then the promised tests, then the output-shape reminder)
 *  goes TRAILING per the repo's prompt-structure rule; the present-failing-vs-
 *  no-test and pre-existing-gap-exclusion disciplines are explicit. */
export function buildCoveragePrompt(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	extraNote: string | undefined,
): LLMMessage[] {
	const system = [
		'You are an independent code reviewer judging COVERAGE: whether a Story\'s new/changed behaviour is actually exercised by passing tests.',
		'For each changed symbol, use its `testsReaching` edges (tests that reach it) as the ground-truth: a changed symbol with an EMPTY testsReaching is a not-exercised gap — report it HIGH with the symbol named in `expectationRef` and confidence:"breach".',
		'For each test the approved plan PROMISED (listed below), report whether it is present or missing. A promised test with no corresponding test in the grounding is a HIGH missing-promised-test finding naming the test in `expectationRef`, confidence:"breach".',
		'DISTINGUISH a test that is present but does NOT pass (or whose pass-state cannot be confirmed) from a wholly-missing test: the former is a distinct finding with confidence:"observation" and a message saying "present but failing/unverified" — NOT reported as "no test". Never assert a pass-state the build record does not support.',
		'Do NOT report pre-existing gaps in touched-but-unchanged neighbours — coverage is scoped to THIS Story\'s changed behaviour only. If every changed symbol is exercised and every promised test is present and passing, return an EMPTY findings array. Never manufacture findings.',
		'Reason only over the structured symbol summaries + testsReaching edges and the promised-tests list provided — you are not given raw file contents and you cannot run any test.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');

	// Structural payload trailing: the changed symbols (with testsReaching), then
	// the promised tests + build-record signal, then the output-shape reminder — last.
	const user = [
		'## The Story\'s changed symbols (structured summaries with their test-reaching edges)',
		'```json', JSON.stringify(grounding.symbols, null, 2), '```',
		'## The approved plan\'s promised tests (each should be present and passing)',
		'```json', JSON.stringify(promisedTestsOf(subject), null, 2), '```',
		`## Build-record signal\n${buildRecordSummary(subject)}`,
		'## Output',
		'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "expectationRef": "the uncovered symbol or missing promised test", "confidence": "breach|observation" } ] }.',
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

/**
 * The coverage judge (t2). One serial completeStructured call via
 * withStructuredRetry; maps the validated findings onto the sc3 DimensionResult
 * and drops any finding outside the Story's changed set. Propagates on failure.
 */
export async function judgeCoverage(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	provider:  LLMProvider,
): Promise<DimensionResult> {
	const { withStructuredRetry } = await import('../../../agent/providers/structured-output.js');

	const call: StructuredCall = (note) =>
		provider.completeStructured<unknown>(buildCoveragePrompt(subject, grounding, note), COVERAGE_FINDINGS_SCHEMA);

	const validate: StructuredValidator<CoverageOutput> = (raw) =>
		validateAgainstSchema<CoverageOutput>(COVERAGE_FINDINGS_SCHEMA, raw);

	// Exactly one logical judgement; withStructuredRetry re-issues the SAME
	// serial call on validation failure and throws (never a fabricated pass)
	// once the attempt cap is exhausted.
	const output = await withStructuredRetry(call, validate, MAX_ATTEMPTS);

	const changed = new Set(subject.changedFiles);
	const findings: DimensionFinding[] = output.findings
		.filter(f => changed.has(fileOf(f.location)))   // scope to the Story's own changes
		.map(f => ({
			dimension: DIMENSION,
			severity:  f.severity,
			location:  f.location,
			message:   f.message,
			...(f.expectationRef !== undefined ? { expectationRef: f.expectationRef } : {}),
			...(f.confidence     !== undefined ? { confidence:     f.confidence     } : {}),
		}));

	return { dimension: DIMENSION, findings };
}
