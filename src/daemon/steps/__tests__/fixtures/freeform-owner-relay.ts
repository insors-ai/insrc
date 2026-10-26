import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { PATHS } from '../../../../shared/paths.js';
import { ConnectionSessionRpc } from '../../../connection-session-rpc.js';
import { RequestLifetime } from '../../../request-context.js';
import { createTemporaryOverlay } from '../../../db/session-entries.js';
import type { TemporaryConnectionOverlay } from '../../../db/session-entries.js';
import '../../../db/drivers/index.js';
import { SqliteDriver } from '../../../db/drivers/sqlite.js';
import { getFactory } from '../../../db/registry.js';
import { closeAll } from '../../../db/pool-cache.js';
import { _setMeasureDepsForTest, measureDataSource, measureRequestScope, measureResolvedScope } from '../../../../analyze/measure.js';
import type { RegisteredRepo } from '../../../../shared/types.js';
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}
async function fixture(){
 const directory=await realpath(await mkdtemp(join(tmpdir(),'cm-owner-measure-'))),root=join(directory,'root');await mkdir(root);
 const original=PATHS.insrc;PATHS.insrc=join(directory,'insrc');const overlays=new Map<string,TemporaryConnectionOverlay>(),factories:string[]=[];
 const runtime=new ConnectionSessionRpc({enabled:async()=>true,isRegistered:async r=>r===root,createOverlay:(r,h,c)=>{const o=createTemporaryOverlay(r,h,c,{factory:kind=>{factories.push(kind);return getFactory(kind);}});overlays.set(h,o);return o;},dropOverlay:o=>o.close()});
 const requests:RequestLifetime[]=[];
 const request=async(identity:string)=>{const lifetime=new RequestLifetime();requests.push(lifetime);const context={connectionIdentity:identity,daemonEpoch:'measure-fixture',signal:lifetime.signal,registerDrain:lifetime.registerDrain,assertRequestActive:lifetime.assertActive};return{lifetime,context};};
 const owners=[];
 for(const [index,count] of [1,3].entries()){
  const path=join(root,'owner'+index+'.sqlite'),db=new DatabaseSync(path);for(let n=0;n<count;n++)db.exec(`CREATE TABLE table_${n}(marker TEXT)`);db.close();
  const current=await request(randomUUID()),opened=await runtime.call('db.connections.v2.session.open',{repoRoot:root},current.context) as {sessionHandle:string};assert.ok(opened.sessionHandle);
  const overlay=overlays.get(opened.sessionHandle)!;overlay.commit(await overlay.prepare({key:{repoRoot:root,scope:'temporary',id:'same'},mode:'create',publicPatch:{kind:'sqlite',path}}));
  owners.push({...current,overlay,execution:await runtime.executionFor(current.context,root),count});
 }
 _setMeasureDepsForTest({scope:{listRepos:async()=>[{path:root,status:'ready'} as RegisteredRepo],findEntitiesByFile:async()=>[],listEntitiesForRepo:async()=>[],loadConnections:async()=>{throw new Error('cross-root saved enumeration forbidden');}}});
 return{root,runtime,owners,factories,async fresh(owner:typeof owners[number]){const current=await request(owner.context.connectionIdentity);return{...current,execution:await runtime.executionFor(current.context,root)};},async close(){for(const lifetime of requests){lifetime.abort();lifetime.complete();}await runtime.close();for(const lifetime of requests)await lifetime.drained;await closeAll();_setMeasureDepsForTest(undefined);PATHS.insrc=original;await rm(directory,{recursive:true,force:true});}};
}

