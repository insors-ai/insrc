/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { appendImpactRequirements, validateLedgerBasis } from './ledger-catalog.js';
import { applyReviewLedgerDelta, initializeReviewLedger, validateReviewLedger } from './ledger.js';
import { evidenceFromReceipt } from './ledger-evidence.js';
import { ledgerDigest, ledgerEqual } from './ledger-identity.js';
import { RecoveryError, recoveryValue, recoveryId, recoveryDigest, recoveryVersion } from './recovery-types.js';
import type { RecoveryManifest, RecoveryEvent } from './recovery-types.js';
import type { BlockProgressTransitionV1, InvestigationState } from './continuation-types.js';
import type { LedgerBasis, TrustedInspectionReceipt } from './ledger-types.js';
import type { RecoveryJournal } from './recovery-journal.js';
export interface RecoveryView {
 readonly manifest: RecoveryManifest; readonly basis: LedgerBasis; readonly state: InvestigationState;
 readonly receipts: readonly TrustedInspectionReceipt[]; readonly outstandingWork: readonly string[];
 readonly eventOrdinal: number; readonly eventDigest: string;
}
export function validateRecoveryManifest(raw: RecoveryManifest): RecoveryManifest {
 const m=recoveryValue(raw);recoveryVersion(m.version);recoveryId(m.runId);recoveryDigest(m.subjectDigest);recoveryDigest(m.policyDigest);
 validateLedgerBasis(m.basis);
 if(m.runId!==m.basis.runId||m.subjectDigest!==m.basis.subject.subjectDigest||m.policyDigest!==m.policy.digest
  ||m.compatibility.engine!==1||m.compatibility.evidence!==1||typeof m.compatibility.toolsDigest!=='string'||typeof m.compatibility.providerDigest!=='string'
  ||m.initial.sequence!==0||m.initial.accepted.length||m.initial.attempts!==0||m.initial.consumedActiveMs!==0||m.initial.usage.length||m.initial.uncertainProgressId!==null
  ||!m.initial.checkpoint||!ledgerEqual(m.initial.ledger,initializeReviewLedger(m.basis)))throw new RecoveryError('invalid-input','Invalid initial recovery manifest.');
 return m;
}
export function applyRecoveryBlock(view: RecoveryView,t: BlockProgressTransitionV1,event: RecoveryEvent,read:(ref:string)=>unknown):RecoveryView {
 const p=t.progress,m=view.manifest;
 if(t.version!==1||t.kind!=='block-progress'||p.runId!==m.runId||p.subjectDigest!==m.subjectDigest||p.generation!==event.generation
  ||t.payloadDigest!==ledgerDigest(p)||t.predecessorCheckpoint!==view.state.checkpoint||p.expectedSequence!==view.state.sequence
  ||view.state.accepted.some(a=>a.progress.progressId===p.progressId)||!p.notes?.trim()||p.notes.length>16000
  ||!['reviewed','needs-followup','unverified'].includes(p.disposition))throw new RecoveryError('corrupt','Invalid accepted progress binding.');
 recoveryId(p.progressId);recoveryId(p.attemptId);
 const basis=read(t.basisRef) as LedgerBasis;validateLedgerBasis(basis);
 if(!basis.subject.packets.flatMap(packet=>packet.blocks).some(b=>b.blockId===p.blockId))throw new RecoveryError('corrupt','Foreign packet block.');
 const additions=basis.requirements.filter(r=>!view.basis.requirements.some(old=>old.category===r.category&&old.requirementRef===r.requirementRef));
 if(!ledgerEqual(appendImpactRequirements(view.basis,additions),basis))throw new RecoveryError('corrupt','Recovery basis widened or changed.');
 const receipts=[...view.receipts];
 for(const ref of t.trustedReceiptRefs){const r=read(ref) as TrustedInspectionReceipt;const old=receipts.find(x=>x.receiptId===r.receiptId);if(old&&!ledgerEqual(old,r))throw new RecoveryError('corrupt','Trusted receipt changed.');if(!old)receipts.push(r);}
 const byId=new Map(receipts.map(r=>[evidenceFromReceipt(basis,r).evidenceId,r]));
 if(!Array.isArray(p.evidenceIds)||new Set(p.evidenceIds).size!==p.evidenceIds.length||p.evidenceIds.some(id=>!byId.has(id)))throw new RecoveryError('corrupt','Uninspected progress evidence.');
 const receiptIds=p.evidenceIds.map(id=>byId.get(id)!.receiptId);
 const ledger=applyReviewLedgerDelta(view.state.ledger,{receiptIds,findings:p.findings,assessments:p.coverageUpdates},basis,{attempt:{runId:p.runId,subjectDigest:p.subjectDigest,attemptId:p.attemptId},receipts});
 if(!ledgerEqual(ledger,read(t.candidateLedgerRef)))throw new RecoveryError('corrupt','Candidate ledger differs from validated delta.');
 const known=new Set([...basis.requirements.map(r=>r.requirementRef),...basis.subject.packets.flatMap(packet=>packet.blocks.map(b=>b.blockId))]);
 if(!Array.isArray(p.outstandingWork)||p.outstandingWork.some(ref=>!known.has(ref)))throw new RecoveryError('corrupt','Foreign outstanding work.');
 const sequence=view.state.sequence+1;
 const checkpoint=ledgerDigest({prior:view.state.checkpoint,runId:m.runId,sequence,transitionRef:event.payloadRef,payloadDigest:t.payloadDigest});
 const receipt={runId:p.runId,subjectDigest:p.subjectDigest,generation:p.generation,progressId:p.progressId,blockId:p.blockId,sequence,checkpointDigest:checkpoint};
 // Explicit retained work cannot be dropped by omission. A requirement clears only with a non-pending/non-unverified assessment.
 const unresolved=basis.requirements.filter(r=>{const row=ledger.coverage.find(c=>c.category===r.category&&c.requirementRef===r.requirementRef);return !row||['pending','unverified'].includes(row.disposition);}).map(r=>r.requirementRef);
 const isUnresolved=(ref:string)=>!basis.requirements.some(r=>r.requirementRef===ref)||unresolved.includes(ref);
 const outstandingWork=[...new Set([...view.outstandingWork.filter(isUnresolved),...p.outstandingWork,...unresolved])];
 return recoveryValue({...view,basis,receipts,outstandingWork,eventOrdinal:event.ordinal,eventDigest:event.digest,state:{...view.state,ledger,sequence,checkpoint,accepted:[...view.state.accepted,{payloadDigest:t.payloadDigest,progress:p,receipt}],uncertainProgressId:null}});
}
export type RecoveryControlFold=(view:RecoveryView,event:RecoveryEvent,payload:unknown)=>RecoveryView;
/** Snapshots are optional caches. Always verify the complete authoritative prefix and referenced closure. */
export function replayRecovery(journal:RecoveryJournal,repairTail=false,control?:RecoveryControlFold):RecoveryView {
 const events=journal.events(repairTail),first=events[0];
 if(!first||first.kind!=='state'||first.eventId!=='prepared'||first.generation!==0)throw new RecoveryError('unsupported','No resumable investigation manifest.');
 const manifest=validateRecoveryManifest(journal.read(first.payloadRef) as RecoveryManifest);
 let view:RecoveryView={manifest,basis:manifest.basis,state:manifest.initial,receipts:manifest.receipts,outstandingWork:manifest.basis.requirements.map(r=>r.requirementRef),eventOrdinal:1,eventDigest:first.digest};
 for(const event of events){
  if(event.runId!==manifest.runId||event.subjectDigest!==manifest.subjectDigest||event.policyDigest!==manifest.policyDigest)throw new RecoveryError('corrupt','Event changed subject or policy binding.');
  if(event===first)continue;
  const payload=journal.read(event.payloadRef);
  try {view=event.kind==='block'?applyRecoveryBlock(view,payload as BlockProgressTransitionV1,event,r=>journal.read(r)):control?control(view,event,payload):(()=>{throw new RecoveryError('unsupported','Unsupported recovery control event.');})();}
  catch(cause){throw new RecoveryError('corrupt','Recovery transition failed validation.',{cause});}
 }
 validateReviewLedger(view.state.ledger,view.basis,{attempt:{runId:manifest.runId,subjectDigest:manifest.subjectDigest,attemptId:view.state.accepted.at(-1)?.progress.attemptId??'initial'},receipts:view.receipts});
 return recoveryValue(view);
}
