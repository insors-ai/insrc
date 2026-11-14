/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewPreparationLimits } from '../../config/review.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { prepareReviewAdmission } from '../code-review/task-review/admission.js';
import type { ReviewAdmissionContext } from '../code-review/task-review/admission.js';
import { prepareWorkerCodeAdmission } from '../code-review/task-review/worker-checkpoint.js';
import { prepareReviewPacket } from '../code-review/task-review/packet.js';
import type { PreparedReviewPacket } from '../code-review/task-review/packet.js';
import type { AdmittedReview } from '../code-review/task-review/execution.js';
import type { ReviewSources, BatchReviewSources } from '../code-review/task-review/sources.js';
import { ReviewSourceSession } from './source-session.js';
import type { SourceCapacity } from './source-session.js';
import { preparationDigest, writePreparedContext } from './prepared-context.js';
import type { PreparedContextReader, ReadyContextReceipt } from './prepared-context.js';

/** One private preparation phase. Route resolution and every semantic check
 * remain in the existing admission/packet implementations. This object only
 * owns bounded source reuse and the immutable prepared views they produce. */
export class CodePreparation {
 private readonly packets = new Map<string, PreparedReviewPacket>();
 private readonly routes = new Map<string, unknown>();
 private tail: Promise<void> = Promise.resolve();
 private failed = false;
 private sealed = false;
 private packetBytes = 0;
 private constructor(readonly sources: ReviewSources, private readonly key: ReviewKey,
  private readonly session: ReviewSourceSession | undefined,
  private readonly reader: PreparedContextReader | undefined,
  private readonly limits: ReviewPreparationLimits, private readonly capacity: SourceCapacity) {}
 static async create(key: ReviewKey, sources: BatchReviewSources, limits: ReviewPreparationLimits, capacity: SourceCapacity): Promise<CodePreparation> {
  if (key.family !== 'code') throw new Error('Code preparation required');
  const session = await ReviewSourceSession.create(key, sources, limits, capacity);
  return new CodePreparation(session, key, session, undefined, limits, capacity);
 }
 /** Reader must come from a live host-issued borrow. Disk alone grants no access. */
 static async reuse(key: ReviewKey, reader: PreparedContextReader, sources: ReviewSources, limits: ReviewPreparationLimits, capacity: SourceCapacity): Promise<CodePreparation> {
  if (key.family !== 'code' || !same(key, reader.receipt.key)) throw new Error('Code preparation context identity mismatch');
  const result = new CodePreparation(sources, key, undefined, reader, limits, capacity);
  const inventory = await reader.view('code-packets') as [string, PreparedReviewPacket][];
  if (!Array.isArray(inventory) || inventory.length > 10000) throw new Error('Invalid qualified packet inventory');
  for (const [id, prepared] of inventory) {
   if (!/^[a-f0-9]{64}$/.test(id) || result.packets.has(id)) throw new Error('Invalid qualified packet key');
   result.packets.set(id, prepared);
  }
  return result;
 }
 private readonly packet: typeof prepareReviewPacket = async (input, sources, historical = false, route, stored) => {
  if (this.failed) throw new Error('Code preparation owner fenced');
  const id = preparationDigest([input, historical, route, stored]);
  const cached = this.packets.get(id);
  if (cached) { if (this.reader) await this.reader.verify(); return structuredClone(cached); }
  if (this.reader) throw new Error('Prepared packet identity changed; explicit source requalification required');
  if (this.packets.size >= 10000) throw new Error('Prepared packet inventory exceeds capacity');
  const prepared = await prepareReviewPacket(input, this.sources, historical, route, stored);
  this.packetBytes += Buffer.byteLength(JSON.stringify(prepared));
  if (this.packetBytes > this.limits.memoryMaxBytes) throw new Error('Prepared packet views exceed memory capacity');
  this.packets.set(id, prepared); if (route) this.routes.set(preparationDigest(route), structuredClone(route));
  return prepared;
 };
 /** Same signature used by both task/story coordinators and worker recovery. */
 readonly prepare: typeof prepareReviewAdmission = (project, id, attempt, input, reviewer, _sources, context = {}) => {
  const work = this.tail.then(async () => {
   if (this.failed || this.sealed || project !== this.key.project || id !== this.key.reviewId || this.reader && attempt !== this.reader.receipt.attempt) throw new Error('Code preparation unavailable or foreign');
   try { return await prepareReviewAdmission(project, id, attempt, input, reviewer, this.sources, { ...context, preparePacket: this.packet }); }
   catch (error) { this.failed = true; throw error; }
  });
  this.tail = work.then(() => {}, () => {}); return work;
 };
 /** Dedicated worker execution and explicit recovery use the same packet adapter. */
 readonly workerPrepare: typeof prepareWorkerCodeAdmission = async (project, id, attempt, input, reviewer, _sources, context = {}) => {
  if (this.failed || this.sealed || project !== this.key.project || id !== this.key.reviewId || this.reader && attempt !== this.reader.receipt.attempt) throw new Error('Code preparation unavailable or foreign');
  try { return await prepareWorkerCodeAdmission(project, id, attempt, input, reviewer, this.sources, this.context(context)); }
  catch (error) { this.failed = true; throw error; }
 };
 /** Used by the durable-admission adapter without a second preparation path. */
 context(context: ReviewAdmissionContext = {}): ReviewAdmissionContext { return { ...context, preparePacket: this.packet }; }
 async seal(review: AdmittedReview): Promise<ReadyContextReceipt> {
  await this.tail;
  if (this.failed || this.sealed || !this.session || review.checkpoint.project !== this.key.project || review.checkpoint.reviewId !== this.key.reviewId
   || ![...this.packets.values()].some(p => same(p, review.prepared))) throw new Error('Cannot seal unqualified code preparation');
  // Recovery uses historical decoding and stored derivation, never a fresh
  // route read. Retain those complete views in the same source session.
  for (const entry of review.checkpoint.attempts) await this.packet(entry.submitted, this.sources, true, undefined, entry.header.derived);
  this.sealed = true;
  const packets = [...this.packets.entries()], inputs = packets.map(([, p]) => p.packet);
  return writePreparedContext({ key: this.key, attempt: review.attempt.header.attempt, inputDigest: preparationDigest(review.attempt.submitted), validatorVersion: 1,
   routeDigest: preparationDigest([...this.routes.entries()]), sourceIdentity: preparationDigest(inputs.map(p => [p.reviewRevision, p.reviewSet])),
   scopeDigest: preparationDigest(packets.map(([id, p]) => [id, p.projection?.identity, p.tasks])),
   testDocumentDigest: preparationDigest(inputs.map(p => [p.tests, p.documents])) },
  { 'code-packets': packets }, this.session, this.limits, this.capacity);
 }
 async close(): Promise<void> { await this.tail; this.failed = true; await this.session?.close(); }
}
