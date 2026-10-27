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
import type { CodeReviewGrounding, CodeReviewSubject, ChangedSymbolSummary, DimensionFinding, DimensionResult, JudgeContext, ReviewDimension } from '../code-review/types.js';
import { codeReviewMaterial, neighbourSummary } from './adapters/code-review-material.js';
import { chunkCall, validateChunk, type ChunkSpec } from './adapters/code-review-chunk.js';
import { compareStage, pairStage } from './adapters/code-review-duplicates.js';
import { DIFF_PARENT_QUALITY, withDiffParents } from './adapters/diff-parent-evidence.js';
import { fitDiffMaterial } from './adapters/diff-fragments.js';
import { envelopeMessages, envelopeSchema, promptChars } from './envelope.js';
import { codeReviewGather } from './adapters/code-review-gather.js';
import type { DimensionObligations } from './adapters/code-review-obligations.js';
import { runReviewJob } from './driver.js';
import { getLogger } from '../../shared/logger.js';
import { createReviewJob, immutableReviewSnapshot, pipelineCallsOf, withCorrectionNote } from './job.js';
import { activateDimensionTiming, assertReviewTime, createReviewTimingPlan } from './timing.js';
import { reviewLimitChars } from './limit.js';
import { structuredLimits } from '../review/call-limits.js';
import type { DiffRevisionRange, AdapterStage, ReviewAdapter, ReviewMaterial, ReviewMaterialSnapshot, ReviewPath, ReviewPipelineJob, StageAnswer } from './types.js';

const log = getLogger('review-pipeline:code-review');

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
	return immutableReviewSnapshot({ kind: 'code-review', grounding: facts, fileFacts });
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
	/** A divided review's chunk call (Story s3): notes only (adherence, functional coverage,
	 *  conventions), symbol coverage plus notes (coverage), or findings plus descriptions
	 *  (quality). Absent: the dimension has no chunk call. */
	readonly chunk?: ChunkSpec | undefined;
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

/** The one answer of a single-call stage. A deterministic dimension's controller prompt is never
 *  divided into chunks (it has no atoms), so a divided one cannot be finished here. */
function singleAnswer(outputs: Readonly<Record<string, unknown>>, stage: string, dimension: string, divided: boolean): unknown {
	if (divided) {
		throw new Error(`code review ${dimension}: the dimension's single call is over the review.chunkTokens limit, and dividing a code review is not available yet. No review was recorded.`);
	}
	const answers = outputs[stage] as readonly StageAnswer[] | undefined;
	if (answers === undefined || answers.length !== 1) throw new Error(`code review ${dimension}: expected one answer, got ${answers?.length ?? 0}`);
	return answers[0]!.answer;
}

/** A model dimension's adapter, built from the subject and the job's snapshot. */
/** The repo-relative file of a `file:line` location. */
function fileOfLocation(location: string): string {
	const i = location.indexOf(':');
	return i >= 0 ? location.slice(0, i) : location;
}

/** The findings a divided review's chunks reported, in stage order (coverage's symbol findings,
 *  quality's findings, then quality's pair findings); notes-only chunks report none. */
function chunkFindings(outputs: Readonly<Record<string, unknown>>, dimension: ReviewDimension): DimensionFinding[] {
	return ['judge', 'pair'].flatMap(stage => ((outputs[stage] ?? []) as readonly StageAnswer[])
		.flatMap(a => ((a.answer as { findings?: readonly Omit<DimensionFinding, 'dimension'>[] }).findings ?? []).map(f => ({ ...f, dimension }))));
}

/**
 * A model dimension's adapter, built from the subject and the job's snapshot. `path` is the
 * job's: a divided review's out-of-set findings are dropped on the daemon path and kept in
 * outOfScope on the controller path, as each path does today.
 */
