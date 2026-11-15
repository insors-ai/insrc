/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { open, lstat, realpath, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { preparationDigest } from './prepared-context.js';
import type { CleanupClaim } from '../../shared/review-preparation.js';

export const bytesDigest = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export type CleanupEntry = CleanupClaim['deletions'][number];
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
export async function cleanupStat(path: string): Promise<BigIntStats | undefined> {
 try { return await lstat(path, { bigint: true }); } catch (error) { if (missing(error)) return undefined; throw error; }
}
export function cleanupIdentity(stat: BigIntStats, kind: CleanupEntry['kind'], relativePath: string): string {
 return preparationDigest({ kind, relativePath, dev: String(stat.dev), ino: String(stat.ino), birth: String(stat.birthtimeNs), directory: stat.isDirectory(),
  ...(stat.isFile() ? { size: String(stat.size), modified: String(stat.mtimeNs) } : {}) });
}
/** No-follow, bounded and identity-stable. Used for claims/checkpoints/runtime;
 * large immutable context files are hashed in constant-memory blocks instead. */
export async function cleanupBytes(path: string, limit: number): Promise<{ bytes: Buffer; stat: BigIntStats }> {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const stat = await file.stat({ bigint: true });
  if (!stat.isFile() || stat.size > BigInt(limit)) throw new Error('Cleanup requires a bounded regular file');
  const bytes = Buffer.alloc(Number(stat.size) + 1); let offset = 0;
  while (offset < bytes.length) { const read = await file.read(bytes, offset, bytes.length - offset, null); if (!read.bytesRead) break; offset += read.bytesRead; }
  const after = await file.stat({ bigint: true });
  if (BigInt(offset) !== stat.size || stat.ctimeNs !== after.ctimeNs || cleanupIdentity(stat, 'checkpoint', '') !== cleanupIdentity(after, 'checkpoint', '')) throw new Error('Cleanup file changed while reading');
  return { bytes: bytes.subarray(0, offset), stat };
 } finally { await file.close(); }
}
export async function cleanupFileDigest(path: string): Promise<{ digest: string; stat: BigIntStats }> {
 const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
 try {
  const stat = await file.stat({ bigint: true }); if (!stat.isFile()) throw new Error('Cleanup requires a regular context file');
  const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024); let readBytes = 0n;
  for (;;) { const read = await file.read(buffer, 0, buffer.length, null); if (!read.bytesRead) break; readBytes += BigInt(read.bytesRead); if (readBytes > stat.size) throw new Error('Context file grew during cleanup'); hash.update(buffer.subarray(0, read.bytesRead)); }
  const after = await file.stat({ bigint: true });
  if (readBytes !== stat.size || stat.ctimeNs !== after.ctimeNs || cleanupIdentity(stat, 'context', '') !== cleanupIdentity(after, 'context', '')) throw new Error('Context file changed while hashing');
  return { digest: hash.digest('hex'), stat };
 } finally { await file.close(); }
}
/** Canonical parents, no symlinks. Newly created private directories are 0700. */
export async function cleanupParents(project: string, parts: readonly string[], create: boolean): Promise<void> {
 if (await realpath(project) !== project) throw new Error('Cleanup project is not canonical');
 let path = project;
 for (const part of parts) {
  path = join(path, part);
  if (create) await mkdir(path, { mode: 0o700 }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw new Error('Unsafe cleanup parent');
 }
}
export async function inventoryCleanupContext(root: string): Promise<CleanupEntry[]> {
 const entries: CleanupEntry[] = [];
 async function walk(relativePath: string): Promise<void> {
  if (entries.length >= 9998) throw new Error('Cleanup context inventory exceeds claim capacity');
  const path = join(root, relativePath), stat = await lstat(path, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) throw new Error('Unsafe context cleanup entry');
  const nodeType = stat.isDirectory() ? 'directory' : 'file';
  const got = stat.isFile() ? await cleanupFileDigest(path) : undefined;
  if (got && cleanupIdentity(got.stat, 'context', relativePath) !== cleanupIdentity(stat, 'context', relativePath)) throw new Error('Context file replaced during inventory');
  entries.push({ kind: 'context', relativePath, nodeType, identity: cleanupIdentity(stat, 'context', relativePath), contentDigest: got?.digest ?? bytesDigest('directory') });
  if (stat.isDirectory()) {
   const names = (await readdir(path)).sort(); if (names.length + entries.length > 9998) throw new Error('Cleanup context inventory exceeds claim capacity');
   for (const name of names) await walk(relativePath ? `${relativePath}/${name}` : name);
  }
 }
 await walk(''); return entries;
}
export async function verifyCleanupEntry(path: string, entry: CleanupEntry): Promise<boolean> {
 const stat = await cleanupStat(path); if (!stat) return false;
 if (stat.isSymbolicLink() || entry.nodeType === 'file' && !stat.isFile() || entry.nodeType === 'directory' && !stat.isDirectory()
  || cleanupIdentity(stat, entry.kind, entry.relativePath) !== entry.identity) throw new Error(`Claimed cleanup file was changed or replaced: ${path}`);
 if (entry.nodeType === 'file') {
  const got = await cleanupFileDigest(path);
  if (got.digest !== entry.contentDigest || cleanupIdentity(got.stat, entry.kind, entry.relativePath) !== entry.identity) throw new Error(`Claimed cleanup bytes changed: ${path}`);
 }
 return true;
}
