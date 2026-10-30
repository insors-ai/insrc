/** MCP-local ownership of fresh, isolated controller review calls. No chat transcript enters this path. */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOUNDED_CLI_ADAPTERS, CliProvider, InputTooLargeError } from '../agent/providers/cli-provider.js';
import { verifyBoundedCli, UnsupportedBoundedInputError } from '../agent/providers/bounded-input.js';
import { ModelResponseShapeError } from '../agent/providers/model-call-error.js';
import { assertNoSessionProvider as assertConnectionProviderAdmission } from '../shared/connection-provider-denial.js';
import { resolveControllerReviewRole } from './daemon-stream.js';
import type { ControllerExecutionCapability } from '../shared/controller-review.js';
import type { StepClient } from '../shared/step-context.js';
import type { CodeReviewStepEmitCall, ControllerCallResult } from '../shared/controller-review.js';
import { resolveRepoPath } from './resolve-repo.js';
import { privateSessionBootstrap } from './session-bootstrap.js';
import type { ForwardStepExtra, StepMcpEnvelope } from './forward-step.js';

export interface ControllerReviewAdmission { readonly capability: ControllerExecutionCapability; readonly client: StepClient }
const verifiedAdmissions = new WeakSet<object>();
/** Only descriptors minted after the actual local CLI probe can cross the forwarder. */
export function isVerifiedControllerAdmission(value: unknown): value is ControllerReviewAdmission {
 return typeof value === 'object' && value !== null && verifiedAdmissions.has(value);
}
export interface ControllerReviewExecution { readonly provider: CliProvider; readonly bin: string; readonly client: StepClient; readonly modelLabel: string }
export interface ControllerReviewHelperDeps {
 readonly resolveRepo?: ((explicit: string | undefined) => Promise<string | undefined>) | undefined;
 readonly resolveExecution?: ((client: StepClient, repo: string | undefined) => ControllerReviewExecution | Promise<ControllerReviewExecution>) | undefined;
 readonly waitMs?: number | undefined;
 readonly now?: (() => number) | undefined;
 readonly privateSession?: (() => boolean) | undefined;
}
export type ControllerReviewForward = (args: unknown, extra: ForwardStepExtra) => Promise<StepMcpEnvelope>;
export async function resolveControllerReviewExecution(client: StepClient, repo: string | undefined, fetchRole: (repoPath: string) => Promise<unknown> = resolveControllerReviewRole): Promise<ControllerReviewExecution> {
 if (repo === undefined) throw new UnsupportedBoundedInputError('A repository is required to resolve the review role policy');
 assertConnectionProviderAdmission();
 const raw = await fetchRole(repo);
 if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new UnsupportedBoundedInputError('The daemon returned no review role policy');
 const role = raw as Record<string, unknown>, cli = role['cli'] as { kind?: unknown } | undefined;
 // An Ollama-hosted or refused role is not the invoking controller's own CLI.
 const fallback = role['fallback'] as { reason?: unknown } | undefined;
 if ((cli as { ollama?: unknown } | undefined)?.ollama !== undefined || fallback?.reason === 'model-not-supported') throw new UnsupportedBoundedInputError('The daemon review role policy does not select the invoking controller CLI');
 if (cli?.kind !== client || typeof role['model'] !== 'string' || role['model'].length === 0 || !['core', 'mid', 'cheap'].includes(String(role['tier']))) throw new UnsupportedBoundedInputError('The daemon review role policy does not select the invoking controller CLI');
 const effort = role['effort'];
 if (effort !== undefined && (typeof effort !== 'string' || effort.length === 0)) throw new UnsupportedBoundedInputError('Invalid review role effort');
 const limit = role['inputLimit'] as { unit?: unknown; max?: unknown } | undefined;
 if (limit !== undefined && (limit === null || !['chars', 'tokens'].includes(String(limit.unit)) || !Number.isSafeInteger(limit.max) || (limit.max as number) <= 0)) throw new UnsupportedBoundedInputError('Invalid review role input allowance');
 const inputBudgetChars = limit === undefined ? undefined : (limit.max as number) * (limit.unit === 'tokens' ? 3 : 1);
 if (inputBudgetChars !== undefined && !Number.isSafeInteger(inputBudgetChars)) throw new UnsupportedBoundedInputError('Invalid review role input allowance');
 const provider = new CliProvider({ kind: client, model: role['model'], ...(typeof effort === 'string' ? { effort } : {}), ...(inputBudgetChars !== undefined ? { inputBudgetChars } : {}) });
 return { provider, bin: client, client, modelLabel: `cli-${client}:${role['model']}` };
}

