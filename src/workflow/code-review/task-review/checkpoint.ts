import { validateFailureDiagnostics } from './diagnostics.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { CheckpointSchema, decodeReview, reviewJsonLimit, requireReview } from './contracts.js';
import type { ReviewCheckpoint } from './contracts.js';
import type { StoredReviewCheckpoint } from './contracts.js';
import { decodeStoredCheckpoint } from './admission-checkpoint.js';
import { validateSavedAttribution } from './attribution-binding.js';

export function checkpointPath(project: string, id: string): string {
 requireReview(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id), 'reviewId', 'Expected a literal review identifier');
 return join(project, '.insrc/tmp/code-review', `${id}.json`);
}
export type CheckpointSaveOutcome = 'not_replaced' | 'replaced' | 'uncertain';
export class CheckpointSaveError extends Error {
 visibleState?: 'candidate' | 'prior' | 'unverifiable';
 constructor(readonly outcome: CheckpointSaveOutcome, cause: unknown) {
  super(`Checkpoint save failed (${outcome}): ${cause instanceof Error ? cause.message : String(cause)}`, { cause }); this.name = 'CheckpointSaveError';
 }
}
const defaultIO = { open, mkdir, rename, unlink };
export type CheckpointIO = typeof defaultIO;
const codeWrites=new Map<string,Promise<void>>();
function serializeCodeWrite<T>(path:string,write:()=>Promise<T>):Promise<T>{
 const previous=codeWrites.get(path)??Promise.resolve(),next=previous.catch(()=>{}).then(write),tail=next.then(()=>{},()=>{});
 codeWrites.set(path,tail);void tail.then(()=>{if(codeWrites.get(path)===tail)codeWrites.delete(path);});return next;
}
export function checkpointBytes(checkpoint:ReviewCheckpoint):string{return JSON.stringify(decodeReview(CheckpointSchema,checkpoint),null,2)+'\n';}
/** A poller always sees an entire file; a completed task is flushed before advancing. */
export async function saveCheckpoint(path: string, checkpoint: ReviewCheckpoint, io: CheckpointIO = defaultIO): Promise<void> {
 for (const attempt of checkpoint.attempts) { validateFailureDiagnostics(attempt); validateSavedAttribution(attempt); }
 const serialized = checkpointBytes(checkpoint);
 return serializeCodeWrite(path,()=>writeCheckpoint(path, serialized, io));
}
/** The same atomic writer for the versioned admission contract. Production
 * emission starts only when the worker adapters are cut over. */
export async function saveStoredCheckpoint(path: string, checkpoint: StoredReviewCheckpoint, io: CheckpointIO = defaultIO): Promise<void> {
 const bytes=JSON.stringify(decodeStoredCheckpoint(checkpoint),null,2)+'\n';
 return serializeCodeWrite(path,()=>writeCheckpoint(path,bytes,io));
}
/** Resource/progress read-modify-write shares the same family save lane. */
export function updateStoredCodeCheckpoint(path:string,mutate:(current:StoredReviewCheckpoint|undefined)=>StoredReviewCheckpoint|Promise<StoredReviewCheckpoint>):Promise<StoredReviewCheckpoint>{
 return serializeCodeWrite(path,async()=>{const next=decodeStoredCheckpoint(await mutate(await loadStoredCheckpoint(path)));await writeCheckpoint(path,JSON.stringify(next,null,2)+'\n',defaultIO);return next;});
}
async function writeCheckpoint(path: string, serialized: string, io: CheckpointIO): Promise<void> {
 requireReview(Buffer.byteLength(serialized) <= reviewJsonLimit(), 'checkpoint', 'JSON exceeds limit');
 const temporary = `${path}.${randomUUID()}.tmp`;
 let created = false, renameStarted = false, replaced = false, failure: { cause: unknown } | undefined;
 const identity = async (): Promise<string | null | undefined> => {
  let handle;
  try { handle = await io.open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  try { const stat = await handle.stat({ bigint: true }); return stat.ino > 0n ? `${stat.dev}:${stat.ino}` : undefined; }
  finally { await handle.close(); }
 };
 try {
  await io.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const priorIdentity = await identity();
  const file = await io.open(temporary, 'wx', 0o600); created = true;
  let temporaryIdentity: string | undefined;
  try { await file.writeFile(serialized); await file.sync(); const stat = await file.stat({ bigint: true }); if(stat.ino > 0n)temporaryIdentity = `${stat.dev}:${stat.ino}`; } catch (cause) { failure = { cause }; }
  try { await file.close(); } catch (cause) { failure ??= { cause }; }
  if (failure) throw failure.cause;
  renameStarted = true;
  try { await io.rename(temporary, path); replaced = true; }
  catch (cause) {
   // Under the caller's review ownership, inode identity establishes visible
   // replacement without guessing from errno or exception text. Failure to
   // establish either identity remains uncertain (including failed readback).
   try { const visible = await identity(); if (temporaryIdentity!==undefined&&temporaryIdentity!==priorIdentity&&visible===temporaryIdentity) replaced = true; else if (priorIdentity!==undefined&&priorIdentity!==temporaryIdentity&&visible===priorIdentity) renameStarted = false; } catch { /* outcome remains unknown */ }
   throw cause;
  }
  const directory = await io.open(dirname(path), 'r');
  try { await directory.sync(); }
  catch (cause) { if (!['EINVAL', 'ENOTSUP', 'EISDIR'].includes((cause as NodeJS.ErrnoException).code ?? '')) failure = { cause }; }
  try { await directory.close(); } catch (cause) { failure ??= { cause }; }
 } catch (cause) { failure ??= { cause }; }
 finally {
  if (created) try { await io.unlink(temporary); } catch (cause) { if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') failure ??= { cause }; }
 }
 if (failure) throw new CheckpointSaveError(replaced ? 'replaced' : renameStarted ? 'uncertain' : 'not_replaced', failure.cause);
}

/** Missing is valid for first admission; symlinks and oversized/corrupt files are not. */
export async function loadCheckpoint(path: string): Promise<ReviewCheckpoint | undefined> {
 const checkpoint = await loadStoredCheckpoint(path);
 if (!checkpoint) return undefined;
 requireReview(checkpoint.schemaVersion === 1, 'checkpoint', 'Admission checkpoint requires a version-2-aware consumer');
 return checkpoint;
}
/** Discriminating reader for worker-aware consumers; never upgrades history. */
export async function loadStoredCheckpoint(path: string): Promise<StoredReviewCheckpoint | undefined> {
 let file;
 try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
 try {
  const stat = await file.stat();
  requireReview(stat.isFile() && stat.size <= reviewJsonLimit(), 'checkpoint', 'Expected bounded checkpoint file');
  return decodeStoredCheckpoint(JSON.parse(await file.readFile('utf8')));
 } finally { await file.close(); }
}
