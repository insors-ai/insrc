import { isDeepStrictEqual } from 'node:util';
import { decodeReview, requireReview } from './contracts.js';
import type { ReviewAttempt } from './contracts.js';
import { DiagnosticSnapshotSchema, FailureDiagnosticsSchema } from './diagnostic-schema.js';
import type { FailureDiagnostic } from './diagnostic-schema.js';
import type { AdmittedReview } from './execution.js';

export const MAX_ATTEMPT_DIAGNOSTIC_BYTES = 32 * 1024;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
function bounded(text: string | undefined, limit: number): void {
 requireReview(text === undefined || Buffer.byteLength(text) <= limit, 'diagnostic', 'Diagnostic text exceeds its UTF-8 byte bound');
}
export function validateFailureDiagnostics(attempt: ReviewAttempt): void {
 const entries = decodeReview(FailureDiagnosticsSchema, attempt['review-response'].failureDiagnostics ?? []);
 requireReview(bytes(entries) <= MAX_ATTEMPT_DIAGNOSTIC_BYTES, 'diagnostic', 'Attempt diagnostics exceed 32 KiB');
 const keys = new Set<string>();
 for (const entry of entries) {
  requireReview(entry.phase === 'attribution' ? entry.taskId === undefined : entry.taskId !== undefined && attempt.header.selectedTaskIds.includes(entry.taskId), 'diagnostic', 'Diagnostic is not for the selected task/phase');
  const key = JSON.stringify([entry.phase, entry.taskId, entry.diagnostic.provider]);
  requireReview(!keys.has(key), 'diagnostic', 'Duplicate task/phase diagnostic'); keys.add(key);
  bounded(entry.taskId, 256);
  for (const issue of entry.diagnostic.issues) { bounded(issue.code, 64); bounded(issue.field, 256); bounded(issue.correction, 256); bounded(issue.message, 1024); }
  bounded(entry.diagnostic.terminal?.reason, 64); bounded(entry.diagnostic.terminal?.message, 1024);
  bounded(entry.diagnostic.lastRejectedFeedback?.preview, 8192);
 }
}

/** Caller serializes this with results and enforces the live execution fence. */
export async function persistFailureDiagnostic(review: AdmittedReview, phase: FailureDiagnostic['phase'], taskId: string | undefined,
 input: unknown, save: () => Promise<void>): Promise<void> {
 const diagnostic = decodeReview(DiagnosticSnapshotSchema, input);
 const entry: FailureDiagnostic = { phase, ...(taskId !== undefined ? { taskId } : {}), diagnostic };
 const prior = review.attempt['review-response'].failureDiagnostics;
 const entries: FailureDiagnostic[] = structuredClone([...(prior ?? [])]);
 const index = entries.findIndex(x => x.phase === phase && x.taskId === taskId && x.diagnostic.provider === diagnostic.provider);
 if (index >= 0 && isDeepStrictEqual(entries[index], entry)) return;
 requireReview(['pending', 'running'].includes(review.attempt.header.status), 'diagnostic', 'Diagnostic attempt is already terminal');
 requireReview(phase !== 'assessment' || !review.attempt['review-response'].tasks.some(t => t.taskId === taskId), 'diagnostic', 'Task assessment is already durable');
 if (index >= 0) entries[index] = entry; else entries.push(entry);
 // Bound aggregate evidence, keeping pointed errors before optional excerpts.
 if (bytes(entries) > MAX_ATTEMPT_DIAGNOSTIC_BYTES) for (const item of entries) {
  if (item.diagnostic.lastRejectedFeedback) { delete item.diagnostic.lastRejectedFeedback; item.diagnostic.truncated = true; }
 }
 if (bytes(entries) > MAX_ATTEMPT_DIAGNOSTIC_BYTES) for (const item of entries) {
  for (const issue of item.diagnostic.issues) delete issue.message;
  if (item.diagnostic.terminal) delete item.diagnostic.terminal.message;
  item.diagnostic.truncated = true;
 }
 review.attempt['review-response'].failureDiagnostics = entries;
 try { validateFailureDiagnostics(review.attempt); await save(); }
 catch (error) {
  if (prior) review.attempt['review-response'].failureDiagnostics = prior;
  else delete review.attempt['review-response'].failureDiagnostics;
  throw error;
 }
}

/** Resolved output errors remain evidence but must not be repeated as corrections. */
export function resolveFailureDiagnostics(attempt: ReviewAttempt, phase: FailureDiagnostic['phase'], taskId?: string): boolean {
 const prior = attempt['review-response'].failureDiagnostics;
 if (!prior?.some(entry => entry.phase === phase && entry.taskId === taskId && !entry.resolved)) return false;
 attempt['review-response'].failureDiagnostics = prior.map(entry => entry.phase === phase && entry.taskId === taskId ? { ...entry, resolved: true } : entry);
 return true;
}
