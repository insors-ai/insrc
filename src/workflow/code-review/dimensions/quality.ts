/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S005 — the QUALITY dimension judge (the fourth and final dimension).
 *
 * `judgeQuality` assesses the overall quality risks the Story's changed code
 * carries — correctness, avoidable complexity, duplication, and unhandled error
 * paths — reasoning over the sc2 grounding summaries (signature + caller/callee
 * edges), never raw files. It mirrors the shipped adherence/conventions/coverage
 * judges seam-for-seam, differing only in what it flags and which optional sc3
 * field it emits: its distinctive field is `counterpartRef` (NOT expectationRef),
 * which names the existing symbol a change duplicates so the reader can confirm
 * the overlap (ac2). It:
 *   - issues exactly ONE serial provider call (k4, no Promise.all), wrapped in
 *     withStructuredRetry so an unvalidatable output PROPAGATES a failure rather
 *     than a fabricated "no risks" pass (S006 ac5);
 *   - reasons only over the LLMProvider abstraction (k3) at whatever tier the
 *     orchestrator resolved (k10/ac4 — the provider is injected);
 *   - caps matters of taste at LOW severity so the persisted verdict (HIGH→block)
 *     never blocks the Story on a preference (ac3);
 *   - returns an EMPTY findings[] when the changed code carries no risk; and
 *   - drops any finding whose location falls outside the Story's changed set.
 * Read-only throughout; reads only grounding.symbols + subject.changedFiles
 * (never approvedPlan/buildRecord).
 */

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import type { CodeReviewSubject, CodeReviewGrounding, DimensionResult, DimensionFinding, JudgeContext, ReviewDimension } from '../types.js';
import { modelDimensionAdapter, runDimensionJob, type ModelDimensionSpec } from '../../review-pipeline/code-review.js';

const DIMENSION: ReviewDimension = 'quality';

/** The model's raw quality output, validated against QUALITY_FINDINGS_SCHEMA.
 *  Per-finding shape maps 1:1 onto sc3 DimensionFinding minus the fixed
 *  `dimension` (the judge stamps that); its distinctive optional field is
 *  `counterpartRef` — the existing symbol a duplication overlaps. */
interface QualityOutput {
	readonly findings: readonly {
		readonly severity: 'HIGH' | 'MED' | 'LOW';
		readonly location: string;
		readonly message:  string;
		readonly counterpartRef?: string;
		readonly confidence?: 'breach' | 'observation';
	}[];
}

/** ajv/JSON schema the model output is validated against (t1). The adherence
 *  per-finding shape (severity/location/message) but with the distinctive
 *  optional `counterpartRef` (NOT expectationRef) plus optional confidence;
 *  `dimension` is fixed by the judge, so the model never emits it. */
export const QUALITY_FINDINGS_SCHEMA: StructuredSchema = {
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
					counterpartRef: { type: 'string' },   // the existing duplicated symbol
					confidence:     { type: 'string', enum: ['breach', 'observation'] },
				},
			},
		},
	},
};

/** Build the quality prompt (t1). Structural reference (the changed symbols with
 *  their signature/caller/callee edges, then the output-shape reminder) goes
 *  TRAILING per the repo's prompt-structure rule; the four-risk-class charge, the
 *  counterpart-naming instruction, and the taste-cap discipline are explicit. */
export function buildQualityPrompt(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	extraNote: string | undefined,
): LLMMessage[] {
	const system = [
		'You are an independent code reviewer judging QUALITY: the correctness, complexity, duplication, and error-handling risks a Story\'s changed code carries.',
		'Report each of these FOUR risk classes as a finding with a `file:line` location and a severity: (1) a correctness risk, (2) avoidable complexity (a needlessly tangled routine), (3) duplication of logic that already exists elsewhere, (4) an unhandled error path.',
		'When you flag a DUPLICATION, name the existing overlapping symbol in `counterpartRef` so the reader can confirm the overlap. Cite only a symbol visible in the provided grounding or among its named callers/callees — never invent a counterpart.',
		'A matter of TASTE (a naming or layout preference, not a real risk) must be emitted at severity LOW and NEVER HIGH, so it can never block the Story; a genuine risk is emitted at MED or HIGH as warranted.',
		'If the changed code carries no risk, return an EMPTY findings array. Never manufacture findings to appear thorough.',
		'Reason only over the structured symbol summaries provided — you are not given raw file contents.',
		extraNote ? `\nCorrection from a previous attempt:\n${extraNote}` : '',
	].filter(s => s.length > 0).join('\n');

	// Structural payload trailing: the changed symbols (signature/callers/callees),
	// then the output-shape reminder — last, per the prompt rule.
	const user = [
		'## The Story\'s changed symbols (structured summaries with their signatures + caller/callee edges)',
		'```json', JSON.stringify(grounding.symbols, null, 2), '```',
		'## Output',
		'Return { "findings": [ { "severity": "HIGH|MED|LOW", "location": "file:line", "message": "...", "counterpartRef": "the existing duplicated symbol (duplication findings only)", "confidence": "breach|observation" } ] }.',
		'Each finding.location MUST be a file within the Story\'s changed set. Return an empty findings array if the changed code carries no risk.',
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

/** Today's quality judgement as a pipeline spec: prompt, schema and the mapping
 *  that keeps only findings inside the Story's changed set. */
export function qualitySpec(subject: CodeReviewSubject): ModelDimensionSpec<QualityOutput> {
	const changed = new Set(subject.changedFiles);
	return {
		dimension: DIMENSION,
		schema:    QUALITY_FINDINGS_SCHEMA,
		prompt:    (grounding, _mode, note) => buildQualityPrompt(subject, grounding, note),
		// A divided review: chunks report today's findings and describe every symbol they hold.
		chunk: {
			kind: 'quality', findings: QUALITY_FINDINGS_SCHEMA,
			relation: 'A correctness risk or an unhandled error path arising from how the caller uses the callee is a finding with today\'s severity rules; a matter of taste is LOW.',
			framing: 'You are an independent code reviewer judging QUALITY: the correctness, complexity, duplication, and error-handling risks a Story\'s changed code carries. Report each of the four risk classes as a finding with a `file:line` location and a severity; a matter of TASTE is LOW and never HIGH; a genuine risk is MED or HIGH as warranted. Never manufacture findings.',
		},
		toResult:  output => ({
			dimension: DIMENSION,
			findings: output.findings
				.filter(f => changed.has(fileOf(f.location)))   // scope to the Story's own changes
				.map((f): DimensionFinding => ({
					dimension: DIMENSION,
					severity:  f.severity,
					location:  f.location,
					message:   f.message,
					...(f.counterpartRef !== undefined ? { counterpartRef: f.counterpartRef } : {}),
					...(f.confidence     !== undefined ? { confidence:     f.confidence     } : {}),
				})),
		}),
	};
}

/**
 * The quality judge: one review-pipeline job (Epic 8315a11f), whose single call
 * is today's prompt and schema with the repo as cwd. The pipeline re-issues a
 * failed call once and propagates a second failure (never a fabricated pass).
 */
export async function judgeQuality(
	subject:   CodeReviewSubject,
	grounding: CodeReviewGrounding,
	provider:  LLMProvider,
	ctx?:      JudgeContext,
): Promise<DimensionResult> {
	return runDimensionJob(s => modelDimensionAdapter(qualitySpec(subject), subject, s), subject, grounding, provider, ctx);
}
