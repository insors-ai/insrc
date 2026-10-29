/** Test-only native-client peer using actual signed tickets, receipts and session ownership. */
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { environment } from '../../../daemon/db/__tests__/fixtures/saved-management-fixture.js';
import { ConnectionSessionRpc } from '../../../daemon/connection-session-rpc.js';
import { connectionManagementHandlers } from '../../../daemon/connection-management-rpc.js';
import { createTemporaryOverlay } from '../../../daemon/db/session-entries.js';
import { contextualDriverFactory } from '../../../daemon/db/driver-log-policy.js';
import { _setPoolForTests, closeAll } from '../../../daemon/db/pool-cache.js';
import { IpcServer, directDispatch } from '../../../daemon/server.js';
import type { Driver } from '../../db-driver.js';
import type { MutationRequest } from '../../connection-management.js';

const dir=process.argv[2]!,env=await environment(),f=await env.rootFixture('managed');_setPoolForTests(f.root,f.pool);
let now=0,fault='none',refreshFail=false,activationFail=false,cleanupFail=false,afterCommit=false;
let tickets=0,mutations=0,statuses=0,activations=0,lists=0,identicalReplay=true;
const firstRequests=new Map<string,string>(),held=new Set<Promise<unknown>>();
let release:(()=>void)|undefined;
const recover=f.generations.recover.bind(f.generations);
f.generations.recover=async()=>{if(cleanupFail&&afterCommit)throw new Error('fixture cleanup failure');return await recover();};
f.hooks.writer=async stage=>{if(stage==='after-rename')afterCommit=true;};
f.hooks.activate=async()=>{if(activationFail)throw new Error('fixture activation failure');};
const runtime=new ConnectionSessionRpc({enabled:async()=>true,removalEnabled:async()=>true,monotonicNow:()=>now,isRegistered:async root=>root===f.root,
 createOverlay:(root,handle,context)=>createTemporaryOverlay(root,handle,context,{factory:()=>contextualDriverFactory(async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>{},describe:async()=>({columns:[]})}) as Driver)}),dropOverlay:overlay=>overlay.close()});
const P='db.connections.v2.',handlers=connectionManagementHandlers({sessionRuntime:runtime,enabled:async()=>true,removalEnabled:async()=>true,isRegistered:async root=>root===f.root});
const baseTicket=handlers[P+'ticket']!,baseMutate=handlers[P+'mutate']!,baseStatus=handlers[P+'status']!,baseActivate=handlers[P+'activate']!,baseList=handlers[P+'list']!;
handlers[P+'ticket']=async(params,context)=>{tickets++;return await baseTicket(params,context);};
handlers[P+'mutate']=async(params,context)=>{
 mutations++;const request=params as MutationRequest,bytes=JSON.stringify(params),prior=firstRequests.get(request.operationId);
 if(prior!==undefined)identicalReplay&&=prior===bytes;else firstRequests.set(request.operationId,bytes);
 const selected=fault;fault='none';
 if(selected==='before')throw new Error('fixture lost response before effect');
 if(selected==='pending'){
  const gate=new Promise<void>(resolve=>{release=resolve;});f.hooks.stage=async()=>{await gate;};
  const work=baseMutate(params,context);held.add(work);void work.then(()=>held.delete(work),()=>held.delete(work));throw new Error('fixture lost response while pending');
 }
 const result=await baseMutate(params,context);
 if(selected==='after')throw new Error('fixture lost response after effect');
 if(selected==='malformed'&&(result as {status:string}).status==='committed')return{...(result as object),value:{...(result as {value:object}).value,operationId:randomUUID()}};
 return result;
};
handlers[P+'status']=async(params,context)=>{statuses++;return await baseStatus(params,context);};
handlers[P+'activate']=async(params,context)=>{activations++;return await baseActivate(params,context);};
handlers[P+'list']=async(params,context)=>{lists++;if(refreshFail)throw new Error('fixture refresh failure');return await baseList(params,context);};
handlers['fixture.info']=async()=>({roots:[f.root],wallNow:f.clock.value});
handlers['fixture.stats']=async()=>({tickets,mutations,statuses,activations,lists,identicalReplay,savedRows:f.store.snapshot.file.connections.length});
handlers['fixture.fault']=async params=>{
 const p=params as Record<string,unknown>;
 if(typeof p['mode']==='string')fault=p['mode'];if(typeof p['refreshFail']==='boolean')refreshFail=p['refreshFail'];if(typeof p['activationFail']==='boolean')activationFail=p['activationFail'];if(typeof p['cleanupFail']==='boolean')cleanupFail=p['cleanupFail'];
 return{configured:true};
};
handlers['fixture.clock']=async params=>{now=(params as {now:number}).now;return{now};};
handlers['fixture.wallClock']=async params=>{f.clock.value=(params as {now:number}).now;return{now:f.clock.value};};
handlers['fixture.release']=async()=>{release?.();await Promise.allSettled([...held]);f.hooks.stage=undefined;return{released:true};};
const server=new IpcServer(runtime.forward(directDispatch(handlers)),()=>now,join(dir,'daemon.sock'));
server.onConnectionClose(context=>runtime.disconnect(context));await server.listen();
process.stdout.write('INSRC_PROJECT_FIXTURE_READY\n');
createInterface({input:process.stdin}).on('line',line=>{if(line==='stop')void(async()=>{
 release?.();await Promise.allSettled([...held]);await server.close();await runtime.close();await closeAll();await env.cleanup();process.exit(0);
})();});
