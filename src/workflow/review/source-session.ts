/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isMainThread } from 'node:worker_threads';
import { Value } from '@sinclair/typebox/value';
import { ReviewKeySchema } from '../../shared/review-resources.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { reviewPath } from '../code-review/task-review/contracts.js';
import type { BatchReviewSources, ReviewSources, ReviewObjectRequest, PinnedBlob, ChangedRange } from '../code-review/task-review/sources.js';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { writeCheckpoint } from '../code-review/task-review/checkpoint.js';

/** Main-owned implementation, injected through the private preparation service
 * when workers are wired. One instance accounts every session in a project. */
export interface SourceCapacity {
 reserve(bytes: number): Promise<string>;
 commit(token: string, bytes: number): Promise<void>;
 split(token: string, bytes: readonly number[]): Promise<readonly string[]>;
 release(token: string): Promise<void>;
}
export class ReviewPreparationCapacity implements SourceCapacity {
 private readonly reservations = new Map<string, number>();
 private used: number;
 constructor(readonly limit: number, retainedBytes = 0) {
  if (!isMainThread) throw new Error('Project preparation capacity must be owned by main');
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(retainedBytes) || retainedBytes < 0 || retainedBytes > limit) throw new Error('Invalid preparation capacity');
  this.used = retainedBytes;
 }
 async reserve(bytes: number): Promise<string> {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > this.limit - this.used) throw new Error('Review preparation disk capacity exhausted before fetch');
  const token = randomUUID(); this.reservations.set(token, bytes); this.used += bytes; return token;
 }
 async commit(token: string, bytes: number): Promise<void> {
  const reserved = this.reservations.get(token);
  if (reserved === undefined || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > reserved) throw new Error('Invalid source capacity commit');
  this.used += bytes - reserved; this.reservations.set(token, bytes);
 }
 async release(token: string): Promise<void> {
  const reserved = this.reservations.get(token); if (reserved === undefined) throw new Error('Unknown source capacity token');
  this.reservations.delete(token); this.used -= reserved;
 }
 async split(token: string, parts: readonly number[]): Promise<readonly string[]> {
  const reserved = this.reservations.get(token), total = parts.reduce((sum, n) => sum + n, 0);
  if (reserved === undefined || !parts.length || parts.some(n => !Number.isSafeInteger(n) || n < 1) || !Number.isSafeInteger(total) || total > reserved) throw new Error('Invalid source reservation split');
  // Atomic accounting transfer: another review cannot steal a batch's space
  // between verified fetch and per-result durable staging.
  this.reservations.delete(token); this.used += total - reserved;
  return parts.map(bytes => { const child = randomUUID(); this.reservations.set(child, bytes); return child; });
 }
 get bytes(): number { return this.used; }
}
type Method = keyof ReviewSources;
interface Entry { readonly name: string; readonly digest: string; readonly bytes: number; }
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
function pinned(oid: string): void { if (!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) throw new Error('Source session requires full pinned object IDs'); }
function encode(method: Method, value: unknown): Buffer {
 if (method === 'file' && value !== null) { const blob = value as PinnedBlob; return Buffer.from(JSON.stringify({ oid: blob.oid, base64: Buffer.from(blob.bytes).toString('base64') })); }
 return Buffer.from(JSON.stringify(value));
}
function decode(method: Method, bytes: Buffer): unknown {
 const value: unknown = JSON.parse(bytes.toString('utf8'));
 if (method === 'file' && value !== null) { const blob = value as { oid: string; base64: string }; return { oid: blob.oid, bytes: Buffer.from(blob.base64, 'base64') }; }
 return value;
}

/** Exact session cache, not a persisted qualification credential. Errors fence
 * the session; a missing/corrupt staged result is never silently fetched again.
 * All query maps are bounded and all active evidence remains disk-pinned. */
