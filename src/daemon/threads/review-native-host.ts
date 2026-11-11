/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual as same } from 'node:util';
import type { MessagePort } from 'node:worker_threads';
import type { ReviewIntentReceipt, ReviewProcessOutcome, ReviewProcessOwner, ReviewProcessReservation, ReviewNativeCommand, ConfirmedReviewLeaseClosure } from '../../shared/review-native.js';
import type { ReviewProcessLeases } from './review-processes.js';
import { serveHub, pushToWorker } from './channel.js';
import { REVIEW_NATIVE_OP as prefix } from './review-worker-native.js';
import { reviewWorkerCheckpoint } from './review-worker-contract.js';

interface Operation {
 readonly reservation: ReviewProcessReservation;
 readonly sequence: number;
 intent: 'absent'|'saving'|'open'|'closing'|'closed'|'uncertain';
 receipt?: ReviewIntentReceipt | undefined;
 saving?: Promise<ReviewIntentReceipt> | undefined;
 closing?: Promise<void> | undefined;
 outcome?: ReviewProcessOutcome | undefined;
}
export interface ReviewNativeHostDeps {
 readonly leases: ReviewProcessLeases;
 readonly owner: ReviewProcessOwner;
 readonly port: MessagePort;
 /** These callbacks use only the registered worker's private parent channel. */
 readonly persist: (operation:'open'|'close', reservation:ReviewProcessReservation, closure?:ConfirmedReviewLeaseClosure)=>Promise<ReviewIntentReceipt>;
 readonly resolveBinary: (command:string)=>Promise<string>;
 readonly assertActive: ()=>void;
 readonly onLost: ()=>void;
}
/** One registered native port. Parsing and provider work remain in its worker.
 * An uncertain save is retained even when its acknowledgment is lost. */
