import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
import type { LLMProvider } from '../../../../shared/types.js';
import { DESIGN_LIMITS, DesignReviewError, DesignReviewPersistenceError } from '../contracts.js';
import { loadDesignCheckpoint, saveDesignCheckpoint } from '../checkpoint.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { designFixture } from './fixtures.js';

const code=(expected:string)=>(e:unknown)=>e instanceof DesignReviewError&&e.code===expected;
const time='2026-11-03T00:00:00.000Z';

test('checkpoint I/O errors are normalized while domain and corruption codes survive without replacing accepted bytes',async t=>{
 const f=designFixture(t);await saveDesignCheckpoint(f.repo,f.checkpoint);const original=await fs.readFile(f.path,'utf8');
 const foreign=structuredClone(f.checkpoint);foreign.project='/foreign';await assert.rejects(saveDesignCheckpoint(f.repo,foreign),code('foreign_checkpoint'));
 const changed=structuredClone(f.checkpoint);changed.attempts[0]!.baseline.contentIdentity='b'.repeat(64);
 await assert.rejects(saveDesignCheckpoint(f.repo,changed),code('immutable_history'));
 const rename=fs.rename;t.mock.method(fs,'rename',async(...args:Parameters<typeof fs.rename>)=>{if(args[1]===f.path)throw new Error('rename I/O failure');return rename(...args);});
 await assert.rejects(saveDesignCheckpoint(f.repo,f.checkpoint),e=>e instanceof DesignReviewPersistenceError&&e.message==='rename I/O failure');
 assert.equal(await fs.readFile(f.path,'utf8'),original);t.mock.restoreAll();
 await fs.writeFile(f.path,'corrupt');await assert.rejects(saveDesignCheckpoint(f.repo,f.checkpoint),code('invalid_checkpoint'));
 assert.equal(await fs.readFile(f.path,'utf8'),'corrupt');
 await fs.truncate(f.path,DESIGN_LIMITS.checkpointBytes+1);await assert.rejects(saveDesignCheckpoint(f.repo,f.checkpoint),code('checkpoint_too_large'));
});

test('coordinator commit preserves domain errors and fences every failed save before provider dispatch',async t=>{
 for(const failure of [new DesignReviewError('immutable_history','domain failure'),new Error('disk I/O failure')]){
  const f=designFixture(t);let writes=0,calls=0;
  const provider={capabilities:{reviewActivity:true},runReviewSession:async()=>{calls++;throw new Error('must not dispatch');}} as unknown as LLMProvider;
  const c=new DesignReviewCoordinator({provider:()=>({provider,model:'fixture'}),save:async(repo,cp)=>{if(++writes===2)throw failure;await saveDesignCheckpoint(repo,cp);}});
  await c.start({phase:'start',repo:f.repo,reviewId:'review-1',attempt:1,artifactPath:f.json});
  let result=await c.progress(f.repo,'review-1',1);
  for(let i=0;i<1000&&['pending','running'].includes(result.status);i++){await pause(2);result=await c.progress(f.repo,'review-1',1);}
  assert.equal(result.status,'failed');assert.equal(calls,0);
  assert.equal(result.failure?.code,failure instanceof DesignReviewError?'immutable_history':'persistence_failed');
 }
});