export class ReviewSourceSession implements ReviewSources {
 private readonly entries = new Map<string, Entry>();
 private readonly memory = new Map<string, Buffer>();
 private readonly tokens = new Set<string>();
 private memoryBytes = 0;
 private metadataBytes = 0;
 private tail: Promise<void> = Promise.resolve();
 private failed = false;
 private closing = false;
 private closed = false;
 private readonly metrics = { logicalQueries: 0, physicalQueries: 0, cacheHits: 0, diskHits: 0, objectInventoryBatches: 0, objectReadBatches: 0, storedBytes: 0 };
 private constructor(readonly directory: string, readonly key: Readonly<ReviewKey>, private readonly source: BatchReviewSources, private readonly limits: ReviewPreparationLimits, private readonly capacity: SourceCapacity, private readonly identity: { dev: bigint; ino: bigint }) {}
 static async create(key: ReviewKey, source: BatchReviewSources, limits: ReviewPreparationLimits, capacity: SourceCapacity): Promise<ReviewSourceSession> {
  if (!Value.Check(ReviewKeySchema, key)) throw new Error('Invalid source session identity');
  const project = key.project;
  if (await realpath(project) !== project || Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 1)) throw new Error('Invalid source session bounds/project');
  let directory = project;
  for (const part of ['.insrc', 'tmp', 'review-context', key.family, key.reviewId, `staging-${randomUUID()}`]) {
   directory = join(directory, part);
   await mkdir(directory, { mode: 0o700 }).catch(e => { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; });
   const st = await lstat(directory); if (!st.isDirectory() || st.isSymbolicLink() || await realpath(directory) !== directory) throw new Error('Unsafe source session directory');
  }
  const identity = await lstat(directory, { bigint: true });
  return new ReviewSourceSession(directory, Object.freeze({ ...key }), source, { ...limits }, capacity, { dev: identity.dev, ino: identity.ino });
 }
 private enqueue<T>(work: () => Promise<T>): Promise<T> {
  if (this.closing || this.closed) return Promise.reject(new Error('Source session closed'));
  const result = this.tail.then(async () => {
   if (this.failed) throw new Error('Source session fenced; explicit new preparation required');
   try { return await work(); } catch (error) { this.failed = true; throw error; }
  });
  this.tail = result.then(() => {}, () => {}); return result;
 }
 private queryKey(method: Method, args: readonly unknown[]): string {
  const key = JSON.stringify([method, ...args]);
  if (Buffer.byteLength(key) > 8192) throw new Error('Source query identity exceeds bound'); return key;
 }
 private keep(key: string, bytes: Buffer): void {
  this.memory.delete(key);
  // Account returned decode as well as the cached wire representation.
  const budget = this.limits.memoryMaxBytes - this.metadataBytes - bytes.length;
  while (this.memoryBytes + bytes.length > budget && this.memory.size) {
   const first = this.memory.keys().next().value!; this.memoryBytes -= this.memory.get(first)!.length; this.memory.delete(first);
  }
  if (this.memoryBytes + bytes.length <= budget) { this.memory.set(key, bytes); this.memoryBytes += bytes.length; }
 }
 private async load(method: Method, key: string, entry: Entry): Promise<unknown> {
  let bytes = this.memory.get(key);
  if (!bytes) {
   this.metrics.diskHits++;
   const file = await open(join(this.directory, entry.name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
   try {
    const st = await file.stat(); if (!st.isFile() || st.size !== entry.bytes || st.size > this.limits.memoryMaxBytes - this.metadataBytes) throw new Error('Invalid staged source size');
    bytes = Buffer.alloc(st.size + 1); let offset = 0;
    while (offset < bytes.length) { const n = await file.read(bytes, offset, bytes.length - offset, null); if (!n.bytesRead) break; offset += n.bytesRead; }
    if (offset !== st.size) throw new Error('Staged source changed'); bytes = bytes.subarray(0, offset);
   } finally { await file.close(); }
  } else { this.memory.delete(key); this.memoryBytes -= bytes.length; }
  if (sha(bytes) !== entry.digest) throw new Error('Staged source integrity mismatch');
  this.keep(key, bytes); return decode(method, bytes);
 }
 private async stage(method: Method, key: string, value: unknown, token: string): Promise<void> {
  const bytes = encode(method, value), metadata = Buffer.byteLength(key) * 2 + 512;
  if (this.entries.size >= 10000 || bytes.length + this.metadataBytes + metadata > this.limits.memoryMaxBytes) throw new Error('Source session memory/identity capacity exhausted');
  const entry = { name: `${sha(key)}.json`, digest: sha(bytes), bytes: bytes.length };
  const line = JSON.stringify({ query: key, ...entry }) + '\n';
  // Reservation covers immutable payload, its temporary write, and the index.
  await this.capacity.commit(token, bytes.length * 2 + Buffer.byteLength(line));
  await writeCheckpoint(join(this.directory, entry.name), bytes.toString());
  const index = await open(join(this.directory, 'queries.jsonl'), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try { await index.writeFile(line); await index.sync(); } finally { await index.close(); }
  const directory = await open(this.directory, 'r'); try { await directory.sync(); } finally { await directory.close(); }
  this.entries.set(key, entry); this.metadataBytes += metadata; this.metrics.storedBytes += bytes.length + Buffer.byteLength(line);
  await this.capacity.commit(token, bytes.length + Buffer.byteLength(line));
  this.keep(key, bytes);
 }
 private async fetch(method: Method, args: readonly unknown[], work: () => Promise<unknown>): Promise<unknown> {
  this.metrics.logicalQueries++;
  const key = this.queryKey(method, args), entry = this.entries.get(key);
  if (entry) { this.metrics.cacheHits++; return this.load(method, key, entry); }
  const wireBounds: Record<Method, number> = { file: Math.ceil(4 * 1024 * 1024 * 4 / 3) + 512, commit: 4 * 1024 * 1024,
   isAncestor: 64, pathChanges: 2 * 1024 * 1024, changedRanges: 32 * 1024 * 1024 };
  const token = await this.capacity.reserve(Math.min(this.limits.memoryMaxBytes, wireBounds[method]) * 2 + 16384); this.tokens.add(token);
  this.metrics.physicalQueries++;
  const value = await work(); await this.stage(method, key, value, token);
  return this.load(method, key, this.entries.get(key)!);
 }
 commit(oid: string, field?: string): Promise<readonly string[]> {
  pinned(oid); return this.enqueue(() => this.fetch('commit', [oid], () => this.source.commit(oid, field)) as Promise<readonly string[]>);
 }
 file(commit: string, path: string): Promise<PinnedBlob | null> {
  pinned(commit); reviewPath(path); return this.enqueue(() => this.fetch('file', [commit, path], () => this.source.file(commit, path)) as Promise<PinnedBlob | null>);
 }
 isAncestor(origin: string, revision: string): Promise<boolean> {
  pinned(origin); pinned(revision); return this.enqueue(() => this.fetch('isAncestor', [origin, revision], () => this.source.isAncestor(origin, revision)) as Promise<boolean>);
 }
 changedRanges(commit: string, parent: string | null, paths: readonly string[]): Promise<readonly ChangedRange[]> {
  pinned(commit); if (parent !== null) pinned(parent); for (const path of paths) reviewPath(path);
  const copy = [...paths]; return this.enqueue(() => this.fetch('changedRanges', [commit, parent, copy], () => this.source.changedRanges(commit, parent, copy)) as Promise<readonly ChangedRange[]>);
 }
 pathChanges(from: string, to: string, path: string): Promise<readonly string[]> {
  pinned(from); pinned(to); reviewPath(path); return this.enqueue(() => this.fetch('pathChanges', [from, to, path], () => this.source.pathChanges(from, to, path)) as Promise<readonly string[]>);
 }
 prefetchObjects(input: readonly ReviewObjectRequest[]): Promise<void> {
  if (input.length > 10000) throw new Error('Source object inventory exceeds bound');
  const requests = input.map(r => { pinned(r.commit); if (r.path !== undefined) reviewPath(r.path); return { ...r }; });
  return this.enqueue(async () => {
   this.metrics.logicalQueries += requests.length;
   const unique = new Map<string, ReviewObjectRequest>();
   for (const r of requests) { const key = this.queryKey(r.path === undefined ? 'commit' : 'file', r.path === undefined ? [r.commit] : [r.commit, r.path]); if (!this.entries.has(key)) unique.set(key, r); }
   const pending = [...unique.entries()];
   const maxObjects = Math.min(256, this.limits.batchMaxObjects);
   for (let i = 0; i < pending.length; i += maxObjects) {
    const chunk = pending.slice(i, i + maxObjects);
    const inventoryToken = await this.capacity.reserve(chunk.length * 512 + 1024); this.tokens.add(inventoryToken);
    const inventory = await this.source.objectInventory(chunk.map(([, r]) => r)); this.metrics.objectInventoryBatches++;
    if (inventory.length !== chunk.length || inventory.some(o => !Number.isSafeInteger(o.bytes) || o.bytes < 0 || o.bytes > 4 * 1024 * 1024)) throw new Error('Incomplete or oversized source inventory');
    await this.capacity.release(inventoryToken); this.tokens.delete(inventoryToken);
    let at = 0;
    while (at < chunk.length) {
     let end = at, bytes = 0;
     while (end < chunk.length && (end === at || bytes + inventory[end]!.bytes <= Math.min(4 * 1024 * 1024, this.limits.batchMaxBytes)
      && Math.ceil((bytes + inventory[end]!.bytes) * 4 / 3) * 2 + (end - at + 1) * 32768 <= this.limits.memoryMaxBytes * 2)) { bytes += inventory[end]!.bytes; end++; }
     // Base64 expansion, JSON/index metadata and temporary write duplication.
     const reservationBytes = Math.ceil(bytes * 4 / 3) * 2 + (end - at) * 32768;
     if (reservationBytes > this.limits.memoryMaxBytes * 2) throw new Error('Source batch exceeds working memory bound');
     const batch = chunk.slice(at, end), token = await this.capacity.reserve(Math.max(1, reservationBytes)); this.tokens.add(token);
     const values = await this.source.objects(batch.map(([, r]) => r)); this.metrics.objectReadBatches++;
     if (values.length !== batch.length) throw new Error('Incomplete source object batch');
     const decoded = batch.map(([key, r], j) => {
      const blob = values[j]!;
      if ((blob !== null) !== inventory[at + j]!.exists || blob && blob.bytes.byteLength !== inventory[at + j]!.bytes) throw new Error('Source object changed after inventory');
      const method = r.path === undefined ? 'commit' : 'file';
      if (method === 'commit' && !blob) throw new Error('Pinned commit unavailable');
      const value = method === 'file' ? blob : Buffer.from(blob!.bytes).toString('utf8').split('\n\n', 1)[0]!.split('\n').filter(l => l.startsWith('parent ')).map(l => l.slice(7));
      return { key, method: method as Method, value, encoded: encode(method, value) };
     });
     const ownTokens = await this.capacity.split(token, decoded.map(d => d.encoded.length * 2 + 16384));
     this.tokens.delete(token); for (const child of ownTokens) this.tokens.add(child);
     for (const [j, d] of decoded.entries()) {
      this.metrics.physicalQueries++; await this.stage(d.method, d.key, d.value, ownTokens[j]!);
     }
     at = end;
    }
   }
  });
 }
 snapshot() { return { ...this.metrics, memoryBytes: this.memoryBytes + this.metadataBytes }; }
 async close(): Promise<void> {
  if (this.closed) return; this.closing = true; await this.tail;
  // The owning worker must dispose its native readers before calling close.
  // Deletion failure deliberately retains all reservations and evidence.
  const identity = await lstat(this.directory, { bigint: true });
  if (!identity.isDirectory() || identity.isSymbolicLink() || identity.dev !== this.identity.dev || identity.ino !== this.identity.ino) throw new Error('Source staging directory replaced; retain capacity/evidence');
  await rm(this.directory, { recursive: true });
  for (const token of this.tokens) await this.capacity.release(token);
  this.tokens.clear(); this.entries.clear(); this.memory.clear(); this.memoryBytes = 0; this.metadataBytes = 0; this.closed = true;
 }
}
