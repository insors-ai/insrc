/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { Type } from '@sinclair/typebox';
import { decodeReview, requireReview, reviewPath, TaskResultSchema } from './contracts.js';
import type { TaskReviewResult } from './contracts.js';
import { deriveTaskAssignments } from './packet.js';
import type { PreparedReviewPacket, TaskAssignment } from './packet.js';
import type { ReviewSources } from './sources.js';
import { normalizeTaskResult } from './results.js';

export const AttributionSchema = Type.Object({ tasks: Type.Array(Type.Object({ taskId: Type.String(), changeIndexes: Type.Array(Type.Integer({ minimum: 0 })), testIndexes: Type.Array(Type.Integer({ minimum: 0 })) }, { additionalProperties: false })) }, { additionalProperties: false });
export function attributionPrompt(prepared:PreparedReviewPacket,project?:string):string {
 return `Derive task attribution from this committed Plan and the submitted change selection. Commit groups are pointers only. Account for every change and test; cross-cutting entries may belong to multiple tasks. Do not review code yet.\nProject root: ${project??'the assigned working directory'}.\nPlan: ${prepared.documents.plan}\nSummary: ${prepared.packet.functionalSummary}\nChanges: ${JSON.stringify(prepared.changes.map(c => ({ commit: c.commit, path: c.path, segments: c.segments })))}\nTests: ${JSON.stringify(prepared.packet.tests)}\nReturn taskId and zero-based changeIndexes/testIndexes for every Plan task.`;
}
export function directAssignments(prepared:PreparedReviewPacket):readonly TaskAssignment[]|undefined {
 const selected=prepared.tasks.filter(task=>!prepared.packet.taskId || task.id===prepared.packet.taskId);
 if(selected.length!==1)return undefined;
 return deriveTaskAssignments(prepared,[{taskId:selected[0]!.id,changeIndexes:prepared.changes.map((_c,i)=>i),testIndexes:prepared.packet.tests.map((_t,i)=>i)}]);
}
export async function taskReferences(sources:ReviewSources,prepared:PreparedReviewPacket,assignment:TaskAssignment):Promise<string[]> {
 const refs=Object.values(prepared.packet.documents).map(doc=>`${doc.commit}:${doc.path}`);
 for(const change of assignment.changes){if(change.before&&change.parent)refs.push(`${change.parent}:${change.previousPath}`);if(change.after)refs.push(`${change.commit}:${change.path}`);}
 for(const pointer of prepared.packet.reviewSet)for(const test of assignment.tests)if(await sources.file(pointer.commit,test.file))refs.push(`${pointer.commit}:${test.file}`);
 return [...new Set(refs)];
}
/** Both actual reviewer parties use precisely the same source resolution and status policy. */
export async function assessTaskResult(sources:ReviewSources,assignment:TaskAssignment,input:unknown,resolved:readonly string[]):Promise<TaskReviewResult> {
 const result=decodeReview(TaskResultSchema,input),refs=[...resolved];
 for(const reference of [...result.inspectedReferences,...result.findings.flatMap(f=>f.evidenceReferences),...result.testCoverage.evidenceReferences,...result.executedTests.flatMap(t=>t.evidenceReferences)]){
  if(refs.includes(reference))continue;
  const match=/^([a-f0-9]{40}|[a-f0-9]{64}):(.+)$/.exec(reference);requireReview(match,'evidence','Expected a committed evidence reference');reviewPath(match[2]!);
  await sources.commit(match[1]!);requireReview(await sources.file(match[1]!,match[2]!),'evidence','Unresolved committed evidence reference');refs.push(reference);
 }
 return normalizeTaskResult(result,{taskId:assignment.taskId,changes:assignment.changes,evidenceReferences:refs});
}
export function taskFailure(taskId:string,message:string,timedOut:boolean):TaskReviewResult {
 return {taskId,status:timedOut?'incomplete':'failed',summary:message,findings:[],testCoverage:{assessment:'unverified',explanation:'No valid completed assessment was obtained.',evidenceReferences:[]},limitations:[message],advice:[],inspectedReferences:[],executedTests:[],...(!timedOut?{error:message}:{})};
}
