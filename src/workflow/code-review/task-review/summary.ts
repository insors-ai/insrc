/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { CompletedReviewSummary, ReviewAttempt } from './contracts.js';
import type { PreparedReviewPacket } from './packet.js';
import { captureFinalScope } from './final-scope-history.js';
import { aggregateTaskStatus } from './results.js';
import { taskAttemptSummary } from './record.js';
/** Shared exact permanent summary construction for publication and capacity qualification. */
export function completedSummary(prepared:PreparedReviewPacket,attempt:ReviewAttempt,reviewId:string):CompletedReviewSummary {
 const finalScope=prepared.packet.reviewRevision?captureFinalScope(prepared,attempt):undefined;
 const storyId=prepared.packet.storyId.replace(/^STORY-[a-f0-9]{16}-/,'');
 const summary:CompletedReviewSummary={ ...(attempt['review-response'].origins ? { origins:attempt['review-response'].origins } : {}), ...(attempt.header.reassessmentSummary ? { reassessmentSummary:attempt.header.reassessmentSummary } : {}), reviewId,attempt:attempt.header.attempt,storyId,...(prepared.packet.taskId?{taskId:prepared.packet.taskId}:{}),reviewer:attempt.header.reviewer,status:aggregateTaskStatus(attempt['review-response'].tasks),...(finalScope?{finalScopeIdentity:attempt.header.finalScopeIdentity!,attributionIdentity:attempt.header.attributionIdentity!,...(attempt.header.taskScopeIdentities?{taskScopeIdentities:attempt.header.taskScopeIdentities}:{})}:{}),scope:{...(finalScope?{reviewRevision:prepared.packet.reviewRevision!,finalScope}:{}),storyId:prepared.packet.storyId,...(prepared.packet.taskId?{taskId:prepared.packet.taskId}:{}),documents:prepared.packet.documents,reviewSet:prepared.packet.reviewSet},tasks:attempt['review-response'].tasks,summary:taskAttemptSummary(attempt),completedAt:attempt.header.completedAt!,...(attempt.header.buildFingerprint?{buildFingerprint:attempt.header.buildFingerprint}:{}) };
 return summary;
}
