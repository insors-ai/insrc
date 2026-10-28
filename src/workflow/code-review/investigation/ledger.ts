/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { validateLedgerBasis, initializeReviewLedger } from './ledger-catalog.js';
import { admitLedgerEvidence, evidenceFromReceipt, validateAttempt } from './ledger-evidence.js';
import { coverageRowId, ledgerDigest, ledgerSnapshot, requireText, ledgerEqual as same } from './ledger-identity.js';
import { LEDGER_LIMITS, ReviewLedgerError } from './ledger-types.js';
import type { CoverageV1, EvidenceV1, LedgerBasis, LedgerDelta, LedgerFinding, LedgerValidationContext, ReviewLedgerV1, TrustedInspectionReceipt } from './ledger-types.js';
export { initializeReviewLedger } from './ledger-catalog.js';
function strings(value:unknown):value is readonly string[]{return Array.isArray(value)&&value.every(v=>typeof v==='string'&&v.trim().length>0)&&new Set(value).size===value.length;}
function unique<T>(values:readonly T[],key:(value:T)=>string):Map<string,T>{
 const map=new Map<string,T>();for(const value of values){const id=key(value);requireText(id,'record id');if(map.has(id))throw new ReviewLedgerError('conflicting-replay','Duplicate ledger record id.');map.set(id,value);}return map;
}
function inspectionMap(basis:LedgerBasis,context:LedgerValidationContext){
 validateAttempt(context.attempt,basis);
 if(!Array.isArray(context.receipts)||context.receipts.length>LEDGER_LIMITS.evidence)throw new ReviewLedgerError('resource-limit','Invalid receipt collection size.');
 const receipts=new Map<string,TrustedInspectionReceipt>(),evidence=new Map<string,{value:EvidenceV1;receipt:TrustedInspectionReceipt}>();
 for(const receipt of context.receipts){
  const prior=receipts.get(receipt.receiptId);if(prior&&!same(prior,receipt))throw new ReviewLedgerError('conflicting-replay','Inspection receipt changed.');
  receipts.set(receipt.receiptId,receipt);const value=evidenceFromReceipt(basis,receipt);evidence.set(value.evidenceId,{value,receipt});
 }
 return {receipts,evidence};
}
function validateState(ledger:ReviewLedgerV1,basis:LedgerBasis,inspections:ReturnType<typeof inspectionMap>,allowNewImpacts=false):void{
 if(ledger.runId!==basis.runId||ledger.subjectDigest!==basis.subject.subjectDigest)throw new ReviewLedgerError('subject-mismatch','Ledger belongs to another run/subject.');
 if(!Array.isArray(ledger.coverage)||!Array.isArray(ledger.evidence)||!Array.isArray(ledger.findings))throw new ReviewLedgerError('invalid-input','Ledger collections are required.');
 if(ledger.coverage.length>LEDGER_LIMITS.rows||ledger.evidence.length>LEDGER_LIMITS.evidence||ledger.findings.length>LEDGER_LIMITS.findings)throw new ReviewLedgerError('resource-limit','Ledger record limit exceeded.');
 const rows=unique<CoverageV1>(ledger.coverage,r=>r.rowId),evidence=unique<EvidenceV1>(ledger.evidence,e=>e.evidenceId),findings=unique<LedgerFinding>(ledger.findings,f=>f.findingId);
 const requirements=new Map(basis.requirements.map(r=>[coverageRowId(basis.subject.subjectDigest,r),r]));
 const refs=new Set(basis.requirements.map(r=>r.requirementRef)),criteria=new Set(basis.criteria.map(c=>c.id));
 for(const [id,r]of requirements)if(!rows.has(id)&&!(allowNewImpacts&&r.category==='impact'))throw new ReviewLedgerError('unknown-reference','Required coverage row missing.');
 for(const e of evidence.values()){
  const proof=inspections.evidence.get(e.evidenceId);
  if(!proof||!same(e,proof.value))throw new ReviewLedgerError('provenance-mismatch','Ledger evidence differs from inspected receipt.');
 }
 for(const f of findings.values()){
  requireText(f.message,'finding message');
  if(!criteria.has(f.criterion)||!['HIGH','MED','LOW'].includes(f.severity)||!['breach','observation'].includes(f.confidence)
   ||!strings(f.evidenceIds)||!f.evidenceIds.length||!strings(f.expectationRefs)||!f.expectationRefs.length)throw new ReviewLedgerError('invalid-input','Finding needs criterion, severity, confidence, evidence and expectations.');
  if(f.evidenceIds.some(id=>!evidence.has(id))||f.expectationRefs.some(ref=>!refs.has(ref)))throw new ReviewLedgerError('unknown-reference','Finding links are outside this ledger.');
  if(f.confidence==='breach'&&!f.evidenceIds.some(id=>evidence.get(id)?.completeness==='complete'))throw new ReviewLedgerError('invalid-input','A breach needs inspected complete evidence.');
 }
 for(const row of rows.values()){
  const requirement=requirements.get(row.rowId);
  if(!requirement||row.subjectDigest!==basis.subject.subjectDigest||row.category!==requirement.category||row.requirementRef!==requirement.requirementRef)throw new ReviewLedgerError('unknown-reference','Foreign or modified coverage identity.');
  if(!strings(row.evidenceIds)||!strings(row.findingIds)||!['pending','satisfied','finding','unverified','not-applicable'].includes(row.disposition))throw new ReviewLedgerError('invalid-input','Invalid coverage disposition/links.');
  if(row.evidenceIds.some(id=>!evidence.has(id))||row.findingIds.some(id=>!findings.has(id)))throw new ReviewLedgerError('unknown-reference','Coverage links are unresolved.');
  for(const id of row.findingIds){const f=findings.get(id)!;if(!f.expectationRefs.includes(row.requirementRef))throw new ReviewLedgerError('unknown-reference','Finding does not assess this requirement.');if(f.evidenceIds.some(id=>!row.evidenceIds.includes(id)))throw new ReviewLedgerError('unknown-reference','Coverage must retain its linked finding evidence.');}
  if(row.disposition==='pending'){
   if(row.assessedByAttempt!==null||row.rationale!==''||row.evidenceIds.length||row.findingIds.length)throw new ReviewLedgerError('invalid-input','Pending row cannot masquerade as an assessment.');
   continue;
  }
  requireText(row.rationale,'assessment rationale');requireText(row.assessedByAttempt,'assessing attempt');
  const complete=row.evidenceIds.filter(id=>evidence.get(id)?.completeness==='complete');
  if(row.disposition==='satisfied'){
   if(!complete.length)throw new ReviewLedgerError('invalid-input','Satisfaction requires complete inspected supporting evidence.');
   if(requirement.needs==='test-pass'&&!complete.some(id=>inspections.evidence.get(id)?.receipt.testResult==='pass'))throw new ReviewLedgerError('invalid-input','Positive test obligation requires a verified passing test result.');
  }
  if(row.disposition==='finding'&&(!row.findingIds.length||!row.evidenceIds.length))throw new ReviewLedgerError('invalid-input','Finding disposition needs linked finding and evidence.');
  if(row.disposition==='not-applicable'&&(!requirement.allowNotApplicable||!complete.length))throw new ReviewLedgerError('invalid-input','Not-applicable requires allowed applicability and inspected supporting evidence.');
 }
 // Findings must remain accountable even if a row later changes disposition.
 for(const f of findings.values())for(const ref of f.expectationRefs)if(![...rows.values()].some(r=>r.requirementRef===ref&&r.findingIds.includes(f.findingId)))throw new ReviewLedgerError('unknown-reference','Each finding expectation must link an accountable coverage row.');
}
export function validateReviewLedger(input:ReviewLedgerV1,basisInput:LedgerBasis,contextInput:LedgerValidationContext):void{
 const basis=ledgerSnapshot(basisInput),context=ledgerSnapshot(contextInput),ledger=ledgerSnapshot(input);
 validateLedgerBasis(basis);validateState(ledger,basis,inspectionMap(basis,context));
}
/** Pure atomic candidate transition. sc4 owns journaling, owner fencing and durable acknowledgments. */
export function applyReviewLedgerDelta(input:ReviewLedgerV1,deltaInput:LedgerDelta,basisInput:LedgerBasis,contextInput:LedgerValidationContext):ReviewLedgerV1{
 const basis=ledgerSnapshot(basisInput),context=ledgerSnapshot(contextInput),ledger=ledgerSnapshot(input),delta=ledgerSnapshot(deltaInput);
 validateLedgerBasis(basis);const inspections=inspectionMap(basis,context);validateState(ledger,basis,inspections,true);
 if(!strings(delta.receiptIds)||!Array.isArray(delta.findings)||!Array.isArray(delta.assessments))throw new ReviewLedgerError('invalid-input','Invalid ledger delta collections.');
 const evidence=new Map(ledger.evidence.map(e=>[e.evidenceId,e])),findings=new Map(ledger.findings.map(f=>[f.findingId,f])),rows=new Map(ledger.coverage.map(r=>[r.rowId,r]));
 for(const ref of delta.receiptIds){
  const receipt=inspections.receipts.get(ref);if(!receipt)throw new ReviewLedgerError('unknown-reference','Inspection receipt not found.');
  const projected=evidenceFromReceipt(basis,receipt);
  if(!evidence.has(projected.evidenceId))evidence.set(projected.evidenceId,admitLedgerEvidence(basis,receipt,context.attempt));
 }
 for(const f of delta.findings){
  const old=findings.get(f.findingId);if(old&&!same(old,f))throw new ReviewLedgerError('conflicting-replay','Existing finding cannot be replaced.');findings.set(f.findingId,f);
 }
 for(const pending of initializeReviewLedger(basis).coverage)if(!rows.has(pending.rowId))rows.set(pending.rowId,pending);
 const touched=new Set<string>();
 for(const update of delta.assessments){
  if(touched.has(update.rowId))throw new ReviewLedgerError('conflicting-replay','Multiple assessments of one row in a delta.');touched.add(update.rowId);
  const old=rows.get(update.rowId);if(!old)throw new ReviewLedgerError('unknown-reference','Coverage row does not exist.');
  if(same(old,update))continue; // Historical accepted assessment replay need not impersonate the new attempt.
  if(update.assessedByAttempt!==context.attempt.attemptId)throw new ReviewLedgerError('provenance-mismatch','Assessment was not made by the authenticated attempt.');
  if(!strings(update.evidenceIds)||!strings(update.findingIds))throw new ReviewLedgerError('invalid-input','Invalid assessment links.');
  rows.set(update.rowId,{...update,evidenceIds:[...new Set([...old.evidenceIds,...update.evidenceIds])],findingIds:[...new Set([...old.findingIds,...update.findingIds])]});
 }
 const candidate=ledgerSnapshot({...ledger,evidence:[...evidence.values()],findings:[...findings.values()],coverage:[...rows.values()]});
 validateState(candidate,basis,inspections);return candidate;
}
