import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { executePlan, stepPlan } from '../../../../analyze/explore/executor.js';
import { runExecutor } from '../../../../analyze/executor/walker.js';
import { registerTemplateRuntime } from '../../../../analyze/executor/registry.js';
import { setGraphStorePath, closeGraphStore } from '../../../../db/graph/store.js';
import { PATHS } from '../../../../shared/paths.js';
import { saveConnections } from '../../../db/config.js';
import { acquirePool, closeAll } from '../../../db/pool-cache.js';
import { SqliteDriver } from '../../../db/drivers/sqlite.js';
import fsPromises, { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import '../../../db/drivers/index.js';
import { ConnectionSessionRpc } from '../../../connection-session-rpc.js';
import { RequestLifetime } from '../../../request-context.js';
import { createTemporaryOverlay } from '../../../db/session-entries.js';
import type { TemporaryConnectionOverlay } from '../../../db/session-entries.js';
import { registerDbTools } from '../../../tools/builtins/db/index.js';
import { getTool } from '../../../tools/registry.js';
import { executeTool } from '../../../tools/executor.js';
import { dataSchemaDriftTool } from '../../../tools/builtins/data/schema-drift.js';
import { dataDiscoveryConnectionsRuntime, dataDiscoveryObjectsRuntime, dataSchemaTableRuntime } from '../../../../analyze/runtimes/data/index.js';
import { _setTaskScopeDepsForTest } from '../../../../analyze/runtimes/shared/task-scope.js';
import { runDbConnectionsList } from '../../../../analyze/explore/db-connections-list.js';
import { runDbTablesList } from '../../../../analyze/explore/db-tables-list.js';
import { runDbTableDescribe } from '../../../../analyze/explore/db-table-describe.js';
import { permissiveIgnoreFilter } from '../../../../analyze/context/repo-ignore-filter.js';
import { runInStepContext } from '../../../../shared/step-context.js';
import type { ConnectionExecutionContext } from '../../../../shared/step-context.js';
import type { TemplateExecuteArgs } from '../../../../analyze/executor/types.js';
registerDbTools();
test('owner tool runtime and exploration matrix', async () => {
 const directory = await realpath(await mkdtemp(join(tmpdir(), 'cm-tool-owner-'))), root = join(directory, 'root'), other = join(directory,'other'); await mkdir(root); await mkdir(other);
 const originalIns=PATHS.insrc, originalTaskPath=PATHS.analyzeTaskOutput;PATHS.insrc=join(directory,'insrc');PATHS.analyzeTaskOutput=(runId,taskId)=>join(directory,'analyze',runId,'tasks',taskId+'.json');setGraphStorePath(join(directory,'graph.lmdb'));
	registerTemplateRuntime(dataSchemaTableRuntime, { sessionMemory: 'read-only' });
 const overlays = new Map<string,TemporaryConnectionOverlay>();
 const runtime = new ConnectionSessionRpc({ enabled: async()=>true, isRegistered:async r=>r===root||r===other, createOverlay:(r,h,c)=>{ const o=createTemporaryOverlay(r,h,c);overlays.set(h,o);return o; }, dropOverlay:o=>o.close() });
 _setTaskScopeDepsForTest({listRepos:async()=>[],findEntitiesByFile:async()=>[],listEntitiesForRepo:async()=>[],loadConnections:async()=>{throw new Error('saved enumeration forbidden');}});
 const owners=[];
 try {
  for(const [index,selected] of [root,root,other].entries()) {
   const marker='owner_'+index, database=new DatabaseSync(join(selected,marker+'.sqlite'));database.exec(`CREATE TABLE data(${marker} TEXT); INSERT INTO data VALUES ('${marker}')`);database.close();
   const lifetime=new RequestLifetime(), context={connectionIdentity:randomUUID(),daemonEpoch:'fixture',signal:lifetime.signal,registerDrain:lifetime.registerDrain,assertRequestActive:lifetime.assertActive};
   const opened=await runtime.call('db.connections.v2.session.open',{repoRoot:selected},context) as {sessionHandle:string}; assert.ok(opened.sessionHandle);
   const overlay=overlays.get(opened.sessionHandle)!;
   overlay.commit(await overlay.prepare({key:{repoRoot:selected,scope:'temporary',id:'same'},mode:'create',publicPatch:{kind:'sqlite',path:marker+'.sqlite'}}));
   const execution=await runtime.executionFor(context,selected);owners.push({marker,selected,lifetime,context,execution,overlay});
  }
  for(const owner of owners) {
   const {execution,selected,marker}=owner, deps={sessionId:'fixture',repoPath:selected,requestId:1,send:()=>{},connectionExecution:execution};
   const sample=await executeTool('db_sql_sample',{connectionId:'same',target:'data',limit:1},deps);assert.equal(sample.success,true,JSON.stringify(sample));assert.ok(JSON.stringify(sample).includes(marker)); for(const sibling of owners.filter(o=>o!==owner))assert.equal(JSON.stringify(sample).includes(sibling.marker),false);
   const list=await getTool('db_list_connections')!.execute({},deps);assert.deepEqual((list.data as {id:string}[]).map(c=>c.id),['same']);
   const drift=await dataSchemaDriftTool.execute({connectionId:'same',target:'data'},deps);assert.equal(drift.success,true);assert.ok(drift.output.includes(marker));
   const intent={target:'data' as const,scope:'S' as const,focused:false,scopeRef:{kind:'repo' as const,value:selected},reasoning:'fixture'};
   for(const [consumer,template,params,produces] of [[dataDiscoveryConnectionsRuntime,'data.discovery.connections',{},'connections'],[dataDiscoveryObjectsRuntime,'data.discovery.objects',{connectionId:'same'},'objects'],[dataSchemaTableRuntime,'data.schema.table',{connectionId:'same',table:'data'},'schema']] as const) {
    const args:TemplateExecuteArgs={connectionExecution:execution,intent,task:{taskId:'t',template,kind:'leaf',params,produces:[produces],rationale:'fixture'},upstreamOutputs:new Map(),runId:'fixture'};
    const result=await consumer.execute(args);assert.ok(result.outputs.size>0);if(consumer===dataSchemaTableRuntime)assert.ok(JSON.stringify([...result.outputs]).includes(marker));
    await assert.rejects(consumer.execute({...args,connectionExecution:{...execution} as ConnectionExecutionContext}),{code:'session-expired'});
   }
   const ctx={connectionExecution:execution,repoPath:selected,runId:'fixture',closureRepos:[selected],readDep:()=>undefined,ignoreFilter:permissiveIgnoreFilter(selected)};
   const exp={id:'e',type:'db.table.describe' as const,params:{connectionId:'same',target:'data'},dependsOn:[],rationale:'fixture'};
   const described=await runDbTableDescribe(exp,ctx);assert.equal(described.columns[0]?.name,marker);
   const executionArgs={connectionExecution:execution,runId:'relay-'+marker,repoPath:selected,closureRepos:[selected],repoLastIndexedAtMs:BigInt(owners.indexOf(owner)*2+1),plan:{answerType:'structural-map',synthesisHint:'fixture',explorations:[{...exp,purpose:'carrier'}]}};
   const executed=await executePlan(executionArgs);assert.ok(JSON.stringify(executed).includes(marker));assert.equal(JSON.stringify(executed).includes('session-expired'),false);
   // A fresh key exercises the multi-turn deterministic runner rather than a cache hit.
   const stepped=await stepPlan({...executionArgs,repoLastIndexedAtMs:BigInt(owners.indexOf(owner)*2+2)});assert.ok(JSON.stringify(stepped).includes(marker));
   const task={taskId:'schema',template:'data.schema.table',kind:'leaf' as const,params:{connectionId:'same',table:'data'},produces:['table-schema'],rationale:'carrier'};
   const walked=await runExecutor({connectionExecution:execution,intent,runId:'walker-'+marker,tree:{plan:{planId:'fixture',goal:'carrier',tasks:[task]},children:new Map(),childErrors:new Map()}});assert.equal(walked.root.tasksCompleted,1);assert.ok(JSON.stringify([...walked.root.perTask]).includes(marker));

   const tables=await runDbTablesList({...exp,type:'db.tables.list'},ctx);assert.ok(JSON.stringify(tables).includes('data'));
   const listed=await runDbConnectionsList({...exp,type:'db.connections.list'},ctx);assert.ok(JSON.stringify(listed).includes('same'));
   await assert.rejects(executeTool('db_sql_sample',{connectionId:'same',target:'data'}, {...deps,repoPath:selected===root?other:root}),{code:'session-expired'});
   await runInStepContext({cwd:selected,connectionExecution:execution},async()=>{
    await assert.rejects(getTool('db_list_connections')!.execute({}, {...deps,connectionExecution:undefined}),{code:'session-expired'});
    await assert.rejects(runDbConnectionsList(exp,{...ctx,connectionExecution:undefined}),{code:'session-expired'});
   });
   assert.equal(owner.overlay.read('same').revision.length>0,true);
  }
  await saveConnections(root,{connections:[{id:'saved',kind:'sqlite',path:join(root,'owner_0.sqlite')}]});
  const savedDeps={sessionId:'fixture',repoPath:root,requestId:1,send:()=>{}};
  const savedSample=await executeTool('db_sql_sample',{connectionId:'saved',target:'data',limit:1},savedDeps);assert.equal(savedSample.success,true);assert.ok(savedSample.output.includes('owner_0'));
  const savedCtx={repoPath:root,runId:'saved',closureRepos:[root],readDep:()=>undefined,ignoreFilter:permissiveIgnoreFilter(root)};
  const savedExp={id:'e',type:'db.table.describe' as const,params:{connectionId:'saved',target:'data'},dependsOn:[],rationale:'saved control'};
  assert.equal((await runDbTableDescribe(savedExp,savedCtx)).columns[0]?.name,'owner_0');
  assert.ok(JSON.stringify(await runDbTablesList({...savedExp,type:'db.tables.list'},savedCtx)).includes('data'));
  assert.ok(JSON.stringify(await runDbConnectionsList({...savedExp,type:'db.connections.list'},savedCtx)).includes('saved'));
  assert.equal((await runDbTableDescribe(savedExp,{...savedCtx,connectionExecution:owners[0]!.execution})).columns[0]?.name,'owner_0');
  const first=owners[0]!;
  let started!:()=>void, proceed!:()=>void;
  const entered=new Promise<void>(r=>{started=r;}), held=new Promise<void>(r=>{proceed=r;});
  const original=SqliteDriver.prototype.sample;
  const spy=mock.method(SqliteDriver.prototype,'sample',async function(this:SqliteDriver,...args:Parameters<typeof original>){const result=await original.apply(this,args);started();await held;return result;});
  let settled=false;
  const work=getTool('db_sql_sample')!.execute({connectionId:'same',target:'data',limit:1},{sessionId:'fixture',repoPath:root,requestId:1,send:()=>{},connectionExecution:first.execution}).finally(()=>{settled=true;});
  try {
   await entered;assert.equal(settled,false);
   await assert.rejects(first.overlay.prepare({key:{repoRoot:root,scope:'temporary',id:'same'},mode:'update',expectedRevision:first.overlay.read('same').revision,publicPatch:{label:'held'}}),{code:'busy'});
   proceed();assert.equal((await work).success,true);
  } finally {proceed();await work;spy.mock.restore();}
  for(const [index,owner] of owners.slice(0,2).entries()) {
   let describeStarted!:()=>void, describeProceed!:()=>void;
   const describing=new Promise<void>(r=>{describeStarted=r;}), describeHeld=new Promise<void>(r=>{describeProceed=r;});
   const originalDescribe=SqliteDriver.prototype.describe;
   const describeSpy=mock.method(SqliteDriver.prototype,'describe',async function(this:SqliteDriver,...args:Parameters<typeof originalDescribe>){const value=await originalDescribe.apply(this,args);describeStarted();await describeHeld;return value;});
   const late=index===0?runDbTableDescribe(savedExp,{...savedCtx,connectionExecution:owner.execution}):dataSchemaTableRuntime.execute({connectionExecution:owner.execution,intent:{target:'data',scope:'S',focused:false,scopeRef:{kind:'repo',value:root},reasoning:'late saved runtime'},task:{taskId:'late',template:'data.schema.table',kind:'leaf',params:{connectionId:'saved',table:'data'},produces:['table-schema'],rationale:'fixture'},upstreamOutputs:new Map(),runId:'late'});
   const rejection=assert.rejects(late,{code:'session-expired'});
   try { await describing;owner.lifetime.abort();const pool=await acquirePool(root);assert.ok(pool.leaseState('saved').active>0);describeProceed();await rejection;assert.equal(pool.leaseState('saved').active,0); }
   finally {describeProceed();await rejection;describeSpy.mock.restore();}
  }
  const fileOwner=owners[2]!, filePath=join(other,'rows.csv');await writeFile(filePath,'n\n1\n');
  const fileEntry=fileOwner.overlay.commit(await fileOwner.overlay.prepare({key:{repoRoot:other,scope:'temporary',id:'files'},mode:'create',publicPatch:{kind:'csv',path:'rows.csv'}}));
  let fileStarted!:()=>void,fileProceed!:()=>void;const fileEntered=new Promise<void>(r=>{fileStarted=r;}),fileHeld=new Promise<void>(r=>{fileProceed=r;});
  const originalStat=fsPromises.stat;
  const statSpy=mock.method(fsPromises,'stat',async (...args:Parameters<typeof originalStat>)=>{if(args[0]===filePath){fileStarted();await fileHeld;}return originalStat(...args);});syncBuiltinESMExports();
  const listing=getTool('db_file_list_files')!.execute({connectionId:'files'},{sessionId:'fixture',repoPath:other,requestId:1,send:()=>{},connectionExecution:fileOwner.execution});const refusedListing=listing.then(result=>{assert.equal(result.success,false);assert.equal(result.error,'session-expired');assert.equal(result.data,undefined);});
  let ending:Promise<unknown>|undefined;
  try {
   await fileEntered;fileOwner.lifetime.abort();
   await assert.rejects(fileOwner.overlay.prepare({key:{repoRoot:other,scope:'temporary',id:'files'},mode:'update',expectedRevision:fileEntry.revision,publicPatch:{label:'busy'}}),{code:'busy'});
   ending=runtime.call('db.connections.v2.session.end',{}, {connectionIdentity:fileOwner.context.connectionIdentity,daemonEpoch:fileOwner.context.daemonEpoch});assert.equal(await Promise.race([ending.then(()=>false),delay(5,true)]),true);
   fileProceed();await refusedListing;await ending;
  } finally {fileProceed();await refusedListing;await ending;statSpy.mock.restore();syncBuiltinESMExports();}
  const poison=new Proxy({}, {get(){throw new Error('input read before authority');}});
  await assert.rejects(executeTool('db_sql_sample',poison,{sessionId:'fixture',repoPath:root,requestId:1,send:()=>{},connectionExecution:first.execution}),{code:'session-expired'});
 } finally {for(const o of owners){o.lifetime.abort();o.lifetime.complete();await o.lifetime.drained;} _setTaskScopeDepsForTest(undefined);await runtime.close();await closeAll();await closeGraphStore();PATHS.insrc=originalIns;PATHS.analyzeTaskOutput=originalTaskPath;await rm(directory,{recursive:true,force:true});}
});
