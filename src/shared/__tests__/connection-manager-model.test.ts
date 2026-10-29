import assert from 'node:assert/strict';
import test from 'node:test';
import { createConnectionManager, projectConnectionManager, reduceConnectionManager } from '../connection-manager/model.js';
import type { ManagerEvent } from '../connection-manager/model.js';
import { loadConnectionCorpus } from './fixtures/connection-corpus.js';

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
