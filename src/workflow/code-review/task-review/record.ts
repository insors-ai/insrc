/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { reviewUnavailable } from '../../review-unavailable.js';
import { Type } from '@sinclair/typebox';
import { isDeepStrictEqual } from 'node:util';
import { decodeReview, StoredPacketSchema, requireReview, TaskResultSchema, TaskOriginSchema, CodeAdmissionAttemptSchema,QualifiedAttemptSchema } from './contracts.js';
import type { CodeAdmissionAttempt } from './contracts.js';
import { withoutReviewResourceGuard } from '../../review/resource-audit.js';
import { contentHash } from '../../artifact-core/lifecycle.js';
import type { CompletedReviewSummary, TaskBasedCodeReviewRecord, TaskReviewResult, ReviewAttempt } from './contracts.js';
import { validateSavedAttribution } from './attribution-binding.js';
import { validateFailureDiagnostics } from './diagnostics.js';
import { aggregateTaskStatus, validateTaskResult, validateResultOrigins } from './results.js';

import { FinalScopeSnapshotSchema } from './final-scope-contracts.js';
import { validateFinalScope } from './final-scope-history.js';

const text = Type.String({ minLength: 1, maxLength: 65536 });
const status = TaskResultSchema.properties.status;
export const SummarySchema = Type.Object({ reviewId: text, attempt: Type.Integer({ minimum: 1 }), storyId: text, taskId: Type.Optional(text), reviewer: Type.Union([Type.Literal('daemon'), Type.Literal('controller')]), status,
 scope: Type.Object({...Type.Pick(StoredPacketSchema, ['storyId', 'taskId', 'documents', 'reviewSet', 'reviewRevision']).properties, finalScope:Type.Optional(FinalScopeSnapshotSchema)},{additionalProperties:false}), tasks: Type.Array(TaskResultSchema, { maxItems: 10000 }), failedAttempt:Type.Optional(QualifiedAttemptSchema), summary: text, completedAt: text,
 finalScopeIdentity:Type.Optional(Type.String({pattern:'^[a-f0-9]{64}$'})), attributionIdentity:Type.Optional(Type.String({pattern:'^[a-f0-9]{64}$'})), taskScopeIdentities:Type.Optional(Type.Array(Type.Object({taskId:text,identity:Type.String({pattern:'^[a-f0-9]{64}$'})},{additionalProperties:false}),{maxItems:10000})),
 origins: Type.Optional(Type.Array(TaskOriginSchema, { maxItems:10000 })), reassessmentSummary: Type.Optional(text),
 buildFingerprint: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })) }, { additionalProperties: false });
