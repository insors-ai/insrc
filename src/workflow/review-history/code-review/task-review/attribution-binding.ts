/** Read-only historical review compatibility. No live review execution. */
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { canonicalTaskDigest as digest } from "./canonical-digest.js";
import { decodeReview, requireReview } from "./contracts.js";
import type { ReviewAttempt } from "./contracts.js";
import { AcceptedTaskAttributionSchema } from "./final-scope-contracts.js";
import type { AcceptedTaskAttribution } from "./final-scope-contracts.js";
export function attributionIdentity(state: 'accepted' | 'unmapped_failure', finalScopeIdentity: string, selectedTaskIds: readonly string[], testCount: number, rows: readonly (AcceptedTaskAttribution & {
    identity: string;
})[]): string {
    return digest({ format: 'final-attribution-v1', state, finalScopeIdentity, selectedTaskIds, testCount, rows });
}
export function validateSavedAttribution(attempt: ReviewAttempt): void {
    const h = attempt.header;
    if (!attempt.submitted.reviewRevision) {
        requireReview(h.finalScopeIdentity === undefined && h.attributionState === undefined && h.acceptedAttribution === undefined && h.taskScopeIdentities === undefined && h.attributionIdentity === undefined && h.attributionFailure === undefined && h.taskIdentityFormat === undefined, 'attribution', 'Unpinned history cannot carry final-scope authority');
        return;
    }
    requireReview(h.finalScopeIdentity && h.attributionState, 'attribution', 'Pinned attempt requires final-scope attribution phase');
    if (h.attributionState !== 'accepted') {
        requireReview(h.acceptedAttribution === undefined && h.taskScopeIdentities === undefined && h.taskIdentityFormat === undefined, 'attribution', 'Unmapped phase cannot carry accepted task bindings');
        if (h.attributionState === 'pending')
            requireReview(h.attributionIdentity === undefined && h.attributionFailure === undefined, 'attribution', 'Pending attribution has terminal bindings');
        else {
            requireReview(h.attributionFailure && Buffer.byteLength(h.attributionFailure.code) <= 64 && Buffer.byteLength(h.attributionFailure.summary) <= 8192 && h.attributionIdentity === attributionIdentity('unmapped_failure', h.finalScopeIdentity, h.selectedTaskIds, attempt.submitted.tests.length, []), 'attribution', 'Invalid unmapped failure binding');
            requireReview(!attempt['review-response'].origins?.length && attempt['review-response'].tasks.every(t => (t.status === 'failed' || t.status === 'incomplete') && !t.findings.length && t.testCoverage.assessment !== 'verified'), 'attribution', 'Unmapped checkpoint claims assessed scope');
        }
        return;
    }
    requireReview(h.acceptedAttribution && h.taskScopeIdentities && h.attributionIdentity && h.attributionFailure === undefined, 'attribution', 'Incomplete accepted attribution');
    validateAcceptedBindings(h as AcceptedBindingHeader, attempt.submitted.reviewSet.reduce((n, p) => n + p.files.length, 0), attempt.submitted.tests.length);
}
export interface AcceptedBindingHeader {
    attempt: number;
    selectedTaskIds: readonly string[];
    finalScopeIdentity: string;
    attributionIdentity: string;
    acceptedAttribution: readonly AcceptedTaskAttribution[];
    taskScopeIdentities: readonly {
        taskId: string;
        identity: string;
    }[];
}
export function validateAcceptedBindings(h: AcceptedBindingHeader, files: number, tests: number): void {
    const rows = h.acceptedAttribution, bindings = h.taskScopeIdentities;
    requireReview(rows.length === h.selectedTaskIds.length && bindings.length === rows.length && new Set(rows.map(r => r.taskId)).size === rows.length && new Set(bindings.map(r => r.taskId)).size === bindings.length, 'attribution', 'Duplicate or missing accepted tasks');
    const changes = new Set<number>(), coveredTests = new Set<number>();
    const bound = rows.map(row => {
        decodeReview(AcceptedTaskAttributionSchema, row);
        requireReview(h.selectedTaskIds.includes(row.taskId), 'attribution', 'Foreign accepted task');
        requireReview(row.changeIndexes.every(i => i < files) && row.testIndexes.every(i => i < tests), 'attribution', 'Accepted index exceeds pinned input');
        requireReview(h.attempt === 1 ? row.decision.action === 'initial' : row.decision.action !== 'initial', 'attribution', 'Wrong attempt decision');
        if (row.decision.action === 'reuse')
            requireReview(row.decision.sourceAttempt < h.attempt, 'attribution', 'Reuse source must be earlier');
        for (const i of row.changeIndexes)
            changes.add(i);
        for (const i of row.testIndexes)
            coveredTests.add(i);
        const binding = bindings.find(b => b.taskId === row.taskId);
        requireReview(binding, 'attribution', 'Missing task identity');
        return { ...row, identity: binding.identity };
    });
    requireReview(changes.size === files && coveredTests.size === tests, 'attribution', 'Accepted attribution omits submitted inputs');
    requireReview(h.attributionIdentity === attributionIdentity('accepted', h.finalScopeIdentity, h.selectedTaskIds, tests, bound), 'attribution', 'Accepted mapping/decision binding mismatch');
}