export class ReviewNativeHost {
 private readonly operations=new Map<string,Operation>();
 private readonly acks=new Map<string,{resolve:()=>void;reject:(error:Error)=>void}>();
 private readonly stopServing:()=>void;
 private closing=false;
 constructor(private readonly deps:ReviewNativeHostDeps){
  const op=(raw:unknown)=>this.operation((raw as {reservation:ReviewProcessReservation}).reservation);
  this.stopServing=serveHub(deps.port,{
   [prefix+'resolveBinary']:(raw)=>{this.active();const c=(raw as {command:string}).command;if(typeof c!=='string'||!c||c.length>4096||c.includes('\0'))throw new Error('Invalid binary lookup');return deps.resolveBinary(c);},
   [prefix+'reserve']:(raw)=>{
    this.active();const p=raw as {sequence:number;command:ReviewNativeCommand};
    const r=deps.leases.reserve(deps.owner,p.sequence,p.command);
    if(!this.operations.has(r.operationId))this.operations.set(r.operationId,{reservation:r,sequence:p.sequence,intent:'absent'});
    this.prune();return r;
   },
   [prefix+'saveOpenIntent']:(raw)=>{this.active();return this.open(op(raw));},
   [prefix+'start']:async(raw)=>{
    this.active();const entry=op(raw),receipt=(raw as {receipt:ReviewIntentReceipt}).receipt;
    this.verifyIntent(entry.reservation,receipt);
    const outcome=await deps.leases.start(deps.owner,entry.sequence,receipt,output=>new Promise<void>((resolve,reject)=>{
     if(this.closing){reject(new Error('Review native owner closed'));return;}
     const key=`${output.operationId}:${output.sequence}`;
     this.acks.set(key,{resolve,reject});
     try{pushToWorker(deps.port,prefix+'output',output);}catch(error){this.acks.delete(key);reject(error as Error);}
    })).result;
    entry.outcome=outcome;return outcome;
   },
   [prefix+'outputAck']:(raw)=>{
    const p=raw as {operationId:string;workerIncarnation:string;sequence:number;error?:unknown};
    if(p.workerIncarnation!==deps.owner.incarnation||!this.operations.has(p.operationId))throw new Error('Foreign output acknowledgment');
    const key=`${p.operationId}:${p.sequence}`,ack=this.acks.get(key);
    if(!ack)throw new Error('Stale output acknowledgment');this.acks.delete(key);
    if(p.error!==undefined)ack.reject(new Error('Review output rejected'));else ack.resolve();
   },
   [prefix+'waitStarted']:(raw)=>{this.active();return deps.leases.waitStarted(deps.owner,op(raw).sequence);},
   [prefix+'write']:(raw)=>{this.active();const p=raw as {bytes:Uint8Array;end:boolean};if(typeof p.end!=='boolean')throw new Error('Invalid stdin ending');return deps.leases.write(deps.owner,op(raw).sequence,p.bytes,p.end);},
   [prefix+'cancel']:async(raw)=>{const entry=op(raw);entry.outcome=await deps.leases.cancel(deps.owner,entry.sequence);return entry.outcome;},
   [prefix+'saveClosedIntent']:(raw)=>this.closeIntent(op(raw)),
  });
  deps.port.once('close',()=>{void this.close();deps.onLost();});
 }
 private active():void{if(this.closing)throw new Error('Review native owner closed');this.deps.assertActive();}
 private operation(r:ReviewProcessReservation):Operation{
  const entry=r&&this.operations.get(r.operationId);
  if(!entry||!same(entry.reservation,r))throw new Error('Foreign native reservation');return entry;
 }
 verifyIntent(r:ReviewProcessReservation,receipt:ReviewIntentReceipt):void{
  const entry=this.operation(r);
  if(entry.intent!=='open'||!entry.receipt||!same(entry.receipt,receipt))throw new Error('Unverified native intent');
 }
 private open(entry:Operation):Promise<ReviewIntentReceipt>{
  if(entry.intent==='open')return Promise.resolve(entry.receipt!);
  if(entry.saving)return entry.saving;
  if(entry.intent!=='absent')throw new Error('Native intent fenced');
  entry.intent='saving';
  entry.saving=this.deps.persist('open',entry.reservation).then(receipt=>{
   const r=entry.reservation;
   if(receipt.operationId!==r.operationId||receipt.workerIncarnation!==r.workerIncarnation||receipt.daemonInstance!==r.daemonInstance||receipt.checkpointPath!==reviewWorkerCheckpoint(r.key)||!Number.isSafeInteger(receipt.attempt)||receipt.attempt<1)throw new Error('Foreign native save acknowledgment');
   entry.receipt=Object.freeze({...receipt});entry.intent='open';return entry.receipt;
  }).catch(error=>{entry.intent='uncertain';throw error;});
  return entry.saving;
 }
 private closeIntent(entry:Operation):Promise<void>{
  if(entry.intent==='closed')return Promise.resolve();if(entry.closing)return entry.closing;
  if(entry.intent!=='open'||entry.outcome?.disposal.state!=='confirmed')throw new Error('Native disposal unconfirmed');
  const closure:ConfirmedReviewLeaseClosure={reservation:entry.reservation,disposal:entry.outcome.disposal};
  entry.intent='closing';
  entry.closing=this.deps.persist('close',entry.reservation,closure).then(receipt=>{if(!same(receipt,entry.receipt))throw new Error('Foreign native closure acknowledgment');entry.intent='closed';this.prune();}).catch(error=>{entry.intent='uncertain';throw error;});
  return entry.closing;
 }
 private prune():void{
  const closed=[...this.operations.values()].filter(o=>o.intent==='closed');
  for(const entry of closed.slice(0,Math.max(0,closed.length-128)))this.operations.delete(entry.reservation.operationId);
 }
 /** Aborts only this port's native owner. A lost writer leaves its saved intent
  * fenced for the explicit recovery workflow rather than erasing evidence. */
 async close():Promise<void>{
  if(!this.closing){this.closing=true;for(const ack of this.acks.values())ack.reject(new Error('Review native owner closed'));this.acks.clear();}
  await this.deps.leases.close(this.deps.owner);
 }
 /** Called while the writer is still alive on orderly shutdown. */
 async flushClosures():Promise<void>{
  await this.close();
  for(const entry of this.operations.values()){
   if(entry.saving)await entry.saving;
   entry.outcome=await this.deps.leases.cancel(this.deps.owner,entry.sequence);
   if(entry.intent==='open')await this.closeIntent(entry);
  }
 }
 get reclaimable():boolean{return this.closing&&this.deps.leases.recheck(this.deps.owner)&&[...this.operations.values()].every(o=>o.intent==='absent'||o.intent==='closed');}
 dispose():void{if(!this.reclaimable)throw new Error('Review native resources fenced');this.stopServing();this.deps.port.close();this.deps.leases.release(this.deps.owner);}
}
