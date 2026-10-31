/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { callTool } from '../../../daemon/tools/call-tool.js';
import { gitCatFileTool } from '../../../daemon/tools/builtins/git/cat-file.js';
import { gitDiffTool } from '../../../daemon/tools/builtins/git/diff.js';
import type { ToolDeps } from '../../../daemon/tools/types.js';
import { requireReview } from './contracts.js';

export interface PinnedBlob { readonly bytes: Uint8Array; readonly oid: string; }
export interface ReviewSources {
 commit(oid: string): Promise<readonly string[]>;
 file(commit: string, path: string): Promise<PinnedBlob | null>;
 changedRanges(commit: string, parent: string | null, paths: readonly string[]): Promise<readonly ChangedRange[]>;
}
export interface ChangedRange { readonly before?: readonly [number, number]; readonly after?: readonly [number, number]; }
/** Hunk counts can include unchanged lines (diff.interHunkContext); retain only +/- runs. */
function changedRuns(section: string): readonly ChangedRange[] {
 const ranges: ChangedRange[] = [];
 let oldLine = 0, newLine = 0, active = false;
 let change: { before?: [number, number]; after?: [number, number] } = {};
 const flush = () => {
  if (change.before || change.after) ranges.push(change);
  change = {};
 };
 for (const line of section.split('\n')) {
  const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
  if (hunk) { flush(); oldLine = Number(hunk[1]); newLine = Number(hunk[2]); active = true; continue; }
  if (!active || line.startsWith('\\')) continue;
  if (line.startsWith('-')) {
   if (change.before) change.before[1] = oldLine; else change.before = [oldLine, oldLine];
   oldLine++;
  } else if (line.startsWith('+')) {
   if (change.after) change.after[1] = newLine; else change.after = [newLine, newLine];
   newLine++;
  } else if (line.startsWith(' ')) { flush(); oldLine++; newLine++; }
  else { flush(); active = false; }
 }
 flush();
 return ranges;
}
/** Existing typed tools retain daemon execution authority and isolated object reads. */
export class RegistryReviewSources implements ReviewSources {
 constructor(private readonly deps: ToolDeps) {}
 private async object(rev: string, expected: 'commit' | 'blob'): Promise<PinnedBlob | null> {
  const result = await callTool(gitCatFileTool, { cwd: this.deps.repoPath, rev, encoding: 'base64', isolated: true }, this.deps);
  requireReview(result.success, 'source', result.success ? '' : result.error.message);
  requireReview('objects' in result.data && result.data.objects.length === 1, 'source', 'Expected one Git object');
  const object = result.data.objects[0]!;
  if (!object.exists) return null;
  requireReview(object.type === expected && object.contentBase64 !== undefined && object.sha !== undefined, 'source', 'Unexpected Git object type');
  const bytes = Buffer.from(object.contentBase64, 'base64');
  const digest = createHash(object.sha.length === 40 ? 'sha1' : 'sha256').update(`${expected} ${bytes.length}\0`).update(bytes).digest('hex');
  requireReview(digest === object.sha && object.size === bytes.length, 'source', 'Git object integrity mismatch');
  return { bytes, oid: object.sha };
 }
 async commit(oid: string): Promise<readonly string[]> {
  const object = await this.object(oid, 'commit');
  requireReview(object?.oid === oid, 'commit', 'Commit pointer is unavailable');
  return Buffer.from(object.bytes).toString('utf8').split('\n\n', 1)[0]!.split('\n').filter(l => l.startsWith('parent ')).map(l => l.slice(7));
 }
 file(commit: string, path: string): Promise<PinnedBlob | null> { return this.object(`${commit}:${path}`, 'blob'); }
 async changedRanges(commit: string, parent: string | null, paths: readonly string[]): Promise<readonly ChangedRange[]> {
  const emptyTree = createHash(commit.length === 40 ? 'sha1' : 'sha256').update('tree 0\0').digest('hex');
  const result = await callTool(gitDiffTool, { cwd: this.deps.repoPath, from: parent ?? emptyTree, to: commit,
   paths: [...paths], context: 0, maxBytes: 2 * 1024 * 1024 }, this.deps);
  requireReview(result.success, 'changes', result.success ? '' : result.error.message);
  requireReview(!result.data.truncated, 'changes', 'Diff exceeded its bound; selection cannot be verified');
  requireReview(result.data.files.length > 0, 'changes', 'Selected file did not change');
  const ranges: ChangedRange[] = [];
  const oldPath = paths.at(-1)!, newPath = paths[0]!;
  const header = (prefix: string, path: string, section: string) => section.includes(`${prefix} ${path}\n`) || section.includes(`${prefix} ${JSON.stringify(path)}\n`);
  const sections = result.output.split(/(?=^diff --git )/m).filter(section => section.startsWith('diff --git '));
  for (const section of sections) {
   const oldMatches = header('---', `a/${oldPath}`, section) || header('---', '/dev/null', section);
   const newMatches = header('+++', `b/${newPath}`, section) || header('+++', '/dev/null', section);
   if (!oldMatches || !newMatches) continue;
   ranges.push(...changedRuns(section));
  }
  return ranges;
 }
}
