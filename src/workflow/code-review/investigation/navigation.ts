/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { admitLedgerEvidence } from './ledger-evidence.js';
import { appendImpactRequirements } from './ledger-catalog.js';
import { ledgerDigest, ledgerEqual, ledgerSnapshot } from './ledger-identity.js';
import { InvestigationError } from './continuation-types.js';
import type { InvestigationContext, InvestigationTurnV1, ImpactCapabilityV1 } from './continuation-types.js';
import type { LedgerBasis, LedgerValidationContext, TrustedInspectionReceipt, EvidenceV1 } from './ledger-types.js';

/** Observe cancellation even when an adapter ignores it; late results cannot update owner state. */
export async function untilInvestigationAborted<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();let abort:()=>void=()=>{};
 try{return await Promise.race([work,new Promise<never>((_resolve,reject)=>{abort=()=>reject(new InvestigationError('cancelled','Investigation cancelled.'));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();})]);}
 finally{signal.removeEventListener('abort',abort);}
}
export class InvestigationNavigation {
 private receipts:TrustedInspectionReceipt[];
 private currentBasis:LedgerBasis;
 private busy=false;
 constructor(private readonly turn:InvestigationTurnV1,private readonly context:InvestigationContext,private readonly signal:AbortSignal,
  private readonly onImpact:(basis:LedgerBasis,blockId:string,refs:readonly string[])=>Promise<void>){
  this.receipts=[...context.validation.receipts];this.currentBasis=context.basis;
 }
 get basis():LedgerBasis{return this.currentBasis;}
 validation=():LedgerValidationContext=>({attempt:{runId:this.turn.runId,subjectDigest:this.turn.subjectDigest,attemptId:this.turn.attemptId},receipts:this.receipts});
 private check():void{this.signal.throwIfAborted();this.context.assertOwner(this.turn.generation);if(this.busy)throw new InvestigationError('invalid-binding','Navigation calls must be serial.');}
 private admit(receipt:TrustedInspectionReceipt):EvidenceV1{
  const evidence=admitLedgerEvidence(this.currentBasis,receipt,this.validation().attempt),old=this.receipts.find(r=>r.receiptId===receipt.receiptId);
  if(old&&!ledgerEqual(old,receipt))throw new InvestigationError('invalid-progress','Inspection receipt identity changed.');
  if(!old)this.receipts.push(ledgerSnapshot(receipt));return evidence;
 }
 read=async(reference:string)=>{
  this.check();this.busy=true;
  try{
   const result=await untilInvestigationAborted(this.context.inspect(reference,this.turn.attemptId,this.signal),this.signal);
   this.signal.throwIfAborted();this.context.assertOwner(this.turn.generation);
   const {read,inspection}=result;
   // Native test receipts intentionally have no source readReceipt (sc2). Their
   // display is still bound to the verified digest, result reference and limits.
   const matches=inspection.kind==='test-result'
    ?inspection.readReceipt===null&&read.sourceDigest===inspection.source.digest&&read.contentRef===inspection.contentRef
     &&ledgerEqual(read.lines,inspection.source.lines)&&read.completeness===inspection.completeness
     &&ledgerEqual(read.limitations,inspection.limitations)&&(read.completeness!=='complete'||(typeof read.text==='string'&&read.text.trim().length>0))
    :ledgerEqual(read,inspection.readReceipt);
   if(read.reference!==reference||!matches)throw new InvestigationError('invalid-progress','Read is not the authenticated inspected receipt.');
   const evidence=this.admit(result.inspection);return ledgerSnapshot({...result.read,evidenceId:evidence.evidenceId});
  }finally{this.busy=false;}
 };
 capability():ImpactCapabilityV1{
  const original=this.context.impact;
  if(original.mode==='source-only')return {mode:'source-only',index:null,queryChangedEntityCallers:null};
  if(!original.index||!original.queryChangedEntityCallers)throw new InvestigationError('impact-unavailable','Indexed mode has no qualified capability.');
  return {mode:'indexed-impact',index:ledgerSnapshot(original.index),queryChangedEntityCallers:async(entityRef:string)=>{
   this.check();this.busy=true;
   try{
    const mapped=this.context.changedEntity(entityRef),blocks=this.currentBasis.subject.packets.flatMap(p=>p.blocks);
    if(!mapped||!blocks.some(b=>b.blockId===mapped.blockId)||!/^[a-f0-9]{64}$/.test(mapped.sourceDigest))throw new InvestigationError('impact-unavailable','Entity cannot be bound to a selected changed block.');
    const ref=`impact:${ledgerDigest({entityRef,sourceDigest:mapped.sourceDigest,index:original.index})}`;
    const extended=appendImpactRequirements(this.currentBasis,[{category:'impact',requirementRef:ref,text:`Assess callers of ${entityRef}; caller discovery remains ${original.index!.freshness}/${original.index!.completeness}. Empty results do not prove no impact.`,needs:'inspection',allowNotApplicable:false}]);
    // Retain the unresolved obligation even when caller acquisition fails.
    this.currentBasis=extended;await this.onImpact(extended,mapped.blockId,[ref]);
    const values=await untilInvestigationAborted(original.queryChangedEntityCallers!(entityRef),this.signal);
    this.signal.throwIfAborted();this.context.assertOwner(this.turn.generation);
    const native=this.context.impactReceipts(values),byId=new Map<string,EvidenceV1>();
    for(const receipt of native){const evidence=this.admit(receipt);byId.set(evidence.evidenceId,evidence);}
    for(const value of values){
     const verified=byId.get(value.evidenceId);
     if(!verified||!ledgerEqual(value,verified)||value.kind!=='caller-impact'||value.role!=='context-only')throw new InvestigationError('invalid-progress','Impact evidence lacks matching inspected native provenance.');
    }
    return ledgerSnapshot(values);
   }finally{this.busy=false;}
  }};
 }
}
