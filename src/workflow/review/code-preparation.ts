import type { ReviewAdmissionPreparer } from '../code-review/task-review/admission.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewPreparationLimits } from '../../config/review.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { prepareReviewAdmission } from '../code-review/task-review/admission.js';
import type { ReviewAdmissionContext } from '../code-review/task-review/admission.js';
import { prepareWorkerCodeAdmission } from '../code-review/task-review/worker-checkpoint.js';
import { prepareReviewPacket } from '../code-review/task-review/packet.js';
import type { PreparedReviewPacket, PacketPreparer } from '../code-review/task-review/packet.js';
import type { AdmittedReview } from '../code-review/task-review/execution.js';
import type { ReviewSources, BatchReviewSources } from '../code-review/task-review/sources.js';
import { ReviewSourceSession } from './source-session.js';
import type { SourceCapacity } from './source-session.js';
import { preparationDigest } from './prepared-context.js';
import type { ReadyContextReceipt, PreparedSourceIdentity } from './prepared-context.js';
import { materializePreparedValue, PreparedViewReader, PreparedViewWriter } from './prepared-views.js';
import { ReviewMemoryBudget } from './preparation-memory.js';

/** One private preparation phase. Route resolution and every semantic check
 * remain in the existing admission/packet implementations. This object only
 * owns bounded source reuse and the immutable prepared views they produce. */
