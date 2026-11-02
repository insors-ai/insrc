/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { reviewUnavailable } from '../../review-unavailable.js';
import { Type } from '@sinclair/typebox';
import { isDeepStrictEqual } from 'node:util';
import { decodeReview, StoredPacketSchema, requireReview, TaskResultSchema, TaskOriginSchema } from './contracts.js';
import type { CompletedReviewSummary, TaskBasedCodeReviewRecord, TaskReviewResult, ReviewAttempt } from './contracts.js';
import { aggregateTaskStatus, validateTaskResult, validateResultOrigins } from './results.js';

const text = Type.String({ minLength: 1, maxLength: 65536 });
const status = TaskResultSchema.properties.status;
export const SummarySchema = Type.Object({ reviewId: text, attempt: Type.Integer({ minimum: 1 }), storyId: text, taskId: Type.Optional(text), reviewer: Type.Union([Type.Literal('daemon'), Type.Literal('controller')]), status,
 scope: Type.Pick(StoredPacketSchema, ['storyId', 'taskId', 'documents', 'reviewSet']), tasks: Type.Array(TaskResultSchema, { minItems: 1, maxItems: 10000 }), summary: text, completedAt: text,
 origins: Type.Optional(Type.Array(TaskOriginSchema, { maxItems:10000 })), reassessmentSummary: Type.Optional(text),
 buildFingerprint: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })) }, { additionalProperties: false });
export const TaskBodySchema = Type.Object({ kind: Type.Literal('code-review'), format: Type.Literal('task-based'), storyId: text, status, reviews: Type.Array(SummarySchema, { minItems: 1, maxItems: 10000 }) }, { additionalProperties: false });
export type TaskReviewBody = TaskBasedCodeReviewRecord['body'];

