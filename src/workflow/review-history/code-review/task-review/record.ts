/** Read-only historical review compatibility. No live review execution. */
import { Type } from '@sinclair/typebox';
import { isDeepStrictEqual } from 'node:util';
import { decodeReview, StoredPacketSchema, requireReview, TaskResultSchema, TaskOriginSchema, CodeAdmissionAttemptSchema, QualifiedAttemptSchema } from "./contracts.js";
import { withoutReviewResourceGuard } from "../../review/resource-audit.js";
import type { CompletedReviewSummary, TaskBasedCodeReviewRecord, TaskReviewResult } from "./contracts.js";
import { validateSavedAttribution } from "./attribution-binding.js";
import { validateFailureDiagnostics } from "./diagnostics.js";
import { aggregateTaskStatus, validateTaskResult, validateResultOrigins } from "./results.js";
import { FinalScopeSnapshotSchema } from "./final-scope-contracts.js";
import { validateFinalScope } from "./final-scope-history.js";
import { CodePreparationCheckpointSchema } from "../../review/preparation-checkpoint-contract.js";
import { PublicationProofSchema, validatePublicationProof } from "../../review/publication-proof.js";
const text = Type.String({ minLength: 1, maxLength: 65536 });
const status = TaskResultSchema.properties.status;
export const SummarySchema = Type.Object({ reviewId: text, attempt: Type.Integer({ minimum: 1 }), storyId: text, taskId: Type.Optional(text), reviewer: Type.Union([Type.Literal('daemon'), Type.Literal('controller')]), status,
    scope: Type.Object({ ...Type.Pick(StoredPacketSchema, ['storyId', 'taskId', 'documents', 'reviewSet', 'reviewRevision']).properties, finalScope: Type.Optional(FinalScopeSnapshotSchema) }, { additionalProperties: false }), tasks: Type.Array(TaskResultSchema, { maxItems: 10000 }), failedAttempt: Type.Optional(QualifiedAttemptSchema), summary: text, completedAt: text,
    finalScopeIdentity: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })), attributionIdentity: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })), taskScopeIdentities: Type.Optional(Type.Array(Type.Object({ taskId: text, identity: Type.String({ pattern: '^[a-f0-9]{64}$' }) }, { additionalProperties: false }), { maxItems: 10000 })),
    origins: Type.Optional(Type.Array(TaskOriginSchema, { maxItems: 10000 })), reassessmentSummary: Type.Optional(text),
    buildFingerprint: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })) }, { additionalProperties: false });
