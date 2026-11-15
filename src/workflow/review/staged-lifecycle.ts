/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import type { ReviewPreparationLimits } from '../../config/review.js';
import type { ReadyContextReceipt } from './prepared-context.js';
import type { ReviewMemoryBudget } from './preparation-memory.js';
import { PreparedViewReader, PreparedViewWriter } from './prepared-views.js';
import type { PreparedDescriptor, PreparedValueReference } from './prepared-views.js';

export interface StagedLifecycleAuthority {
 /** Current-process borrow only. Persisted manifests are never returned here
  * after a daemon epoch ends. */
 borrow(): Promise<ReadyContextReceipt | undefined>;
 /** Performs the complete bounded source/history qualification. */
 qualify(): Promise<ReadyContextReceipt>;
 authorize(receipt: ReadyContextReceipt): Promise<void>;
 invalidate(receipt: ReadyContextReceipt, error: unknown): Promise<void>;
}

export interface StagedCleanupHooks<Claim, Result> {
 /** Recheck current approval, permanent preservation and native disposal. */
 authorize(contentDigest: string): Promise<void>;
 /** Must durably record cleanup-only authority before returning. */
 claim(contentDigest: string): Promise<Claim>;
 /** May remove only the exact roots named by the returned claim. */
 remove(claim: Claim): Promise<Result>;
}

export interface StagedLifecycleOpen {
 readonly view: StagedLifecycleView;
 readonly mode: 'warm' | 'cold';
}

/** Stage an exact checkpoint/permanent record through the shared v2 codec.
 * Consumers traverse its descriptor; they never call the eager v1 view(). */
export function stageLifecycleRecord(writer: PreparedViewWriter, id: string, value: unknown): Promise<PreparedValueReference> {
 return writer.add(id, 'view', value);
}

type Write = (fragment: string) => Promise<void> | void;

/** Bounded lifecycle consumer for recovery, publication and cleanup. The
 * authority decides whether the phase is a current-epoch warm borrow or one
 * complete cold qualification; this class never reconstructs sources or calls
 * a model itself. */
export class StagedLifecycleView {
 private constructor(private readonly reader: PreparedViewReader, readonly mode: 'warm' | 'cold') {}

 static async open(limits: ReviewPreparationLimits, memory: ReviewMemoryBudget, authority: StagedLifecycleAuthority): Promise<StagedLifecycleOpen> {
  let receipt = await authority.borrow(), mode: 'warm' | 'cold' = 'warm';
  if (!receipt) { mode = 'cold'; receipt = await authority.qualify(); }
  const fixed = receipt;
  const reader = await PreparedViewReader.open(fixed, limits, memory,
   () => authority.authorize(fixed), error => authority.invalidate(fixed, error));
  const view = new StagedLifecycleView(reader, mode);
  return { view, mode };
 }

 private async descriptor(id: string): Promise<PreparedDescriptor> { return this.reader.descriptor(id, 'view'); }

 private async writeEscaped(value: string, write: Write, label: string): Promise<void> {
  const lease = this.reader.memory.reserve(value.length * 12 + 128, label);
  try {
   const encoded = JSON.stringify(value);
   if (encoded === undefined) throw new Error('Lifecycle value is not permanent JSON');
   await write(encoded.slice(1, -1)); await this.reader.verify();
  } finally { lease.release(); }
 }

 private async writeValue(ref: PreparedValueReference, write: Write, depth: number): Promise<void> {
  if (depth > 128) throw new Error('Lifecycle value depth exceeds bound');
  const description = await this.reader.describe(ref);
  if (description.type === 'object' || description.type === 'array') {
   const object = description.type === 'object'; await write(object ? '{' : '['); await this.reader.verify();
   let count = 0;
   for await (const child of this.reader.children(ref)) {
    if (count++) { await write(','); await this.reader.verify(); }
    if (object) {
     if (typeof child.key !== 'string') throw new Error('Invalid lifecycle object key');
     const lease = this.reader.memory.reserve(child.key.length * 12 + 128, 'lifecycle JSON property');
     try { await write(`${JSON.stringify(child.key)}:`); await this.reader.verify(); }
     finally { lease.release(); }
    }
    await this.writeValue(child.reference, write, depth + 1);
   }
   if (count !== description.size) throw new Error('Lifecycle container changed during traversal');
   await write(object ? '}' : ']'); await this.reader.verify(); return;
  }
  if (description.type === 'text') {
   await write('"'); await this.reader.verify();
   const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
   for await (const chunk of this.reader.chunks(ref)) {
    try {
     // Reserve for decoded UTF-16 and worst-case JSON escaping before either
     // allocation is made. The source chunk itself remains separately charged.
     const lease = this.reader.memory.reserve(chunk.value.byteLength * 16 + 1024, 'lifecycle JSON text fragment');
     try { await this.writeEscaped(decoder.decode(chunk.value, { stream: true }), write, 'lifecycle escaped text'); }
     finally { lease.release(); }
    } finally { chunk.release(); }
   }
   await this.writeEscaped(decoder.decode(), write, 'lifecycle escaped text tail');
   await write('"'); await this.reader.verify(); return;
  }
  if (description.type === 'bytes') throw new Error('Binary staged value cannot be published as permanent JSON');
  const scalar = await this.reader.scalar(ref);
  try {
   if (scalar.value === undefined) throw new Error('Undefined staged value cannot be published as permanent JSON');
   const encoded = JSON.stringify(scalar.value);
   if (encoded === undefined) throw new Error('Lifecycle scalar is not permanent JSON');
   const lease = this.reader.memory.reserve(encoded.length * 2 + 128, 'lifecycle JSON scalar');
   try { await write(encoded); await this.reader.verify(); } finally { lease.release(); }
  } finally { scalar.release(); }
 }

 /** Exact incremental JSON. The callback must consume each fragment before its
  * promise resolves; fragments are charged only for that interval. */
 async writeJson(id: string, write: Write): Promise<void> {
  await this.reader.verify(); await this.writeValue(await this.descriptor(id), write, 0); await this.reader.verify();
 }

 async digest(id: string): Promise<string> {
  const hash = createHash('sha256'); await this.writeJson(id, fragment => { hash.update(fragment); }); return hash.digest('hex');
 }

 /** The durable result callback finishes before progress is acknowledged.
  * A failed result write never advances progress and never invokes a model. */
 async publish<Result>(id: string, persist: (emit: (write: Write) => Promise<void>) => Promise<Result>, progress?: ((result: Result) => Promise<void>) | undefined): Promise<Result> {
  let active = true, emitted = false;
  const emit = async (write: Write) => {
   if (!active || emitted) throw new Error('Lifecycle publication stream is no longer available');
   emitted = true; await this.writeJson(id, write);
  };
  try {
   const result = await persist(emit);
   if (!emitted) throw new Error('Lifecycle publication did not preserve its staged record');
   await this.reader.verify(); await progress?.(result); return result;
  } finally { active = false; }
 }

 /** Cleanup receives only a digest of the exact traversed record. Current
  * eligibility/native fences remain external, and deletion cannot begin until
  * the durable cleanup-only claim succeeds. */
 async cleanup<Claim, Result>(id: string, hooks: StagedCleanupHooks<Claim, Result>): Promise<Result> {
  const contentDigest = await this.digest(id); await this.reader.verify();
  await hooks.authorize(contentDigest); await this.reader.verify();
  const claim = await hooks.claim(contentDigest); await this.reader.verify();
  return hooks.remove(claim);
 }

 cancel(): void { this.reader.cancel(); }
 close(): void { this.reader.close(); }
}
