/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isMainThread } from 'node:worker_threads';
import { lookupRepoId } from '../db/repos.js';
import { ReviewIntegrationError } from '../shared/review-investigation.js';
import { parseInvestigationEnvelope } from '../shared/review-investigation-wire.js';
import { InvestigationRepository } from './review-investigation-repository.js';
import { lifecycleFor } from './lifecycle-registry.js';
import { daemonRunFiles } from './run-file-ownership.js';

export interface InvestigationGatewayDeps {
 readonly repository:(repo:string)=>Promise<InvestigationRepository>;
}
/** Both transports enter here before their legacy parsers. Never reinterpret a
 * refused investigation packet as a legacy review or infer a scope from HEAD. */
export async function dispatchInvestigation(raw:unknown,deps:InvestigationGatewayDeps=productionGateway):Promise<Record<string,unknown>>{
 const envelope=parseInvestigationEnvelope(raw),command=envelope.command;
 const repository=await deps.repository(realpathSync(command.repo));
 if(command.repo!==repository.options.repoPath)throw new ReviewIntegrationError('identity-conflict','Use the registered canonical repository path');
 switch(command.operation){
  case 'start':{
   if(command.repoId!==repository.options.repoId)throw new ReviewIntegrationError('identity-conflict','Registered repository identity changed');
   const accepted=await repository.start(command,envelope.reviewBudget);
   return repository.advance(accepted.descriptor.runId,envelope.reviewBudget,command);
  }
  case 'status':return repository.view(command.runId);
  case 'resume':return repository.advance(command.runId,envelope.reviewBudget,command);
  case 'cancel':return repository.cancel(command.runId);
  default:return repository.bound(envelope);
 }
}
export async function investigationTransport(raw:unknown,dispatch:(raw:unknown)=>Promise<Record<string,unknown>>=dispatchInvestigation):Promise<Record<string,unknown>>{
 try{return await dispatch(raw);}catch(cause){return {version:1,engine:'plan-investigation-v1',next:'error',error:{code:cause instanceof ReviewIntegrationError?cause.code:'investigation-refused',message:cause instanceof Error?cause.message:'Investigation refused'},legacyFallback:false};}
}
const epoch=randomUUID(),repositories=new Map<string,InvestigationRepository>();
/** A daemon-owned readiness/qualification installation, never supplied through
 * command JSON. Installation is explicit and cannot replace an active runtime. */
export interface InvestigationProductionAdmission {
 readonly assertReady:InvestigationRepository['options']['assertReady'];
 readonly daemonAdapter:InvestigationRepository['options']['daemonAdapter'];
}
let admission:InvestigationProductionAdmission|undefined;
export function installInvestigationProductionAdmission(value:InvestigationProductionAdmission):void{
 if(!isMainThread||repositories.size)throw new ReviewIntegrationError('not-ready','Investigation admission must be installed on the owning daemon before use');
 admission=value;
}
const productionGateway:InvestigationGatewayDeps={repository:async repo=>{
 if(!isMainThread)throw new ReviewIntegrationError('not-ready','Investigation mutations require the owning main daemon');
 daemonRunFiles.assertSocketOwned();
 const id=await lookupRepoId(repo);if(id===undefined)throw new ReviewIntegrationError('identity-conflict','Repository is not registered');
 let runtime=repositories.get(repo);if(runtime)return runtime;
 const registered=async()=>{if(await lookupRepoId(repo)!==id)throw new ReviewIntegrationError('identity-conflict','Repository registration changed');};
 runtime=new InvestigationRepository({repoId:String(id),repoPath:repo,canonical:lifecycleFor(repo).store,processEpoch:epoch,assertRegistered:registered,assertProcessOwner:()=>daemonRunFiles.assertSocketOwned(),
  assertReady:async operation=>{if(!admission)throw new ReviewIntegrationError('not-ready','Investigation activation requires verified readiness and predecessor reconciliation');await admission.assertReady(operation);},
  daemonAdapter:async(subject,mode)=>{if(!admission)throw new ReviewIntegrationError('unsupported-backend','No independently qualified installed investigation adapter');return admission.daemonAdapter(subject,mode);}});
 repositories.set(repo,runtime);return runtime;
}};

/** Read-only legacy diagnostics, including installed predecessor records. No
 * investigative scope, lease, usage observation or completion claim is minted. */
export async function legacyInvestigationDiagnostics(raw:unknown,deps:InvestigationGatewayDeps=productionGateway){
 const {z}=await import('zod');const {legacyReviewStatus}=await import('./review-investigation-status.js');
 const parsed=z.object({repo:z.string().min(1),buildArtifactId:z.string().min(1)}).strict().safeParse(raw);
 if(!parsed.success)return legacyReviewStatus(null);
 const {ArtifactIds}=await import('../workflow/artifact-ids.js');const key=ArtifactIds.parse(parsed.data.buildArtifactId);
 if(key?.kind!=='BUILD'||!key.story)return legacyReviewStatus(null);
 const repository=await deps.repository(realpathSync(parsed.data.repo)),build=await repository.work.readCanonicalHead(parsed.data.buildArtifactId);
 if(!build)return legacyReviewStatus(null);
 const review=await repository.work.readCanonicalHead(`CR-${key.epicHash}-${key.story}`);
 if(!review||review.head.body['groundingMode']==='investigation')return legacyReviewStatus(null);
 const {reviewedBuildFingerprint,reviewBuildGap}=await import('../workflow/code-review/build-freshness.js');
 if(reviewBuildGap(build.head,review.head,repository.options.repoPath))return legacyReviewStatus(null);
 const dimensions=review.head.body['dimensions'];if(!Array.isArray(dimensions)||dimensions.some(d=>typeof d?.dimension!=='string'))return legacyReviewStatus(null);
 const runId=review.head.meta['runId'];if(typeof runId!=='string')return legacyReviewStatus(null);
 return legacyReviewStatus({runId,buildFingerprint:reviewedBuildFingerprint(build.head),dimensions:dimensions.map(d=>({name:d.dimension as string,completed:true})),phase:'persisted-code-review'});
}
