/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { RecoveryJournal } from './recovery-journal.js';
import type { RecoveryJournalOptions } from './recovery-journal.js';
import { replayRecovery, applyRecoveryBlock, validateRecoveryManifest } from './recovery-replay.js';
import type { RecoveryView, RecoveryControlFold } from './recovery-replay.js';
import { RecoveryError, recoveryValue } from './recovery-types.js';
import type { RecoveryManifest } from './recovery-types.js';
import type { ReviewRuntimePortsV1 } from './types.js';
import type { BlockProgressTransitionV1 } from './continuation-types.js';
import { ledgerDigest } from './ledger-identity.js';
export interface RecoveryStoreOptions extends RecoveryJournalOptions {
 /** Trusted owner assertion. sc4 lifecycle supplies the persistent lease implementation. */
 readonly assertOwner: (generation:number,attemptId:string)=>void;
 readonly readEvidence: ReviewRuntimePortsV1['readEvidence'];
 readonly controlFold?: RecoveryControlFold | undefined;
}
export class RecoveryStore {
 readonly journal:RecoveryJournal;
 constructor(repo:string,runId:string,readonly options:RecoveryStoreOptions){this.journal=new RecoveryJournal(repo,runId,options);}
 async prepare(raw:RecoveryManifest):Promise<RecoveryView>{return this.journal.exclusive(()=>{
  const manifest=validateRecoveryManifest(raw);if(manifest.runId!==this.journal.runId)throw new RecoveryError('invalid-input','Foreign run manifest.');
  const existing=this.journal.events();if(existing.length){const view=this.replay();if(ledgerDigest(view.manifest)!==ledgerDigest(manifest))throw new RecoveryError('invalid-input','Run manifest conflict.');return view;}
  const staged=this.journal.stage({...manifest});this.journal.append({eventId:'prepared',generation:0,kind:'state',subjectDigest:manifest.subjectDigest,policyDigest:manifest.policyDigest,payloadRef:staged.reference});return this.replay();
 });}
 replay(repairTail=false):RecoveryView{return replayRecovery(this.journal,repairTail,this.options.controlFold);}
 /** All closures are daemon-owned. No mutable store or authority token is handed to the model. */
 ports(generation:number,attemptId:string):ReviewRuntimePortsV1{
  const assert=()=>this.options.assertOwner(generation,attemptId);
  return {
   readEvidence:async(subjectId,ref)=>{assert();const v=this.replay();if(subjectId!==v.manifest.basis.subject.subjectId)throw new RecoveryError('invalid-input','Foreign subject.');return this.options.readEvidence(subjectId,ref);},
   stageImmutableValue:async(runId,value)=>this.journal.exclusive(()=>{assert();if(runId!==this.journal.runId)throw new RecoveryError('invalid-input','Foreign run.');return this.journal.stage(value);}),
   appendTransition:async(runId,gen,sequence,ref)=>this.journal.exclusive(()=>{
    assert();if(runId!==this.journal.runId||gen!==generation)throw new RecoveryError('ownership-lost','Foreign owner binding.');
    const view=this.replay(),transition=this.journal.read(ref) as BlockProgressTransitionV1;
    if(transition.progress?.attemptId!==attemptId)throw new RecoveryError('invalid-input','Foreign attempt.');
    const old=view.state.accepted.find(a=>a.progress.progressId===transition.progress.progressId);
    if(old){if(old.payloadDigest!==ledgerDigest(transition.progress))throw new RecoveryError('invalid-input','Conflicting accepted progress.');this.journal.stabilize();return {sequence:old.receipt.sequence,checkpointDigest:old.receipt.checkpointDigest};}
    if(sequence!==view.state.sequence)throw new RecoveryError('invalid-input','Expected acceptance sequence mismatch.');
    const m=view.manifest,event={version:1 as const,ordinal:view.eventOrdinal+1,previousDigest:view.eventDigest,eventId:randomUUID(),runId,subjectDigest:m.subjectDigest,policyDigest:m.policyDigest,generation,kind:'block' as const,payloadRef:ref,digest:'candidate'};
    // Validate before writing; replay applies the identical pure reducer.
    applyRecoveryBlock(view,transition,event,r=>this.journal.read(r));assert();
    this.journal.append(eventInput(event));const accepted=this.replay().state.accepted.at(-1)!.receipt;
    assert();return {sequence:accepted.sequence,checkpointDigest:accepted.checkpointDigest};
   }),
   recordAttemptUsage:async()=>{throw new RecoveryError('unsupported','Durable usage adapter not composed.');}
  };
 }
}
function eventInput(e:Parameters<typeof applyRecoveryBlock>[2]){const {version:_,ordinal:__,previousDigest:___,digest:____,runId:_____,...input}=e;return recoveryValue(input);}