test('checkpoint recovery counters actions outcomes and completed-unit summaries are monotonic and prior attempts freeze',async t=>{
 const f=designFixture(t),cp=structuredClone(f.checkpoint),a=cp.attempts[0]!;
 const fresh=structuredClone(a);
 a.unit={unitId:'planning',phase:'planning',executionId:'execution-1',dispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[]};
 await saveDesignCheckpoint(f.repo,cp);
 a.unit.dispatches=2;a.unit.retriesUsed=1;a.unit.executionId='execution-2';a.unit.diagnostics.push({code:'invalid_output',summary:'Required field missing'});
 await saveDesignCheckpoint(f.repo,cp);
 const decreased=structuredClone(cp);decreased.attempts[0]!.unit!.dispatches=1;decreased.attempts[0]!.unit!.retriesUsed=0;
 decreased.attempts[0]!.unit!.diagnostics=[];await assert.rejects(saveDesignCheckpoint(f.repo,decreased),code('immutable_history'));
 const discarded=structuredClone(cp);delete discarded.attempts[0]!.unit;
 await assert.rejects(saveDesignCheckpoint(f.repo,discarded),code('immutable_history'));
 const resetDiagnostics=structuredClone(cp);resetDiagnostics.attempts[0]!.unit!.diagnostics=[];
 await assert.rejects(saveDesignCheckpoint(f.repo,resetDiagnostics),code('immutable_history'));
 const unapproved=structuredClone(cp);unapproved.attempts[0]!.unit!.userDirectedDispatches=1;
 await assert.rejects(saveDesignCheckpoint(f.repo,unapproved),code('invalid_checkpoint'));
 a.unit.dispatches=4;a.unit.retriesUsed=3;a.unit.userDirectedDispatches=1;
 a.actions=[{actionId:'extra-1',signature:'a'.repeat(64),operation:'resume',sourceAttempt:1,resultAttempt:1,acceptedAt:time,userDecision:{action:'retry_failed_unit',reason:'Approved one further execution',recordedAt:time}}];
 await saveDesignCheckpoint(f.repo,cp);
 a.actions[0]!.outcome={code:'completed',summary:'Unit accepted'};await saveDesignCheckpoint(f.repo,cp);
 for(const edit of [(x:typeof cp)=>{x.attempts[0]!.actions![0]!.signature='b'.repeat(64);},(x:typeof cp)=>{x.attempts[0]!.actions![0]!.outcome!.summary='Replacement';},(x:typeof cp)=>{x.attempts[0]!.actions=[];}]){
  const altered=structuredClone(cp);edit(altered);await assert.rejects(saveDesignCheckpoint(f.repo,altered));
 }
 a.plan={chunks:[{id:'content',title:'Content',selectors:['/body/summary'],concerns:['Completeness'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All content',finalConsistencyChunkId:'final',coverage:[{unitId:'/body/summary',chunkIds:['content']}]};
 a.unitSummaries=[{unitId:'planning',phase:'planning',automaticDispatches:4,retriesUsed:3,userDirectedDispatches:1,diagnostics:structuredClone(a.unit.diagnostics),actionIds:['extra-1']}];
 delete a.unit;await saveDesignCheckpoint(f.repo,cp);
 const rewritten=structuredClone(cp);rewritten.attempts[0]!.unitSummaries![0]!.diagnostics[0]!.summary='Replacement';
 await assert.rejects(saveDesignCheckpoint(f.repo,rewritten),code('immutable_history'));
 const reopened=structuredClone(cp);reopened.attempts[0]!.unit={unitId:'planning',phase:'planning',executionId:'new-generation',dispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[]};
 await assert.rejects(saveDesignCheckpoint(f.repo,reopened),code('immutable_history'));
 a.status='invalidated';await saveDesignCheckpoint(f.repo,cp);
 a.actions.push({actionId:'restart-1',signature:'c'.repeat(64),operation:'restart_full',sourceAttempt:1,resultAttempt:2,acceptedAt:time,userDecision:{action:'restart_full',reason:'User approved changed subject restart',recordedAt:time}});
 cp.attempts.push({...fresh,number:2});await saveDesignCheckpoint(f.repo,cp);
 const oldChanged=structuredClone(cp);oldChanged.attempts[0]!.finishedAt=time;
 await assert.rejects(saveDesignCheckpoint(f.repo,oldChanged),code('immutable_history'));
 const removed=structuredClone(cp);removed.attempts.pop();await assert.rejects(saveDesignCheckpoint(f.repo,removed));
 assert.equal((await loadDesignCheckpoint(f.repo,'review-1'))!.attempts.length,2);
});

test('completed-unit summary guards reject duplicates unknown actions and missing accepted work without changing saved bytes',async t=>{
 const f=designFixture(t),cp=structuredClone(f.checkpoint),a=cp.attempts[0]!;
 a.plan={chunks:[{id:'content',title:'Content',selectors:['/body/summary'],concerns:['Completeness'],dependsOn:[],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['Consistency'],dependsOn:['content'],purpose:'consistency'}],coverageExplanation:'All content',finalConsistencyChunkId:'final',coverage:[{unitId:'/body/summary',chunkIds:['content']}]};
 a.actions=[{actionId:'resume-1',signature:'a'.repeat(64),operation:'resume',sourceAttempt:1,resultAttempt:1,acceptedAt:time}];
 a.unitSummaries=[{unitId:'planning',phase:'planning',automaticDispatches:1,retriesUsed:0,userDirectedDispatches:0,diagnostics:[],actionIds:['resume-1']}];
 await saveDesignCheckpoint(f.repo,cp);const bytes=await fs.readFile(f.path,'utf8');
 const cases:[string,(value:typeof a)=>void][]=[
  ['Duplicate completed unit summary',x=>{x.unitSummaries!.push(structuredClone(x.unitSummaries![0]!));}],
  ['Unit summary names an unknown or duplicate action',x=>{x.unitSummaries![0]!.actionIds=['unknown'];}],
  ['Unit summary names an unknown or duplicate action',x=>{x.unitSummaries![0]!.actionIds=['resume-1','resume-1'];}],
  ['Unit summary names an unverified recovery action',x=>{x.actions![0]!.validation='unverified';}],
  ['Completed planning summary has no accepted plan',x=>{delete x.plan;}],
  ['Completed unit summary has no accepted chunk',x=>{x.unitSummaries![0]!.phase='chunk_review';x.unitSummaries![0]!.unitId='content';}],
 ];
 for(const [message,edit] of cases){
  const invalid=structuredClone(cp);edit(invalid.attempts[0]!);
  await assert.rejects(saveDesignCheckpoint(f.repo,invalid),error=>error instanceof DesignReviewError&&error.code==='invalid_checkpoint'&&error.message.includes(message));
  assert.equal(await fs.readFile(f.path,'utf8'),bytes);
 }
});
