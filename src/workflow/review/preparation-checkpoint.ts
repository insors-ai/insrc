/* Copyright (c) Procix Software India. Licensed under the MIT License. */
export { CodePreparationCheckpointSchema, DesignPreparationCheckpointSchema, HistoricalPreparationMigrationSchema } from './preparation-checkpoint-contract.js';
export type { CodePreparationCheckpoint, DesignPreparationCheckpoint } from './preparation-checkpoint-contract.js';
import { CodePreparationCheckpointSchema, DesignPreparationCheckpointSchema } from './preparation-checkpoint-contract.js';
import type { CodePreparationCheckpoint, DesignPreparationCheckpoint } from './preparation-checkpoint-contract.js';
import { constants } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { reviewWorkerCheckpoint } from '../../daemon/threads/review-worker-contract.js';
import { Value } from '@sinclair/typebox/value';
import { reviewJsonLimit } from '../../config/review.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import { ReviewKeySchema, validateReviewResourceGuard } from '../../shared/review-resources.js';
import { decodeStoredCheckpoint } from '../code-review/task-review/admission-checkpoint.js';
import { decodeStoredDesignCheckpoint } from './design-review/admission-checkpoint.js';

/** Read-only observation for permanent approval/cleanup. A stored context
 * reference never grants execution or cache authority. */
export async function loadPreparationCheckpoint(key: ReviewKey): Promise<ReturnType<typeof decodePreparationCheckpoint> | undefined> {
 return (await loadPreparationCheckpointSnapshot(key))?.value;
}
const fileStamp = (st: BigIntStats): string => `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`;
/** Cheap observation only: never establishes trust in unvalidated bytes. */
export async function preparationCheckpointStamp(key: ReviewKey): Promise<string | undefined> {
 try {
  const st = await lstat(reviewWorkerCheckpoint(key), { bigint: true });
  if (!st.isFile() || st.isSymbolicLink()) throw new Error('Invalid preparation history file');
  return fileStamp(st);
 } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
/** The stamp returned belongs to the exact descriptor whose bytes were
 * validated, not a subsequent path lookup that could adopt a replacement. */
export async function loadPreparationCheckpointSnapshot(key: ReviewKey): Promise<{ value: ReturnType<typeof decodePreparationCheckpoint>; stamp: string } | undefined> {
 let file;
 try { file = await open(reviewWorkerCheckpoint(key), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
 catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
 try {
  const before = await file.stat({ bigint: true });
  if (!before.isFile() || before.size > BigInt(reviewJsonLimit())) throw new Error('Invalid preparation checkpoint size');
  const bytes = Buffer.alloc(Number(before.size) + 1); let offset = 0;
  while (offset < bytes.length) { const read = await file.read(bytes, offset, bytes.length - offset, null); if (!read.bytesRead) break; offset += read.bytesRead; }
  const after = await file.stat({ bigint: true });
  if (BigInt(offset) !== before.size || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error('Preparation checkpoint changed while reading');
  const value = decodePreparationCheckpoint(JSON.parse(bytes.subarray(0, offset).toString('utf8')), key), stamp = fileStamp(after);
  if (await preparationCheckpointStamp(key) !== stamp) throw new Error('Preparation checkpoint replaced during validated read');
  return { value, stamp };
 } finally { await file.close(); }
}

/** Read-only discriminating codec. Existing execution consumers still refuse
 * v3 until the coordinated cutover; this does not introduce another engine. */
export function decodePreparationCheckpoint(input: unknown, key: ReviewKey) {
 if (!Value.Check(ReviewKeySchema, key)) throw new Error('Invalid preparation checkpoint key');
 const bytes = JSON.stringify(input);
 if (bytes === undefined || Buffer.byteLength(bytes) > reviewJsonLimit() || !input || typeof input !== 'object') throw new Error('Invalid preparation checkpoint');
 const version = Reflect.get(input, 'schemaVersion');
 const current = version === 3;
 if (![1, 2, 3].includes(version)) throw new Error('Unsupported preparation checkpoint version');
 if (current && !Value.Check(key.family === 'code' ? CodePreparationCheckpointSchema : DesignPreparationCheckpointSchema, input)) throw new Error('Invalid version-3 checkpoint');
 const { runtime: _runtime, context: _context, migration: _migration, ...history } = input as Record<string, unknown>;
 const legacyInput = current ? { ...history, schemaVersion: 2 } : input;
 const decoded = key.family === 'code' ? decodeStoredCheckpoint(legacyInput) : decodeStoredDesignCheckpoint(legacyInput);
 if (decoded.project !== key.project || decoded.reviewId !== key.reviewId) throw new Error('Foreign preparation checkpoint');
 if (current) {
  const migration = (input as CodePreparationCheckpoint | DesignPreparationCheckpoint).migration;
  if (migration) {
   const seen = new Set<number>();
   for (const row of migration.guards) {
    validateReviewResourceGuard(row.guard, key);
    if (seen.has(row.attempt) || row.attempt > decoded.attempts.length || row.guard.openLeases.length) throw new Error('Invalid historical migration guard audit');
    seen.add(row.attempt);
   }
  }
 }
 return current ? { format: 'current' as const, checkpoint: input as CodePreparationCheckpoint | DesignPreparationCheckpoint } : { format: 'historical' as const, checkpoint: decoded };
}
