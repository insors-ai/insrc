/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { IpcServer, directDispatch } from '../../../../daemon/server.js';
import { exchangeControllerTaskReview, startTaskReview } from '../../../../daemon/task-review-rpc.js';
import type { LLMProvider } from '../../../../shared/types.js';
export async function channel(path:string){
 const socket=createConnection(path);await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 let next=0,buffer='';
 const pending=new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
 socket.setEncoding('utf8');socket.on('data',(data:string)=>{buffer+=data;const lines=buffer.split('\n');buffer=lines.pop()??'';for(const line of lines){if(!line)continue;const reply=JSON.parse(line) as {id:string|number;result?:unknown;error?:string};const waiter=pending.get(String(reply.id));if(!waiter)continue;pending.delete(String(reply.id));if(reply.error)waiter.reject(new Error(reply.error));else waiter.resolve(reply.result);}});
 socket.on('error',error=>{for(const waiter of pending.values())waiter.reject(error);pending.clear();});
 return{socket,call:<T=unknown>(method:string,params:unknown):Promise<T>=>new Promise((resolve,reject)=>{const id=++next;pending.set(String(id),{resolve:value=>resolve(value as T),reject});socket.write(JSON.stringify({id,method,params,client:{label:'controller-test',pid:process.pid}})+'\n');}),close:()=>socket.destroy()};
}
export async function eventually(check:()=>boolean):Promise<void>{const end=Date.now()+10000;while(!check()){if(Date.now()>end)throw new Error('Condition did not complete');await new Promise(resolve=>setTimeout(resolve,10));}}
export function provider(run:()=>Promise<unknown>):LLMProvider{return{runReviewSession:run} as unknown as LLMProvider;}
export async function serve(repo:string,resolveProvider:()=>LLMProvider){
 const path=join(repo,'controller.sock');
 const server=new IpcServer(directDispatch({
  'codeReview.task.start':(params,context)=>startTaskReview(params,context,{provider:resolveProvider}),
  'codeReview.task.assignment':(params,context)=>exchangeControllerTaskReview(params,context,'assignment'),
  'codeReview.task.scope':(params,context)=>exchangeControllerTaskReview(params,context,'scope'),
  'codeReview.task.result':(params,context)=>exchangeControllerTaskReview(params,context,'result'),
 }),Date.now,path);await server.listen();return{server,path};
}
