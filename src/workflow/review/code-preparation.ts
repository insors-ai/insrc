import type { ReviewAdmissionPreparer } from '../code-review/task-review/admission.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { ReviewPreparationLimits } from '../../config/review.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewAdmissionContext } from '../code-review/task-review/admission.js';
import { prepareWorkerCodeAdmission } from '../code-review/task-review/worker-checkpoint.js';
import type { PreparedReviewPacket, PacketPreparer } from '../code-review/task-review/packet.js';
import type { AdmittedReview } from '../code-review/task-review/execution.js';
import type { ReviewSources, BatchReviewSources } from '../code-review/task-review/sources.js';
import { ReviewSourceSession } from './source-session.js';
import type { SourceCapacity } from './source-session.js';
import { preparationDigest } from './prepared-context.js';
import type { ReadyContextReceipt, PreparedSourceIdentity } from './prepared-context.js';
import { PreparedViewReader, PreparedViewWriter } from './prepared-views.js';
import { ReviewMemoryBudget } from './preparation-memory.js';
import { StagedPacketSources } from './staged-packet-sources.js';
import type { StagedPacketBlob } from './staged-packet-sources.js';
import { StagedPacketConstruction } from './staged-packet-construction.js';
import { StagedTaskExecution } from './staged-task-execution.js';
import { selectedChangeLocators } from './source-light-locators.js';
import { materializeBaselineWorkspace } from './source-light-workspace.js';
import { canonicalTaskDigest } from '../code-review/task-review/canonical-digest.js';
import { reviewJsonLimit } from '../../config/review.js';
import type { TaskAssignment } from '../code-review/task-review/packet.js';

/** One private preparation phase. Route resolution and every semantic check
 * remain in the existing admission/packet implementations. This object only
 * owns bounded source reuse and the immutable prepared views they produce. */
