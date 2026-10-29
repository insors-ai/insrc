/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { applyReviewLedgerDelta, validateReviewLedger } from './ledger.js';
import { evidenceFromReceipt } from './ledger-evidence.js';
import { ledgerDigest, ledgerSnapshot, requireText } from './ledger-identity.js';
import { InvestigationError } from './continuation-types.js';
import type { InvestigationContext, InvestigationTurnV1, InvestigationState, ReviewBlockProgressV1, BlockCheckpointReceiptV1, BlockProgressTransitionV1 } from './continuation-types.js';
import type { LedgerValidationContext, LedgerBasis } from './ledger-types.js';

/** One owner view only. Durable append, idempotent storage and generation fencing are sc4/sc6 responsibilities. */
export class BlockProgressCoordinator {
 private current:InvestigationState;
 private busy=false;
 constructor(private readonly turn:InvestigationTurnV1,private readonly context:InvestigationContext,
  private readonly validation:()=>LedgerValidationContext=()=>context.validation,
  private readonly basis:()=>LedgerBasis=()=>context.basis){
  this.current=ledgerSnapshot(context.state);
  validateReviewLedger(this.current.ledger,context.basis,validation());
  const ids=new Set<string>();
  for(const old of this.current.accepted){
   if(ids.has(old.progress.progressId)||old.payloadDigest!==ledgerDigest(old.progress)||old.receipt.progressId!==old.progress.progressId
    ||old.receipt.runId!==turn.runId||old.receipt.subjectDigest!==turn.subjectDigest||old.receipt.blockId!==old.progress.blockId
    ||!Number.isSafeInteger(old.receipt.sequence)||old.receipt.sequence<1||old.receipt.sequence>this.current.sequence)throw new InvestigationError('invalid-binding','Invalid authoritative progress history.');
   ids.add(old.progress.progressId);
  }
 }
 get state():InvestigationState{return this.current;}
 /** Accounting does not replace accepted ledger/receipt history. */
 account(value:Pick<InvestigationState,'consumedActiveMs'|'attempts'|'usage'>):void{
  if(value.consumedActiveMs<this.current.consumedActiveMs||value.attempts<this.current.attempts)throw new InvestigationError('invalid-binding','Consumed allowance cannot decrease.');
  this.publish({...this.current,...value});
 }
 private publish(value:InvestigationState):void{this.current=ledgerSnapshot(value);this.context.onState(this.current);}
 async accept(raw:ReviewBlockProgressV1):Promise<BlockCheckpointReceiptV1>{
  if(this.busy||this.current.uncertainProgressId)throw new InvestigationError('acceptance-conflict','An acceptance is pending or uncertain.');
  const p=ledgerSnapshot(raw),digest=ledgerDigest(p);
  this.context.assertOwner(this.turn.generation);
  if(p.runId!==this.turn.runId||p.subjectDigest!==this.turn.subjectDigest||p.generation!==this.turn.generation||p.attemptId!==this.turn.attemptId)throw new InvestigationError('invalid-progress','Foreign progress identity.');
  requireText(p.progressId,'progress id');requireText(p.notes,'progress notes');
  if(p.notes.length>16000||!['reviewed','needs-followup','unverified'].includes(p.disposition))throw new InvestigationError('invalid-progress','Invalid progress assessment.');
  const block=this.basis().subject.packets.flatMap(packet=>packet.blocks).find(b=>b.blockId===p.blockId);
  if(!block)throw new InvestigationError('invalid-progress','Progress block is outside selected packets.');
  const prior=this.current.accepted.find(r=>r.progress.progressId===p.progressId);
  if(prior){if(prior.payloadDigest!==digest)throw new InvestigationError('acceptance-conflict','Progress identity has conflicting content.');return prior.receipt;}
  if(p.expectedSequence!==this.current.sequence)throw new InvestigationError('acceptance-conflict','Progress expected sequence mismatch.');
  const refs=new Set(this.basis().requirements.map(r=>r.requirementRef));for(const b of this.basis().subject.packets.flatMap(packet=>packet.blocks))refs.add(b.blockId);
  if(!Array.isArray(p.outstandingWork)||p.outstandingWork.some(r=>!refs.has(r))||!Array.isArray(p.evidenceIds)||new Set(p.evidenceIds).size!==p.evidenceIds.length)throw new InvestigationError('invalid-progress','Invalid outstanding/evidence references.');
  const validation=this.validation();
  const inspectionById=new Map(validation.receipts.map(r=>[evidenceFromReceipt(this.basis(),r).evidenceId,r]));
  const known=new Set(this.current.ledger.evidence.map(e=>e.evidenceId));
  if(p.evidenceIds.some(id=>!known.has(id)&&!inspectionById.has(id)))throw new InvestigationError('invalid-progress','Uninspected evidence cannot be accepted.');
  const receiptIds=p.evidenceIds.flatMap(id=>{const r=inspectionById.get(id);return r?[r.receiptId]:[];});
  let candidate;
  try{candidate=applyReviewLedgerDelta(this.current.ledger,{receiptIds,findings:p.findings,assessments:p.coverageUpdates},this.basis(),validation);}
  catch(cause){throw new InvestigationError('invalid-progress','Ledger progress failed validation.',{cause});}
  this.busy=true;let appendStarted=false;
  try{
   const stagedLedger=await this.context.ports.stageImmutableValue(this.turn.runId,{...candidate});
   this.context.assertOwner(this.turn.generation);
   const stagedBasis=await this.context.ports.stageImmutableValue(this.turn.runId,{...this.basis()});
   const trustedReceiptRefs:string[]=[];
   for(const id of receiptIds){const native=validation.receipts.find(r=>r.receiptId===id)!;const stored=await this.context.ports.stageImmutableValue(this.turn.runId,{...native});trustedReceiptRefs.push(stored.reference);}
   const transition:BlockProgressTransitionV1={version:1,kind:'block-progress',progress:p,payloadDigest:digest,candidateLedgerRef:stagedLedger.reference,basisRef:stagedBasis.reference,
    trustedReceiptRefs,predecessorCheckpoint:this.current.checkpoint};
   const staged=await this.context.ports.stageImmutableValue(this.turn.runId,{...transition});
   this.context.assertOwner(this.turn.generation);appendStarted=true;
   const appended=await this.context.ports.appendTransition(this.turn.runId,this.turn.generation,p.expectedSequence,staged.reference);
   this.context.assertOwner(this.turn.generation);
   if(appended.sequence!==p.expectedSequence+1||typeof appended.checkpointDigest!=='string'||!appended.checkpointDigest)throw new InvestigationError('acceptance-conflict','Acceptance receipt is invalid.');
   const receipt=ledgerSnapshot({runId:p.runId,subjectDigest:p.subjectDigest,generation:p.generation,progressId:p.progressId,blockId:p.blockId,sequence:appended.sequence,checkpointDigest:appended.checkpointDigest});
   this.publish({...this.current,ledger:candidate,sequence:receipt.sequence,checkpoint:receipt.checkpointDigest,accepted:[...this.current.accepted,{payloadDigest:digest,progress:p,receipt}],uncertainProgressId:null});
   return receipt; // ACK only after successful append and accepted owner view.
  }catch(cause){
   if(appendStarted)this.publish({...this.current,uncertainProgressId:p.progressId});
   throw new InvestigationError('acceptance-conflict',appendStarted?'Transition acceptance outcome is uncertain; no ACK.':'Transition staging failed; no ACK.',{cause});
  }finally{this.busy=false;}
 }
}