import { executePlan, _overrideRunnerForTest, _getRunnersForTest } from '../../../../analyze/explore/executor.js';
import { runFreeformProbe, measureOwnRequest } from '../../../../analyze/explore/freeform-probe.js';
import { _runExplorationPipelineForTest, _fallbackFreeformPlanForTest, runShaperToolLoop, runShaper, _buildToolDepsForTest } from '../../../../analyze/context/driver.js';
import { savedAnalysisExecution } from '../../../../analyze/connection-access.js';
import { ConnectionExecutionError, runInStepContext } from '../../../../shared/step-context.js';
import { runReadOnlyToolLoop, emitStructuredAnswer } from '../../../../agent/read-only-tool-loop.js';
import { registerBuiltinTools } from '../../../tools/builtins/index.js';
import { getTool } from '../../../tools/registry.js';
import { setGraphStorePath, closeGraphStore } from '../../../../db/graph/store.js';
import type { LLMProvider } from '../../../../shared/types.js';
const layers={system:'owner relay',focus:'',summary:'safe deterministic fixture',structure:'',surface:'',artefacts:'',upstream:''};
test('actual owner freeform measurement and forced fallback relays',async()=>{
 const f=await fixture();setGraphStorePath(join(f.root,'graph.lmdb'));const previous=_getRunnersForTest()['freeform.probe'];let loops=0,listings=0;const original=SqliteDriver.prototype.listTables;
 const spy=mock.method(SqliteDriver.prototype,'listTables',async function(this:SqliteDriver,...args:Parameters<typeof original>){listings++;return original.apply(this,args);});
 let expected=f.owners[0]!.execution;
 _overrideRunnerForTest('freeform.probe',(exp,ctx)=>runFreeformProbe(exp,ctx,async args=>{
  loops++;assert.equal(args.connectionExecution,expected);assert.equal(args.connectionExecution.lifetime.signal,expected.lifetime.signal);assert.equal(args.connectionExecution.lifetime.registerDrain,expected.lifetime.registerDrain);assert.equal(args.connectionExecution.diagnostics,expected.diagnostics);
  const deps=_buildToolDepsForTest({...args,provider:{} as LLMProvider});assert.equal(deps.connectionExecution,expected);assert.equal(deps.signal,expected.lifetime.signal);
  return{rawBundle:layers,toolCallCount:0};
 }));
 try {
  for(const owner of f.owners)for(const withScope of [false,true])for(const requestSize of [undefined,'M' as const]){
   expected=owner.execution;const before=listings;
   const scope=withScope?{kind:'connection' as const,value:'same',repoPath:f.root,lookupPath:f.root,connectionId:'same'}:undefined;
   const result=await executePlan({connectionExecution:owner.execution,runId:randomUUID(),repoPath:f.root,closureRepos:[f.root],repoLastIndexedAtMs:0n,scope,requestSize,plan:{answerType:'data-inventory',synthesisHint:'fixture',explorations:[{id:'e',type:'freeform.probe',purpose:'fixture',params:{purpose:'inspect owner source',shaperId:'data'}}]}});
   assert.equal(result.results[0]?.output.type,'freeform.probe');assert.equal(listings-before,requestSize===undefined?1:0);
  }
  assert.equal(loops,8);
  expected=f.owners[0]!.execution;let fallbacks=0,measures=0;
  const scope={kind:'connection' as const,value:'same',repoPath:f.root,lookupPath:f.root,connectionId:'same'};
  const intent={target:'data' as const,scope:'M' as const,focused:true,focus:'fixture',scopeRef:{kind:'connection' as const,value:'same'},reasoning:'fixture'};
  const steps={decompose:async(args:any)=>{assert.equal(args.connectionExecution,expected);throw new Error('ordinary schema failure');},executePlan:async(args:any)=>{assert.equal(args.connectionExecution,expected);return executePlan(args);},synthesize:async()=>{throw new Error('sole freeform should return directly');},fallbackFreeformPlan:(...args:Parameters<typeof _fallbackFreeformPlanForTest>)=>{fallbacks++;return _fallbackFreeformPlanForTest(...args);},lastIndexedAt:async()=>undefined,measureArea:async(...args:Parameters<typeof measureResolvedScope>)=>{measures++;assert.equal(args[3]?.connectionExecution,expected);return measureResolvedScope(...args);}};
  const args={connectionExecution:expected,invocationMode:'run' as const,shaperId:'data' as const,inputs:{intent},runId:randomUUID(),scope};
  const result=await _runExplorationPipelineForTest(args,steps);assert.equal(result.kind,'bundle');assert.equal(fallbacks,1);assert.equal(measures,1);assert.equal(loops,9);
  let reads=0;const poison=new Proxy({}, {get(){reads++;throw new Error('input read before admission');}});
  await assert.rejects(runFreeformProbe(poison as never,{connectionExecution:undefined} as never),{code:'session-expired'});
  for(const owner of f.owners){
   await assert.rejects(runShaperToolLoop({connectionExecution:owner.execution,provider:poison,inputs:poison} as never),{code:'unsupported-temporary'});
   await assert.rejects(runShaper({connectionExecution:owner.execution,opts:{connectionExecution:owner.execution},inputs:poison} as never),{code:'unsupported-temporary'});
  }
  assert.equal(reads,0);
  await runInStepContext({cwd:f.root,connectionExecution:expected},async()=>{await assert.rejects(async()=>measureOwnRequest({repoPath:f.root,connectionExecution:undefined} as never,'data'),{code:'session-expired'});});
  const fresh=await f.fresh(f.owners[0]!);expected=fresh.execution;
  const denySteps={...steps,decompose:async()=>{fresh.lifetime.abort();throw new ConnectionExecutionError('session-expired');},fallbackFreeformPlan:(...a:Parameters<typeof _fallbackFreeformPlanForTest>)=>{fallbacks++;return _fallbackFreeformPlanForTest(...a);}};
  await assert.rejects(_runExplorationPipelineForTest({...args,connectionExecution:expected},denySteps),{code:'session-expired'});assert.equal(fallbacks,1);
  const delayed=await f.fresh(f.owners[1]!),entered=deferred(),held=deferred();let reachedLoop=false;
  const heldSpy=mock.method(SqliteDriver.prototype,'listTables',async function(this:SqliteDriver,...a:Parameters<typeof original>){const value=await original.apply(this,a);entered.resolve();await held.promise;return value;});
  const probing=runFreeformProbe({id:'e',type:'freeform.probe',purpose:'fixture',params:{purpose:'fixture',shaperId:'data'}},{connectionExecution:delayed.execution,repoPath:f.root,runId:'late',closureRepos:[f.root],readDep:()=>undefined,ignoreFilter:{} as never},async()=>{reachedLoop=true;return{rawBundle:layers,toolCallCount:0};});const refused=assert.rejects(probing,{code:'session-expired'});
  try{await entered.promise;delayed.lifetime.abort();await refused;delayed.lifetime.complete();assert.equal(await Promise.race([delayed.lifetime.drained.then(()=>false),delay(5,true)]),true);held.resolve();await delayed.lifetime.drained;assert.equal(reachedLoop,false);}finally{held.resolve();await refused;heldSpy.mock.restore();}
 }finally{_overrideRunnerForTest('freeform.probe',previous);spy.mock.restore();await closeGraphStore();await f.close();}
});
test('explicit saved loop carries execution through provider tools final emit and actual drain',async()=>{
 const f=await fixture();registerBuiltinTools();const originalContextPath=PATHS.analyzeContext;PATHS.analyzeContext=runId=>join(f.root,'contexts',runId);const lifetime=new RequestLifetime(),execution=savedAnalysisExecution(f.root,lifetime);let turns=0,final=0,tools=0;
 const tool=getTool('db_list_connections')!,originalTool=tool.execute;
 const spy=mock.method(tool,'execute',async function(input,deps){tools++;assert.equal(deps.connectionExecution,execution);assert.equal(deps.signal,execution.lifetime.signal);return originalTool.call(tool,input,deps);});
 const provider={complete:async(_messages:any,opts:any)=>{assert.equal(opts.signal,execution.lifetime.signal);turns++;return turns%2===1?{text:'',stopReason:'tool_use',toolCalls:[{id:'call',name:'db_list_connections',input:{}}]}:{text:'done',stopReason:'end_turn'};},completeStructured:async(_messages:any,_schema:any,opts:any)=>{final++;assert.equal(opts.signal,execution.lifetime.signal);return layers;}} as unknown as LLMProvider;
 const scope={kind:'repo' as const,value:f.root,lookupPath:f.root,repoPath:f.root};const inputs={intent:{target:'data' as const,scope:'S' as const,focused:false,scopeRef:{kind:'repo' as const,value:f.root},reasoning:'saved fixture'}};
 try{
  for(const invocationMode of ['run','task'] as const){const result=await runShaperToolLoop({connectionExecution:execution,runId:randomUUID(),shaperId:'data',invocationMode,inputs,scope,promptPath:'prompts/analyze/data.system.md',provider});assert.deepEqual(result.rawBundle,layers);assert.equal(result.toolCallCount,1);}
  assert.equal(turns,4);assert.equal(final,2);assert.equal(tools,2);
  const taskInputs={...inputs,task:{taskId:'t',template:'data.schema.table',kind:'leaf',params:{},produces:['out'],rationale:'fixture'},template:{id:'fixture'},upstreamTasks:new Map()};
  const unused=async()=>{throw new Error('task mode cannot run exploration planning');};
  const taskBundle=await runShaper({connectionExecution:execution,invocationMode:'task',shaperId:'data',runId:'unused',inputs:taskInputs,promptPath:'prompts/analyze/data.system.md',provider,opts:{runId:randomUUID(),bypassCache:true,connectionExecution:execution},scopeDeps:{listRepos:async()=>[],findEntitiesByFile:async()=>[],listEntitiesForRepo:async()=>[],loadConnections:unused},pipelineSteps:{decompose:unused,executePlan:unused,synthesize:unused,fallbackFreeformPlan:_fallbackFreeformPlanForTest,lastIndexedAt:async()=>undefined}} as never);assert.equal(taskBundle.summary,layers.summary);assert.equal(turns,6);assert.equal(final,3);assert.equal(tools,3);
  const lateLife=new RequestLifetime(),lateExec=savedAnalysisExecution(f.root,lateLife),entered=deferred(),held=deferred();let completed=false;
  const delayed={...provider,completeStructured:async()=>{entered.resolve();await held.promise;completed=true;return layers;}} as LLMProvider;
  const emitting=emitStructuredAnswer({connectionExecution:lateExec,provider:delayed,messages:[],instruction:'fixture',schema:{type:'object'}});const rejected=assert.rejects(emitting,{name:'AbortError'});
  await entered.promise;lateLife.abort();await rejected;lateLife.complete();assert.equal(await Promise.race([lateLife.drained.then(()=>false),delay(5,true)]),true);assert.equal(completed,false);held.resolve();await lateLife.drained;assert.equal(completed,true);
  let reads=0;const poison=new Proxy({}, {get(){reads++;throw new Error('unexpected input read');}});
  await runInStepContext({cwd:f.root,connectionExecution:f.owners[0]!.execution},async()=>{await assert.rejects(runReadOnlyToolLoop({deps:poison} as never),{code:'session-expired'});await assert.rejects(emitStructuredAnswer({messages:poison} as never),{code:'session-expired'});});assert.equal(reads,0);
 }finally{lifetime.abort();lifetime.complete();await lifetime.drained;spy.mock.restore();PATHS.analyzeContext=originalContextPath;await f.close();}
});
