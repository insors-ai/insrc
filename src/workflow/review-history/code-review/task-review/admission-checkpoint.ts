/** Read-only historical review compatibility. No live review execution. */
import { canonicalReviewStory } from "./admission.js";
import { validateReviewResourceGuard } from "../../shared/review-resources.js";
import { validateFailureDiagnostics } from "./diagnostics.js";
import { validateSavedAttribution } from "./attribution-binding.js";
import { decodeReview, isCodeAdmission, requireReview, StoredCheckpointSchema } from "./contracts.js";
import type { StoredReviewCheckpoint } from "./contracts.js";
/** No source/provider work here. Full qualification remains the family's
 * source-pin, route, attribution and capacity admission, never this codec. */
export function decodeStoredCheckpoint(input: unknown): StoredReviewCheckpoint {
    const checkpoint: StoredReviewCheckpoint = decodeReview(StoredCheckpointSchema, input);
    if (checkpoint.schemaVersion === 2) {
        for (const [index, attempt] of checkpoint.attempts.entries()) {
            requireReview(attempt.header.attempt === index + 1, 'attempt', 'Attempt history must be contiguous');
            const hash = /^STORY-([a-f0-9]{16})-/.exec(checkpoint.storyId)?.[1] ?? /^STORY-([a-f0-9]{16})-/.exec(attempt.submitted.storyId)?.[1] ?? '';
            requireReview(canonicalReviewStory(attempt.submitted.storyId, hash) === canonicalReviewStory(checkpoint.storyId, hash) && attempt.submitted.taskId === checkpoint.taskId, 'scope', 'Foreign admission subject');
            if (attempt.resourceGuard)
                validateReviewResourceGuard(attempt.resourceGuard, { project: checkpoint.project, family: 'code', reviewId: checkpoint.reviewId });
            if (isCodeAdmission(attempt)) {
                requireReview(Number.isFinite(Date.parse(attempt.acceptedAt)) && Number.isFinite(Date.parse(attempt.header.createdAt)), 'admission', 'Invalid admission timestamp');
                const terminal = attempt.header.status === 'failed' || attempt.header.status === 'interrupted';
                requireReview(terminal === (attempt.header.completedAt !== undefined), 'admission', 'Admission terminal state needs completion time');
                if (attempt.header.completedAt)
                    requireReview(Number.isFinite(Date.parse(attempt.header.completedAt)), 'admission', 'Invalid admission completion time');
                requireReview(attempt.header.status !== 'failed' || attempt.error, 'admission', 'Failed admission needs technical error');
                requireReview(attempt.progress.task === null && attempt.progress.completedTasks === 0 && attempt.progress.taskElapsedMs === null, 'admission', 'Unverified admission has no task inventory');
                const phase = terminal ? attempt.header.status === 'failed' ? 'error' : 'interrupted' : 'scope_preparation';
                requireReview(attempt.progress.phase === phase, 'admission', 'Invalid admission progress phase');
                requireReview(index === checkpoint.attempts.length - 1 || terminal, 'attempt', 'Earlier admission is still active');
            }
            else {
                validateFailureDiagnostics(attempt);
                validateSavedAttribution(attempt);
            }
        }
    }
    else
        for (const attempt of checkpoint.attempts) {
            validateFailureDiagnostics(attempt);
            validateSavedAttribution(attempt);
        }
    return checkpoint;
}
