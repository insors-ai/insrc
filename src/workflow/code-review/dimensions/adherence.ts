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
import { validateAgainstSchema, type StructuredCall, type StructuredValidator } from '../../../agent/providers/structured-output.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult, DimensionFinding, ReviewDimension } from '../types.js';

const DIMENSION: ReviewDimension = 'adherence';
const MAX_ATTEMPTS = 3;

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
	const system = [
		'You are an independent code reviewer judging ADHERENCE: whether a Story\'s changed code honours its APPROVED design (LLD) and plan (PLAN).',
		'Report ONLY places where the code DEPARTS from an approved expectation. For each departure, name the specific approved expectation it failed to meet in `expectationRef`.',
		'Do NOT raise a finding against a design decision merely because you would have decided differently — the approved decision itself is OUT OF SCOPE; only departures from it are findings.',
		'If the code satisfies every approved expectation, return an EMPTY findings array. Never manufacture findings to appear thorough.',
		'Reason only over the structured symbol summaries provided — you are not given raw file contents.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');

	// Structural payload trailing: the approved contract, then the changed
	// symbols, then the output-shape reminder — last, per the prompt rule.
	const user = [
		'## Approved design (LLD body)',
		'```json', JSON.stringify(subject.approvedLld.body, null, 2), '```',
		'## Approved plan (PLAN body — the ordered tasks + their acceptance checks)',
		'```json', JSON.stringify(subject.approvedPlan.body, null, 2), '```',
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

/**
 * The adherence judge (t2). One serial completeStructured call via
 * withStructuredRetry; maps the validated findings onto the sc3 DimensionResult
 * and drops any finding outside the Story's changed set. Propagates on failure.
 */
export async function judgeAdherence(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	provider:  LLMProvider,
): Promise<DimensionResult> {
	const { withStructuredRetry } = await import('../../../agent/providers/structured-output.js');

	const call: StructuredCall = (note) =>
		provider.completeStructured<unknown>(buildAdherencePrompt(subject, grounding, note), ADHERENCE_FINDINGS_SCHEMA);

	const validate: StructuredValidator<AdherenceOutput> = (raw) =>
		validateAgainstSchema<AdherenceOutput>(ADHERENCE_FINDINGS_SCHEMA, raw);

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
		}));

	return { dimension: DIMENSION, findings };
}