export function resultReferences(result: TaskReviewResult): string[] {
 return [...new Set([...result.inspectedReferences, ...result.testCoverage.evidenceReferences, ...result.findings.flatMap(f=>f.evidenceReferences), ...result.executedTests.flatMap(t=>t.evidenceReferences)])];
}
export function latestReviewSummaries(reviews: readonly CompletedReviewSummary[]): readonly CompletedReviewSummary[] {
 const latest = new Map<string, CompletedReviewSummary>();
 for (const review of reviews) if ((latest.get(review.reviewId)?.attempt ?? 0) < review.attempt) latest.set(review.reviewId, review);
 return [...latest.values()];
}
export function latestReviewStatus(reviews: readonly CompletedReviewSummary[]): TaskReviewResult['status'] {
 return aggregateTaskStatus(latestReviewSummaries(reviews).flatMap(review=>review.tasks));
}
/** Separate task-body validation: no legacy dimensions are synthesized. */
export function validateTaskBody(input: unknown): TaskReviewBody {
 const body = decodeReview(TaskBodySchema, input);
 const keys = new Set<string>();
 for (const review of body.reviews) {
  const key = `${review.reviewId}/${review.attempt}`;
  requireReview(!keys.has(key), 'reviews', 'Duplicate review-id/attempt'); keys.add(key);
  requireReview(review.storyId === body.storyId && review.scope.storyId.replace(/^STORY-[a-f0-9]{16}-/, '') === body.storyId && review.taskId === review.scope.taskId, 'scope', 'Review scope belongs to another story/task');
  requireReview(Number.isFinite(Date.parse(review.completedAt)), 'completedAt', 'Expected a completion timestamp');
  requireReview(new Set(review.tasks.map(task=>task.taskId)).size === review.tasks.length && (!review.taskId || review.tasks.length === 1 && review.tasks[0]!.taskId === review.taskId), 'tasks', 'Duplicate or foreign task');
  const changes = review.scope.reviewSet.flatMap(pointer => pointer.files.map(file => ({ path:file.path, previousPath:file.previousPath ?? file.path, segments:file.segments })));
  for (const task of review.tasks) validateTaskResult(task, { taskId:task.taskId, changes, evidenceReferences:resultReferences(task) });
  requireReview(review.status === aggregateTaskStatus(review.tasks), 'status', 'Summary disagrees with task outcomes');
 }
 for (const id of new Set(body.reviews.map(review => review.reviewId))) validateResultOrigins(body.reviews.filter(review => review.reviewId === id));
 requireReview(body.status === latestReviewStatus(body.reviews), 'status', 'CR status disagrees with latest attempt outcomes');
 return body;
}
export function mergeTaskSummary(current: unknown, summaryInput: CompletedReviewSummary): TaskReviewBody {
 const summary = decodeReview(SummarySchema, summaryInput);
 let reviews: readonly CompletedReviewSummary[] = [];
 if (current !== undefined) {
  requireReview(current && typeof current === 'object', 'CR', 'Unreadable prior CR body');
  const prior = current as Record<string, unknown>;
  // Removed review formats cannot be migrated through current task publication.
  if (prior['format'] === 'task-based') reviews = validateTaskBody(prior).reviews;
  else reviewUnavailable();
 }
 const existing = reviews.find(review => review.reviewId === summary.reviewId && review.attempt === summary.attempt);
 if (existing) requireReview(isDeepStrictEqual(existing, summary), 'attempt', 'Conflicting publication for an already saved attempt');
 else reviews = [...reviews, summary];
 return validateTaskBody({ kind:'code-review', format:'task-based', storyId:summary.storyId, status:latestReviewStatus(reviews), reviews });
}
export function renderTaskReview(bodyInput: unknown): string {
 const body = validateTaskBody(bodyInput);
 const lines = [`# Code review: ${body.storyId}`, '', `Status: **${body.status}** · task-based schema version 2`, ''];
 for (const review of body.reviews) {
  lines.push(`## ${review.reviewId} — attempt ${review.attempt}`, '', `Scope: ${review.taskId ? `task ${review.taskId}` : 'whole story'} · reviewer: ${review.reviewer} · ${review.completedAt}`, '', review.summary, '', '### Submitted scope', '');
  for (const pointer of review.scope.reviewSet) for (const file of pointer.files) lines.push(`- \`${pointer.commit}:${file.path}\` — ${JSON.stringify(file.segments)}`);
  if (review.reassessmentSummary) lines.push('', review.reassessmentSummary);
  for (const task of review.tasks) {
   const origin = review.origins?.find(item => item.taskId === task.taskId);
   if (origin) {
    let source=body.reviews.find(candidate=>candidate.reviewId===review.reviewId&&candidate.attempt===origin.sourceAttempt)!;
    let earlier=source.origins?.find(item=>item.taskId===task.taskId);
    while(earlier){source=body.reviews.find(candidate=>candidate.reviewId===review.reviewId&&candidate.attempt===earlier!.sourceAttempt)!;earlier=source.origins?.find(item=>item.taskId===task.taskId);}
    lines.push('', `Reused task ${task.taskId} feedback from attempt ${origin.sourceAttempt} (${source.reviewer}); original assessment attempt ${source.attempt}; not a fresh assessment. ${origin.reason}`);
   }
   lines.push('', `### ${task.taskId}: ${task.status}`, '', task.summary, '', `Coverage: **${task.testCoverage.assessment}** — ${task.testCoverage.explanation}`, '');
   for (const finding of task.findings) lines.push(`- **${finding.severity}** \`${finding.location}\`: ${finding.message}`, `  ${finding.rationale}`, `  Evidence: ${finding.evidenceReferences.map(ref=>`\`${ref}\``).join(', ')}`);
   if (task.limitations.length) lines.push('', 'Review limitations (blocking):', '', ...task.limitations.map(note=>`- ${note}`));
   if (task.advice.length) lines.push('', 'Optional verification and advice (nonblocking):', '', ...task.advice.map(note=>`- ${note}`));
   lines.push('', 'Inspected references:', '', ...task.inspectedReferences.map(ref=>`- \`${ref}\``));
   for (const test of task.executedTests) lines.push('', `Test: \`${test.command}\` — ${test.result}`, test.executionDetails);
  }
 }
 return lines.join('\n')+'\n';
}

/** Permanent pointed failures only; previews and verbose native messages stay temporary. */
export function taskAttemptSummary(attempt: ReviewAttempt): string {
 const tasks=attempt['review-response'].tasks;
 const base=`${tasks.length} selected task assessment(s): ${aggregateTaskStatus(tasks)}.`;
 const diagnostics=attempt['review-response'].failureDiagnostics;
 if(!diagnostics?.length)return base;
 const pointed=diagnostics.map(entry=>({phase:entry.phase,...(entry.taskId?{taskId:entry.taskId}:{}),provider:entry.diagnostic.provider,resolved:entry.resolved===true,
  errors:entry.diagnostic.issues.map(({code,field,correction,occurrences})=>({code,field,correction,occurrences})),
  ...(entry.diagnostic.terminal?{terminal:{reason:entry.diagnostic.terminal.reason,...(entry.diagnostic.terminal.exitCode!==undefined?{exitCode:entry.diagnostic.terminal.exitCode}:{})}}:{})}));
 return `${base}\nNative output diagnostics: ${JSON.stringify(pointed)}`;
}
