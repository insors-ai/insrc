import { availableParallelism, loadavg } from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { LLMProvider, ReviewSessionOpts, BoundedReviewSessionOpts } from './types.js';

export const REVIEW_INACTIVITY_MS = 30 * 60_000;
export interface ReviewActivityEvent {
 readonly sessionId: string;
 readonly sequence: number;
 readonly kind: 'session_started' | 'model_output' | 'tool_started' | 'tool_completed' | 'feedback_submitted' | 'heartbeat';
 readonly toolId?: string | undefined;
}
export interface ReviewPressure { readonly eventLoopDelayMs?: number | undefined; readonly normalizedLoad?: number | undefined; }
export interface ReviewActivitySnapshot {
 readonly activityAgeMs: number;
 readonly inactivityRemainingMs: number;
 readonly phase: 'awaiting_model' | 'tool_running' | 'feedback_pending';
 readonly tools: readonly { sessionId: string; toolId: string; elapsedMs: number }[];
 readonly pressure: ReviewPressure;
 readonly localContentionObserved: boolean;
 readonly diagnostic: 'local_contention_observed' | 'remote_or_model_wait_unconfirmed' | 'inactivity_cause_unknown' | 'tool_running_no_observed_progress';
}
export class ReviewActivityUnsupportedError extends Error {
 constructor() { super('Provider does not support activity-supervised task reviews'); this.name = 'ReviewActivityUnsupportedError'; }
}
export class ReviewInactivityError extends Error {
 constructor(readonly snapshot: ReviewActivitySnapshot) { super('Review has no observed activity for 30 minutes'); this.name = 'ReviewInactivityError'; }
}
/** Shared boundary validation, including JS callers that can bypass the type union. */
export function validateReviewSessionOptions(opts: ReviewSessionOpts): void {
 if (opts.mode === 'activity') {
  if (opts.inactivityMs !== REVIEW_INACTIVITY_MS || opts.internalRetry !== false || !(opts.signal instanceof AbortSignal)
   || typeof opts.onActivity !== 'function' || typeof opts.onCandidate !== 'function'
   || 'deadlineMs' in opts || 'stallMs' in opts || 'reviewBudget' in opts) throw new TypeError('Invalid activity review execution options');
 } else if ((opts.mode !== undefined && opts.mode !== 'bounded') || !Number.isFinite(opts.deadlineMs) || opts.deadlineMs <= 0
  || opts.stallMs !== undefined && (!Number.isFinite(opts.stallMs) || opts.stallMs <= 0)
  || 'inactivityMs' in opts || 'onActivity' in opts || 'onCandidate' in opts) throw new TypeError('Invalid bounded review execution options');
}
export function requireReviewActivity(provider: Pick<LLMProvider, 'capabilities' | 'runReviewSession'>): void {
 if (provider.capabilities.reviewActivity !== true || !provider.runReviewSession) throw new ReviewActivityUnsupportedError();
}
/** Provider boundary until its native activity adapter is implemented. */
export function requireBoundedReview(opts: ReviewSessionOpts): asserts opts is BoundedReviewSessionOpts {
 validateReviewSessionOptions(opts);
 if (opts.mode === 'activity') throw new ReviewActivityUnsupportedError();
}
export interface ReviewActivityMonitorDeps {
 readonly now?: (() => number) | undefined;
 readonly timer?: ((callback: () => void, ms: number) => () => void) | undefined;
 readonly pressure?: (() => ReviewPressure) | undefined;
}
/** One monitor per task execution. Native session/event IDs prevent duplicate renewal. */
export class ReviewActivityMonitor {
 private readonly now: () => number;
 private lastActivity: number;
 private cancelTimer: (() => void) | undefined;
 private stopped = false;
 private feedback = false;
 private readonly sessions = new Map<string, number>();
 private readonly tools = new Map<string, {sessionId: string; toolId: string; startedAt: number}>();
 private readonly histogram: ReturnType<typeof monitorEventLoopDelay> | undefined;
 constructor(private readonly onInactive: (error: ReviewInactivityError) => void, private readonly deps: ReviewActivityMonitorDeps = {}) {
  this.now = deps.now ?? (() => performance.now()); this.lastActivity = this.now();
  if (!deps.pressure) { this.histogram = monitorEventLoopDelay({resolution: 20}); this.histogram.enable(); }
  this.arm();
 }
 observe(event: ReviewActivityEvent): boolean {
  if (this.stopped || event.kind === 'heartbeat') return false;
  if (!event.sessionId || event.sessionId.length > 256 || !Number.isSafeInteger(event.sequence) || event.sequence < 1) return false;
  const sequence = this.sessions.get(event.sessionId);
  if (sequence !== undefined && event.sequence <= sequence) return false;
  if (sequence === undefined && (event.kind !== 'session_started' || this.sessions.size >= 8)) return false;
  if (sequence !== undefined && event.kind === 'session_started') return false;
  const isTool = event.kind === 'tool_started' || event.kind === 'tool_completed';
  if (isTool && (!event.toolId || event.toolId.length > 256)) return false;
  if (!['session_started','model_output','tool_started','tool_completed','feedback_submitted'].includes(event.kind)) return false;
  const key = JSON.stringify([event.sessionId, event.toolId]);
  if (event.kind === 'tool_started' && (this.tools.has(key) || this.tools.size >= 128)) return false;
  if (event.kind === 'tool_completed' && !this.tools.has(key)) return false;
  if (event.kind === 'tool_started') this.tools.set(key, {sessionId:event.sessionId,toolId:event.toolId!,startedAt:this.now()});
  if (event.kind === 'tool_completed') this.tools.delete(key);
  this.sessions.set(event.sessionId, event.sequence); this.feedback = event.kind === 'feedback_submitted';
  this.lastActivity = this.now(); this.histogram?.reset(); this.arm(); return true;
 }
 snapshot(): ReviewActivitySnapshot {
  const now = this.now(), age = Math.max(0, now - this.lastActivity);
  let pressure: ReviewPressure = {};
  try { pressure = this.deps.pressure?.() ?? {eventLoopDelayMs:(this.histogram?.max ?? 0)/1e6,normalizedLoad:loadavg()[0]!/availableParallelism()}; } catch { /* unavailable, never a guessed cause */ }
  const delay = pressure.eventLoopDelayMs, load = pressure.normalizedLoad;
  const validDelay = delay !== undefined && Number.isFinite(delay) && delay >= 0;
  const validLoad = load !== undefined && Number.isFinite(load) && load >= 0;
  pressure = {...(validDelay?{eventLoopDelayMs:delay}:{}),...(validLoad?{normalizedLoad:load}:{})};
  const local = validDelay && delay >= 1000 || validLoad && load >= 1;
  return {activityAgeMs:age,inactivityRemainingMs:Math.max(0,REVIEW_INACTIVITY_MS-age),phase:this.tools.size?'tool_running':this.feedback?'feedback_pending':'awaiting_model',
   tools:[...this.tools.values()].map(tool=>({sessionId:tool.sessionId,toolId:tool.toolId,elapsedMs:Math.max(0,now-tool.startedAt)})),pressure,localContentionObserved:local,
   diagnostic:this.tools.size?'tool_running_no_observed_progress':local?'local_contention_observed':validDelay&&validLoad?'remote_or_model_wait_unconfirmed':'inactivity_cause_unknown'};
 }
 stop(): void { this.stopped = true; this.cancelTimer?.(); this.cancelTimer = undefined; this.histogram?.disable(); }
 private arm(): void {
  this.cancelTimer?.();
  const wake = () => {
   if (this.stopped) return;
   const snapshot = this.snapshot();
   if (snapshot.inactivityRemainingMs > 0) { this.arm(); return; }
   this.stop(); this.onInactive(new ReviewInactivityError(snapshot));
  };
  const ms = Math.max(0, REVIEW_INACTIVITY_MS - (this.now()-this.lastActivity));
  if (this.deps.timer) this.cancelTimer = this.deps.timer(wake, ms);
  else { const timer = setTimeout(wake, ms); timer.unref(); this.cancelTimer = () => clearTimeout(timer); }
 }
}
