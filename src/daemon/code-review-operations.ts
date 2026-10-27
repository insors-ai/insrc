/** Daemon-memory ownership for resumable code reviews. Request waiters never own model execution. */
import { randomUUID } from 'node:crypto';
import type { CodeReviewControlResult, CodeReviewStreamResult } from '../shared/review-stream.js';
import type { CodeReviewProgress } from '../workflow/code-review/runner.js';
import type { ReviewInputFingerprint, ReviewTimingPlan } from '../workflow/code-review/types.js';
import { isReviewInputFingerprint } from '../workflow/code-review/input-fingerprint.js';
import { reviewTimerSlice } from '../workflow/review-pipeline/timing.js';

export const CODE_REVIEW_CONTROL_WAIT_MS = 200_000;
export const CODE_REVIEW_TERMINAL_GRACE_MS = 600_000;
const DEFAULT_IDLE_MS = 1_200_000;
export interface ReviewOperationTarget { readonly repo: string; readonly epicHash: string; readonly storyId: string }
export type CodeReviewOperationResult = CodeReviewControlResult;

export class ReviewOperationError extends Error {
 constructor(readonly code: string, message: string) { super(message); this.name = 'ReviewOperationError'; }
}
interface StartOperation {
 readonly fingerprint: ReviewInputFingerprint;
 readonly inputKey?: string | undefined;
 readonly startedAt: number;
 readonly execute: (signal: AbortSignal, progress: (frame: CodeReviewProgress) => void) => Promise<CodeReviewStreamResult>;
 readonly validateDone?: (() => void) | undefined;
}
interface Operation {
 readonly handle: string;
 readonly key: string;
 readonly inputKey: string;
 readonly fingerprint: ReviewInputFingerprint;
 readonly controller: AbortController;
 readonly startedAt: number;
 readonly validateDone?: (() => void) | undefined;
 progress: CodeReviewProgress[];
 timing?: ReviewTimingPlan | undefined;
 lastProgressAt: number;
 timer?: unknown;
 terminal?: CodeReviewOperationResult | undefined;
 terminalAt?: number | undefined;
 stopReason?: ReviewOperationError | undefined;
 cancelRequested: boolean;
 work: Promise<void>;
}
interface RegistryOptions {
 readonly now?: (() => number) | undefined;
 readonly setTimer?: ((fn: () => void, ms: number) => unknown) | undefined;
 readonly clearTimer?: ((timer: unknown) => void) | undefined;
 readonly idleMs?: number | undefined;
 readonly epoch?: string | undefined;
}
const keyOf = (target: ReviewOperationTarget): string => {
 const ordinal = /^s([0-9]+)$/i.exec(target.storyId)?.[1];
 if (ordinal === undefined) throw new ReviewOperationError('review-target-mismatch', 'Invalid review target Story');
 return JSON.stringify([target.repo, target.epicHash, BigInt(ordinal).toString()]);
};
const message = (err: unknown): string => err instanceof Error ? err.message : String(err);
const reason = (err: unknown): string => err instanceof Error && 'code' in err && typeof err.code === 'string' ? err.code : 'review-failed';
function abortError(): Error { const error = new Error('Review waiter aborted; operation remains owned by the daemon'); error.name = 'AbortError'; return error; }

