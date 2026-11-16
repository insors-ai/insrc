/** Read-only historical review compatibility. No live review execution. */
import { validateReviewResourceGuard } from "../../shared/review-resources.js";
import { decodeDesign, isDesignAdmission, requireDesign, StoredDesignCheckpointSchema } from "./contracts.js";
import type { StoredDesignCheckpoint } from "./contracts.js";
/** Decode only; the disk reader also applies canonical identity and qualified
 * feedback checks. No admission baseline, inventory or report is invented. */
export function decodeStoredDesignCheckpoint(input: unknown): StoredDesignCheckpoint {
    const cp = decodeDesign(StoredDesignCheckpointSchema, input);
    if (cp.schemaVersion === 1)
        return cp;
    requireDesign(cp.attempts.every((a, i) => a.number === i + 1), 'invalid_checkpoint', 'Attempt sequence is not contiguous');
    const actions = new Set<string>();
    for (const [i, attempt] of cp.attempts.entries()) {
        if (attempt.resourceGuard)
            validateReviewResourceGuard(attempt.resourceGuard, { project: cp.project, family: 'design', reviewId: cp.reviewId });
        for (const action of attempt.actions ?? []) {
            requireDesign(!actions.has(action.actionId) && action.sourceAttempt === attempt.number && action.resultAttempt === attempt.number + (action.operation === 'restart_full' ? 1 : 0), 'invalid_checkpoint', 'Invalid or duplicate recovery action');
            actions.add(action.actionId);
        }
        if (!isDesignAdmission(attempt))
            continue;
        requireDesign(!actions.has(attempt.actionId), 'invalid_checkpoint', 'Duplicate admission action identity');
        actions.add(attempt.actionId);
        if (attempt.operation === 'start')
            requireDesign(attempt.submitted.artifactPath && !attempt.submitted.recovery && attempt.submitted.attempt === attempt.number, 'invalid_checkpoint', 'Invalid start submission identity');
        else {
            const recovery = attempt.submitted.recovery;
            requireDesign(recovery && !attempt.submitted.artifactPath, 'invalid_checkpoint', 'Recovery admission needs its exact recovery input');
            requireDesign(attempt.submitted.attempt === attempt.number - (recovery.operation === 'restart_full' ? 1 : 0), 'invalid_checkpoint', 'Recovery source attempt mismatch');
            requireDesign(recovery.operation !== 'restart_full' || recovery.userDecision?.action === 'restart_full', 'invalid_checkpoint', 'Full restart requires its explicit user decision');
        }
        const terminal = attempt.status === 'failed' || attempt.status === 'interrupted';
        requireDesign(terminal === (attempt.finishedAt !== undefined), 'invalid_checkpoint', 'Admission completion time disagrees with status');
        for (const time of [attempt.acceptedAt, attempt.startedAt, attempt.finishedAt, attempt.progress.observedAt])
            if (time !== undefined)
                requireDesign(Number.isFinite(Date.parse(time)), 'invalid_checkpoint', 'Invalid admission timestamp');
        requireDesign(attempt.status !== 'failed' || attempt.error, 'invalid_checkpoint', 'Failed admission needs technical error');
        requireDesign(i === cp.attempts.length - 1 || terminal, 'invalid_checkpoint', 'Earlier admission is still active');
    }
    return cp;
}
