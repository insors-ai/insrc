/** Deterministic, resumable controller driver. No provider call is made here. */
import { canonicalIdentityJson, identityDigest } from '../../../shared/review-input-identity.js';
import type { LLMProvider } from '../../../shared/types.js';
import type { CodeReviewFallbackReason, CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension, ReviewInputFingerprint, ReviewTimingPlan } from '../../../workflow/code-review/types.js';
import { computeExpectedDimensions } from '../../../workflow/code-review/expected-dimensions.js';
import { adherenceSpec } from '../../../workflow/code-review/dimensions/adherence.js';
import { conventionsSpec } from '../../../workflow/code-review/dimensions/conventions.js';
import { coverageSpec } from '../../../workflow/code-review/dimensions/coverage.js';
import { qualitySpec } from '../../../workflow/code-review/dimensions/quality.js';
import { functionalCoverageSpec } from '../../../workflow/code-review/dimensions/functional-coverage.js';
import { prepareDiagram } from '../../../workflow/code-review/dimensions/diagram/index.js';
import { prepareUx } from '../../../workflow/code-review/dimensions/ux/index.js';
import { codeReviewSnapshot, modelDimensionAdapter, prepareDimensionJob, reprepareDiffRefusal } from '../../../workflow/review-pipeline/code-review.js';
import type { PreparedDimensionReview } from '../../../workflow/review-pipeline/code-review.js';
import { applyFailure, applyOutput, assertJobDeadline, nextCalls, result, runStage } from '../../../workflow/review-pipeline/job.js';
import { reviewLimitChars } from '../../../workflow/review-pipeline/limit.js';
import { activateDimensionTiming, assertReviewTime, createReviewTimingPlan } from '../../../workflow/review-pipeline/timing.js';
import { AtomTooLargeError } from '../../../workflow/review-pipeline/pack-into-batches.js';
import type { ReviewAdapter, ReviewMaterialSnapshot, ReviewPipelineJob } from '../../../workflow/review-pipeline/types.js';
import type { CodeReviewStepOutput, CodeReviewStepEmitCall, ControllerCallResult } from './types.js';

