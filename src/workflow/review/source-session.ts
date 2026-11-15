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
import { writeReviewBytes } from '../code-review/task-review/checkpoint.js';
import { ReviewMemoryBudget } from './preparation-memory.js';
import type { MemoryLease, MemoryReservation } from './preparation-memory.js';

/** Main-owned implementation, injected through the private preparation service
 * when workers are wired. One instance accounts every session in a project. */
export interface SourceCapacity {
 reserve(bytes: number): Promise<string>;
 commit(token: string, bytes: number): Promise<void>;
 split(token: string, bytes: readonly number[]): Promise<readonly string[]>;
 combine(tokens: readonly string[]): Promise<string>;
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
 async combine(tokens: readonly string[]): Promise<string> {
  if (!tokens.length || new Set(tokens).size !== tokens.length || tokens.some(t => !this.reservations.has(t))) throw new Error('Invalid source reservation consolidation');
  const bytes = tokens.reduce((sum, token) => sum + this.reservations.get(token)!, 0), combined = randomUUID();
  for (const token of tokens) this.reservations.delete(token);
  this.reservations.set(combined, bytes); return combined;
 }
 get bytes(): number { return this.used; }
 assertReserved(token: string, bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || this.reservations.get(token) !== bytes) throw new Error('Unbound preparation capacity receipt');
 }
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
/** Upper bound on JSON encoding without first producing the string. */
function encodingBound(value: unknown): number {
 if (typeof value === 'string') return value.length * 6 + 2;
 if (typeof value === 'number') return 32;
 if (value === null || typeof value === 'boolean') return 5;
 let bytes = 2;
 if (Array.isArray(value)) { for (const item of value) bytes += encodingBound(item) + 1; }
 else if (value && typeof value === 'object') { for (const key in value) if (Object.hasOwn(value, key)) bytes += encodingBound(key) + encodingBound(Reflect.get(value, key)) + 2; }
 else throw new Error('Invalid source encoding value');
 return bytes;
}
/** Bound parser output + UTF-16 input string by scanning wire bytes in place.
 * Structural overhead is counted before JSON.parse allocates it. */
function decodingBound(bytes: Uint8Array): number {
 let result = bytes.length * 4 + 512, quoted = false, escaped = false;
 for (const code of bytes) {
  if (quoted) { if (escaped) escaped = false; else if (code === 92) escaped = true; else if (code === 34) quoted = false; }
  else if (code === 34) { quoted = true; result += 64; }
  else if (code === 91 || code === 123) result += 128;
  else if (code === 58 || code === 44) result += 96;
 }
 return result;
}
function resultBytes(value: unknown): number {
 if (typeof value === 'string') return value.length * 2 + 64;
 if (!value || typeof value !== 'object') return 0;
 if (value instanceof Uint8Array) return value.buffer.byteLength + 64;
 let bytes = 128;
 if (Array.isArray(value)) { for (const item of value) bytes += 16 + resultBytes(item); }
 else for (const key in value) if (Object.hasOwn(value, key)) bytes += key.length * 2 + 64 + resultBytes(Reflect.get(value, key));
 return bytes;
}
export { encode as encodeReviewSourceResult, decode as decodeReviewSourceResult };
export const reviewSourceQueryDigest = (method: Method, args: readonly unknown[]) => sha(JSON.stringify([method, ...args]));

/** Exact session cache, not a persisted qualification credential. Errors fence
 * the session; a missing/corrupt staged result is never silently fetched again.
 * All query maps are bounded and all active evidence remains disk-pinned. */
