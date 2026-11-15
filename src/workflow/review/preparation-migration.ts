/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewRuntime } from '../../shared/review-preparation.js';
import { decodeReviewRuntime } from '../../shared/review-preparation.js';
import { decodePreparationCheckpoint } from './preparation-checkpoint.js';
import type { CodePreparationCheckpoint, DesignPreparationCheckpoint } from './preparation-checkpoint.js';
import { preparationDigest } from './prepared-context.js';

/** Exact per-attempt input when stored; historical design checkpoints kept
 * only the initial locator, so derive its current attempt without rewriting it. */
export function preparationSubmission(input: unknown, key: ReviewKey): unknown {
 const decoded = decodePreparationCheckpoint(input, key), cp = decoded.checkpoint, last = cp.attempts.at(-1)!;
 if ('header' in last) return structuredClone(last.submitted);
 if ('submitted' in last && last.submitted) return structuredClone(last.submitted);
 if ('submitted' in cp && cp.submitted) return { ...structuredClone(cp.submitted), attempt: last.number };
 throw new Error('Preparation submission is unavailable');
}

/** Pure migration candidate, not execution authority. The production owner
 * must hold the exact inactive-review fence across initialize/bind/activate.
 * Guards are retained as historical audit; no guard is silently cleared. */
export function upgradePreparationHistory(input: unknown, key: ReviewKey, runtime: ReviewRuntime,
 pending?: { readonly attempt: number; readonly submitted: unknown }): CodePreparationCheckpoint | DesignPreparationCheckpoint {
 const decoded = decodePreparationCheckpoint(input, key);
 if (decoded.format !== 'historical') throw new Error('Only an explicit historical migration can upgrade preparation history');
 const operational = decodeReviewRuntime(runtime, key);
 if (operational.state !== 'initializing' || operational.sequence !== 0) throw new Error('Migration requires an inactive initializing runtime');
 const checkpoint = decoded.checkpoint, latest = checkpoint.attempts.at(-1)!;
 const number = 'header' in latest ? latest.header.attempt : latest.number;
 if (pending ? pending.attempt !== runtime.attempt || number + 1 !== pending.attempt : number !== runtime.attempt) throw new Error('Migration attempt mismatch');
 const submitted = pending ? pending.submitted : preparationSubmission(checkpoint, key);
 if (preparationDigest(submitted) !== runtime.checkpointBinding.inputDigest) throw new Error('Migration input digest mismatch');
 const guards = checkpoint.attempts.flatMap(attempt => {
  const number = 'header' in attempt ? attempt.header.attempt : attempt.number;
  const guard = 'resourceGuard' in attempt ? attempt.resourceGuard : undefined;
  const status = 'header' in attempt ? attempt.header.status : attempt.status;
  // A v1 active/interrupted record without a guard is uncertain. The existing
  // explicit broker clearance must establish a closed v2 guard first.
  if (checkpoint.schemaVersion === 1 && !guard && (['pending', 'running', 'interrupted'].includes(status)
   || 'header' in attempt && 'interrupted' in attempt.header && attempt.header.interrupted === true)) throw new Error('Historical resource ownership is unverifiable; explicit clearance required');
  if (guard?.openLeases.length) throw new Error('Historical resources remain unresolved; migration withheld');
  return guard ? [{ attempt: number, guard: structuredClone(guard) }] : [];
 });
 const candidate = { ...structuredClone(checkpoint), schemaVersion: 3,
  runtime: { runtimeId: runtime.runtimeId, inputDigest: runtime.checkpointBinding.inputDigest },
  migration: { sourceVersion: checkpoint.schemaVersion, sourceDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'), guards },
  attempts: checkpoint.attempts.map(attempt => {
   const { resourceGuard: _guard, ...history } = attempt as typeof attempt & { resourceGuard?: unknown };
   return structuredClone(history);
  }),
 };
 const result = decodePreparationCheckpoint(candidate, key);
 if (result.format !== 'current') throw new Error('Migration did not produce the current format');
 return result.checkpoint;
}
