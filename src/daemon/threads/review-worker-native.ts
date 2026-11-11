/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { isDeepStrictEqual } from 'node:util';
import { AsyncResource } from 'node:async_hooks';
import type { MessagePort } from 'node:worker_threads';
import { HubClient } from './channel.js';
import type { ReviewNativeTransport } from '../../shared/review-process-bridge.js';
import type { ReviewNativeCommand,ReviewProcessReservation,ReviewIntentReceipt,ReviewProcessOutput,ReviewProcessOutcome } from '../../shared/review-native.js';
import type { ReviewWorkerIdentity } from './review-worker-contract.js';

export const REVIEW_NATIVE_OP='review.native.';
/** Registered-port endpoint; t8 binds the surviving host service. None of
 * these operations can fall back to a subprocess or caller-supplied authority. */
export class ReviewWorkerNativeTransport implements ReviewNativeTransport{
 private readonly hub:HubClient;
 private readonly consumers=new Map<string,(output:ReviewProcessOutput)=>Promise<void>>();
 constructor(port:MessagePort,private readonly identity:ReviewWorkerIdentity){
  this.hub=new HubClient(port);
  this.hub.onPush(REVIEW_NATIVE_OP+'output',raw=>{
   void (async()=>{
    const output=raw as ReviewProcessOutput;
    let error:string|undefined;
    try{
     if(output.workerIncarnation!==identity.incarnation||!(output.bytes instanceof Uint8Array)||output.bytes.byteLength>65536||!Number.isSafeInteger(output.sequence)||output.sequence<1||!['stdout','stderr'].includes(output.stream))throw new Error('Invalid review byte frame');
     const consume=this.consumers.get(output.operationId);if(!consume)throw new Error('Stale review byte frame');
     await consume(output);
    }catch{error='review_output_rejected';}
    await this.hub.request(REVIEW_NATIVE_OP+'outputAck',{operationId:output?.operationId,workerIncarnation:identity.incarnation,sequence:output?.sequence,...(error?{error}:{})});
   })().catch(()=>{/* A closed host port owns cancellation and disposal. */});
  });
 }
 private bound(reservation:ReviewProcessReservation):void{
  if(!isDeepStrictEqual(reservation.key,this.identity.key)||reservation.workerIncarnation!==this.identity.incarnation)throw new Error('Foreign native review lease');
 }
 resolveBinary(command:string):Promise<string>{return this.hub.request(REVIEW_NATIVE_OP+'resolveBinary',{command});}
 async reserve(command:ReviewNativeCommand):Promise<ReviewProcessReservation>{const r=await this.hub.request<ReviewProcessReservation>(REVIEW_NATIVE_OP+'reserve',{command});this.bound(r);return r;}
 saveOpenIntent(r:ReviewProcessReservation):Promise<ReviewIntentReceipt>{this.bound(r);return this.hub.request(REVIEW_NATIVE_OP+'saveOpenIntent',{reservation:r});}
 async start(r:ReviewProcessReservation,receipt:ReviewIntentReceipt,consume:(output:ReviewProcessOutput)=>Promise<void>):Promise<ReviewProcessOutcome>{
  this.bound(r);if(this.consumers.has(r.operationId))throw new Error('Native review delivery already active');
  this.consumers.set(r.operationId,AsyncResource.bind(consume));
  try{return await this.hub.request(REVIEW_NATIVE_OP+'start',{reservation:r,receipt});}finally{this.consumers.delete(r.operationId);}
 }
 waitStarted(r:ReviewProcessReservation):Promise<{spawned:boolean}>{this.bound(r);return this.hub.request(REVIEW_NATIVE_OP+'waitStarted',{reservation:r});}
 write(r:ReviewProcessReservation,bytes:Uint8Array,end:boolean):Promise<void>{this.bound(r);return this.hub.request(REVIEW_NATIVE_OP+'write',{reservation:r,bytes,end});}
 cancel(r:ReviewProcessReservation):Promise<ReviewProcessOutcome>{this.bound(r);return this.hub.request(REVIEW_NATIVE_OP+'cancel',{reservation:r});}
 saveClosedIntent(r:ReviewProcessReservation):Promise<void>{this.bound(r);return this.hub.request(REVIEW_NATIVE_OP+'saveClosedIntent',{reservation:r});}
}
