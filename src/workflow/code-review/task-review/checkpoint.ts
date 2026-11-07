import { validateFailureDiagnostics } from './diagnostics.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { CheckpointSchema, decodeReview, MAX_REVIEW_JSON_BYTES, requireReview } from './contracts.js';
import type { ReviewCheckpoint } from './contracts.js';
import { validateSavedAttribution } from './attribution-binding.js';

export function checkpointPath(project: string, id: string): string {
 requireReview(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id), 'reviewId', 'Expected a literal review identifier');
 return join(project, '.insrc/tmp/code-review', `${id}.json`);
}
/** A poller always sees an entire file; a completed task is flushed before advancing. */
export async function saveCheckpoint(path: string, checkpoint: ReviewCheckpoint): Promise<void> {
 for (const attempt of checkpoint.attempts) { validateFailureDiagnostics(attempt); validateSavedAttribution(attempt); }
 const serialized = JSON.stringify(decodeReview(CheckpointSchema, checkpoint), null, 2) + '\n';
 requireReview(Buffer.byteLength(serialized) <= MAX_REVIEW_JSON_BYTES, 'checkpoint', 'JSON exceeds limit');
 await mkdir(dirname(path), { recursive: true, mode: 0o700 });
 const temporary = `${path}.${randomUUID()}.tmp`;
 let failed = false;
 try {
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(serialized); await file.sync(); }
  finally { await file.close(); }
  await rename(temporary, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); }
  catch (error) { if (!['EINVAL', 'ENOTSUP', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
  finally { await directory.close(); }
 } catch (error) { failed = true; throw error; }
 finally { await unlink(temporary).catch(error => { if (!failed && error.code !== 'ENOENT') throw error; }); }
}

/** Missing is valid for first admission; symlinks and oversized/corrupt files are not. */
export async function loadCheckpoint(path: string): Promise<ReviewCheckpoint | undefined> {
 let file;
 try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
 try {
  const stat = await file.stat();
  requireReview(stat.isFile() && stat.size <= MAX_REVIEW_JSON_BYTES, 'checkpoint', 'Expected bounded checkpoint file');
  const checkpoint = decodeReview(CheckpointSchema, JSON.parse(await file.readFile('utf8')));
  for (const attempt of checkpoint.attempts) { validateFailureDiagnostics(attempt); validateSavedAttribution(attempt); }
  return checkpoint;
 } finally { await file.close(); }
}
