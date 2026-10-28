/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { TextDecoder } from 'node:util';
import { runGitBinary, decodeObject, SourceReaderError } from '../../../design/corpus/sources/git-reader.js';
import type { BinaryGitRunner } from '../../../design/corpus/sources/git-reader.js';
import { digestValue } from './identity.js';
import { SUBJECT_LIMITS, SubjectPreparationError } from './types.js';
import type { CommitPacketV1 } from './types.js';

export type ReviewBlock = CommitPacketV1['blocks'][number];
export interface GitCommit { readonly oid: string; readonly tree: string; readonly parents: readonly string[]; }
const oidPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
export function assertOid(value: string): void {
 if (typeof value !== 'string' || !oidPattern.test(value)) throw new SubjectPreparationError('invalid-object', 'Expected a full lowercase Git object id.');
}
export function decodeUtf8(bytes: Uint8Array): string {
 try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
 catch (cause) { throw new SubjectPreparationError('unsupported-change', 'Non-UTF8 Git path or textual patch.', { cause }); }
}
export function assertRepoPath(path: string): void {
 if (!path || path.startsWith('/') || path.includes('\0') || path.split('/').some(s => !s || s === '.' || s === '..')) {
  throw new SubjectPreparationError('invalid-input', 'Expected an exact repository-relative path.');
 }
}

/** Request-local aggregate budget. No process or source object is read through the working tree. */
export class ReviewGitReader {
 private remaining = SUBJECT_LIMITS.gitBytes;
 constructor(readonly repoPath: string, private readonly run: BinaryGitRunner = runGitBinary) {}
 async command(args: readonly string[], input = new Uint8Array()): Promise<Uint8Array> {
  if (this.remaining < 192) throw new SubjectPreparationError('resource-limit', 'Git acquisition budget exhausted.');
  try {
   const bytes = await this.run(args, input, { cwd: this.repoPath, stdoutLimit: this.remaining,
    stderrLimit: 65536, timeoutMs: SUBJECT_LIMITS.gitTimeoutMs });
   if (bytes.byteLength > this.remaining) throw new SubjectPreparationError('resource-limit', 'Git output exceeds remaining budget.');
   this.remaining -= bytes.byteLength; return bytes;
  } catch (cause) {
   if (cause instanceof SubjectPreparationError) throw cause;
   throw new SubjectPreparationError(cause instanceof SourceReaderError && cause.code === 'limit.exceeded'
    ? 'resource-limit' : 'invalid-object', 'Pinned Git acquisition failed.', { cause });
  }
 }
 async object(oid: string, kind: 'commit' | 'tree' | 'blob'): Promise<Uint8Array> {
  assertOid(oid);
  try { return decodeObject(await this.command(['cat-file', '--batch'], Buffer.from(`${oid}\n`)), oid, kind); }
  catch (cause) {
   if (cause instanceof SubjectPreparationError) throw cause;
   throw new SubjectPreparationError('invalid-object', 'Git object identity/type mismatch.', { cause });
  }
 }
 async commit(oid: string): Promise<GitCommit> {
  const bytes = await this.object(oid, 'commit');
  const head = Buffer.from(bytes).toString('utf8').split('\n\n', 1)[0] ?? '';
  const tree = /^tree ([a-f0-9]+)$/m.exec(head)?.[1];
  const parents = [...head.matchAll(/^parent ([a-f0-9]+)$/gm)].map(m => m[1]!);
  if (!tree || tree.length !== oid.length || parents.some(p => p.length !== oid.length)) throw new SubjectPreparationError('invalid-object', 'Malformed Git commit.');
  assertOid(tree); for (const p of parents) assertOid(p);
  await this.object(tree, 'tree'); return { oid, tree, parents };
 }
}
interface FileChange { oldMode: string; newMode: string; oldBlob: string | null; newBlob: string | null; status: string; oldPath: string | null; newPath: string | null; }
function rawChanges(bytes: Uint8Array, oidLength: number): FileChange[] {
 const fields = decodeUtf8(bytes).split('\0');
 if (fields.pop() !== '') throw new SubjectPreparationError('invalid-object', 'Unterminated Git raw diff.');
 const files: FileChange[] = [];
 for (let i = 0; i < fields.length;) {
  const m = /^:([0-7]{6}) ([0-7]{6}) ([a-f0-9]+) ([a-f0-9]+) ([AMDRT][0-9]*)$/.exec(fields[i++] ?? '');
  const path = fields[i++];
  if (!m || path === undefined || m[3]!.length !== oidLength || m[4]!.length !== oidLength) throw new SubjectPreparationError('invalid-object', 'Malformed Git change metadata.');
  assertRepoPath(path);
  const status = m[5]![0]!, renamed = status === 'R';
  const nextPath = renamed ? fields[i++] : path;
  if (nextPath === undefined) throw new SubjectPreparationError('invalid-object', 'Missing rename target.');
  assertRepoPath(nextPath);
  for (const mode of [m[1]!, m[2]!]) if (!['000000', '100644', '100755'].includes(mode)) throw new SubjectPreparationError('unsupported-change', 'Only regular Git files are supported; symlinks/submodules refuse.');
  files.push({ oldMode: m[1]!, newMode: m[2]!, oldBlob: /^0+$/.test(m[3]!) ? null : m[3]!, newBlob: /^0+$/.test(m[4]!) ? null : m[4]!, status,
   oldPath: status === 'A' ? null : path, newPath: status === 'D' ? null : nextPath });
 }
 return files;
}
function span(start: string, count: string | undefined): readonly [number, number] | null {
 const first = Number(start), length = count === undefined ? 1 : Number(count);
 if (!Number.isSafeInteger(first) || !Number.isSafeInteger(length) || first < 0 || length < 0 || (length && first === 0)
  || !Number.isSafeInteger(first + length)) throw new SubjectPreparationError('invalid-object', 'Invalid hunk range.');
 return length === 0 ? null : [first, first + length - 1];
}

