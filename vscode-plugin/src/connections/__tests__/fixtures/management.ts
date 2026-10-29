/** Shared real daemon/session/Saved management peer for client effect tests. */
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { environment } from '../../../../../src/daemon/db/__tests__/fixtures/saved-management-fixture.js';
import { ConnectionSessionRpc } from '../../../../../src/daemon/connection-session-rpc.js';
import { connectionManagementHandlers } from '../../../../../src/daemon/connection-management-rpc.js';
import { IpcServer, directDispatch } from '../../../../../src/daemon/server.js';
import { createTemporaryOverlay } from '../../../../../src/daemon/db/session-entries.js';
import { contextualDriverFactory } from '../../../../../src/daemon/db/driver-log-policy.js';
import { _setPoolForTests, closeAll } from '../../../../../src/daemon/db/pool-cache.js';
import type { Driver } from '../../../../../src/shared/db-driver.js';
import type { MutationRequest } from '../../../../../src/shared/connection-management.js';
import { openIpcLane } from '../../../../../src/shared/ipc-client.js';
import type { PersistentIpcLane } from '../../../../../src/shared/ipc-client.js';
import { ConnectionDraft } from '../../../../../src/shared/connection-manager/draft.js';
import { decodeDriverDescriptors } from '../../../../../src/shared/connection-manager/wire.js';
import { loadConnectionCorpus } from '../../../../../src/shared/__tests__/fixtures/connection-corpus.js';
import { ConnectionsWorkbenchOwner } from '../../session-owner.js';
import { createConnectionsMutationController } from '../../gateway.js';

const PREFIX='db.connections.v2.';
export async function managementFixture() {
 const env=await environment(),f=await env.rootFixture('root');_setPoolForTests(f.root,f.pool);
 const lanes:PersistentIpcLane[]=[],requests:string[]=[],calls:string[]=[],removalRequests:{method:string;params:unknown}[]=[],held=new Set<Promise<unknown>>();
 let fault:'none'|'before'|'after'|'malformed'|'pending'='none',refreshFail=false,statusMalformed=false,ticketMalformed=false;
 const runtime=new ConnectionSessionRpc({enabled:async()=>true,removalEnabled:async()=>true,isRegistered:async root=>root===f.root,
  createOverlay:(root,handle,context)=>createTemporaryOverlay(root,handle,context,{factory:()=>contextualDriverFactory(async config=>({id:config.id,kind:config.kind,family:'rdbms',close:async()=>{},describe:async()=>({columns:[]})}) as Driver)}),dropOverlay:overlay=>overlay.close()});
 const handlers=connectionManagementHandlers({sessionRuntime:runtime,enabled:async()=>true,removalEnabled:async()=>true,isRegistered:async root=>root===f.root});
 const baseMutate=handlers[PREFIX+'mutate']!,baseList=handlers[PREFIX+'list']!,baseStatus=handlers[PREFIX+'status']!,baseActivate=handlers[PREFIX+'activate']!,baseTicket=handlers[PREFIX+'ticket']!;
 handlers[PREFIX+'ticket']=async(params,context)=>{calls.push('ticket');const result=await baseTicket(params,context);return ticketMalformed?{...(result as object),connectionId:'wrong-target'}:result;};
 handlers[PREFIX+'mutate']=async(params,context)=>{
  calls.push('mutate');requests.push(JSON.stringify(params));const selected=fault;fault='none';
  if(selected==='before')throw new Error('fixture lost response before effect');
  if(selected==='pending'){
   const work=baseMutate(params,context);held.add(work);void work.then(()=>held.delete(work),()=>held.delete(work));
   throw new Error('fixture lost response during admitted work');
  }
  const result=await baseMutate(params,context);
  if(selected==='after')throw new Error('fixture lost response after effect');
  if(selected==='malformed'&&(result as {status:string}).status==='committed')return{...(result as object),value:{...(result as {value:object}).value,operationId:randomUUID()}};
  return result;
 };
 handlers[PREFIX+'list']=async(params,context)=>{calls.push('list');if(refreshFail)throw new Error('fixture read failure');return await baseList(params,context);};
 handlers[PREFIX+'status']=async(params,context)=>{calls.push('status');return statusMalformed?{status:'committed',value:{}}:await baseStatus(params,context);};
 handlers[PREFIX+'activate']=async(params,context)=>{calls.push('activate');return await baseActivate(params,context);};
 for(const method of ['removalState','retryRemovalCleanup']){
  const base=handlers[PREFIX+method]!;handlers[PREFIX+method]=async(params,context)=>{calls.push(method);removalRequests.push({method,params});return await base(params,context);};
 }
 const server=new IpcServer(runtime.forward(directDispatch(handlers)),Date.now,join(env.directory,'daemon.sock'));
 server.onConnectionClose(context=>runtime.disconnect(context));await server.listen();
 const owner=new ConnectionsWorkbenchOwner({openLane:()=>{const lane=openIpcLane({connect:()=>createConnection(join(env.directory,'daemon.sock'))});lanes.push(lane);return lane;}});
 owner.setRegisteredRoots([f.root]);await owner.selectRoot(f.root);
 const timers=new Map<number,()=>void>(),delays:number[]=[];let sequence=0;
 const controller=createConnectionsMutationController(owner,{now:()=>f.clock.value,timer:(callback,delay)=>{const id=++sequence;delays.push(delay);timers.set(id,callback);return{dispose:()=>{timers.delete(id);}};}});
 const descriptor=decodeDriverDescriptors(loadConnectionCorpus().driverDescriptors).find(d=>d.kind==='postgres')!;
 const draft=(id:string,scope:'saved'|'temporary'='saved')=>{const draft=new ConnectionDraft(descriptor,{repoRoot:f.root,scope,id});draft.setField(['endpoint'],'postgres://fixture.invalid/db');draft.setCredential('url.password','replace','fixture-only-private-replacement');return draft;};
 return {f,owner,controller,calls,requests,removalRequests,timers,delays,draft,setFault:(value:typeof fault)=>{fault=value;},setRefreshFail:(value:boolean)=>{refreshFail=value;},setStatusMalformed:(value:boolean)=>{statusMalformed=value;},
  setTicketMalformed:(value:boolean)=>{ticketMalformed=value;},drain:async()=>{for(const work of held)await work;},
  nextTimer:()=>{const [id,callback]=timers.entries().next().value!;timers.delete(id);callback();},
  close:async()=>{for(const work of held)await work;controller.dispose();owner.dispose();await owner.whenDisposed();for(const lane of lanes)lane.dispose();await server.close();await runtime.close();await closeAll();await env.cleanup();}};
}
