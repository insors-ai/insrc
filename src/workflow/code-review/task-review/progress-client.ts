/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { performance } from 'node:perf_hooks';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { rpc, sockFilePath } from '../../../shared/ipc-client.js';
import { parseProgressView } from './progress-view.js';
import type { ReviewProgressView } from './progress-view.js';
export interface ProgressRequest { repo:string;reviewId:string;attempt:number; }
const requiresRecovery=(view:ReviewProgressView)=>view.executionState==='inactive'&&view.crPublication!=='complete';
const duration=(ms:number)=>`${Math.floor(ms/60000)}m ${Math.floor(ms/1000)%60}s`;
export function formatReviewProgress(view:ReviewProgressView):string{
 const p=view.progress,task=p?.task;
 const state=requiresRecovery(view)?'execution inactive; explicit recovery required':view.status;
 const activity=p?.lastMeaningfulActivityAt??'unknown';
 return `Review ${view.reviewId}/${view.attempt}: ${state}${view.interrupted?' (interrupted)':''}${view.hasError?' (review/publication error)':''}; `+
  `${task?`task ${task.position}/${task.total} ${task.name}`:'task unknown'}; ${p?.phase??'phase unknown'}; `+
  `${view.completedTasks}/${view.totalTasks} completed; review elapsed ${p?duration(p.reviewElapsedMs):'unknown'}; task elapsed ${p?.taskElapsedMs==null?'unknown':duration(p.taskElapsedMs)}; `+
  `last meaningful activity ${activity}; ${view.freshness==='live'?`last observed process ${p?.processState??'unknown'} at ${p?.lastProcessObservedAt??'unknown'}`:'current process activity unknown'}; snapshot ${view.freshness}`+
  `${view.warning?'; progress persistence failed':''}; publication ${view.crPublication}`;
}
function wait(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);resolve();};
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason??new Error('Progress polling cancelled'));};
  const timer=setTimeout(done,ms);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
}
async function cancellable<T>(pending:Promise<T>,signal:AbortSignal):Promise<T>{
 let abort!:()=>void;
 try{return await Promise.race([pending,new Promise<never>((_,reject)=>{abort=()=>reject(signal.reason??new Error('Progress polling cancelled'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();})]);}
 finally{signal.removeEventListener('abort',abort);}
}
/** Close only the observation socket on cancellation; review execution is daemon-owned. */
export async function readReviewProgress(request:ProgressRequest,signal:AbortSignal,connect:()=>Socket=()=>createConnection(sockFilePath)):Promise<unknown>{
 signal.throwIfAborted();
 let socket:Socket|undefined;
 const abort=()=>socket?.destroy();
 signal.addEventListener('abort',abort,{once:true});
 try{
  return await rpc('codeReview.task.progress',request,()=>{signal.throwIfAborted();socket=connect();if(signal.aborted)socket.destroy();return socket;},{timeoutMs:15000});
 }catch(error){signal.throwIfAborted();throw error;}
 finally{signal.removeEventListener('abort',abort);}
}
/** Explicit task-review observation helper; does not migrate or revive retired MCP endpoints. */
export async function pollTaskReviewProgress(request:ProgressRequest,options:{
 signal:AbortSignal;onUpdate:(text:string,view:ReviewProgressView|null)=>void;
 read?:((request:ProgressRequest)=>Promise<unknown>)|undefined;
 sleep?:((ms:number,signal:AbortSignal)=>Promise<void>)|undefined;
 now?:(()=>number)|undefined;
}):Promise<ReviewProgressView>{
 const read=options.read??(p=>readReviewProgress(p,options.signal));
 const now=options.now??(()=>performance.now());let emitted=-Infinity,key='';
 for(;;){
  options.signal.throwIfAborted();
  let view:ReviewProgressView;
  try{
   const raw=await cancellable(read(request),options.signal);options.signal.throwIfAborted();
   view=parseProgressView(raw);
   if(view.reviewId!==request.reviewId||view.attempt!==request.attempt)throw new Error('Progress identity mismatch');
  }catch(error){if(!options.signal.aborted)options.onUpdate('Review progress unavailable; observation stopped without restarting review.',null);throw error;}
  const next=JSON.stringify([view.progress?.executionId,view.progress?.task?.id,view.progress?.phase,view.status,view.crPublication,view.executionState,view.freshness,view.interrupted,view.hasError,view.warning]);
  const terminal=view.crPublication==='complete'||view.interrupted||view.hasError||requiresRecovery(view);
  if(next!==key||now()-emitted>=45000||terminal){options.onUpdate(formatReviewProgress(view),view);emitted=now();key=next;}
  if(terminal)return view;
  await (options.sleep??wait)(5000,options.signal);
 }
}
