/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGitTools } from '../../../../daemon/tools/builtins/git/index.js';
import { roundWriterFor } from '../../../../daemon/lifecycle-registry.js';
import { reviewedBuildFingerprint } from '../../build-freshness.js';
import { RegistryReviewSources } from '../sources.js';
import type { ReviewCheckpoint, ReviewPacket, TaskReviewResult, ReviewAttempt } from '../contracts.js';
import type { TaskReviewBody } from '../record.js';
import { saveCheckpoint, checkpointPath } from '../checkpoint.js';
import { prepareReviewPacket, deriveTaskAssignments } from '../packet.js';
import type { TaskAttribution } from '../packet.js';
import { assignmentsToRows, bindTaskFinalIdentities } from '../attribution-binding.js';

registerGitTools();
export const hash='1234567890abcdef', date='2026-10-31T14:00:00.000Z';
export async function fixture(full=false,taskCount:1|2|3=1) {
 const repo=mkdtempSync(join(tmpdir(),'task-review-publication-'));
 const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
 const put=(path:string,value:unknown)=>{mkdirSync(join(repo,path,'..'),{recursive:true});writeFileSync(join(repo,path),typeof value==='string'?value:JSON.stringify(value));};
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
 const meta={epicHash:hash,storyId:'s1',repoPath:repo,createdAt:date,epicCreatedAt:date,epicSlug:'review-fixture'};
 const storyPath=`.insrc/artifacts/DEF-${hash}.json`,lldPath=`.insrc/artifacts/LLD-${hash}-s1.json`,planPath=`.insrc/artifacts/PLAN-${hash}-s1.json`;
 put(storyPath,{meta:{...meta,workflow:'define'},body:{stories:[{id:'s1'}]}});
 put(lldPath,{meta:{...meta,workflow:'design.story'},body:{}});
 put(planPath,{meta:{...meta,workflow:'plan'},body:{tasks:Array.from({length:taskCount},(_unused,i)=>({id:`t${i+1}`,title:'Calculate',summary:'Calculate total',size:['S','M','L'][i],order:i+1,dependsOn:i?[`t${i}`]:[],acceptanceChecks:['Behavior holds'],derivedFrom:['c1'],tests:[{level:'unit',name:'Behavior'}]}))},citations:[{id:'c1',kind:'stakeholder',ref:'Fixture'}]});
 const build={meta:{...meta,workflow:'build',authoredBy:'controller'},body:{kind:'build',summary:'Fixture build',tasks:Array.from({length:taskCount},(_unused,i)=>({id:`t${i+1}`,passed:true}))}};
 put(`.insrc/artifacts/BUILD-${hash}-s1.json`,build);
 put('.insrc/schema.json',{version:2});
 put('source.js','export const total = 1;\n');put('test.js','// Assertion evidence fixture\n');git('add','.');git('commit','-qm','base');const parent=git('rev-parse','HEAD');
 put('source.js','export const total = 2;\n');git('add','.');git('commit','-qm','selected');const commit=git('rev-parse','HEAD');
 const packet:ReviewPacket={reviewRevision:commit,storyId:'s1',...(!full?{taskId:'t1'}:{}),functionalSummary:'Fixture',documents:{story:{path:storyPath,commit:parent},lld:{path:lldPath,commit:parent},plan:{path:planPath,commit:parent}},reviewSet:[{commit,parent,files:[{path:'source.js',segments:[{after:[1,1]}]}]}],tests:[{file:'test.js',cases:['Behavior'],command:'node --test test.js',result:'not_run',executionDetails:'Schema/queue fixture, not a model review',evidenceReferences:[]}]};
 const result:TaskReviewResult={taskId:'t1',status:'passed',summary:'Inspected behavior',findings:[],testCoverage:{assessment:'verified',explanation:'Relevant assertions inspected',evidenceReferences:[`${commit}:test.js`]},limitations:[],advice:['Optional clarity improvement'],inspectedReferences:[`${commit}:source.js`],executedTests:[]};
 let binding:Partial<ReviewAttempt['header']>={};
 const checkpoint=(id='publication'):ReviewCheckpoint=>({schemaVersion:1,reviewId:id,project:repo,storyId:'s1',...(!full?{taskId:'t1'}:{}),attempts:[{header:{attempt:1,reviewer:'daemon',status:'running',createdAt:date,completedAt:date,selectedTaskIds:full?Array.from({length:taskCount},(_unused,i)=>`t${i+1}`):['t1'],...(full?{buildFingerprint:reviewedBuildFingerprint(build)}:{}),...structuredClone(binding)},submitted:structuredClone(packet),'review-response':{summary:'All assessments done; publication pending',tasks:full?Array.from({length:taskCount},(_unused,i)=>({...structuredClone(result),taskId:`t${i+1}`})):[structuredClone(result)],crPublication:'pending'}}]});
 const sources=new RegistryReviewSources({repoPath:repo,sessionId:'publication-test',requestId:1,send:()=>{}}),through=roundWriterFor(repo);
 const deps={sources,through};
 const refreshBinding=async(rows?:readonly TaskAttribution[])=>{
  const state=checkpoint('fixture-binding'),attempt=state.attempts[0]!,prepared=await prepareReviewPacket(packet,sources,true);
  delete attempt.header.acceptedAttribution;delete attempt.header.taskScopeIdentities;delete attempt.header.attributionIdentity;delete attempt.header.taskIdentityFormat;
  attempt.header.attributionState='pending';attempt.header.finalScopeIdentity=prepared.projection!.identity;
  const review={path:checkpointPath(repo,'fixture-binding'),checkpoint:state,attempt,prepared};
  const assignments=deriveTaskAssignments(prepared,rows??attempt.header.selectedTaskIds.map(taskId=>({taskId,changeIndexes:prepared.changes.map((_c,i)=>i),testIndexes:prepared.packet.tests.map((_t,i)=>i)})));
  await bindTaskFinalIdentities(review,assignmentsToRows(review,assignments));
  const h=attempt.header;binding={finalScopeIdentity:h.finalScopeIdentity!,attributionState:'accepted',acceptedAttribution:h.acceptedAttribution!,taskScopeIdentities:h.taskScopeIdentities!,attributionIdentity:h.attributionIdentity!,...(h.taskIdentityFormat?{taskIdentityFormat:h.taskIdentityFormat}:{})};
 };
 const read=(path:string):ReviewCheckpoint=>JSON.parse(readFileSync(path,'utf8')) as ReviewCheckpoint;
 const readRecord=(path:string):{meta:{schemaVersion:number;reviewedBy:string;epicSlug?:string;revision?:number};body:TaskReviewBody}=>JSON.parse(readFileSync(path,'utf8'));
 await refreshBinding();await saveCheckpoint(checkpointPath(repo,'publication'),checkpoint());
 return {repo,git,put,packet,result,checkpoint,refreshBinding,deps,read,readRecord,build,cleanup:()=>rmSync(repo,{recursive:true,force:true})};
}
