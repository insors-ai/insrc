/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { CompletedReviewSummary, ReviewAttempt } from './contracts.js';
import type { PreparedReviewPacket } from './packet.js';
import { captureFinalScope } from './final-scope-history.js';
import { aggregateTaskStatus } from './results.js';
import { taskAttemptSummary } from './record.js';
import { withoutReviewResourceGuard } from '../../review/resource-audit.js';
/** Archive failed execution as it was saved. Publication must never finish,
 * renumber, clear an error or invent missing task assessments for it. */
export function failedAttemptSummary(attempt:ReviewAttempt,reviewId:string):CompletedReviewSummary {
 const raw=structuredClone(withoutReviewResourceGuard(attempt)),packet=raw.submitted;
 return{reviewId,attempt:raw.header.attempt,storyId:packet.storyId.replace(/^STORY-[a-f0-9]{16}-/,''),...(packet.taskId?{taskId:packet.taskId}:{}),reviewer:raw.header.reviewer,status:'failed',scope:{...(packet.reviewRevision?{reviewRevision:packet.reviewRevision}:{}),storyId:packet.storyId,...(packet.taskId?{taskId:packet.taskId}:{}),documents:packet.documents,reviewSet:packet.reviewSet},tasks:raw['review-response'].tasks,summary:raw['review-response'].error??raw['review-response'].summary,completedAt:raw.header.completedAt!,failedAttempt:raw,...(raw['review-response'].origins?{origins:raw['review-response'].origins}:{})};
}
/** Shared exact permanent summary construction for publication and capacity qualification. */
export function completedSummary(prepared:PreparedReviewPacket,attempt:ReviewAttempt,reviewId:string):CompletedReviewSummary {
 const finalScope=prepared.packet.reviewRevision?captureFinalScope(prepared,attempt):undefined;
 const storyId=prepared.packet.storyId.replace(/^STORY-[a-f0-9]{16}-/,'');
 const summary:CompletedReviewSummary={ ...(attempt['review-response'].origins ? { origins:attempt['review-response'].origins } : {}), ...(attempt.header.reassessmentSummary ? { reassessmentSummary:attempt.header.reassessmentSummary } : {}), reviewId,attempt:attempt.header.attempt,storyId,...(prepared.packet.taskId?{taskId:prepared.packet.taskId}:{}),reviewer:attempt.header.reviewer,status:aggregateTaskStatus(attempt['review-response'].tasks),...(finalScope?{finalScopeIdentity:attempt.header.finalScopeIdentity!,attributionIdentity:attempt.header.attributionIdentity!,...(attempt.header.taskScopeIdentities?{taskScopeIdentities:attempt.header.taskScopeIdentities}:{})}:{}),scope:{...(finalScope?{reviewRevision:prepared.packet.reviewRevision!,finalScope}:{}),storyId:prepared.packet.storyId,...(prepared.packet.taskId?{taskId:prepared.packet.taskId}:{}),documents:prepared.packet.documents,reviewSet:prepared.packet.reviewSet},tasks:attempt['review-response'].tasks,summary:taskAttemptSummary(attempt),completedAt:attempt.header.completedAt!,...(attempt.header.buildFingerprint?{buildFingerprint:attempt.header.buildFingerprint}:{}) };
 return summary;
}
