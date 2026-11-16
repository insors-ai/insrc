/** Read-only historical review compatibility. No live review execution. */
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual } from 'node:util';
import { decodeReview, requireReview, TaskResultSchema } from "./contracts.js";
import type { TaskReviewResult, TaskResultOrigin, ReviewerParty } from "./contracts.js";
export interface TaskResultScope {
    readonly taskId: string;
    readonly changes: readonly {
        readonly path: string;
        readonly previousPath?: string | undefined;
        readonly findingScope?: 'selected' | 'none' | undefined;
        readonly segments: readonly {
            readonly before?: readonly [
                number,
                number
            ] | undefined;
            readonly after?: readonly [
                number,
                number
            ] | undefined;
            readonly deletionAt?: number | undefined;
        }[];
    }[];
    /** Resolved source/test/document references supplied by the host, including any permitted extra context. */
    readonly evidenceReferences: readonly string[];
}
/** Structural and semantic checks are shared by both actual reviewer parties. */
export function validateTaskResult(input: unknown, scope: TaskResultScope): TaskReviewResult {
    const result = decodeReview(TaskResultSchema, input);
    requireReview(result.taskId === scope.taskId, 'taskId', 'Result is not for the assigned task');
    const evidence = new Set(scope.evidenceReferences);
    for (const reference of [...result.inspectedReferences, ...result.testCoverage.evidenceReferences, ...result.findings.flatMap(f => f.evidenceReferences), ...result.executedTests.flatMap(t => t.evidenceReferences)]) {
        requireReview(evidence.has(reference), 'evidenceReferences', 'Reference is not resolved in this task context');
    }
    for (const finding of result.findings) {
        const location = /^(.*):(\d+)(?:-(\d+))?$/.exec(finding.location);
        const path = location?.[1] ?? finding.location;
        const start = Number(location?.[2]), end = Number(location?.[3] ?? location?.[2]);
        requireReview(scope.changes.some(c => {
            if (c.findingScope === 'none')
                return false;
            if (c.findingScope === 'selected' && path !== c.path)
                return false;
            if (path !== c.path && !(path === c.previousPath && (!c.segments.length || c.segments.some(s => s.before))))
                return false;
            if (!c.segments.length)
                return c.findingScope === undefined && !location;
            return location && Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start && c.segments.some(s => [s.before, s.after].some(r => r && start >= r[0] && end <= r[1]) || (s.deletionAt !== undefined && start === Math.max(1, s.deletionAt) && end === start));
        }), 'location', 'Finding is outside the submitted changed segments');
    }
    const blocking = result.findings.some(f => f.severity === 'HIGH' || f.severity === 'MED');
    if (result.status === 'passed' || result.status === 'changes_requested') {
        requireReview(result.inspectedReferences.length > 0, 'inspectedReferences', 'A completed assessment needs source evidence');
        requireReview(result.limitations.length === 0, 'limitations', 'Required unresolved review evidence must remain incomplete');
        requireReview(result.testCoverage.assessment === 'verified' && result.testCoverage.evidenceReferences.length > 0, 'testCoverage', 'Unverified coverage review cannot establish a completed assessment');
        requireReview((result.status === 'changes_requested') === blocking, 'status', 'Status must match demonstrated HIGH/MED findings');
    }
    requireReview(result.status !== 'failed' || Boolean(result.error), 'error', 'Failed execution needs an actionable error');
    requireReview(result.status !== 'incomplete' || result.limitations.length > 0, 'limitations', 'Incomplete assessment must explain missing verification');
    return result;
}
export function aggregateTaskStatus(results: readonly TaskReviewResult[]): TaskReviewResult['status'] {
    requireReview(results.length > 0, 'tasks', 'An empty result set cannot pass');
    for (const status of ['failed', 'incomplete', 'changes_requested', 'passed'] as const)
        if (results.some(r => r.status === status))
            return status;
    throw new Error('Unreachable task status');
}
/** Source attempts are local to one review history. Strictly decreasing ordinals also rule out cycles. */
interface ResultOriginHistoryEntry {
    readonly attempt: number;
    readonly reviewer: ReviewerParty;
    readonly tasks: readonly TaskReviewResult[];
    readonly origins?: readonly TaskResultOrigin[] | undefined;
}
/** A re-iterable view avoids copying a whole historical feedback inventory. */
export function validateResultOrigins(history: Iterable<ResultOriginHistoryEntry>): void {
    for (const entry of history) {
        const seen = new Set<string>();
        for (const origin of entry.origins ?? []) {
            requireReview(!seen.has(origin.taskId), 'origins', 'Duplicate task origin');
            seen.add(origin.taskId);
            requireReview(origin.sourceAttempt < entry.attempt, 'origins', 'Origin must reference an earlier attempt');
            let source: ResultOriginHistoryEntry | undefined;
            for (const candidate of history)
                if (candidate.attempt === origin.sourceAttempt) {
                    source = candidate;
                    break;
                }
            const result = entry.tasks.find(task => task.taskId === origin.taskId), prior = source?.tasks.find(task => task.taskId === origin.taskId);
            requireReview(source && source.reviewer === entry.reviewer && result && prior && isDeepStrictEqual(result, prior), 'origins', 'Origin is missing, foreign-party or changes the saved result');
        }
    }
}
