import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { SqliteDriver } from '../../../db/drivers/sqlite.js';
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises';
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
   const tables=await runDbTablesList({...exp,type:'db.tables.list'},ctx);assert.ok(JSON.stringify(tables).includes('data'));
   const listed=await runDbConnectionsList({...exp,type:'db.connections.list'},ctx);assert.ok(JSON.stringify(listed).includes('same'));
   assert.equal((await executeTool('db_sql_sample',{connectionId:'same',target:'data'}, {...deps,repoPath:selected===root?other:root})).success,false);
   await runInStepContext({cwd:selected,connectionExecution:execution},async()=>{
    await assert.rejects(getTool('db_list_connections')!.execute({}, {...deps,connectionExecution:undefined}),{code:'session-expired'});
    await assert.rejects(runDbConnectionsList(exp,{...ctx,connectionExecution:undefined}),{code:'session-expired'});
   });
   assert.equal(owner.overlay.read('same').revision.length>0,true);
  }
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
  first.lifetime.abort();
  const poison=new Proxy({}, {get(){throw new Error('input read before authority');}});
  await assert.rejects(executeTool('db_sql_sample',poison,{sessionId:'fixture',repoPath:root,requestId:1,send:()=>{},connectionExecution:first.execution}),{code:'session-expired'});
 } finally {for(const o of owners){o.lifetime.abort();o.lifetime.complete();await o.lifetime.drained;} _setTaskScopeDepsForTest(undefined);await runtime.close();await rm(directory,{recursive:true,force:true});}
});
