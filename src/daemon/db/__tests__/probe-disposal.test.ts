import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {getFactory} from '../registry.js';
import '../drivers/cassandra.js';import '../drivers/nats.js';import '../drivers/mongodb.js';import '../drivers/etcd.js';import '../drivers/memcached.js';
test('CM-S2-A8: admitted KV drivers propagate SDK disposal failures instead of reporting successful cleanup',async()=>{
 const configurations=[{id:'c',kind:'cassandra',options:{contactPoints:['127.0.0.1:1']}},{id:'n',kind:'nats',options:{servers:['nats://127.0.0.1:1'],bucket:'fixture'}},{id:'m',kind:'mongodb',url:'mongodb://127.0.0.1:1/fixture'},{id:'e',kind:'etcd',options:{hosts:['http://127.0.0.1:1']}},{id:'k',kind:'memcached',options:{servers:['127.0.0.1:1']}}];
 for(const config of configurations){
  const driver=await getFactory(config.kind)!(config),failure=new Error('PRIVATE_DISPOSAL_CANARY');
  if(config.kind==='nats'){
   Reflect.set(driver,'ncPromise',Promise.resolve({close:async()=>{throw failure;}}));
   try{await assert.rejects(driver.close(),error=>error===failure);}finally{Reflect.set(driver,'ncPromise',null);await driver.close();}
  }else{
   const client=Reflect.get(driver,'client') as object,method=config.kind==='cassandra'?'shutdown':'close';
   const spy=mock.method(client,method as never,(()=>{throw failure;}) as never);
   try{await assert.rejects(driver.close(),error=>error===failure);}finally{spy.mock.restore();await driver.close();}
  }
 }
});

test('CM-S4-BUSY: actual temporary edit probe holds its revision through cancel timeout late result and child failure drain',async()=>{
 const {mkdtemp,rm,realpath}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{fork}=await import('node:child_process'),{fileURLToPath}=await import('node:url'),{randomUUID}=await import('node:crypto');
 await import('../drivers/index.js');
 const {ConnectionSessionRpc}=await import('../../connection-session-rpc.js'),{createTemporaryOverlay}=await import('../session-entries.js'),{RequestLifetime}=await import('../../request-context.js'),{DraftTestSupervisor}=await import('../draft-test.js');
 const root=await realpath(await mkdtemp(join(tmpdir(),'cm-probe-lease-')));
 try{for(const mode of ['cancel','timeout','late','spawn-failure','constructor-failure']){
  let overlay!:import('../session-entries.js').TemporaryConnectionOverlay;
  const runtime=new ConnectionSessionRpc({enabled:async()=>true,isRegistered:async()=>true,createOverlay:(...args)=>{overlay=createTemporaryOverlay(...args);return overlay;},dropOverlay:value=>value.close()});
  const lifetime=new RequestLifetime(),context={connectionIdentity:randomUUID(),daemonEpoch:'epoch',signal:lifetime.signal,registerDrain:lifetime.registerDrain};
  let child:ReturnType<typeof fork>|undefined,announce!:()=>void;const started=new Promise<void>(resolve=>{announce=resolve;});
  const supervisor=new DraftTestSupervisor((entry,options)=>{
   if(mode==='spawn-failure'){announce();throw new Error('PRIVATE_SPAWN_CANARY');}
   child=mode==='constructor-failure'?fork(entry,[],options):fork(fileURLToPath(new URL('./fixtures/probe-lifecycle-child.ts',import.meta.url)),[],{...options,execArgv:['--import','tsx'],env:{...options.env,CM_PROBE_FIXTURE_MODE:mode==='late'?'late':'hang'}});
   child.once('spawn',announce);if(mode==='late')child.once('message',()=>lifetime.abort());return child;
  });
  try{
   const opened=await runtime.call('db.connections.v2.session.open',{repoRoot:root},context);assert.ok((opened as {sessionHandle?:string}).sessionHandle,JSON.stringify(opened));
   const key={repoRoot:root,scope:'temporary' as const,id:'row'},row=overlay.commit(await overlay.prepare({key,mode:'create',publicPatch:{kind:'postgres',endpoint:'postgres://host/db'}}));
   const request={requestId:randomUUID(),draftRevision:1,key,expectedRevision:row.revision,publicPatch:{},credentials:{}};
   const pending=supervisor.run(request,context,async(signal,drained)=>{
    const effective=await runtime.prepareTemporary(request,context,signal,drained);
    return mode==='constructor-failure'?{...effective,config:{id:'row',kind:'postgres',url:'invalid-url'}}:effective;
   });
   await started;
   if(mode==='cancel'||mode==='timeout'||mode==='late')assert.throws(()=>overlay.prepareRemoval({id:'row',expectedRevision:row.revision}),{code:'busy'});
   if(mode==='cancel')supervisor.cancel({requestId:request.requestId},context);
   const result=await pending;assert.equal(result.status,mode==='timeout'?'timeout':mode==='cancel'||mode==='late'?'canceled':'failed');
   if(mode==='cancel'||mode==='timeout'||mode==='late')assert.throws(()=>overlay.prepareRemoval({id:'row',expectedRevision:row.revision}),{code:'busy'});
   lifetime.complete();await lifetime.drained;await new Promise(resolve=>setImmediate(resolve));
   assert.equal(supervisor.activeCount,0);
   if(child)assert.ok(child.exitCode!==null||child.signalCode!==null,'owned child has actually exited');
   const token=overlay.prepareRemoval({id:'row',expectedRevision:row.revision});overlay.cancelRemoval(token);
   assert.equal(overlay.read('row').revision,row.revision);
  }finally{lifetime.abort();lifetime.complete();await supervisor.shutdown();await runtime.close();}
 }}finally{await rm(root,{recursive:true,force:true});}
});
