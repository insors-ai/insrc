/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import { subjectFixture } from '../../workflow/code-review/investigation/__tests__/fixtures.js';
import { continuationFixture,finalReply,progressFor } from '../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { ArtifactStore } from '../../workflow/artifact-core/store.js';
import { History } from '../../workflow/artifact-core/history.js';
import { createFileSidecarStore } from '../../workflow/artifact-core/sidecar-store.js';
import { createFileJournal } from '../../workflow/artifact-core/journal.js';
import { creationContextProvider } from '../../workflow/artifact-core/codecs.js';
import { emptyLifecycle } from '../../workflow/artifact-core/decode.js';
import { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import { approvedScopeReference } from '../review-investigation-work.js';
import { InvestigationRepository } from '../review-investigation-repository.js';
import { dispatchInvestigation } from '../review-investigation-gateway.js';
import type { ReviewControllerBudgetDeclaration } from '../../shared/review-budget.js';
export const hash='c32aa60534232f36',root=`ISSUE-${hash}`,buildId=`BUILD-${hash}-s1`,scopeId='ISSUE-1234567890abcdef';
const actor={id:'github:fixture',kind:'person' as const,properties:{}};
export const caps={version:1,engines:['legacy','plan-investigation-v1'],investigationWireVersions:[1],canonicalInvestigationVersions:[1],operations:['start','status','resume','cancel','read','impact','progress','reply']};
const budget:ReviewControllerBudgetDeclaration={version:1,hostContextReserveTokens:1000,profile:{profileVersion:1,providerId:'fixture-host',transport:'controller',transportVersion:'1',schemaDialect:'controller-json-v1',promptDialect:'controller-frame-v1',qualification:'controller-reserved',declaredToolsJson:'[]',nativeReserveTokens:0,transportReserveTokens:4096,completionReserveTokens:8192,inspectionReserveTokens:8192}};
export async function fixture(controller:boolean,planned:boolean,indexed:boolean,complete=false){
 const f=await subjectFixture(),contexts=creationContextProvider(f.dir,{rootKinds:['ISSUE','PLAN','BUILD']});
 const store=new ArtifactStore({repoPath:f.dir,history:new History(createFileSidecarStore(f.dir)),journal:createFileJournal(f.dir),contexts:key=>({...contexts(key),extraMeta:{authoredBy:controller?'daemon':'controller'}})});
 const lifecycle=new LifecycleService({store});
 const create=async(id:string,body:Record<string,unknown>,approve=true)=>{await store.write({id,description:'',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body,citations:[]}},actor);if(approve)await lifecycle.apply(id,'approve',actor);};
 const issue={title:'Pinned fixture',reproduction:'Selected change',rootCause:'Fixture',fixIntent:'Check selected source'};
 await create(root,issue);await create(buildId,{commit:f.commitId,tasks:[{id:'t1',passed:true}]},false);
 if(planned)await create(`PLAN-${hash}-s1`,{tasks:[{id:'t1',title:'Keep',summary:'Keep pinned behavior',size:'S',order:1,dependsOn:[],acceptanceChecks:['Keep pinned source'],derivedFrom:[],tests:[]}],testStrategyCoverage:[]});
 const {ref:_,...proof}={...f.proof,rootArtifactId:root,buildArtifactId:buildId,blockIds:f.packet.blocks.map(b=>b.blockId)};
 await create(scopeId,{...issue,fixIntent:JSON.stringify({kind:'review-scope-v1',attestations:[proof]})});
 const start={version:1,engine:'plan-investigation-v1',operation:'start',repo:f.dir,repoId:'repo',requestId:'12345678-1234-1234-1234-123456789abc',rootArtifactId:root,storyId:'s1',buildArtifactId:buildId,selections:[{commitId:f.commitId,parentId:f.parentId,attestationRef:approvedScopeReference(scopeId,1,proof)}],sourceMode:indexed?'indexed-impact':'source-only'};
 let calls=0;
 const repository=new InvestigationRepository({repoId:'repo',repoPath:f.dir,canonical:store,processEpoch:'test-epoch',assertRegistered:async()=>{},assertProcessOwner:()=>{},assertReady:async()=>{},graph:{state:async()=>({revision:'fixture',completeness:'partial'}),closure:async()=>[f.dir],entities:async()=>[],callers:async()=>[]},daemonAdapter:async()=>({provider:continuationFixture().provider,modelLabel:'scripted-fixture',assertQualified:async()=>{},drain:async()=>{},execute:async(turn,tools,_signal,runtime)=>{
  calls++;assert.ok(runtime.navigation?.sourceRefs.length);assert.equal(runtime.navigation?.changedEntityRefs.length,0);
  const evidenceIds:string[]=[];for(const ref of runtime.navigation!.sourceRefs){const parsed=JSON.parse(ref);let read=await tools.read(ref);if(read.completeness==='partial'&&parsed.kind==='artifact'&&read.lines){read=await tools.read(JSON.stringify({...parsed,end:read.lines[1]}));}evidenceIds.push(read.evidenceId);}
  if(complete){for(const block of f.packet.blocks)await tools.progress({...progressFor(turn,block.blockId,runtime.state().sequence),disposition:'reviewed',evidenceIds,coverageUpdates:runtime.state().ledger.coverage.map(row=>({...row,disposition:'satisfied',evidenceIds,rationale:'Scripted fixture inspected pinned contract and selected source',assessedByAttempt:turn.attemptId}))});const state=runtime.state();return {...finalReply(turn,state.accepted.map(a=>a.receipt.progressId),state.sequence),next:{kind:'request-completion',remainingWork:[],reason:'Scripted protocol completion fixture'}};}
  await tools.progress(progressFor(turn,f.packet.blocks[0]!.blockId,runtime.state().sequence));const state=runtime.state();
  return {...finalReply(turn,state.accepted.map(a=>a.receipt.progressId),state.sequence),next:{kind:'pause',remainingWork:[runtime.state().ledger.coverage[0]!.requirementRef],reason:'Scripted adapter is not a quality certification'}};
 }})});
 const dispatch=(raw:unknown)=>dispatchInvestigation(raw,{repository:async()=>repository});
 const envelope=(command:unknown)=>({version:1,engine:'plan-investigation-v1',command,capabilities:caps,...(controller?{reviewBudget:budget}:{})});
 return {...f,repository,dispatch,envelope,start,calls:()=>calls};
}

