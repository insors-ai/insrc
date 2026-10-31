/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { open, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireReview } from './contracts.js';
import type { ReviewCheckpoint } from './contracts.js';

export function checkpointPath(project: string, id: string): string {
 requireReview(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id), 'reviewId', 'Expected a literal review identifier');
 return join(project, '.insrc/tmp/code-review', `${id}.json`);
}
/** A poller always sees an entire file; a completed task is flushed before advancing. */
export async function saveCheckpoint(path: string, checkpoint: ReviewCheckpoint): Promise<void> {
 await mkdir(dirname(path), { recursive: true, mode: 0o700 });
 const temporary = `${path}.${randomUUID()}.tmp`;
 try {
  const file = await open(temporary, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(checkpoint, null, 2) + '\n'); await file.sync(); }
  finally { await file.close(); }
  await rename(temporary, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); }
  catch (error) { if (!['EINVAL', 'ENOTSUP', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; }
  finally { await directory.close(); }
 } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
