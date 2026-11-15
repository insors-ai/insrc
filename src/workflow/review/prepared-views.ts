/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeStagedContextManifest } from '../../shared/review-preparation.js';
import type { StagedContextManifest } from '../../shared/review-preparation.js';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { reviewJsonLimit } from '../../config/review.js';
import { writeReviewBytes } from '../code-review/task-review/checkpoint.js';
import { preparedContextParents, bytesAt, preparationDigest, sourceGeneration, PreparedContextWriteError } from './prepared-context.js';
import type { PreparedSourceIdentity, ReadyContextReceipt } from './prepared-context.js';
import type { SourceCapacity, ReviewSourceSession } from './source-session.js';
import { ReviewMemoryBudget } from './preparation-memory.js';
import type { MemoryLease } from './preparation-memory.js';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
type Kind = StagedContextManifest['views'][number]['kind'];
type Entry = readonly [string | number, string];
type Child = readonly [string, number];
type Scalar = null | undefined | string | number | boolean;
type ViewNode = ['null'] | ['undefined'] | ['scalar', string | number | boolean]
 | ['bytes' | 'text', number, string | null] | ['array' | 'object', number, string | null];
type IndexNode = ['items', Entry[]] | ['branch', Child[]];
type Node = ViewNode | IndexNode;

function decodeNode(n: unknown): Node {
    if (!Array.isArray(n) || !['null', 'undefined', 'scalar', 'bytes', 'text', 'array', 'object', 'items', 'branch'].includes(n[0])) throw new Error('Invalid staged node tag');
    if (n[0] === 'null' || n[0] === 'undefined') { if (n.length !== 1) throw new Error('Invalid staged empty node'); }
    else if (n[0] === 'scalar') { if (n.length !== 2 || !(typeof n[1] === 'string' && n[1].length <= 1024 || typeof n[1] === 'boolean' || typeof n[1] === 'number' && Number.isFinite(n[1]))) throw new Error('Invalid staged scalar'); }
    else if (n[0] === 'items' || n[0] === 'branch') {
     if (n.length !== 2 || !Array.isArray(n[1]) || n[1].length < 1 || n[1].length > 16) throw new Error('Invalid staged index shard');
     for (const row of n[1]) if (!Array.isArray(row) || row.length !== 2 || (n[0] === 'items' ? !(typeof row[0] === 'string' && row[0].length <= 4096 || natural(row[0])) || !digest(row[1]) : !digest(row[0]) || !natural(row[1]))) throw new Error('Invalid staged index entry');
    } else if (n.length !== 3 || !natural(n[1]) || n[2] !== null && !digest(n[2]) || (n[1] === 0) !== (n[2] === null)) throw new Error('Invalid staged container');
 return n as Node;
}

/** References are reader/builder-issued objects, never caller-supplied digests. */
export interface PreparedValueReference { readonly digest: string; }
export interface PreparedDescriptor extends PreparedValueReference { readonly id: string; readonly kind: Kind; }
export interface PreparedWindow<T> { readonly value: T; release(): void; }

interface MetadataAccess {
 memory: ReviewMemoryBudget;
 node(digest: string): Promise<PreparedWindow<Node>>;
 bytes(digest: string): Promise<PreparedWindow<Uint8Array>>;
 reference(digest: string): PreparedValueReference;
}
async function* metadataEntries(access: MetadataAccess, d: string, ancestors = new Set<string>()): AsyncGenerator<Entry> {
 if (ancestors.size >= 128 || ancestors.has(d)) throw new Error('Cyclic/deep staged metadata index');
 const node = await access.node(d); ancestors.add(d);
 try {
  if (node.value[0] === 'items') { for (const entry of node.value[1]) yield entry; }
  else if (node.value[0] === 'branch') {
   for (const [child, expected] of node.value[1]) {
    let count = 0; for await (const entry of metadataEntries(access, child, ancestors)) { count++; yield entry; }
    if (count !== expected) throw new Error('Staged metadata branch count mismatch');
   }
  } else throw new Error('Expected staged metadata index');
 } finally { ancestors.delete(d); node.release(); }
}
/** Rehydrates metadata only. Binary leaves stay private issued references.
 * Every reconstructed value remains charged until the returned owner releases. */
