/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isMainThread } from 'node:worker_threads';
import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open } from 'node:fs/promises';
import { join, isAbsolute, normalize } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import { decodeReviewRuntime, REVIEW_RUNTIME_MAX_BYTES } from '../../shared/review-preparation.js';
import type { ReviewRuntime } from '../../shared/review-preparation.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { ReviewKeySchema } from '../../shared/review-resources.js';
import { Value } from '@sinclair/typebox/value';
import type { ReviewProcessReservation, ReviewIntentReceipt, ConfirmedReviewLeaseClosure } from '../../shared/review-native.js';
import { writeCheckpoint } from '../../workflow/code-review/task-review/checkpoint.js';
import { decodePreparationCheckpoint } from '../../workflow/review/preparation-checkpoint.js';
import { reviewJsonLimit } from '../../config/review.js';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';
import { getLogger } from '../../shared/logger.js';
import type { HistoryBoundaryReceipt } from '../../workflow/review/history-binding.js';

export interface ReviewRuntimeHandle { readonly key: Readonly<ReviewKey>; readonly runtimeId: string; }
interface Owner { handle: ReviewRuntimeHandle; current: ReviewRuntime; stamp: string; fenced: boolean; }
type Progress = Pick<ReviewRuntime, 'progress' | 'preparation'>;
const lanes = new Map<string, Promise<void>>();
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
async function safeParents(key: ReviewKey): Promise<void> {
 if (await realpath(key.project) !== key.project) throw new Error('Noncanonical runtime project');
 let current = key.project;
 for (const part of ['.insrc', 'tmp', 'review-runtime', key.family]) {
  current = join(current, part); await mkdir(current, { mode: 0o700 }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
  const st = await lstat(current);
  if (!st.isDirectory() || st.isSymbolicLink() || await realpath(current) !== current) throw new Error('Unsafe runtime parent');
 }
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
   await safeParents(value.key);
   try { await lstat(path); throw new Error('Runtime already exists; explicit recovery required'); }
   catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
   const bytes = JSON.stringify(value) + '\n'; await this.write(path, bytes);
   const handle = Object.freeze({ key: Object.freeze({ ...value.key }), runtimeId: value.runtimeId });
   this.owners.set(handle, { handle, current: value, stamp: hash(bytes), fenced: false }); return handle;
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
   } catch (error) { owner.fenced = true; throw error; }
  });
 }
 async activate(handle: ReviewRuntimeHandle): Promise<void> {
  await this.mutate(handle, async runtime => {
   if (runtime.state !== 'initializing') throw new Error('Runtime is not initializing');
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
   if (value.state !== 'active' || operation === 'open' && value.cancellation) throw new Error('Runtime native admission closed');
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
  this.owner(handle); this.pending.set(handle, structuredClone(progress));
  if (!this.timers.has(handle)) {
   const timer = setTimeout(() => { this.timers.delete(handle); void this.flushProgress(handle).catch(this.progressError); }, 250);
   timer.unref(); this.timers.set(handle, timer);
  }
 }
 async flushProgress(handle: ReviewRuntimeHandle): Promise<void> {
  clearTimeout(this.timers.get(handle)); this.timers.delete(handle);
  const progress = this.pending.get(handle);
  if (!progress) { await serial(reviewRuntimePath(handle.key), async () => { this.owner(handle); }); return; }
  this.pending.delete(handle);
  await this.mutate(handle, value => {
   if (value.state !== 'active' || progress.progress.completedUnits !== value.progress.completedUnits) throw new Error('Progress cannot authorize completed work');
   value.progress = progress.progress;
   if (progress.preparation) value.preparation = progress.preparation;
  });
 }
 /** Called only for the authenticated phase worker's durable history receipt.
  * verify reads the exact current checkpoint digest under that owner's fence. */
 async acceptHistory(handle: ReviewRuntimeHandle, receipt: HistoryBoundaryReceipt, verify: () => Promise<void>): Promise<void> {
  const proof = structuredClone(receipt);
  await this.mutate(handle, async value => {
   if (!same(proof.key, handle.key) || proof.runtimeId !== value.runtimeId || proof.attempt !== value.attempt || proof.inputDigest !== value.checkpointBinding.inputDigest || value.state !== 'active') throw new Error('Foreign runtime history receipt');
   await verify();
   const next = proof.binding, old = value.checkpointBinding;
   if (next.semanticSequence === old.semanticSequence && old.historyBindingDigest === next.bindingDigest) {
    if (proof.completedUnits !== value.progress.completedUnits) throw new Error('Conflicting result replay'); return;
   }
   const initial = old.historyBindingDigest === undefined && old.semanticSequence === 0 && next.semanticSequence === 0 && next.priorBindingDigest === null;
   if (!initial && (next.semanticSequence !== old.semanticSequence + 1 || next.priorBindingDigest !== old.historyBindingDigest)) throw new Error('Runtime history chain mismatch');
   if (proof.completedUnits < value.progress.completedUnits) throw new Error('Committed result count regressed');
   const advanced = proof.completedUnits > value.progress.completedUnits;
   value.checkpointBinding = { ...old, semanticSequence: next.semanticSequence, historyBindingDigest: next.bindingDigest };
   value.progress.completedUnits = proof.completedUnits;
   if (advanced) value.committedResultBoundary = { semanticSequence: next.semanticSequence, historyBindingDigest: next.bindingDigest };
   if (proof.publication) value.publicationBoundary = { semanticSequence: next.semanticSequence, artifactId: proof.publication.artifactId, preservationDigest: proof.publication.preservationDigest };
  });
 }
 /** Explicit owner teardown never removes persisted proof. */
 release(handle: ReviewRuntimeHandle): void {
  const owner = this.owners.get(handle); if (!owner) return;
  clearTimeout(this.timers.get(handle)); this.timers.delete(handle); this.pending.delete(handle);
  owner.fenced = true; this.owners.delete(handle);
 }
}
