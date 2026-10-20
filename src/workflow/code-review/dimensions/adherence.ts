/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S002 — the ADHERENCE dimension judge.
 *
 * `judgeAdherence` compares the Story's changed code (sc2 grounding summaries,
 * never raw files) against its approved LLD + PLAN, and reports each place the
 * implementation DEPARTS from an approved expectation as a DimensionFinding
 * naming that expectation (`expectationRef`). It:
 *   - issues exactly ONE serial provider call (k4, no Promise.all), wrapped in
 *     withStructuredRetry so an unvalidatable model output PROPAGATES a failure
 *     rather than a fabricated "no divergence" pass (S006 ac5);
 *   - reasons only over the LLMProvider abstraction (k3) at whatever tier the
 *     orchestrator resolved (the provider is injected — the tier/no-cloud-REST
 *     guarantee, k10, is the caller's via buildShaperProvider);
 *   - returns an EMPTY findings[] when the code satisfies every expectation
 *     (ac2, no manufactured findings) and raises NOTHING against a design
 *     decision the reviewer would merely have made differently (ac3, c103/k8);
 *   - drops any finding whose location falls outside the Story's changed set
 *     (scoped to this Story's own changes).
 * Read-only throughout.
 */

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult, DimensionFinding, JudgeContext, ReviewDimension } from '../types.js';
import { modelDimensionAdapter, runDimensionJob, type ModelDimensionSpec } from '../../review-pipeline/code-review.js';
import { adherenceObligations } from '../../review-pipeline/adapters/code-review-obligations.js';

const DIMENSION: ReviewDimension = 'adherence';

/** The model's raw adherence output, validated against ADHERENCE_FINDINGS_SCHEMA.
 *  Its per-finding shape maps 1:1 onto sc3 DimensionFinding minus the fixed
 *  `dimension` (the judge stamps that, not the model). */
interface AdherenceOutput {
	readonly findings: readonly {
		readonly severity: 'HIGH' | 'MED' | 'LOW';
		readonly location: string;
		readonly message:  string;
		readonly expectationRef?: string;
	}[];
}

/** ajv/JSON schema the model output is validated against (t1). Per-finding shape
 *  is 1:1 with sc3 DimensionFinding (severity/location/message/expectationRef);
 *  `dimension` is fixed by the judge, so the model never emits it. */
export const ADHERENCE_FINDINGS_SCHEMA: StructuredSchema = {
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
					expectationRef: { type: 'string' },   // the approved clause departed from
				},
			},
		},
	},
};

/** Build the adherence prompt (t1). Structural reference (the approved
 *  contract + the output-shape reminder) goes TRAILING per the repo's
 *  prompt-structure rule; the decision-out-of-scope instruction is explicit. */
export function buildAdherencePrompt(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	extraNote: string | undefined,
): LLMMessage[] {
	const hasLld  = subject.approvedLld  !== null;
	const hasPlan = subject.approvedPlan !== null;

	// The framing follows the mode: implementation-correctness when the plan is
	// present (code must IMPLEMENT the plan's tasks + acceptance checks AND
	// honour the LLD); LLD-contract-only when there is no plan.
	const contractLine = hasPlan
		? 'You are an independent code reviewer judging ADHERENCE: whether a Story\'s changed code correctly IMPLEMENTS its approved plan (PLAN — the ordered tasks + their acceptance checks) AND honours its approved design (LLD).'
		: 'You are an independent code reviewer judging ADHERENCE: whether a Story\'s changed code honours its approved design (LLD). (No plan was approved — judge against the LLD contract only.)';
	const system = [
		contractLine,
		'Report ONLY places where the code DEPARTS from an approved expectation. For each departure, name the specific approved expectation it failed to meet in `expectationRef`.',
		'Do NOT raise a finding against a design decision merely because you would have decided differently — the approved decision itself is OUT OF SCOPE; only departures from it are findings.',
		'If the code satisfies every approved expectation, return an EMPTY findings array. Never manufacture findings to appear thorough.',
		'Reason only over the structured symbol summaries provided — you are not given raw file contents.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');

	// Structural payload trailing: the approved contract(s) — each emitted ONLY
	// when present (never dereference a null) — then the changed symbols, then
	// the output-shape reminder last, per the prompt rule.
	const user = [
		...(hasLld
			? ['## Approved design (LLD body)', '```json', JSON.stringify(subject.approvedLld!.body, null, 2), '```']
			: []),
		...(hasPlan
			? ['## Approved plan (PLAN body — the ordered tasks + their acceptance checks)', '```json', JSON.stringify(subject.approvedPlan!.body, null, 2), '```']
			: []),
		'## The Story\'s changed symbols (structured summaries — the code under review)',
		'```json', JSON.stringify(grounding.symbols, null, 2), '```',
		'## Output',
		'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "expectationRef": "the approved clause departed from" } ] }.',
		'Each finding.location MUST be a file within the Story\'s changed set. Return an empty findings array if the code adheres.',
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

/** Today's adherence judgement as a pipeline spec: the prompt, schema and the mapping
 *  that keeps only findings inside the Story's changed set. With neither an approved
 *  LLD nor an approved plan there is no contract to judge against, so no call is made
 *  and the result is empty (the model can never invent a departure). */
export function adherenceSpec(subject: CodeReviewSubject): ModelDimensionSpec<AdherenceOutput> {
	const changed = new Set(subject.changedFiles);
	return {
		dimension: DIMENSION,
		schema:    ADHERENCE_FINDINGS_SCHEMA,
		prompt:    (grounding, _mode, note) => buildAdherencePrompt(subject, grounding, note),
		toResult:  output => ({
			dimension: DIMENSION,
			findings: output.findings
				.filter(f => changed.has(fileOf(f.location)))   // scope to the Story's own changes
				.map((f): DimensionFinding => ({
					dimension: DIMENSION,
					severity:  f.severity,
					location:  f.location,
					message:   f.message,
					...(f.expectationRef !== undefined ? { expectationRef: f.expectationRef } : {}),
				})),
		}),
		obligations: () => adherenceObligations(subject),
		// A divided review: chunks note how their code meets each clause; the gather judges each clause.
		chunk: {
			kind: 'notes',
			judge: 'Judge whether the Story\'s changed code implements this approved clause or plan task. A place where the code departs from it is a finding located at that code. A clause or task that requires code and that no note shows implemented is an unimplemented-expectation finding. Report only departures from the approved expectation; the approved decision itself is out of scope.',
			framing: 'You are an independent code reviewer gathering evidence on ADHERENCE: whether a Story\'s changed code correctly implements its approved plan tasks and honours its approved design (LLD) clauses. Departures from an approved expectation matter; a design decision itself is out of scope.',
		},
		...(subject.approvedLld === null && subject.approvedPlan === null ? { skip: () => ({ dimension: DIMENSION, findings: [] }) } : {}),
	};
}

/**
 * The adherence judge: one review-pipeline job (Epic 8315a11f), whose single call
 * is today's prompt and schema with the repo as cwd. The pipeline re-issues a
 * failed call once and propagates a second failure (never a fabricated pass).
 */
export async function judgeAdherence(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	provider:  LLMProvider,
	ctx?:      JudgeContext,
): Promise<DimensionResult> {
	return runDimensionJob(s => modelDimensionAdapter(adherenceSpec(subject), subject, s), subject, grounding, provider, ctx);
}
