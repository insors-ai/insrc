/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants } from 'node:fs';
import { open, mkdir, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { HistoryEvidenceStore, verifyHistoryEvidenceChain } from './history-evidence.js';
import type { CapturedHistoryEvidence } from './history-evidence.js';
import { reviewJsonLimit } from '../../config/review.js';
import { decodeHistoryBinding } from '../../shared/review-preparation.js';
import type { HistoryBinding } from '../../shared/review-preparation.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { writeReviewBytes } from '../code-review/task-review/checkpoint.js';
import { reviewWorkerCheckpoint } from '../../daemon/threads/review-worker-contract.js';
import { decodePreparationCheckpoint } from './preparation-checkpoint.js';
import type { CodePreparationCheckpoint, DesignPreparationCheckpoint } from './preparation-checkpoint.js';
import { preparationDigest, contextRoot } from './prepared-context.js';
import type { ReadyContextReceipt } from './prepared-context.js';
import type { SourceCapacity } from './source-session.js';

export type PreparationHistory = CodePreparationCheckpoint | DesignPreparationCheckpoint;
export interface HistoryValidation { readonly evidence?: readonly CapturedHistoryEvidence[]; readonly publication?: { readonly artifactId: string; readonly preservationDigest: string } | undefined; }
export interface HistoryBoundaryReceipt {
 readonly key: ReviewKey; readonly attempt: number; readonly runtimeId: string; readonly inputDigest: string;
 readonly binding: HistoryBinding; readonly checkpointDigest: string; readonly completedUnits: number;
 readonly publication?: HistoryValidation['publication'];
}
export interface HistoryBindingDeps {
 /** Resolves the current private context borrow; disk references cannot substitute. */
 authorize(): Promise<ReadyContextReceipt>;
 /** Existing family validators, using qualified views and resolving only new evidence. */
 validate(next: PreparationHistory, previous?: PreparationHistory): Promise<HistoryValidation>;
 capacity: SourceCapacity;
 limits: ReviewPreparationLimits;
 invalidateSource(error: unknown): Promise<void>;
 write?: typeof writeReviewBytes | undefined;
}
const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function snapshot(cp: PreparationHistory): unknown {
 const { runtime: _runtime, context: _context, schemaVersion: _version, attempts, ...root } = cp;
 return { ...root, attempts: attempts.map(a => {
  const { progress: _progress, ...rest } = a;
  if ('header' in rest) { const header: Record<string, unknown> = { ...rest.header }; delete header['activeTaskId']; return { ...rest, header }; }
  return rest;
 }) };
}
function attemptOf(cp: PreparationHistory): number { const last = cp.attempts.at(-1)!; return 'header' in last ? last.header.attempt : last.number; }
function completed(cp: PreparationHistory): number { const last = cp.attempts.at(-1)!; return 'review-response' in last ? last['review-response'].tasks.length : 'completedChunks' in last ? last.completedChunks.length : 0; }
function current(input: unknown, source: ReadyContextReceipt): PreparationHistory {
 const value = decodePreparationCheckpoint(input, source.key);
 if (value.format !== 'current' || attemptOf(value.checkpoint) !== source.attempt || value.checkpoint.runtime.inputDigest !== source.inputDigest) throw new Error('Unbound history checkpoint');
 const last = value.checkpoint.attempts.at(-1)!;
 if ('phase' in last && last.phase === 'admission') throw new Error('Unqualified admission cannot bind accepted history');
 return JSON.parse(JSON.stringify(value.checkpoint)) as PreparationHistory;
}
function prefix(previous: PreparationHistory, next: PreparationHistory): void {
 if (previous.attempts.length !== next.attempts.length || !same(previous.runtime, next.runtime)) throw new Error('History session cannot append attempts or replace runtime');
 const before = snapshot(previous) as { attempts: Record<string, unknown>[] }, after = snapshot(next) as { attempts: Record<string, unknown>[] };
 const { attempts: _before, ...oldRoot } = before, { attempts: _after, ...newRoot } = after;
 if (!same(oldRoot, newRoot) || !same(before.attempts.slice(0, -1), after.attempts.slice(0, -1))) throw new Error('Earlier history changed; descendant bindings revoked');
 const old = before.attempts.at(-1)!, now = after.attempts.at(-1)!;
 if ('header' in old) {
  const a = old['header'] as Record<string, unknown>, b = now['header'] as Record<string, unknown>;
  for (const key of ['attempt', 'reviewer', 'createdAt', 'selectedTaskIds', 'finalScopeIdentity']) if (!same(a[key], b[key])) throw new Error('Pinned review identity/scope changed');
  if (!same(old['submitted'], now['submitted'])) throw new Error('Pinned review submission changed');
  for (const key of ['acceptedAttribution', 'taskScopeIdentities', 'attributionIdentity', 'taskIdentityFormat']) if (a['attributionState'] === 'accepted' && !same(a[key], b[key])) throw new Error('Accepted attribution changed');
  const oldResults = (old['review-response'] as { tasks: unknown[] }).tasks, newResults = (now['review-response'] as { tasks: unknown[] }).tasks;
  if (!same(oldResults, newResults.slice(0, oldResults.length))) throw new Error('Accepted task feedback changed');
  const acceptedTasks = new Set(oldResults.map(result => (result as { taskId: string }).taskId));
  const oldOrigins = (old['review-response'] as { origins?: { taskId: string }[] }).origins ?? [];
  const newOrigins = (now['review-response'] as { origins?: { taskId: string }[] }).origins ?? [];
  if (!same(oldOrigins, newOrigins.filter(origin => acceptedTasks.has(origin.taskId)))) throw new Error('Accepted task origins changed');

 } else {
  for (const key of ['number', 'reviewer', 'baseline', 'inventory', 'startedAt', 'submitted']) if (!same(old[key], now[key])) throw new Error('Pinned design attempt changed');
  for (const key of ['plan', 'impact', 'report']) if (old[key] !== undefined && !same(old[key], now[key])) throw new Error('Accepted design plan/report changed');
  const oldResults = old['completedChunks'] as unknown[], newResults = now['completedChunks'] as unknown[];
  if (!same(oldResults, newResults.slice(0, oldResults.length))) throw new Error('Accepted chunk feedback changed');
 }
}
async function bounded(path: string): Promise<string> {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const st = await file.stat(); if (!st.isFile() || st.size > reviewJsonLimit()) throw new Error('History record exceeds bound');
  const bytes = Buffer.alloc(st.size + 1); let offset = 0;
  while (offset < bytes.length) { const n = await file.read(bytes, offset, bytes.length - offset, null); if (!n.bytesRead) break; offset += n.bytesRead; }
  if (offset !== st.size) throw new Error('History record changed while reading'); return bytes.subarray(0, offset).toString('utf8');
 } finally { await file.close(); }
}
export class HistoryBindingSaveError extends Error {
 constructor(cause: unknown, readonly bindingPath: string, readonly capacityToken: string | undefined) { super('History commit incomplete; explicit reconciliation required', { cause }); }
}

