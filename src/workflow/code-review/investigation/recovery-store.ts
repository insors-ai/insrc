/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { validateRecoveryUsage } from './recovery-usage.js';
import type { RecoveryUsageWriter } from './recovery-usage.js';
import type { ReviewUsageObservationV1 } from './types.js';
import { foldRecoveryLifecycle, recoveryProjection, recoveryCompatibility } from './recovery-lifecycle.js';
import { randomUUID } from 'node:crypto';
import { RecoveryJournal } from './recovery-journal.js';
import type { RecoveryJournalOptions } from './recovery-journal.js';
import { replayRecovery, applyRecoveryBlock, validateRecoveryManifest } from './recovery-replay.js';
import type { RecoveryView, RecoveryControlFold } from './recovery-replay.js';
import { RecoveryError, recoveryValue, recoveryRecord } from './recovery-types.js';
import type { RecoveryCompatibility, RecoveryManifest } from './recovery-types.js';
import type { ReviewRuntimePortsV1 } from './types.js';
import type { InvestigationTurnV1, BlockProgressTransitionV1 } from './continuation-types.js';
import { ledgerDigest } from './ledger-identity.js';
export interface RecoveryStoreOptions extends RecoveryJournalOptions {
 /** Trusted owner assertion. sc4 lifecycle supplies the persistent lease implementation. */
 readonly assertOwner: (generation:number,attemptId:string)=>void;
 readonly readEvidence: ReviewRuntimePortsV1['readEvidence'];
 readonly controlFold?: RecoveryControlFold | undefined;
 readonly processEpoch: string;
 readonly currentCompatibility: RecoveryCompatibility;
 readonly usageWriter?: RecoveryUsageWriter | undefined;
 readonly wallNow?: (()=>number) | undefined;
}
export class RecoveryStore {
 readonly journal:RecoveryJournal;
 constructor(repo:string,runId:string,readonly options:RecoveryStoreOptions){this.journal=new RecoveryJournal(repo,runId,options);}
 async prepare(raw:RecoveryManifest):Promise<RecoveryView>{return this.journal.exclusive(()=>{
  const manifest=validateRecoveryManifest(raw);if(manifest.runId!==this.journal.runId)throw new RecoveryError('invalid-input','Foreign run manifest.');
  const existing=this.journal.events();if(existing.length){const view=this.replay();if(ledgerDigest(view.manifest)!==ledgerDigest(manifest))throw new RecoveryError('invalid-input','Run manifest conflict.');return view;}
  const staged=this.journal.stage({...manifest});this.journal.append({eventId:'prepared',generation:0,kind:'state',subjectDigest:manifest.subjectDigest,policyDigest:manifest.policyDigest,payloadRef:staged.reference});return this.replay();
 });}
 replay(repairTail=false):RecoveryView{return replayRecovery(this.journal,repairTail,this.options.controlFold??foldRecoveryLifecycle);}
 private wallSeen=0;
 private now(view:RecoveryView):number{const now=(this.options.wallNow??Date.now)();if(!Number.isSafeInteger(now)||now<view.lifecycle.lastWallMs||now<this.wallSeen)throw new RecoveryError('ownership-lost','Owner clock regressed.');this.wallSeen=now;return now;}
 assertLease(view:RecoveryView,leaseId:string,generation:number):void{this.journal.guard();const o=view.lifecycle.owner;if(view.lifecycle.processEpoch!==this.options.processEpoch||!o||o.leaseId!==leaseId||o.generation!==generation||Date.parse(o.expiresAt)<=this.now(view)||['completed','cancelled','stale'].includes(view.lifecycle.state))throw new RecoveryError('ownership-lost','Run lease is stale.');}
 private control(view:RecoveryView,kind:'lease'|'release'|'state'|'attempt-issued'|'attempt-settled'|'extension'|'usage-pending'|'usage-recorded'|'publication-intent',generation:number,payload:Record<string,unknown>):RecoveryView{
  const staged=this.journal.stage(payload),m=view.manifest;
  const candidate={version:1 as const,runId:m.runId,subjectDigest:m.subjectDigest,policyDigest:m.policyDigest,generation,kind,payloadRef:staged.reference,eventId:randomUUID(),ordinal:view.eventOrdinal+1,previousDigest:view.eventDigest,digest:'candidate'};
  foldRecoveryLifecycle(view,candidate,payload,r=>this.journal.read(r));this.journal.append(eventInput(candidate));return this.replay();
 }
 async claim(leaseMs:number){return this.journal.exclusive(()=>{
  const view=this.replay(true),wallMs=this.now(view);if(!Number.isSafeInteger(leaseMs)||leaseMs<1||leaseMs>300000)throw new RecoveryError('invalid-input','Invalid lease duration.');
  const leaseId=randomUUID(),generation=view.lifecycle.generation+1;
  return this.control(view,'lease',generation,{leaseId,wallMs,expiresAt:new Date(wallMs+leaseMs).toISOString(),processEpoch:this.options.processEpoch}).lifecycle.owner!;
 });}
 async renew(leaseId:string,generation:number,leaseMs:number){return this.journal.exclusive(()=>{const v=this.replay();this.assertLease(v,leaseId,generation);if(!Number.isSafeInteger(leaseMs)||leaseMs<1||leaseMs>300000)throw new RecoveryError('invalid-input','Invalid lease duration.');const wallMs=this.now(v);return this.control(v,'lease',generation,{leaseId,wallMs,expiresAt:new Date(wallMs+leaseMs).toISOString(),processEpoch:this.options.processEpoch}).lifecycle.owner!;});}
 async release(leaseId:string,generation:number,state:'paused'|'cancelled'|'stale'='paused'){return this.journal.exclusive(()=>{const v=this.replay();this.assertLease(v,leaseId,generation);return this.control(v,'release',generation,{leaseId,wallMs:this.now(v),state});});}
 /** Trusted, non-reentrant callback. S5 owns canonical identity/CAS and separate completion receipt. */
 async withPublicationFence<T>(leaseId:string,generation:number,checkpointDigest:string,intentRef:string|null,publish:(frozenIntentRef:string,assertCurrent:()=>void)=>Promise<T>):Promise<T>{
  return this.journal.exclusive(async()=>{
   let view=this.replay(true);this.assertLease(view,leaseId,generation);
   if(checkpointDigest!==view.state.checkpoint)throw new RecoveryError('invalid-input','Publication checkpoint changed.');
   if(view.publication){
    if(view.lifecycle.state!=='completion-requested'||view.publication.checkpointDigest!==checkpointDigest||intentRef!==null&&intentRef!==view.publication.intentRef)throw new RecoveryError('invalid-input','Conflicting frozen publication.');
    this.journal.stabilize();
   }else{
    if(intentRef===null)throw new RecoveryError('invalid-input','No frozen publication intent to retrieve.');
    const intent=this.journal.read(intentRef);recoveryRecord(intent);
    view=this.control(view,'publication-intent',generation,{version:1,leaseId,wallMs:this.now(view),intentRef,intentDigest:ledgerDigest(intent),checkpointDigest});
   }
   const frozen=view.publication!;let active=true;
   const assertCurrent=()=>{
    if(!active)throw new RecoveryError('ownership-lost','Publication invocation is no longer active.');
    const current=this.replay();this.assertLease(current,leaseId,generation);
    if(current.lifecycle.state!=='completion-requested'||current.state.checkpoint!==checkpointDigest||ledgerDigest(current.publication)!==ledgerDigest(frozen))throw new RecoveryError('ownership-lost','Frozen publication authority changed.');
   };
   try{assertCurrent();const result=await publish(frozen.intentRef,assertCurrent);assertCurrent();return result;}
   finally{active=false;}
  });
 }
 async requestCompletion(leaseId:string,generation:number){return this.journal.exclusive(()=>{const v=this.replay();this.assertLease(v,leaseId,generation);return this.control(v,'state',generation,{leaseId,wallMs:this.now(v),state:'completion-requested'});});}
 async recordCompletion(leaseId:string,generation:number,receipt:string){return this.journal.exclusive(()=>{const v=this.replay();if(v.lifecycle.completionReceipt){if(v.lifecycle.completionReceipt!==receipt)throw new RecoveryError('invalid-input','Conflicting terminal receipt.');return v;}this.assertLease(v,leaseId,generation);return this.control(v,'state',generation,{leaseId,wallMs:this.now(v),state:'completed',receipt});});}
 async issueAttempt(leaseId:string,generation:number,turn:InvestigationTurnV1,reservedMs:number){return this.journal.exclusive(()=>{const v=this.replay();this.assertLease(v,leaseId,generation);if(turn.runId!==v.manifest.runId||turn.subjectDigest!==v.manifest.subjectDigest||turn.policyDigest!==v.manifest.policyDigest||turn.generation!==generation||reservedMs>turn.limits.attemptMs)throw new RecoveryError('invalid-input','Foreign attempt request.');return this.control(v,'attempt-issued',generation,{leaseId,wallMs:this.now(v),attemptId:turn.attemptId,requestDigest:turn.requestDigest,reservedMs,priorAttemptId:v.accounting.attempts.at(-1)?.attemptId??null});});}
 async settleAttempt(leaseId:string,generation:number,attemptId:string,state:'accepted'|'failed'|'cancelled',elapsedMs:number){return this.journal.exclusive(()=>{const v=this.replay();this.assertLease(v,leaseId,generation);return this.control(v,'attempt-settled',generation,{leaseId,wallMs:this.now(v),attemptId,state,elapsedMs});});}
 async extendAllowance(leaseId:string,generation:number,activeLimitMs:number,attemptLimit:number,reason:string){return this.journal.exclusive(()=>{const v=this.replay();this.assertLease(v,leaseId,generation);return this.control(v,'extension',generation,{leaseId,wallMs:this.now(v),activeLimitMs,attemptLimit,reason});});}
 async recordUsage(observation:ReviewUsageObservationV1){
  await this.journal.exclusive(()=>{const v=this.replay(),value=validateRecoveryUsage(v,observation),old=v.state.usage.find(u=>u.observation.observationId===value.observationId);if(old){if(ledgerDigest(old.observation)!==ledgerDigest(value))throw new RecoveryError('invalid-input','Conflicting usage observation.');return;}this.control(v,'usage-pending',v.lifecycle.generation,{accountingOnly:true,wallMs:this.now(v),observation:value});});
  await this.drainUsage();const item=this.replay().state.usage.find(u=>u.observation.observationId===observation.observationId)!;return {state:item.state,receiptRef:item.receiptRef};
 }
 private delivering=false;
 async drainUsage():Promise<void>{
  const writer=this.options.usageWriter;if(!writer||writer.idempotent!==true||this.delivering)return;this.delivering=true;
  try{for(const item of this.replay().state.usage.filter(u=>u.state==='pending')){
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const receipt=await Promise.race([writer.write(item.observation,`${this.journal.runId}/${item.observation.observationId}`),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),1000);})]);
    if(typeof receipt!=='string'||!receipt)continue;
    await this.journal.exclusive(()=>{const v=this.replay(),current=v.state.usage.find(u=>u.observation.observationId===item.observation.observationId)!;
     if(current.state==='recorded'){if(current.receiptRef!==receipt)throw new RecoveryError('invalid-input','Usage writer changed receipt.');return;}
     this.control(v,'usage-recorded',v.lifecycle.generation,{accountingOnly:true,wallMs:this.now(v),observationId:item.observation.observationId,receiptRef:receipt});
    });
   }catch{/* Durable pending record remains authoritative; same writer key resolves lost acknowledgments. */}finally{if(timer)clearTimeout(timer);}
  }}finally{this.delivering=false;}
 }
 status(){return recoveryProjection(this.replay());}
 async compatibility(current:Pick<RecoveryManifest,'subjectDigest'|'policyDigest'|'compatibility'>,assertFresh:()=>Promise<void>){const view=this.replay();let fresh=true;try{await assertFresh();}catch{fresh=false;}return recoveryCompatibility(view,current,fresh);}
 /** All closures are daemon-owned. No mutable store or authority token is handed to the model. */
 ports(generation:number,attemptId:string,leaseId:string):ReviewRuntimePortsV1{
  const activeAttempt=()=>this.replay().accounting.attempts.find(a=>['issued','partially-accepted'].includes(a.state))?.attemptId??attemptId;
  const assert=()=>{this.options.assertOwner(generation,activeAttempt());this.assertLease(this.replay(),leaseId,generation);};
  return {
   readEvidence:async(subjectId,ref)=>{assert();const v=this.replay();if(subjectId!==v.manifest.basis.subject.subjectId)throw new RecoveryError('invalid-input','Foreign subject.');return this.options.readEvidence(subjectId,ref);},
   stageImmutableValue:async(runId,value)=>this.journal.exclusive(()=>{assert();if(runId!==this.journal.runId)throw new RecoveryError('invalid-input','Foreign run.');return this.journal.stage(value);}),
   appendTransition:async(runId,gen,sequence,ref)=>this.journal.exclusive(()=>{
    assert();if(runId!==this.journal.runId||gen!==generation)throw new RecoveryError('ownership-lost','Foreign owner binding.');
    const view=this.replay(),transition=this.journal.read(ref) as BlockProgressTransitionV1;
    if(transition.progress?.attemptId!==activeAttempt())throw new RecoveryError('invalid-input','Foreign attempt.');
    const old=view.state.accepted.find(a=>a.progress.progressId===transition.progress.progressId);
    if(old){if(old.payloadDigest!==ledgerDigest(transition.progress))throw new RecoveryError('invalid-input','Conflicting accepted progress.');this.journal.stabilize();return {sequence:old.receipt.sequence,checkpointDigest:old.receipt.checkpointDigest};}
    if(sequence!==view.state.sequence)throw new RecoveryError('invalid-input','Expected acceptance sequence mismatch.');
    const m=view.manifest,event={version:1 as const,ordinal:view.eventOrdinal+1,previousDigest:view.eventDigest,eventId:randomUUID(),runId,subjectDigest:m.subjectDigest,policyDigest:m.policyDigest,generation,kind:'block' as const,payloadRef:ref,digest:'candidate'};
    // Validate before writing; replay applies the identical pure reducer.
    applyRecoveryBlock(view,transition,event,r=>this.journal.read(r));assert();
    this.journal.append(eventInput(event));const accepted=this.replay().state.accepted.at(-1)!.receipt;
    assert();return {sequence:accepted.sequence,checkpointDigest:accepted.checkpointDigest};
   }),
   recordAttemptUsage:async observation=>{this.journal.guard();return this.recordUsage(observation);}
  };
 }
}
function eventInput(e:Parameters<typeof applyRecoveryBlock>[2]){const {version:_,ordinal:__,previousDigest:___,digest:____,runId:_____,...input}=e;return recoveryValue(input);}
