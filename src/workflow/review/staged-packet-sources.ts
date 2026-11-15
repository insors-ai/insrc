/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { TextDecoder } from 'node:util';
import type { ReviewSources, PinnedBlob } from '../code-review/task-review/sources.js';
import type { ReviewPacketAccess } from '../code-review/task-review/packet.js';
import type { ProjectionBudget, ProjectionUsage } from '../code-review/task-review/projection.js';
import type { ProjectionLines } from '../code-review/task-review/projection-intervals.js';
import { PreparedViewWriter } from './prepared-views.js';
import type { PreparedValueReference } from './prepared-views.js';
import { preparationDigest } from './prepared-context.js';
import { ReviewSourceSession } from './source-session.js';
import { ProjectionLineWindow } from './projection-lines.js';
import type { MemoryLease } from './preparation-memory.js';

export interface StagedPacketBlob {
 readonly oid: string;
 readonly byteLength: number;
 readonly commit: string;
 readonly path: string;
 readonly content: PreparedValueReference;
}

/** Construction-only storage adapter. It deliberately has no admission or
 * qualification authority. Packet validators still decide scope and lineage;
 * this owner limits how long their decoded inputs remain resident. */
export class StagedPacketSources implements ReviewSources<StagedPacketBlob>, ReviewPacketAccess<StagedPacketBlob> {
 readonly memory;
 private readonly blobs = new Map<string, StagedPacketBlob | null>();
 private readonly issued = new WeakSet<object>();
 private readonly retained: MemoryLease[] = [];
 private scope: { leases: MemoryLease[]; results: object[]; budgets: ProjectionBudget[] } | undefined;
 private closed = false;
 constructor(private readonly session: ReviewSourceSession, private readonly writer: PreparedViewWriter) {
  this.memory = session.workingMemory;
  if (writer.memory !== this.memory) throw new Error('Staged packet sources require one memory owner');
 }
 beginPacket(): void {
  if (this.closed || this.scope) throw new Error('Staged packet scope unavailable');
  const lease = this.memory.reserve(512, 'packet scope');
  this.scope = { leases: [lease], results: [], budgets: [] };
 }
 private current() {
  if (this.closed || !this.scope) throw new Error('No active staged packet scope');
  return this.scope;
 }
 private retain<T>(value: T): T {
  if (value && typeof value === 'object') {
   try { this.current().leases.push(this.memory.reserve(32, 'packet source ownership')); this.current().results.push(value); }
   catch (error) { this.session.releaseResult(value); throw error; }
  }
  return value;
 }
 async commit(oid: string, field?: string): Promise<readonly string[]> { this.current(); return this.retain(await this.session.commit(oid, field)); }
 isAncestor(origin: string, revision: string): Promise<boolean> { this.current(); return this.session.isAncestor(origin, revision); }
 async changedRanges(...args: Parameters<ReviewSourceSession['changedRanges']>) { this.current(); return this.retain(await this.session.changedRanges(...args)); }
 async pathChanges(...args: Parameters<ReviewSourceSession['pathChanges']>) { this.current(); return this.retain(await this.session.pathChanges(...args)); }
 async file(commit: string, path: string): Promise<StagedPacketBlob | null> {
  this.current();
  const scratch = this.memory.reserve((commit.length + path.length) * 8 + 512, 'staged blob key');
  try {
   const key = preparationDigest(['staged-packet-blob-v2', commit, path]);
   if (this.blobs.has(key)) return this.blobs.get(key)!;
   const metadata = this.memory.reserve((commit.length + path.length) * 2 + 1024, 'staged blob index');
   try {
    const raw = await this.session.file(commit, path);
    try {
     const blob = raw === null ? null : Object.freeze({ oid: raw.oid, byteLength: raw.bytes.byteLength, commit, path, content: await this.writer.add(`blob-${key}`, 'file', raw.bytes) });
     if (blob) this.issued.add(blob);
     this.blobs.set(key, blob); this.retained.push(metadata); return blob;
    } finally { this.session.releaseResult(raw); }
   } catch (error) { metadata.release(); throw error; }
  } finally { scratch.release(); }
 }
 private async raw(blob: StagedPacketBlob): Promise<PinnedBlob> {
  this.current();
  if (!this.issued.has(blob)) throw new Error('Foreign staged packet blob');
  const raw = await this.session.file(blob.commit, blob.path);
  if (!raw || raw.oid !== blob.oid || raw.bytes.byteLength !== blob.byteLength) {
   this.session.releaseResult(raw); throw new Error('Staged packet source identity changed');
  }
  return raw;
 }
 size(blob: StagedPacketBlob): number {
  this.current(); if (!this.issued.has(blob)) throw new Error('Foreign staged packet blob'); return blob.byteLength;
 }
 async withLines<T>(before: StagedPacketBlob | null, after: StagedPacketBlob | null, charge: ((bytes: number) => void) | undefined,
  work: (before: ProjectionLines, after: ProjectionLines) => T | Promise<T>): Promise<T> {
  this.current();
  if (before) charge?.(this.size(before)); if (after) charge?.(this.size(after));
  let a: PinnedBlob | null = null, b: PinnedBlob | null = null;
  let x: ProjectionLineWindow | undefined, y: ProjectionLineWindow | undefined;
  try {
   a = before && await this.raw(before); x = ProjectionLineWindow.open(a, this.memory);
   b = after === before ? a : after && await this.raw(after);
   y = after === before ? x : ProjectionLineWindow.open(b, this.memory);
   return await work(x.lines, y.lines);
  } finally { y?.release(); x?.release(); if (b !== a) this.session.releaseResult(b); this.session.releaseResult(a); }
 }
 async lineCount(blob: StagedPacketBlob): Promise<number> {
  return this.withLines(blob, null, undefined, lines => lines.length);
 }
 async text(blob: StagedPacketBlob): Promise<string> {
  const scope = this.current(), raw = await this.raw(blob);
  let lease: MemoryLease | undefined;
  try {
   lease = this.memory.reserve(raw.bytes.byteLength * 2 + 128, 'packet document text');
   const text = new TextDecoder('utf8', { fatal: true }).decode(raw.bytes);
   scope.leases.push(lease); lease = undefined; return text;
  } finally { lease?.release(); this.session.releaseResult(raw); }
 }
 parseJson(text: string): unknown {
  const scope = this.current(), lease = this.memory.reserve(text.length * 32 + 1024, 'packet document JSON');
  try { const value: unknown = JSON.parse(text); scope.leases.push(lease); return value; }
  catch (error) { lease.release(); throw error; }
 }
 trackBudget(budget: ProjectionBudget): void { this.current().budgets.push(budget); }
 logicalUsage(): readonly ProjectionUsage[] { return this.current().budgets.map(budget => budget.usage()); }
 /** Resolve only metadata from our private staged-value decoder back to the
  * canonical source descriptor. Caller-created blobs never gain read authority. */
 restoreMetadata(value: unknown): void {
  this.current();
  const visit = (parent: object, key: string) => {
   const child: unknown = Reflect.get(parent, key);
   if (!child || typeof child !== 'object') return;
   if (Object.hasOwn(child, 'content') && Object.hasOwn(child, 'byteLength') && Object.hasOwn(child, 'oid') && Object.hasOwn(child, 'commit') && Object.hasOwn(child, 'path')) {
    const blob = child as StagedPacketBlob;
    const lease = this.memory.reserve((blob.commit.length + blob.path.length) * 8 + 512, 'restored staged blob key');
    try {
     const canonical = this.blobs.get(preparationDigest(['staged-packet-blob-v2', blob.commit, blob.path]));
     if (!canonical || canonical.oid !== blob.oid || canonical.byteLength !== blob.byteLength || canonical.content.digest !== blob.content?.digest) throw new Error('Unbound staged packet metadata');
     Reflect.set(parent, key, canonical);
    } finally { lease.release(); }
   } else for (const k of Object.keys(child)) visit(child, k);
  };
  const wrapper = { value }; visit(wrapper, 'value');
 }
 /** Call only after the validated packet has been staged and its consumers
  * released it; returned document strings share this packet window's lifetime. */
 endPacket(): void {
  const scope = this.current(); this.scope = undefined;
  for (const budget of scope.budgets) budget.close();
  for (const value of scope.results) this.session.releaseResult(value);
  for (const lease of scope.leases) lease.release();
 }
 close(): void {
  if (this.closed) return;
  if (this.scope) throw new Error('Cannot close active staged packet scope');
  this.closed = true; this.blobs.clear(); for (const lease of this.retained) lease.release(); this.retained.length = 0;
 }
}
