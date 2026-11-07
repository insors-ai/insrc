/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { fixture, hash } from './publication-fixture.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import type { ReviewPacket, ReviewerParty } from '../contracts.js';
export async function historyFixture(party:ReviewerParty='daemon'){
 const f=await fixture(true,3),base=f.packet.reviewSet[0]!.commit;
 f.put('stable-t1.js','export const stable1 = true;\n');f.put('stable-t3.js','export const stable3 = true;\n');f.git('add','stable-t1.js','stable-t3.js');f.git('commit','-qm','independent unchanged task scopes');const stable=f.git('rev-parse','HEAD');
 f.packet.reviewRevision=stable;f.packet.reviewSet.push({commit:stable,parent:base,files:['stable-t1.js','stable-t3.js'].map(path=>({path,segments:[{after:[1,1]}]}))});
 const unchangedPacket=structuredClone(f.packet),state=f.checkpoint('history'),entry=state.attempts[0]!;
 entry['review-response'].tasks[0]!.inspectedReferences=[`${stable}:stable-t1.js`];entry['review-response'].tasks[2]!.inspectedReferences=[`${stable}:stable-t3.js`];
 entry.header.reviewer=party;entry['review-response'].tasks[0]!.summary='TASK1_ONLY_FEEDBACK';
 entry['review-response'].tasks[1]!.status='changes_requested';entry['review-response'].tasks[1]!.findings=[{severity:'MED',location:'source.js:1',message:'Earlier task2 regression',rationale:'The selected value violates the task2 requirement',evidenceReferences:f.result.inspectedReferences}];
 entry['review-response'].tasks[2]!.status='incomplete';entry['review-response'].tasks[2]!.testCoverage.assessment='unverified';entry['review-response'].tasks[2]!.limitations=['Required task3 branch remains unverified'];
 await saveCheckpoint(checkpointPath(f.repo,'history'),state);await publishTaskCheckpoint(f.repo,hash,'history',f.deps);
 const original=f.read(checkpointPath(f.repo,'history')).attempts[0]!;
 f.put('source.js','export const total = 3;\n');const parent=f.git('rev-parse','HEAD');f.git('add','source.js');f.git('commit','-qm','fix task2');const commit=f.git('rev-parse','HEAD');
 const packet:ReviewPacket={...structuredClone(f.packet),reviewRevision:commit,functionalSummary:'Review the task2 fix, retain unresolved task3 evidence honestly',reviewSet:[...structuredClone(f.packet.reviewSet),{commit,parent,files:[{path:'source.js',segments:[{after:[1,1]}]}]}]};
 f.build.body.summary='Current fixed build';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 const fresh=(taskId:string)=>({...structuredClone(f.result),taskId,inspectedReferences:[`${commit}:${taskId==='t2'?'source.js':`stable-${taskId}.js`}`],testCoverage:{...f.result.testCoverage,evidenceReferences:[`${commit}:test.js`]}});
 const scope=(sourceAttempt=1,reassess='t2')=>({summary:'Reassess changed task; retain unchanged feedback with its evidence limits',tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:taskId==='t2'?[0,3]:taskId==='t1'?[1]:[2],testIndexes:[0],action:taskId===reassess?'reassess':'reuse',reason:taskId===reassess?'Inspect the changed requirement':'Retain the selected source result without promoting its evidence',...(taskId===reassess?{}:{sourceAttempt})}))});
 return {...f,packet,unchangedPacket,original,fresh,scope};
}
