/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants } from 'node:fs';
import { open, mkdir, lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { isDeepStrictEqual as same } from 'node:util';
import { ReviewKeySchema } from '../../shared/review-resources.js';
import { reviewJsonLimit } from '../../config/review.js';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { PreparedContextReader, preparationDigest, contextRoot } from './prepared-context.js';
import type { ReadyContextReceipt } from './prepared-context.js';
import { PreparedViewReader } from './prepared-views.js';
import { ReviewMemoryBudget } from './preparation-memory.js';
import { reviewSourceQueryDigest, decodeReviewSourceResult } from './source-session.js';
import type { SourceCapacity } from './source-session.js';
import type { ReviewSources } from '../code-review/task-review/sources.js';
import { writeReviewBytes } from '../code-review/task-review/checkpoint.js';

export interface CapturedHistoryEvidence { readonly queryDigest: string; readonly bytes: Uint8Array; }
const digest = Type.String({ pattern: '^[a-f0-9]{64}$' });
const objectSchema = Type.Object({ queryDigest: digest, contentDigest: digest, bytes: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }) }, { additionalProperties: false });
const schema = Type.Object({ schemaVersion: Type.Literal(1), key: ReviewKeySchema, attempt: Type.Integer({ minimum: 1 }), generationId: digest, sourceManifestDigest: digest, previousDigest: digest,
 objects: Type.Array(objectSchema, { minItems: 1, maxItems: 10000 }) }, { additionalProperties: false });
interface Entry { queryDigest: string; contentDigest: string; bytes: number; }
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function read(path: string, limit: number): Promise<Buffer> {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const st = await file.stat(); if (!st.isFile() || st.size > limit) throw new Error('Invalid history evidence file');
  const bytes = Buffer.alloc(st.size + 1); let offset = 0;
  while (offset < bytes.length) { const n = await file.read(bytes, offset, bytes.length - offset, null); if (!n.bytesRead) break; offset += n.bytesRead; }
  if (offset !== st.size) throw new Error('History evidence changed'); return bytes.subarray(0, offset);
 } finally { await file.close(); }
}
type EvidenceSource = Pick<ReadyContextReceipt, 'key' | 'attempt' | 'generationId' | 'manifestDigest'>;
async function directory(source: EvidenceSource, create = true): Promise<string> {
 const root = contextRoot(source.key); if (await realpath(root) !== root) throw new Error('Unsafe history evidence root');
 const path = join(root, 'history-evidence'); if (create) await mkdir(path, { mode: 0o700 }).catch(e => { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; });
 const st = await lstat(path); if (!st.isDirectory() || st.isSymbolicLink() || await realpath(path) !== path) throw new Error('Unsafe history evidence directory'); return path;
}
/** One immutable metadata node, authenticated by its caller's expected head.
 * Reading it grants neither a context borrow nor execution authority. */
export async function readHistoryEvidenceManifest(source: EvidenceSource, id: string) {
 if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid history evidence identity');
 const raw = await read(join(await directory(source, false), `${id}.json`), reviewJsonLimit()), value: unknown = JSON.parse(raw.toString());
 if (!Value.Check(schema, value) || preparationDigest(value) !== id || !same(value.key, source.key) || value.attempt !== source.attempt || value.generationId !== source.generationId || value.sourceManifestDigest !== source.manifestDigest) throw new Error('Unbound history evidence manifest');
 return { manifest: value, rawDigest: hash(raw) };
}
/** Validates only bounded evidence metadata; no source/model calls. The caller
 * must supply a source receipt obtained from the current private registry. */
export async function verifyHistoryEvidenceChain(source: ReadyContextReceipt, head: string): Promise<readonly Entry[]> {
 const seen = new Set<string>(), chain: Entry[][] = []; let count = 0;
 while (head !== source.manifestDigest) {
  if (!/^[a-f0-9]{64}$/.test(head) || seen.has(head) || seen.size >= 10000) throw new Error('Invalid history evidence lineage'); seen.add(head);
  const { manifest: value } = await readHistoryEvidenceManifest(source, head);
  count += value.objects.length; if (count > 100000) throw new Error('History evidence lineage exceeds inventory bound');
  chain.push(value.objects); head = value.previousDigest;
 }
 return chain.reverse().flat();
}