export class CodeReviewOperationRegistry {
 readonly epoch: string;
 private readonly operations = new Map<string, Operation>();
 private readonly targets = new Map<string, Operation>();
 private readonly now: () => number;
 private readonly setTimer: (fn: () => void, ms: number) => unknown;
 private readonly clearTimer: (timer: unknown) => void;
 private readonly idleMs: number;
 private closed = false;
 constructor(options: RegistryOptions = {}) {
  this.epoch = options.epoch ?? randomUUID(); this.now = options.now ?? Date.now;
  this.setTimer = options.setTimer ?? ((fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; });
  this.clearTimer = options.clearTimer ?? (timer => clearTimeout(timer as NodeJS.Timeout));
  this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  if (!Number.isSafeInteger(this.idleMs) || this.idleMs <= 0) throw new Error('Invalid code review idle limit');
 }
 start(input: StartOperation): string {
  if (this.closed) throw new ReviewOperationError('review-operation-lost', 'The daemon review registry is closed; start a new review');
  if (!isReviewInputFingerprint(input.fingerprint) || !Number.isSafeInteger(input.startedAt) || input.startedAt < 0) throw new ReviewOperationError('review-input-unavailable', 'Invalid admitted review identity');
  this.sweep();
  const key = keyOf({ repo: input.fingerprint.repoPath, epicHash: input.fingerprint.epicHash, storyId: input.fingerprint.storyId });
  const inputKey = input.inputKey ?? input.fingerprint.digest, prior = this.targets.get(key);
  if (prior !== undefined) {
   if (prior.inputKey === inputKey && prior.fingerprint.digest === input.fingerprint.digest && (prior.terminal === undefined || prior.terminal.status === 'done')) return prior.handle;
   if (prior.terminal === undefined) throw new ReviewOperationError('review-conflict', 'This target has an active independent review of different inputs');
  }
  const handle = `${this.epoch}.${randomUUID()}`;
  const op: Operation = { handle, key, inputKey, fingerprint: Object.freeze(structuredClone(input.fingerprint)), controller: new AbortController(), startedAt: input.startedAt,
   progress: [], lastProgressAt: this.now(), cancelRequested: false, work: Promise.resolve(), ...(input.validateDone !== undefined ? { validateDone: input.validateDone } : {}) };
  this.operations.set(handle, op); this.targets.set(key, op); this.arm(op);
  // The registry, rather than the initiating request, retains this promise and AbortController.
  op.work = Promise.resolve().then(async () => {
   try {
    if (op.controller.signal.aborted) throw op.stopReason ?? abortError();
    const result = await input.execute(op.controller.signal, frame => this.progress(op, frame));
    if (op.controller.signal.aborted) throw op.stopReason ?? abortError();
    input.validateDone?.();
    op.terminal = { daemonEpoch: this.epoch, status: 'done', reviewHandle: handle, result };
   } catch (err) {
    op.terminal = op.cancelRequested ? { daemonEpoch: this.epoch, status: 'cancelled', reviewHandle: handle } : { daemonEpoch: this.epoch, status: 'failed', reviewHandle: handle, error: message(op.stopReason ?? err), reason: reason(op.stopReason ?? err) };
   } finally {
    if (op.timer !== undefined) this.clearTimer(op.timer);
    op.terminalAt = this.now();
    op.timer = this.setTimer(() => this.sweep(), CODE_REVIEW_TERMINAL_GRACE_MS);
   }
  });
  return handle;
 }
 private progress(op: Operation, frame: CodeReviewProgress): void {
  if (op.terminal !== undefined || op.controller.signal.aborted) return;
  if (frame.timing !== undefined) {
   const plan = frame.timing;
   if (!Number.isSafeInteger(plan.chunkCount) || plan.chunkCount < 1 || !Number.isSafeInteger(plan.budgetMs) || plan.budgetMs !== plan.chunkCount * 600_000 || !Number.isSafeInteger(plan.deadlineAt) || plan.deadlineAt !== plan.startedAt + plan.budgetMs || plan.startedAt !== op.startedAt) throw new ReviewOperationError('review-protocol', 'Invalid chunk-derived operation timing');
   if (op.timing !== undefined && JSON.stringify(op.timing) !== JSON.stringify(plan)) throw new ReviewOperationError('review-protocol', 'The operation timing plan cannot be extended');
   op.timing ??= structuredClone(plan);
  }
  op.progress = [...op.progress.slice(-31), { phase: frame.phase, ...(frame.dimension !== undefined ? { dimension: frame.dimension } : {}), ...(frame.detail !== undefined ? { detail: frame.detail } : {}) }];
  op.lastProgressAt = this.now(); this.arm(op);
 }
 private arm(op: Operation): void {
  if (op.timer !== undefined) this.clearTimer(op.timer);
  const end = Math.min(op.lastProgressAt + this.idleMs, op.timing?.deadlineAt ?? Infinity);
  const delay = reviewTimerSlice(end, this.now());
  op.timer = this.setTimer(() => {
   if (op.terminal !== undefined || op.controller.signal.aborted) return;
   const now = this.now();
   if (op.timing !== undefined && now >= op.timing.deadlineAt) this.stop(op, new ReviewOperationError('review-deadline', 'Code review exhausted its fixed chunk-derived deadline'));
   else if (now >= op.lastProgressAt + this.idleMs) this.stop(op, new ReviewOperationError('review-idle', 'Code review made no progress before its idle limit'));
   else this.arm(op);
  }, delay);
 }
 private stop(op: Operation, error: ReviewOperationError): void { op.stopReason ??= error; op.controller.abort(error); }
 private get(handle: string, target: ReviewOperationTarget): Operation {
  this.sweep(); const op = this.operations.get(handle);
  if (op === undefined) throw new ReviewOperationError('review-operation-lost', 'Review handle was lost after daemon restart, expiry or completion cleanup; start a new review');
  if (op.key !== keyOf(target)) throw new ReviewOperationError('review-target-mismatch', 'Review handle does not belong to this repository and Story');
  return op;
 }
 status(handle: string, target: ReviewOperationTarget): CodeReviewOperationResult {
  const op = this.get(handle, target);
  if (op.terminal?.status === 'done') {
   try { op.validateDone?.(); } catch (err) { return { daemonEpoch: this.epoch, status: 'failed', reviewHandle: handle, error: message(err), reason: reason(err) }; }
  }
  return op.terminal !== undefined ? structuredClone(op.terminal) : { daemonEpoch: this.epoch, status: 'pending', reviewHandle: handle, progress: structuredClone(op.progress), ...(op.timing !== undefined ? { timing: structuredClone(op.timing) } : {}) };
 }
 async wait(handle: string, target: ReviewOperationTarget, options: { readonly signal?: AbortSignal | undefined; readonly waitMs?: number | undefined } = {}): Promise<CodeReviewOperationResult> {
  const op = this.get(handle, target), wait = options.waitMs ?? CODE_REVIEW_CONTROL_WAIT_MS;
  if (!Number.isSafeInteger(wait) || wait < 0) throw new ReviewOperationError('review-protocol', 'Invalid control wait limit');
  if (options.signal?.aborted) throw abortError();
  if (op.terminal !== undefined || wait === 0) return this.status(handle, target);
  await new Promise<void>((resolve, reject) => {
   let timer: unknown, settled = false;
   const finish = (err?: Error): void => { if (settled) return; settled = true; if (timer !== undefined) this.clearTimer(timer); options.signal?.removeEventListener('abort', onAbort); if (err !== undefined) reject(err); else resolve(); };
   const onAbort = (): void => finish(abortError());
   options.signal?.addEventListener('abort', onAbort, { once: true });
   timer = this.setTimer(() => finish(), Math.min(CODE_REVIEW_CONTROL_WAIT_MS, wait));
   void op.work.then(() => finish());
  });
  return this.status(handle, target);
 }
 async cancel(handle: string, target: ReviewOperationTarget, options: { readonly signal?: AbortSignal | undefined; readonly waitMs?: number | undefined } = {}): Promise<CodeReviewOperationResult> {
  const op = this.get(handle, target);
  if (op.terminal === undefined) { op.cancelRequested = true; this.stop(op, new ReviewOperationError('review-cancelled', 'Independent review explicitly cancelled')); }
  return this.wait(handle, target, options);
 }
 private sweep(): void {
  const now = this.now();
  for (const [handle, op] of this.operations) if (op.terminalAt !== undefined && now >= op.terminalAt + CODE_REVIEW_TERMINAL_GRACE_MS) {
   if (op.timer !== undefined) this.clearTimer(op.timer); this.operations.delete(handle); if (this.targets.get(op.key) === op) this.targets.delete(op.key);
  }
 }
 async close(): Promise<void> {
  this.closed = true;
  for (const op of this.operations.values()) if (op.terminal === undefined) this.stop(op, new ReviewOperationError('review-operation-lost', 'Daemon shutting down'));
  // These promises settle owned work; they do not initiate or overlap provider calls.
  for (const op of this.operations.values()) await op.work;
  for (const op of this.operations.values()) if (op.timer !== undefined) this.clearTimer(op.timer);
  this.operations.clear(); this.targets.clear();
 }
}
export const codeReviewOperations = new CodeReviewOperationRegistry();
