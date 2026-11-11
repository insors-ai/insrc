import { Worker } from 'node:worker_threads';
import { mkdtemp,mkdir,open,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname } from 'node:path';
import assert from 'node:assert/strict';
import { ChildProcess,execFileSync } from 'node:child_process';
import { writeFile,rename } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { ReviewProcessLeases } from '../../review-processes.js';
import { spawnManaged } from '../../../tools/shell-helper.js';
import { observeOwnedProcessDisposal } from '../../../../shared/process-group.js';
import type { ReviewNativeTransport } from '../../../../shared/review-process-bridge.js';
import type { ReviewProcessReservation } from '../../../../shared/review-native.js';

export async function shellWorkerFixture(t:{after:(fn:()=>Promise<void>)=>void},mode='commands',shared?:ReviewProcessLeases){
 const repo=await mkdtemp(join(tmpdir(),'review-shell-host-')),path=join(repo,'.insrc/tmp/code-review/fixture.json');
 const events:string[]=[];let seq=0;
 const leases=shared??new ReviewProcessLeases({daemonInstance:'shell-test',authorize:()=>{events.push('authorized');},verifyIntent:async r=>{const disk=JSON.parse(await readFile(join(r.key.project,'.insrc/tmp/code-review',`${r.key.reviewId}.json`),'utf8'));assert.ok(disk.openLeases.some((lease:ReviewProcessReservation)=>lease.operationId===r.operationId&&lease.workerIncarnation===r.workerIncarnation));events.push('verified');},launch:(command,signal)=>{
  if(command.command==='/review-unknown-fixture'){
   const child=new ChildProcess();child.stdout=new PassThrough();child.stderr=new PassThrough();
   return{spawned:true,child,settled:Promise.resolve({code:null,signal:null,timedOut:true,aborted:false}),disposal:observeOwnedProcessDisposal(child)};
  }
  return spawnManaged(command.command,command.args,{cwd:command.cwd,env:command.env,stdio:['pipe','pipe','pipe'],timeoutMs:command.timeoutMs,signal});
 }});
 const owner=leases.register({project:repo,family:'code',reviewId:'fixture'},'worker');
 const number=(r:ReviewProcessReservation)=>Number(r.operationId.split(':').at(-1));
 const save=async(value:unknown)=>{await mkdir(dirname(path),{recursive:true});const temp=path+'.pending';const f=await open(temp,'w',0o600);try{await f.writeFile(JSON.stringify(value));await f.sync();}finally{await f.close();}await rename(temp,path);const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}};
 const intents=new Map<string,ReviewProcessReservation>();let saves=Promise.resolve();
 const update=(apply:()=>void)=>{const next=saves.then(async()=>{apply();await save({openLeases:[...intents.values()]});});saves=next.catch(()=>{});return next;};
 const transport:ReviewNativeTransport={resolveBinary:async c=>c,reserve:async c=>{events.push('reserved');return leases.reserve(owner,++seq,c);},saveOpenIntent:async r=>{await update(()=>{intents.set(r.operationId,r);});events.push('saved');return{checkpointPath:path,attempt:1,operationId:r.operationId,workerIncarnation:r.workerIncarnation,daemonInstance:r.daemonInstance};},start:async(r,receipt,consume)=>leases.start(owner,number(r),receipt,consume).result,waitStarted:r=>leases.waitStarted(owner,number(r)),write:(r,b,end)=>leases.write(owner,number(r),b,end),cancel:r=>leases.cancel(owner,number(r)),saveClosedIntent:async r=>{await update(()=>{intents.delete(r.operationId);});events.push('closed');}};
 const endpoint={...transport,waitStarted:async(r:ReviewProcessReservation)=>({spawned:(await transport.waitStarted(r)).spawned})};
 const git=(...args:string[])=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');
 await writeFile(join(repo,'issue.json'),JSON.stringify({meta:{workflow:'issue',issueHash:'1234567890abcdef'},body:{title:'Fixture change',fixIntent:'Change the selected line'}}));
 await writeFile(join(repo,'source.ts'),'before\n');await writeFile(join(repo,'test.ts'),'fixture test\n');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
 await writeFile(join(repo,'source.ts'),'after\n');git('add','.');git('commit','-qm','change');const commit=git('rev-parse','HEAD');
 const packet={reviewRevision:commit,storyId:'s1',functionalSummary:'Change selected line',documents:{issue:{path:'issue.json',commit:base}},reviewSet:[{commit,parent:base,files:[{path:'source.ts',segments:[{after:[1,1]}]}]}],tests:[{file:'test.ts',cases:['fixture'],command:'fixture command',result:'pass',executionDetails:'local fixture',evidenceReferences:[`${commit}:test.ts`]}]};
 const root=new URL('../../../../../',import.meta.url);
 const worker=new Worker(new URL('../../../tools/__tests__/helpers/review-shell-worker.mjs',import.meta.url),{workerData:{role:'review',mode,repo,packet,root:root.href,guard:new URL('../../../../shared/review-native-guard.ts',import.meta.url).href,shell:new URL('../../../tools/shell-helper.ts',import.meta.url).href,bridge:new URL('../../../../shared/review-process-bridge.ts',import.meta.url).href,signal:new URL('../../../tools/tool-signal.ts',import.meta.url).href}});
 let ack=0,active!:()=>void;const pending=new Map<number,{resolve:()=>void;reject:(e:Error)=>void}>();
 const activity=new Promise<void>(r=>{active=r;});
 let seen!:()=>void,frames=0;const outputSeen=new Promise<void>(r=>{seen=r;});
 const result=new Promise<any>((resolve,reject)=>{
  worker.once('error',reject);worker.on('message',async m=>{
   if(m.kind==='active')active();
   if(m.kind==='done'){if(m.error)reject(Error(m.error+'; host events: '+events.slice(-8).join(',')));else resolve(m.value);}
   if(m.kind==='ack'){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error));else p?.resolve();}
   if(m.kind==='request')try{
    let value;
    if(m.op==='start'){value=await transport.start(m.args.r,m.args.receipt,output=>new Promise<void>((resolve,reject)=>{const id=++ack;frames++;seen();pending.set(id,{resolve,reject});worker.postMessage({kind:'output',id,output});}));if((value as {error?:unknown}).error)events.push(JSON.stringify((value as {error?:unknown}).error));}
    else if(m.op==='write')value=await transport.write(m.args.r,m.args.bytes,m.args.end);
    else value=await (endpoint[m.op as keyof ReviewNativeTransport] as (args:unknown)=>Promise<unknown>)(m.args);
    worker.postMessage({kind:'reply',id:m.id,value});
   }catch(e){worker.postMessage({kind:'reply',id:m.id,error:String(e)});}
  });
 });
 const closed=new Promise<Awaited<ReturnType<typeof leases.close>>>(resolve=>worker.once('exit',()=>{for(const p of pending.values())p.reject(Error('worker ended'));pending.clear();void leases.close(owner).then(resolve);}));
 t.after(async()=>{await worker.terminate();await closed;if(leases.recheck(owner))leases.release(owner);await rm(repo,{recursive:true,force:true});});
 return{repo,worker,result,closed,activity,events,leases,owner,outputSeen,frames:()=>frames,outstanding:()=>pending.size};
}