/** Main-side durability check after obtaining expectedSource from the current
 * private context registry. No source preparation or provider is invoked. */
export async function verifyHistoryBoundaryReceipt(receipt: HistoryBoundaryReceipt, expectedSource: ReadyContextReceipt): Promise<void> {
 const raw = await bounded(reviewWorkerCheckpoint(expectedSource.key)), cp = current(JSON.parse(raw), expectedSource);
 const binding = decodeHistoryBinding(receipt.binding, expectedSource.key, reviewJsonLimit());
 if (!same(receipt.key, expectedSource.key) || receipt.attempt !== expectedSource.attempt || receipt.runtimeId !== cp.runtime.runtimeId || receipt.inputDigest !== expectedSource.inputDigest
  || digest(raw) !== receipt.checkpointDigest || receipt.completedUnits !== completed(cp) || binding.attempt !== expectedSource.attempt || binding.generationId !== expectedSource.generationId
  || binding.historyPrefixDigest !== preparationDigest(snapshot(cp)) || binding.bindingDigest !== preparationDigest({ ...binding, bindingDigest: '' })
  || cp.context?.generationId !== binding.generationId || cp.context.manifestDigest !== expectedSource.manifestDigest || cp.context.historyBindingDigest !== binding.bindingDigest) throw new Error('Unverified durable history boundary');
 await verifyHistoryEvidenceChain(expectedSource, binding.evidenceManifestDigest);
 const stored = decodeHistoryBinding(JSON.parse(await bounded(join(contextRoot(expectedSource.key), 'history-bindings', `${binding.bindingDigest}.json`))), expectedSource.key, reviewJsonLimit());
 if (!same(stored, binding)) throw new Error('Durable history binding replaced');
 const last = cp.attempts.at(-1)!, published = 'review-response' in last ? last['review-response'].crPublication === 'complete' : 'publication' in last && last.publication?.state === 'complete';
 if (published !== Boolean(receipt.publication)) throw new Error('Unverified permanent publication boundary');
}

