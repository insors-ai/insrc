/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { validateLedgerBasis } from './ledger-catalog.js';
import { ledgerDigest, ledgerSnapshot, requireText, ledgerEqual as same } from './ledger-identity.js';
import { ReviewLedgerError } from './ledger-types.js';
import type { EvidenceV1, LedgerAttempt, LedgerBasis, TrustedInspectionReceipt } from './ledger-types.js';

export function validateAttempt(attempt: LedgerAttempt, basis: LedgerBasis): void {
 requireText(attempt.attemptId,'authenticated attempt');
 if(attempt.runId!==basis.runId||attempt.subjectDigest!==basis.subject.subjectDigest)throw new ReviewLedgerError('subject-mismatch','Attempt belongs to another run/subject.');
}
function validRange(range: readonly [number,number] | null): boolean {
 return range===null || (Array.isArray(range)&&range.length===2&&range.every(Number.isSafeInteger)&&range[0]>=1&&range[1]>=range[0]);
}
function sourceProof(receipt:TrustedInspectionReceipt,basis:LedgerBasis): void {
 const read=receipt.readReceipt;
 if(!read || read.sourceDigest!==receipt.source.digest || read.contentRef!==receipt.contentRef
  || read.completeness!==receipt.completeness || !same(read.lines,receipt.source.lines) || !same(read.limitations,receipt.limitations))throw new ReviewLedgerError('provenance-mismatch','Source receipt metadata does not match the inspected read.');
 let reference:Record<string,unknown>;
 try{reference=JSON.parse(read.reference) as Record<string,unknown>;}catch{throw new ReviewLedgerError('provenance-mismatch','Malformed inspected source reference.');}
 if(!reference||typeof reference!=='object'||Array.isArray(reference)||!Number.isSafeInteger(reference['start'])||!Number.isSafeInteger(reference['end'])
  ||Number(reference['start'])<1||Number(reference['end'])<Number(reference['start']))throw new ReviewLedgerError('provenance-mismatch','Invalid inspected bounds.');
 if(receipt.source.lines&&(receipt.source.lines[0]<Number(reference['start'])||receipt.source.lines[1]>Number(reference['end'])))throw new ReviewLedgerError('provenance-mismatch','Evidence exceeds inspected bounds.');
 if(receipt.completeness==='complete'&&(read.text===null||!same(read.lines,[reference['start'],reference['end']])))throw new ReviewLedgerError('provenance-mismatch','Complete textual evidence must cover its inspected range.');
 const s=basis.subject;
 if(receipt.kind==='artifact'){
  const pin=s.contracts.find(p=>p.artifactId===receipt.artifactId);
  if(!pin||reference['kind']!=='artifact'||reference['artifactId']!==pin.artifactId||receipt.source.path!==pin.path||receipt.source.revision!==String(pin.revision)
   ||receipt.role!=='context-only'||receipt.contentRef!==`artifact:${pin.artifactId}@${pin.revision}#${pin.contentDigest}`)throw new ReviewLedgerError('provenance-mismatch','Artifact evidence is not pinned.');
 }else if(receipt.kind==='changed-block'){
  const pair=s.packets.flatMap(packet=>packet.blocks.map(block=>({packet,block}))).find(x=>x.block.blockId===receipt.blockId);
  if(!pair||receipt.role!=='changed-scope'||reference['kind']!=='blob')throw new ReviewLedgerError('provenance-mismatch','Changed evidence needs an exact selected block.');
  const {packet,block}=pair;
  const side=receipt.source.revision===packet.parentId&&receipt.source.path===block.oldPath?{blob:block.oldBlob,lines:block.oldLines}
   :receipt.source.revision===packet.commitId&&receipt.source.path===block.newPath?{blob:block.newBlob,lines:block.newLines}:null;
  if(!side?.blob||reference['oid']!==side.blob||receipt.contentRef!==`git-blob:${side.blob}`)throw new ReviewLedgerError('provenance-mismatch','Changed evidence blob/path/revision mismatch.');
  // Text block claims are bounded by the exact changed span. Non-text metadata may have no line span.
  if(side.lines&&receipt.source.lines&&(receipt.source.lines[0]<side.lines[0]||receipt.source.lines[1]>side.lines[1]))throw new ReviewLedgerError('provenance-mismatch','Changed evidence range exceeds selected block.');
 }else{
  if(receipt.kind!=='context-source'||receipt.role!=='context-only'||reference['kind']!=='context'||reference['path']!==receipt.source.path
   ||receipt.source.revision!==s.build.sourceCommit||!receipt.contentRef.startsWith('git-blob:'))throw new ReviewLedgerError('provenance-mismatch','Context evidence must use the pinned context path.');
 }
}

