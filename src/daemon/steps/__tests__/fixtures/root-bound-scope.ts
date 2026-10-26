import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PATHS } from '../../../../shared/paths.js';
import { ConnectionSessionRpc } from '../../../connection-session-rpc.js';
import { RequestLifetime } from '../../../request-context.js';
import { createTemporaryOverlay } from '../../../db/session-entries.js';
import type { TemporaryConnectionOverlay } from '../../../db/session-entries.js';
import '../../../db/drivers/index.js';
import { saveConnections, loadConnections } from '../../../db/config.js';
import { closeAll } from '../../../db/pool-cache.js';
import { connectionIsRegistered, resolveScope, resolveScopeForTarget } from '../../../../analyze/context/scope.js';
import type { ScopeDeps } from '../../../../analyze/context/scope.js';
import { connectionCheckFor } from '../../../../analyze/classifier/driver.js';
import { validateIntentSemantics } from '../../../../analyze/classifier/validate.js';
import { hintedIntentBase } from '../../../../analyze/orchestrator/driver.js';
import { prepareScope } from '../../../../analyze/context/driver.js';
import { stepScope } from '../../analyze-step/scope.js';
import { resolveTaskScope } from '../../../../analyze/runtimes/shared/task-scope.js';
import { runInStepContext } from '../../../../shared/step-context.js';
import type { ConnectionExecutionContext } from '../../../../shared/step-context.js';
import type { RegisteredRepo } from '../../../../shared/types.js';
test('root-bound production scope paths and saved compatibility', async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'cm-root-scope-'))), root=join(directory,'rootA'), other=join(directory,'rootB'), nested=join(root,'nested'), unknown=join(directory,'unregistered');
 for(const path of [root,other,nested,unknown])await mkdir(path,{recursive:true});
 const before=PATHS.insrc;PATHS.insrc=join(directory,'insrc');
 const overlays=new Map<string,TemporaryConnectionOverlay>();
 const runtime=new ConnectionSessionRpc({enabled:async()=>true,isRegistered:async r=>r===root||r===other,createOverlay:(r,h,c)=>{const o=createTemporaryOverlay(r,h,c);overlays.set(h,o);return o;},dropOverlay:o=>o.close()});
 const lifetime=new RequestLifetime(),ctx={connectionIdentity:randomUUID(),daemonEpoch:'scope-fixture',signal:lifetime.signal,registerDrain:lifetime.registerDrain,assertRequestActive:lifetime.assertActive};
 let savedReads=0, injected=0;
 const deps:ScopeDeps={listRepos:async()=>[root,other,nested].map(path=>({path,status:'ready'} as RegisteredRepo)),findEntitiesByFile:async()=>[],listEntitiesForRepo:async()=>[],loadConnections:async path=>{savedReads++;return loadConnections(path);}};
 try {
  await writeFile(join(root,'data.csv'),'n\n1\n');
  await saveConnections(root,{connections:[]});await saveConnections(other,{connections:[{id:'same',kind:'sqlite',path:'irrelevant.sqlite'},{id:'only-rootB',kind:'sqlite',path:'irrelevant.sqlite'}]});
  const opened=await runtime.call('db.connections.v2.session.open',{repoRoot:root},ctx) as {sessionHandle:string};assert.ok(opened.sessionHandle);
  const overlay=overlays.get(opened.sessionHandle)!;
  const entry=overlay.commit(await overlay.prepare({key:{repoRoot:root,scope:'temporary',id:'same'},mode:'create',publicPatch:{kind:'csv',path:'data.csv'}}));
  const execution=await runtime.executionFor(ctx,root),ref={kind:'connection' as const,value:'same'},intent={target:'data' as const,scope:'S' as const,focused:false,scopeRef:ref,reasoning:'scope test'};
  const fake=async()=>{injected++;return true;};
  assert.equal(await connectionIsRegistered('same',deps,execution),true);assert.equal(await connectionIsRegistered('only-rootB',deps,execution),false);
  const checker=connectionCheckFor({connectionExecution:execution,connectionExists:fake});assert.equal(await checker('same'),true);assert.equal(await checker('only-rootB'),false);
  assert.equal(await validateIntentSemantics(intent,fake,execution),null);assert.equal((await validateIntentSemantics({...intent,scopeRef:{...ref,value:'only-rootB'}},fake,execution))?.code,'scope-ref-unresolved');
  assert.equal((await hintedIntentBase('data','check',ref,fake,execution)).ok,true);assert.equal((await hintedIntentBase('data','check',{...ref,value:'only-rootB'},fake,execution)).ok,false);
  const paths=[()=>resolveScope(ref,deps,execution),()=>resolveScopeForTarget(ref,'data',deps,undefined,execution),()=>prepareScope('run',{intent},deps,execution),()=>prepareScope('classification',{scopeRef:ref,userPrompt:'q'},deps,execution),()=>prepareScope('task',{intent,task:{taskId:'t1'},upstreamTasks:new Map()} as never,deps,execution),()=>stepScope(intent,deps,execution),()=>resolveTaskScope(ref,'data','fixture',deps,undefined,execution)];
  for(const path of paths){const scope=await path();assert.equal(scope.lookupPath,root);assert.equal(scope.repoPath,root);assert.equal(scope.connectionId,'same');assert.equal(scope.connectionRevision,entry.revision);}
  assert.equal(savedReads,0);assert.equal(injected,0);
  await assert.rejects(resolveScopeForTarget({kind:'repo',value:other},'data',deps,undefined,execution),{code:'session-expired'});
  await assert.rejects(validateIntentSemantics({...intent,scopeRef:{kind:'repo',value:other}},fake,execution),{code:'session-expired'});
  await assert.rejects(prepareScope('task',{intent:{...intent,scopeRef:{kind:'repo',value:other}},task:{taskId:'t1'},upstreamTasks:new Map()} as never,deps,execution),{code:'session-expired'});
  assert.equal((await hintedIntentBase('data','q',{kind:'repo',value:other},fake,execution)).ok,false);
  // The code/docs/infra path semantics are unchanged; a target does not grant data resolver authority.
  assert.equal((await resolveScopeForTarget({kind:'repo',value:other},'infra',deps,undefined,execution)).lookupPath,other);
  await assert.rejects(resolveScopeForTarget(ref,'code',deps,undefined,execution),{name:'ScopeKindTargetMismatchError'});
  await assert.rejects(resolveScope(ref,deps,{...execution} as ConnectionExecutionContext),{code:'session-expired'});
  await runInStepContext({cwd:root,connectionExecution:execution},async()=>{await assert.rejects(resolveScope(ref,deps),{code:'session-expired'});await assert.rejects(prepareScope('run',{intent},deps),{code:'session-expired'});await assert.rejects(stepScope(intent,deps),{code:'session-expired'});});
  // End releases reservations before preparing legacy saved ambiguity fixtures.
  assert.deepEqual(await runtime.call('db.connections.v2.session.end',{},ctx),{status:'ended'});
  // Unattached saved resolution still enumerates and detects ambiguity.
  assert.equal((await resolveScope(ref,deps)).lookupPath,other);assert.ok(savedReads>0);
  await saveConnections(root,{connections:[{id:'same',kind:'sqlite',path:'irrelevant.sqlite'}]});await assert.rejects(resolveScope(ref,deps),/registered in 2 repos/);
  for(const selected of [nested,unknown])assert.equal((await resolveScope({kind:'manifest-dir',value:selected},deps)).lookupPath,selected);
  assert.equal(connectionCheckFor({connectionExists:fake}),fake);
  lifetime.abort();for(const path of paths)await assert.rejects(path(),{code:'session-expired'});await assert.rejects(checker('same'),{code:'session-expired'});
 } finally {lifetime.abort();lifetime.complete();await lifetime.drained;await runtime.close();await closeAll();PATHS.insrc=before;await rm(directory,{recursive:true,force:true});}
});
