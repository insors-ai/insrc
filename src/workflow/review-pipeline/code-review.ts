/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The code review's single-chunk adapters (Epic 8315a11f s1, plan task t10).
 * Each code-review dimension is one pipeline job: a model dimension is one stage
 * whose call is today's prompt and schema, a deterministic one (ux, diagram) one
 * stage that reads only the snapshot. The snapshot is taken once, at prepare:
 * the grounding and the existence of every companion file the LLD references,
 * so a file added or removed afterwards cannot change the result.
 *
 * The judges keep their signatures and supply their prompt builders and result
 * mappers here; this module never imports them. Dividing a code review (its
 * atoms, chunk prompts and gather) is Stories s2 and s3: until then a dimension
 * whose single call is over the limit fails with that reason, never a pass.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { buildRetryNote } from '../../agent/providers/structured-output.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../shared/types.js';
import type { CompanionArtifactRef } from '../artifacts/companion/types.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, JudgeContext, ReviewDimension } from '../code-review/types.js';
import { codeReviewMaterial, neighbourSummary } from './adapters/code-review-material.js';
import type { DimensionObligations } from './adapters/code-review-obligations.js';
import { runReviewJob } from './driver.js';
import { createReviewJob } from './job.js';
import { reviewLimitChars } from './limit.js';
import type { AdapterStage, ReviewAdapter, ReviewMaterial, ReviewMaterialSnapshot, ReviewPath, StageAnswer } from './types.js';

/** What a code-review job's snapshot holds as its grounding. */
interface GroundingFacts {
	readonly grounding:     CodeReviewGrounding;
	readonly groundingMode: 'full' | 'degraded';
}

/**
 * The code review's snapshot, taken once: the grounding (never re-queried) and,
 * for every companion the approved LLD references, whether its file exists now.
 */
export function codeReviewSnapshot(subject: CodeReviewSubject, grounding: CodeReviewGrounding, groundingMode: 'full' | 'degraded' = 'full'): ReviewMaterialSnapshot {
	const fileFacts: Record<string, { exists: boolean }> = {};
	for (const ref of companionsOf(subject)) fileFacts[ref.relPath] = { exists: existsSync(isAbsolute(ref.relPath) ? ref.relPath : join(subject.repoPath, ref.relPath)) };
	const facts: GroundingFacts = { grounding, groundingMode };
	return { kind: 'code-review', grounding: facts, fileFacts };
}

/** Whether a companion file existed at prepare. A file prepare did not record is an error, never a guess. */
export function fileExisted(snapshot: ReviewMaterialSnapshot, relPath: string): boolean {
	const fact = snapshot.fileFacts?.[relPath];
	if (fact === undefined) throw new Error(`code review: no file fact was recorded at prepare for ${relPath}`);
	return fact.exists;
}

function companionsOf(subject: CodeReviewSubject): readonly CompanionArtifactRef[] {
	const body = (subject.approvedLld as { body?: { companions?: readonly CompanionArtifactRef[] } } | null)?.body;
	return body?.companions ?? [];
}

function groundingOf(snapshot: ReviewMaterialSnapshot): GroundingFacts {
	const g = snapshot.grounding as GroundingFacts | undefined;
	if (g === undefined) throw new Error('code review: the snapshot holds no grounding');
	return g;
}

/** A model dimension: today's prompt (with today's correction note on a re-issue), schema and mapping. */
export interface ModelDimensionSpec<O> {
	readonly dimension: ReviewDimension;
	readonly schema:    StructuredSchema;
	readonly prompt:    (grounding: CodeReviewGrounding, mode: 'full' | 'degraded', note: string | undefined) => LLMMessage[];
	/** Today's mapping and filters, applied once over the dimension's answer. */
	readonly toResult:  (output: O, grounding: CodeReviewGrounding, mode: 'full' | 'degraded') => DimensionResult;
	/** Present when the dimension makes no call at all for this subject (adherence without an LLD or plan). */
	readonly skip?:     (() => DimensionResult) | undefined;
	/** The dimension's prepared grounding, the rows its prompt carries (coverage:
	 *  prepareCoverageGrounding's output). Absent: the grounding itself. */
	readonly materialGrounding?: ((grounding: CodeReviewGrounding, mode: 'full' | 'degraded') => CodeReviewGrounding) | undefined;
	/** What a divided review must judge (Story s3): the obligations and their context atoms,
	 *  from the saved subject and the material's atoms only. Absent: none. */
	readonly obligations?: ((material: ReviewMaterial) => DimensionObligations) | undefined;
}

/** A deterministic dimension: run on the snapshot alone on the daemon path; the controller is offered its prompt. */
export interface DeterministicDimensionSpec {
	readonly dimension: ReviewDimension;
	/** When the stage itself throws: fail the review (default), or record a LOW observation (diagram). */
	readonly onFailure?: 'fail-review' | 'record-observation' | undefined;
	readonly run:       (snapshot: ReviewMaterialSnapshot, grounding: CodeReviewGrounding) => Promise<DimensionResult>;
	/** Today's controller prompt for the dimension. */
	readonly controllerPrompt: (grounding: CodeReviewGrounding) => LLMMessage[];
}

/** The findings shape the controller answers a deterministic dimension's prompt with. */
export const CONTROLLER_FINDINGS_SCHEMA: StructuredSchema = {
	type: 'object', required: ['findings'],
	properties: {
		findings: {
			type: 'array',
			items: {
				type: 'object', required: ['severity', 'location', 'message'],
				properties: {
					dimension: { type: 'string' }, severity: { type: 'string', enum: ['HIGH', 'MED', 'LOW'] },
					location: { type: 'string' }, message: { type: 'string' }, confidence: { type: 'string', enum: ['breach', 'observation'] },
				},
			},
		},
	},
};

