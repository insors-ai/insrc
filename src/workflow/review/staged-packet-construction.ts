/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import type { Hash } from 'node:crypto';
import { prepareReviewPacket } from '../code-review/task-review/packet.js';
import type { PacketPreparer, PreparedReviewPacket } from '../code-review/task-review/packet.js';
import type { ReviewAdmissionContext } from '../code-review/task-review/admission.js';
import { ProjectionBudget } from '../code-review/task-review/projection.js';
import type { ProjectionUsage } from '../code-review/task-review/projection.js';
import { canonicalTaskDigest } from '../code-review/task-review/canonical-digest.js';
import { PreparedViewWriter } from './prepared-views.js';
import type { PreparedValueReference, PreparedWindow } from './prepared-views.js';
import { StagedPacketSources } from './staged-packet-sources.js';
import type { StagedPacketBlob } from './staged-packet-sources.js';
import { metadataJsonBound } from './preparation-memory.js';
import type { MemoryLease } from './preparation-memory.js';

interface StoredPacket { readonly prepared: PreparedReviewPacket<StagedPacketBlob>; readonly budgets: readonly ProjectionUsage[]; }
interface ActivePacket { readonly id: string; readonly prepared: PreparedReviewPacket<StagedPacketBlob>; readonly lease: MemoryLease; readonly window?: PreparedWindow<unknown>; }

/** One packet at a time, including history. The cache contains only staged
 * references; every historical attempt still runs the shared admission checks.
 * This is a construction component, not an execution/ready-context adapter. */
export class StagedPacketConstruction {
 private readonly packets = new Map<string, PreparedValueReference>();
 private readonly charges: MemoryLease[] = [];
 private readonly fold: Hash = createHash('sha256').update('insrc:staged-packet-order:v2\0');
 private active: ActivePacket | undefined;
 private failed = false;
 private closed = false;
 constructor(readonly sources: StagedPacketSources, private readonly writer: PreparedViewWriter) {
  if (sources.memory !== writer.memory) throw new Error('Unbound staged packet construction memory');
 }
 readonly preparePacket: PacketPreparer<StagedPacketBlob> = async (input, sources, historical = false, route, stored) => {
  if (this.failed || this.closed || this.active || sources !== this.sources) throw new Error('Staged packet construction unavailable');
  const lease = this.sources.memory.reserve((metadataJsonBound(input) + metadataJsonBound(route) + metadataJsonBound(stored)) * 10 + 1024, 'packet input metadata window');
  let window: PreparedWindow<unknown> | undefined;
  let begun = false;
  try {
   this.sources.beginPacket(); begun = true;
   const id = canonicalTaskDigest(['staged-packet-v2', input, historical, route, stored]);
   const cached = this.packets.get(id);
   let prepared: PreparedReviewPacket<StagedPacketBlob>;
   if (cached) {
    window = await this.writer.metadata(cached);
    const value = window.value as StoredPacket;
    for (const budget of value.budgets) new ProjectionBudget().verifyUsage(budget);
    this.sources.restoreMetadata(value.prepared); prepared = value.prepared;
   } else prepared = await prepareReviewPacket(input, this.sources, historical, route, stored, this.sources);
   this.active = { id, prepared, lease, ...(window ? { window } : {}) };
   return prepared;
  } catch (error) { this.failed = true; window?.release(); if (begun) this.sources.endPacket(); lease.release(); throw error; }
 };
 /** Bind into the shared admission validator, preserving its feedback, origin,
  * publication and attribution checks for EVERY saved attempt. */
 context(context: ReviewAdmissionContext<StagedPacketBlob> = {}): ReviewAdmissionContext<StagedPacketBlob> {
  if (context.preparePacket || context.afterHistoricalPacket) throw new Error('Conflicting staged construction owner');
  return { ...context, preparePacket: this.preparePacket, retainTaskInputs: async (attempt, inputs) => {
   let bytes = 256;
   for (const [taskId, fingerprint] of inputs) bytes += taskId.length * 2 + metadataJsonBound(fingerprint) * 4 + 128;
   this.charges.push(this.sources.memory.reserve(bytes, 'historical task fingerprint index'));
   await context.retainTaskInputs?.(attempt, inputs);
  }, afterHistoricalPacket: async (prepared, _entry, retainedForResume) => {
   if (!retainedForResume) await this.release(prepared);
  } };
 }
 /** Release only after all validators/consumers finish using this packet. */
 async release(prepared: PreparedReviewPacket<StagedPacketBlob>): Promise<PreparedValueReference> {
  const active = this.active;
  if (this.failed || this.closed || !active || active.prepared !== prepared) throw new Error('Foreign or inactive staged packet');
  try {
   let ref = this.packets.get(active.id);
   if (!ref) {
    const metadata = this.sources.memory.reserve(512, 'staged packet descriptor index');
    try {
     ref = await this.writer.add(`packet-${active.id}`, 'packet', { prepared, budgets: this.sources.logicalUsage() } satisfies StoredPacket);
     this.packets.set(active.id, ref); this.charges.push(metadata);
    } catch (error) { metadata.release(); throw error; }
   }
   // Fixed-length digests and a separator give an ordered, unambiguous fold.
   this.fold.update(active.id).update(':').update(ref.digest).update('\0');
   return ref;
  } catch (error) { this.failed = true; throw error; }
  finally { active.window?.release(); this.sources.endPacket(); active.lease.release(); this.active = undefined; }
 }
 identity(): string {
  if (this.failed || this.closed || this.active) throw new Error('Packet fold is not complete');
  return this.fold.copy().digest('hex');
 }
 /** Error cleanup releases ownership, never turns a failed packet into a
  * cached/qualified one. Staging disposal remains with the store owner. */
 close(): void {
  if (this.closed) return;
  this.closed = true;
  if (this.active) { this.active.window?.release(); this.sources.endPacket(); this.active.lease.release(); this.active = undefined; }
  this.sources.close(); this.packets.clear(); for (const charge of this.charges) charge.release(); this.charges.length = 0;
 }
}