export class CodePreparation {
 private readonly packetIds = new WeakMap<object, string>();
 private writer: PreparedViewWriter | undefined;
 private tail: Promise<void> = Promise.resolve();
 private failed = false;
 private sealed = false;
 private identity: PreparedSourceIdentity | undefined;
 private stagedSources: StagedPacketSources | undefined;
 private construction: StagedPacketConstruction | undefined;
 private execution: StagedTaskExecution | undefined;
 private readonly packetWindows: Array<{ release(): void }> = [];
 private constructor(readonly sources: ReviewSources, private readonly key: ReviewKey,
  private readonly session: ReviewSourceSession | undefined,
  private readonly reader: PreparedViewReader | undefined,
  private readonly limits: ReviewPreparationLimits, private readonly capacity: SourceCapacity,
  private readonly batch: BatchReviewSources | undefined) {
   if (reader) this.execution = new StagedTaskExecution(reader);
  }
 static async create(key: ReviewKey, sources: BatchReviewSources, limits: ReviewPreparationLimits, capacity: SourceCapacity, memory = new ReviewMemoryBudget(limits.memoryMaxBytes)): Promise<CodePreparation> {
  if (key.family !== 'code') throw new Error('Code preparation required');
  const session = await ReviewSourceSession.create(key, sources, limits, capacity, memory);
  return new CodePreparation(session, key, session, undefined, limits, capacity, sources);
 }
 /** Reader must come from a live host-issued borrow. Disk alone grants no access. */
 static async reuse(key: ReviewKey, reader: PreparedViewReader, sources: ReviewSources, limits: ReviewPreparationLimits, capacity: SourceCapacity): Promise<CodePreparation> {
  if (key.family !== 'code' || !same(key, reader.receipt.key)) throw new Error('Code preparation context identity mismatch');
  return new CodePreparation(sources, key, undefined, reader, limits, capacity, undefined);
 }
 private readonly sourceLightPacket: PacketPreparer<StagedPacketBlob> = async (input, sources, historical = false, route, stored) => {
  const id = canonicalTaskDigest(['staged-packet-v2', input, historical, route, stored]);
  if (this.reader) {
   const window = await this.reader.metadata(await this.reader.descriptor(`packet-${id}`, 'packet'));
   const value = window.value as { prepared?: PreparedReviewPacket<StagedPacketBlob> };
   if (!value.prepared) { window.release(); throw new Error('Invalid qualified source-light packet'); }
   this.packetWindows.push(window); this.packetIds.set(value.prepared, id); return value.prepared;
  }
  if (sources !== this.stagedSources) throw new Error('Foreign source-light packet source');
  if (!this.construction) throw new Error('Source-light construction unavailable');
  const prepared = await this.construction.preparePacket(input, this.stagedSources, historical, route, stored);
  this.packetIds.set(prepared, id); return prepared;
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
  this.stagedSources = new StagedPacketSources(this.session, this.writer);
  this.construction = new StagedPacketConstruction(this.stagedSources, this.writer);
 }
 /** Dedicated worker execution and explicit recovery use the sole source-light packet adapter. */
 readonly workerPrepare: ReviewAdmissionPreparer = async (project, id, attempt, input, reviewer, _sources, context = {}) => {
  if (this.failed || this.sealed || project !== this.key.project || id !== this.key.reviewId || this.reader && attempt !== this.reader.receipt.attempt) throw new Error('Code preparation unavailable or foreign');
  try {
   await this.begin(attempt, input);
   const staged = this.stagedSources;
   if (!staged && !this.reader) throw new Error('Source-light worker source missing');
   const packetSources = (staged ?? this.sources) as ReviewSources<StagedPacketBlob>;
   return await prepareWorkerCodeAdmission(project, id, attempt, input, reviewer, packetSources, this.sourceLightContext(context)) as unknown as AdmittedReview;
  }
  catch (error) { this.failed = true; throw error; }
 };
 private sourceLightContext(context: ReviewAdmissionContext = {}): ReviewAdmissionContext<StagedPacketBlob> {
  if (this.construction) {
   const bound = this.construction.context(context as unknown as ReviewAdmissionContext<StagedPacketBlob>);
   return { ...bound, preparePacket: this.sourceLightPacket };
  }
  if (this.reader) return { ...(context as unknown as ReviewAdmissionContext<StagedPacketBlob>), preparePacket: this.sourceLightPacket };
  throw new Error('Source-light construction missing');
 }
 /** Publication reads only source-light qualified history. A historical eager
  * generation is an untrusted migration input and must be cold-requalified by
  * the host; it is never an execution fallback. */
 readonly publicationPacket: PacketPreparer = async (...args) => {
  if (!this.reader || !await this.reader.hasDescriptor('execution-packet', 'packet')) throw new Error('Source-light publication context required; cold requalification is required');
  return this.sourceLightPacket(...(args as unknown as Parameters<typeof this.sourceLightPacket>)) as unknown as Awaited<ReturnType<PacketPreparer>>;
 };
 async seal(review: AdmittedReview): Promise<ReadyContextReceipt> {
  await this.tail;
  if (this.failed || this.sealed || !this.session || !this.writer || review.checkpoint.project !== this.key.project || review.checkpoint.reviewId !== this.key.reviewId
   || !this.packetIds.has(review.prepared)) throw new Error('Cannot seal unqualified code preparation');
  if (!this.construction || !this.stagedSources || !this.batch || !this.identity) throw new Error('Incomplete source-light construction');
  const prepared = review.prepared as unknown as PreparedReviewPacket<StagedPacketBlob>;
  const binding = { key: this.key, attempt: this.identity.attempt, generationId: this.writer.generationId(), inputDigest: this.identity.inputDigest, sourceIdentity: this.identity.sourceIdentity };
  // Give execution a stable, reader-issued packet root. The construction
  // object contains writer-issued leaf references and must never cross the
  // qualification boundary into prompt assembly.
  await this.writer.add('execution-packet', 'packet', { prepared });
  const locators = await selectedChangeLocators(prepared, binding, this.batch, reviewJsonLimit());
  await this.writer.add('source-locators', 'view', locators);
  const workspace = await materializeBaselineWorkspace(locators, binding, this.batch, reviewJsonLimit(), undefined, this.writer.directory);
  await this.writer.add('baseline-workspace', 'view', workspace);
  await this.construction.release(prepared);
  // Feedback and publication deliberately re-enter historical validation.
  // Persist those exact packet identities as source-light metadata roots;
  // otherwise the qualified reader would be forced to rebuild source scope.
  for (const entry of review.checkpoint.attempts) {
   const historical = await this.sourceLightPacket(entry.submitted, this.stagedSources, true, undefined, entry.header.derived);
   await this.construction.release(historical);
  }
  this.construction.close(); this.construction = undefined; this.stagedSources = undefined;
  this.sealed = true;
  return this.writer.seal();
 }
 /** Both daemon and controller review routes use the same transient selected
  * after-block assembly from the qualified source generation. */
 async taskPrompt(review: AdmittedReview, assignment: TaskAssignment, references: readonly string[]): Promise<string> {
  if (!this.execution || !this.reader) throw new Error('Qualified source-light execution is unavailable');
  const packet = await this.reader.metadata(await this.reader.descriptor('execution-packet', 'packet'));
  try {
   const prepared = (packet.value as { prepared?: PreparedReviewPacket<StagedPacketBlob> }).prepared;
   if (!prepared) throw new Error('Qualified execution packet missing');
   const taskAssignment = { ...assignment, changes: assignment.changes.map(change => {
    const index = review.prepared.changes.indexOf(change);
    if (index < 0 || !prepared.changes[index]) throw new Error('Foreign qualified task assignment');
    return prepared.changes[index];
   }), tests: assignment.tests.map(test => {
    const index = review.prepared.packet.tests.indexOf(test);
    if (index < 0 || !prepared.packet.tests[index]) throw new Error('Foreign qualified test assignment');
    return prepared.packet.tests[index];
   }) } as TaskAssignment<StagedPacketBlob>;
   const prompt = await this.execution.codePromptFor(prepared, taskAssignment, references,
    review.checkpoint.project, { ...review, prepared } as unknown as AdmittedReview<StagedPacketBlob>);
   try { return prompt.prompt; } finally { prompt.release(); }
  } finally { packet.release(); }
 }
 /** Lookup metadata for the private main qualification channel, not a borrow. */
 qualificationIdentity(): PreparedSourceIdentity {
  if (!this.identity) throw new Error('Code preparation has not sealed a context');
  return structuredClone(this.identity);
 }
 observeSources(observer: Parameters<ReviewSourceSession['observe']>[0]): () => void { return this.session?.observe(observer) ?? (() => {}); }
 sourceMetrics(): ReturnType<ReviewSourceSession['snapshot']> | undefined { return this.session?.snapshot(); }
 async close(): Promise<void> { await this.tail; this.failed = true; for (const window of this.packetWindows.splice(0)) window.release(); this.reader?.close(); this.construction?.close(); if (this.writer && !this.sealed) await this.writer.discard(); await this.session?.close(); }
}
