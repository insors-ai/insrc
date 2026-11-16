/** Read-only historical review compatibility. No live review execution. */
import { isAbsolute, join, relative, resolve } from 'node:path';
import { consolidateDesignReview } from "./results.js";
import { ArtifactIds } from "../../../artifact-ids.js";
import { artifactJsonPath } from "../../../storage.js";
import { DESIGN_LIMITS, requireDesign } from "./contracts.js";
import type { DesignReviewCheckpoint, DesignAttempt, DesignUnitState, DesignUnitSummary } from "./contracts.js";
import { isDesignAdmission } from "./contracts.js";
import type { StoredDesignCheckpoint } from "./contracts.js";
import { qualifiedDesignAction } from "./action-state.js";
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function checkUnit(unit: DesignUnitState | DesignUnitSummary): void {
    const dispatches = 'dispatches' in unit ? unit.dispatches : unit.automaticDispatches;
    requireDesign(unit.retriesUsed === dispatches - 1 && unit.diagnostics.length <= dispatches, 'invalid_checkpoint', 'Unit retry counters do not match reserved dispatches');
}
function checkRecovery(attempt: DesignAttempt): void {
    const actions = attempt.actions ?? [], summaries = attempt.unitSummaries ?? [];
    const keys = new Set<string>();
    for (const action of actions) {
        requireDesign(action.sourceAttempt === attempt.number, 'invalid_checkpoint', 'Recovery action belongs to another attempt');
        requireDesign(action.resultAttempt === attempt.number + (action.operation === 'restart_full' ? 1 : 0), 'invalid_checkpoint', 'Recovery action names an invalid resulting attempt');
        const decision = action.userDecision?.action;
        requireDesign(action.operation === 'restart_full' ? decision === 'restart_full' : decision === undefined || action.operation === 'resume' && decision === 'retry_failed_unit', 'invalid_checkpoint', 'Recovery decision does not match action');
    }
    for (const summary of summaries) {
        checkUnit(summary);
        const key = `${summary.phase}\0${summary.unitId}`;
        requireDesign(!keys.has(key), 'invalid_checkpoint', 'Duplicate completed unit summary');
        keys.add(key);
        requireDesign(new Set(summary.actionIds).size === summary.actionIds.length && summary.actionIds.every(id => actions.some(a => a.actionId === id)), 'invalid_checkpoint', 'Unit summary names an unknown or duplicate action');
        requireDesign(summary.actionIds.every(id => actions.some(a => a.actionId === id && qualifiedDesignAction(a))), 'invalid_checkpoint', 'Unit summary names an unverified recovery action');
        if (summary.phase === 'impact')
            requireDesign(attempt.plan && attempt.impact, 'invalid_checkpoint', 'Completed impact summary has no atomic plan/impact pair');
        if (summary.phase === 'planning')
            requireDesign(attempt.plan, 'invalid_checkpoint', 'Completed planning summary has no accepted plan');
        if (summary.phase === 'chunk_review')
            requireDesign(attempt.completedChunks.some(c => c.chunkId === summary.unitId), 'invalid_checkpoint', 'Completed unit summary has no accepted chunk');
    }
    if (attempt.unit) {
        checkUnit(attempt.unit);
        const sealed = summaries.find(s => s.phase === attempt.unit!.phase && s.unitId === attempt.unit!.unitId);
        if (sealed)
            requireDesign(sealed.automaticDispatches === attempt.unit.dispatches && sealed.retriesUsed === attempt.unit.retriesUsed && sealed.userDirectedDispatches === attempt.unit.userDirectedDispatches && same(sealed.diagnostics, attempt.unit.diagnostics), 'immutable_history', 'Cannot reopen a sealed unit');
    }
    const directed = summaries.reduce((count, s) => count + s.userDirectedDispatches, 0) + (attempt.unit && !keys.has(`${attempt.unit.phase}\0${attempt.unit.unitId}`) ? attempt.unit.userDirectedDispatches : 0);
    requireDesign(directed <= actions.filter(a => qualifiedDesignAction(a) && a.userDecision?.action === 'retry_failed_unit').length, 'invalid_checkpoint', 'User-directed dispatch lacks an approved action');
    if (attempt.recovery)
        requireDesign(attempt.recovery.attempt === attempt.number && attempt.recovery.status === attempt.status && same(attempt.recovery.completedChunkIds, attempt.completedChunks.map(c => c.chunkId)), 'invalid_checkpoint', 'Recovery state does not match attempt');
}
export function designCheckpointPath(project: string, reviewId: string): string {
    requireDesign(isAbsolute(project) && resolve(project) === project, 'invalid_project', 'Expected canonical absolute project');
    requireDesign(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(reviewId), 'invalid_review_id', 'Expected literal review identifier');
    return join(project, '.insrc/tmp/design-review', `${reviewId}.json`);
}
export function validateDesignCheckpointIdentity(project: string, id: string, checkpoint: DesignReviewCheckpoint, admissionNumbers: readonly number[] = []): void {
    const key = ArtifactIds.parse(checkpoint.artifactId);
    requireDesign(checkpoint.reviewId === id && checkpoint.project === project && checkpoint.subject.project === project && checkpoint.subject.artifactId === checkpoint.artifactId, 'foreign_checkpoint', 'Checkpoint identity does not match request');
    requireDesign(key && ['DEF', 'HLD', 'LLD'].includes(key.kind) && key.kind === checkpoint.subject.kind, 'foreign_checkpoint', 'Invalid checkpoint subject');
    requireDesign(checkpoint.subject.canonicalPath === artifactJsonPath(project, checkpoint.artifactId), 'foreign_checkpoint', 'Noncanonical subject in checkpoint');
    const doc = relative(join(project, 'docs'), checkpoint.subject.documentPath);
    requireDesign(doc !== '' && !doc.startsWith('..') && !isAbsolute(doc), 'foreign_checkpoint', 'Subject document must remain in project docs');
    const numbers = [...checkpoint.attempts.map(a => a.number), ...admissionNumbers].sort((a, b) => a - b);
    requireDesign(numbers.every((number, i) => number === i + 1), 'invalid_checkpoint', 'Attempt sequence is not contiguous');
    const actionIds = checkpoint.attempts.flatMap(a => (a.actions ?? []).map(action => action.actionId));
    requireDesign(new Set(actionIds).size === actionIds.length, 'invalid_checkpoint', 'Duplicate recovery action identity');
    for (const attempt of checkpoint.attempts) {
        checkRecovery(attempt);
        requireDesign((attempt.preparationKind ?? 'planning') === 'impact' ? !!attempt.plan === !!attempt.impact : !attempt.impact, 'invalid_checkpoint', 'Impact preparation requires an atomic plan/impact pair; full planning cannot retain coverage');
        requireDesign((attempt.actions ?? []).every(a => a.resultAttempt <= numbers.length || !qualifiedDesignAction(a) && a.operation === 'restart_full' && a.sourceAttempt === numbers.length && a.resultAttempt === numbers.length + 1), 'invalid_checkpoint', 'Recovery action names an absent attempt');
        requireDesign(attempt.progress.checkpointPath === designCheckpointPath(project, id), 'foreign_checkpoint', 'Progress names another checkpoint');
        requireDesign(attempt.completedChunks.every(r => Buffer.byteLength(JSON.stringify(r)) <= DESIGN_LIMITS.resultBytes), 'result_too_large', 'Stored chunk result exceeds page limit');
        const ids = new Set(attempt.completedChunks.map(r => r.chunkId));
        requireDesign(ids.size === attempt.completedChunks.length, 'invalid_checkpoint', 'Duplicate accepted chunk results');
        requireDesign(attempt.completedChunks.every(r => r.findingDecisions === undefined || !!attempt.impact && r.chunkId === attempt.plan?.finalConsistencyChunkId), 'invalid_checkpoint', 'Stored finding decisions are not on an impact final result');
        if (attempt.report)
            requireDesign(!!attempt.report.impact === !!attempt.impact, 'invalid_checkpoint', 'Report impact projection presence disagrees with accepted impact');
        if (attempt.report && attempt.impact) {
            requireDesign(attempt.plan, 'invalid_checkpoint', 'Impact report lacks accepted plan');
            try {
                const report = consolidateDesignReview(id, attempt.number, { ...checkpoint.subject, reviewer: attempt.reviewer ?? checkpoint.subject.reviewer }, attempt.baseline.contentIdentity, attempt.plan, attempt.completedChunks, { impact: attempt.impact, attempts: checkpoint.attempts });
                requireDesign(same(report, attempt.report), 'invalid_checkpoint', 'Report provenance differs from accepted review');
            }
            catch {
                requireDesign(false, 'invalid_checkpoint', 'Impact report does not match accepted state');
            }
        }
        if (attempt.report)
            requireDesign(attempt.report.reviewId === id && attempt.report.attempt === attempt.number && attempt.report.artifactId === checkpoint.artifactId && attempt.report.reviewedContentIdentity === attempt.baseline.contentIdentity && JSON.stringify(attempt.report.chunks) === JSON.stringify(attempt.completedChunks), 'invalid_checkpoint', 'Report does not match accepted attempt');
    }
}
/** A view for existing evidence validators; original attempt numbers remain
 * intact. Admission failures never become synthetic chunk assessments. */