export function modelDimensionAdapter<O>(spec: ModelDimensionSpec<O>, subject: CodeReviewSubject, snapshot: ReviewMaterialSnapshot, limitChars: number = reviewLimitChars(), path: ReviewPath = 'daemon'): ReviewAdapter<DimensionResult> {
	const { grounding, groundingMode } = groundingOf(snapshot);
	const execution = { mode: 'structured' as const, ...(groundingMode === 'degraded' ? { inputContext: 'isolated' as const } : {}), cwd: subject.repoPath, ...structuredLimits('code-review') };
	// Story s2: the dimension's rows as whole atoms with their relations; Story s3: its
	// obligations and their context. From the snapshot and the saved subject only, so it
	// is built once and every caller reads the same material: the pipeline asks for it
	// on every chunk, relation and validation call, and rebuilding it each time froze
	// the daemon on a large review (ISSUE-2f4cb54c).
	let built: ReviewMaterial | undefined;
	const material = (): ReviewMaterial => {
		if (built !== undefined) return built;
		const source = spec.materialGrounding?.(grounding, groundingMode) ?? grounding;
		const assemble = (view: CodeReviewGrounding): ReviewMaterial => {
			const base = codeReviewMaterial(view, { parentQuality: spec.chunk?.kind === 'quality' }), own = spec.obligations?.(base);
			return own === undefined ? base : { ...base, obligations: own.obligations, ...(own.context.length > 0 ? { context: own.context } : {}) };
		};
		const chunk = spec.chunk;
		built = groundingMode === 'degraded' && chunk !== undefined && spec.skip === undefined
			? fitDiffMaterial(source, limitChars, assemble, (atom, view) => {
				// The exact singleton call: its complete context and schema, without unrelated row scans.
				const prompt = chunkCall(withDiffParents(chunk, view), { id: 'c0000', atomIds: [atom.id], neighbours: [], chars: 0 }, { ...view, atoms: [atom] }, execution);
				const id = '00000000-0000-0000-0000-000000000000';
				return promptChars(envelopeMessages(id, prompt.messages), envelopeSchema(id, prompt.schema));
			}) : assemble(source);
		return built;
	};
	const singleSchema = JSON.stringify(spec.schema);
	// A divided review's merged findings through today's result filters, applied once over the whole.
	const changed = new Set(subject.changedFiles);
	const finalize = (findings: readonly DimensionFinding[]): DimensionResult => {
		const result = spec.toResult({ findings } as unknown as O, grounding, groundingMode);
		if (path !== 'controller') return result;
		// The controller step's handler splits a dimension's findings into findings and outOfScope
		// itself, as today (it rebuilds outOfScope from the findings it is given): hand it the
		// out-of-set findings too, after today's other filters.
		const outOfSet = findings.filter(f => !changed.has(fileOfLocation(f.location)));
		return { ...result, findings: [...result.findings, ...outOfSet] };
	};
	const stages = (stagePath: ReviewPath): readonly AdapterStage[] => {
		if (spec.skip !== undefined) {
			// No call: the dimension's result is known without the model, on either path.
			return [{ id: 'skip', kind: 'deterministic', after: [], onCallFailure: 'fail-review', singleCalls: () => [], chunkCalls: () => [], run: async () => spec.skip!() }];
		}
		void stagePath;
		const chunkSpec = spec.chunk;
		const judge: AdapterStage = {
			id: 'judge', kind: 'model', after: [], onCallFailure: 'fail-review',
			singleCalls: () => [{ messages: spec.prompt(grounding, groundingMode, undefined), schema: spec.schema, execution }],
			chunkCalls: chunk => chunkSpec !== undefined ? [chunkCall(withDiffParents(chunkSpec, material()), chunk, material(), execution)] : [],
			// A chunk answer is checked against the obligations and the atoms its call carried.
			validate: (answer, call) => call.role === 'chunk' && chunkSpec !== undefined ? validateChunk(withDiffParents(chunkSpec, material()), answer, call, material()) : [],
			// Today's correction for today's call: the prompt rebuilt with withStructuredRetry's note.
			// A chunk call keeps its own prompt, with the reasons appended.
			withCorrection: (prompt, reasons) => JSON.stringify(prompt.schema) === singleSchema
				? { ...prompt, messages: spec.prompt(grounding, groundingMode, buildRetryNote(reasons)) }
				: withCorrectionNote(prompt, reasons),
		};
		// Story s3: quality compares descriptions across chunks, then judges each candidate pair.
		if (chunkSpec?.kind !== 'quality') return [judge];
		const dup = { material, execution, limitChars, schema: spec.schema, chunkStage: judge.id };
		return [judge, compareStage(dup), pairStage(dup)];
	};
	return {
		kind: 'code-review', dimension: spec.dimension,
		get requiresChunking() { return spec.chunk?.kind === 'quality' && material().obligations.some(o => o.key.startsWith(DIFF_PARENT_QUALITY)); },
		material,
		neighbourSummary,
		stagesFor: stages,
		// Story s3: a divided review judges each obligation once, over every chunk's notes.
		...(spec.chunk !== undefined && spec.skip === undefined
			? { gather: codeReviewGather({ dimension: spec.dimension, chunk: spec.chunk, schema: spec.schema, material, execution, limitChars, changedFiles: subject.changedFiles, finalize }) }
			: {}),
		finish: (outputs, ctx) => {
			if (spec.skip !== undefined) return outputs['skip'] as DimensionResult;
			// Divided: the chunks' own findings, the first part gather.merge joins (and filters) with the rest.
			if (ctx.divided) return { dimension: spec.dimension, findings: chunkFindings(outputs, spec.dimension) };
			return spec.toResult(singleAnswer(outputs, 'judge', spec.dimension, false) as O, grounding, groundingMode);
		},
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
				singleCalls: () => [{ messages: spec.controllerPrompt(grounding), schema: CONTROLLER_FINDINGS_SCHEMA, execution: { mode: 'structured', cwd: subject.repoPath, ...structuredLimits('code-review') } }],
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
export interface PreparedDimensionReview {
 readonly dimension: ReviewDimension;
 readonly snapshot: ReviewMaterialSnapshot;
 readonly adapter: ReviewAdapter<unknown>;
 readonly job: ReviewPipelineJob;
 readonly primaryChunkCount: number;
 readonly primaryChunkIds: readonly string[];
 readonly preparedAt: number;
 readonly subject: CodeReviewSubject;
 readonly reprepare: (limitChars: number, now: number) => PreparedDimensionReview;
}

/** The cap is selected once, before material fitting and any model work. */
export function effectiveDimensionLimit(provider: LLMProvider, mode: 'full' | 'degraded', configured = reviewLimitChars()): number {
 const cap = mode === 'degraded' ? Math.min(configured, 384_000, provider.inputBudgetChars ?? Infinity) : configured;
 if (!Number.isSafeInteger(cap) || cap <= 0) throw new Error('Invalid effective review input limit');
 return cap;
}

export function prepareDimensionJob(
 build: (snapshot: ReviewMaterialSnapshot, effectiveLimitChars: number) => ReviewAdapter<DimensionResult>,
 subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider, ctx: JudgeContext | undefined,
 replacementLimit?: number,
): PreparedDimensionReview {
 const preparedAt = (ctx?.now ?? Date.now)();
 const snapshot = immutableReviewSnapshot(ctx?.snapshot ?? codeReviewSnapshot(subject, grounding, ctx?.groundingMode ?? 'full'));
 const limit = replacementLimit ?? effectiveDimensionLimit(provider, ctx?.groundingMode ?? 'full');
 const adapter = build(snapshot, limit) as unknown as ReviewAdapter<unknown>;
 const job = createReviewJob(adapter, 'daemon', snapshot, limit, { now: preparedAt });
 const model = adapter.stagesFor('daemon').some(stage => stage.kind === 'model');
 const primaryChunkCount = model ? Math.max(1, job.plan.chunks.length) : 0;
 const primaryChunkIds = Object.freeze(primaryChunkCount === 0 ? [] : job.plan.single || job.plan.chunks.length === 0 ? [`${job.dimension}:single`] : job.plan.chunks.map(c => `${job.dimension}:${c.id}`));
 logPlan('prepared', job, subject);
 return Object.freeze({ dimension: job.dimension as ReviewDimension, snapshot: job.snapshot, adapter, job, primaryChunkCount, primaryChunkIds, preparedAt, subject,
  reprepare: (lower: number, at: number) => {
   if (!Number.isSafeInteger(lower) || lower <= 0 || lower >= limit) throw new Error('Diff material replacement must lower the input cap');
   return prepareDimensionJob(build, subject, grounding, provider, { ...ctx, snapshot, now: () => at, groundingMode: ctx?.groundingMode ?? 'full' }, lower);
  } });
}

export async function executeDimensionJob(prepared: PreparedDimensionReview, provider: LLMProvider, ctx?: JudgeContext): Promise<DimensionResult> {
 const now = ctx?.now ?? Date.now;
 const root = ctx?.timing ?? createReviewTimingPlan([prepared], prepared.preparedAt);
 const job = activateDimensionTiming(prepared, root, now());
 let completed: ReviewPipelineJob | undefined;
 const output = await runReviewJob(job, prepared.adapter, provider, { now, signal: ctx?.signal, onCall: ctx?.onCall,
  onMaterialRefusal: (old, adapter, call, reported, at) => {
   if (ctx?.groundingMode !== 'degraded' || call.stage !== 'judge' || (call.role !== 'single' && call.role !== 'chunk')) return undefined;
   const carried = new Set(call.role === 'single' ? adapter.material().atoms.map(a => a.id) : call.carries.atomIds);
   const text = adapter.material().atoms.some(a => carried.has(a.id) && (JSON.parse(a.text) as ChangedSymbolSummary).diffFragment !== undefined);
   if (!text) return undefined;
   assertReviewTime({ deadlineAt: old.timing!.deadlineAt }, at);
   const limit = Math.min(old.plan.limitChars - 1, reported ?? Math.floor(call.chars / 2), call.chars - 1);
   const rebuilt = prepared.reprepare(limit, at);
   assertReviewTime({ deadlineAt: old.timing!.deadlineAt }, now());
   const descendantRanges = diffRanges(rebuilt.adapter.material());
   const originalRanges = new Map(diffRanges(prepared.adapter.material()).map(r => [r.atomId, r]));
   const initialPrimary = prepared.job.plan.chunks.length === 0
    ? [{ id: prepared.primaryChunkIds[0]!, ranges: [...originalRanges.values()] }]
    : prepared.job.plan.chunks.map(c => ({ id: `${prepared.dimension}:${c.id}`, ranges: c.atomIds.flatMap(id => originalRanges.has(id) ? [originalRanges.get(id)!] : []) }));
   const revision = { fromReviewId: old.reviewId, toReviewId: rebuilt.job.reviewId, fromMaterialHash: old.materialHash,
    toMaterialHash: rebuilt.job.materialHash, refusedCallId: call.callId, limitChars: limit, timing: old.timing!, initialPrimary, descendantRanges };
   if (old.materialHash === rebuilt.job.materialHash) throw new Error('Diff refusal replacement made no material progress');
   log.info({ dimension: old.dimension, from: old.reviewId, to: rebuilt.job.reviewId, limitChars: limit }, 'review pipeline: restarting dimension from complete descendant diff material');
   return { adapter: rebuilt.adapter, job: { ...rebuilt.job, timing: old.timing, deadlineAt: old.deadlineAt, deadlineBudgetMs: old.deadlineBudgetMs,
    materialRevisions: [...(old.materialRevisions ?? []), revision] } };
  },
  onDone: done => { completed = done; logPlan('finished', done, prepared.subject); },
 }) as DimensionResult;
 return completed?.materialRevisions === undefined ? output : { ...output, materialRevisions: completed.materialRevisions };
}

function diffRanges(material: ReviewMaterial): DiffRevisionRange[] {
 return material.atoms.flatMap(a => {
  const row = JSON.parse(a.text) as ChangedSymbolSummary, part = row.diffFragment;
  return part === undefined ? [] : [{ atomId: a.id, parentId: part.parentId, startOffset: part.startOffset, endOffset: part.endOffset, parentDigest: part.parentDigest }];
 });
}

/** Compatibility entry point for callers running one dimension directly. */
export async function runDimensionJob(
 build: (snapshot: ReviewMaterialSnapshot, effectiveLimitChars: number) => ReviewAdapter<DimensionResult>,
 subject: CodeReviewSubject, grounding: CodeReviewGrounding, provider: LLMProvider, ctx: JudgeContext | undefined,
): Promise<DimensionResult> {
 return executeDimensionJob(prepareDimensionJob(build, subject, grounding, provider, ctx), provider, ctx);
}

function logPlan(phase: 'prepared' | 'finished', job: ReviewPipelineJob, subject: CodeReviewSubject): void {
	const plan = {
		phase, epicHash: subject.epicHash, storyId: subject.storyId, dimension: job.dimension, reviewId: job.reviewId,
		single: job.plan.single, limitChars: job.plan.limitChars,
		chunks: job.plan.chunks.map(c => ({ id: c.id, atoms: c.atomIds.length, chars: c.chars })),
		...(phase === 'finished' ? { pipelineCalls: pipelineCallsOf(job) ?? null } : {}),
	};
	log.info(`review pipeline: plan ${JSON.stringify(plan)}`);
}