/** Per-phase worker object. Accepted source qualification is stable; each
 * semantic feedback boundary gets its own immutable history binding. */
export class HistoryBindingSession {
 private previous: PreparationHistory | undefined;
 private binding: HistoryBinding | undefined;
 private receipt: HistoryBoundaryReceipt | undefined;
 private pending: { checkpoint: PreparationHistory; binding: HistoryBinding; validation: HistoryValidation } | undefined;
 private evidence!: HistoryEvidenceStore;
 private failed = false;
 private tail: Promise<void> = Promise.resolve();
 private constructor(private readonly source: ReadyContextReceipt, private readonly deps: HistoryBindingDeps) {}
 static async open(source: ReadyContextReceipt, input: unknown, deps: HistoryBindingDeps): Promise<HistoryBindingSession> {
  const session = new HistoryBindingSession(structuredClone(source), deps);
  await session.authorize(); const cp = current(input, source);
  const actual = current(JSON.parse(await bounded(reviewWorkerCheckpoint(source.key))), source);
  if (!same(actual, cp)) throw new Error('History input is not the committed checkpoint');
  if (cp.context) {
   if (cp.context.generationId !== source.generationId || cp.context.manifestDigest !== source.manifestDigest) throw new Error('History needs explicit source requalification/rebind');
   const binding = await session.readBinding(cp.context.historyBindingDigest);
   session.verifyBinding(cp, binding);
   session.evidence = await HistoryEvidenceStore.open(source, deps.capacity, deps.limits, deps.authorize, deps.invalidateSource, binding.evidenceManifestDigest);
   const validation = await deps.validate(cp);
   if (await session.evidence.append(validation.evidence) !== binding.evidenceManifestDigest) throw new Error('Accepted history evidence was not preserved');
   session.previous = structuredClone(cp); session.binding = binding;
   session.receipt = await session.observe(cp, binding, validation); return session;
  }
  session.evidence = await HistoryEvidenceStore.open(source, deps.capacity, deps.limits, deps.authorize, deps.invalidateSource);
  await session.commit(cp); return session;
 }
 private async authorize(): Promise<void> { if (!same(await this.deps.authorize(), this.source)) throw new Error('History source borrow changed'); }
 private async directory(): Promise<string> {
  const root = contextRoot(this.source.key);
  if (await realpath(root) !== root) throw new Error('Unsafe history-binding root');
  const directory = join(root, 'history-bindings');
  await mkdir(directory, { mode: 0o700 }).catch(e => { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; });
  const st = await lstat(directory); if (!st.isDirectory() || st.isSymbolicLink() || await realpath(directory) !== directory) throw new Error('Unsafe history-binding directory'); return directory;
 }
 private async readBinding(id: string): Promise<HistoryBinding> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid history binding id');
  const binding = decodeHistoryBinding(JSON.parse(await bounded(join(await this.directory(), `${id}.json`))), this.source.key, reviewJsonLimit());
  if (binding.bindingDigest !== id || preparationDigest({ ...binding, bindingDigest: '' }) !== id) throw new Error('History binding digest mismatch'); return binding;
 }
 private verifyBinding(cp: PreparationHistory, binding: HistoryBinding): void {
  if (binding.attempt !== this.source.attempt || binding.generationId !== this.source.generationId || binding.historyPrefixDigest !== preparationDigest(snapshot(cp))) throw new Error('History binding disagrees with preserved feedback');
 }
 private async observe(cp: PreparationHistory, binding: HistoryBinding, validation: HistoryValidation): Promise<HistoryBoundaryReceipt> {
  const raw = await bounded(reviewWorkerCheckpoint(this.source.key));
  if (!same(JSON.parse(raw), cp)) throw new Error('History changed after commit');
  return { key: this.source.key, attempt: this.source.attempt, runtimeId: cp.runtime.runtimeId, inputDigest: this.source.inputDigest, binding: structuredClone(binding), checkpointDigest: digest(raw), completedUnits: completed(cp), ...(validation.publication ? { publication: validation.publication } : {}) };
 }
 private async commit(input: PreparationHistory): Promise<HistoryBoundaryReceipt> {
  await this.authorize();
  const cp = structuredClone(input);
  if (this.previous) {
   const actual = await bounded(reviewWorkerCheckpoint(this.source.key));
   if (digest(actual) !== this.receipt!.checkpointDigest) throw new Error('Checkpoint replaced outside history owner');
   prefix(this.previous, cp);
   if (preparationDigest(snapshot(cp)) === this.binding!.historyPrefixDigest) return structuredClone(this.receipt!);
  }
  const validation = await this.deps.validate(cp, this.previous && structuredClone(this.previous));
  const evidenceHead = await this.evidence.append(validation.evidence);
  const binding: HistoryBinding = { schemaVersion: 1, key: this.source.key, attempt: this.source.attempt, generationId: this.source.generationId,
   priorBindingDigest: this.binding?.bindingDigest ?? null, semanticSequence: this.binding ? this.binding.semanticSequence + 1 : 0,
   historyPrefixDigest: preparationDigest(snapshot(cp)), evidenceManifestDigest: evidenceHead, bindingDigest: '' };
  binding.bindingDigest = preparationDigest(binding); decodeHistoryBinding(binding, this.source.key, reviewJsonLimit());
  cp.context = { generationId: this.source.generationId, manifestDigest: this.source.manifestDigest, historyBindingDigest: binding.bindingDigest };
  current(cp, this.source); const path = join(await this.directory(), `${binding.bindingDigest}.json`), bytes = JSON.stringify(binding) + '\n';
  let token: string | undefined;
  this.pending = { checkpoint: cp, binding, validation };
  try {
   token = await this.deps.capacity.reserve(Buffer.byteLength(bytes) * 2 + 512);
   await (this.deps.write ?? writeReviewBytes)(path, bytes, reviewJsonLimit()); await this.deps.capacity.commit(token, Buffer.byteLength(bytes));
   await (this.deps.write ?? writeReviewBytes)(reviewWorkerCheckpoint(this.source.key), JSON.stringify(cp) + '\n', reviewJsonLimit());
   const receipt = await this.observe(cp, binding, validation);
   this.previous = structuredClone(cp); this.binding = binding; this.receipt = receipt; this.pending = undefined; return structuredClone(receipt);
  } catch (error) { this.failed = true; throw new HistoryBindingSaveError(error, path, token); }
 }
 accept(input: unknown): Promise<HistoryBoundaryReceipt> {
  const candidate = current(input, this.source);
  const work = this.tail.then(async () => { if (this.failed) throw new Error('History owner fenced; explicit reconciliation required'); try { return await this.commit(candidate); } catch (error) { this.failed = true; throw error; } });
  this.tail = work.then(() => {}, () => {}); return work;
 }
 latest(): HistoryBoundaryReceipt { if (!this.receipt || this.failed) throw new Error('History boundary unavailable/fenced'); return structuredClone(this.receipt); }
 /** Explicit recovery only: accepted feedback was already validated before
  * the failed save. Compare actual files; do not rerun a provider or sources. */
 async reconcile(): Promise<HistoryBoundaryReceipt> {
  await this.tail; await this.authorize(); const pending = this.pending;
  if (!pending || !this.failed) throw new Error('No interrupted accepted history to reconcile');
  const actual = current(JSON.parse(await bounded(reviewWorkerCheckpoint(this.source.key))), this.source);
  if (!same(actual, pending.checkpoint)) throw new Error('Candidate feedback was not committed; explicit recovery/new attempt required');
  const binding = await this.readBinding(pending.binding.bindingDigest); this.verifyBinding(actual, binding);
  await this.evidence.restore(binding.evidenceManifestDigest);
  const receipt = await this.observe(actual, binding, pending.validation);
  this.previous = structuredClone(actual); this.binding = binding; this.receipt = receipt; this.pending = undefined; this.failed = false; return structuredClone(receipt);
 }
}
