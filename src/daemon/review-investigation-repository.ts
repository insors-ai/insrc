/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import type { ArtifactStore } from '../workflow/artifact-core/store.js';
import { ArtifactIds } from '../workflow/artifact-ids.js';
import type { LLMProvider,StructuredSchema } from '../shared/types.js';
import type { ReviewControllerBudgetDeclaration } from '../shared/review-budget.js';
import { authorPartyOf,otherParty } from '../workflow/review/party.js';
import { isLldBody } from '../workflow/artifacts/lld.js';
import { isPlanBody } from '../workflow/artifacts/plan.js';
import type { LldArtifact } from '../workflow/artifacts/lld.js';
import type { PlanArtifact } from '../workflow/artifacts/plan.js';
import { computeExpectedDimensions } from '../workflow/code-review/expected-dimensions.js';
import { prepareReviewSubject } from '../workflow/code-review/investigation/subject.js';
import type { SubjectPreparationDeps } from '../workflow/code-review/investigation/subject.js';
import { buildLedgerBasis,appendImpactRequirements } from '../workflow/code-review/investigation/ledger-catalog.js';
import { initializeReviewLedger } from '../workflow/code-review/investigation/ledger.js';
import { sourceReference,readReviewSource } from '../workflow/code-review/investigation/source.js';
import { createInvestigationPolicy,buildInvestigationSeed,investigationRequestDigest } from '../workflow/code-review/investigation/continuation-policy.js';
import type { InvestigationTools,InvestigationTurnV1,InvestigationReplyV1,InvestigationContext } from '../workflow/code-review/investigation/continuation-types.js';
import { digestValue,freezeValue } from '../workflow/code-review/investigation/identity.js';
import { SubjectPreparationError } from '../workflow/code-review/investigation/types.js';
import type { PrepareReviewRequest,ReviewSubjectV1 } from '../workflow/code-review/investigation/types.js';
import { RecoveryJournal } from '../workflow/code-review/investigation/recovery-journal.js';
import { RecoveryError } from '../workflow/code-review/investigation/recovery-types.js';
import type { RecoveryManifest } from '../workflow/code-review/investigation/recovery-types.js';
import type { RecoveryUsageWriter } from '../workflow/code-review/investigation/recovery-usage.js';
import type { RecoveryStore } from '../workflow/code-review/investigation/recovery-store.js';
import type { CompletionValidationContext } from '../workflow/code-review/investigation/completion-types.js';
import { readReviewCompletion } from '../workflow/code-review/investigation/completion-receipt.js';
import { InvestigationReplySchema,ReviewIntegrationError } from '../shared/review-investigation.js';
import { scopedReviewCatalogDigest } from '../shared/review-investigation-catalog.js';
import type { NativeInvestigationRuntime } from '../agent/providers/investigation-session.js';
import { CanonicalReviewWorkAdapter } from './review-investigation-work.js';
import { ProductionEvidenceAdapter } from './review-investigation-evidence.js';
import { productionImpactAdapter,daemonReviewImpactGraph } from './review-investigation-impact.js';
import type { ReviewImpactGraph } from './review-investigation-impact.js';
import { ProductionReviewService } from './review-investigation-service.js';
import type { ProductionReviewServiceOptions } from './review-investigation-service.js';
import { productionRunId } from './review-investigation-descriptor.js';
import type { InvestigationStart,ProductionReviewDescriptor } from './review-investigation-descriptor.js';
import { InvestigationControllerHost } from './review-investigation-controller.js';
import type { InvestigationEnvelope } from '../shared/review-investigation-wire.js';