/** Pure admission of already-verified inspection receipts; it never runs tools or trusts reviewer citations. */
export function evidenceFromReceipt(basis:LedgerBasis,raw:TrustedInspectionReceipt): EvidenceV1 {
 validateLedgerBasis(basis);const receipt=ledgerSnapshot(raw);validateAttempt(receipt.attempt,basis);
 for(const value of [receipt.receiptId,receipt.source.path,receipt.source.revision,receipt.contentRef])requireText(value,'inspection provenance');
 if(!/^[a-f0-9]{64}$/.test(receipt.source.digest)||!validRange(receipt.source.lines)
  ||!['complete','partial','unavailable'].includes(receipt.completeness)||!Array.isArray(receipt.limitations)||receipt.limitations.some(l=>typeof l!=='string')
  ||(receipt.completeness!=='complete'&&!receipt.limitations.some(l=>l.trim())))throw new ReviewLedgerError('provenance-mismatch','Invalid evidence digest, range or completeness.');
 if(['changed-block','context-source','artifact'].includes(receipt.kind)){
  if(receipt.testResult!==null||receipt.index!==null)throw new ReviewLedgerError('provenance-mismatch','Source receipt has foreign result metadata.');
  sourceProof(receipt,basis);
 }else if(receipt.kind==='test-result'){
  if(receipt.role!=='context-only'||receipt.source.revision!==basis.subject.build.sourceCommit||receipt.readReceipt!==null||receipt.index!==null
   ||!['pass','fail','skipped','unknown'].includes(receipt.testResult??''))throw new ReviewLedgerError('provenance-mismatch','Test result must bind the pinned source and an explicit actual result.');
 }else if(receipt.kind==='caller-impact'){
  if(receipt.role!=='context-only'||receipt.readReceipt!==null||receipt.testResult!==null||!receipt.index||receipt.index.sourceCommit!==basis.subject.build.sourceCommit
   ||!receipt.index.indexId||!['fresh','stale','unknown'].includes(receipt.index.freshness)||!['complete','partial','unknown'].includes(receipt.index.coverage))throw new ReviewLedgerError('provenance-mismatch','Impact result needs pinned source/index identity and coverage.');
  if(receipt.completeness==='complete'&&(receipt.index.freshness!=='fresh'||receipt.index.coverage!=='complete'))throw new ReviewLedgerError('provenance-mismatch','Stale/partial index cannot claim complete impact evidence.');
 }else throw new ReviewLedgerError('invalid-input','Unknown evidence kind.');
 const value={subjectDigest:basis.subject.subjectDigest,kind:receipt.kind,source:receipt.source,role:receipt.role,inspectedByAttempt:receipt.attempt.attemptId,
  completeness:receipt.completeness,limitations:receipt.limitations,contentRef:receipt.contentRef};
 // Bind the immutable native receipt too: result/freshness metadata cannot change under a reused identity.
 return ledgerSnapshot({...value,evidenceId:`evidence-${ledgerDigest({runId:basis.runId,...value,receiptId:receipt.receiptId,testResult:receipt.testResult,index:receipt.index})}`});
}
export function admitLedgerEvidence(basis:LedgerBasis,receipt:TrustedInspectionReceipt,attempt:LedgerAttempt):EvidenceV1 {
 validateAttempt(attempt,basis);
 if(!same(receipt.attempt,attempt))throw new ReviewLedgerError('provenance-mismatch','New evidence was not inspected by this authenticated attempt.');
 return evidenceFromReceipt(basis,receipt);
}
