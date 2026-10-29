/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { realpathSync } from 'node:fs';
import { RecoveryStore } from '../workflow/code-review/investigation/recovery-store.js';
import type { RecoveryStoreOptions } from '../workflow/code-review/investigation/recovery-store.js';
import type { RecoveryManifest,ReviewRecoveryV1 } from '../workflow/code-review/investigation/recovery-types.js';
import { validateRecoveryManifest } from '../workflow/code-review/investigation/recovery-replay.js';
import { runRecoveredContinuation } from '../workflow/code-review/investigation/recovery-session.js';
import type { InvestigationContext,InvestigationTurnV1 } from '../workflow/code-review/investigation/continuation-types.js';
import { completeInvestigationReview,readReviewCompletion } from '../workflow/code-review/investigation/completion-receipt.js';
import { prepareCompletionPublication } from '../workflow/code-review/investigation/completion-publication.js';
import type { PrepareCompletionInput } from '../workflow/code-review/investigation/completion-publication.js';
import type { CompletionPublisherDeps } from '../workflow/code-review/investigation/completion-publisher.js';
import { digestValue,snapshotValue } from '../workflow/code-review/investigation/identity.js';
import { ReviewIntegrationError,parseReviewInvestigationCommand } from '../shared/review-investigation.js';
import { ProductionDescriptorStore,productionRunId } from './review-investigation-descriptor.js';
import type { InvestigationStart,ProductionReviewDescriptor } from './review-investigation-descriptor.js';
import { lifecycleFor } from './lifecycle-registry.js';
import type { ArtifactStore } from '../workflow/artifact-core/store.js';

