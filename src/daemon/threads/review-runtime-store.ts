/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isMainThread } from 'node:worker_threads';
import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open } from 'node:fs/promises';
import { join, isAbsolute, normalize } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { decodeReviewRuntime, REVIEW_RUNTIME_MAX_BYTES } from '../../shared/review-preparation.js';
import type { ReviewRuntime } from '../../shared/review-preparation.js';
import type { ReviewKey, ReviewAuthorizedClearance } from '../../shared/review-resources.js';
import { reviewGuardDigest, ReviewKeySchema } from '../../shared/review-resources.js';
import { Value } from '@sinclair/typebox/value';
import type { ReviewProcessReservation, ReviewIntentReceipt, ConfirmedReviewLeaseClosure } from '../../shared/review-native.js';
import { writeCheckpoint } from '../../workflow/code-review/task-review/checkpoint.js';
import { decodePreparationCheckpoint, loadPreparationCheckpointSnapshot, preparationCheckpointStamp } from '../../workflow/review/preparation-checkpoint.js';
import type { PreparationHistory } from '../../workflow/review/history-binding.js';
import { reviewJsonLimit } from '../../config/review.js';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';
import { getLogger } from '../../shared/logger.js';
import type { HistoryBoundaryReceipt } from '../../workflow/review/history-binding.js';