async function metadataValue(access: MetadataAccess, d: string, leases: MemoryLease[], ancestors = new Set<string>()): Promise<unknown> {
 if (ancestors.size >= 128 || ancestors.has(d)) throw new Error('Cyclic/deep staged metadata');
 const node = await access.node(d); ancestors.add(d);
 try {
  const v = node.value;
  if (v[0] === 'null') return null;
  if (v[0] === 'undefined') return undefined;
  if (v[0] === 'scalar') { leases.push(access.memory.reserve(typeof v[1] === 'string' ? v[1].length * 2 + 64 : 32, 'staged scalar metadata')); return v[1]; }
  if (v[0] === 'bytes') { leases.push(access.memory.reserve(128, 'staged binary metadata reference')); return access.reference(d); }
  if (v[0] === 'text') {
   // Includes accumulated fragments and the final joined string concurrently.
   leases.push(access.memory.reserve(v[1] * 4 + 256, 'staged text metadata'));
   const decoder = new TextDecoder('utf8', { fatal: true, ignoreBOM: true }), parts: string[] = [];
   let bytes = 0, ordinal = 0;
   if (v[2]) for await (const [key, leaf] of metadataEntries(access, v[2])) {
    if (key !== ordinal++) throw new Error('Unordered staged metadata text');
    const chunk = await access.bytes(leaf);
    try {
     bytes += chunk.value.length; if (bytes > v[1]) throw new Error('Staged metadata text length mismatch');
     leases.push(access.memory.reserve(32, 'staged text fragment index')); parts.push(decoder.decode(chunk.value, { stream: true }));
    } finally { chunk.release(); }
   }
   if (bytes !== v[1]) throw new Error('Staged metadata text length mismatch');
   parts.push(decoder.decode()); return parts.join('');
  }
  if (v[0] !== 'array' && v[0] !== 'object') throw new Error('Index is not staged metadata');
  leases.push(access.memory.reserve(256, 'staged metadata container'));
  const result: unknown[] | Record<string, unknown> = v[0] === 'array' ? [] : {};
  let count = 0;
  if (v[2]) for await (const [key, child] of metadataEntries(access, v[2])) {
   if ((v[0] === 'array' ? key !== count : typeof key !== 'string' || Object.hasOwn(result, key)) || ++count > v[1]) throw new Error('Invalid staged metadata child');
   leases.push(access.memory.reserve((typeof key === 'string' ? key.length * 2 : 0) + 96, 'staged metadata child'));
   Object.defineProperty(result, key, { value: await metadataValue(access, child, leases, ancestors), enumerable: true, configurable: true, writable: true });
  }
  if (count !== v[1]) throw new Error('Staged metadata child count mismatch');
  return result;
 } finally { ancestors.delete(d); node.release(); }
}

// Conservative encoding upper bound, without first serializing a large value.
// Only bounded internal metadata enters this function; payload bytes do not.
function jsonBound(value: unknown): number {
 if (typeof value === 'string') return value.length * 6 + 2;
 if (typeof value === 'number') return 32;
 if (value === null || typeof value === 'boolean') return 5;
 if (Array.isArray(value)) { let size = 2; for (const item of value) size += jsonBound(item) + 1; return size; }
 if (value && typeof value === 'object') { let size = 2; for (const key in value) if (Object.hasOwn(value, key)) size += jsonBound(key) + jsonBound(Reflect.get(value, key)) + 2; return size; }
 throw new Error('Unsupported staged metadata');
}

/** Same project store, capacity owner and receipt protocol as prepared-context.
 * v2 stores bounded index shards and leaves during construction. It has no
 * aggregate packet loader. Production consumer cutover is a later plan task. */
