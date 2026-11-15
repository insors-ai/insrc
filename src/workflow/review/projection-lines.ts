/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { TextDecoder } from 'node:util';
import { requireReview } from '../code-review/task-review/contracts.js';
import type { PinnedBlob } from '../code-review/task-review/sources.js';
import type { ProjectionLines } from '../code-review/task-review/projection-intervals.js';
import { ReviewMemoryBudget } from './preparation-memory.js';
import type { MemoryLease } from './preparation-memory.js';

/** Exact UTF-8 line view for the existing interval validator. No per-line
 * strings: offsets and raw bytes are charged, and comparison preserves CRLF,
 * BOM and the final-newline distinction. Callback consumers must not retain
 * the ephemeral line subviews beyond this owner's release. */
export class ProjectionLineWindow {
 private bytes: Uint8Array | undefined;
 private offsets: Uint32Array | undefined;
 private constructor(bytes: Uint8Array, offsets: Uint32Array, private readonly charges: MemoryLease[]) { this.bytes = bytes; this.offsets = offsets; }
 static open(blob: PinnedBlob | null, memory: ReviewMemoryBudget): ProjectionLineWindow {
  const charges: MemoryLease[] = [];
  try {
   charges.push(memory.reserve(512, 'projection line view metadata'));
   const bytes = blob?.bytes ?? new Uint8Array(0);
   charges.push(memory.buffer(bytes, 'projection committed bytes'));
   requireReview(bytes.length <= 0xffffffff, 'projection_limit', 'Projection line offsets exceed representation bound');
   let rows = 0;
   for (const byte of bytes) { requireReview(byte !== 0, 'scope_conflict', 'Binary source has no textual projection'); if (byte === 10) rows++; }
   if (bytes.length && bytes[bytes.length - 1] !== 10) rows++;
   const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
   try {
    for (let offset = 0; offset < bytes.length; offset += 16384) {
     const end = Math.min(bytes.length, offset + 16384), scratch = memory.reserve((end - offset) * 2 + 1024, 'projection UTF-8 verification');
     try { decoder.decode(bytes.subarray(offset, end), { stream: true }); } finally { scratch.release(); }
    }
    const final = memory.reserve(1024, 'projection UTF-8 completion');
    try { decoder.decode(); } finally { final.release(); }
   } catch (error) {
    if (error instanceof TypeError) requireReview(false, 'scope_conflict', 'Committed projection source is not UTF-8');
    throw error;
   }
   const allocation = memory.allocate((rows + 1) * 4, 'projection line offsets'); charges.push(allocation.lease);
   const offsets = new Uint32Array(allocation.bytes.buffer, allocation.bytes.byteOffset, rows + 1);
   offsets[0] = 0; let row = 1;
   for (let at = 0; at < bytes.length; at++) if (bytes[at] === 10) offsets[row++] = at + 1;
   offsets[rows] = bytes.length;
   return new ProjectionLineWindow(bytes, offsets, charges);
  } catch (error) { for (const charge of charges) charge.release(); throw error; }
 }
 get lines(): ProjectionLines {
  const owner = this;
  return { get length() { return owner.count(); }, line(index) { return owner.line(index); } };
 }
 private count(): number { if (!this.offsets) throw new Error('Projection line window released'); return this.offsets.length - 1; }
 private line(index: number): Uint8Array {
  const count = this.count();
  requireReview(Number.isSafeInteger(index) && index >= 0 && index < count, 'scope_conflict', 'Projection line index outside source');
  return this.bytes!.subarray(this.offsets![index]!, this.offsets![index + 1]!);
 }
 release(): void { if (!this.offsets) return; this.offsets = undefined; this.bytes = undefined; for (const charge of this.charges) charge.release(); }
}