export interface ReviewRuntimeHandle { readonly key: Readonly<ReviewKey>; readonly runtimeId: string; }
export interface InactiveRuntimeAudit {
 readonly runtime: ReviewRuntime;
 readonly checkpointDigest: string;
 readonly checkpointRuntime: PreparationHistory['runtime'];
 readonly context?: PreparationHistory['context'];
 readonly publicationError?:string|undefined;
 readonly publication?:import('../../workflow/review/publication-proof.js').PublicationProof|undefined;
}
class RuntimeOperationRefused extends Error {}
interface Owner { handle: ReviewRuntimeHandle; current: ReviewRuntime; stamp: string; fenced: boolean; }
type Progress = Pick<ReviewRuntime, 'progress' | 'preparation'>;
const lanes = new Map<string, Promise<void>>();
// A second store instance must not adopt an initializing file still owned by
// this daemon. Disk existence is proof to reconcile, not an ownership token.
const ownedPaths = new Map<string, ReviewRuntimeHandle>();
function serial<T>(path: string, work: () => Promise<T>): Promise<T> {
 const result = (lanes.get(path) ?? Promise.resolve()).catch(() => {}).then(work);
 const tail = result.then(() => {}, () => {}); lanes.set(path, tail);
 void tail.then(() => { if (lanes.get(path) === tail) lanes.delete(path); }); return result;
}
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
export function reviewRuntimePath(key: ReviewKey): string {
 // Validate literal identity before deriving any pathname.
 if (!Value.Check(ReviewKeySchema, key) || !isAbsolute(key.project) || normalize(key.project) !== key.project) throw new Error('Invalid canonical runtime key');
 return join(key.project, '.insrc/tmp/review-runtime', key.family, `${key.reviewId}.json`);
}
async function safeParents(key: ReviewKey, create = true): Promise<boolean> {
 if (await realpath(key.project) !== key.project) throw new Error('Noncanonical runtime project');
 let current = key.project;
 for (const part of ['.insrc', 'tmp', 'review-runtime', key.family]) {
  current = join(current, part);
  if (create) await mkdir(current, { mode: 0o700 }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
  let st;
  try { st = await lstat(current); }
  catch (error) { if (!create && (error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  if (!st.isDirectory() || st.isSymbolicLink() || await realpath(current) !== current) throw new Error('Unsafe runtime parent');
 }
 return true;
}
/** Read-only operational proof for cold observers and resource recovery.
 * Absence never creates a replacement runtime or initializes empty leases. */
export async function loadReviewRuntime(key: ReviewKey): Promise<ReviewRuntime | undefined> {
 const path = reviewRuntimePath(key);
 if (!await safeParents(key, false)) return undefined;
 try { return decodeReviewRuntime(JSON.parse(await bounded(path, REVIEW_RUNTIME_MAX_BYTES)), key); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
async function bounded(path: string, limit: number): Promise<string> {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const before = await file.stat({ bigint: true });
  if (!before.isFile() || before.size > BigInt(limit)) throw new Error('Invalid runtime file size');
  const bytes = Buffer.alloc(Number(before.size) + 1); let offset = 0;
  while (offset < bytes.length) { const n = await file.read(bytes, offset, bytes.length - offset, null); if (!n.bytesRead) break; offset += n.bytesRead; }
  const after = await file.stat({ bigint: true });
  if (BigInt(offset) !== before.size || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error('Runtime file changed during read');
  return bytes.subarray(0, offset).toString('utf8');
 } finally { await file.close(); }
}

/** Only main owns this writer. Handles never cross a public RPC or worker port.
 * New production consumers are wired together at the coordinated cutover. */
export class ReviewRuntimeStore {
 private readonly owners = new WeakMap<ReviewRuntimeHandle, Owner>();
 private readonly pending = new Map<ReviewRuntimeHandle, Progress>();
 private readonly timers = new Map<ReviewRuntimeHandle, ReturnType<typeof setTimeout>>();
 constructor(private readonly write: typeof writeCheckpoint = writeCheckpoint, private readonly progressError: (error: unknown) => void = error => getLogger('review-runtime').warn({ err: error }, 'Runtime progress unavailable; owner fenced')) {
  if (!isMainThread) throw new Error('Review runtime writer must live on main');
 }
 async initialize(input: ReviewRuntime): Promise<ReviewRuntimeHandle> {
  const value = structuredClone(decodeReviewRuntime(input, input.key));
  if (value.state !== 'initializing' || value.sequence !== 0) throw new Error('Runtime initialization required');
  const path = reviewRuntimePath(value.key);
  return serial(path, async () => {
   if (ownedPaths.has(path)) throw new Error('Runtime already exists with a live owner; explicit recovery required');
   await safeParents(value.key);
   try { await lstat(path); throw new Error('Runtime already exists; explicit recovery required'); }
   catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
   const bytes = JSON.stringify(value) + '\n'; await this.write(path, bytes);
   const handle = Object.freeze({ key: Object.freeze({ ...value.key }), runtimeId: value.runtimeId });
   this.owners.set(handle, { handle, current: value, stamp: hash(bytes), fenced: false }); ownedPaths.set(path, handle); return handle;
  });
 }
 /** Explicit recovery of the initialize/bind/activate crash window only.
  * Main's exact inactive-review fence must cover this entire call. No active,
  * interrupted or terminal runtime can enter through this narrow transition. */
 async recoverInitialization(input: ReviewRuntime, assertInactive: () => Promise<void>): Promise<ReviewRuntimeHandle> {
  const value = structuredClone(decodeReviewRuntime(input, input.key)), path = reviewRuntimePath(value.key);
  if (value.state !== 'initializing' || value.sequence !== 0) throw new Error('Initialization recovery requires a fresh inactive owner');
  return serial(path, async () => {
   if (ownedPaths.has(path)) throw new Error('Runtime still has a live owner');
   await safeParents(value.key); await assertInactive();
   const raw = await bounded(path, REVIEW_RUNTIME_MAX_BYTES), previous = decodeReviewRuntime(JSON.parse(raw), value.key);
   if (previous.state !== 'initializing' || previous.sequence !== 0 || previous.runtimeId !== value.runtimeId
    || previous.attempt !== value.attempt || !same(previous.checkpointBinding, value.checkpointBinding)
    || previous.cancellation || value.cancellation) throw new Error('Runtime is outside the initialization recovery window');
   await assertInactive();
   if (await bounded(path, REVIEW_RUNTIME_MAX_BYTES) !== raw) throw new Error('Initialization proof changed during recovery');
   const bytes = JSON.stringify(value) + '\n'; await this.write(path, bytes);
   const handle = Object.freeze({ key: Object.freeze({ ...value.key }), runtimeId: value.runtimeId });
   this.owners.set(handle, { handle, current: value, stamp: hash(bytes), fenced: false }); ownedPaths.set(path, handle); return handle;
  });
 }
 /** Main owns the exact review exclusion. Retire no resource proof until its
  * full compact audit is durably preserved by the artifact journal owner.
  * The returned checkpoint digest permits only the worker's explicit rebind;
  * the new runtime stays inactive until that actual checkpoint is verified. */
 async replaceInactive(input: ReviewRuntime, archive: (proof: InactiveRuntimeAudit) => Promise<void>, assertInactive: () => Promise<void>): Promise<{ handle: ReviewRuntimeHandle; prior: InactiveRuntimeAudit }> {
  const value = structuredClone(decodeReviewRuntime(input, input.key)), path = reviewRuntimePath(value.key);
  if (value.state !== 'initializing' || value.sequence !== 0) throw new Error('Inactive handoff requires an initializing successor');
  return serial(path, async () => {
   if (ownedPaths.has(path)) throw new Error('Runtime still has a live owner');
   await safeParents(value.key, false); await assertInactive();
   const raw = await bounded(path, REVIEW_RUNTIME_MAX_BYTES), previous = decodeReviewRuntime(JSON.parse(raw), value.key);
   const checkpoint = await loadPreparationCheckpointSnapshot(value.key);
   if (checkpoint?.value.format !== 'current' || checkpoint.value.checkpoint.runtime.runtimeId !== previous.runtimeId
    || checkpoint.value.checkpoint.runtime.inputDigest !== previous.checkpointBinding.inputDigest) throw new Error('Inactive runtime/checkpoint binding mismatch');
   const cp = checkpoint.value.checkpoint, last = cp.attempts.at(-1)!, attempt = 'header' in last ? last.header.attempt : last.number;
   if (attempt !== previous.attempt || previous.resourceGuard.openLeases.length || previous.state === 'initializing') throw new Error('Inactive handoff has unresolved or initializing proof');
   if (value.runtimeId === previous.runtimeId || value.workerIncarnation === previous.workerIncarnation
    || value.attempt !== previous.attempt && value.attempt !== previous.attempt + 1) throw new Error('Invalid inactive runtime successor');
   const sameAttempt = value.attempt === previous.attempt;
   if(sameAttempt&&previous.cancellation)throw new Error('Stopped review requires a separate explicit new attempt');
   if (!sameAttempt) {
    const status = 'header' in last ? last.header.status : last.status;
    if (['pending', 'running'].includes(status)
     || 'review-response' in last && status !== 'failed' && last['review-response'].crPublication !== 'complete'
     || !('header' in last) && 'baseline' in last && !['failed', 'invalidated'].includes(status) && last.publication?.state !== 'complete') throw new Error('Previous attempt is active or unpublished');
   }
   if (sameAttempt ? !same(value.checkpointBinding, previous.checkpointBinding) : value.checkpointBinding.semanticSequence !== 0 || value.checkpointBinding.historyBindingDigest !== undefined) throw new Error('Inactive handoff cannot reset or skip history');
   const proof: InactiveRuntimeAudit = { runtime: structuredClone(previous), checkpointDigest: checkpoint.digest, checkpointRuntime: structuredClone(cp.runtime), ...(cp.context ? { context: structuredClone(cp.context) } : {}) };
   await archive(structuredClone(proof));
   await assertInactive();
   if (await bounded(path, REVIEW_RUNTIME_MAX_BYTES) !== raw || await preparationCheckpointStamp(value.key) !== checkpoint.stamp) throw new Error('Inactive handoff proof changed during archive');
   const bytes = JSON.stringify(value) + '\n'; await this.write(path, bytes);
   const handle = Object.freeze({ key: Object.freeze({ ...value.key }), runtimeId: value.runtimeId });
   this.owners.set(handle, { handle, current: value, stamp: hash(bytes), fenced: false }); ownedPaths.set(path, handle);
   return { handle, prior: proof };
  });
 }
 /** Local broker calls this only while the exact worker/native exclusion is
  * held. It grants no execution handle and never edits semantic history. */
 async clearInactive(key:ReviewKey,clearance:ReviewAuthorizedClearance,assertInactive:()=>Promise<void>):Promise<void>{
  const path=reviewRuntimePath(key);
  await serial(path,async()=>{
   await assertInactive();await safeParents(key,false);
   const raw=await bounded(path,REVIEW_RUNTIME_MAX_BYTES),value=decodeReviewRuntime(JSON.parse(raw),key),receipt=clearance.approvalReceipt;
   const handle=ownedPaths.get(path),owner=handle&&this.owners.get(handle);
   if(handle&&!owner)throw new Error('Runtime belongs to another live owner');
   if(owner&&owner.stamp!==hash(raw))throw new Error('Runtime changed outside owner');
   const cp=await loadPreparationCheckpointSnapshot(key);
   if(cp?.value.format!=='current'||cp.value.checkpoint.runtime.runtimeId!==value.runtimeId||cp.value.checkpoint.runtime.inputDigest!==value.checkpointBinding.inputDigest)throw new Error('Resource clearance runtime binding mismatch');
   const selected=new Set(receipt.leaseIds),rows=[{attempt:value.attempt,resourceGuard:value.resourceGuard}];
   if(!same(receipt.reviewKey,key)||receipt.decision!=='approve'||!receipt.requestId||!selected.size||selected.size!==receipt.leaseIds.length)throw new Error('Invalid runtime clearance binding');
   if(same(value.resourceGuard.clearance,clearance)&&!value.resourceGuard.openLeases.some(l=>selected.has(l.operationId)))return;
   if(reviewGuardDigest(key,rows)!==receipt.guardDigest||![...selected].every(id=>value.resourceGuard.openLeases.some(l=>l.operationId===id)))throw new Error('Stale runtime resource clearance');
   await assertInactive();if(await bounded(path,REVIEW_RUNTIME_MAX_BYTES)!==raw||await preparationCheckpointStamp(key)!==cp.stamp)throw new Error('Resource proof changed during clearance');
   value.resourceGuard={...value.resourceGuard,clearance,openLeases:value.resourceGuard.openLeases.filter(l=>!selected.has(l.operationId))};
   if(value.state==='active')value.state='interrupted';value.sequence++;
   const bytes=JSON.stringify(decodeReviewRuntime(value,key))+'\n';await this.write(path,bytes);
   if(owner){clearTimeout(this.timers.get(handle!));this.timers.delete(handle!);this.pending.delete(handle!);owner.current=value;owner.stamp=hash(bytes);}
  });
 }
 private owner(handle: ReviewRuntimeHandle): Owner {
  const owner = this.owners.get(handle); if (!owner || owner.fenced) throw new Error('Runtime owner missing or fenced'); return owner;
 }
 private async mutate(handle: ReviewRuntimeHandle, change: (current: ReviewRuntime) => Promise<void> | void): Promise<ReviewRuntime> {
  const path = reviewRuntimePath(handle.key);
  return serial(path, async () => {
   const owner = this.owner(handle);
   try {
    await safeParents(handle.key);
    const raw = await bounded(path, REVIEW_RUNTIME_MAX_BYTES);
    if (hash(raw) !== owner.stamp) throw new Error('Runtime replaced outside owner');
    const next = structuredClone(decodeReviewRuntime(JSON.parse(raw), handle.key));
    await change(next); next.sequence++;
    decodeReviewRuntime(next, handle.key);
    const bytes = JSON.stringify(next) + '\n';
    if (Buffer.byteLength(bytes) > REVIEW_RUNTIME_MAX_BYTES) throw new Error('Runtime encoding exceeds bound');
    if (owner.fenced || this.owners.get(handle) !== owner) throw new Error('Runtime owner released during write');
    await this.write(path, bytes);
    if (owner.fenced || this.owners.get(handle) !== owner) throw new Error('Runtime owner released during durable write');
    owner.current = next; owner.stamp = hash(bytes); return structuredClone(next);
   } catch (error) { if (!(error instanceof RuntimeOperationRefused)) owner.fenced = true; throw error; }
  });
 }
 async activate(handle: ReviewRuntimeHandle): Promise<void> {
  await this.mutate(handle, async runtime => {
   // A lost activation acknowledgment may be retried on the same private
   // owner. Recheck the real binding; never reopen an interrupted/closed owner.
   if (!['initializing', 'active'].includes(runtime.state) || runtime.cancellation) throw new RuntimeOperationRefused('Runtime is not initializing or active');
   const cp = decodePreparationCheckpoint(JSON.parse(await bounded(reviewWorkerCheckpoint(handle.key), reviewJsonLimit())), handle.key);
   if (cp.format !== 'current' || cp.checkpoint.runtime.runtimeId !== runtime.runtimeId || cp.checkpoint.runtime.inputDigest !== runtime.checkpointBinding.inputDigest) throw new Error('Checkpoint/runtime binding mismatch');
   const last = cp.checkpoint.attempts.at(-1)!;
   const attempt = 'header' in last ? last.header.attempt : last.number;
   if (attempt !== runtime.attempt) throw new Error('Runtime attempt mismatch');
   runtime.state = 'active';
  });
 }
 async resource(handle: ReviewRuntimeHandle, operation: 'open' | 'close', reservation: ReviewProcessReservation, closure?: ConfirmedReviewLeaseClosure): Promise<ReviewIntentReceipt> {
  const owner = this.owner(handle), current = owner.current;
  if (!same(reservation.key, handle.key) || reservation.workerIncarnation !== current.workerIncarnation || reservation.daemonInstance !== current.daemonEpoch) throw new Error('Foreign runtime reservation');
  if (operation === 'close' && (!closure || closure.disposal.state !== 'confirmed' || !same(closure.reservation, reservation))) throw new Error('Host-confirmed disposal required');
  await this.mutate(handle, value => {
   if (operation === 'open' ? value.state !== 'active' || value.cancellation : !['active', 'interrupted'].includes(value.state)) throw new RuntimeOperationRefused('Runtime native admission closed');
   const lease = { operationId: reservation.operationId, workerIncarnation: reservation.workerIncarnation, kind: reservation.kind, openedAt: reservation.openedAt };
   const old = value.resourceGuard.openLeases.find(l => l.operationId === lease.operationId);
   if (old && !same(old, lease)) throw new Error('Conflicting runtime lease');
   if (operation === 'open') { if (!old) value.resourceGuard.openLeases.push(lease); }
   else { if (!old) throw new Error('Runtime closure has no open intent'); value.resourceGuard.openLeases = value.resourceGuard.openLeases.filter(l => l.operationId !== lease.operationId); }
  });
  return { checkpointPath: reviewWorkerCheckpoint(handle.key), attempt: current.attempt, operationId: reservation.operationId,
   workerIncarnation: current.workerIncarnation, daemonInstance: current.daemonEpoch, sourceValidation: current.checkpointBinding.historyBindingDigest ? 'qualified' : 'unverified' };
 }
 publishProgress(handle: ReviewRuntimeHandle, progress: Progress): void {
  const owner = this.owner(handle); if (owner.current.cancellation || owner.current.state !== 'active') return;
  this.pending.set(handle, structuredClone(progress));
  if (!this.timers.has(handle)) {
   const timer = setTimeout(() => { this.timers.delete(handle); void this.flushProgress(handle).catch(error => { if (!(error instanceof RuntimeOperationRefused)) this.progressError(error); }); }, 250);
   timer.unref(); this.timers.set(handle, timer);
  }
 }
 /** Observation never creates activity or durability writes. */
 snapshot(handle: ReviewRuntimeHandle): ReviewRuntime { return structuredClone(this.owner(handle).current); }
 async beginCancellation(handle: ReviewRuntimeHandle, actionId: string, reason: string): Promise<ReviewRuntime> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(actionId) || !reason.trim() || reason.length > 2048) throw new Error('Invalid cancellation request');
  const prior = this.owner(handle).current.cancellation;
  if (prior) { if (prior.actionId !== actionId || prior.reason !== reason) throw new Error('Conflicting cancellation replay'); return this.snapshot(handle); }
  clearTimeout(this.timers.get(handle)); this.timers.delete(handle); this.pending.delete(handle);
  return this.mutate(handle, value => {
   if (value.cancellation) {
    if (value.cancellation.actionId !== actionId || value.cancellation.reason !== reason) throw new RuntimeOperationRefused('Conflicting cancellation replay');
    return;
   }
   if (!['active', 'initializing', 'interrupted', 'terminal'].includes(value.state)) throw new Error('Runtime is not cancellable');
   value.cancellation = { actionId, reason, requestedAt: new Date().toISOString(), operationState: 'cancelling' };
   value.state = 'interrupted';
  });
 }
 async finishCancellation(handle: ReviewRuntimeHandle, workerEnded: boolean, resourcesDisposed: boolean): Promise<ReviewRuntime> {
  return this.mutate(handle, value => {
   if (!workerEnded || !value.cancellation) throw new RuntimeOperationRefused('Cancellation has not reclaimed its worker');
   value.cancellation.operationState = resourcesDisposed && value.resourceGuard.openLeases.length === 0 ? 'stopped' : 'resource_fenced';
  });
 }
 async flushProgress(handle: ReviewRuntimeHandle): Promise<void> {
  clearTimeout(this.timers.get(handle)); this.timers.delete(handle);
  const progress = this.pending.get(handle);
  if (!progress) { await serial(reviewRuntimePath(handle.key), async () => { this.owner(handle); }); return; }
  this.pending.delete(handle);
  await this.mutate(handle, value => {
   if (value.state !== 'active' || value.cancellation) throw new RuntimeOperationRefused('Runtime progress admission closed');
   // A valid observation may have been queued before an accepted result. It
   // cannot roll that result back or fence an otherwise healthy owner.
   if (progress.progress.completedUnits < value.progress.completedUnits) return;
   if (progress.progress.completedUnits !== value.progress.completedUnits) throw new Error('Progress cannot authorize completed work');
   value.progress = progress.progress;
   if (progress.preparation) value.preparation = progress.preparation;
  });
 }
 /** Called only for the authenticated phase worker's durable history receipt.
  * verify reads the exact current checkpoint digest under that owner's fence. */
 async acceptHistory(handle: ReviewRuntimeHandle, receipt: HistoryBoundaryReceipt, verify: () => Promise<void>): Promise<void> {
  const proof = structuredClone(receipt);
  await this.mutate(handle, async value => {
   if (!['active','terminal'].includes(value.state) || value.cancellation) throw new RuntimeOperationRefused('Runtime history admission closed');
   if (!same(proof.key, handle.key) || proof.runtimeId !== value.runtimeId || proof.attempt !== value.attempt || proof.inputDigest !== value.checkpointBinding.inputDigest) throw new Error('Foreign runtime history receipt');
   await verify();
   const next = proof.binding, old = value.checkpointBinding;
   if (next.semanticSequence === old.semanticSequence && old.historyBindingDigest === next.bindingDigest) {
    if (proof.completedUnits !== value.progress.completedUnits) throw new Error('Conflicting result replay'); return;
   }
   const initial = old.historyBindingDigest === undefined && old.semanticSequence === 0 && next.semanticSequence === 0 && next.priorBindingDigest === null;
   const prior = proof.requalifiedFrom;
   const unacknowledgedInitial = prior && old.historyBindingDigest === undefined && old.semanticSequence === 0
    && prior.semanticSequence === 0 && prior.priorBindingDigest === null;
   const reconciled = prior && same(prior.key, handle.key) && prior.attempt === value.attempt
    && (unacknowledgedInitial || prior.semanticSequence === old.semanticSequence + 1 && prior.priorBindingDigest === old.historyBindingDigest)
    && next.semanticSequence === prior.semanticSequence + 1 && next.priorBindingDigest === prior.bindingDigest;
   if (!initial && !reconciled && (next.semanticSequence !== old.semanticSequence + 1 || next.priorBindingDigest !== old.historyBindingDigest)) throw new Error('Runtime history chain mismatch');
   if (proof.completedUnits < value.progress.completedUnits) throw new Error('Committed result count regressed');
   if (value.state === 'terminal' && proof.completedUnits !== value.progress.completedUnits) throw new Error('Closed publication cannot accept new assessment results');
   const advanced = proof.completedUnits > value.progress.completedUnits;
   value.checkpointBinding = { ...old, semanticSequence: next.semanticSequence, historyBindingDigest: next.bindingDigest };
   value.progress.completedUnits = proof.completedUnits;
   // The last flushed observation may predate plan qualification. A real
   // accepted result must not be fenced by that stale denominator; the next
   // bounded family observation supplies the currently known total.
   if(value.progress.totalUnits!==null&&value.progress.totalUnits<proof.completedUnits)value.progress.totalUnits=null;
   if (advanced) value.committedResultBoundary = { semanticSequence: next.semanticSequence, historyBindingDigest: next.bindingDigest };
   if (proof.publication) value.publicationBoundary = { semanticSequence: next.semanticSequence, artifactId: proof.publication.artifactId, preservationDigest: proof.publication.preservationDigest };
  });
 }
 /** Main-only semantic boundary: closes future native/result admission after
  * actual native disposal, then verifies the exact acknowledged history. */
 async sealPublication(handle: ReviewRuntimeHandle, receipt: HistoryBoundaryReceipt, verify: () => Promise<void>, closeNative: () => Promise<void>): Promise<ReviewRuntime> {
  await closeNative();
  await this.flushProgress(handle);
  return this.mutate(handle, async value => {
   if (!['active', 'terminal'].includes(value.state) || value.cancellation) throw new RuntimeOperationRefused('Publication owner is not active');
   if (value.resourceGuard.openLeases.length) throw new Error('Publication has unresolved native resources');
   if (!same(receipt.key, handle.key) || receipt.runtimeId !== value.runtimeId || receipt.attempt !== value.attempt
    || receipt.inputDigest !== value.checkpointBinding.inputDigest || receipt.binding.bindingDigest !== value.checkpointBinding.historyBindingDigest
    || receipt.binding.semanticSequence !== value.checkpointBinding.semanticSequence || receipt.completedUnits !== value.progress.completedUnits) throw new Error('Publication history is not acknowledged');
   await verify(); value.state = 'terminal';
  });
 }
 /** Explicit owner teardown never removes persisted proof. */
 release(handle: ReviewRuntimeHandle): void {
  const owner = this.owners.get(handle); if (!owner) return;
  clearTimeout(this.timers.get(handle)); this.timers.delete(handle); this.pending.delete(handle);
  owner.fenced = true; this.owners.delete(handle);
  const path = reviewRuntimePath(handle.key); if (ownedPaths.get(path) === handle) ownedPaths.delete(path);
 }
}