interface Owner {
 readonly state: string;
 readonly callId: string;
 readonly expiresAt: number;
 readonly timing: CodeReviewStepEmitCall['timing'];
 readonly admission: ControllerReviewAdmission;
 readonly controller: AbortController;
 readonly work: Promise<ControllerCallResult>;
}
const envelope = (value: unknown, isError = false): StepMcpEnvelope => ({ content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) });
const error = (code: string, message: string): StepMcpEnvelope => envelope({ next: 'error', error: { code, message, retryable: false } }, true);
// These request rejections do not invalidate the server's owned review state.
const recoverableRequestErrors = new Set(['bad-input', 'bad-phase', 'bad-state', 'bad-call-result', 'review-target-mismatch', 'conflicting-call-replay']);
function recoverableRequestError(value: Record<string, unknown> | undefined): boolean {
 const detail = value?.['error'];
 return value?.['next'] === 'error' && typeof detail === 'object' && detail !== null && recoverableRequestErrors.has(String((detail as Record<string, unknown>)['code']));
}

function body(reply: StepMcpEnvelope): Record<string, unknown> | undefined {
 try { const value: unknown = JSON.parse(reply.content[0]?.text ?? ''); return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined; } catch { return undefined; }
}
function frameOf(value: Record<string, unknown>): CodeReviewStepEmitCall {
 const call = value['call'];
 if (value['next'] !== 'emit_review_call' || typeof value['state'] !== 'string' || typeof value['guidance'] !== 'string' || typeof call !== 'object' || call === null || Array.isArray(call)) throw new Error('Malformed bounded controller task');
 const c = call as Record<string, unknown>, timing = value['timing'] as Record<string, unknown> | undefined;
 if (typeof timing !== 'object' || timing === null || !['startedAt', 'chunkCount', 'budgetMs', 'deadlineAt'].every(k => Number.isSafeInteger(timing[k]) && (timing[k] as number) >= 0) || (timing['chunkCount'] as number) < 1 || timing['budgetMs'] !== (timing['chunkCount'] as number) * 600_000 || timing['deadlineAt'] !== (timing['startedAt'] as number) + (timing['budgetMs'] as number)) throw new Error('Malformed fixed controller timing');
 if (typeof c['callId'] !== 'string' || !Array.isArray(c['messages']) || typeof c['schema'] !== 'object' || c['schema'] === null || !Number.isSafeInteger(c['limitChars']) || (c['limitChars'] as number) <= 0 || (c['limitChars'] as number) > 384_000 || !Number.isSafeInteger(c['expiresAt'])) throw new Error('Malformed bounded controller call metadata');
 if ((c['expiresAt'] as number) > (timing['deadlineAt'] as number)) throw new Error('Controller call exceeds its fixed review deadline');
 if ((c['schema'] as { properties?: { callId?: { const?: unknown } } }).properties?.callId?.const !== c['callId']) throw new Error('Controller task schema does not identify its call');
 if (JSON.stringify(value).length > (c['limitChars'] as number)) throw new InputTooLargeError('Complete controller task exceeds its declared cap', '', { maxChars: c['limitChars'] as number, actualChars: JSON.stringify(value).length });
 return value as unknown as CodeReviewStepEmitCall;
}

