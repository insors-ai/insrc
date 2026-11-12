import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThreadServices } from '../main-services.js';
import { startWorker } from '../workers.js';
import type { StartedWorker } from '../workers.js';
import { lifecycleFor } from '../../lifecycle-registry.js';

const until=async(check:()=>boolean)=>{const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw new Error('Writer fixture timed out');await new Promise(r=>setTimeout(r,10));}};
function call(s:StartedWorker):Promise<unknown>{
 return new Promise((resolve,reject)=>{const id=Math.random().toString();const message=(raw:any)=>{if(raw?.kind!=='reply'||raw.requestId!==id)return;s.worker.off('message',message);s.worker.off('exit',exit);raw.error?reject(new Error(raw.error)):resolve(raw.result);};const exit=()=>{s.worker.off('message',message);reject(new Error('Writer exited'));};s.worker.on('message',message);s.worker.once('exit',exit);s.worker.postMessage({kind:'request',requestId:id,method:'fixture.write',params:{},stream:false});});
}
test('artifact writes share the main queue and release only after worker reclamation',async t=>{
 const repo=await mkdtemp(join(tmpdir(),'insrc-artifact-authority-')),id='CR-aaaaaaaaaaaaaaaa-s1';
 const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
 const workers:StartedWorker[]=[];
 t.after(async()=>{for(const w of workers){await w.worker.terminate();await w.reclaimed;w.disconnect();}await rm(repo,{recursive:true,force:true});});
 const make=async()=>{const barrier=new Int32Array(new SharedArrayBuffer(8));const w=await startWorker(services,'artifact-writer','__tests__/helpers/artifact-writer',{workerData:{repo,id,barrier:barrier.buffer},transferList:[]});workers.push(w);return{w,barrier};};
 const a=await make(),b=await make();const first=call(a.w).catch(()=>{});await until(()=>Atomics.load(a.barrier,0)===1);
 const second=call(b.w);await new Promise(r=>setTimeout(r,50));assert.equal(Atomics.load(b.barrier,0),0);
 assert.equal(await lifecycleFor(repo).store.exclusive('CR-bbbbbbbbbbbbbbbb-s1',async()=>true),true,'unrelated artifacts retain independent queues');
 let mainEntered=false;const main=lifecycleFor(repo).store.exclusive(id,async()=>{mainEntered=true;});
 assert.equal(mainEntered,false);
 a.w.port.close();await new Promise(r=>setTimeout(r,50));
 assert.equal(Atomics.load(b.barrier,0),0,'channel loss alone cannot release a live writer');assert.equal(mainEntered,false);
 await a.w.worker.terminate();await a.w.reclaimed;await first;
 await until(()=>Atomics.load(b.barrier,0)===1);assert.equal(mainEntered,false);
 Atomics.store(b.barrier,1,1);Atomics.notify(b.barrier,1);await second;await main;assert.equal(mainEntered,true);
});
