import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createIpcClient } from '../../shared/ipc-client.js';
import { IpcServer, directDispatch } from '../server.js';
import { buildHandlerRuntime } from '../handler-runtime.js';

const digest=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
test('real IPC unavailable calls preserve history and the VS Code client fails without polling',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'retired-review-wire-')),socket=join(dir,'daemon.sock');
 const blocked=new Proxy({},{get(){throw new Error('Retired review touched a dependency');}}) as never;
 const runtime=buildHandlerRuntime({db:blocked,configStore:blocked,queue:blocked,indexer:blocked,startedAt:0,shutdown:()=>{},attachedClients:()=>[],understandingService:()=>undefined});
 const calls:string[]=[];
 const dispatch=directDispatch(runtime.rpcHandlers,runtime.streamHandlers);
 const server=new IpcServer((request,send)=>{calls.push(request.method);return dispatch(request,send);},Date.now,socket);
 const fixture='src/workflow/review-history/__tests__/fixtures/stored-reviews.json.gz',before=digest(fixture);
 await server.listen();
 try{
  const client=createIpcClient(()=>createConnection(socket));
  for(const method of ['designReview.start','codeReview.task.start','workflow.reviewArtifact']){
   const family=method.startsWith('codeReview.')?'Code':'Design';
   await assert.rejects(client.rpc(method,{repo:'/does-not-exist'}),{message:`${family} review functionality is being rewritten.`});
  }
  await new Promise(r=>setTimeout(r,40));
  assert.deepEqual(calls,['designReview.start','codeReview.task.start','workflow.reviewArtifact']);
  assert.equal(digest(fixture),before);
 }finally{server.disconnectClients();await server.close();rmSync(dir,{recursive:true,force:true});}
});