export class ControllerReviewHelper {
 private readonly epoch = randomUUID();
 private readonly owners = new Map<string, Owner>();
 private readonly turns = new Map<string, Promise<void>>();
 private readonly admissions = new Map<string, { admission: ControllerReviewAdmission; execution: ControllerReviewExecution; expiresAt: number }>();
 private queue: Promise<void> = Promise.resolve();
 private closed = false;
 private readonly now: () => number;
 constructor(private readonly deps: ControllerReviewHelperDeps = {}) { this.now = deps.now ?? Date.now; }
 private async admit(client: StepClient, repo: string | undefined): Promise<{ admission: ControllerReviewAdmission; execution: ControllerReviewExecution }> {
  const execution = await (this.deps.resolveExecution ?? resolveControllerReviewExecution)(client, repo);
  if (execution.client !== client || !(execution.provider instanceof CliProvider)) throw new UnsupportedBoundedInputError('Controller execution must use its own local CLI provider');
  const dir = mkdtempSync(join(tmpdir(), 'insrc-controller-admit-'));
  try { verifyBoundedCli(client, execution.bin, dir); } finally { rmSync(dir, { recursive: true, force: true }); }
  const maxInputChars = Math.min(384_000, execution.provider.inputBudgetChars ?? 384_000);
  if (!Number.isSafeInteger(maxInputChars) || maxInputChars <= 0) throw new UnsupportedBoundedInputError('Invalid verified controller input allowance');
  const capability: ControllerExecutionCapability = Object.freeze({ adapterId: BOUNDED_CLI_ADAPTERS[client], maxInputChars, helperEpoch: this.epoch, modelLabel: execution.modelLabel });
  const admission = Object.freeze({ capability, client }); verifiedAdmissions.add(admission);
  return { admission, execution };
 }
 private pending(owner: Owner): StepMcpEnvelope {
  return envelope({ next: 'controller_call_pending', state: owner.state, callId: owner.callId, expiresAt: owner.expiresAt, timing: owner.timing, guidance: "The verified isolated CLI helper owns this call. Continue phase='start' with the SAME state to rejoin; do not execute it in chat or relaunch. proceed:false cancels the helper and the controller review." });
 }
 private start(frame: CodeReviewStepEmitCall, admitted: { admission: ControllerReviewAdmission; execution: ControllerReviewExecution }): Owner {
  const present = this.owners.get(frame.state);
  if (present !== undefined) return present; // Atomic check at mutation, never an earlier turn snapshot.
  const controller = new AbortController();
  let settle!: (value: ControllerCallResult) => void;
  const work = new Promise<ControllerCallResult>(resolve => { settle = resolve; });
  const owner: Owner = { state: frame.state, callId: frame.call.callId, expiresAt: frame.call.expiresAt, timing: { startedAt: frame.timing.startedAt, chunkCount: frame.timing.chunkCount, budgetMs: frame.timing.budgetMs, deadlineAt: frame.timing.deadlineAt }, admission: admitted.admission, controller, work };
  this.owners.set(frame.state, owner);
  let running = false, timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => { const left = frame.call.expiresAt - this.now(); if (left <= 0) { controller.abort(); return; } timer = setTimeout(arm, Math.min(left, 2_147_483_647)); timer.unref(); };
  controller.signal.addEventListener('abort', () => { if (!running) { if (timer !== undefined) clearTimeout(timer); settle({ callId: frame.call.callId, failure: { cause: 'stall', detail: 'Controller call cancelled or expired before dispatch' } }); } }, { once: true });
  arm();
  // One queue for this MCP helper; no overlapping local/cloud provider calls.
  this.queue = this.queue.catch(() => {}).then(async () => {
   const remaining = frame.call.expiresAt - this.now();
   if (controller.signal.aborted || remaining <= 0 || this.closed) { if (timer !== undefined) clearTimeout(timer); settle({ callId: frame.call.callId, failure: { cause: 'stall', detail: 'Controller call cancelled or expired before dispatch' } }); return; }
   running = true;
   try {
    // The whole explicit task, including metadata and its schema, is counted by
    // CliProvider together with the actual normalized response schema/framing.
    const answer = await admitted.execution.provider.completeStructured([{ role: 'user', content: `Execute only the identified review task below. Its messages are the complete evidence and instructions. Return its enveloped structured result.\n${JSON.stringify(frame)}` }], frame.call.schema,
     { boundedInput: { contextMode: 'isolated-structured', maxInputChars: Math.min(frame.call.limitChars, admitted.admission.capability.maxInputChars) }, internalRetry: false, timeoutMs: remaining, signal: controller.signal });
    if (controller.signal.aborted || this.now() >= frame.call.expiresAt) throw new Error('Controller call expired or cancelled after execution');
    settle({ callId: frame.call.callId, answer });
   } catch (err) {
    if (err instanceof UnsupportedBoundedInputError) { settle({ callId: frame.call.callId, failure: { cause: 'stall', detail: `unsupported-bounded-controller: ${err.message}` } }); return; }
    if (err instanceof InputTooLargeError) {
     const excess = Math.max(1, (err.actualChars ?? JSON.stringify(frame).length + 1) - (err.maxChars ?? frame.call.limitChars));
     const maxChars = Math.max(1, Math.min(frame.call.limitChars - 1, JSON.stringify(frame).length - excess));
     settle({ callId: frame.call.callId, failure: { cause: 'size-refusal', detail: err.message, maxChars } });
    } else settle({ callId: frame.call.callId, failure: { cause: err instanceof ModelResponseShapeError ? 'invalid-answer' : controller.signal.aborted ? 'stall' : 'transient', detail: err instanceof Error ? err.message : String(err) } });
   } finally { if (timer !== undefined) clearTimeout(timer); }
  });
  return owner;
 }
 async forward(raw: unknown, extra: ForwardStepExtra, forward: ControllerReviewForward): Promise<StepMcpEnvelope> {
  const turnStartedAt = this.now();
  if (this.closed) return error('unsupported-bounded-controller', 'The isolated controller helper is closed');
  const args = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const state = typeof args['state'] === 'string' ? args['state'] : undefined;
  // Cancellation interrupts owned execution immediately, before waiting for its turn lock.
  if (state !== undefined && args['phase'] === 'start' && args['proceed'] === false) this.owners.get(state)?.controller.abort();
  const key = state ?? JSON.stringify([extra.client, args['repo'], args['epicHash'], args['storyId']]);
  const prior = this.turns.get(key) ?? Promise.resolve();
  let release!: () => void;
  const ticket = new Promise<void>(resolve => { release = resolve; });
  const tail = prior.then(() => ticket); this.turns.set(key, tail);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const acquired = await Promise.race([prior.then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), 180_000); })]);
  if (timer !== undefined) clearTimeout(timer);
  const cleanup = (): void => { release(); void tail.then(() => { if (this.turns.get(key) === tail) this.turns.delete(key); }); };
  if (!acquired) {
   cleanup(); const owner = state === undefined ? undefined : this.owners.get(state);
   return owner !== undefined ? this.pending(owner) : envelope({ next: 'error', error: { code: 'controller-turn-busy', message: 'Retry with the same state to rejoin the owned transition.', retryable: true } }, true);
  }
  try { return await this.forwardTurn(raw, extra, forward, turnStartedAt); }
  finally { cleanup(); }
 }
 private async forwardTurn(raw: unknown, extra: ForwardStepExtra, forward: ControllerReviewForward, turnStartedAt: number): Promise<StepMcpEnvelope> {
  for (const [token, value] of this.admissions) if (this.now() >= value.expiresAt && !this.owners.has(token)) this.admissions.delete(token);
  if (this.closed) return error('unsupported-bounded-controller', 'The isolated controller helper is closed');
  try { if ((this.deps.privateSession ?? (() => privateSessionBootstrap() !== undefined))()) return forward(raw, extra); } catch { return forward(raw, extra); }
  const args = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  if (args['callResult'] !== undefined) return error('unsupported-bounded-controller', 'Bounded callResult must be produced by the verified isolated helper, never by inherited chat output');
  const state = typeof args['state'] === 'string' ? args['state'] : undefined;
  const existing = state === undefined ? undefined : this.owners.get(state);
  if (existing !== undefined && args['phase'] !== 'start') return error('bad-call-result', 'An owned isolated controller call accepts start/status or explicit cancellation; chat judgements cannot replace its result');
  if (args['phase'] === 'start' && args['proceed'] === false && existing !== undefined) {
   existing.controller.abort(); await existing.work; if (this.owners.get(existing.state) === existing) this.owners.delete(existing.state); this.admissions.delete(existing.state);
   return forward(raw, { ...extra, controllerReview: existing.admission });
  }
  let admitted = state === undefined ? undefined : this.admissions.get(state);
  if (admitted !== undefined && this.now() >= admitted.expiresAt) { this.admissions.delete(state!); admitted = undefined; }
  let unavailable: string | undefined;
  if (admitted === undefined && extra.client !== undefined) {
   try {
    const repo = await (this.deps.resolveRepo ?? resolveRepoPath)(typeof args['repo'] === 'string' ? args['repo'] : undefined);
    if (repo === undefined) throw new UnsupportedBoundedInputError('Cannot resolve the controller repository for role policy');
    admitted = { ...await this.admit(extra.client, repo), expiresAt: Number.MAX_SAFE_INTEGER };
   }
   catch (err) { unavailable = err instanceof Error ? err.message : String(err); }
  }
  // Routing still belongs to the daemon. Unsupported CLI isolation must not
  // suppress a daemon-owned review or legacy full-graph controller review.
  const reply = await forward(raw, { ...extra, ...(admitted !== undefined ? { controllerReview: admitted.admission } : {}) });
  const value = body(reply);
  if (value?.['next'] !== 'emit_review_call') {
   if (state !== undefined && admitted !== undefined && recoverableRequestError(value)) return reply;
   if (value?.['next'] === 'confirm_wait' && typeof value['state'] === 'string' && admitted !== undefined) this.admissions.set(value['state'], { ...admitted, expiresAt: this.now() + 3_600_000 });
   if (existing !== undefined && value?.['next'] === 'error' && (value['error'] as { retryable?: unknown } | undefined)?.retryable === true) return this.pending(existing);
   if (existing !== undefined && value?.['next'] !== 'review_pending') { existing.controller.abort(); await existing.work; if (this.owners.get(existing.state) === existing) this.owners.delete(existing.state); }
   if (state !== undefined && (value?.['next'] === 'done' || (value?.['next'] === 'error' && (value['error'] as { retryable?: unknown } | undefined)?.retryable !== true))) this.admissions.delete(state);
   if (value?.['next'] === 'error' && unavailable !== undefined && (value['error'] as { code?: unknown } | undefined)?.code === 'unsupported-bounded-controller') return error('unsupported-bounded-controller', unavailable);
   return reply;
  }
  if (admitted === undefined) return error('unsupported-bounded-controller', unavailable ?? 'No verified isolated controller helper is available');
  let frame: CodeReviewStepEmitCall;
  try { frame = frameOf(value); } catch (err) { return error('controller-task-invalid', err instanceof Error ? err.message : String(err)); }
  if (frame.call.limitChars > admitted.admission.capability.maxInputChars) return error('controller-task-invalid', 'Daemon task exceeds its verified helper allowance');
  if (frame.call.expiresAt <= this.now()) {
   if (existing !== undefined) { existing.controller.abort(); await existing.work; if (this.owners.get(existing.state) === existing) this.owners.delete(existing.state); }
   this.admissions.delete(frame.state);
   await forward({ phase: 'start', state: frame.state, proceed: false }, { ...extra, controllerReview: admitted.admission });
   return error('review-deadline', 'Controller call expired before local dispatch');
  }
  if (state !== undefined && state !== frame.state) this.admissions.delete(state);
  this.admissions.set(frame.state, { ...admitted, expiresAt: Math.min(Number.MAX_SAFE_INTEGER, frame.timing.deadlineAt + 600_000) });
  if (existing !== undefined && existing.callId !== frame.call.callId) { existing.controller.abort(); await existing.work; if (this.owners.get(existing.state) === existing) this.owners.delete(existing.state); }
  const owner = existing?.callId === frame.call.callId ? existing : this.start(frame, admitted);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waitMs = Math.min(180_000, Math.max(0, 195_000 - (this.now() - turnStartedAt)), this.deps.waitMs ?? 180_000, Math.max(0, frame.call.expiresAt - this.now()));
  const settled = await Promise.race([owner.work, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), waitMs); })]);
  if (timer !== undefined) clearTimeout(timer);
  if (settled === undefined) return this.pending(owner);
  if (this.now() >= owner.expiresAt || owner.controller.signal.aborted) {
   owner.controller.abort(); await owner.work; if (this.owners.get(owner.state) === owner) this.owners.delete(owner.state);
   await forward({ phase: 'start', state: owner.state, proceed: false }, { ...extra, controllerReview: owner.admission });
   return error(this.now() >= owner.expiresAt ? 'review-deadline' : 'review-cancelled', 'The owned isolated controller call expired or was cancelled; no late output was accepted');
  }
  if (settled.failure?.detail.startsWith('unsupported-bounded-controller:')) {
   await forward({ phase: 'start', state: owner.state, proceed: false }, { ...extra, controllerReview: owner.admission }); if (this.owners.get(owner.state) === owner) this.owners.delete(owner.state);
   return error('unsupported-bounded-controller', settled.failure.detail);
  }
  const continued = await forward({ phase: 'judgements', state: owner.state, callResult: settled }, { ...extra, controllerReview: owner.admission });
  const continuation = body(continued);
  if (recoverableRequestError(continuation)) return continued; // Keep the settled result for an exact retry, never rerun its CLI call.
  if (continuation?.['next'] !== 'error' || (continuation['error'] as { retryable?: unknown } | undefined)?.retryable !== true) { if (this.owners.get(owner.state) === owner) this.owners.delete(owner.state); }
  if (continuation?.['next'] === 'done' || (continuation?.['next'] === 'error' && (continuation['error'] as { retryable?: unknown } | undefined)?.retryable !== true)) this.admissions.delete(owner.state);
  if (continuation?.['next'] === 'emit_review_call') {
   try {
    const next = frameOf(continuation);
    if (next.state !== owner.state || next.call.callId === owner.callId || next.call.expiresAt <= this.now()) return error('controller-task-invalid', 'Controller continuation did not advance to a live identified call');
    return this.pending(this.start(next, admitted));
   } catch (err) { return error('controller-task-invalid', err instanceof Error ? err.message : String(err)); }
  }
  return continued;
 }
 async close(): Promise<void> {
  this.closed = true;
  for (const owner of this.owners.values()) owner.controller.abort();
  // Await already owned work; never initiate parallel provider calls.
  for (const owner of this.owners.values()) await owner.work;
  this.owners.clear(); this.admissions.clear();
 }
}