export const CodeAdmissionHistorySchema = Type.Object({ reviewId: text, attempt: CodeAdmissionAttemptSchema }, { additionalProperties: false });
export const TaskBodySchema = Type.Object({ kind: Type.Literal('code-review'), format: Type.Literal('task-based'), storyId: text, status,
 reviews: Type.Array(SummarySchema, { maxItems: 10000 }),
 admissionFailures: Type.Optional(Type.Array(CodeAdmissionHistorySchema, { minItems: 1, maxItems: 10000 })),
}, { additionalProperties: false });
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
 const latest=latestReviewSummaries(reviews);return latest.some(r=>r.failedAttempt)?'failed':aggregateTaskStatus(latest.flatMap(review=>review.tasks));
}
export function bodyStatus(reviews: readonly CompletedReviewSummary[], failures: TaskReviewBody['admissionFailures']): TaskReviewResult['status'] {
 if (!reviews.length || failures?.some(f => !reviews.some(r => r.reviewId === f.reviewId && r.attempt > f.attempt.header.attempt))) return 'failed';
 return latestReviewStatus(reviews);
}
export function hasPreservedReviewFailures(body:TaskReviewBody):boolean{return!!body.admissionFailures||body.reviews.some(r=>r.failedAttempt);}
export function codeReviewPreservationDigest(body: TaskReviewBody): string {
 return contentHash('code-review-preservation-v1',{body:{...body,reviews:body.reviews.map(r=>r.failedAttempt?{...r,failedAttempt:withoutReviewResourceGuard(r.failedAttempt)}:r),...(body.admissionFailures?{admissionFailures:body.admissionFailures.map(f=>({...f,attempt:withoutReviewResourceGuard(f.attempt)}))}:{})},citations:[]});
}
/** Separate task-body validation: no legacy dimensions are synthesized. */
export function validateTaskBody(input: unknown): TaskReviewBody {
 const body = decodeReview(TaskBodySchema, input);
 requireReview(body.reviews.length || body.admissionFailures?.length, 'reviews', 'Review history cannot be empty');
 const keys = new Set<string>();
 for (const failure of body.admissionFailures ?? []) {
  const a = failure.attempt, key = `${failure.reviewId}/${a.header.attempt}`;
  requireReview(!keys.has(key), 'attempt', 'Duplicate admission failure'); keys.add(key);
  requireReview(['failed','interrupted'].includes(a.header.status) && a.header.completedAt && Number.isFinite(Date.parse(a.header.completedAt)) && (a.header.status !== 'failed' || a.error), 'admission', 'Only terminal technical admissions can be published');
  requireReview(a.submitted.storyId.replace(/^STORY-[a-f0-9]{16}-/, '') === body.storyId, 'scope', 'Foreign admission failure');
 }
 for (const review of body.reviews) {
  const key = `${review.reviewId}/${review.attempt}`;
  requireReview(!keys.has(key), 'reviews', 'Duplicate review-id/attempt'); keys.add(key);
  requireReview(review.storyId === body.storyId && review.scope.storyId.replace(/^STORY-[a-f0-9]{16}-/, '') === body.storyId && review.taskId === review.scope.taskId, 'scope', 'Review scope belongs to another story/task');
  requireReview(Number.isFinite(Date.parse(review.completedAt)), 'completedAt', 'Expected a completion timestamp');
  if(review.failedAttempt){
   const raw=review.failedAttempt,response=raw['review-response'],packet=raw.submitted;
   validateSavedAttribution(raw);validateFailureDiagnostics(raw);
   requireReview(raw.header.status==='failed'&&response.crPublication==='pending'&&raw.header.completedAt===review.completedAt&&raw.header.reviewer===review.reviewer&&raw.header.attempt===review.attempt&&review.status==='failed','failure','Only unchanged terminal failed execution can be retained');
   requireReview(isDeepStrictEqual(review.tasks,response.tasks)&&isDeepStrictEqual(review.origins,response.origins)&&review.summary===(response.error??response.summary),'failure','Retained failure feedback changed');
   const scope={...(packet.reviewRevision?{reviewRevision:packet.reviewRevision}:{}),storyId:packet.storyId,...(packet.taskId?{taskId:packet.taskId}:{}),documents:packet.documents,reviewSet:packet.reviewSet};
   requireReview(isDeepStrictEqual(review.scope,scope)&&review.finalScopeIdentity===undefined&&review.attributionIdentity===undefined&&review.taskScopeIdentities===undefined&&review.buildFingerprint===undefined,'failure','Failed execution cannot claim completed scope or approval authority');
   requireReview(new Set(response.tasks.map(t=>t.taskId)).size===response.tasks.length&&response.tasks.every(t=>raw.header.selectedTaskIds.includes(t.taskId)),'failure','Foreign retained task feedback');
   continue;
  }
  requireReview(review.tasks.length>0,'tasks','A completed assessment must contain task feedback');
  requireReview(new Set(review.tasks.map(task=>task.taskId)).size === review.tasks.length && (!review.taskId || review.tasks.length === 1 && review.tasks[0]!.taskId === review.taskId), 'tasks', 'Duplicate or foreign task');
  const changes = review.scope.reviewSet.flatMap(pointer => pointer.files.map(file => ({ path:file.path, previousPath:file.previousPath ?? file.path, segments:file.segments })));
  const final=validateFinalScope(review);
  for (const task of review.tasks) {
   const indexes=final?.tasks.find(t=>t.taskId===task.taskId)?.changeIndexes??[];
   validateTaskResult(task,{taskId:task.taskId,changes:final?final.entries.filter(e=>indexes.includes(e.originChangeIndex)):changes,evidenceReferences:resultReferences(task)});
  }
  requireReview(review.status === aggregateTaskStatus(review.tasks), 'status', 'Summary disagrees with task outcomes');
 }
 for (const id of new Set(body.reviews.map(review => review.reviewId))) validateResultOrigins(body.reviews.filter(review => review.reviewId === id));
 for(const review of body.reviews)for(const row of review.scope.finalScope?.tasks??[])if(row.decision.action==='reuse'){
  const sourceAttempt=row.decision.sourceAttempt;
  const source=body.reviews.find(r=>r.reviewId===review.reviewId&&r.attempt===sourceAttempt);
  requireReview(source?.reviewer===review.reviewer&&(source.scope.finalScope?.attributionState??source.failedAttempt?.header.attributionState)==='accepted'&&(source.taskScopeIdentities??source.failedAttempt?.header.taskScopeIdentities)?.find(t=>t.taskId===row.taskId)?.identity===row.identity,'origins','Reuse source lacks matching accepted final task identity');
 }

 requireReview(body.status === bodyStatus(body.reviews, body.admissionFailures), 'status', 'CR status disagrees with latest attempt outcomes');
 return body;
}
export function mergeTaskSummary(current: unknown, summaryInput: CompletedReviewSummary): TaskReviewBody {
 const summary = decodeReview(SummarySchema, summaryInput);
 let reviews: readonly CompletedReviewSummary[] = [];
 let admissionFailures: TaskReviewBody['admissionFailures'];
 if (current !== undefined) {
  requireReview(current && typeof current === 'object', 'CR', 'Unreadable prior CR body');
  const prior = current as Record<string, unknown>;
  // Removed review formats cannot be migrated through current task publication.
  if (prior['format'] === 'task-based') { const body = validateTaskBody(prior); reviews = body.reviews; admissionFailures = body.admissionFailures; }
  else reviewUnavailable();
 }
 const existing = reviews.find(review => review.reviewId === summary.reviewId && review.attempt === summary.attempt);
 if (existing) requireReview(isDeepStrictEqual(existing, summary), 'attempt', 'Conflicting publication for an already saved attempt');
 else reviews = [...reviews, summary];
 return validateTaskBody({ kind:'code-review', format:'task-based', storyId:summary.storyId, status:bodyStatus(reviews, admissionFailures), reviews, ...(admissionFailures ? { admissionFailures } : {}) });
}
/** Technical history is separate from task assessments and cannot pass a CR. */
export function mergeCodeAdmissionFailure(current: unknown, reviewId: string, attempt: CodeAdmissionAttempt): TaskReviewBody {
 const entry = decodeReview(CodeAdmissionHistorySchema, { reviewId, attempt });
 const prior = current === undefined ? undefined : validateTaskBody(current);
 const failures = [...(prior?.admissionFailures ?? [])];
 const existing = failures.find(f => f.reviewId === reviewId && f.attempt.header.attempt === attempt.header.attempt);
 if (existing) {
  requireReview(prior && codeReviewPreservationDigest(prior) === codeReviewPreservationDigest({ ...prior, admissionFailures: failures.map(f => f === existing ? entry : f) }), 'attempt', 'Conflicting technical admission publication');
 }
 else failures.push(entry);
 const reviews = prior?.reviews ?? [], storyId = attempt.submitted.storyId.replace(/^STORY-[a-f0-9]{16}-/, '');
 return validateTaskBody({ kind: 'code-review', format: 'task-based', storyId, reviews, admissionFailures: failures, status: bodyStatus(reviews, failures) });
}
export function renderTaskReview(bodyInput: unknown): string {
 const body = validateTaskBody(bodyInput);
 const lines = [`# Code review: ${body.storyId}`, '', `Status: **${body.status}** · task-based schema version ${hasPreservedReviewFailures(body) ? 3 : 2}`, ''];
 for (const { reviewId, attempt } of body.admissionFailures ?? []) lines.push(`## ${reviewId} — attempt ${attempt.header.attempt}: admission ${attempt.header.status}`, '', `Technical admission only; scope was not verified and no task assessment was performed. ${attempt.error ? `${attempt.error.code} (${attempt.error.field}): ${attempt.error.summary}` : 'Admission interrupted.'}`, '');
 for (const review of body.reviews) {
  if(review.failedAttempt)lines.push('Qualified execution failed; its original input and feedback are retained without completed-assessment signoff.','');
  lines.push(`## ${review.reviewId} — attempt ${review.attempt}`, '', `Scope: ${review.taskId ? `task ${review.taskId}` : 'whole story'} · reviewer: ${review.reviewer} · ${review.completedAt}`, '', review.summary, '', '### Submitted scope', '');
  for (const pointer of review.scope.reviewSet) for (const file of pointer.files) lines.push(`- \`${pointer.commit}:${file.path}\` — ${JSON.stringify(file.segments)}`);
  if(review.scope.finalScope){
   const final=review.scope.finalScope;
   lines.push('',`### Verified final scope: ${final.revision}`,'',`Projection: ${final.identity} · attribution: ${final.attributionState}`,'');
   for(const e of final.entries)lines.push(`- \`${e.path}\` (${e.blobOid??'absent'}) — ${e.findingScope}: ${JSON.stringify(e.segments)}`);
   for(const row of final.tasks)lines.push(`- Task ${row.taskId}: ${row.decision.action}; changes ${row.changeIndexes.join(', ')}; identity ${row.identity}`);
   if(final.attributionState==='unmapped_failure')lines.push('',`Attribution failure (${final.attributionFailure.code}): ${final.attributionFailure.summary}`);
  }
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
 const base=`${tasks.length} selected task assessment(s): ${aggregateTaskStatus(tasks)}.${attempt.header.attributionFailure?` Attribution failure (${attempt.header.attributionFailure.code}): ${attempt.header.attributionFailure.summary}`:''}`;
 const diagnostics=attempt['review-response'].failureDiagnostics;
 if(!diagnostics?.length)return base;
 const pointed=diagnostics.map(entry=>({phase:entry.phase,...(entry.taskId?{taskId:entry.taskId}:{}),provider:entry.diagnostic.provider,resolved:entry.resolved===true,
  errors:entry.diagnostic.issues.map(({code,field,correction,occurrences})=>({code,field,correction,occurrences})),
  ...(entry.diagnostic.terminal?{terminal:{reason:entry.diagnostic.terminal.reason,...(entry.diagnostic.terminal.exitCode!==undefined?{exitCode:entry.diagnostic.terminal.exitCode}:{})}}:{})}));
 return `${base}\nNative output diagnostics: ${JSON.stringify(pointed)}`;
}
