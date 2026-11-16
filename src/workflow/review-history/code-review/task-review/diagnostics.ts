/** Read-only historical review compatibility. No live review execution. */
import { decodeReview, requireReview } from "./contracts.js";
import type { ReviewAttempt } from "./contracts.js";
import { FailureDiagnosticsSchema } from "./diagnostic-schema.js";
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
        requireReview(!keys.has(key), 'diagnostic', 'Duplicate task/phase diagnostic');
        keys.add(key);
        bounded(entry.taskId, 256);
        for (const issue of entry.diagnostic.issues) {
            bounded(issue.code, 64);
            bounded(issue.field, 256);
            bounded(issue.correction, 256);
            bounded(issue.message, 1024);
        }
        bounded(entry.diagnostic.terminal?.reason, 64);
        bounded(entry.diagnostic.terminal?.message, 1024);
        bounded(entry.diagnostic.lastRejectedFeedback?.preview, 8192);
    }
}
