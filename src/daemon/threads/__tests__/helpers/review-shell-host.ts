import { Worker } from 'node:worker_threads';
import { mkdtemp,mkdir,open,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import assert from 'node:assert/strict';
import { ReviewProcessLeases } from '../../review-processes.js';
import type { ReviewNativeTransport } from '../../../../shared/review-process-bridge.js';
import type { ReviewProcessReservation } from '../../../../shared/review-native.js';

export async function shellWorkerFixture(t:{after:(fn:()=>Promise<void>)=>void},mode='commands'){
 const repo=await mkdtemp(join(tmpdir(),'review-shell-host-')),path=join(repo,'.insrc/tmp/code-review/fixture.json');
 const events:string[]=[];let seq=0;
 const leases=new ReviewProcessLeases({daemonInstance:'shell-test',authorize:()=>{events.push('authorized');},verifyIntent:async r=>{const disk=JSON.parse(await readFile(path,'utf8'));assert.equal(disk.operationId,r.operationId);events.push('verified');}});
 const owner=leases.register({project:repo,family:'code',reviewId:'fixture'},'worker');
 const number=(r:ReviewProcessReservation)=>Number(r.operationId.split(':').at(-1));
 const save=async(value:unknown)=>{await mkdir(dirname(path),{recursive:true});const f=await open(path,'w',0o600);try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}};
 const transport:ReviewNativeTransport={resolveBinary:async c=>c,reserve:async c=>{events.push('reserved');return leases.reserve(owner,++seq,c);},saveOpenIntent:async r=>{await save(r);events.push('saved');return{checkpointPath:path,attempt:1,operationId:r.operationId,workerIncarnation:r.workerIncarnation,daemonInstance:r.daemonInstance};},start:async(r,receipt,consume)=>leases.start(owner,number(r),receipt,consume).result,waitStarted:r=>leases.waitStarted(owner,number(r)),write:(r,b,end)=>leases.write(owner,number(r),b,end),cancel:r=>leases.cancel(owner,number(r)),saveClosedIntent:async()=>{events.push('closed');await save({closed:true});}};
 const endpoint={...transport,waitStarted:async(r:ReviewProcessReservation)=>({spawned:(await transport.waitStarted(r)).spawned})};
 const worker=new Worker(new URL('../../../tools/__tests__/helpers/review-shell-worker.mjs',import.meta.url),{workerData:{role:'review',mode,repo,guard:new URL('../../../../shared/review-native-guard.ts',import.meta.url).href,shell:new URL('../../../tools/shell-helper.ts',import.meta.url).href,bridge:new URL('../../../../shared/review-process-bridge.ts',import.meta.url).href,signal:new URL('../../../tools/tool-signal.ts',import.meta.url).href}});
 let ack=0,active!:()=>void;const pending=new Map<number,{resolve:()=>void;reject:(e:Error)=>void}>();
 const activity=new Promise<void>(r=>{active=r;});
 const result=new Promise<any>((resolve,reject)=>{
  worker.once('error',reject);worker.on('message',async m=>{
   if(m.kind==='active')active();
   if(m.kind==='done'){if(m.error)reject(Error(m.error));else resolve(m.value);}
   if(m.kind==='ack'){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error));else p?.resolve();}
   if(m.kind==='request')try{
    let value;
    if(m.op==='start')value=await transport.start(m.args.r,m.args.receipt,output=>new Promise<void>((resolve,reject)=>{const id=++ack;pending.set(id,{resolve,reject});worker.postMessage({kind:'output',id,output});}));
    else if(m.op==='write')value=await transport.write(m.args.r,m.args.bytes,m.args.end);
    else value=await (endpoint[m.op as keyof ReviewNativeTransport] as (args:unknown)=>Promise<unknown>)(m.args);
    worker.postMessage({kind:'reply',id:m.id,value});
   }catch(e){worker.postMessage({kind:'reply',id:m.id,error:String(e)});}
  });
 });
 const closed=new Promise<Awaited<ReturnType<typeof leases.close>>>(resolve=>worker.once('exit',()=>{for(const p of pending.values())p.reject(Error('worker ended'));pending.clear();void leases.close(owner).then(resolve);}));
 t.after(async()=>{await worker.terminate();await closed;if(leases.recheck(owner))leases.release(owner);await rm(repo,{recursive:true,force:true});});
 return{repo,worker,result,closed,activity,events,leases,owner};
}
