/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isMainThread, MessageChannel } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { isDeepStrictEqual as same } from 'node:util';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { reviewPreparationLimits } from '../../config/review.js';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { ReviewRuntimeSchema, REVIEW_RUNTIME_MAX_BYTES } from '../../shared/review-preparation.js';
import type { PreparationAccess, ReviewRuntime } from '../../shared/review-preparation.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { ReviewPreparationCapacity } from '../../workflow/review/source-session.js';
import type { PreparedSourceIdentity, ReadyContextReceipt } from '../../workflow/review/prepared-context.js';
import { verifyHistoryBoundaryReceipt, readBoundPreparationHistory } from '../../workflow/review/history-binding.js';
import { publicationProof } from '../../workflow/review/publication-proof.js';
import type { HistoryBoundaryReceipt } from '../../workflow/review/history-binding.js';
import { ReviewRuntimeStore } from './review-runtime-store.js';
import type { ReviewRuntimeHandle } from './review-runtime-store.js';
import { ReviewContextRegistry } from './review-context-registry.js';
import type { ContextPhaseIdentity } from './review-context-registry.js';
import { serveHub } from './channel.js';
import type { HubHandlers } from './channel.js';

const keyOf = (key: ReviewKey) => JSON.stringify([key.project, key.family, key.reviewId]);
const progressSchema = Type.Pick(ReviewRuntimeSchema, ['progress', 'preparation'], { additionalProperties: false });
function fields(raw: unknown, names: readonly string[]): Record<string, unknown> {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== names.length || names.some(name => !Object.hasOwn(raw, name))
  || Buffer.byteLength(JSON.stringify(raw)) > REVIEW_RUNTIME_MAX_BYTES) throw new Error('Invalid private preparation request');
 return raw as Record<string, unknown>;
}
interface Allocation { owner: string; key: string; project: string; bytes: number; retained: boolean; }
export interface PreparationConnection { readonly port: MessagePort; close(): Promise<void>; }

/** Private ports are attached by main to an already-owned exact worker phase.
 * No public request can choose a runtime handle, owner or project allocator. */
