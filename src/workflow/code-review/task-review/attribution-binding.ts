/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { decodeReview, requireReview } from './contracts.js';
import type { ReviewAttempt } from './contracts.js';
import { AcceptedTaskAttributionSchema, AcceptedDecisionSchema } from './final-scope-contracts.js';
import type { AcceptedTaskAttribution } from './final-scope-contracts.js';
import { deriveTaskAssignments } from './packet.js';
import type { PreparedReviewPacket, TaskAssignment } from './packet.js';
import type { AdmittedReview } from './execution.js';

function canonical(value: unknown): string {
 if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
 return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export function attributionIdentity(state: 'accepted' | 'unmapped_failure', finalScopeIdentity: string, selectedTaskIds: readonly string[], testCount: number, rows: readonly (AcceptedTaskAttribution & { identity: string })[]): string {
 return digest({ format: 'final-attribution-v1', state, finalScopeIdentity, selectedTaskIds, testCount, rows });
}
export function taskFinalIdentity(prepared: PreparedReviewPacket, assignment: TaskAssignment): string {
 requireReview(prepared.projection && prepared.finalTestBlobs?.length === prepared.packet.tests.length, 'attribution', 'Missing final task source identities');
 const task = prepared.tasks.find(t => t.id === assignment.taskId)!;
 return digest({ format: 'final-task-v1', taskId: task.id, title: task.title, summary: task.summary, acceptanceChecks: assignment.acceptanceChecks,
  changes: assignment.changes.map(c => { requireReview('origin' in c, 'attribution', 'Historical scope cannot authorize pinned reuse'); return { path: c.path, blobOid: c.after?.oid ?? null, findingScope: c.findingScope, segments: c.segments }; }),
  documents: Object.entries(prepared.packet.documents).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([role, ref]) => ({ role, ...ref, contentIdentity: digest(prepared.documents[role as keyof typeof prepared.documents]) })),
  tests: assignment.tests.map(test => { const index = prepared.packet.tests.indexOf(test); requireReview(index >= 0, 'attribution', 'Unknown assigned test'); return { detail: test, blobOid: prepared.finalTestBlobs![index] }; }),
 });
}
export function validateSavedAttribution(attempt: ReviewAttempt): void {
 const h = attempt.header;
 if (!attempt.submitted.reviewRevision) {
  requireReview(h.finalScopeIdentity === undefined && h.attributionState === undefined && h.acceptedAttribution === undefined && h.taskScopeIdentities === undefined && h.attributionIdentity === undefined && h.attributionFailure === undefined, 'attribution', 'Unpinned history cannot carry final-scope authority'); return;
 }
 requireReview(h.finalScopeIdentity && h.attributionState, 'attribution', 'Pinned attempt requires final-scope attribution phase');
 if (h.attributionState !== 'accepted') {
  requireReview(h.acceptedAttribution === undefined && h.taskScopeIdentities === undefined, 'attribution', 'Unmapped phase cannot carry accepted task bindings');
  if (h.attributionState === 'pending') requireReview(h.attributionIdentity === undefined && h.attributionFailure === undefined, 'attribution', 'Pending attribution has terminal bindings');
  else requireReview(h.attributionFailure && h.attributionIdentity === attributionIdentity('unmapped_failure', h.finalScopeIdentity, h.selectedTaskIds, attempt.submitted.tests.length, []), 'attribution', 'Invalid unmapped failure binding');
  return;
 }
 requireReview(h.acceptedAttribution && h.taskScopeIdentities && h.attributionIdentity && h.attributionFailure === undefined, 'attribution', 'Incomplete accepted attribution');
 const rows = h.acceptedAttribution, bindings = h.taskScopeIdentities, files = attempt.submitted.reviewSet.reduce((n, p) => n + p.files.length, 0), tests = attempt.submitted.tests.length;
 requireReview(rows.length === h.selectedTaskIds.length && bindings.length === rows.length && new Set(rows.map(r => r.taskId)).size === rows.length && new Set(bindings.map(r => r.taskId)).size === bindings.length, 'attribution', 'Duplicate or missing accepted tasks');
 const changes = new Set<number>(), coveredTests = new Set<number>();
 const bound = rows.map(row => {
  decodeReview(AcceptedTaskAttributionSchema, row);
  requireReview(h.selectedTaskIds.includes(row.taskId), 'attribution', 'Foreign accepted task');
  requireReview(row.changeIndexes.every(i => i < files) && row.testIndexes.every(i => i < tests), 'attribution', 'Accepted index exceeds pinned input');
  requireReview(attempt.header.attempt === 1 ? row.decision.action === 'initial' : row.decision.action !== 'initial', 'attribution', 'Wrong attempt decision');
  if (row.decision.action === 'reuse') requireReview(row.decision.sourceAttempt < h.attempt, 'attribution', 'Reuse source must be earlier');
  for (const i of row.changeIndexes) changes.add(i); for (const i of row.testIndexes) coveredTests.add(i);
  const binding = bindings.find(b => b.taskId === row.taskId); requireReview(binding, 'attribution', 'Missing task identity');
  return { ...row, identity: binding.identity };
 });
 requireReview(changes.size === files && coveredTests.size === tests, 'attribution', 'Accepted attribution omits submitted inputs');
 requireReview(h.attributionIdentity === attributionIdentity('accepted', h.finalScopeIdentity, h.selectedTaskIds, tests, bound), 'attribution', 'Accepted mapping/decision binding mismatch');
}
export function assignmentsToRows(review: AdmittedReview, assignments: readonly TaskAssignment[]): readonly AcceptedTaskAttribution[] {
 return assignments.map(a => { requireReview(review.attempt.header.attempt === 1 || a.reassessment, 'attribution', 'Missing reassessment decision'); return { taskId: a.taskId, changeIndexes: a.changes.map(c => { const i = review.prepared.changes.indexOf(c); requireReview(i >= 0, 'attribution', 'Foreign accepted source'); return i; }),
  testIndexes: a.tests.map(t => { const i = review.prepared.packet.tests.indexOf(t); requireReview(i >= 0, 'attribution', 'Foreign accepted test'); return i; }),
  decision: review.attempt.header.attempt === 1 ? { action: 'initial' as const } : decodeReview(AcceptedDecisionSchema, a.reassessment),
 }; });
}
export function requireReuseIdentity(review: AdmittedReview, assignment: TaskAssignment): void {
 const decision = assignment.reassessment;
 requireReview(decision?.action === 'reuse' && decision.sourceAttempt !== undefined && decision.sourceAttempt < review.attempt.header.attempt, 'origins', 'Reuse requires an earlier accepted source');
 const source = review.checkpoint.attempts.find(e => e.header.attempt === decision.sourceAttempt);
 requireReview(source?.submitted.reviewRevision && source.header.reviewer === review.attempt.header.reviewer && source.header.attributionState === 'accepted' && source['review-response'].tasks.some(t => t.taskId === assignment.taskId), 'origins', 'Missing or foreign-party accepted source');
 validateSavedAttribution(source);
 requireReview(source.header.taskScopeIdentities?.find(b => b.taskId === assignment.taskId)?.identity === taskFinalIdentity(review.prepared, assignment), 'origins', 'Relevant task inputs changed; reassessment required');
}
/** Mutate one complete candidate; caller MUST await its save before ACK/dispatch. */
export async function bindTaskFinalIdentities(review: AdmittedReview, input: readonly AcceptedTaskAttribution[]): Promise<readonly TaskAssignment[]> {
 const rows = input.map(row => decodeReview(AcceptedTaskAttributionSchema, row));
 const assignments = deriveTaskAssignments(review.prepared, rows).map(a => {
  const decision = rows.find(r => r.taskId === a.taskId)!.decision;
  return decision.action === 'initial' ? a : { ...a, reassessment: { ...decision } };
 });
 const identities = assignments.map(a => ({ taskId: a.taskId, identity: taskFinalIdentity(review.prepared, a) }));
 const ordered = assignments.map(a => rows.find(r => r.taskId === a.taskId)!);
 const candidate = { finalScopeIdentity: review.prepared.projection!.identity, attributionState: 'accepted' as const, acceptedAttribution: ordered, taskScopeIdentities: identities,
  attributionIdentity: attributionIdentity('accepted', review.prepared.projection!.identity, review.attempt.header.selectedTaskIds, review.prepared.packet.tests.length, ordered.map(r => ({ ...r, identity: identities.find(b => b.taskId === r.taskId)!.identity }))) };
 if (review.attempt.header.attributionState === 'accepted') {
  for (const key of Object.keys(candidate) as (keyof typeof candidate)[]) requireReview(isDeepStrictEqual(review.attempt.header[key], candidate[key]), 'attribution', 'Accepted mapping cannot change within an attempt');
 } else requireReview(review.attempt.header.attributionState === 'pending', 'attribution', 'Attribution phase cannot accept a mapping');
 validateSavedAttribution({ ...review.attempt, header: { ...review.attempt.header, ...candidate } });
 for (const a of assignments) if (a.reassessment?.action === 'reuse') requireReuseIdentity(review, a);
 Object.assign(review.attempt.header, candidate);
 return assignments;
}
export async function restoreAcceptedAssignments(review: AdmittedReview): Promise<readonly TaskAssignment[] | undefined> {
 if (review.attempt.header.attributionState !== 'accepted') return undefined;
 validateSavedAttribution(review.attempt);
 return bindTaskFinalIdentities(review, review.attempt.header.acceptedAttribution!);
}
