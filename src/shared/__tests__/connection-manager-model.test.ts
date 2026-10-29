import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnectionManager, projectConnectionManager, reduceConnectionManager } from '../connection-manager/model.js';
import type { ManagerEvent } from '../connection-manager/model.js';
import { loadConnectionCorpus } from './fixtures/connection-corpus.js';

test('CM-S5-STATE-TS: authenticated temporary revocation erases rows and refuses a pending old read',()=>{
 const root='/fixture/repo-a',epoch='fixture-epoch',revision='33333333-3333-4333-8333-333333333333';
 let state=reduceConnectionManager(createConnectionManager([root],epoch),{type:'select-root',repoRoot:root}).state;
 const rows=['saved','temporary'].map(scope=>({key:{repoRoot:root,scope,id:'fixture'},revision,kind:'postgres',family:'rdbms',effectiveFamily:'rdbms',publicConfig:{kind:'postgres',endpoint:'postgresql://fixture.invalid/database'},credentialPresence:{},...(scope==='temporary'?{ephemeral:true}:{})}));
 state=reduceConnectionManager(state,{type:'list-result',repoRoot:root,daemonEpoch:epoch,viewGeneration:1,rows}).state;
 state=reduceConnectionManager(state,{type:'select',selection:{key:state.rows[1]!.key,revision}}).state;
 const pending=reduceConnectionManager(state,{type:'refresh'}).state;
 const revoked=reduceConnectionManager(pending,{type:'temporary-ended'}).state;
 assert.equal(revoked.rows.length,1);assert.equal(revoked.rows[0]?.key.scope,'saved');assert.equal(revoked.selected,null);assert.equal(revoked.listState,'offline');assert.equal(revoked.awaitingRead,false);
 assert.equal(reduceConnectionManager(revoked,{type:'list-result',repoRoot:root,daemonEpoch:epoch,viewGeneration:pending.viewGeneration,rows}).state,revoked);
});

test('CM-S5-STATE-TS: all list states, full-key selection, root/view/epoch guards, counts/filters/search and committed reveal',()=>{
 const corpus=loadConnectionCorpus();
 const scenarios=corpus.managerScenarios;
 assert.ok(scenarios.length>=14);
 for (const scenario of scenarios) {
  let state=createConnectionManager(['/fixture/repo-a','/fixture/repo-b'],'fixture-epoch');
  assert.equal(projectConnectionManager(state).listState,'no-repository');
  for (const step of scenario.steps) {
   const before=JSON.stringify(state);
   const result=reduceConnectionManager(state,step.event as unknown as ManagerEvent);
   assert.equal(JSON.stringify(state),before,scenario.id+' mutated prior state');
   state=result.state;
   const projection=projectConnectionManager(state) as unknown as Record<string,unknown>;
   for (const [key,value] of Object.entries(step.expected)) assert.deepEqual(projection[key],value,scenario.id+': '+key);
   if (step.effects) assert.deepEqual(result.effects,step.effects,scenario.id);
   assert.ok(Object.isFrozen(state));assert.ok(Object.isFrozen(state.rows));
  }
 }
 const initial=createConnectionManager(['/fixture/repo-a'],'fixture-epoch');
 const loading=reduceConnectionManager(initial,{type:'select-root',repoRoot:'/fixture/repo-a'});
 assert.deepEqual(loading.effects,[{type:'list',repoRoot:'/fixture/repo-a',viewGeneration:1,daemonEpoch:'fixture-epoch'}]);
 const rows=corpus.transcripts[2]!.expected['rows'];
 const ready=reduceConnectionManager(loading.state,{type:'list-result',repoRoot:'/fixture/repo-a',viewGeneration:1,daemonEpoch:'fixture-epoch',rows}).state;
 assert.throws(()=>{(ready.rows as unknown[]).push({});},TypeError);
 const stale=reduceConnectionManager(ready,{type:'refresh'}).state;
 const selection={key:ready.rows[0]!.key,revision:ready.rows[0]!.revision};
 assert.equal(reduceConnectionManager(stale,{type:'select',selection}).state.selected,null);
 // Only an immutable public projection is exposed: no raw attempt, credential or authority record.
 assert.equal(Object.hasOwn(projectConnectionManager(ready),'capability'),false);
});