/** Internal dependency from the verified MCP execution helper, never a raw tool flag. */
export interface ControllerExecutionCapability { readonly adapterId: 'cli-claude' | 'cli-codex'; readonly maxInputChars: number }
// JSON escaping expands a string by at most six characters per UTF16 unit. Reserve
// fixed task framing before fitting; the actual entire frame is checked again on emission.
const TASK_FRAME_RESERVE = 8192;
export function controllerMaterialLimit(limit: number): number {
 const inner = Math.floor((limit - TASK_FRAME_RESERVE) / 6);
 if (!Number.isSafeInteger(limit) || inner <= 0) throw new AtomTooLargeError('controller task framing', TASK_FRAME_RESERVE, limit);
 return inner;
}
interface StoredDimension {
 readonly dimension: ReviewDimension;
 readonly initialLimit: number;
 readonly materialLimit: number;
 readonly initialJob: ReviewPipelineJob;
 readonly job: ReviewPipelineJob;
 readonly primaryChunkCount: number;
 readonly primaryChunkIds: readonly string[];
}
export interface ControllerPipelineState {
 readonly kind: 'controller-pipeline';
 readonly revision: number;
 readonly repo: string;
 readonly epicHash: string;
 readonly storyId: string;
 readonly subject: CodeReviewSubject;
 readonly snapshot: ReviewMaterialSnapshot;
 readonly fingerprint: ReviewInputFingerprint;
 readonly fallbackReason: CodeReviewFallbackReason;
 readonly capability: ControllerExecutionCapability;
 readonly limitChars: number;
 readonly timing: ReviewTimingPlan;
 readonly dimensions: readonly StoredDimension[];
 readonly cursor: number;
 readonly results: readonly DimensionResult[];
 readonly active?: CodeReviewStepEmitCall['call'] | undefined;
 readonly accepted: readonly { readonly callId: string; readonly digest: string; readonly response: CodeReviewStepOutput }[];
 readonly terminal?: CodeReviewStepOutput | undefined;
}
const specBuilders = {
 adherence: adherenceSpec, conventions: conventionsSpec, coverage: coverageSpec, quality: qualitySpec, 'functional-coverage': functionalCoverageSpec,
};
function groundingOf(snapshot: ReviewMaterialSnapshot): CodeReviewGrounding { return (snapshot.grounding as { grounding: CodeReviewGrounding }).grounding; }
function prepare(dimension: ReviewDimension, subject: CodeReviewSubject, snapshot: ReviewMaterialSnapshot, limit: number, now: number): PreparedDimensionReview {
 // This provider is a budget descriptor only. Every method fails rather than substituting a daemon judgement.
 const provider = { inputBudgetChars: limit, complete: () => { throw new Error('No daemon controller judgments'); }, completeStructured: () => { throw new Error('No daemon controller judgments'); } } as unknown as LLMProvider;
 const ctx = { groundingMode: 'degraded' as const, snapshot, now: () => now };
 if (dimension === 'diagram') return prepareDiagram(subject, groundingOf(snapshot), provider, ctx);
 if (dimension === 'ux') return prepareUx(subject, groundingOf(snapshot), provider, ctx);
 const build = (snap: ReviewMaterialSnapshot, cap: number): ReviewAdapter<DimensionResult> => {
  switch (dimension) {
   case 'adherence': return modelDimensionAdapter(specBuilders.adherence(subject), subject, snap, cap, 'controller');
   case 'conventions': return modelDimensionAdapter(specBuilders.conventions(subject), subject, snap, cap, 'controller');
   case 'coverage': return modelDimensionAdapter(specBuilders.coverage(subject), subject, snap, cap, 'controller');
   case 'quality': return modelDimensionAdapter(specBuilders.quality(subject), subject, snap, cap, 'controller');
   case 'functional-coverage': return modelDimensionAdapter(specBuilders['functional-coverage'](subject), subject, snap, cap, 'controller');
  }
 };
 return prepareDimensionJob(build, subject, groundingOf(snapshot), provider, ctx, limit, 'controller');
}
export function prepareControllerPipeline(subject: CodeReviewSubject, grounding: CodeReviewGrounding, fingerprint: ReviewInputFingerprint, reason: CodeReviewFallbackReason, capability: ControllerExecutionCapability, startedAt: number, now: () => number): ControllerPipelineState {
 if (!['cli-claude', 'cli-codex'].includes(capability.adapterId) || !Number.isSafeInteger(capability.maxInputChars) || capability.maxInputChars <= 0) throw new Error('Unsupported bounded controller capability');
 const limitChars = Math.min(384_000, reviewLimitChars(), capability.maxInputChars), inner = controllerMaterialLimit(limitChars);
 const snapshot = codeReviewSnapshot(subject, grounding, 'degraded');
 const prepared: PreparedDimensionReview[] = [];
 for (const dimension of computeExpectedDimensions(subject)) prepared.push(prepare(dimension, subject, snapshot, inner, now()));
 const timing = createReviewTimingPlan(prepared, startedAt); assertReviewTime(timing, now());
 return { kind: 'controller-pipeline', revision: 0, repo: subject.repoPath, epicHash: subject.epicHash, storyId: subject.storyId, subject, snapshot, fingerprint, fallbackReason: reason, capability, limitChars, timing,
  dimensions: prepared.map(p => ({ dimension: p.dimension, initialLimit: inner, materialLimit: inner, initialJob: p.job, job: p.job, primaryChunkCount: p.primaryChunkCount, primaryChunkIds: p.primaryChunkIds })), cursor: 0, results: [], accepted: [] };
}
function rebuilt(state: ControllerPipelineState, slot: StoredDimension, now: number, initial = false): PreparedDimensionReview {
 const ready = prepare(slot.dimension, state.subject, state.snapshot, initial ? slot.initialLimit : slot.materialLimit, now);
 const saved = initial ? slot.initialJob : slot.job;
 if (ready.job.materialHash !== saved.materialHash) throw new Error('Controller material changed while rebuilding an immutable snapshot');
 return { ...ready, job: saved, primaryChunkCount: slot.primaryChunkCount, primaryChunkIds: slot.primaryChunkIds };
}
/** Serial deterministic work until one identified model call or the completed dimension set. */
export async function advanceControllerPipeline(state: ControllerPipelineState, now: () => number): Promise<ControllerPipelineState> {
 assertReviewTime(state.timing, now());
 if (state.active !== undefined) {
  if (now() >= state.active.expiresAt) throw new Error('Controller call expired; no late answer is accepted');
  return state;
 }
 let cursor = state.cursor; const dimensions = [...state.dimensions], results = [...state.results];
 while (cursor < dimensions.length) {
  const slot = dimensions[cursor]!, ready = rebuilt(state, slot, now());
  let job = activateDimensionTiming(ready, state.timing, now());
  while (job.phase !== 'done') {
   assertJobDeadline(job, ready.adapter, now()); const call = nextCalls(job, ready.adapter, now())[0];
   if (call !== undefined) {
    const allowance = call.execution.mode === 'structured' ? call.execution.timeoutMs : call.execution.deadlineMs;
    const expiresAt = Math.min(job.timing!.deadlineAt, job.timing!.rootDeadlineAt, now() + (allowance ?? (job.timing!.deadlineAt - now())));
    dimensions[cursor] = { ...slot, job };
    return { ...state, dimensions, cursor, results, active: { callId: call.callId, dimension: slot.dimension, stage: call.stage, role: call.role, messages: call.messages, schema: call.schema, limitChars: state.limitChars, expiresAt } };
   }
   job = await runStage(job, ready.adapter, { now }); assertReviewTime(state.timing, now());
  }
  const output = result<DimensionResult>(job);
  results.push(job.materialRevisions === undefined ? output : { ...output, materialRevisions: job.materialRevisions });
  dimensions[cursor] = { ...slot, job }; cursor++;
 }
 return { ...state, cursor, dimensions, results, active: undefined };
}
export function controllerCallFrame(state: ControllerPipelineState, token: string): CodeReviewStepEmitCall {
 if (state.active === undefined) throw new Error('Controller has no active model call');
 // Only compact timing is emitted. The complete primary-ID audit remains private.
 const frame: CodeReviewStepEmitCall = { next: 'emit_review_call', state: token, guidance: 'Execute only this identified task through the admitted fresh isolated CLI helper; return its enveloped answer or failure as callResult. Never add inherited chat context or a second grounding bundle.', call: state.active,
  timing: { startedAt: state.timing.startedAt, chunkCount: state.timing.chunkCount, budgetMs: state.timing.budgetMs, deadlineAt: state.timing.deadlineAt } };
 if (JSON.stringify(frame).length > state.limitChars) throw new Error('Complete emitted controller task exceeds its bounded input cap');
 return frame;
}
export function parseControllerCallResult(value: unknown): ControllerCallResult {
 if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Exactly one identified callResult is required');
 const v = value as Record<string, unknown>;
 if (typeof v['callId'] !== 'string' || v['callId'].length === 0 || Object.keys(v).some(k => !['callId', 'answer', 'failure'].includes(k)) || (Object.hasOwn(v, 'answer') === Object.hasOwn(v, 'failure'))) throw new Error('callResult requires callId and exactly one answer or failure');
 if (Object.hasOwn(v, 'failure')) {
  const f = v['failure'];
  if (typeof f !== 'object' || f === null || Array.isArray(f)) throw new Error('Malformed controller failure');
  const failure = f as Record<string, unknown>;
  if (!['size-refusal', 'invalid-answer', 'transient', 'stall'].includes(String(failure['cause'])) || typeof failure['detail'] !== 'string' || Object.keys(failure).some(k => !['cause', 'detail', 'maxChars'].includes(k)) || (failure['maxChars'] !== undefined && (!Number.isSafeInteger(failure['maxChars']) || (failure['maxChars'] as number) <= 0 || failure['cause'] !== 'size-refusal'))) throw new Error('Malformed controller failure');
 }
 return value as ControllerCallResult;
}
export function controllerAnswerDigest(value: ControllerCallResult): string { return identityDigest(canonicalIdentityJson(value)); }
export async function applyControllerResult(state: ControllerPipelineState, input: ControllerCallResult, now: () => number): Promise<ControllerPipelineState> {
 assertReviewTime(state.timing, now());
 if (state.active === undefined || state.active.callId !== input.callId) throw new Error('Foreign or out-of-order controller callId');
 if (now() >= state.active.expiresAt) throw new Error('Controller call expired; no late answer is accepted');
 const slot = state.dimensions[state.cursor]!, ready = rebuilt(state, slot, now()), call = nextCalls(slot.job, ready.adapter, now())[0];
 if (call === undefined || call.callId !== input.callId) throw new Error('Controller current call does not match its pipeline job');
 let job: ReviewPipelineJob, materialLimit = slot.materialLimit;
 if ('failure' in input && input.failure !== undefined) {
  const reported = input.failure.maxChars;
  if (reported !== undefined && reported >= state.active.limitChars) throw new Error('Size refusal must lower the admitted task cap');
  const cap = reported === undefined ? undefined : controllerMaterialLimit(reported);
  try { job = applyFailure(slot.job, ready.adapter, input.callId, input.failure.cause, cap, { now: now(), detail: input.failure.detail }); }
  catch (err) {
   const initial = rebuilt(state, slot, now(), true);
   const replacement = input.failure.cause === 'size-refusal' && err instanceof AtomTooLargeError ? reprepareDiffRefusal(initial, slot.job, ready.adapter, call, cap, now(), now, 'degraded') : undefined;
   if (replacement === undefined) throw err;
   job = replacement.job; materialLimit = replacement.job.plan.limitChars;
  }
 } else job = applyOutput(slot.job, ready.adapter, input.callId, input.answer, now());
 const dimensions = [...state.dimensions]; dimensions[state.cursor] = { ...slot, job, materialLimit };
 return advanceControllerPipeline({ ...state, revision: state.revision + 1, dimensions, active: undefined }, now);
}
