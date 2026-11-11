/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { Worker,MessagePort } from 'node:worker_threads';
import { startWorker } from './workers.js';
import type { StartedWorker } from './workers.js';
import type { ThreadServices } from './main-services.js';
import { assertReviewIdentity, REVIEW_BOOTSTRAP_MS, sameReviewWorker, reviewWorkerCheckpoint } from './review-worker-contract.js';
import type { ReviewAdmissionReceipt, ReviewBootstrapInput, ReviewWorkerIdentity } from './review-worker-contract.js';

export class ReviewWorkerBootstrapError extends Error{
 constructor(readonly code:'review_worker_bootstrap_timeout'|'review_worker_bootstrap_failed',readonly review:Pick<ReviewBootstrapInput,'key'|'incarnation'|'attempt'>,readonly reclaimed:Promise<void>,cause?:Error){super(code+(cause?`: ${cause.message.slice(0,256)}`:''),{cause});this.name='ReviewWorkerBootstrapError';}
}
export interface ReviewBootstrapDeps{
 readonly fence:ReviewBootstrapFence;
 readonly start?:typeof startWorker|undefined;
 readonly schedule?:((fn:()=>void,ms:number)=>()=>void)|undefined;
 /** Registry retains the exact review fence until native AND worker reclaim. */
 readonly onClosing?:(worker:Worker|undefined,reclaimed:Promise<void>)=>void;
}
/** One runtime lifecycle handle stored by t8's registry, not another map or
 * durable review ledger. It is never reusable, including after reclamation. */
export class ReviewBootstrapFence{
 #state:'idle'|'starting'|'ready'|'closing'='idle';
 #reclaimed=false;
 readonly identity:ReviewWorkerIdentity;
 constructor(identity:ReviewWorkerIdentity){assertReviewIdentity(identity);this.identity=Object.freeze({key:Object.freeze({...identity.key}),incarnation:identity.incarnation});}
 get state(){return this.#state;}
 get reclaimed(){return this.#reclaimed;}
 begin(identity:ReviewWorkerIdentity):void{if(!sameReviewWorker(this.identity,identity)||this.#state!=='idle')throw new Error('review_worker_resource_fenced');this.#state='starting';}
 ready():boolean{if(this.#state!=='starting')return false;this.#state='ready';return true;}
 close():void{this.#state='closing';}
 workerReclaimed():void{this.#reclaimed=true;this.#state='closing';}
}
export interface StartedReviewWorker extends StartedWorker {readonly admission:ReviewAdmissionReceipt;readonly fence:ReviewBootstrapFence;}
/** The timer starts before creation. Timeout returns promptly; asynchronous
 * cleanup and lock/store reclaim continue under the caller's targeted fence. */
export function startReviewWorkerBootstrap(services:ThreadServices,review:ReviewBootstrapInput,nativePort:MessagePort,deps:ReviewBootstrapDeps):Promise<StartedReviewWorker>{
 assertReviewIdentity(review);
 if(!Number.isSafeInteger(review.attempt)||review.attempt<1)throw new Error('Invalid review attempt');
 review=Object.freeze({...review,key:Object.freeze({...review.key})});
 try{deps.fence.begin(review);}catch(error){nativePort.close();throw error;}
 return new Promise((resolve,reject)=>{
  let worker:Worker|undefined,ready:StartedWorker|undefined,receipt:ReviewAdmissionReceipt|undefined,closing=false,finished=false;
  let reclaimedDone!:()=>void;const reclaimed=new Promise<void>(r=>{reclaimedDone=r;});
  const reclaim=()=>{deps.fence.workerReclaimed();reclaimedDone();};
  let cancelTimer=()=>{};
  const cleanup=()=>{cancelTimer();worker?.off('message',message);worker?.off('error',failed);worker?.off('exit',failed);};
  const fail=(code:ReviewWorkerBootstrapError['code'],cause?:Error)=>{
   if(finished||closing)return;closing=true;deps.fence.close();cleanup();
   try{deps.onClosing?.(worker,reclaimed);}catch{/* Keep termination and the named failure independent of observer errors. */}
   nativePort.close();
   void worker?.terminate().catch(()=>{});
   reject(new ReviewWorkerBootstrapError(code,{key:review.key,incarnation:review.incarnation,attempt:review.attempt},reclaimed,cause));
  };
  const complete=()=>{if(!closing&&!finished&&ready&&receipt){if(!deps.fence.ready()){fail('review_worker_bootstrap_failed');return;}finished=true;cleanup();resolve({...ready,admission:receipt,fence:deps.fence});}};
  const failed=(error?:unknown)=>fail('review_worker_bootstrap_failed',error instanceof Error?error:undefined);
  const message=(value:unknown)=>{
   if(closing||finished||!value||typeof value!=='object'||Reflect.get(value,'kind')!=='review-admission-saved')return;
   const candidate=value as ReviewAdmissionReceipt;
   if(!sameReviewWorker(review,candidate)||candidate.attempt!==review.attempt||candidate.checkpointPath!==reviewWorkerCheckpoint(review.key)){failed();return;}
   receipt=candidate;complete();
  };
  cancelTimer=(deps.schedule??((fn,ms)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);} ))(()=>fail('review_worker_bootstrap_timeout'),REVIEW_BOOTSTRAP_MS);
  if(closing){reclaim();return;}
  try{
   const starting=(deps.start??startWorker)(services,'review','review-worker',{workerData:{role:'review',review,nativePort},transferList:[nativePort]},created=>{
    worker=created;worker.on('message',message);worker.once('error',failed);worker.once('exit',failed);
    if(closing)void worker.terminate().catch(()=>{});
   });
   void starting.then(started=>{
    ready=started;void started.reclaimed.then(()=>{reclaim();started.disconnect();});
    if(closing)void started.worker.terminate().catch(()=>{});else complete();
   },error=>{reclaim();failed(error);});
  }catch{reclaim();failed();}
 });
}
