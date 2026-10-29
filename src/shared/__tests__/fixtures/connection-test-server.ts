/** JVM integration peer: actual IPC/session/probe supervisor, fixture-owned preparation/delivery gates. */
import { join } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { CONNECTION_SESSION_METHODS } from '../../connection-management.js';
import type { DraftTestRequest, DraftTestResult } from '../../connection-management.js';
import { ConnectionSessionRpc } from '../../../daemon/connection-session-rpc.js';
import { createTemporaryOverlay } from '../../../daemon/db/session-entries.js';
import { DraftTestSupervisor } from '../../../daemon/db/draft-test.js';
import { IpcServer, directDispatch } from '../../../daemon/server.js';
import type { RpcHandlers } from '../../../daemon/server.js';

function gate(){let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};}
const dir=process.argv[2]!,roots=[join(dir,'a'),join(dir,'b')];for(const root of roots)mkdirSync(root,{recursive:true});
const path=join(roots[0]!,'fixture.csv');writeFileSync(path,'id,name\n1,fixture\n');const before=readFileSync(path);
const supervisor=new DraftTestSupervisor(),sources=new Set<string>(),cancelSources=new Set<string>();
const gates:ReturnType<typeof gate>[]=[];
let preparation:ReturnType<typeof gate>|null=null,delivery:ReturnType<typeof gate>|null=null,corrupt='',tests=0,cancels=0,claimed=false,matchesExpected=false;
let expected:Record<string,unknown>|null=null;
const runtime=new ConnectionSessionRpc({enabled:async()=>true,isRegistered:async root=>roots.includes(root),createOverlay:(root,handle,context)=>createTemporaryOverlay(root,handle,context),dropOverlay:overlay=>overlay.close()});
const handlers:RpcHandlers=Object.fromEntries(CONNECTION_SESSION_METHODS.map(m=>[m,(p,c)=>runtime.call(m,p,c!)]));
handlers['db.connections.v2.capabilities']=async(_p,c)=>({version:2,daemonEpoch:c!.daemonEpoch,features:['safe-read','driver-descriptors','workbench-sessions','session-delegation'],receiptRetentionDays:30});
handlers['db.connections.v2.test']=async(p,c)=>{
 const request=p as DraftTestRequest;tests++;sources.add(c!.connectionIdentity);claimed=!!c!.connectionSession;
 const {requestId:_id,draftRevision:_revision,...input}=request;
 matchesExpected=expected!==null&&isDeepStrictEqual(input,expected);
 const prepareGate=preparation,replyGate=delivery,alter=corrupt;
 const context=request.key.scope==='temporary'?await runtime.probeContext(c!,request):c!;
 const response=await supervisor.run(request,context,async()=>{if(prepareGate)await prepareGate.promise;return{config:{id:request.key.id,kind:'csv',path},credentialActions:request.credentials};});
 if(replyGate)await replyGate.promise;
 const result:DraftTestResult={...response};
 if(alter==='requestId')return{...result,requestId:randomUUID()};if(alter==='draftRevision')return{...result,draftRevision:result.draftRevision+1};
 if(alter==='repoRoot')return{...result,repoRoot:roots[1]};if(alter==='daemonEpoch')return{...result,daemonEpoch:'other-epoch'};
 if(alter==='safeMessage')return{...result,status:'failed',safeMessage:'PRIVATE_EXCEPTION_CANARY'};
 return result;
};
handlers['db.connections.v2.cancelTest']=(p,c)=>{cancels++;cancelSources.add(c!.connectionIdentity);return supervisor.cancel(p,c!);};
// Fixture-only observer/control methods never appear in production registration or a client owner allowlist.
handlers['fixture.info']=()=>({roots,path});
handlers['fixture.stats']=()=>({tests,cancels,active:supervisor.activeCount,sources:sources.size,cancelSourcesMatch:[...cancelSources].every(s=>sources.has(s)),claimed,matchesExpected});
handlers['fixture.expect']=p=>{const {mode:_mode,...input}=p as Record<string,unknown>;expected=input;return{};};
handlers['fixture.prepare']=()=>{preparation=gate();gates.push(preparation);return{};};
handlers['fixture.delivery']=()=>{delivery=gate();gates.push(delivery);return{};};
handlers['fixture.release']=()=>{for(const g of gates)g.resolve();preparation=null;delivery=null;return{};};
handlers['fixture.corrupt']=p=>{corrupt=(p as {field:string}).field;return{};};
const server=new IpcServer(runtime.forward(directDispatch(handlers)),undefined,join(dir,'daemon.sock'));server.onConnectionClose(c=>runtime.disconnect(c));await server.listen();
process.stdout.write('INSRC_PROJECT_FIXTURE_READY\n');
createInterface({input:process.stdin}).on('line',line=>{if(line==='stop')void(async()=>{
 for(const g of gates)g.resolve();await supervisor.shutdown();await server.close();await runtime.close();
 if(!readFileSync(path).equals(before))process.exit(1);process.exit(0);
})();});