export interface InvestigationDaemonAdapter {
 readonly provider:LLMProvider;readonly modelLabel:string;
 readonly assertQualified:()=>Promise<void>;
 readonly execute:(turn:InvestigationTurnV1,tools:InvestigationTools,signal:AbortSignal,runtime:NativeInvestigationRuntime)=>Promise<InvestigationReplyV1>;
 readonly drain:(runId:string)=>Promise<void>;
}
export interface InvestigationRepositoryOptions {
 readonly repoId:string;readonly repoPath:string;readonly canonical:ArtifactStore;readonly processEpoch:string;
 readonly assertRegistered:()=>Promise<void>;readonly assertProcessOwner:()=>void;
 readonly assertReady:(operation:'start'|'resume'|'publish')=>Promise<void>;
 readonly daemonAdapter:(subject:ReviewSubjectV1,mode:InvestigationStart['sourceMode'])=>Promise<InvestigationDaemonAdapter>;
 readonly graph?:ReviewImpactGraph|undefined;readonly usageWriter?:RecoveryUsageWriter|undefined;
 readonly onProgress?:((runId:string,sequence:number,blockId:string|null)=>void)|undefined;
}
interface Prepared {readonly manifest:RecoveryManifest;readonly sources:SubjectPreparationDeps;readonly modelLabel:string;readonly authorParty:'controller'|'daemon';readonly reviewerParty:'controller'|'daemon';readonly daemon:InvestigationDaemonAdapter|null;readonly controller:InvestigationControllerHost|null;}
const criterionText:Record<string,string>={adherence:'Check each approved task, acceptance check and design obligation against inspected selected changes.',conventions:'Check relevant project conventions and architectural contracts.',coverage:'Check meaningful passing tests and gaps for the selected behavior; do not equate builder reports with executed tests.',quality:'Check correctness, error paths, race conditions, security and maintainability of the selected changes.',
 'functional-coverage':'Check all declared functional obligations against inspected implementation and tests.',diagram:'Check relevant diagram source, linked content and consistency; distinguish source inspection from unavailable rendering.',ux:'Check relevant layout, states and interactions against the approved UX; disclose unavailable visual evidence.'};
/** One repository composition over the existing canonical store and S1-S5. No
 * second acceptance ledger, generic HEAD diff, or client-authored provenance. */
