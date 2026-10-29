/** Test-only process for actual JVM Project services against the daemon's real session authority. */
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { CONNECTION_SESSION_METHODS } from '../../connection-management.js';
import { ConnectionSessionRpc } from '../../../daemon/connection-session-rpc.js';
import { createTemporaryOverlay } from '../../../daemon/db/session-entries.js';
import { IpcServer, directDispatch } from '../../../daemon/server.js';
import type { RpcHandlers } from '../../../daemon/server.js';
import '../../../daemon/db/drivers/index.js';

const dir=process.argv[2]!;const roots=[join(dir,'a'),join(dir,'b')];for(const root of roots)mkdirSync(root,{recursive:true});
let now=0,opened=0,ended=0,attached=0,heartbeats=0,resumed=0,reading=0,active=0;
const runtime=new ConnectionSessionRpc({enabled:async()=>true,monotonicNow:()=>now,isRegistered:async root=>roots.includes(root),
 createOverlay:(root,handle,context)=>{active++;return createTemporaryOverlay(root,handle,context);},dropOverlay:async overlay=>{active--;await overlay.close();}});
const handlers:RpcHandlers=Object.fromEntries(CONNECTION_SESSION_METHODS.map(method=>[method,async(params,context)=>{
 const reply=await runtime.call(method,params,context!);
 if(!('status' in (reply as object))||(reply as {status:string}).status!=='rejected'){
  if(method.endsWith('.open'))opened++;if(method.endsWith('.end'))ended++;if(method.endsWith('.attach'))attached++;if(method.endsWith('.heartbeat'))heartbeats++;if(method.endsWith('.resume'))resumed++;
 }return reply;
}]));
handlers['db.connections.v2.capabilities']=async(_params,context)=>({version:2,daemonEpoch:context!.daemonEpoch,features:['safe-read','driver-descriptors','workbench-sessions','session-delegation'],receiptRetentionDays:30});
handlers['db.connections.v2.list']=async(params,context)=>{
 if(context!.connectionSession)await runtime.accessFor(context!,(params as {repoRoot:string}).repoRoot);
 return [];
};
handlers['db.connections.v2.read']=async()=>{reading++;return await new Promise(()=>{});};
// Fixture-only unclaimed observer; never registered by the production daemon or allowed by a manager owner.
handlers['fixture.stats']=async()=>({opened,ended,attached,heartbeats,resumed,reading,active});
handlers['fixture.clock']=async params=>{now=(params as {now:number}).now;return {now};};
const server=new IpcServer(runtime.forward(directDispatch(handlers)),()=>now,join(dir,'daemon.sock'));
server.onConnectionClose(context=>runtime.disconnect(context));await server.listen();
process.stdout.write('INSRC_PROJECT_FIXTURE_READY\n');
createInterface({input:process.stdin}).on('line',line=>{if(line==='stop')void(async()=>{await server.close();await runtime.close();process.exit(0);})();});