/** Extracts all canonical entries; attribution and selection are deliberately handled by subject preparation. */
export async function readCommitPacket(reader: ReviewGitReader, commitId: string, parentId: string): Promise<CommitPacketV1> {
 assertOid(commitId); assertOid(parentId);
 const commit = await reader.commit(commitId);
 if (!commit.parents.length) throw new SubjectPreparationError('unsupported-change', 'Root commits have no v1 parent provenance.');
 if (!commit.parents.includes(parentId)) throw new SubjectPreparationError('invalid-object', 'Selected parent is not a direct commit parent.');
 await reader.commit(parentId);
 const files = rawChanges(await reader.command(['diff-tree', '--no-commit-id', '--raw', '-z', '-r', '--no-abbrev', '-M', parentId, commitId, '--']), commitId.length);
 const blocks: ReviewBlock[] = [];
 for (const file of files) {
  for (const oid of new Set([file.oldBlob, file.newBlob])) if (oid) await reader.object(oid, 'blob');
  const base = { oldPath: file.oldPath, newPath: file.newPath, oldBlob: file.oldBlob, newBlob: file.newBlob };
  const add = (kind: ReviewBlock['kind'], oldLines: ReviewBlock['oldLines'], newLines: ReviewBlock['newLines'], material: string): void => {
   if (blocks.length >= SUBJECT_LIMITS.blocks) throw new SubjectPreparationError('resource-limit', 'Too many review blocks.');
   const blockId = `block-${digestValue({ commitId, parentId, ...base, kind, oldLines, newLines, material })}`;
   blocks.push({ blockId, ...base, oldLines, newLines, kind, attributionRefs: [] });
  };
  if (file.status === 'R') add('rename', null, null, `${file.oldMode}:${file.newMode}`);
  if (file.oldMode !== '000000' && file.newMode !== '000000' && file.oldMode !== file.newMode) add('mode', null, null, `${file.oldMode}:${file.newMode}`);
  const paths = [...new Set([file.oldPath, file.newPath].filter((p): p is string => p !== null))];
  const patchBytes = await reader.command(['-c', 'diff.algorithm=myers', 'diff', '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--unified=0', '--no-indent-heuristic', '--src-prefix=a/', '--dst-prefix=b/', ...(file.oldBlob && file.newBlob ? [file.oldBlob, file.newBlob] : [parentId, commitId, '--', ...paths])]);
  const patch = decodeUtf8(patchBytes);
  if (/^Binary files .* differ$/m.test(patch)) { add('binary', null, null, `${file.oldMode}:${file.newMode}`); continue; }
  const hunks = [...patch.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*(?:\n|$)/gm)];
  for (let i = 0; i < hunks.length; i++) {
   const h = hunks[i]!;
   const end = hunks[i + 1]?.index ?? patch.length;
   // Blob-to-blob diffs preserve rename edit ranges without introducing a second file patch.
   const material = patch.slice(h.index, end).split(/^diff --git /m, 1)[0]!;
   add(file.status === 'A' ? 'add' : file.status === 'D' ? 'delete' : 'text', span(h[1]!, h[2]), span(h[3]!, h[4]), material);
  }
  if (!hunks.length && (file.status === 'A' || file.status === 'D')) add(file.status === 'A' ? 'add' : 'delete', null, null, `${file.oldMode}:${file.newMode}`);
 }
 return { packetId: `packet-${digestValue({ commitId, parentId, blocks: blocks.map(b => b.blockId) })}`, commitId, parentId,
  attribution: { basis: 'unattested', evidenceRefs: [] }, blocks };
}