export class ReviewSourceSession implements ReviewSources {
 private readonly entries = new Map<string, Entry>();
 private readonly queriesByDigest = new Map<string, string>();
 private readonly memory = new Map<string, Buffer>();
 private readonly memoryLeases = new Map<string, MemoryLease>();
 private readonly metadataLeases: MemoryLease[] = [];
 private readonly evidenceBorrows = new Set<() => void>();
 private readonly results = new WeakMap<object, () => void>();
 private readonly resultOwners = new Set<() => void>();
 private readonly removeEvictor: () => void;
 private readonly tokens = new Set<string>();
 private memoryBytes = 0;
 private metadataBytes = 0;
 private tail: Promise<void> = Promise.resolve();
 private failed = false;
 private closing = false;
 private closed = false;
 private observer: ((metrics: ReturnType<ReviewSourceSession['snapshot']>) => Promise<void>) | undefined;
 private observed = '';
 private readonly metrics = { logicalQueries: 0, logicalCompleted: 0, physicalQueries: 0, physicalCompleted: 0, cacheHits: 0, diskHits: 0, objectInventoryBatches: 0, objectReadBatches: 0, storedBytes: 0 };
 private constructor(readonly directory: string, readonly key: Readonly<ReviewKey>, private readonly source: BatchReviewSources, private readonly limits: ReviewPreparationLimits, private readonly capacity: SourceCapacity, private readonly identity: { dev: bigint; ino: bigint }, readonly workingMemory: ReviewMemoryBudget) {
  this.removeEvictor = workingMemory.onEvict(() => this.evictMemory());
 }
 static async create(key: ReviewKey, source: BatchReviewSources, limits: ReviewPreparationLimits, capacity: SourceCapacity, memory = new ReviewMemoryBudget(limits.memoryMaxBytes)): Promise<ReviewSourceSession> {
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
  if (memory.limit !== limits.memoryMaxBytes) throw new Error('Source memory owner has different bound');
  return new ReviewSourceSession(directory, Object.freeze({ ...key }), source, { ...limits }, capacity, { dev: identity.dev, ino: identity.ino }, memory);
 }
 private enqueue<T>(work: () => Promise<T>): Promise<T> {
  if (this.closing || this.closed) return Promise.reject(new Error('Source session closed'));
  const result = this.tail.then(async () => {
   if (this.failed) throw new Error('Source session fenced; explicit new preparation required');
   try {
    const value = await work();
    const stamp = JSON.stringify([this.metrics.logicalCompleted, this.metrics.physicalCompleted, this.metrics.cacheHits, this.metrics.storedBytes, this.metrics.objectInventoryBatches, this.metrics.objectReadBatches]);
    if (this.observer && stamp !== this.observed) { await this.observer(this.snapshot()); this.observed = stamp; }
    return value;
   } catch (error) { this.failed = true; throw error; }
  });
  this.tail = result.then(() => {}, () => {}); return result;
 }
 private queryKey(method: Method, args: readonly unknown[]): string {
  const key = JSON.stringify([method, ...args]);
  if (Buffer.byteLength(key) > 8192) throw new Error('Source query identity exceeds bound'); return key;
 }
 private keep(key: string, bytes: Buffer): void {
  const previous = this.memory.get(key); if (previous) this.memoryBytes -= previous.length;
  this.memoryLeases.get(key)?.release(); this.memoryLeases.delete(key);
  this.memory.delete(key);
  // Account returned decode as well as the cached wire representation.
  const budget = this.limits.memoryMaxBytes - this.metadataBytes - bytes.length;
  while (this.memoryBytes + bytes.length > budget && this.memory.size) {
   this.evictMemory();
  }
  if (this.memoryBytes + bytes.length <= budget) {
   // Cache ownership is optional; pinned disk evidence is never evicted. Other
   // consumers share this budget and can evict these unborrowed wire bytes.
   let lease: MemoryLease;
   try { lease = this.workingMemory.buffer(bytes, 'source wire cache'); }
   catch (error) { if (error instanceof Error && error.message.startsWith('Preparation memory capacity exhausted')) return; throw error; }
   this.memory.set(key, bytes); this.memoryLeases.set(key, lease); this.memoryBytes += bytes.length;
  }
 }
 private evictMemory(): boolean {
  const key = this.memory.keys().next().value; if (key === undefined) return false;
  this.memoryBytes -= this.memory.get(key)!.length; this.memory.delete(key);
  this.memoryLeases.get(key)?.release(); this.memoryLeases.delete(key); return true;
 }
 private async load(method: Method, key: string, entry: Entry): Promise<unknown> {
  let bytes = this.memory.get(key);
  let wireLease: MemoryLease | undefined;
  try {
  if (!bytes) {
   this.metrics.diskHits++;
   const file = await open(join(this.directory, entry.name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
   try {
    const st = await file.stat(); if (!st.isFile() || st.size !== entry.bytes || st.size > this.limits.memoryMaxBytes - this.metadataBytes) throw new Error('Invalid staged source size');
    const allocation = this.workingMemory.allocate(st.size + 1, 'source staged read'); wireLease = allocation.lease;
    bytes = Buffer.from(allocation.bytes.buffer, allocation.bytes.byteOffset, allocation.bytes.byteLength); let offset = 0;
    while (offset < bytes.length) { const n = await file.read(bytes, offset, bytes.length - offset, null); if (!n.bytesRead) break; offset += n.bytesRead; }
    if (offset !== st.size) throw new Error('Staged source changed'); bytes = bytes.subarray(0, offset);
   } finally { await file.close(); }
  } else { wireLease = this.workingMemory.buffer(bytes, 'source cached read'); }
  if (sha(bytes) !== entry.digest) throw new Error('Staged source integrity mismatch');
  this.keep(key, bytes);
  const scratch = this.workingMemory.reserve(decodingBound(bytes), 'source decoder scratch');
  try {
   if (method === 'file') {
    const raw: unknown = JSON.parse(bytes.toString('utf8'));
    if (raw === null) return null;
    if (!raw || typeof raw !== 'object' || typeof Reflect.get(raw, 'oid') !== 'string' || typeof Reflect.get(raw, 'base64') !== 'string') throw new Error('Invalid staged blob');
    const oid = Reflect.get(raw, 'oid') as string, base64 = Reflect.get(raw, 'base64') as string;
    pinned(oid);
    const allocation = this.workingMemory.allocate(Buffer.byteLength(base64, 'base64'), 'source decoded bytes');
    let meta: MemoryLease | undefined;
    try {
     meta = this.workingMemory.reserve(oid.length * 2 + 512, 'source decoded blob metadata');
     const buffer = Buffer.from(allocation.bytes.buffer, allocation.bytes.byteOffset, allocation.bytes.byteLength);
     if (buffer.write(base64, 'base64') !== buffer.length) throw new Error('Invalid staged base64 bytes');
     return this.ownResult({ oid, bytes: buffer }, [allocation.lease, meta]);
    } catch (error) { allocation.lease.release(); meta?.release(); throw error; }
   }
   const value = decode(method, bytes);
   const owned = resultBytes(value); scratch.resize(owned, 'source decoded result');
   if (value && typeof value === 'object') return this.ownResult(value, [scratch]);
   scratch.release(); return value;
  } catch (error) { scratch.release(); throw error; }
  finally { if (method === 'file') scratch.release(); }
  } finally { wireLease?.release(); }
 }
 private ownResult<T extends object>(value: T, leases: MemoryLease[]): T {
  const owner = this.workingMemory.reserve(256, 'source result ownership');
  let active = true;
  const release = () => { if (active) { active = false; for (const lease of leases) lease.release(); owner.release(); this.resultOwners.delete(release); this.results.delete(value); } };
  this.results.set(value, release); this.resultOwners.add(release); return value;
 }
 /** Release only when the caller has finished all use of a decoded result.
  * Session/disk close does not release usable returned values. Their charges
  * remain until this explicit final-owner release, including after close. */
 releaseResult(value: unknown): void { if (value && typeof value === 'object') this.results.get(value)?.(); }
 private async stage(method: Method, key: string, value: unknown, token: string): Promise<void> {
  const metadata = Buffer.byteLength(key) * 2 + 512;
  const meta = this.workingMemory.reserve(metadata, 'source query metadata');
  let scratch: MemoryReservation | undefined, retained = false, transferred = false;
  try {
  const estimate = method === 'file' && value !== null ? Math.ceil((value as PinnedBlob).bytes.byteLength / 3) * 4 + 256 : encodingBound(value);
  scratch = this.workingMemory.reserve(estimate * (method === 'file' ? 6 : 3) + 8192, 'source encoder scratch');
  const bytes = encode(method, value);
  if (this.entries.size >= 100000 || bytes.length + this.metadataBytes + metadata > this.limits.memoryMaxBytes) throw new Error('Source session memory/identity capacity exhausted');
  const entry = { name: `${sha(key)}.json`, digest: sha(bytes), bytes: bytes.length };
  const lineScratch = this.workingMemory.reserve(metadata * 6 + 4096, 'source index encoding');
  let line: string;
  try { line = JSON.stringify({ query: key, ...entry }) + '\n';
  // Reservation covers immutable payload, its temporary write, and the index.
  await this.capacity.commit(token, bytes.length * 2 + Buffer.byteLength(line));
  await writeReviewBytes(join(this.directory, entry.name), bytes, this.limits.memoryMaxBytes);
  const index = await open(join(this.directory, 'queries.jsonl'), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try { await index.writeFile(line); await index.sync(); } finally { await index.close(); }
  const directory = await open(this.directory, 'r'); try { await directory.sync(); } finally { await directory.close(); }
  this.metadataLeases.push(meta); retained = true;
  this.entries.set(key, entry); this.queriesByDigest.set(sha(key), key); this.metadataBytes += metadata; this.metrics.storedBytes += bytes.length + Buffer.byteLength(line);
  await this.capacity.commit(token, bytes.length + Buffer.byteLength(line));
  } finally { lineScratch.release(); }
  const allocation = this.workingMemory.adopt(bytes, scratch, 'source encoded cache');
  transferred = true;
  try {
  this.keep(key, bytes);
  } finally { allocation.release(); }
  } finally { if (!transferred) scratch?.release(); if (!retained) meta.release(); }
 }
 private async fetch(method: Method, args: readonly unknown[], work: () => Promise<unknown>): Promise<unknown> {
  let keyBound = method.length * 6 + 16; for (const arg of args) keyBound += encodingBound(arg) + 1;
  const query = this.workingMemory.reserve(keyBound * 2 + 512, 'source query construction');
  try {
  this.metrics.logicalQueries++;
  const key = this.queryKey(method, args), entry = this.entries.get(key);
  if (entry) { const value = await this.load(method, key, entry); this.metrics.cacheHits++; this.metrics.logicalCompleted++; return value; }
  const wireBounds: Record<Method, number> = { file: Math.ceil(4 * 1024 * 1024 * 4 / 3) + 512, commit: 4 * 1024 * 1024,
   isAncestor: 64, pathChanges: 2 * 1024 * 1024, changedRanges: 32 * 1024 * 1024 };
  const token = await this.capacity.reserve(Math.min(this.limits.memoryMaxBytes, wireBounds[method]) * 2 + 16384); this.tokens.add(token);
  let bodyBound = wireBounds[method];
  let fileBytes: number | undefined, fileExists: boolean | undefined;
  if (method === 'file') {
   const meta = this.workingMemory.reserve(2048, 'source inventory');
   try {
    const inventory = await this.source.objectInventory([{ commit: String(args[0]), path: String(args[1]) }]); this.metrics.objectInventoryBatches++;
    if (inventory.length !== 1 || !Number.isSafeInteger(inventory[0]!.bytes) || inventory[0]!.bytes < 0 || inventory[0]!.bytes > 4 * 1024 * 1024) throw new Error('Invalid source object inventory');
    fileBytes = inventory[0]!.bytes; fileExists = inventory[0]!.exists; bodyBound = Math.max(8192, fileBytes) + 1024;
   } finally { meta.release(); }
  }
  const native = this.workingMemory.reserve(bodyBound, 'source body acquisition');
  try {
  this.metrics.physicalQueries++;
  const value = await work();
  if (method === 'file' && ((value !== null) !== fileExists || value !== null && (value as PinnedBlob).bytes.byteLength !== fileBytes)) throw new Error('Source changed after inventory');
  await this.stage(method, key, value, token); this.metrics.physicalCompleted++;
  } finally { native.release(); }
  const loaded = await this.load(method, key, this.entries.get(key)!); this.metrics.logicalCompleted++; return loaded;
  } finally { query.release(); }
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
  let size = 512; for (const path of paths) size += path.length * 2 + 32;
  const lease = this.workingMemory.reserve(size, 'source path snapshot');
  const copy = [...paths]; return this.enqueue(() => this.fetch('changedRanges', [commit, parent, copy], () => this.source.changedRanges(commit, parent, copy)) as Promise<readonly ChangedRange[]>).finally(() => lease.release());
 }
 pathChanges(from: string, to: string, path: string): Promise<readonly string[]> {
  pinned(from); pinned(to); reviewPath(path); return this.enqueue(() => this.fetch('pathChanges', [from, to, path], () => this.source.pathChanges(from, to, path)) as Promise<readonly string[]>);
 }
 prefetchObjects(input: readonly ReviewObjectRequest[]): Promise<void> {
  if (input.length > 10000) throw new Error('Source object inventory exceeds bound');
  return this.enqueue(async () => {
   let metadataBytes = 1024;
   for (const request of input) metadataBytes += (request.commit.length + (request.path?.length ?? 0)) * 6 + 2048;
   const metadata = this.workingMemory.reserve(metadataBytes, 'source prefetch request index');
   try {
   const requests = input.map(r => { pinned(r.commit); if (r.path !== undefined) reviewPath(r.path); return { ...r }; });
   this.metrics.logicalQueries += requests.length;
   const unique = new Map<string, ReviewObjectRequest>();
   for (const r of requests) { const key = this.queryKey(r.path === undefined ? 'commit' : 'file', r.path === undefined ? [r.commit] : [r.commit, r.path]); if (!this.entries.has(key)) unique.set(key, r); }
   const pending = [...unique.entries()];
   const maxObjects = Math.min(256, this.limits.batchMaxObjects);
   for (let i = 0; i < pending.length; i += maxObjects) {
    const chunk = pending.slice(i, i + maxObjects);
    const inventoryToken = await this.capacity.reserve(chunk.length * 512 + 1024); this.tokens.add(inventoryToken);
    const inventoryMemory = this.workingMemory.reserve(chunk.length * 2048 + 1024, 'source object inventory');
    try {
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
     const body = this.workingMemory.reserve(bytes + batch.length * 8192 + 1024, 'source object batch acquisition');
     try {
      const values = await this.source.objects(batch.map(([, r]) => r)); this.metrics.objectReadBatches++;
      if (values.length !== batch.length) throw new Error('Incomplete source object batch');
      const parts = batch.map((_, j) => Math.ceil(inventory[at + j]!.bytes * 4 / 3) * 2 + 16384);
      const ownTokens = await this.capacity.split(token, parts);
      this.tokens.delete(token); for (const child of ownTokens) this.tokens.add(child);
      for (let j = 0; j < batch.length; j++) {
       const [key, request] = batch[j]!, blob = values[j]!;
       if ((blob !== null) !== inventory[at + j]!.exists || blob && blob.bytes.byteLength !== inventory[at + j]!.bytes) throw new Error('Source object changed after inventory');
       const method: Method = request.path === undefined ? 'commit' : 'file';
       if (method === 'commit' && !blob) throw new Error('Pinned commit unavailable');
       const scratch = this.workingMemory.reserve(method === 'commit' ? blob!.bytes.length * 6 + 1024 : 0, 'source commit header decoding');
       try {
        const raw = blob && Buffer.from(blob.bytes.buffer, blob.bytes.byteOffset, blob.bytes.length);
        const value = method === 'file' ? blob : raw!.subarray(0, raw!.indexOf('\n\n') < 0 ? raw!.length : raw!.indexOf('\n\n')).toString('utf8').split('\n').filter(l => l.startsWith('parent ')).map(l => l.slice(7));
        this.metrics.physicalQueries++; await this.stage(method, key, value, ownTokens[j]!); this.metrics.physicalCompleted++;
       } finally { scratch.release(); }
      }
     } finally { body.release(); }
     at = end;
    }
    } finally { inventoryMemory.release(); }
   }
   for (const request of requests) {
    const method = request.path === undefined ? 'commit' : 'file', args = request.path === undefined ? [request.commit] : [request.commit, request.path];
    const key = this.queryKey(method, args), value = await this.load(method, key, this.entries.get(key)!); this.releaseResult(value); this.metrics.logicalCompleted++;
   }
   this.metrics.cacheHits += requests.length - pending.length;
   } finally { metadata.release(); }
  });
 }
 observe(observer: (metrics: ReturnType<ReviewSourceSession['snapshot']>) => Promise<void>): () => void {
  if (this.observer || this.closed || this.closing) throw new Error('Source progress observer unavailable');
  this.observer = observer;
  return () => { if (this.observer === observer) this.observer = undefined; };
 }
 snapshot() { return { ...this.metrics, memoryBytes: this.memoryBytes + this.metadataBytes, workingMemory: this.workingMemory.snapshot() }; }
 evidence(): Promise<readonly { queryDigest: string; contentDigest: string; bytes: number }[]> {
  return this.enqueue(async () => {
   const lease = this.workingMemory.reserve(this.entries.size * 512 + 512, 'source evidence inventory');
   try { return this.ownResult([...this.entries].map(([query, entry]) => ({ queryDigest: sha(query), contentDigest: entry.digest, bytes: entry.bytes })), [lease]); }
   catch (error) { lease.release(); throw error; }
  });
 }
 async readEvidence(queryDigest: string): Promise<Buffer> {
  const window = await this.borrowEvidence(queryDigest);
  try {
   const allocation = this.workingMemory.allocate(window.bytes.length, 'retained source evidence copy');
   try { allocation.bytes.set(window.bytes); return this.ownResult(Buffer.from(allocation.bytes.buffer, allocation.bytes.byteOffset, allocation.bytes.length), [allocation.lease]); }
   catch (error) { allocation.lease.release(); throw error; }
  } finally { window.release(); }
 }
 /** Codec transfer of already encoded evidence: no decode/base64/re-encode
  * amplification. The same allocation is charged once across source and view
  * owners, and close cannot discard a still-borrowed source session. */
 borrowEvidence(queryDigest: string): Promise<{ readonly bytes: Uint8Array; release(): void }> {
  return this.enqueue(async () => {
   const key = this.queriesByDigest.get(queryDigest), entry = key && this.entries.get(key);
   if (!entry) throw new Error('Unknown session evidence');
   const file = await open(join(this.directory, entry.name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
   let failedCloseRelease: (() => void) | undefined;
   try {
    const st = await file.stat(); if (!st.isFile() || st.size !== entry.bytes) throw new Error('Invalid staged evidence size');
    const allocation = this.workingMemory.allocate(entry.bytes + 1, 'source evidence window');
    try {
     let offset = 0;
     while (offset < allocation.bytes.length) { const n = await file.read(allocation.bytes, offset, allocation.bytes.length - offset, null); if (!n.bytesRead) break; offset += n.bytesRead; }
     const bytes = allocation.bytes.subarray(0, offset);
     if (offset !== entry.bytes || sha(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)) !== entry.digest) throw new Error('Staged evidence integrity mismatch');
     let active = true;
     const release = () => { if (active) { active = false; allocation.lease.release(); this.evidenceBorrows.delete(release); } };
     failedCloseRelease = release;
     this.evidenceBorrows.add(release);
     return { get bytes() { if (!active) throw new Error('Source evidence window released'); return bytes; }, release };
    } catch (error) { allocation.lease.release(); throw error; }
   } finally { try { await file.close(); } catch (error) { failedCloseRelease?.(); throw error; } }
  });
 }
 async close(): Promise<void> {
  if (this.closed) return; this.closing = true; await this.tail;
  if (this.evidenceBorrows.size) throw new Error('Source evidence windows remain borrowed');
  // The owning worker must dispose its native readers before calling close.
  // Deletion failure deliberately retains all reservations and evidence.
  const identity = await lstat(this.directory, { bigint: true });
  if (!identity.isDirectory() || identity.isSymbolicLink() || identity.dev !== this.identity.dev || identity.ino !== this.identity.ino) throw new Error('Source staging directory replaced; retain capacity/evidence');
  await rm(this.directory, { recursive: true });
  for (const token of this.tokens) await this.capacity.release(token);
  this.tokens.clear(); this.entries.clear(); this.queriesByDigest.clear();
  while (this.evictMemory()) { /* release only source-owned unborrowed cache */ }
  for (const lease of this.metadataLeases) lease.release(); this.metadataLeases.length = 0; this.removeEvictor();
  this.memoryBytes = 0; this.metadataBytes = 0; this.closed = true;
 }
}
