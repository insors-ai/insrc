/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { LldArtifact } from '../../../artifacts/lld.js';
import type { PlanArtifact } from '../../../artifacts/plan.js';
import { identifySubject } from '../identity.js';
import { buildLedgerBasis } from '../ledger-catalog.js';
import { sourceReference } from '../source.js';
import type { LedgerBasis, TrustedInspectionReceipt } from '../ledger-types.js';
import type { LedgerCatalogInput } from '../ledger-catalog.js';
const meta={workflow:'design.story' as const,runId:'lld-run',repoPath:'/repo',createdAt:'2026-10-28T00:00:00Z',elapsedMs:0,repoIndexedAt:null,schemaVersion:1,epicHash:'c32aa60534232f36',epicSlug:'test',storyId:'s1',revision:1};
export function catalogFixture(): LedgerCatalogInput {
 const lld:LldArtifact={meta:{...meta,hldBaseRunId:'hld',hldEffectiveHash:'hld-hash',hldAmendmentsApplied:[]},citations:[],body:{
  hldContextSlice:{frameworkSummary:'test',ownedContracts:[],consumedContracts:[],boundary:{storyId:'s1',owns:[],depends:[],internal:'test'},adjacentBoundaries:[],rolloutPhase:'test',nonFunctional:{}},
  contractDetails:{surfaceLevel:'internal',api:[]},dataModelChanges:[{entity:'Test',change:'new',details:'Keep the data',callSites:[]}],interactionWithShared:[],
  errorPaths:{errorCases:[],edgeCases:[],invariantsToPreserve:[]},testStrategy:{testFramework:'node:test',testLevels:[{level:'unit',purpose:'test',subjects:['keeps data']}],acceptanceMapping:[]},alternativesConsidered:[],chosenAlternative:'a1',openQuestions:[]}};
 const plan:PlanArtifact={meta:{...meta,workflow:'plan',lldRunId:'lld-run',lldEffectiveHash:'lld-hash'},citations:[],body:{tasks:[{id:'t1',title:'Keep',summary:'Keep data',size:'S',order:1,dependsOn:[],acceptanceChecks:['kept'],derivedFrom:['c1'],tests:[{level:'unit',name:'keeps data'}]}],testStrategyCoverage:[]}};
 const lldPin={artifactId:'LLD-root-s1',path:'docs/LLD.md',revision:1,contentDigest:'a'.repeat(64)},planPin={artifactId:'PLAN-root-s1',path:'docs/PLAN.md',revision:1,contentDigest:'b'.repeat(64)};
 const subject=identifySubject({version:1,repoId:'repo',rootArtifactId:'DEF-c32aa60534232f36',storyId:'s1',build:{artifactId:'BUILD-root-s1',revision:1,sourceCommit:'c'.repeat(40)},contracts:[lldPin,planPin],taskBasis:'approved-plan',tasks:[{id:'t1',description:'Keep data',acceptanceChecks:[{id:'t1/ac1',text:'kept'}]}],packets:[{packetId:'packet-1',commitId:'c'.repeat(40),parentId:'d'.repeat(40),attribution:{basis:'verified',evidenceRefs:['scope']},blocks:[{blockId:'block-1',oldPath:'a.ts',newPath:null,oldBlob:'e'.repeat(40),newBlob:null,oldLines:[1,2],newLines:null,kind:'delete',attributionRefs:['scope']}]}],contextTree:'f'.repeat(40),ambiguities:[]});
 return {runId:'run-1',subject,repoPath:'/repo',epicHash:meta.epicHash,policyVersion:'review-policy-v1',criteria:['adherence','conventions','coverage','quality'].map(id=>({id,text:`Judge ${id}`,allowNotApplicable:id==='adherence'})),lld:{pin:lldPin,artifact:lld},plan:{pin:planPin,artifact:plan},upstream:[]};
}
export const basisFixture=()=>buildLedgerBasis(catalogFixture());

export function inspectionFixture(basis:LedgerBasis=basisFixture()):TrustedInspectionReceipt {
 const digest='a'.repeat(64),contentRef=`git-blob:${'e'.repeat(40)}`,lines:[number,number]=[1,1];
 return {receiptId:'read-1',attempt:{runId:basis.runId,subjectDigest:basis.subject.subjectDigest,attemptId:'attempt-1'},kind:'changed-block',
  source:{path:'a.ts',revision:'d'.repeat(40),digest,lines},role:'changed-scope',completeness:'complete',limitations:[],contentRef,
  readReceipt:{reference:sourceReference({kind:'blob',oid:'e'.repeat(40),start:1,end:1}),sourceDigest:digest,contentRef,text:'old\n',lines,completeness:'complete',limitations:[]},
  blockId:'block-1',artifactId:null,testResult:null,index:null};
}