export const CodeAdmissionHistorySchema = Type.Object({ reviewId: text, attempt: CodeAdmissionAttemptSchema }, { additionalProperties: false });
export const TaskBodySchema = Type.Object({ kind: Type.Literal('code-review'), format: Type.Literal('task-based'), storyId: text, status,
    reviews: Type.Array(SummarySchema, { maxItems: 10000 }),
    admissionFailures: Type.Optional(Type.Array(CodeAdmissionHistorySchema, { minItems: 1, maxItems: 10000 })),
    preparationHistories: Type.Optional(Type.Array(Type.Object({ checkpoint: CodePreparationCheckpointSchema, proof: PublicationProofSchema,
        earlierProofs: Type.Optional(Type.Array(PublicationProofSchema, { minItems: 1, maxItems: 10000 })) }, { additionalProperties: false }), { minItems: 1, maxItems: 10000 })),
}, { additionalProperties: false });
export type TaskReviewBody = TaskBasedCodeReviewRecord['body'];
export function resultReferences(result: TaskReviewResult): string[] {
    return [...new Set([...result.inspectedReferences, ...result.testCoverage.evidenceReferences, ...result.findings.flatMap(f => f.evidenceReferences), ...result.executedTests.flatMap(t => t.evidenceReferences)])];
}
export function latestReviewSummaries(reviews: readonly CompletedReviewSummary[]): readonly CompletedReviewSummary[] {
    const latest = new Map<string, CompletedReviewSummary>();
    for (const review of reviews)
        if ((latest.get(review.reviewId)?.attempt ?? 0) < review.attempt)
            latest.set(review.reviewId, review);
    return [...latest.values()];
}
export function latestReviewStatus(reviews: readonly CompletedReviewSummary[]): TaskReviewResult['status'] {
    const latest = latestReviewSummaries(reviews);
    return latest.some(r => r.failedAttempt) ? 'failed' : aggregateTaskStatus(latest.flatMap(review => review.tasks));
}
export function bodyStatus(reviews: readonly CompletedReviewSummary[], failures: TaskReviewBody['admissionFailures']): TaskReviewResult['status'] {
    if (!reviews.length || failures?.some(f => !reviews.some(r => r.reviewId === f.reviewId && r.attempt > f.attempt.header.attempt)))
        return 'failed';
    return latestReviewStatus(reviews);
}
export function hasPreservedReviewFailures(body: TaskReviewBody): boolean { return !!body.admissionFailures || body.reviews.some(r => r.failedAttempt); }
export function taskBodyVersion(body: TaskReviewBody): 2 | 3 | 4 { return body.preparationHistories ? 4 : hasPreservedReviewFailures(body) ? 3 : 2; }
/** Separate task-body validation: no legacy dimensions are synthesized. */
export function validateTaskBody(input: unknown): TaskReviewBody {
    const body = decodeReview(TaskBodySchema, input);
    requireReview(body.reviews.length || body.admissionFailures?.length, 'reviews', 'Review history cannot be empty');
    const keys = new Set<string>();
    for (const failure of body.admissionFailures ?? []) {
        const a = failure.attempt, key = `${failure.reviewId}/${a.header.attempt}`;
        requireReview(!keys.has(key), 'attempt', 'Duplicate admission failure');
        keys.add(key);
        requireReview(['failed', 'interrupted'].includes(a.header.status) && a.header.completedAt && Number.isFinite(Date.parse(a.header.completedAt)) && (a.header.status !== 'failed' || a.error), 'admission', 'Only terminal technical admissions can be published');
        requireReview(a.submitted.storyId.replace(/^STORY-[a-f0-9]{16}-/, '') === body.storyId, 'scope', 'Foreign admission failure');
    }
    for (const review of body.reviews) {
        const key = `${review.reviewId}/${review.attempt}`;
        requireReview(!keys.has(key), 'reviews', 'Duplicate review-id/attempt');
        keys.add(key);
        requireReview(review.storyId === body.storyId && review.scope.storyId.replace(/^STORY-[a-f0-9]{16}-/, '') === body.storyId && review.taskId === review.scope.taskId, 'scope', 'Review scope belongs to another story/task');
        requireReview(Number.isFinite(Date.parse(review.completedAt)), 'completedAt', 'Expected a completion timestamp');
        if (review.failedAttempt) {
            const raw = review.failedAttempt, response = raw['review-response'], packet = raw.submitted;
            validateSavedAttribution(raw);
            validateFailureDiagnostics(raw);
            requireReview(raw.header.status === 'failed' && response.crPublication === 'pending' && raw.header.completedAt === review.completedAt && raw.header.reviewer === review.reviewer && raw.header.attempt === review.attempt && review.status === 'failed', 'failure', 'Only unchanged terminal failed execution can be retained');
            requireReview(isDeepStrictEqual(review.tasks, response.tasks) && isDeepStrictEqual(review.origins, response.origins) && review.summary === (response.error ?? response.summary), 'failure', 'Retained failure feedback changed');
            const scope = { ...(packet.reviewRevision ? { reviewRevision: packet.reviewRevision } : {}), storyId: packet.storyId, ...(packet.taskId ? { taskId: packet.taskId } : {}), documents: packet.documents, reviewSet: packet.reviewSet };
            requireReview(isDeepStrictEqual(review.scope, scope) && review.finalScopeIdentity === undefined && review.attributionIdentity === undefined && review.taskScopeIdentities === undefined && review.buildFingerprint === undefined, 'failure', 'Failed execution cannot claim completed scope or approval authority');
            requireReview(new Set(response.tasks.map(t => t.taskId)).size === response.tasks.length && response.tasks.every(t => raw.header.selectedTaskIds.includes(t.taskId)), 'failure', 'Foreign retained task feedback');
            continue;
        }
        requireReview(review.tasks.length > 0, 'tasks', 'A completed assessment must contain task feedback');
        requireReview(new Set(review.tasks.map(task => task.taskId)).size === review.tasks.length && (!review.taskId || review.tasks.length === 1 && review.tasks[0]!.taskId === review.taskId), 'tasks', 'Duplicate or foreign task');
        const changes = review.scope.reviewSet.flatMap(pointer => pointer.files.map(file => ({ path: file.path, previousPath: file.previousPath ?? file.path, segments: file.segments })));
        const final = validateFinalScope(review);
        for (const task of review.tasks) {
            const indexes = final?.tasks.find(t => t.taskId === task.taskId)?.changeIndexes ?? [];
            validateTaskResult(task, { taskId: task.taskId, changes: final ? final.entries.filter(e => indexes.includes(e.originChangeIndex)) : changes, evidenceReferences: resultReferences(task) });
        }
        requireReview(review.status === aggregateTaskStatus(review.tasks), 'status', 'Summary disagrees with task outcomes');
    }
    for (const id of new Set(body.reviews.map(review => review.reviewId)))
        validateResultOrigins(body.reviews.filter(review => review.reviewId === id));
    for (const review of body.reviews)
        for (const row of review.scope.finalScope?.tasks ?? [])
            if (row.decision.action === 'reuse') {
                const sourceAttempt = row.decision.sourceAttempt;
                const source = body.reviews.find(r => r.reviewId === review.reviewId && r.attempt === sourceAttempt);
                requireReview(source?.reviewer === review.reviewer && (source.scope.finalScope?.attributionState ?? source.failedAttempt?.header.attributionState) === 'accepted' && (source.taskScopeIdentities ?? source.failedAttempt?.header.taskScopeIdentities)?.find(t => t.taskId === row.taskId)?.identity === row.identity, 'origins', 'Reuse source lacks matching accepted final task identity');
            }
    requireReview(body.status === bodyStatus(body.reviews, body.admissionFailures), 'status', 'CR status disagrees with latest attempt outcomes');
    const histories = new Set<string>();
    for (const archive of body.preparationHistories ?? []) {
        const cp = archive.checkpoint, key = { project: cp.project, family: 'code' as const, reviewId: cp.reviewId };
        requireReview(!histories.has(cp.reviewId), 'CR', 'Duplicate complete review history');
        histories.add(cp.reviewId);
        validatePublicationProof(archive.proof, cp, key);
        const latest = Math.max(...body.reviews.filter(r => r.reviewId === cp.reviewId).map(r => r.attempt), ...(body.admissionFailures ?? []).filter(f => f.reviewId === cp.reviewId).map(f => f.attempt.header.attempt));
        requireReview(cp.attempts.at(-1)!.header.attempt === latest, 'CR', 'Complete history omits the latest permanent attempt');
        const audits = new Set<number>([archive.proof.runtime.attempt]);
        for (const proof of archive.earlierProofs ?? []) {
            const attempt = proof.runtime.attempt;
            requireReview(attempt < archive.proof.runtime.attempt && !audits.has(attempt), 'CR', 'Duplicate or future closed runtime audit');
            audits.add(attempt);
            validatePublicationProof(proof, { ...cp, attempts: cp.attempts.slice(0, attempt), runtime: { runtimeId: proof.runtime.runtimeId, inputDigest: proof.runtime.checkpointBinding.inputDigest },
                context: { generationId: proof.binding.generationId, manifestDigest: proof.manifestDigest, historyBindingDigest: proof.binding.bindingDigest } }, key);
        }
        requireReview(cp.storyId.replace(/^STORY-[a-f0-9]{16}-/, '') === body.storyId, 'CR', 'Foreign complete review history');
        for (const attempt of cp.attempts) {
            if (!('review-response' in attempt)) {
                requireReview(body.admissionFailures?.some(f => f.reviewId === cp.reviewId && isDeepStrictEqual(withoutReviewResourceGuard(f.attempt), attempt)), 'CR', 'Complete history admission was not preserved');
                continue;
            }
            const summary = body.reviews.find(r => r.reviewId === cp.reviewId && r.attempt === attempt.header.attempt);
            requireReview(summary && isDeepStrictEqual(summary.tasks, attempt['review-response'].tasks) && isDeepStrictEqual(summary.origins, attempt['review-response'].origins)
                && summary.reviewer === attempt.header.reviewer && summary.completedAt === attempt.header.completedAt
                && isDeepStrictEqual(summary.scope.reviewSet, attempt.submitted.reviewSet) && isDeepStrictEqual(summary.scope.documents, attempt.submitted.documents)
                && summary.scope.storyId === attempt.submitted.storyId && summary.scope.taskId === attempt.submitted.taskId
                && (summary.failedAttempt ? isDeepStrictEqual(withoutReviewResourceGuard(summary.failedAttempt), attempt)
                    : summary.finalScopeIdentity === attempt.header.finalScopeIdentity && summary.attributionIdentity === attempt.header.attributionIdentity
                        && isDeepStrictEqual(summary.taskScopeIdentities, attempt.header.taskScopeIdentities) && summary.buildFingerprint === attempt.header.buildFingerprint), 'CR', 'Complete input/feedback history disagrees with permanent assessment');
        }
    }
    return body;
}
