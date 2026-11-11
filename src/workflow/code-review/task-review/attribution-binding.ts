import { qualifyReviewCapacity } from './capacity.js';
import { diagnosticText } from '../../../shared/review-diagnostics.js';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { decodeReview, reviewJsonLimit, requireReview } from './contracts.js';
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
function taskFinalInput(prepared: PreparedReviewPacket, assignment: TaskAssignment) {
 requireReview(prepared.projection && prepared.finalTestBlobs?.length === prepared.packet.tests.length, 'attribution', 'Missing final task source identities');
 const task = prepared.tasks.find(t => t.id === assignment.taskId)!;
 return { format: 'final-task-v1', taskId: task.id, title: task.title, summary: task.summary, acceptanceChecks: assignment.acceptanceChecks,
  changes: assignment.changes.map(c => { requireReview('origin' in c, 'attribution', 'Historical scope cannot authorize pinned reuse'); return { path: c.path, blobOid: c.after?.oid ?? null, findingScope: c.findingScope, segments: c.segments }; }),
  documents: Object.entries(prepared.packet.documents).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([role, ref]) => ({ role, ...ref, contentIdentity: digest(prepared.documents[role as keyof typeof prepared.documents]) })),
  tests: assignment.tests.map(test => { const index = prepared.packet.tests.indexOf(test); requireReview(index >= 0, 'attribution', 'Unknown assigned test'); return { detail: test, blobOid: prepared.finalTestBlobs![index] }; }),
 };
}
export function taskFinalIdentity(prepared: PreparedReviewPacket, assignment: TaskAssignment): string {
 return digest(taskFinalInput(prepared, assignment));
}
export interface TaskInputFingerprint {
 readonly requirements: string;
 readonly sources: readonly { path: string; identity: string }[];
 readonly documents: readonly { path: string; identity: string }[];
 readonly tests: readonly { path: string; identity: string }[];
}
/** Small transient diagnostics: retain hashes, never historical source buffers. */
export function taskInputFingerprint(prepared: PreparedReviewPacket, assignment: TaskAssignment): TaskInputFingerprint {
 const input=taskFinalInput(prepared,assignment);
 return {requirements:digest([input.taskId,input.title,input.summary,input.acceptanceChecks]),
  sources:input.changes.map(c=>({path:c.path,identity:digest(c)})),
  documents:input.documents.map(d=>({path:`${d.role}:${d.path}`,identity:digest(d)})),
  tests:input.tests.map(t=>({path:t.detail.file,identity:digest(t)}))};
}
function reuseMismatch(review: AdmittedReview, assignment: TaskAssignment, sourceAttempt: number): string {
 const before=review.priorTaskInputs?.get(sourceAttempt)?.get(assignment.taskId),after=taskInputFingerprint(review.prepared,assignment);
 const changed:string[]=[];
 if(before){
  if(before.requirements!==after.requirements)changed.push('requirements');
  for(const kind of ['sources','documents','tests'] as const){
   for(const path of new Set([...before[kind],...after[kind]].map(x=>x.path))){
    if(!isDeepStrictEqual(before[kind].filter(x=>x.path===path),after[kind].filter(x=>x.path===path)))changed.push(`${kind} ${JSON.stringify(path)}`);
   }
  }
 }
 const details=diagnosticText(changed.length?changed.join('; '):'source, test, document or assignment identity/order changed',640);
 return diagnosticText(`Task ${JSON.stringify(assignment.taskId)} cannot reuse attempt ${sourceAttempt}: relevant task inputs changed (${details}). Set action to "reassess" and omit sourceAttempt for this task; retain eligible reuse for other tasks.`,8192);
}
export function validateSavedAttribution(attempt: ReviewAttempt): void {
 const h = attempt.header;
 if (!attempt.submitted.reviewRevision) {
  requireReview(h.finalScopeIdentity === undefined && h.attributionState === undefined && h.acceptedAttribution === undefined && h.taskScopeIdentities === undefined && h.attributionIdentity === undefined && h.attributionFailure === undefined && h.taskIdentityFormat === undefined, 'attribution', 'Unpinned history cannot carry final-scope authority'); return;
 }
 requireReview(h.finalScopeIdentity && h.attributionState, 'attribution', 'Pinned attempt requires final-scope attribution phase');
 if (h.attributionState !== 'accepted') {
  requireReview(h.acceptedAttribution === undefined && h.taskScopeIdentities === undefined && h.taskIdentityFormat === undefined, 'attribution', 'Unmapped phase cannot carry accepted task bindings');
  if (h.attributionState === 'pending') requireReview(h.attributionIdentity === undefined && h.attributionFailure === undefined, 'attribution', 'Pending attribution has terminal bindings');
  else {
   requireReview(h.attributionFailure && Buffer.byteLength(h.attributionFailure.code)<=64 && Buffer.byteLength(h.attributionFailure.summary)<=8192 && h.attributionIdentity === attributionIdentity('unmapped_failure', h.finalScopeIdentity, h.selectedTaskIds, attempt.submitted.tests.length, []), 'attribution', 'Invalid unmapped failure binding');
   requireReview(!attempt['review-response'].origins?.length && attempt['review-response'].tasks.every(t=>(t.status==='failed'||t.status==='incomplete')&&!t.findings.length&&t.testCoverage.assessment!=='verified'),'attribution','Unmapped checkpoint claims assessed scope');
  }
  return;
 }
 requireReview(h.acceptedAttribution && h.taskScopeIdentities && h.attributionIdentity && h.attributionFailure === undefined, 'attribution', 'Incomplete accepted attribution');
 validateAcceptedBindings(h as AcceptedBindingHeader, attempt.submitted.reviewSet.reduce((n, p) => n + p.files.length, 0), attempt.submitted.tests.length);
}
export interface AcceptedBindingHeader {
 attempt: number; selectedTaskIds: readonly string[]; finalScopeIdentity: string; attributionIdentity: string;
 acceptedAttribution: readonly AcceptedTaskAttribution[]; taskScopeIdentities: readonly {taskId:string;identity:string}[];
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
 if(source.header.taskScopeIdentities?.find(b => b.taskId === assignment.taskId)?.identity !== taskFinalIdentity(review.prepared, assignment)){
  const taskIndex=review.attempt.header.selectedTaskIds.indexOf(assignment.taskId);
  requireReview(false, `origins/tasks/${taskIndex}/sourceAttempt/${decision.sourceAttempt}`, reuseMismatch(review,assignment,decision.sourceAttempt));
 }
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
 requireReview(Buffer.byteLength(JSON.stringify(candidate))<=reviewJsonLimit(),'projection_limit','Accepted attribution exceeds review storage capacity');
 validateSavedAttribution({ ...review.attempt, header: { ...review.attempt.header, ...candidate } });
 for (const a of assignments) if (a.reassessment?.action === 'reuse') requireReuseIdentity(review, a);
 qualifyReviewCapacity({...review,checkpoint:{...review.checkpoint,attempts:review.checkpoint.attempts.map(a=>a===review.attempt?{...a,header:{...a.header,...candidate}}:a)},attempt:{...review.attempt,header:{...review.attempt.header,...candidate}}});
 Object.assign(review.attempt.header, candidate);
 return assignments;
}
export async function restoreAcceptedAssignments(review: AdmittedReview): Promise<readonly TaskAssignment[] | undefined> {
 if (review.attempt.header.attributionState !== 'accepted') return undefined;
 validateSavedAttribution(review.attempt);
 return bindTaskFinalIdentities(review, review.attempt.header.acceptedAttribution!);
}