export class HistoryEvidenceStore {
 private readonly entries = new Map<string, Entry>();
 private readonly baseContents = new Set<string>();
 private readonly storedContents = new Set<string>();
 private head: string;
 private failed = false;
 private constructor(private readonly source: ReadyContextReceipt, private readonly reader: PreparedContextReader | PreparedViewReader, private readonly capacity: SourceCapacity, private readonly limits: ReviewPreparationLimits,
  private readonly authorize: () => Promise<ReadyContextReceipt>) { this.head = source.manifestDigest; }
 static async open(source: ReadyContextReceipt, capacity: SourceCapacity, limits: ReviewPreparationLimits, authorize: () => Promise<ReadyContextReceipt>, invalidate: (error: unknown) => Promise<void>, head = source.manifestDigest, memory = new ReviewMemoryBudget(limits.memoryMaxBytes)): Promise<HistoryEvidenceStore> {
  const check = async () => { if (!same(await authorize(), source)) throw new Error('History evidence borrow changed'); };
  await check();
  const manifest = JSON.parse((await read(join(contextRoot(source.key), source.generationId, 'manifest.json'), reviewJsonLimit())).toString()) as { schemaVersion?: unknown; encoding?: unknown };
  const reader = manifest.schemaVersion === 2 && manifest.encoding === 'staged-values-v2'
   ? await PreparedViewReader.open(source, limits, memory, check, invalidate)
   : await PreparedContextReader.open(source, limits, check, invalidate);
  const store = new HistoryEvidenceStore(source, reader, capacity, limits, authorize);
  if (reader instanceof PreparedContextReader) for (const entry of await reader.evidenceInventory()) { store.entries.set(entry.queryDigest, entry); store.baseContents.add(entry.contentDigest); }
  await store.restore(head); return store;
 }
 private async active(): Promise<void> { if (this.failed || !same(await this.authorize(), this.source)) throw new Error('History evidence owner unavailable/fenced'); }
 private add(entry: Entry): void {
  const previous = this.entries.get(entry.queryDigest);
  if (previous) { if (!same(previous, entry)) throw new Error('Immutable history evidence changed'); return; }
  if (this.entries.size >= 100000 || (this.entries.size + 1) * 256 > this.limits.memoryMaxBytes) throw new Error('History evidence inventory capacity exceeded');
  this.entries.set(entry.queryDigest, entry); this.storedContents.add(entry.contentDigest);
 }
 async restore(head: string): Promise<void> {
  await this.active(); const entries = await verifyHistoryEvidenceChain(this.source, head);
  for (const entry of entries) this.add(entry); this.head = head;
 }
 async append(captured: readonly CapturedHistoryEvidence[] = []): Promise<string> {
  await this.active(); if (captured.length > 10000) throw new Error('History evidence batch exceeds bound');
  let capturedBytes = 0;
  const novel = new Map<string, { entry: Entry; bytes: Buffer }>();
  for (const item of captured) {
   if (!/^[a-f0-9]{64}$/.test(item.queryDigest) || !(item.bytes instanceof Uint8Array) || item.bytes.byteLength > this.limits.memoryMaxBytes) throw new Error('Invalid captured history evidence');
   capturedBytes += item.bytes.byteLength; if (capturedBytes > this.limits.memoryMaxBytes) throw new Error('History evidence batch exceeds memory bound');
   const bytes = Buffer.from(item.bytes), entry = { queryDigest: item.queryDigest, contentDigest: hash(bytes), bytes: bytes.length }, previous = this.entries.get(item.queryDigest) ?? novel.get(item.queryDigest)?.entry;
   if (previous) { if (!same(previous, entry)) throw new Error('Captured evidence contradicts qualified source'); continue; }
   novel.set(item.queryDigest, { entry, bytes });
  }
  if (!novel.size) return this.head;
  const root = await directory(this.source);
  try {
   for (const { entry, bytes } of novel.values()) if (!this.baseContents.has(entry.contentDigest) && !this.storedContents.has(entry.contentDigest)) {
    const token = await this.capacity.reserve(bytes.length * 2 + 512);
    await writeReviewBytes(join(root, `${entry.contentDigest}.data`), bytes, this.limits.memoryMaxBytes); await this.capacity.commit(token, bytes.length);
    this.storedContents.add(entry.contentDigest);
   }
   const manifest = { schemaVersion: 1, key: this.source.key, attempt: this.source.attempt, generationId: this.source.generationId, sourceManifestDigest: this.source.manifestDigest,
    previousDigest: this.head, objects: [...novel.values()].map(o => o.entry).sort((a, b) => a.queryDigest.localeCompare(b.queryDigest)) };
   const bytes = JSON.stringify(manifest) + '\n', id = preparationDigest(manifest), token = await this.capacity.reserve(Buffer.byteLength(bytes) * 2 + 512);
   await writeReviewBytes(join(root, `${id}.json`), bytes, reviewJsonLimit()); await this.capacity.commit(token, Buffer.byteLength(bytes));
   for (const { entry } of novel.values()) this.add(entry); this.head = id; return id;
  } catch (error) { this.failed = true; throw error; }
 }
 async contains(method: keyof ReviewSources, args: readonly unknown[]): Promise<boolean> {
  if (this.failed) return false;
  const query = reviewSourceQueryDigest(method, args);
  return this.entries.has(query) || this.reader instanceof PreparedViewReader && this.reader.hasSource(query);
 }
 has(method: keyof ReviewSources, args: readonly unknown[]): boolean { return !this.failed && this.entries.has(reviewSourceQueryDigest(method, args)); }
 private async stagedBytes(queryDigest: string): Promise<{ bytes: Buffer; release(): void }> {
  if (!(this.reader instanceof PreparedViewReader)) throw new Error('Staged source reader required');
  const reference = await this.reader.source(queryDigest), description = await this.reader.describe(reference);
  if (description.type !== 'bytes' || description.size > this.limits.memoryMaxBytes) throw new Error('Invalid staged history evidence payload');
  const allocation = this.reader.memory.allocate(description.size + 1, 'history evidence source decode');
  let offset = 0;
  try {
   for await (const chunk of this.reader.chunks(reference)) {
    try { allocation.bytes.set(chunk.value, offset); offset += chunk.value.length; }
    finally { chunk.release(); }
   }
   if (offset !== description.size) throw new Error('Staged history evidence length mismatch');
   return { bytes: Buffer.from(allocation.bytes.buffer, allocation.bytes.byteOffset, description.size), release: allocation.lease.release };
  } catch (error) { allocation.lease.release(); throw error; }
 }
 async query(method: keyof ReviewSources, args: readonly unknown[]): Promise<unknown> {
  await this.active();
  try {
   const queryDigest = reviewSourceQueryDigest(method, args);
   let entry = this.entries.get(queryDigest);
   let bytes: Buffer;
   if (this.reader instanceof PreparedViewReader && await this.reader.hasSource(queryDigest)) {
    const staged = await this.stagedBytes(queryDigest);
    try {
     bytes = staged.bytes;
     const observed = { queryDigest, contentDigest: hash(bytes), bytes: bytes.length };
     if (entry && !same(entry, observed)) throw new Error('Immutable staged history evidence changed');
     if (!entry) { this.add(observed); entry = observed; }
     this.baseContents.add(entry.contentDigest);
     if (bytes.length !== entry.bytes || hash(bytes) !== entry.contentDigest) throw new Error('History evidence payload digest mismatch');
     return decodeReviewSourceResult(method, bytes);
    } finally { staged.release(); }
   } else {
    if (!entry) throw new Error('Evidence not present in qualified history');
    bytes = this.baseContents.has(entry.contentDigest) && this.reader instanceof PreparedContextReader
     ? await this.reader.evidenceObject(entry.contentDigest)
     : await read(join(await directory(this.source), `${entry.contentDigest}.data`), this.limits.memoryMaxBytes);
   }
   if (bytes.length !== entry.bytes || hash(bytes) !== entry.contentDigest) throw new Error('History evidence payload digest mismatch'); return decodeReviewSourceResult(method, bytes);
  } catch (error) { this.failed = true; throw error; }
 }
 sources(): ReviewSources {
  return { commit: (oid) => this.query('commit', [oid]) as ReturnType<ReviewSources['commit']>, file: (commit, path) => this.query('file', [commit, path]) as ReturnType<ReviewSources['file']>,
   isAncestor: (a, b) => this.query('isAncestor', [a, b]) as ReturnType<ReviewSources['isAncestor']>, changedRanges: (commit, parent, paths) => this.query('changedRanges', [commit, parent, paths]) as ReturnType<ReviewSources['changedRanges']>, pathChanges: (from, to, path) => this.query('pathChanges', [from, to, path]) as ReturnType<ReviewSources['pathChanges']> };
 }
}