/** The one answer of a single-call stage. A divided review cannot be finished here (Stories s2, s3). */
function singleAnswer(outputs: Readonly<Record<string, unknown>>, stage: string, dimension: string, divided: boolean): unknown {
	if (divided) {
		throw new Error(`code review ${dimension}: the dimension's single call is over the review.chunkTokens limit, and dividing a code review is not available yet. No review was recorded.`);
	}
	const answers = outputs[stage] as readonly StageAnswer[] | undefined;
	if (answers === undefined || answers.length !== 1) throw new Error(`code review ${dimension}: expected one answer, got ${answers?.length ?? 0}`);
	return answers[0]!.answer;
}

/** A model dimension's adapter, built from the subject and the job's snapshot. */
export function modelDimensionAdapter<O>(spec: ModelDimensionSpec<O>, subject: CodeReviewSubject, snapshot: ReviewMaterialSnapshot): ReviewAdapter<DimensionResult> {
	const { grounding, groundingMode } = groundingOf(snapshot);
	const execution = { mode: 'structured' as const, cwd: subject.repoPath };
	const stages = (path: ReviewPath): readonly AdapterStage[] => {
		if (spec.skip !== undefined) {
			// No call: the dimension's result is known without the model, on either path.
			return [{ id: 'skip', kind: 'deterministic', after: [], onCallFailure: 'fail-review', singleCalls: () => [], chunkCalls: () => [], run: async () => spec.skip!() }];
		}
		void path;
		return [{
			id: 'judge', kind: 'model', after: [], onCallFailure: 'fail-review',
			singleCalls: () => [{ messages: spec.prompt(grounding, groundingMode, undefined), schema: spec.schema, execution }],
			chunkCalls: () => [],
			// Today's correction: the prompt rebuilt with withStructuredRetry's note.
			withCorrection: (prompt, reasons) => ({ ...prompt, messages: spec.prompt(grounding, groundingMode, buildRetryNote(reasons)) }),
		}];
	};
	return {
		kind: 'code-review', dimension: spec.dimension,
		// Story s2: the dimension's rows as whole atoms with their relations, from the snapshot only.
		material: () => {
			const material = codeReviewMaterial(spec.materialGrounding?.(grounding, groundingMode) ?? grounding);
			const own = spec.obligations?.(material);
			if (own === undefined) return material;
			return { ...material, obligations: own.obligations, ...(own.context.length > 0 ? { context: own.context } : {}) };
		},
		neighbourSummary,
		stagesFor: stages,
		finish: (outputs, ctx) => spec.skip !== undefined
			? outputs['skip'] as DimensionResult
			: spec.toResult(singleAnswer(outputs, 'judge', spec.dimension, ctx.divided) as O, grounding, groundingMode),
	};
}

/** A deterministic dimension's adapter: on the daemon path one stage over the snapshot;
 *  on the controller path today's prompt is offered. */
export function deterministicDimensionAdapter(spec: DeterministicDimensionSpec, subject: CodeReviewSubject, snapshot: ReviewMaterialSnapshot): ReviewAdapter<DimensionResult> {
	const { grounding } = groundingOf(snapshot);
	return {
		kind: 'code-review', dimension: spec.dimension,
		material: () => ({ atoms: [], relations: [], obligations: [] }),
		stagesFor: path => path === 'daemon'
			? [{ id: 'run', kind: 'deterministic', after: [], onCallFailure: spec.onFailure ?? 'fail-review', singleCalls: () => [], chunkCalls: () => [], run: async (_prior, snap) => spec.run(snap, grounding) }]
			: [{
				id: 'judge', kind: 'model', after: [], onCallFailure: 'fail-review', chunkCalls: () => [],
				singleCalls: () => [{ messages: spec.controllerPrompt(grounding), schema: CONTROLLER_FINDINGS_SCHEMA, execution: { mode: 'structured', cwd: subject.repoPath } }],
			}],
		finish: (outputs, ctx) => {
			if (outputs['run'] !== undefined) return outputs['run'] as DimensionResult;
			const failed = ctx.notJudged.find(n => n.stage === 'run');
			if (failed !== undefined) {
				return { dimension: spec.dimension, findings: [{ dimension: spec.dimension, severity: 'LOW', location: `${spec.dimension}:stage`, message: `${spec.dimension} failed: ${failed.detail ?? failed.cause}`, confidence: 'observation' }] };
			}
			const answer = singleAnswer(outputs, 'judge', spec.dimension, ctx.divided) as { findings: DimensionResult['findings'] };
			return { dimension: spec.dimension, findings: answer.findings.map(f => ({ ...f, dimension: spec.dimension })) };
		},
	};
}

/** Run one dimension as a pipeline job on the daemon path: the snapshot from the
 *  run's context (taken once by runCodeReview), else taken now. */
export async function runDimensionJob(
	build: (snapshot: ReviewMaterialSnapshot) => ReviewAdapter<DimensionResult>,
	subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider, ctx: JudgeContext | undefined,
): Promise<DimensionResult> {
	const snapshot = ctx?.snapshot ?? codeReviewSnapshot(subject, grounding, ctx?.groundingMode ?? 'full');
	// The core is written over ReviewAdapter<unknown>; merge's parameter makes R invariant.
	const adapter = build(snapshot) as unknown as ReviewAdapter<unknown>;
	const job = createReviewJob(adapter, 'daemon', snapshot, reviewLimitChars());
	return await runReviewJob(job, adapter, provider, { signal: ctx?.signal }) as DimensionResult;
}
