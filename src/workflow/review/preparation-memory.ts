/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** A phase-local budget, shared by source caches, codecs and their consumers.
 * It accounts owned allocations, not process RSS. Callers reserve scratch
 * before allocating and keep the lease until the last consumer releases it. */
export interface MemoryLease { release(): void; }
export interface MemoryReservation extends MemoryLease { resize(bytes: number, stage: string): void; }
export interface MemoryAllocation { readonly bytes: Uint8Array; readonly lease: MemoryLease; }
/** Metadata only. Calling this on a source body is a programming error, not a
 * reason to expand bytes into numeric JSON properties. */
export function metadataJsonBound(value: unknown): number {
 if (value === null || value === undefined) return 4;
 if (typeof value === 'boolean') return 5;
 if (typeof value === 'number') return 32;
 if (typeof value === 'string') return value.length * 6 + 2;
 if (value instanceof Uint8Array) throw new Error('Binary payload cannot be serialized as preparation metadata');
 let bytes = 2;
 if (Array.isArray(value)) { for (const item of value) bytes += metadataJsonBound(item) + 1; }
 else if (value && typeof value === 'object') { for (const key in value) if (Object.hasOwn(value, key)) bytes += metadataJsonBound(key) + metadataJsonBound(Reflect.get(value, key)) + 2; }
 else throw new Error('Unsupported preparation metadata');
 if (!Number.isSafeInteger(bytes)) throw new Error('Preparation metadata size exceeds representation');
 return bytes;
}
export class ReviewMemoryBudget {
 private used = 0;
 private peak = 0;
 private readonly buffers = new WeakMap<ArrayBufferLike, { count: number; lease: MemoryLease }>();
 private readonly evictors = new Set<() => boolean>();
 constructor(readonly limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid preparation memory bound');
 }
 reserve(bytes: number, stage: string): MemoryReservation {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid memory reservation');
  while (bytes > this.limit - this.used) {
   let freed = false;
   // Removing one view may not free its shared slab until the final view goes.
   // A true return promises one unborrowed ownership reference was removed.
   for (const evict of this.evictors) if (evict()) { freed = true; break; }
   if (!freed) throw new Error(`Preparation memory capacity exhausted at ${stage}: charged=${this.used}, requested=${bytes}, limit=${this.limit}`);
  }
  this.used += bytes; this.peak = Math.max(this.peak, this.used);
  let active = true;
  return {
   release: () => { if (active) { active = false; this.used -= bytes; } },
   resize: (next, label) => {
    if (!active || !Number.isSafeInteger(next) || next < 0) throw new Error('Invalid resized memory reservation');
    if (next > bytes) { const extra = this.reserve(next - bytes, label); extra.release(); }
    this.used += next - bytes; bytes = next; this.peak = Math.max(this.peak, this.used);
   },
  };
 }
 /** Count shared backing storage once, including Buffer pool/slab capacity. */
 buffer(value: Uint8Array, stage: string): MemoryLease {
  let entry = this.buffers.get(value.buffer);
  if (!entry) {
   entry = { count: 0, lease: this.reserve(value.buffer.byteLength, stage) };
   this.buffers.set(value.buffer, entry);
  }
  entry.count++;
  let active = true;
  return { release: () => {
   if (!active) return; active = false;
   if (--entry.count === 0) { entry.lease.release(); this.buffers.delete(value.buffer); }
  } };
 }
 /** Reserve before creating backing storage and register it so subsequent
  * source/codec borrows do not double-charge the same allocation. */
 allocate(bytes: number, stage: string): MemoryAllocation {
  const lease = this.reserve(bytes, stage);
  try {
   const value = new Uint8Array(bytes);
   this.buffers.set(value.buffer, { count: 0, lease });
   return { bytes: value, lease: this.buffer(value, stage) };
  } catch (error) { lease.release(); throw error; }
 }
 /** Transfer an already reserved encoder allocation to shared cache ownership. */
 adopt(value: Uint8Array, reservation: MemoryReservation, stage: string): MemoryLease {
  if (this.buffers.has(value.buffer)) { const lease = this.buffer(value, stage); reservation.release(); return lease; }
  reservation.resize(value.buffer.byteLength, stage);
  this.buffers.set(value.buffer, { count: 0, lease: reservation });
  return this.buffer(value, stage);
 }
 onEvict(evict: () => boolean): () => void { this.evictors.add(evict); return () => { this.evictors.delete(evict); }; }
 snapshot(): { bytes: number; highWaterBytes: number; limit: number } { return { bytes: this.used, highWaterBytes: this.peak, limit: this.limit }; }
}
