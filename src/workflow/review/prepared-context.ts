/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants } from 'node:fs';
import { mkdir, lstat, realpath, open, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import { ReviewKeySchema } from '../../shared/review-resources.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { decodePreparedContextManifest } from '../../shared/review-preparation.js';
import type { PreparedContextManifest } from '../../shared/review-preparation.js';
import type { ReviewPreparationLimits } from '../../config/review.js';
import { reviewJsonLimit } from '../../config/review.js';
import { writeReviewBytes } from '../code-review/task-review/checkpoint.js';
import type { ReviewSourceSession, SourceCapacity } from './source-session.js';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export function preparationDigest(value: unknown): string {
 return hash(JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
}
export interface PreparedSourceIdentity {
 readonly key: ReviewKey; readonly attempt: number; readonly inputDigest: string;
 readonly validatorVersion: number; readonly routeDigest: string; readonly sourceIdentity: string;
 readonly scopeDigest: string; readonly testDocumentDigest: string;
}
export interface ReadyContextReceipt {
 readonly key: ReviewKey; readonly attempt: number; readonly generationId: string;
 readonly identityDigest: string;
 readonly inputDigest: string; readonly sourceIdentity: string; readonly validatorVersion: number;
 readonly manifestDigest: string; readonly storedBytes: number; readonly capacityToken: string;
}
export function contextRoot(key: ReviewKey): string {
 if (!Value.Check(ReviewKeySchema, key)) throw new Error('Invalid prepared context identity');
 return join(key.project, '.insrc/tmp/review-context', key.family, key.reviewId);
}
export function sourceGeneration(identity: PreparedSourceIdentity): string {
 if (Object.keys(identity).length !== 8 || !Value.Check(ReviewKeySchema, identity.key) || !Number.isSafeInteger(identity.attempt) || identity.attempt < 1 || !Number.isSafeInteger(identity.validatorVersion) || identity.validatorVersion < 1
  || [identity.inputDigest, identity.routeDigest, identity.sourceIdentity, identity.scopeDigest, identity.testDocumentDigest].some(d => !/^[a-f0-9]{64}$/.test(d))) throw new Error('Invalid qualified source identity');
 return preparationDigest(identity);
}
export async function bytesAt(path: string, limit: number, expected?: { bytes: number; digest: string }, allocation?: Uint8Array): Promise<Buffer> {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const st = await file.stat(); if (!st.isFile() || st.size > limit || expected && st.size !== expected.bytes) throw new Error('Invalid prepared object size');
  if (allocation && allocation.byteLength !== st.size + 1) throw new Error('Unbound prepared read allocation');
  const bytes = allocation ? Buffer.from(allocation.buffer, allocation.byteOffset, allocation.byteLength) : Buffer.alloc(st.size + 1); let offset = 0;
  while (offset < bytes.length) { const n = await file.read(bytes, offset, bytes.length - offset, null); if (!n.bytesRead) break; offset += n.bytesRead; }
  if (offset !== st.size) throw new Error('Prepared object changed during read');
  const result = bytes.subarray(0, offset); if (expected && hash(result) !== expected.digest) throw new Error('Prepared object digest mismatch'); return result;
 } finally { await file.close(); }
}
export async function preparedContextParents(key: ReviewKey, create = true): Promise<string> {
 if (await realpath(key.project) !== key.project) throw new Error('Noncanonical context project');
 let path = key.project;
 for (const part of ['.insrc', 'tmp', 'review-context', key.family, key.reviewId]) {
  path = join(path, part); if (create) await mkdir(path, { mode: 0o700 }).catch(e => { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; });
  const st = await lstat(path); if (!st.isDirectory() || st.isSymbolicLink() || await realpath(path) !== path) throw new Error('Unsafe prepared context directory');
 }
 return path;
}
type Node = ['null'] | ['undefined'] | ['scalar', string | number | boolean] | ['bytes' | 'text', string] | ['array', Node[]] | ['object', [string, Node][]];
export class PreparedContextWriteError extends Error {
 constructor(cause: unknown, readonly retainedDirectory: string, readonly capacityTokens: readonly string[], readonly readyDirectory: string) {
  super('Prepared context write failed; retain staged files and capacity for explicit recovery', { cause });
 }
}
/** Called in a qualified phase worker. Complete existing validator outputs are
 * accepted as objects here; serialization and binary separation are central. */
export async function writePreparedContext(identity: PreparedSourceIdentity, views: Readonly<Record<string, unknown>>, session: ReviewSourceSession | undefined,
 limits: ReviewPreparationLimits, capacity: SourceCapacity, io: { write: typeof writeReviewBytes; rename: typeof rename } = { write: writeReviewBytes, rename }): Promise<ReadyContextReceipt> {
 identity = structuredClone(identity);
 if (identity.key.family === 'code' && !session) throw new Error('Qualified code context requires complete source-session evidence');
 const identityDigest = sourceGeneration(identity), generationId = hash(`${identityDigest}:${randomUUID()}`), root = await preparedContextParents(identity.key), stage = join(root, `prepare-${randomUUID()}`), ready = join(root, generationId);
 if (session && preparationDigest(session.key) !== preparationDigest(identity.key)) throw new Error('Foreign source session');
 await mkdir(stage, { mode: 0o700 });
 const tokens: string[] = [], files = new Map<string, number>(), objects = new Map<string, PreparedContextManifest['objects'][number]>();
 let stored = 0, nodes = 0;
 async function put(queryDigest: string, bytes: Buffer): Promise<string> {
  if (bytes.length > limits.memoryMaxBytes) throw new Error('Prepared object exceeds memory bound');
  const contentDigest = hash(bytes);
  if (!files.has(contentDigest)) {
   const token = await capacity.reserve(bytes.length * 2 + 512); tokens.push(token);
   await io.write(join(stage, `${contentDigest}.data`), bytes, limits.memoryMaxBytes);
   await capacity.commit(token, bytes.length); files.set(contentDigest, bytes.length); stored += bytes.length;
  }
  if (objects.size >= 100000 && !objects.has(queryDigest)) throw new Error('Prepared object inventory exceeds bound');
  const previous = objects.get(queryDigest);
  if (previous && (previous.contentDigest !== contentDigest || previous.bytes !== bytes.length)) throw new Error('Conflicting prepared query identity');
  objects.set(queryDigest, { queryDigest, contentDigest, bytes: bytes.length }); return contentDigest;
 }
 async function node(value: unknown, refs: Set<string>, ancestors: Set<object>, depth = 0): Promise<Node> {
  if (++nodes > 1000000 || depth > 128) throw new Error('Prepared value structure exceeds bound');
  if (value === null) return ['null']; if (value === undefined) return ['undefined'];
  if (typeof value === 'string' && Buffer.byteLength(value) > 4096 || value instanceof Uint8Array) {
   const bytes = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value as Uint8Array);
   const digest = await put(preparationDigest(['value', hash(bytes)]), bytes); refs.add(digest); return [typeof value === 'string' ? 'text' : 'bytes', digest];
  }
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return ['scalar', value];
  if (!value || typeof value !== 'object' || ancestors.has(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Unsupported/cyclic prepared value');
  ancestors.add(value);
  try {
   if (Array.isArray(value)) { const result: Node[] = []; for (const item of value) result.push(await node(item, refs, ancestors, depth + 1)); return ['array', result]; }
   const result: [string, Node][] = []; for (const [key, item] of Object.entries(value)) result.push([key, await node(item, refs, ancestors, depth + 1)]);
   return ['object', result];
  } finally { ancestors.delete(value); }
 }
 try {
  if (session) {
   const inventory = await session.evidence();
   try { for (const evidence of inventory) {
    const bytes = await session.readEvidence(evidence.queryDigest);
    try {
     if (bytes.length !== evidence.bytes || hash(bytes) !== evidence.contentDigest) throw new Error('Source evidence changed during context commit');
     await put(evidence.queryDigest, bytes);
    } finally { session.releaseResult(bytes); }
   } } finally { session.releaseResult(inventory); }
  }
  const readyViews: PreparedContextManifest['views'] = [];
  for (const [id, value] of Object.entries(views).sort(([a], [b]) => a.localeCompare(b))) {
   if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) throw new Error('Invalid prepared view id');
   const refs = new Set<string>(), root = Buffer.from(JSON.stringify(await node(value, refs, new Set())));
   const digest = await put(preparationDigest(['view', id]), root);
   readyViews.push({ id, objectDigests: [digest, ...[...refs].filter(d => d !== digest).sort()] });
  }
  if (!readyViews.length) throw new Error('Prepared context needs a complete view');
  const manifest: PreparedContextManifest = { schemaVersion: 1, key: identity.key, attempt: identity.attempt, generationId, identityDigest, inputDigest: identity.inputDigest,
   validatorVersion: identity.validatorVersion, sourceIdentity: identity.sourceIdentity, manifestDigest: '0'.repeat(64), objects: [...objects.values()].sort((a, b) => a.queryDigest.localeCompare(b.queryDigest)), views: readyViews,
   byteTotals: { stored, decoded: stored } };
  manifest.manifestDigest = preparationDigest({ ...manifest, manifestDigest: '' });
  decodePreparedContextManifest(manifest, identity.key, reviewJsonLimit());
  const bytes = Buffer.from(JSON.stringify(manifest)), token = await capacity.reserve(bytes.length * 2 + 512); tokens.push(token);
  await io.write(join(stage, 'manifest.json'), bytes, reviewJsonLimit()); await capacity.commit(token, bytes.length);
  // Only a fully written/synchronized manifest can become ready.
  await io.rename(stage, ready);
  const directory = await open(root, 'r'); try { await directory.sync(); } finally { await directory.close(); }
  const capacityToken = await capacity.combine(tokens);
  return { key: { ...identity.key }, attempt: identity.attempt, generationId, identityDigest, inputDigest: identity.inputDigest, sourceIdentity: identity.sourceIdentity,
   validatorVersion: identity.validatorVersion, manifestDigest: manifest.manifestDigest, storedBytes: stored + bytes.length, capacityToken };
 } catch (error) { throw new PreparedContextWriteError(error, stage, tokens, ready); }
}

/** Worker-side reader: every use is tied to a live private borrow. A disk
 * manifest is only data and cannot create that borrow after daemon restart. */
export class PreparedContextReader {
 private readonly byContent = new Map<string, PreparedContextManifest['objects'][number]>();
 private readonly byQuery = new Map<string, PreparedContextManifest['objects'][number]>();
 private constructor(readonly receipt: ReadyContextReceipt, private readonly manifest: PreparedContextManifest, private readonly limits: ReviewPreparationLimits,
  private readonly authorize: () => Promise<void>, private readonly invalidate: (error: unknown) => Promise<void>, private readonly manifestStamp: string) {
  for (const object of manifest.objects) { this.byContent.set(object.contentDigest, object); this.byQuery.set(object.queryDigest, object); }
 }
 private static async stamp(path: string): Promise<string> {
  const st = await lstat(path, { bigint: true }); if (!st.isFile() || st.isSymbolicLink()) throw new Error('Unsafe context manifest');
  return `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
 }
 static async open(receipt: ReadyContextReceipt, limits: ReviewPreparationLimits, authorize: () => Promise<void>, invalidate: (error: unknown) => Promise<void>): Promise<PreparedContextReader> {
  await authorize();
  try {
   if (!/^[a-f0-9]{64}$/.test(receipt.generationId)) throw new Error('Invalid context generation');
   receipt = structuredClone(receipt);
   const path = join(await preparedContextParents(receipt.key, false), receipt.generationId), st = await lstat(path);
   if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('Unsafe ready context');
   const before = await this.stamp(join(path, 'manifest.json'));
   const manifest = decodePreparedContextManifest(JSON.parse((await bytesAt(join(path, 'manifest.json'), reviewJsonLimit())).toString()), receipt.key, reviewJsonLimit());
   if (manifest.generationId !== receipt.generationId || manifest.identityDigest !== receipt.identityDigest || manifest.attempt !== receipt.attempt || manifest.inputDigest !== receipt.inputDigest || manifest.validatorVersion !== receipt.validatorVersion || manifest.sourceIdentity !== receipt.sourceIdentity
    || manifest.manifestDigest !== receipt.manifestDigest || preparationDigest({ ...manifest, manifestDigest: '' }) !== receipt.manifestDigest) throw new Error('Unbound prepared manifest');
   if (before !== await this.stamp(join(path, 'manifest.json'))) throw new Error('Context manifest changed during acquisition');
   return new PreparedContextReader(Object.freeze({ ...receipt, key: Object.freeze({ ...receipt.key }) }), manifest, { ...limits }, authorize, invalidate, before);
  } catch (error) { await invalidate(error); throw error; }
 }
 private async payload(digest: string): Promise<Buffer> {
  const object = this.byContent.get(digest); if (!object) throw new Error('Unknown prepared object');
  return bytesAt(join(contextRoot(this.receipt.key), this.receipt.generationId, `${digest}.data`), this.limits.memoryMaxBytes, { bytes: object.bytes, digest });
 }
 private async checkFiles(): Promise<void> {
  const path = join(contextRoot(this.receipt.key), this.receipt.generationId);
  if (await realpath(path) !== path || await PreparedContextReader.stamp(join(path, 'manifest.json')) !== this.manifestStamp) throw new Error('Prepared context manifest replaced during borrow');
 }
 async verify(): Promise<void> {
  await this.authorize();
  try { await this.checkFiles(); } catch (error) { await this.invalidate(error); throw error; }
 }
 async view(id: string): Promise<unknown> {
  await this.authorize();
  try {
   await this.checkFiles();
   const view = this.manifest.views.find(v => v.id === id); if (!view?.objectDigests[0]) throw new Error('Unknown prepared view');
   let count = 0, loadedBytes = 0; const loaded = new Map<string, Buffer>(), allowed = new Set(view.objectDigests);
   const payload = async (digest: string): Promise<Buffer> => {
    const old = loaded.get(digest); if (old) return old;
    const size = this.byContent.get(digest)?.bytes;
    if (size === undefined || loadedBytes + size > this.limits.memoryMaxBytes) throw new Error('Prepared view exceeds memory bound');
    const bytes = await this.payload(digest); loaded.set(digest, bytes); loadedBytes += bytes.length; return bytes;
   };
   const decode = async (node: Node, depth = 0): Promise<unknown> => {
    if (++count > 1000000 || depth > 128 || !Array.isArray(node)) throw new Error('Invalid prepared value');
    switch (node[0]) {
     case 'null': return null; case 'undefined': return undefined; case 'scalar': return node[1];
     case 'bytes': case 'text': { if (!allowed.has(node[1])) throw new Error('Foreign view object'); const bytes = await payload(node[1]); return node[0] === 'text' ? new TextDecoder('utf8', { fatal: true }).decode(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
     case 'array': { const result = []; for (const item of node[1]) result.push(await decode(item, depth + 1)); return result; }
     case 'object': { const entries: [string, unknown][] = []; for (const [key, item] of node[1]) entries.push([key, await decode(item, depth + 1)]); if (new Set(entries.map(e => e[0])).size !== entries.length) throw new Error('Duplicate prepared property'); return Object.fromEntries(entries); }
     default: throw new Error('Invalid prepared value tag');
    }
   };
   return await decode(JSON.parse((await payload(view.objectDigests[0])).toString()));
  } catch (error) { await this.invalidate(error); throw error; }
 }
 async query(method: string, args: readonly unknown[]): Promise<unknown> {
  await this.authorize();
  try {
   await this.checkFiles();
   const digest = hash(JSON.stringify([method, ...args])), object = this.byQuery.get(digest);
   if (!object) throw new Error('Source evidence not in qualified context');
   const value = JSON.parse((await this.payload(object.contentDigest)).toString()) as unknown;
   if (method === 'file' && value !== null) { const blob = value as { oid: string; base64: string }; return { oid: blob.oid, bytes: Buffer.from(blob.base64, 'base64') }; }
   return value;
  } catch (error) { await this.invalidate(error); throw error; }
 }
 async evidenceInventory(): Promise<readonly PreparedContextManifest['objects'][number][]> {
  await this.authorize();
  try { await this.checkFiles(); return this.manifest.objects.map(o => ({ ...o })); }
  catch (error) { await this.invalidate(error); throw error; }
 }
 async evidenceObject(contentDigest: string): Promise<Buffer> {
  await this.authorize();
  try { await this.checkFiles(); return this.payload(contentDigest); }
  catch (error) { await this.invalidate(error); throw error; }
 }
}