export class PreparedViewWriter {
 private readonly objects = new Map<string, StagedContextManifest['objects'][number]>();
 private readonly files = new Map<string, number>();
 private readonly views: StagedContextManifest['views'] = [];
 private readonly issued = new WeakSet<object>();
 private readonly charges: MemoryLease[] = [];
 private readonly tokens: string[] = [];
 private tail: Promise<void> = Promise.resolve();
 private state: 'writing' | 'failed' | 'ready' | 'discarded' = 'writing';
 private disposing = false;
 private nodes = 0;
 private stored = 0;
 private readonly metadataWindows = new Set<() => void>();
 private constructor(private readonly identity: PreparedSourceIdentity, readonly memory: ReviewMemoryBudget,
  private readonly limits: ReviewPreparationLimits, private readonly capacity: SourceCapacity,
  readonly directory: string, private readonly root: string, private readonly generation: string,
  private readonly stamp: { dev: bigint; ino: bigint }, private readonly session: ReviewSourceSession | undefined,
  private readonly signal: AbortSignal | undefined) {}
 static async create(identity: PreparedSourceIdentity, limits: ReviewPreparationLimits, capacity: SourceCapacity,
  memory: ReviewMemoryBudget, session?: ReviewSourceSession, signal?: AbortSignal): Promise<PreparedViewWriter> {
  sourceGeneration(identity);
  if (memory.limit !== limits.memoryMaxBytes || Object.values(limits).some(n => !Number.isSafeInteger(n) || n < 1)) throw new Error('Unbound staged memory limits');
  if (session && (preparationDigest(session.key) !== preparationDigest(identity.key) || session.workingMemory !== memory)) throw new Error('Foreign source session or memory owner');
  signal?.throwIfAborted();
  const root = await preparedContextParents(identity.key), generation = sha(`${sourceGeneration(identity)}:${randomUUID()}`), directory = join(root, `prepare-${randomUUID()}`);
  await mkdir(directory, { mode: 0o700 });
  const st = await lstat(directory, { bigint: true });
  return new PreparedViewWriter(structuredClone(identity), memory, { ...limits }, capacity, directory, root, generation, { dev: st.dev, ino: st.ino }, session, signal);
 }
 private active(): void { this.signal?.throwIfAborted(); if (this.state !== 'writing' || this.disposing) throw new Error('Staged writer unavailable'); }
 private async checkDirectory(): Promise<void> {
  this.active(); const st = await lstat(this.directory, { bigint: true });
  if (!st.isDirectory() || st.isSymbolicLink() || st.dev !== this.stamp.dev || st.ino !== this.stamp.ino || await realpath(this.directory) !== this.directory) throw new Error('Staged directory replaced; retain evidence');
 }
 private enqueue<T>(work: () => Promise<T>): Promise<T> {
  const pending = this.tail.then(async () => { this.active(); try { return await work(); } catch (error) { this.state = 'failed'; throw error; } });
  this.tail = pending.then(() => {}, () => {}); return pending;
 }
 private reference(d: string): PreparedValueReference { const ref = Object.freeze({ digest: d }); this.issued.add(ref); return ref; }
 private async metadataBytes(d: string): Promise<PreparedWindow<Uint8Array>> {
  await this.checkDirectory();
  const size = this.files.get(d); if (size === undefined) throw new Error('Foreign construction metadata');
  const allocation = this.memory.allocate(size + 1, 'construction metadata read');
  try {
   const bytes = await bytesAt(join(this.directory, `${d}.data`), size, { bytes: size, digest: d }, allocation.bytes);
   await this.checkDirectory(); return { value: bytes, release: () => allocation.lease.release() };
  } catch (error) { allocation.lease.release(); throw error; }
 }
 private async metadataNode(d: string): Promise<PreparedWindow<Node>> {
  const size = this.files.get(d); if (size === undefined) throw new Error('Foreign construction node');
  const lease = this.memory.reserve(size * 10 + 1024, 'construction metadata node');
  try {
   const raw = await this.metadataBytes(d);
   try { return { value: decodeNode(JSON.parse(Buffer.from(raw.value.buffer, raw.value.byteOffset, raw.value.byteLength).toString('utf8'))), release: () => lease.release() }; }
   finally { raw.release(); }
  } catch (error) { lease.release(); throw error; }
 }
 /** An unqualified construction lookup, authorized solely by this live owner.
  * It cannot publish a receipt or authorize execution from disk. */
 metadata(ref: PreparedValueReference): Promise<PreparedWindow<unknown>> {
  return this.enqueue(async () => {
   if (!this.issued.has(ref)) throw new Error('Unissued construction metadata reference');
   const leases: MemoryLease[] = [];
   try {
    let held = await metadataValue({ memory: this.memory, node: d => this.metadataNode(d), bytes: d => this.metadataBytes(d), reference: d => this.reference(d) }, ref.digest, leases);
    let released = false;
    const release = () => { if (!released) { released = true; held = undefined; for (const lease of leases) lease.release(); this.metadataWindows.delete(release); } };
    this.metadataWindows.add(release); const owner = this;
    return { get value() { if (released) throw new Error('Construction metadata window released'); owner.active(); return held; }, release };
   } catch (error) { for (const lease of leases) lease.release(); throw error; }
  });
 }
 private async put(bytes: Uint8Array, query?: string): Promise<string> {
  await this.checkDirectory(); const d = sha(bytes), q = query ?? preparationDigest(['staged-content-v2', d]);
  if (!this.files.has(d)) {
   if (bytes.byteLength > this.limits.batchMaxBytes) throw new Error('Staged shard exceeds batch bound');
   const token = await this.capacity.reserve(bytes.byteLength * 2 + 512); this.tokens.push(token);
   await writeReviewBytes(join(this.directory, `${d}.data`), bytes, this.limits.batchMaxBytes);
   this.active(); await this.capacity.commit(token, bytes.byteLength);
   this.charges.push(this.memory.reserve(256, 'staged file index'));
   this.files.set(d, bytes.byteLength); this.stored += bytes.byteLength;
  }
  const old = this.objects.get(q);
  if (old && (old.contentDigest !== d || old.bytes !== bytes.byteLength)) throw new Error('Conflicting staged query');
  if (!old) {
   if (this.objects.size >= 100000) throw new Error('Staged object inventory exceeds bound');
   this.charges.push(this.memory.reserve(768, 'staged object index'));
   this.objects.set(q, { queryDigest: q, contentDigest: d, bytes: bytes.byteLength });
  }
  return d;
 }
 private async node(node: Node): Promise<string> {
  if (++this.nodes > 1000000) throw new Error('Staged value structure exceeds bound');
  const upper = jsonBound(node), lease = this.memory.reserve(upper * 2 + 512, 'staged encoder scratch');
  try {
   const text = JSON.stringify(node);
   if (Buffer.byteLength(text) > this.limits.batchMaxBytes) throw new Error('Staged index shard exceeds batch bound');
   const allocation = this.memory.allocate(Buffer.byteLength(text), 'staged encoded node');
   try {
    Buffer.from(allocation.bytes.buffer, allocation.bytes.byteOffset, allocation.bytes.byteLength).write(text, 'utf8');
    return await this.put(allocation.bytes);
   } finally { allocation.lease.release(); }
  } finally { lease.release(); }
 }
 /** Balanced, bounded fanout: neither large arrays nor object field lists are
  * collected in memory. Completed shards are retained under disk reservation. */
 private async index(entries: AsyncIterable<Entry>): Promise<{ count: number; root: string | null }> {
  const levels: { item: Child; charge: MemoryLease }[][] = [];
  let rows: Entry[] = [], charges: MemoryLease[] = [], size = 0, count = 0;
  // A branch needs at least two children. This metadata fanout does not change
  // the configured native/source object batch (which may legitimately be one).
  const fanout = Math.min(16, Math.max(2, this.limits.batchMaxObjects));
  const push = async (item: Child, level: number): Promise<void> => {
   const group = levels[level] ?? (levels[level] = []);
   group.push({ item, charge: this.memory.reserve(256, 'staged branch index') });
   if (group.length < fanout) return;
   const d = await this.node(['branch', group.map(v => v.item)]), n = group.reduce((sum, v) => sum + v.item[1], 0);
   for (const v of group) v.charge.release(); group.length = 0; await push([d, n], level + 1);
  };
  const flush = async () => {
   if (!rows.length) return;
   const n = rows.length, d = await this.node(['items', rows]);
   for (const c of charges) c.release(); rows = []; charges = []; size = 0; await push([d, n], 0);
  };
  try {
   for await (const entry of entries) {
    this.active(); const rowSize = jsonBound(entry) + 1;
    if (rows.length && (rows.length >= fanout || size + rowSize > Math.min(this.limits.batchMaxBytes / 2, this.memory.limit / 32))) await flush();
    charges.push(this.memory.reserve(rowSize * 2 + 256, 'staged index entries')); rows.push(entry); size += rowSize; count++;
    if (count > 1000000) throw new Error('Staged index count exceeds bound');
   }
   await flush();
   const roots: Child[] = [];
   for (let i = levels.length - 1; i >= 0; i--) for (const v of levels[i]!) roots.push(v.item);
   if (!roots.length) return { count, root: null };
   // At most fanout*log(count) pending roots, folded in order without an
   // unbounded last index node.
   let root: string | undefined, rootCount = 0;
   for (const item of roots) { root = root === undefined ? item[0] : await this.node(['branch', [[root, rootCount], item]]); rootCount += item[1]; }
   return { count, root: root! };
  } finally { for (const c of charges) c.release(); for (const group of levels) for (const v of group) v.charge.release(); }
 }
 private async value(value: unknown, ancestors: Set<object>, depth = 0): Promise<string> {
  this.active(); if (depth > 128) throw new Error('Staged value depth exceeds bound');
  if (value && typeof value === 'object' && this.issued.has(value)) return (value as PreparedValueReference).digest;
  if (value === null) return this.node(['null']);
  if (value === undefined) return this.node(['undefined']);
  if (typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length <= 1024) return this.node(['scalar', value]);
  if (typeof value === 'string' || value instanceof Uint8Array) {
   const input = value;
   if (typeof input === 'string') for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { const next = input.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('Staged text has an unpaired surrogate'); }
    else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('Staged text has an unpaired surrogate');
   }
   const text = typeof value === 'string', lease = text ? this.memory.reserve(value.length * 2 + 64, 'staged input text') : this.memory.buffer(value, 'staged input bytes');
   let bytes = 0;
   const self = this;
   async function* parts(): AsyncGenerator<Entry> {
    const step = Math.max(1, Math.floor(Math.min(self.limits.batchMaxBytes, self.memory.limit / 32) / (text ? 3 : 1)));
    let ordinal = 0;
    for (let offset = 0; offset < input.length;) {
     let end = Math.min(input.length, offset + step);
     if (text && end < value.length && (value as string).charCodeAt(end - 1) >= 0xd800 && (value as string).charCodeAt(end - 1) <= 0xdbff) end++;
     const scratch = self.memory.reserve((end - offset) * (text ? 2 : 0) + 128, 'staged leaf encoding');
     try {
      if (text) {
       const fragment = (value as string).slice(offset, end), allocation = self.memory.allocate(Buffer.byteLength(fragment), 'staged encoded text');
       try {
        Buffer.from(allocation.bytes.buffer, allocation.bytes.byteOffset, allocation.bytes.byteLength).write(fragment, 'utf8');
        bytes += allocation.bytes.byteLength; yield [ordinal++, await self.put(allocation.bytes)];
       } finally { allocation.lease.release(); }
      } else {
       const chunk = (value as Uint8Array).subarray(offset, end); bytes += chunk.byteLength; yield [ordinal++, await self.put(chunk)];
      }
     } finally { scratch.release(); }
     offset = end;
    }
   }
   try { const ix = await this.index(parts()); return await this.node([text ? 'text' : 'bytes', bytes, ix.root]); }
   finally { lease.release(); }
  }
  if (!value || typeof value !== 'object' || ancestors.has(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Unsupported/cyclic staged value');
  const own = this.memory.reserve(256, 'staged ancestry'); ancestors.add(value);
  const input = value;
  const self = this;
  async function* children(): AsyncGenerator<Entry> {
   if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield [i, await self.value(value[i], ancestors, depth + 1)];
   } else for (const key in input) if (Object.hasOwn(input, key)) {
    if (key.length > 4096) throw new Error('Staged property key exceeds bound');
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!('value' in descriptor)) throw new Error('Staged accessors are forbidden');
    yield [key, await self.value(descriptor.value, ancestors, depth + 1)];
   }
  }
  try { const ix = await this.index(children()); return await this.node([Array.isArray(value) ? 'array' : 'object', ix.count, ix.root]); }
  finally { ancestors.delete(value); own.release(); }
 }
 /** Central object serialization; consumers may pass previously issued refs. */
 add(id: string, kind: Kind, value: unknown): Promise<PreparedValueReference> {
  return this.enqueue(async () => {
   if (!idPattern.test(id) || !['packet', 'task', 'file', 'view'].includes(kind) || this.views.some(v => v.id === id) || this.views.length >= 10000) throw new Error('Invalid staged descriptor identity');
   const rootDigest = await this.value(value, new Set());
   this.charges.push(this.memory.reserve(id.length * 2 + 512, 'staged descriptor'));
   this.views.push({ id, kind, rootDigest }); return this.reference(rootDigest);
  });
 }
 /** Incremental packet/task/file construction. The producer owns only the
  * current entry; earlier values may be released as soon as next() is called.
  * Values can contain this writer's previously issued refs for shared leaves.
  * Caller-owned input buffers are charged while the codec consumes them; their
  * producer must not retain uncharged payloads after yielding the next entry. */
 addEntries(id: string, kind: Kind, shape: 'array' | 'object', entries: AsyncIterable<{ key: string | number; value: unknown }>): Promise<PreparedValueReference> {
  return this.enqueue(async () => {
   if (!idPattern.test(id) || !['packet', 'task', 'file', 'view'].includes(kind) || !['array', 'object'].includes(shape) || this.views.some(v => v.id === id) || this.views.length >= 10000) throw new Error('Invalid staged descriptor identity');
   const keys = new Set<string>(), charges: MemoryLease[] = []; let count = 0;
   const self = this;
   async function* rows(): AsyncGenerator<Entry> {
    for await (const entry of entries) {
     if (shape === 'array' ? entry.key !== count : typeof entry.key !== 'string' || entry.key.length > 4096 || keys.has(entry.key)) throw new Error('Duplicate/unordered staged entry');
     if (typeof entry.key === 'string') { charges.push(self.memory.reserve(entry.key.length * 2 + 128, 'staged property uniqueness')); keys.add(entry.key); }
     count++; yield [entry.key, await self.value(entry.value, new Set())];
    }
   }
   try {
    const ix = await this.index(rows()), rootDigest = await this.node([shape, ix.count, ix.root]);
    this.charges.push(this.memory.reserve(id.length * 2 + 512, 'staged descriptor'));
    this.views.push({ id, kind, rootDigest }); return this.reference(rootDigest);
   } finally { for (const charge of charges) charge.release(); }
  });
 }
 seal(): Promise<ReadyContextReceipt> {
  return this.enqueue(async () => {
   if (this.metadataWindows.size) throw new Error('Construction metadata windows remain borrowed');
   const ready = join(this.root, this.generation);
   try {
    if (!this.views.length || this.identity.key.family === 'code' && !this.session) throw new Error('Complete staged views/source session required');
    if (this.session) {
     const inventory = await this.session.evidence();
     try { for (const evidence of inventory) {
     const evidenceWindow = await this.session.borrowEvidence(evidence.queryDigest);
     try {
      const bytes = evidenceWindow.bytes;
      if (bytes.length !== evidence.bytes || sha(bytes) !== evidence.contentDigest) throw new Error('Source evidence changed');
      // Store source bytes through the same chunked codec; the query alias
      // resolves its byte descriptor rather than an oversized atomic JSON blob.
      const root = await this.value(bytes, new Set()), size = this.files.get(root)!;
      const nodeLease = this.memory.reserve(size + 1, 'source query descriptor');
      try { await this.put(await bytesAt(join(this.directory, `${root}.data`), size, { bytes: size, digest: root }), evidence.queryDigest); }
      finally { nodeLease.release(); }
     } finally { evidenceWindow.release(); }
    } } finally { this.session.releaseResult(inventory); }
    }
    const manifest: StagedContextManifest = { schemaVersion: 2, encoding: 'staged-values-v2', key: this.identity.key,
     attempt: this.identity.attempt, generationId: this.generation, identityDigest: sourceGeneration(this.identity), inputDigest: this.identity.inputDigest,
     validatorVersion: this.identity.validatorVersion, sourceIdentity: this.identity.sourceIdentity, manifestDigest: '0'.repeat(64),
     objects: [...this.objects.values()], views: this.views, byteTotals: { stored: this.stored, decoded: this.stored } };
    const scratch = this.memory.reserve(jsonBound(manifest) * 4 + 1024, 'staged manifest encoding');
    let manifestBytes = 0;
    try {
     manifest.manifestDigest = preparationDigest({ ...manifest, manifestDigest: '' });
     decodeStagedContextManifest(manifest, this.identity.key, reviewJsonLimit());
     const text = JSON.stringify(manifest), allocation = this.memory.allocate(Buffer.byteLength(text), 'staged encoded manifest'); manifestBytes = allocation.bytes.length;
     try {
     Buffer.from(allocation.bytes.buffer, allocation.bytes.byteOffset, allocation.bytes.byteLength).write(text, 'utf8');
     const token = await this.capacity.reserve(allocation.bytes.length * 2 + 512); this.tokens.push(token);
     await writeReviewBytes(join(this.directory, 'manifest.json'), allocation.bytes, reviewJsonLimit()); await this.capacity.commit(token, allocation.bytes.length);
     await this.checkDirectory(); await rename(this.directory, ready);
     const root = await open(this.root, 'r'); try { await root.sync(); } finally { await root.close(); }
     } finally { allocation.lease.release(); }
    } finally { scratch.release(); }
    const capacityToken = await this.capacity.combine(this.tokens);
    this.state = 'ready'; this.releaseMemory();
    return { key: { ...this.identity.key }, attempt: this.identity.attempt, generationId: this.generation, identityDigest: sourceGeneration(this.identity),
     inputDigest: this.identity.inputDigest, sourceIdentity: this.identity.sourceIdentity, validatorVersion: this.identity.validatorVersion,
     manifestDigest: manifest.manifestDigest, storedBytes: this.stored + manifestBytes, capacityToken };
   } catch (error) { throw new PreparedContextWriteError(error, this.directory, [...this.tokens], ready); }
  });
 }
 private releaseMemory(): void { for (const c of this.charges) c.release(); this.charges.length = 0; this.objects.clear(); this.files.clear(); this.views.length = 0; }
 /** Explicit disposal only. Failed removal retains reservations/evidence. A
  * published generation belongs to the host, not this construction owner. */
 async discard(): Promise<void> {
  if (this.state === 'ready') throw new Error('Ready staged context is host-owned');
  if (this.state === 'discarded') return;
  this.disposing = true; await this.tail;
  if (this.metadataWindows.size) { this.disposing = false; throw new Error('Construction metadata windows remain borrowed'); }
  if ((this.state as string) === 'ready') throw new Error('Ready staged context is host-owned');
  const st = await lstat(this.directory, { bigint: true });
  if (!st.isDirectory() || st.isSymbolicLink() || st.dev !== this.stamp.dev || st.ino !== this.stamp.ino) throw new Error('Staged directory replaced; retain reservations');
  await rm(this.directory, { recursive: true });
  for (const token of this.tokens) await this.capacity.release(token);
  this.releaseMemory(); this.state = 'discarded';
 }
}

