import { isDeepStrictEqual } from 'node:util';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';
import { IpcServer, directDispatch } from '../../../../daemon/server.js';
import { exchangeControllerTaskReview, startTaskReview, readTaskReviewProgress } from '../../../../daemon/task-review-rpc.js';
import type { LLMProvider } from '../../../../shared/types.js';
import { MessageChannel } from 'node:worker_threads';
import { ProductionReviews,installProductionReviews } from '../../../../daemon/review-service.js';
import { ThreadServices } from '../../../../daemon/threads/main-services.js';
import { startReviewWorkerBootstrap } from '../../../../daemon/threads/review-worker-bootstrap.js';
import { startWorker } from '../../../../daemon/threads/workers.js';
export async function channel(path:string){
 const socket=createConnection(path);await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 let next=0,buffer='';
 const pending=new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
 socket.setEncoding('utf8');socket.on('data',(data:string)=>{buffer+=data;const lines=buffer.split('\n');buffer=lines.pop()??'';for(const line of lines){if(!line)continue;const reply=JSON.parse(line) as {id:string|number;result?:unknown;error?:string};const waiter=pending.get(String(reply.id));if(!waiter)continue;pending.delete(String(reply.id));if(reply.error)waiter.reject(new Error(reply.error));else waiter.resolve(reply.result);}});
 socket.on('error',error=>{for(const waiter of pending.values())waiter.reject(error);pending.clear();});
 const frames=new Map<string,Record<string,unknown>>();
 const sent=new Map<string,{method:string;input:unknown;envelope:Record<string,unknown>}>();
 const rawCall=<T=unknown>(method:string,params:unknown):Promise<T>=>new Promise((resolve,reject)=>{const id=++next;pending.set(String(id),{resolve:value=>resolve(value as T),reject});socket.write(JSON.stringify({id,method,params,client:{label:'controller-test',pid:process.pid}})+'\n');});
 const call=async<T=unknown>(method:string,params:unknown):Promise<T>=>{
  const p={...(params as Record<string,unknown>)},id=String(p.reviewId);
  if(method==='codeReview.task.start'&&p.timingProtocol===undefined)p.timingProtocol='activity-v1';
  if(['codeReview.task.scope','codeReview.task.result','codeReview.task.activity'].includes(method)&&p.executionId===undefined){
   const old=sent.get(id),frame=frames.get(id);
   const envelope=old&&old.method===method&&isDeepStrictEqual(old.input,params)?old.envelope:{taskId:frame?.taskId,executionId:frame?.executionId,sequence:frame?.nextSequence};
   Object.assign(p,envelope);sent.set(id,{method,input:structuredClone(params),envelope});
  }
  let value=await rawCall<T>(method,p);
  if(method==='codeReview.task.start'&&(value as Record<string,unknown>)?.reviewer==='controller'){
   const end=Date.now()+10000;
   while(!(value as Record<string,unknown>)?.kind){
    if(Date.now()>end)throw Error('Controller assignment unavailable');
    await new Promise(resolve=>setTimeout(resolve,10));
    value=await rawCall<T>('codeReview.task.assignment',{repo:p.repo,reviewId:p.reviewId,attempt:p.attempt});
   }
  }
  const frame=value as Record<string,unknown>;
  if(frame?.executionId&&frame.nextSequence)frames.set(id,frame);
  else if(frame?.executionId&&frame.acceptedSequence){const prior=frames.get(id);if(prior)frames.set(id,{...prior,nextSequence:Number(frame.acceptedSequence)+1});}
  return value;
 };
 return{socket,call,rawCall,close:()=>socket.destroy()};
}
export async function eventually(check:()=>boolean):Promise<void>{const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw new Error('Condition did not complete');await new Promise(resolve=>setTimeout(resolve,10));}}
export function provider(run:(prompt:string)=>Promise<unknown>):LLMProvider{return{capabilities:{reviewActivity:true},runReviewSession:run} as unknown as LLMProvider;}
export function reviewHost(repo:string,resolveProvider:()=>LLMProvider){
 const services=new ThreadServices(()=>({startedAt:0,modelState:{status:'ready'},installedCommit:'fixture'}));
 const ports=new Set<import('node:worker_threads').MessagePort>();
 const host=new ProductionReviews({services,registeredRepos:async()=>new Set([repo]),track:()=>{},start:(svc,input,port,deps)=>{
  const {port1,port2}=new MessageChannel();ports.add(port1);
  port1.on('message',async(message:{id:number;prompt:string})=>{try{const value=await resolveProvider().runReviewSession!(message.prompt,{},{} as never);port1.postMessage({id:message.id,result:value});}catch(error){port1.postMessage({id:message.id,error:String(error)});}});
  return startReviewWorkerBootstrap(svc,input,port,{...deps,start:(s,n,_script,extra,created)=>startWorker(s,n,'__tests__/helpers/review-controller',{workerData:{...extra!.workerData,fixturePort:port2},transferList:[...extra!.transferList,port2]},created)});
 }});
 installProductionReviews(host);
 return{host,close:async()=>{await host.shutdown();for(const port of ports)port.close();}};
}
export async function serve(repo:string,resolveProvider:()=>LLMProvider,compiled=false){
 if(compiled){const {registerGitTools}=await import(resolve('out/daemon/tools/builtins/git/index.js'));registerGitTools();}
 const {IpcServer,directDispatch}=await import(compiled?resolve('out/daemon/server.js'):'../../../../daemon/server.js');
 const {exchangeControllerTaskReview,startTaskReview,readTaskReviewProgress}=await import(compiled?resolve('out/daemon/task-review-rpc.js'):'../../../../daemon/task-review-rpc.js');
 const reviews=reviewHost(repo,resolveProvider);
 const path=join(repo,'controller.sock');
 const server=new IpcServer(directDispatch({
  'codeReview.task.progress':(params,context)=>readTaskReviewProgress(params,context),
  'codeReview.task.start':(params,context)=>startTaskReview(params,context),
  'codeReview.task.activity':(params,context)=>exchangeControllerTaskReview(params,context,'activity'),
  'codeReview.task.assignment':(params,context)=>exchangeControllerTaskReview(params,context,'assignment'),
  'codeReview.task.scope':(params,context)=>exchangeControllerTaskReview(params,context,'scope'),
  'codeReview.task.result':(params,context)=>exchangeControllerTaskReview(params,context,'result'),
 }),Date.now,path);await server.listen();const close=server.close.bind(server);server.close=async()=>{await close();await reviews.close();};return{server,path};
}