export class ReviewPreparationHost {
 private readonly projects = new Map<string, ReviewPreparationCapacity>();
 private readonly generations = new Map<string, Set<string>>();
 private readonly phases = new Map<string, number>();
 private readonly cleaning = new Set<string>();
 private readonly allocations = new Map<string, Allocation>();
 private readonly contexts: ReviewContextRegistry;
 constructor(readonly runtimes: ReviewRuntimeStore, epoch: string,
  private readonly assertCurrent: (identity: ContextPhaseIdentity) => Promise<void>,
  assertDisposed: (identity: ContextPhaseIdentity) => Promise<void>,
  private readonly limits: (project: string) => ReviewPreparationLimits = () => reviewPreparationLimits(),
  private readonly onProgress: (identity: ContextPhaseIdentity, progress: Pick<ReviewRuntime, 'progress' | 'preparation'>) => void = () => {},
  private readonly closeNativeForPublication?: (identity: ContextPhaseIdentity) => Promise<void>) {
  if (!isMainThread) throw new Error('Preparation host must live on main');
  this.contexts = new ReviewContextRegistry(epoch, assertCurrent, assertDisposed, async receipt => {
   const allocation = this.allocation(receipt.key, receipt.capacityToken);
   this.capacity(receipt.key.project).assertReserved(receipt.capacityToken, receipt.storedBytes);
   if (allocation.bytes !== receipt.storedBytes) throw new Error('Unbound retained context capacity');
  });
 }
 private capacity(project: string): ReviewPreparationCapacity {
  let value = this.projects.get(project);
  if (!value) { value = new ReviewPreparationCapacity(this.limits(project).cacheMaxBytes); this.projects.set(project, value); }
  return value;
 }
 private allocation(key: ReviewKey, token: unknown, mutable = false, owner?: string): Allocation {
  const value = typeof token === 'string' && this.allocations.get(token);
  if (!value || value.key !== keyOf(key) || owner !== undefined && value.owner !== owner || mutable && value.retained) throw new Error('Foreign, unknown or retained preparation allocation');
  return value;
 }
 async connect(identity: ContextPhaseIdentity, runtime: ReviewRuntimeHandle): Promise<PreparationConnection> {
  if (this.cleaning.has(keyOf(identity.key))) throw new Error('Preparation cleanup in progress');
  await this.assertCurrent(identity);
  if (this.cleaning.has(keyOf(identity.key))) throw new Error('Preparation cleanup in progress');
  const initial = this.runtimes.snapshot(runtime);
  if (!same(identity.key, runtime.key) || initial.attempt !== identity.attempt || initial.workerIncarnation !== identity.incarnation || initial.state !== 'active') throw new Error('Foreign preparation runtime');
  const review = keyOf(identity.key), phaseId = JSON.stringify([review, identity.incarnation, identity.attempt, identity.phase]);
  // Reserve the phase before awaiting registry attachment. Cleanup must not
  // pass its no-borrowers check while an attachment is in flight.
  this.phases.set(review, (this.phases.get(review) ?? 0) + 1);
  let owner;
  try { owner = await this.contexts.attach(identity); }
  catch(error) { const count = this.phases.get(review)! - 1; if(count)this.phases.set(review,count);else this.phases.delete(review); throw error; }
  const { port1, port2 } = new MessageChannel(), capacity = this.capacity(identity.key.project);
  let closed = false, detached = false, tail: Promise<void> = Promise.resolve();
  const active = async (method: string) => {
   if (closed) throw new Error('Preparation phase closed'); await this.assertCurrent(identity);
   const state = this.runtimes.snapshot(runtime);
   const closedPublication = state.state === 'terminal' && ['runtime.publication', 'runtime.history', 'context.resolve', 'context.release'].includes(method);
   if (closed || state.state !== 'active' && !closedPublication || state.cancellation) throw new Error('Preparation owner fenced');
  };
  const expected = (value: PreparedSourceIdentity) => {
   if (!same(value.key, identity.key) || value.attempt !== identity.attempt || value.inputDigest !== this.runtimes.snapshot(runtime).checkpointBinding.inputDigest) throw new Error('Foreign prepared input');
  };
  const add = (token: string, bytes: number) => { this.allocations.set(token, { owner: phaseId, key: keyOf(identity.key), project: identity.key.project, bytes, retained: false }); };
  const work: HubHandlers = {
   'capacity.reserve': async raw => { const p = fields(raw, ['bytes']); if (this.allocations.size >= 100000) throw new Error('Preparation allocation inventory exhausted'); const token = await capacity.reserve(p['bytes'] as number); add(token, p['bytes'] as number); return token; },
   'capacity.commit': async raw => { const p = fields(raw, ['token', 'bytes']), allocation = this.allocation(identity.key, p['token'], true, phaseId); await capacity.commit(p['token'] as string, p['bytes'] as number); allocation.bytes = p['bytes'] as number; },
   'capacity.release': async raw => { const p = fields(raw, ['token']); this.allocation(identity.key, p['token'], true, phaseId); await capacity.release(p['token'] as string); this.allocations.delete(p['token'] as string); },
   'capacity.split': async raw => {
    const p = fields(raw, ['token', 'bytes']); this.allocation(identity.key, p['token'], true, phaseId);
    if (!Array.isArray(p['bytes']) || p['bytes'].length > 10000 || this.allocations.size + p['bytes'].length > 100000) throw new Error('Invalid capacity split');
    const bytes = p['bytes'] as number[], tokens = await capacity.split(p['token'] as string, bytes); this.allocations.delete(p['token'] as string);
    tokens.forEach((token, i) => add(token, bytes[i]!)); return tokens;
   },
   'capacity.combine': async raw => {
    const p = fields(raw, ['tokens']); if (!Array.isArray(p['tokens']) || p['tokens'].length > 100000) throw new Error('Invalid capacity consolidation');
    const tokens = p['tokens'] as string[], bytes = tokens.reduce((sum, token) => sum + this.allocation(identity.key, token, true, phaseId).bytes, 0);
    const token = await capacity.combine(tokens); for (const old of tokens) this.allocations.delete(old); add(token, bytes); return token;
   },
   'context.qualify': async raw => {
    const p = fields(raw, ['identity', 'receipt']), source = p['identity'] as PreparedSourceIdentity, receipt = p['receipt'] as ReadyContextReceipt; expected(source);
    this.allocation(identity.key, receipt.capacityToken, false, phaseId);
    await this.contexts.qualify(owner, source, receipt); this.allocation(identity.key, receipt.capacityToken, false, phaseId).retained = true;
    const generations = this.generations.get(review) ?? new Set<string>(); generations.add(receipt.generationId); this.generations.set(review, generations);
   },
   'context.borrow': async raw => { const p = fields(raw, ['identity']), source = p['identity'] as PreparedSourceIdentity; expected(source); return this.contexts.borrow(owner, source); },
   'context.resolve': async raw => { const p = fields(raw, ['access']); return this.contexts.resolve(owner, p['access'] as PreparationAccess); },
   'context.release': async raw => { const p = fields(raw, ['access']); await this.contexts.release(owner, p['access'] as PreparationAccess); },
   'context.invalidate': async raw => { const p = fields(raw, ['access']); await this.contexts.invalidate(owner, p['access'] as PreparationAccess); },
   'runtime.progress': raw => {
    if (!Value.Check(progressSchema, raw)) throw new Error('Invalid preparation progress');
    if (raw.progress.completedUnits !== this.runtimes.snapshot(runtime).progress.completedUnits || raw.preparation && raw.preparation.total !== null && raw.preparation.logicalCompleted > raw.preparation.total) throw new Error('Progress cannot authorize completed work');
    this.runtimes.publishProgress(runtime, raw);
    this.onProgress(identity, structuredClone(raw));
   },
   'runtime.history': async raw => {
    const p = fields(raw, ['access', 'receipt']), source = await this.contexts.resolve(owner, p['access'] as PreparationAccess), receipt = p['receipt'] as HistoryBoundaryReceipt;
    await this.runtimes.acceptHistory(runtime, receipt, () => verifyHistoryBoundaryReceipt(receipt, source));
    for (const allocation of this.allocations.values()) if (allocation.key === keyOf(identity.key) && allocation.owner === phaseId) allocation.retained = true;
   },
   'runtime.publication': async raw => {
    const p = fields(raw, ['access', 'receipt']), source = await this.contexts.resolve(owner, p['access'] as PreparationAccess), receipt = p['receipt'] as HistoryBoundaryReceipt;
    if (!this.closeNativeForPublication) throw new Error('Main native publication closure unavailable');
    const audit = await this.runtimes.sealPublication(runtime, receipt, () => verifyHistoryBoundaryReceipt(receipt, source), () => this.closeNativeForPublication!(identity));
    return publicationProof(audit, receipt, source, await readBoundPreparationHistory(receipt, source));
   },
  };
  const handlers: HubHandlers = Object.fromEntries(Object.entries(work).map(([name, handler]) => [name, (raw: unknown) => {
   const result = tail.then(async () => { await active(name); const value = await handler(raw); await active(name); return value; });
   tail = result.then(() => {}, () => {}); return result;
  }]));
  const stop = serveHub(port1, handlers);
  return { port: port2, close: async () => {
   closed = true; stop(); port1.close(); await tail;
   // Detach requires main-confirmed actual disposal; failure retains borrows
   // and all allocations. Worker reclamation never refunds disk capacity.
   if (!detached) { await this.contexts.detach(owner); detached = true; const count = this.phases.get(review)! - 1; if (count) this.phases.set(review, count); else this.phases.delete(review); }
  } };
 }
 /** Called only after the approved cleanup worker proves all exact owned
  * temporary files removed. This proof callback is supplied by main, not JSON. */
 async releaseCleaned(key: ReviewKey, verifyDeleted: () => Promise<void>): Promise<void> {
  const review = keyOf(key);
  if (this.cleaning.has(review) || this.phases.has(review)) throw new Error('Preparation still borrowed or cleaning');
  this.cleaning.add(review);
  try {
   await verifyDeleted();
   const generations = this.generations.get(review);
   for (const id of generations ?? []) { this.contexts.evict(id); generations!.delete(id); }
   this.generations.delete(review);
   for (const [token, allocation] of this.allocations) if (allocation.key === review) { await this.capacity(allocation.project).release(token); this.allocations.delete(token); }
  } finally { this.cleaning.delete(review); }
 }
 reservedBytes(project: string): number { return this.projects.get(project)?.bytes ?? 0; }
}
