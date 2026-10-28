/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { adherenceObligations, ADHERENCE_LLD_SECTIONS, ADHERENCE_LLD_EXCLUDED } from '../../review-pipeline/adapters/code-review-obligations.js';
import { computeExpectedDimensions } from '../expected-dimensions.js';
import type { CodeReviewSubject } from '../types.js';
import type { LldArtifact } from '../../artifacts/lld.js';
import type { PlanArtifact } from '../../artifacts/plan.js';
import type { ReviewSubjectV1 } from './types.js';
import { identifySubject } from './identity.js';
import { coverageRowId, ledgerDigest, ledgerSnapshot, requireText } from './ledger-identity.js';
import { LEDGER_LIMITS, ReviewLedgerError } from './ledger-types.js';
import type { LedgerBasis, LedgerCriterion, LedgerRequirement, ReviewLedgerV1 } from './ledger-types.js';

type ContractPin = ReviewSubjectV1['contracts'][number];
/** Verified immutable artifact values supplied by the daemon's canonical artifact adapter, never reviewer input. */
export interface LedgerCatalogInput {
 readonly runId: string; readonly subject: ReviewSubjectV1; readonly repoPath: string; readonly epicHash: string;
 readonly policyVersion: string; readonly criteria: readonly LedgerCriterion[];
 readonly lld: { readonly pin: ContractPin; readonly artifact: LldArtifact } | null;
 readonly plan: { readonly pin: ContractPin; readonly artifact: PlanArtifact } | null;
 readonly upstream: readonly { readonly pin: ContractPin; readonly text: string }[];
}
function assertPin(pin: ContractPin, subject: ReviewSubjectV1): void {
 if (!subject.contracts.some(p=>ledgerDigest(p)===ledgerDigest(pin))) throw new ReviewLedgerError('provenance-mismatch','Contract is not pinned by this subject.');
}
function freezeBasis(value: Omit<LedgerBasis,'basisDigest'>): LedgerBasis {
 return ledgerSnapshot({...value,basisDigest:ledgerDigest(value)});
}
export function buildLedgerBasis(raw: LedgerCatalogInput): LedgerBasis {
 const input=ledgerSnapshot(raw),s=input.subject;
 const {subjectId,subjectDigest,...projection}=s;
 if(identifySubject(projection).subjectDigest!==subjectDigest || subjectId!==`subject-${subjectDigest}`) throw new ReviewLedgerError('subject-mismatch','Invalid subject identity.');
 for(const value of [input.runId,input.repoPath,input.epicHash,input.policyVersion])requireText(value,'catalog identity');
 if(s.ambiguities.length || !s.packets.length)throw new ReviewLedgerError('invalid-input','Cannot initialize an empty or ambiguous review scope.');
 for(const item of [input.lld,input.plan])if(item){
  assertPin(item.pin,s);
  if(item.artifact.meta.epicHash!==input.epicHash || item.artifact.meta.storyId!==s.storyId || item.artifact.meta.repoPath!==input.repoPath)throw new ReviewLedgerError('provenance-mismatch','Pinned artifact work identity mismatch.');
 }
 if((s.taskBasis==='approved-plan')!==(input.plan!==null))throw new ReviewLedgerError('provenance-mismatch','PLAN basis mismatch.');
 const coveredPins=new Set([input.lld?.pin.artifactId,input.plan?.pin.artifactId].filter((v):v is string=>!!v));
 for(const u of input.upstream){assertPin(u.pin,s);requireText(u.text,'upstream contract');if(coveredPins.has(u.pin.artifactId))throw new ReviewLedgerError('invalid-input','Duplicate catalog artifact.');coveredPins.add(u.pin.artifactId);}
 if(s.contracts.some(p=>!coveredPins.has(p.artifactId)))throw new ReviewLedgerError('unsupported-obligation','Every pinned contract needs an explicit catalog adapter/basis.');
 // Full existing interface, no partial cast or legacy resolver. Never dispatched to a legacy runner.
 const legacy:CodeReviewSubject={repoPath:input.repoPath,epicHash:input.epicHash,storyId:s.storyId,
  changedFiles:[...new Set(s.packets.flatMap(p=>p.blocks.flatMap(b=>[b.oldPath,b.newPath].filter((v):v is string=>v!==null))))],
  approvedLld:input.lld?.artifact??null,approvedPlan:input.plan?.artifact??null,buildRecord:null,testRecord:null};
 const requirements:LedgerRequirement[]=[],keys=new Set<string>();
 const add=(category:LedgerRequirement['category'],requirementRef:string,text:string,needs:LedgerRequirement['needs']='inspection',allowNotApplicable=false)=>{
  requireText(requirementRef,'requirement reference');requireText(text,'requirement text');const key=`${category}:${requirementRef}`;
  if(keys.has(key))throw new ReviewLedgerError('invalid-input','Duplicate requirement identity.');keys.add(key);
  if(requirements.length>=LEDGER_LIMITS.rows)throw new ReviewLedgerError('resource-limit','Too many required rows.');
  requirements.push({category,requirementRef,text,needs,allowNotApplicable});
 };
 for(const t of s.tasks){add('task',`task:${t.id}`,t.description);for(const a of t.acceptanceChecks)add('acceptance',`acceptance:${t.id}/${a.id}`,a.text);}
 for(const p of s.packets)for(const b of p.blocks)add('change',`change:${p.packetId}/${b.blockId}`,`${b.kind}: ${b.oldPath??'(absent)'} -> ${b.newPath??'(absent)'}`);
 if(input.lld){
  for(const key of Object.keys(input.lld.artifact.body))if(!ADHERENCE_LLD_SECTIONS.includes(key)&&!(key in ADHERENCE_LLD_EXCLUDED))throw new ReviewLedgerError('unsupported-obligation',`Unclassified LLD section: ${key}`);
 }
 for(const o of adherenceObligations(legacy).obligations){
  if(!o.key.startsWith('lld:'))continue; // sc1 already supplies full PLAN task/check rows.
  const pin=input.lld!.pin;
  add('design',`${pin.artifactId}@${pin.contentDigest}/${o.key}`,o.text);
 }
 for(const item of [input.lld,input.plan])if(item){
  const body=item.artifact.body;
  // Every non-adherence section remains classified. Behavioral sections need their own obligation.
  for(const key of ['testStrategy','functionalDefinition','companions','erDefinition','uxDefinition','sequenceDefinition','componentDependencyDefinition','adherence'] as const){
   if(key in body && body[key as keyof typeof body]!==undefined){
    const value=body[key as keyof typeof body];
    add('design',`${item.pin.artifactId}@${item.pin.contentDigest}/${key}`,`${key}: ${JSON.stringify(value)}`,key==='testStrategy'?'test-pass':'inspection',key!=='testStrategy');
   }
  }
 }
 for(const u of input.upstream)add('design',`${u.pin.artifactId}@${u.pin.contentDigest}/whole-contract`,u.text);
 const criteriaIds=new Set<string>();
 for(const c of input.criteria){requireText(c.id,'criterion id');requireText(c.text,'criterion text');if(criteriaIds.has(c.id)||typeof c.allowNotApplicable!=='boolean')throw new ReviewLedgerError('invalid-input','Invalid criterion catalog.');criteriaIds.add(c.id);add('criterion',`criterion:${c.id}`,c.text,'inspection',c.allowNotApplicable);}
 for(const id of computeExpectedDimensions(legacy))if(!criteriaIds.has(id))throw new ReviewLedgerError('unsupported-obligation',`Required review criterion missing: ${id}`);
 return freezeBasis({runId:input.runId,subject:s,policyVersion:input.policyVersion,criteria:input.criteria,requirements});
}
export function validateLedgerBasis(basis: LedgerBasis): void {
 const {basisDigest,...projection}=basis;
 if(ledgerDigest(projection)!==basisDigest)throw new ReviewLedgerError('provenance-mismatch','Ledger basis digest mismatch.');
 const ids=basis.requirements.map(r=>coverageRowId(basis.subject.subjectDigest,r));
 if(ids.length>LEDGER_LIMITS.rows||new Set(ids).size!==ids.length)throw new ReviewLedgerError('invalid-input','Invalid required row universe.');
}
/** Trusted impact discovery can append obligations, never packets or replace the original catalog. */
export function appendImpactRequirements(basis: LedgerBasis, impacts: readonly LedgerRequirement[]): LedgerBasis {
 validateLedgerBasis(basis);const copy=ledgerSnapshot(impacts),all=[...basis.requirements];
 for(const r of copy){
  if(r.category!=='impact'||!r.requirementRef.startsWith('impact:')||r.needs!=='inspection')throw new ReviewLedgerError('invalid-input','Expected trusted impact obligations.');
  requireText(r.text,'impact requirement');const old=all.find(x=>x.category===r.category&&x.requirementRef===r.requirementRef);
  if(old&&ledgerDigest(old)!==ledgerDigest(r))throw new ReviewLedgerError('conflicting-replay','Impact obligation changed.');if(!old)all.push(r);
 }
 if(all.length>LEDGER_LIMITS.rows)throw new ReviewLedgerError('resource-limit','Too many required rows.');
 const {basisDigest:_,...projection}=basis;return freezeBasis({...projection,requirements:all});
}
export function initializeReviewLedger(basis: LedgerBasis): ReviewLedgerV1 {
 validateLedgerBasis(basis);
 return ledgerSnapshot({runId:basis.runId,subjectDigest:basis.subject.subjectDigest,evidence:[],findings:[],coverage:basis.requirements.map(r=>({rowId:coverageRowId(basis.subject.subjectDigest,r),subjectDigest:basis.subject.subjectDigest,requirementRef:r.requirementRef,category:r.category,disposition:'pending' as const,evidenceIds:[],findingIds:[],rationale:'',assessedByAttempt:null}))});
}
