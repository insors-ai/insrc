/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic make-workflow-framework-s-generated-artifact (S001, sc2) — the
 * FUNCTIONAL-COVERAGE dimension judge.
 *
 * `judgeFunctionalCoverage` assesses whether each functional requirement (FR)
 * the Story's approved artifacts declared was genuinely realized by the changed
 * code. It mirrors the shipped coverage/adherence judges seam-for-seam:
 *   - the FR expectations come from the subject's approved LLD/PLAN
 *     `body.functionalDefinition.requirements` (each FR id + statement);
 *   - the grounding's changed-symbol summaries are the evidence of what was built;
 *   - it issues exactly ONE serial provider call (k4/k5, no Promise.all), wrapped
 *     in withStructuredRetry so an unvalidatable output PROPAGATES rather than
 *     fabricating a "fully realized" pass;
 *   - each finding binds `expectationRef` to the FR id judged unrealized/partial,
 *     carries the review Severity VERBATIM, and folds through the existing
 *     computeReviewVerdict reducer UNCHANGED (k4); and
 *   - runs no tests and modifies no file on disk (read-only).
 *
 * This dimension is only RUN when the subject carries a non-empty
 * functionalDefinition — the orchestrator (T005) gates its inclusion so non-FR
 * work keeps exactly the base four dimensions (absent-safe).
 */

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { validateAgainstSchema, type StructuredCall, type StructuredValidator } from '../../../agent/providers/structured-output.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult, DimensionFinding, ReviewDimension } from '../types.js';
import type { FunctionalRequirement } from '../../artifacts/functional-definition.js';

const DIMENSION: ReviewDimension = 'functional-coverage';
const MAX_ATTEMPTS = 3;

/** The model's raw functional-coverage output, validated against the schema.
 *  Per-finding shape maps 1:1 onto sc3 DimensionFinding minus the fixed
 *  `dimension` (the judge stamps that); `expectationRef` names the FR id the
 *  finding is about; `confidence` distinguishes a wholly-unrealized FR ('breach')
 *  from a partially/unclearly realized one ('observation'). */
interface FunctionalCoverageOutput {
	readonly findings: readonly {
		readonly severity: 'HIGH' | 'MED' | 'LOW';
		readonly location: string;
		readonly message:  string;
		readonly expectationRef?: string;
		readonly confidence?: 'breach' | 'observation';
	}[];
}

/** ajv/JSON schema the model output is validated against — structurally identical
 *  to COVERAGE_FINDINGS_SCHEMA; `dimension` is fixed by the judge, never emitted. */
export const FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA: StructuredSchema = {
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
					expectationRef: { type: 'string' },   // the FR id judged unrealized/partial
					confidence:     { type: 'string', enum: ['breach', 'observation'] },
				},
			},
		},
	},
};

/** The functional requirements to check — pulled from the subject's approved LLD,
 *  else its approved PLAN. Returns [] when neither carries a functionalDefinition
 *  (the orchestrator does not run this dimension in that case). */
export function functionalRequirementsOf(subject: CodeReviewSubject): readonly FunctionalRequirement[] {
	const lld = (subject.approvedLld as { body?: { functionalDefinition?: { requirements?: readonly FunctionalRequirement[] } } } | null)?.body?.functionalDefinition?.requirements;
	if (lld !== undefined && lld.length > 0) return lld;
	const plan = (subject.approvedPlan as { body?: { functionalDefinition?: { requirements?: readonly FunctionalRequirement[] } } } | null)?.body?.functionalDefinition?.requirements;
	return plan ?? [];
}

/** True when the subject carries a non-empty functionalDefinition — the
 *  orchestrator's gate for including this dimension (absent-safe). */
export function hasFunctionalDefinition(subject: CodeReviewSubject): boolean {
	return functionalRequirementsOf(subject).length > 0;
}

/**
 * Build the functional-coverage prompt. Structural reference (the FRs to check,
 * then the changed symbols) goes TRAILING per the repo's prompt-structure rule.
 */
export function buildFunctionalCoveragePrompt(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	extraNote: string | undefined,
): LLMMessage[] {
	const frs = functionalRequirementsOf(subject);
	const system = [
		'You are an independent code reviewer judging FUNCTIONAL COVERAGE: whether each functional requirement (FR) the design declared was GENUINELY realized by the changed code.',
		'For each FR listed below, decide from the changed-symbol summaries whether the outcome it states is actually implemented. An FR with no supporting changed code is a HIGH finding naming the FR id in `expectationRef`, confidence:"breach".',
		'An FR that is only PARTIALLY realized, or whose realization cannot be confirmed from the changed symbols, is a distinct finding with confidence:"observation" and a message saying what is missing — NOT reported as wholly unrealized.',
		'Judge genuine realization, not mere mention: a symbol whose name resembles the FR but does not implement its stated outcome does NOT satisfy it.',
		'Reason only over the structured symbol summaries provided — you are not given raw file contents and you cannot run any test.',
		'If every FR is genuinely realized by the changed code, return an EMPTY findings array. Never manufacture findings.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');

	const user = [
		'## The functional requirements to check (each must be genuinely realized)',
		'```json', JSON.stringify(frs.map(r => ({ id: r.id, statement: r.statement, scope: r.scope, itemRef: r.itemRef })), null, 2), '```',
		'## The Story\'s changed symbols (structured summaries)',
		'```json', JSON.stringify(grounding.symbols, null, 2), '```',
		'## Output',
		'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "expectationRef": "the FR id", "confidence": "breach|observation" } ] }.',
		'Each finding.location MUST be a file within the Story\'s changed set. Return an empty findings array if every FR is realized.',
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
 * The functional-coverage judge. One serial completeStructured call via
 * withStructuredRetry; maps the validated findings onto the sc3 DimensionResult,
 * drops any finding outside the Story's changed set, and drops any finding whose
 * expectationRef is not one of the declared FR ids. Propagates on failure.
 */
export async function judgeFunctionalCoverage(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	provider:  LLMProvider,
): Promise<DimensionResult> {
	const { withStructuredRetry } = await import('../../../agent/providers/structured-output.js');

	const call: StructuredCall = (note) =>
		provider.completeStructured<unknown>(buildFunctionalCoveragePrompt(subject, grounding, note), FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA, { cwd: subject.repoPath });

	const validate: StructuredValidator<FunctionalCoverageOutput> = (raw) =>
		validateAgainstSchema<FunctionalCoverageOutput>(FUNCTIONAL_COVERAGE_FINDINGS_SCHEMA, raw);

	const output = await withStructuredRetry(call, validate, MAX_ATTEMPTS);

	const changed = new Set(subject.changedFiles);
	const frIds = new Set(functionalRequirementsOf(subject).map(r => r.id));
	const findings: DimensionFinding[] = output.findings
		.filter(f => changed.has(fileOf(f.location)))                              // scope to the Story's own changes
		.filter(f => f.expectationRef === undefined || frIds.has(f.expectationRef)) // never reference an unknown FR id
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
