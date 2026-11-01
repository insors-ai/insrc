/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { fixture, hash } from './publication-fixture.js';
import { checkpointPath, saveCheckpoint } from '../checkpoint.js';
import { publishTaskCheckpoint } from '../publication.js';
import type { ReviewPacket, ReviewerParty } from '../contracts.js';
export async function historyFixture(party:ReviewerParty='daemon'){
 const f=await fixture(true,3),state=f.checkpoint('history'),entry=state.attempts[0]!;
 entry.header.reviewer=party;entry['review-response'].tasks[0]!.summary='TASK1_ONLY_FEEDBACK';
 entry['review-response'].tasks[1]!.status='changes_requested';entry['review-response'].tasks[1]!.findings=[{severity:'MED',location:'source.js:1',message:'Earlier task2 regression',rationale:'The selected value violates the task2 requirement',evidenceReferences:f.result.inspectedReferences}];
 entry['review-response'].tasks[2]!.status='incomplete';entry['review-response'].tasks[2]!.testCoverage.assessment='unverified';entry['review-response'].tasks[2]!.limitations=['Required task3 branch remains unverified'];
 await saveCheckpoint(checkpointPath(f.repo,'history'),state);await publishTaskCheckpoint(f.repo,hash,'history',f.deps);
 const original=f.read(checkpointPath(f.repo,'history')).attempts[0]!;
 f.put('source.js','export const total = 3;\n');const parent=f.git('rev-parse','HEAD');f.git('add','source.js');f.git('commit','-qm','fix task2');const commit=f.git('rev-parse','HEAD');
 const packet:ReviewPacket={...structuredClone(f.packet),functionalSummary:'Review the task2 fix, retain unresolved task3 evidence honestly',reviewSet:[...structuredClone(f.packet.reviewSet),{commit,parent,files:[{path:'source.js',segments:[{after:[1,1]}]}]}]};
 f.build.body.summary='Current fixed build';f.put(`.insrc/artifacts/BUILD-${hash}-s1.json`,f.build);
 const fresh=(taskId:string)=>({...structuredClone(f.result),taskId,inspectedReferences:[`${commit}:source.js`],testCoverage:{...f.result.testCoverage,evidenceReferences:[`${commit}:test.js`]}});
 const scope=(sourceAttempt=1,reassess='t2')=>({summary:'Reassess changed task; retain unchanged feedback with its evidence limits',tasks:['t1','t2','t3'].map(taskId=>({taskId,changeIndexes:[taskId==='t2'?1:0],testIndexes:[0],action:taskId===reassess?'reassess':'reuse',reason:taskId===reassess?'Inspect the changed requirement':'Retain the selected source result without promoting its evidence',...(taskId===reassess?{}:{sourceAttempt})}))});
 return {...f,packet,original,fresh,scope};
}