/** Private-borrow reader for exact v2. References cannot be reconstructed from
 * JSON; every operation rechecks live authority and immutable manifest stamp. */
export class PreparedViewReader {
 private readonly issued = new WeakSet<object>();
 private readonly objects = new Map<string, number>();
 private readonly windows = new Set<() => void>();
 private fenced = false;
 private closed = false;
 private pending = 0;
 private readonly cancellation = new AbortController();
 get signal(): AbortSignal { return this.cancellation.signal; }
 private fence(): void { this.fenced = true; this.cancellation.abort(new Error('Staged reader fenced')); }
 private constructor(readonly receipt: ReadyContextReceipt, private readonly manifest: StagedContextManifest,
  readonly memory: ReviewMemoryBudget, private readonly root: string, private readonly stamp: string,
  private readonly manifestLease: MemoryLease, private readonly authorize: () => Promise<void>,
  private readonly invalidate: (error: unknown) => Promise<void>) {
  for (const object of manifest.objects) this.objects.set(object.contentDigest, object.bytes);
 }
 private static async stamp(path: string): Promise<string> { const s = await lstat(path, { bigint: true }); if (!s.isFile() || s.isSymbolicLink()) throw new Error('Unsafe staged manifest'); return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`; }
 static async open(receipt: ReadyContextReceipt, limits: ReviewPreparationLimits, memory: ReviewMemoryBudget,
  authorize: () => Promise<void>, invalidate: (error: unknown) => Promise<void>): Promise<PreparedViewReader> {
  await authorize(); let lease: MemoryLease | undefined;
  try {
   if (!digest(receipt.generationId) || memory.limit !== limits.memoryMaxBytes) throw new Error('Unbound staged reader');
   const root = join(await preparedContextParents(receipt.key, false), receipt.generationId);
   if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error('Unsafe staged generation');
   const path = join(root, 'manifest.json'), stamp = await this.stamp(path), size = (await lstat(path)).size;
   if (size > reviewJsonLimit()) throw new Error('Staged manifest exceeds record bound');
   lease = memory.reserve(size * 10 + 1024, 'staged manifest read/index');
   const manifest = decodeStagedContextManifest(JSON.parse((await bytesAt(path, reviewJsonLimit())).toString()), receipt.key, reviewJsonLimit());
   if (manifest.generationId !== receipt.generationId || manifest.identityDigest !== receipt.identityDigest || manifest.inputDigest !== receipt.inputDigest || manifest.attempt !== receipt.attempt || manifest.validatorVersion !== receipt.validatorVersion || manifest.sourceIdentity !== receipt.sourceIdentity
    || manifest.manifestDigest !== receipt.manifestDigest || preparationDigest({ ...manifest, manifestDigest: '' }) !== receipt.manifestDigest || stamp !== await this.stamp(path)) throw new Error('Unbound staged manifest');
   await authorize(); return new PreparedViewReader(structuredClone(receipt), manifest, memory, root, stamp, lease, authorize, invalidate);
  } catch (error) { lease?.release(); await invalidate(error); throw error; }
 }
 private async active(): Promise<void> {
  if (this.closed || this.fenced) throw new Error('Staged reader fenced');
  await this.authorize();
  if (await realpath(this.root) !== this.root || this.stamp !== await PreparedViewReader.stamp(join(this.root, 'manifest.json'))) throw new Error('Staged manifest replaced');
 }
 private ref(d: string): PreparedValueReference { if (!this.objects.has(d)) throw new Error('Foreign staged reference'); const r = Object.freeze({ digest: d }); this.issued.add(r); return r; }
 private require(ref: PreparedValueReference): void { if (!this.issued.has(ref)) throw new Error('Unissued staged reference'); }
 private async guarded<T>(work: () => Promise<T>): Promise<T> {
  this.pending++;
  try { await this.active(); return await work(); } catch (error) { this.fence(); await this.invalidate(error); throw error; }
  finally { this.pending--; }
 }
 private window<T>(value: T, leases: MemoryLease[]): PreparedWindow<T> {
  const owner = this;
  let held: T | undefined = value, released = false;
  const release = () => { if (!released) { released = true; held = undefined; for (const c of leases) c.release(); this.windows.delete(release); } };
  this.windows.add(release);
  return { get value() { if (released) throw new Error('Staged window released'); if (owner.fenced || owner.closed) throw new Error('Staged reader fenced'); return held as T; }, release };
 }
 /** Adopt charged derived output into this borrow's cancellation/lifetime.
  * Caller keeps ownership on refusal and must release its reservations. */
 retainWindow<T>(value: T, leases: MemoryLease[]): PreparedWindow<T> {
  if (this.closed || this.fenced) throw new Error('Staged reader fenced');
  return this.window(value, leases);
 }
 private async bytes(d: string): Promise<PreparedWindow<Buffer>> {
  const size = this.objects.get(d); if (size === undefined) throw new Error('Foreign staged object');
  const allocation = this.memory.allocate(size + 1, 'staged leaf read');
  try { const b = await bytesAt(join(this.root, `${d}.data`), size, { bytes: size, digest: d }, allocation.bytes); await this.active(); return this.window(b, [allocation.lease]); }
  catch (error) { allocation.lease.release(); throw error; }
 }
 private async node(d: string): Promise<PreparedWindow<Node>> {
  const size = this.objects.get(d); if (size === undefined) throw new Error('Foreign staged node');
  const charge = this.memory.reserve(size * 10 + 1024, 'staged node decode');
  try {
   const raw = await this.bytes(d);
   try {
    const n = decodeNode(JSON.parse(raw.value.toString('utf8')));
    return this.window(n as Node, [charge]);
   } finally { raw.release(); }
  } catch (error) { charge.release(); throw error; }
 }
 async descriptor(id: string, kind?: Kind): Promise<PreparedDescriptor> {
  return this.guarded(async () => { const v = this.manifest.views.find(v => v.id === id && (kind === undefined || v.kind === kind)); if (!v) throw new Error('Unknown staged descriptor'); const r = Object.freeze({ id: v.id, kind: v.kind, digest: v.rootDigest }); this.issued.add(r); return r; });
 }
 hasDescriptor(id: string, kind?: Kind): Promise<boolean> {
  return this.guarded(async () => this.manifest.views.some(v => v.id === id && (kind === undefined || v.kind === kind)));
 }
 async source(queryDigest: string): Promise<PreparedValueReference> {
  return this.guarded(async () => { const object = this.manifest.objects.find(o => o.queryDigest === queryDigest); if (!object) throw new Error('Unknown staged source query'); return this.ref(object.contentDigest); });
 }
 hasSource(queryDigest: string): Promise<boolean> {
  return this.guarded(async () => this.manifest.objects.some(object => object.queryDigest === queryDigest));
 }
 async describe(ref: PreparedValueReference): Promise<{ type: ViewNode[0]; size: number }> {
  return this.guarded(async () => {
   this.require(ref); const n = await this.node(ref.digest);
   try { const v = n.value; if (v[0] === 'items' || v[0] === 'branch') throw new Error('Index is not a staged value'); return { type: v[0], size: v[0] === 'array' || v[0] === 'object' || v[0] === 'bytes' || v[0] === 'text' ? v[1] : 1 }; }
   finally { n.release(); }
  });
 }
 private async *entries(d: string, ancestors = new Set<string>()): AsyncGenerator<Entry> {
  await this.active(); if (ancestors.size >= 128 || ancestors.has(d)) throw new Error('Cyclic/deep staged index');
  const n = await this.node(d); ancestors.add(d);
  try {
   if (n.value[0] === 'items') { for (const item of n.value[1]) { await this.active(); yield item; } }
   else if (n.value[0] === 'branch') { for (const child of n.value[1]) { let count = 0; for await (const entry of this.entries(child[0], ancestors)) { count++; yield entry; } if (count !== child[1]) throw new Error('Staged branch count mismatch'); } }
   else throw new Error('Expected staged index');
  } finally { ancestors.delete(d); n.release(); }
 }
 async *children(ref: PreparedValueReference): AsyncGenerator<{ key: string | number; reference: PreparedValueReference }> {
  this.pending++;
  try {
   await this.active(); this.require(ref); const n = await this.node(ref.digest);
   try {
    const value = n.value; if (value[0] !== 'array' && value[0] !== 'object') throw new Error('Staged leaf has no children');
    let count = 0;
    if (value[2]) for await (const [key, d] of this.entries(value[2])) {
     if (value[0] === 'array' ? key !== count : typeof key !== 'string') throw new Error('Unordered staged container');
     if (++count > value[1]) throw new Error('Staged child count mismatch');
     yield { key, reference: this.ref(d) };
    }
    if (count !== value[1]) throw new Error('Staged child count mismatch');
   } finally { n.release(); }
  } catch (error) { this.fence(); await this.invalidate(error); throw error; }
  finally { this.pending--; }
 }
 /** Each yielded leaf window remains charged until explicitly released. */
 async *chunks(ref: PreparedValueReference): AsyncGenerator<PreparedWindow<Uint8Array>> {
  this.pending++;
  try {
   await this.active(); this.require(ref); const n = await this.node(ref.digest);
   try {
    const value = n.value; if (value[0] !== 'bytes' && value[0] !== 'text') throw new Error('Expected staged byte/text leaf');
    let bytes = 0, count = 0;
    if (value[2]) for await (const [ordinal, d] of this.entries(value[2])) {
     if (ordinal !== count++) throw new Error('Unordered staged leaf chunks');
     const window = await this.bytes(d); bytes += window.value.length;
     if (bytes > value[1]) { window.release(); throw new Error('Staged leaf length mismatch'); }
     yield window;
    }
    if (bytes !== value[1]) throw new Error('Staged leaf length mismatch');
   } finally { n.release(); }
  } catch (error) { this.fence(); await this.invalidate(error); throw error; }
  finally { this.pending--; }
 }
 async scalar(ref: PreparedValueReference): Promise<PreparedWindow<Scalar>> {
  return this.guarded(async () => {
   this.require(ref); const n = await this.node(ref.digest), tag = n.value[0];
   if (tag !== 'scalar' && tag !== 'null' && tag !== 'undefined') { n.release(); throw new Error('Traverse staged containers/leaves through children/chunks'); }
   const value = n.value[0] === 'scalar' ? n.value[1] : n.value[0] === 'null' ? null : undefined;
   return this.window(value, [{ release: () => n.release() }]);
  });
 }
 /** Bounded metadata projection; source bodies remain opaque references. */
 async metadata(ref: PreparedValueReference): Promise<PreparedWindow<unknown>> {
  return this.guarded(async () => {
   this.require(ref); const leases: MemoryLease[] = [];
   try {
    const value = await metadataValue({ memory: this.memory, node: d => this.node(d), bytes: d => this.bytes(d), reference: d => this.ref(d) }, ref.digest, leases);
    return this.window(value, leases);
   } catch (error) { for (const lease of leases) lease.release(); throw error; }
  });
 }
 /** Cancellation revokes use, not ownership: retained windows remain charged
  * until their actual consumer disposes them. */
 verify(): Promise<void> { return this.guarded(async () => {}); }
 cancel(): void { this.fence(); }
 close(): void { if (this.windows.size || this.pending) throw new Error('Staged windows remain borrowed'); if (!this.closed) { this.closed = true; this.manifestLease.release(); this.objects.clear(); } }
}

/** Transitional adapter for consumers that still require an eager value.
 * Staged byte leaves are read through bounded windows and copied into their
 * semantic Uint8Array representation; all reader-owned windows are released
 * before the value is returned. */
export async function materializePreparedValue(reader: PreparedViewReader, value: unknown, ancestors = new Set<object>()): Promise<unknown> {
 if (!value || typeof value !== 'object') return value;
 if (Object.isFrozen(value) && Object.keys(value).length === 1 && typeof Reflect.get(value, 'digest') === 'string') {
  const reference = value as PreparedValueReference, description = await reader.describe(reference);
  if (description.type !== 'bytes') throw new Error('Unexpected staged value reference');
  const bytes = new Uint8Array(description.size); let offset = 0;
  for await (const chunk of reader.chunks(reference)) {
   try { bytes.set(chunk.value, offset); offset += chunk.value.length; }
   finally { chunk.release(); }
  }
  if (offset !== bytes.length) throw new Error('Staged value binary length mismatch');
  return bytes;
 }
 if (ancestors.has(value)) throw new Error('Cyclic staged value metadata');
 ancestors.add(value);
 try {
  if (Array.isArray(value)) for (let i = 0; i < value.length; i++) value[i] = await materializePreparedValue(reader, value[i], ancestors);
  else for (const key of Object.keys(value)) Reflect.set(value, key, await materializePreparedValue(reader, Reflect.get(value, key), ancestors));
  return value;
 } finally { ancestors.delete(value); }
}