type Lease=NonNullable<ReviewRecoveryV1['owner']>;
export interface ProductionReviewServiceOptions {
 readonly repoId:string;readonly repoPath:string;readonly processEpoch:string;readonly canonical:ArtifactStore;
 readonly assertRegistered:()=>Promise<void>;readonly assertProcessOwner:()=>void;
 /** Trusted composition from canonical work + S1/S2, never a client-provided manifest. */
 readonly prepare:(start:InvestigationStart,runId:string)=>Promise<{manifest:RecoveryManifest;authorParty:'controller'|'daemon';reviewerParty:'controller'|'daemon'}>;
 readonly recoveryOptions:(runId:string)=>RecoveryStoreOptions;
 readonly assertFresh:(descriptor:ProductionReviewDescriptor,manifest:RecoveryManifest)=>Promise<void>;
 /** Effective adapter qualification, replaced by the native binding verifier in t6. No default allow. */
 readonly assertQualified:(descriptor:ProductionReviewDescriptor)=>Promise<void>;
 /** Serial daemon provider admission. Waiting does not hold a recovery lease. */
 readonly admitProvider:(signal:AbortSignal)=>Promise<()=>void>;
 readonly execution:(descriptor:ProductionReviewDescriptor,store:RecoveryStore,lease:Lease,signal:AbortSignal)=>Promise<{turn:InvestigationTurnV1;context:InvestigationContext}>;
}
export class ProductionReviewService {
 readonly descriptors:ProductionDescriptorStore;
 private admission:Promise<void>=Promise.resolve();
 private readonly running=new Map<string,{abort:AbortController;done:Promise<unknown>}>();
 constructor(readonly options:ProductionReviewServiceOptions){this.descriptors=new ProductionDescriptorStore(options.repoPath,options.assertProcessOwner);}
 private exclusive<T>(work:()=>Promise<T>):Promise<T>{const p=this.admission.then(work);this.admission=p.then(()=>{},()=>{});return p;}
 private store(runId:string){const opts=this.options.recoveryOptions(runId);if(opts.processEpoch!==this.options.processEpoch)throw Error('Recovery process epoch mismatch');return new RecoveryStore(this.descriptors.repoPath,runId,opts);}
 private async guard(){this.options.assertProcessOwner();await this.options.assertRegistered();}
 async start(raw:InvestigationStart){return this.exclusive(async()=>{
  await this.guard();const parsed=parseReviewInvestigationCommand(raw);if(parsed.operation!=='start')throw Error('Expected start command');
  const start=snapshotValue({...parsed,repo:realpathSync(parsed.repo)});
  if(start.repo!==this.descriptors.repoPath||start.repoId!==this.options.repoId)throw new ReviewIntegrationError('identity-conflict','Unregistered or foreign start identity');
  const runId=productionRunId(start.repoId,start.requestId),requestDigest=digestValue(start),store=this.store(runId);
  let descriptor=this.descriptors.read(runId);
  if(descriptor){if(descriptor.requestDigest!==requestDigest)throw new ReviewIntegrationError('identity-conflict','Request UUID reused with different inputs');}
  else{
   const prepared=await this.options.prepare(start,runId),m=validateRecoveryManifest(prepared.manifest);
   if(m.runId!==runId||m.basis.subject.repoId!==start.repoId||m.basis.subject.rootArtifactId!==start.rootArtifactId||m.basis.subject.storyId!==start.storyId||m.basis.subject.build.artifactId!==start.buildArtifactId)throw Error('Prepared manifest differs from canonical start scope');
   if(prepared.authorParty===prepared.reviewerParty)throw Error('Independent reviewer required');
   const staged=await store.journal.exclusive(()=>store.journal.stage({...m}));
   descriptor=this.descriptors.install({version:1,engine:'plan-investigation-v1',adapterVersion:1,repoId:start.repoId,repoPath:start.repo,runId,requestDigest,start,
    manifestRef:staged.reference,manifestDigest:staged.digest,subjectDigest:m.subjectDigest,policyDigest:m.policyDigest,backendDigest:digestValue(m.compatibility),authorParty:prepared.authorParty,reviewerParty:prepared.reviewerParty});
  }
  return this.recover(descriptor,store);
 });}
 private async recover(descriptor:ProductionReviewDescriptor,store:RecoveryStore){
  const manifest=validateRecoveryManifest(store.journal.read(descriptor.manifestRef) as RecoveryManifest);
  if(manifest.runId!==descriptor.runId||manifest.subjectDigest!==descriptor.subjectDigest||manifest.policyDigest!==descriptor.policyDigest||digestValue(manifest.compatibility)!==descriptor.backendDigest)throw Error('Manifest discovery binding mismatch');
  await this.options.assertFresh(descriptor,manifest);await store.prepare(manifest);return {descriptor,store};
 }
 async open(runId:string){await this.guard();const descriptor=this.descriptors.read(runId);if(!descriptor||descriptor.repoId!==this.options.repoId)throw new ReviewIntegrationError('identity-conflict','Unknown production run');
  // Opening status does not re-admit changed canonical work or mutate accepted state.
  const store=this.store(runId);return {descriptor,store};
 }
 async resume(runId:string){
  if(this.running.has(runId))throw new ReviewIntegrationError('identity-conflict','Run is already active');
  const abort=new AbortController();
  const done=this.execute(runId,abort);this.running.set(runId,{abort,done});
  try{return await done;}finally{this.running.delete(runId);}
 }
 private async execute(runId:string,abort:AbortController){
  const signal=abort.signal;
  const {descriptor,store}=await this.open(runId);await this.options.assertQualified(descriptor);
  const releaseProvider=await this.options.admitProvider(signal);let lease:Lease|undefined,timer:ReturnType<typeof setInterval>|undefined,renewal:Promise<unknown>|undefined;
  try{
   signal.throwIfAborted();await this.guard();await this.recover(descriptor,store);
   if(store.replay().publication)throw new ReviewIntegrationError('identity-conflict','Frozen publication requires reconciliation, not another model turn');
   lease=await store.claim(300000);const owner=lease;
   timer=setInterval(()=>{if(renewal)return;renewal=store.renew(owner.leaseId,owner.generation,300000).catch(()=>abort.abort()).finally(()=>{renewal=undefined;});},30000);timer.unref();
   const execution=await this.options.execution(descriptor,store,lease,signal);
   if(execution.context.authorParty!==descriptor.authorParty||execution.context.reviewerParty!==descriptor.reviewerParty||execution.context.policy.digest!==descriptor.policyDigest)throw Error('Execution identity differs from admitted descriptor');
   return await runRecoveredContinuation(store,lease,execution.turn,{...execution.context,signal});
  }finally{
   if(timer)clearInterval(timer);
   if(renewal)await renewal;
   try{if(lease){const v=store.replay();if(v.lifecycle.owner?.leaseId===lease.leaseId&&!v.publication&&!['completed','cancelled','stale'].includes(v.lifecycle.state))await store.release(lease.leaseId,lease.generation,'paused');}}
   finally{releaseProvider();}
  }
 }
 async cancel(runId:string){
  const active=this.running.get(runId);if(active){active.abort.abort();try{await active.done;}catch{/* Accepted blocks remain in recovery. */}}
  const {store}=await this.open(runId),view=store.replay();if(['completed','cancelled','stale'].includes(view.lifecycle.state))return store.status();
  if(view.publication)throw new ReviewIntegrationError('identity-conflict','Frozen publication retained; reconcile before cancellation');
  const lease=await store.claim(300000);await store.release(lease.leaseId,lease.generation,'cancelled');return store.status();
 }
 async complete(runId:string,input:PrepareCompletionInput|null,deps:CompletionPublisherDeps){
  if(this.running.has(runId))throw new ReviewIntegrationError('identity-conflict','Cannot publish while a provider is active');
  if(deps.canonical!==this.options.canonical)throw Error('Publication must use the repository canonical lifecycle store');
  const {descriptor,store}=await this.open(runId),{context}=await deps.current();if(context.subjectDigest!==descriptor.subjectDigest||context.policyDigest!==descriptor.policyDigest||context.reviewerParty!==descriptor.reviewerParty)throw Error('Publication identity mismatch');
  if(store.replay().lifecycle.completionReceipt)return readReviewCompletion(store,deps);
  const lease=await store.claim(300000);
  try{
   let intentRef:string|null=null;
   if(!store.replay().publication){if(!input)throw Error('Initial publication input required');intentRef=(await prepareCompletionPublication(store,lease.leaseId,lease.generation,{...input,context})).intentRef;}
   return await completeInvestigationReview(store,lease.leaseId,lease.generation,intentRef,context,deps);
  }finally{const view=store.replay();if(view.lifecycle.owner?.leaseId===lease.leaseId&&!['completed','cancelled','stale'].includes(view.lifecycle.state))await store.release(lease.leaseId,lease.generation,'paused');}
 }
}
const services=new Map<string,ProductionReviewService>();
/** Daemon entry point: shares the existing canonical lifecycle store and validates registry membership first. */
export async function investigationServiceFor(options:Omit<ProductionReviewServiceOptions,'canonical'>){
 await options.assertRegistered();options.assertProcessOwner();const path=realpathSync(options.repoPath),old=services.get(path);
 if(old){if(old.options.repoId!==options.repoId||old.options.processEpoch!==options.processEpoch)throw new ReviewIntegrationError('identity-conflict','Repository service identity changed');return old;}
 const service=new ProductionReviewService({...options,repoPath:path,canonical:lifecycleFor(path).store});services.set(path,service);return service;
}