export class InvestigationRepository {
 readonly work:CanonicalReviewWorkAdapter;readonly service:ProductionReviewService;
 private readonly prepared=new Map<string,Prepared>();private readonly hosts=new Map<string,InvestigationControllerHost>();
 private readonly owners=new Map<string,{generation:number;attemptId:string}>();private readonly runs=new Map<string,Promise<unknown>>();
 constructor(readonly options:InvestigationRepositoryOptions){
  this.work=new CanonicalReviewWorkAdapter(options);
  this.service=new ProductionReviewService({...options,prepare:async(_start,id)=>{const p=this.required(id);return {manifest:p.manifest,authorParty:p.authorParty,reviewerParty:p.reviewerParty};},
   recoveryOptions:id=>{const m=this.prepared.get(id)?.manifest??this.manifest(id);return {processEpoch:options.processEpoch,currentCompatibility:m.compatibility,assertProcessOwner:options.assertProcessOwner,
    assertOwner:(generation,attemptId)=>{options.assertProcessOwner();const owner=this.owners.get(id);if(!owner||owner.generation!==generation||owner.attemptId!==attemptId)throw new RecoveryError('ownership-lost','Execution authority is no longer active');},
    readEvidence:async(subjectId,reference)=>{if(subjectId!==m.basis.subject.subjectId)throw new ReviewIntegrationError('identity-conflict','Foreign evidence subject');const d=this.descriptor(id);return readReviewSource(m.basis.subject,reference,{},this.sources(d.start));},
    ...(options.usageWriter?{usageWriter:options.usageWriter}:{})};},
   assertFresh:(d,m)=>this.assertFresh(d,m),assertQualified:async d=>{await options.assertReady('resume');const p=this.required(d.runId);if(p.manifest.policyDigest!==d.policyDigest||p.reviewerParty!==d.reviewerParty)throw new RecoveryError('stale','Runtime policy or reviewer changed');await p.daemon?.assertQualified();},
   admitProvider:signal=>this.admitProvider(signal),execution:(d,s,l,signal)=>this.execution(d,s,l,signal)});
 }
 private required(id:string):Prepared{const p=this.prepared.get(id);if(!p)throw new ReviewIntegrationError('not-ready','A fresh compatible execution adapter is required');return p;}
 private descriptor(id:string){const d=this.service.descriptors.read(id);if(!d)throw new ReviewIntegrationError('identity-conflict','Unknown investigation run');return d;}
 private manifest(id:string):RecoveryManifest{const d=this.descriptor(id);return new RecoveryJournal(this.options.repoPath,id,{assertProcessOwner:this.options.assertProcessOwner}).read(d.manifestRef) as RecoveryManifest;}
 private request(start:InvestigationStart):PrepareReviewRequest{return {repoId:start.repoId,rootArtifactId:start.rootArtifactId,storyId:start.storyId,buildArtifactId:start.buildArtifactId,selections:start.selections};}
 private sources(start:InvestigationStart):SubjectPreparationDeps{return {repoPath:this.options.repoPath,readWork:this.work.readWork,readAttestation:ref=>this.work.readAttestation(ref,this.request(start)),assertFresh:work=>this.work.assertFresh(work)};}
 private async assertFresh(d:ProductionReviewDescriptor,m:RecoveryManifest){
  const current=await prepareReviewSubject(this.request(d.start),this.sources(d.start));
  if(current.subjectDigest!==m.subjectDigest)throw new SubjectPreparationError('stale-contract','Approved work, scope proof or selected source changed');
  const head=await this.work.readCanonicalHead(d.start.buildArtifactId);if(!head||authorPartyOf(head.head.meta)!==d.authorParty)throw new SubjectPreparationError('stale-contract','Canonical BUILD author changed');
 }
 private async prepare(start:InvestigationStart,declaration:ReviewControllerBudgetDeclaration|undefined){
  await this.options.assertRegistered();const id=productionRunId(start.repoId,start.requestId),sources=this.sources(start),subject=await prepareReviewSubject(this.request(start),sources);
  const build=await this.work.readCanonicalHead(start.buildArtifactId),authorParty=authorPartyOf(build?.head.meta);if(authorParty==='unknown')throw new ReviewIntegrationError('identity-conflict','Independent review requires a known canonical BUILD author');
  const reviewerParty=otherParty(authorParty);let controller:InvestigationControllerHost|null=null,daemon:InvestigationDaemonAdapter|null=null;
  if(reviewerParty==='controller'){
   controller=this.hosts.get(id)??new InvestigationControllerHost(this.options.repoPath,declaration!,start.sourceMode==='indexed-impact',this.options.processEpoch,this.options.assertProcessOwner);
   controller.refresh(declaration);this.hosts.set(id,controller);
  }else{daemon=await this.options.daemonAdapter(subject,start.sourceMode);await daemon.assertQualified();}
  const provider=controller?.provider??daemon!.provider,policy=createInvestigationPolicy(provider),root=ArtifactIds.parse(start.rootArtifactId)!;
  const contractWork=await this.work.readWork(this.request(start));
  let lld:{pin:ReviewSubjectV1['contracts'][number];artifact:LldArtifact}|null=null,plan:{pin:ReviewSubjectV1['contracts'][number];artifact:PlanArtifact}|null=null;
  const upstream:{pin:ReviewSubjectV1['contracts'][number];text:string}[]=[];
  for(const pin of subject.contracts){const key=ArtifactIds.parse(pin.artifactId),head=await this.work.readCanonicalHead(pin.artifactId);if(!head||head.revision!==pin.revision)throw new SubjectPreparationError('stale-contract','Pinned contract changed');
   if(key?.kind==='LLD'){if(!isLldBody(head.head.body))throw new ReviewIntegrationError('invalid-command','Malformed canonical LLD');lld={pin,artifact:head.head as unknown as LldArtifact};}
   else if(key?.kind==='PLAN'){if(!isPlanBody(head.head.body))throw new ReviewIntegrationError('invalid-command','Malformed canonical PLAN');plan={pin,artifact:head.head as unknown as PlanArtifact};}
   else upstream.push({pin,text:contractWork.contractText[pin.artifactId]!});
  }
  const legacy={repoPath:this.options.repoPath,epicHash:root.epicHash,storyId:start.storyId,changedFiles:[...new Set(subject.packets.flatMap(p=>p.blocks.flatMap(b=>[b.oldPath,b.newPath].filter((v):v is string=>v!==null))))],approvedLld:lld?.artifact??null,approvedPlan:plan?.artifact??null,buildRecord:null,testRecord:null};
  let basis=buildLedgerBasis({runId:id,subject,repoPath:this.options.repoPath,epicHash:root.epicHash,policyVersion:'plan-investigation-policy-v1',lld,plan,upstream,
   criteria:computeExpectedDimensions(legacy).map(key=>({id:key,text:criterionText[key]!,allowNotApplicable:false}))});
  if(start.sourceMode==='indexed-impact')basis=appendImpactRequirements(basis,subject.packets.flatMap(packet=>packet.blocks.map(block=>({category:'impact' as const,requirementRef:`impact:selected-block:${packet.packetId}/${block.blockId}`,text:`Assess caller applicability for selected block ${block.blockId}. Missing entity mappings, deletions and empty/partial discovery remain required work; do not infer no impact.`,needs:'inspection' as const,allowNotApplicable:false}))));
  const manifest:RecoveryManifest={version:1,runId:id,subjectDigest:subject.subjectDigest,policyDigest:policy.digest,basis,policy,receipts:[],
   initial:{ledger:initializeReviewLedger(basis),sequence:0,checkpoint:'initial',accepted:[],consumedActiveMs:0,attempts:0,uncertainProgressId:null,usage:[]},
   compatibility:{engine:1,evidence:1,toolsDigest:scopedReviewCatalogDigest(start.sourceMode==='indexed-impact'),providerDigest:digestValue({profile:policy.budget.profile,role:'review',tier:'core',reviewerParty})}};
  const prepared:Prepared={manifest,sources,authorParty,reviewerParty,controller,daemon,modelLabel:controller?'client':daemon!.modelLabel};this.prepared.set(id,prepared);return prepared;
 }
 private admissionTail:Promise<void>=Promise.resolve();
 private async serializeAdmission<T>(work:()=>Promise<T>):Promise<T>{const prior=this.admissionTail;let release!:()=>void;this.admissionTail=new Promise<void>(resolve=>{release=resolve;});await prior;try{return await work();}finally{release();}}
 private providerTail:Promise<void>=Promise.resolve();
 private async admitProvider(signal:AbortSignal):Promise<()=>void>{let release!:()=>void;const prior=this.providerTail;this.providerTail=new Promise<void>(resolve=>{release=resolve;});await prior;if(signal.aborted){release();signal.throwIfAborted();}return release;}
 private async execution(d:ProductionReviewDescriptor,store:RecoveryStore,lease:NonNullable<ReturnType<RecoveryStore['status']>['owner']>,signal:AbortSignal):Promise<Awaited<ReturnType<ProductionReviewServiceOptions['execution']>>>{
  const p=this.required(d.runId),view=store.replay(),attemptId=randomUUID(),subject=view.basis.subject;
  const owner:{generation:number;attemptId:string}={generation:lease.generation,attemptId};
  const assertCurrent=()=>{signal.throwIfAborted();this.options.assertProcessOwner();store.assertLease(store.replay(),lease.leaseId,lease.generation);};
  const evidence=new ProductionEvidenceAdapter({basis:view.basis,sources:p.sources,canonical:this.options.canonical,assertCurrent:async()=>assertCurrent()});
  const impact=await productionImpactAdapter({basis:view.basis,sources:p.sources,graph:this.options.graph??daemonReviewImpactGraph(this.options.repoPath),mode:d.start.sourceMode,attemptId,currentAttemptId:()=>owner.attemptId,signal,assertCurrent:async()=>assertCurrent()});
  const sourceRefs=subject.contracts.map(pin=>sourceReference({kind:'artifact',artifactId:pin.artifactId,start:1,end:200}));
  for(const packet of subject.packets)for(const block of packet.blocks)for(const side of [{blob:block.oldBlob,lines:block.oldLines},{blob:block.newBlob,lines:block.newLines}])if(side.blob)sourceRefs.push(sourceReference({kind:'blob',oid:side.blob,start:side.lines?.[0]??1,end:Math.min(side.lines?.[1]??1,(side.lines?.[0]??1)+499)}));
  const key=ArtifactIds.parse(subject.build.artifactId)!,tests=await this.work.readCanonicalHead(`TESTS-${key.epicHash}-${subject.storyId}`),tasks=tests?.head.body['tasks'];
  const testRefs=Array.isArray(tasks)?tasks.flatMap(t=>typeof t?.taskId==='string'?[JSON.stringify({kind:'test-result',taskId:t.taskId})]:[]):[];
  const runtime:NativeInvestigationRuntime={processEpoch:this.options.processEpoch,assertProcessOwner:this.options.assertProcessOwner,assertCurrent,state:()=>store.replay().state,
   navigation:freezeValue({sourceRefs,testRefs,changedEntityRefs:impact.entityReferences,changedEntities:impact.entitySummaries,index:impact.impact.index})};
  const provider=p.controller?.provider??p.daemon!.provider,seed=buildInvestigationSeed(view.basis,view.state);
  const draft={runId:d.runId,subjectDigest:d.subjectDigest,generation:lease.generation,attemptId,requestDigest:'',policyDigest:d.policyDigest,
   assignment:[...subject.packets.flatMap(packet=>packet.blocks.map(b=>b.blockId)),...view.state.ledger.coverage.filter(row=>['pending','unverified'].includes(row.disposition)).map(row=>row.requirementRef)],navigationRefs:[],unresolvedRefs:view.outstandingWork,priorAcceptedCheckpoint:view.state.checkpoint,
   limits:{attemptMs:Math.min(300000,view.accounting.activeLimitMs-view.state.consumedActiveMs),activeMsRemaining:view.accounting.activeLimitMs-view.state.consumedActiveMs,continuationsRemaining:view.accounting.attemptLimit-view.state.attempts,inclusiveTokenLimit:128000}};
  const turn={...draft,requestDigest:investigationRequestDigest(draft,seed)};
  this.owners.set(d.runId,owner);
  const context:InvestigationContext={basis:view.basis,state:view.state,policy:view.manifest.policy,generation:lease.generation,authorParty:d.authorParty,reviewerParty:d.reviewerParty,role:'review',tier:'core',providerId:view.manifest.policy.budget.profile.providerId,
   backend:{provider,qualification:{providerId:view.manifest.policy.budget.profile.providerId,profileDigest:digestValue(view.manifest.policy.budget.profile),pinnedReads:true,readOnly:true,progressMode:'in-session-progress',cancellable:true},execute:async(t,tools,sig)=>{owner.attemptId=t.attemptId;return p.controller?p.controller.execute(t,tools,sig,runtime):p.daemon!.execute(t,tools,sig,runtime);}},
   ports:store.ports(lease.generation,attemptId,lease.leaseId),validation:{attempt:{runId:d.runId,subjectDigest:d.subjectDigest,attemptId},receipts:view.receipts},schema:JSON.parse(JSON.stringify(InvestigationReplySchema)) as StructuredSchema,seed,now:()=>performance.now(),assertFresh:()=>this.assertFresh(d,view.manifest),assertOwner:generation=>{if(generation!==lease.generation)throw new RecoveryError('ownership-lost','Foreign generation');assertCurrent();},inspect:evidence.inspect,impact:impact.impact,changedEntity:impact.changedEntity,impactReceipts:impact.impactReceipts,observeUsage:()=>null,signal,
   onState:state=>{try{this.options.onProgress?.(d.runId,state.sequence,state.accepted.at(-1)?.progress.blockId??null);}catch{/* Delivery is not acceptance authority. */}}};
  return {turn,context,drain:async()=>{try{if(p.controller)await p.controller.drain(d.runId);else await p.daemon!.drain(d.runId);}finally{if(this.owners.get(d.runId)===owner)this.owners.delete(d.runId);}}};
 }
 async start(start:InvestigationStart,declaration?:ReviewControllerBudgetDeclaration){return this.serializeAdmission(async()=>{await this.options.assertReady('start');const existing=this.service.descriptors.read(productionRunId(start.repoId,start.requestId));if(existing&&existing.requestDigest!==digestValue(start))throw new ReviewIntegrationError('identity-conflict','Request UUID reused with different inputs');await this.prepare(start,declaration);return this.service.start(start);});}
 async advance(runId:string,declaration?:ReviewControllerBudgetDeclaration,receivedCommand?:unknown):Promise<Record<string,unknown>>{return this.serializeAdmission(()=>this.advanceAdmitted(runId,declaration,receivedCommand));}
 private async advanceAdmitted(runId:string,declaration?:ReviewControllerBudgetDeclaration,receivedCommand?:unknown):Promise<Record<string,unknown>>{
  const d=this.descriptor(runId),opened=await this.service.open(runId);if(opened.store.replay().publication)return this.complete(runId);
  const prior=this.runs.get(runId);if(prior){const host=this.hosts.get(runId);if(host){host.refresh(declaration,receivedCommand);return host.waitForTurn(runId,prior);}return this.view(runId);}
  await this.options.assertReady('resume');const p=await this.prepare(d.start,declaration);p.controller?.refresh(declaration,receivedCommand);p.controller?.arm(runId);
  const work=this.service.resume(runId).then(async reply=>{if(reply.next.kind==='request-completion')return this.complete(runId);return this.view(runId);});this.runs.set(runId,work);
  void work.then(()=>{if(this.runs.get(runId)===work)this.runs.delete(runId);},()=>{if(this.runs.get(runId)===work)this.runs.delete(runId);});
  return p.controller?p.controller.waitForTurn(runId,work):await work;
 }
 async bound(envelope:InvestigationEnvelope){const command=envelope.command;if(!('bindingId' in command))throw new ReviewIntegrationError('invalid-command','Expected scoped operation');const host=this.hosts.get(command.runId);if(!host)throw new ReviewIntegrationError('identity-conflict','No active controller attempt');return host.command(envelope);}
 async cancel(runId:string){await this.service.cancel(runId);return this.view(runId);}
 async view(runId:string):Promise<Record<string,unknown>>{const {descriptor,store}=await this.service.open(runId),view=store.replay();return {version:1,engine:'plan-investigation-v1',next:view.lifecycle.completionReceipt?'done':'status',runId,subjectDigest:descriptor.subjectDigest,sourceMode:descriptor.start.sourceMode,recovery:store.status(),progress:{sequence:view.state.sequence,coverage:view.state.ledger.coverage}};}
 private async completionContext(d:ProductionReviewDescriptor,m:RecoveryManifest):Promise<{context:CompletionValidationContext;buildRecord:{meta:{revision:number};body:{commit:string}}}>{
  const build=await this.work.readCanonicalHead(d.start.buildArtifactId);if(!build||build.revision!==m.basis.subject.build.revision)throw new SubjectPreparationError('stale-contract','Canonical BUILD changed');
  return {context:{subjectDigest:m.subjectDigest,policyDigest:m.policyDigest,compatibility:m.compatibility,build:{...m.basis.subject.build,meta:build.head.meta},reviewerParty:d.reviewerParty,expectationConflicts:[],assertFresh:()=>this.assertFresh(d,m)},buildRecord:build.head as unknown as {meta:{revision:number};body:{commit:string}}};
 }
 async complete(runId:string):Promise<Record<string,unknown>>{
  const {descriptor:d,store}=await this.service.open(runId),view=store.replay(),m=view.manifest;
  if(!view.publication)await this.options.assertReady('publish');
  const deps={canonical:this.options.canonical,actor:{id:'insrc:review-investigation',kind:'agent' as const,properties:{}},current:()=>this.completionContext(d,m)};
  const current=await deps.current(),root=ArtifactIds.parse(d.start.rootArtifactId)!;
  const existing=await this.options.canonical.readHeadSnapshot(`CR-${root.epicHash}-${d.start.storyId}`);
  const receipt=view.lifecycle.completionReceipt?await readReviewCompletion(store,deps):await this.service.complete(runId,view.publication?null:{...current,repoPath:this.options.repoPath,epicHash:root.epicHash,storyId:d.start.storyId,createdAt:new Date().toISOString(),model:this.prepared.get(runId)?.modelLabel??(d.reviewerParty==='controller'?'client':m.policy.budget.profile.providerId),sourceMode:d.start.sourceMode,expectedRevision:existing?.revision??null,expectedHeadDigest:existing?.digest??null},deps);
  return {...await this.view(runId),receipt};
 }
}