export class CodePreparation {
 private readonly staged = new Set<string>();
 private readonly packetIds = new WeakMap<object, string>();
 private writer: PreparedViewWriter | undefined;
 private tail: Promise<void> = Promise.resolve();
 private failed = false;
 private sealed = false;
 private identity: PreparedSourceIdentity | undefined;
 private constructor(readonly sources: ReviewSources, private readonly key: ReviewKey,
  private readonly session: ReviewSourceSession | undefined,
  private readonly reader: PreparedViewReader | undefined,
  private readonly limits: ReviewPreparationLimits, private readonly capacity: SourceCapacity) {}
 static async create(key: ReviewKey, sources: BatchReviewSources, limits: ReviewPreparationLimits, capacity: SourceCapacity, memory = new ReviewMemoryBudget(limits.memoryMaxBytes)): Promise<CodePreparation> {
  if (key.family !== 'code') throw new Error('Code preparation required');
  const session = await ReviewSourceSession.create(key, sources, limits, capacity, memory);
  return new CodePreparation(session, key, session, undefined, limits, capacity);
 }
 /** Reader must come from a live host-issued borrow. Disk alone grants no access. */
 static async reuse(key: ReviewKey, reader: PreparedViewReader, sources: ReviewSources, limits: ReviewPreparationLimits, capacity: SourceCapacity): Promise<CodePreparation> {
  if (key.family !== 'code' || !same(key, reader.receipt.key)) throw new Error('Code preparation context identity mismatch');
  return new CodePreparation(sources, key, undefined, reader, limits, capacity);
 }
 private readonly packet: PacketPreparer = async (input, sources, historical = false, route, stored) => {
  if (this.failed) throw new Error('Code preparation owner fenced');
  const id = preparationDigest([input, historical, route, stored]);
  if (this.reader) {
   const descriptor = await this.reader.descriptor(`packet-${id}`, 'packet');
   const window = await this.reader.metadata(descriptor);
   try {
    const prepared = await materializePreparedValue(this.reader, window.value) as PreparedReviewPacket;
    if (!prepared || typeof prepared !== 'object') throw new Error('Invalid qualified packet');
    return structuredClone(prepared);
   } finally { window.release(); }
  }
  const prepared = await prepareReviewPacket(input, this.sources, historical, route, stored);
  this.packetIds.set(prepared, id);
  return prepared;
 };
 private async begin(attempt: number, input: unknown): Promise<void> {
  if (this.reader || this.writer) return;
  if (!this.session) throw new Error('Code preparation construction source missing');
  const submitted = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const inputDigest = preparationDigest(input ?? null);
  const identity: PreparedSourceIdentity = { key: this.key, attempt, inputDigest, validatorVersion: 2,
   routeDigest: preparationDigest(['stored-route', submitted['storyId'], submitted['taskId']]),
   sourceIdentity: preparationDigest([submitted['reviewRevision'], submitted['reviewSet']]),
   scopeDigest: preparationDigest([submitted['storyId'], submitted['taskId'], submitted['reviewSet']]),
   testDocumentDigest: preparationDigest([submitted['tests'], submitted['documents']]) };
  this.writer = await PreparedViewWriter.create(identity, this.limits, this.capacity, this.session.workingMemory, this.session);
  this.identity = identity;
 }
 private async stage(prepared: PreparedReviewPacket): Promise<void> {
  const id = this.packetIds.get(prepared);
  if (!id || !this.writer) throw new Error('Foreign prepared packet');
  if (this.staged.has(id)) return;
  await this.writer.add(`packet-${id}`, 'packet', prepared);
  this.staged.add(id);
 }
 /** Same signature used by both task/story coordinators and worker recovery. */
 readonly prepare: ReviewAdmissionPreparer = (project, id, attempt, input, reviewer, _sources, context = {}) => {
  const work = this.tail.then(async () => {
   if (this.failed || this.sealed || project !== this.key.project || id !== this.key.reviewId || this.reader && attempt !== this.reader.receipt.attempt) throw new Error('Code preparation unavailable or foreign');
   try { await this.begin(attempt, input); return await prepareReviewAdmission(project, id, attempt, input, reviewer, this.sources, this.context(context)); }
   catch (error) { this.failed = true; throw error; }
  });
  this.tail = work.then(() => {}, () => {}); return work;
 };
 /** Dedicated worker execution and explicit recovery use the same packet adapter. */
 readonly workerPrepare: typeof prepareWorkerCodeAdmission = async (project, id, attempt, input, reviewer, _sources, context = {}) => {
  if (this.failed || this.sealed || project !== this.key.project || id !== this.key.reviewId || this.reader && attempt !== this.reader.receipt.attempt) throw new Error('Code preparation unavailable or foreign');
  try { await this.begin(attempt, input); return await prepareWorkerCodeAdmission(project, id, attempt, input, reviewer, this.sources, this.context(context)); }
  catch (error) { this.failed = true; throw error; }
 };
 /** Used by the durable-admission adapter without a second preparation path. */
 context(context: ReviewAdmissionContext = {}): ReviewAdmissionContext { return { ...context, preparePacket: this.packet,
  afterHistoricalPacket: async (prepared, entry, retained) => { await context.afterHistoricalPacket?.(prepared, entry, retained); if (!retained) await this.stage(prepared); } }; }
 /** Publication reads the same qualified historical views as recovery. */
 readonly publicationPacket: PacketPreparer = (...args) => this.packet(...args);
 async seal(review: AdmittedReview): Promise<ReadyContextReceipt> {
  await this.tail;
  if (this.failed || this.sealed || !this.session || !this.writer || review.checkpoint.project !== this.key.project || review.checkpoint.reviewId !== this.key.reviewId
   || !this.packetIds.has(review.prepared)) throw new Error('Cannot seal unqualified code preparation');
  // Feedback/publication deliberately re-enters the historical validator
  // signature. Stage that exact derived identity one attempt at a time; do
  // not retain the reconstructed packets as a second history inventory.
  for (const entry of review.checkpoint.attempts) {
   const historical = await this.packet(entry.submitted, this.sources, true, undefined, entry.header.derived);
   await this.stage(historical);
  }
  await this.stage(review.prepared);
  this.sealed = true;
  return this.writer.seal();
 }
 /** Lookup metadata for the private main qualification channel, not a borrow. */
 qualificationIdentity(): PreparedSourceIdentity {
  if (!this.identity) throw new Error('Code preparation has not sealed a context');
  return structuredClone(this.identity);
 }
 observeSources(observer: Parameters<ReviewSourceSession['observe']>[0]): () => void { return this.session?.observe(observer) ?? (() => {}); }
 sourceMetrics(): ReturnType<ReviewSourceSession['snapshot']> | undefined { return this.session?.snapshot(); }
 async close(): Promise<void> { await this.tail; this.failed = true; this.reader?.close(); if (this.writer && !this.sealed) await this.writer.discard(); await this.session?.close(); }
}
