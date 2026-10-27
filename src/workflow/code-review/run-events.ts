import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ReviewCallEvent } from '../review-pipeline/call-events.js';

/** Canonical append-only run diagnostics survive failures without creating a CR pass. */
export function appendReviewRunEvent(repo: string, runId: string, event: ReviewCallEvent): void {
 if (!/^cr-[a-zA-Z0-9-]{1,100}$/.test(runId)) throw new Error('invalid-review-run-id');
 const directory = join(repo, '.insrc', 'review-runs');
 mkdirSync(directory, { recursive: true });
 appendFileSync(join(directory, `${runId}.jsonl`), JSON.stringify(event) + '\n', { mode: 0o600 });
}