export function qualifiedDesignProjection(cp: StoredDesignCheckpoint): DesignReviewCheckpoint | undefined {
    if (cp.schemaVersion === 1)
        return cp;
    const attempts: DesignAttempt[] = [];
    for (const attempt of cp.attempts) {
        if (isDesignAdmission(attempt))
            continue;
        const { resourceGuard: _guard, acceptedAt: _at, submitted: _input, actionId: _action, operation: _operation, ...qualified } = attempt;
        attempts.push(qualified);
    }
    if (!attempts.length) {
        requireDesign(!cp.subject && !cp.artifactId && !cp.submitted, 'invalid_checkpoint', 'Unverified admission cannot carry accepted subject authority');
        return undefined;
    }
    requireDesign(cp.subject && cp.artifactId, 'invalid_checkpoint', 'Qualified history needs its verified subject');
    return { schemaVersion: 1, reviewId: cp.reviewId, project: cp.project, artifactId: cp.artifactId, subject: cp.subject, submitted: cp.submitted ?? { artifactPath: cp.subject.canonicalPath, attempt: attempts[0]!.number }, attempts };
}
export function validateStoredDesignIdentity(project: string, id: string, cp: StoredDesignCheckpoint): void {
    requireDesign(cp.project === project && cp.reviewId === id, 'foreign_checkpoint', 'Checkpoint identity does not match request');
    const prefix = qualifiedDesignProjection(cp);
    if (prefix)
        validateDesignCheckpointIdentity(project, id, prefix, cp.schemaVersion === 2 ? cp.attempts.filter(isDesignAdmission).map(a => a.number) : []);
    if (cp.schemaVersion === 2)
        for (const attempt of cp.attempts)
            if (isDesignAdmission(attempt)) {
                requireDesign(attempt.progress.checkpointPath === designCheckpointPath(project, id), 'foreign_checkpoint', 'Progress names another checkpoint');
                // The requested file is not resolved or treated as a verified subject yet.
                requireDesign(!attempt.submitted.artifactPath?.includes('\0'), 'invalid_checkpoint', 'Invalid requested artifact path');
            }
}
