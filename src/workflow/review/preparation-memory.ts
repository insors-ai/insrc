/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** A phase-local budget, shared by source caches, codecs and their consumers.
 * It accounts owned allocations, not process RSS. Callers reserve scratch
 * before allocating and keep the lease until the last consumer releases it. */
export interface MemoryLease { release(): void; }
export interface MemoryAllocation { readonly bytes: Uint8Array; readonly lease: MemoryLease; }
export class ReviewMemoryBudget {
 private used = 0;
 private peak = 0;
 private readonly buffers = new WeakMap<ArrayBufferLike, { count: number; lease: MemoryLease }>();
 private readonly evictors = new Set<() => boolean>();
 constructor(readonly limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid preparation memory bound');
 }
 reserve(bytes: number, stage: string): MemoryLease {
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
  return { release: () => { if (active) { active = false; this.used -= bytes; } } };
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
 onEvict(evict: () => boolean): () => void { this.evictors.add(evict); return () => { this.evictors.delete(evict); }; }
 snapshot(): { bytes: number; highWaterBytes: number; limit: number } { return { bytes: this.used, highWaterBytes: this.peak, limit: this.limit }; }
}
