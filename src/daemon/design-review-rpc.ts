import { registerDesignCleanupRelease } from '../workflow/review/design-review/cleanup.js';
import { recordDesignAdmission } from '../workflow/review/design-review/approval.js';
import { realpath } from 'node:fs/promises';
import { DesignReviewCoordinator } from '../workflow/review/design-review/coordinator.js';
import { publishDesignReview, preflightDesignPublication } from '../workflow/review/design-review/publication.js';
import type { DesignProvider } from '../workflow/review/design-review/coordinator.js';
import { parseDesignRequest, requireDesign } from '../workflow/review/design-review/contracts.js';
import type { DesignReviewRequest } from '../workflow/review/design-review/contracts.js';
import { createRoleRouter } from '../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { familyForClient } from './model-registry.js';
import { currentStepContext } from '../shared/step-context.js';
import { repoSchemaRefusal } from './repo-schema-guard.js';
import type { TrustedRpcContext } from './request-context.js';
const coordinators=new Map<string,DesignReviewCoordinator>();
export interface DesignReviewRpcDeps { readonly provider?:((repo:string)=>DesignProvider)|undefined; }
/** The normal step host routes here on the main daemon, never a session worker. */
export async function designReviewStep(raw:unknown,trusted?:TrustedRpcContext,deps:DesignReviewRpcDeps={}):Promise<unknown>{
 const input=parseDesignRequest(raw),repo=await realpath(input.repo),request={...input,repo};
 requireDesign(!repoSchemaRefusal(repo),'repo_schema','Repository schema must be current');
 let coordinator=coordinators.get(repo);if(!coordinator){coordinator=new DesignReviewCoordinator({admit:recordDesignAdmission,publish:publishDesignReview,preflight:preflightDesignPublication});coordinators.set(repo,coordinator);const owner=coordinator;registerDesignCleanupRelease(repo,id=>owner.forgetCheckpoint(repo,id));}
 const owner=trusted?.connectionIdentity&&trusted.connectionSignal?{id:trusted.connectionIdentity,signal:trusted.connectionSignal}:undefined;
 if(request.phase==='start'||request.phase==='recover'){
  const client=currentStepContext()?.client;
  const context={owner,provider:()=>{
   if(deps.provider)return deps.provider(repo);
   const resolved=createRoleRouter({clientDefault:familyForClient(client),cliTimeoutMs:900000}).resolveProviderForRole('review',loadAnalyzeConfig(),repo);
   return{provider:resolved.provider,model:resolved.resolution.model};
  }};
  return request.phase==='start'?coordinator.start(request,context):coordinator.recover(request,context);
 }
 if(request.phase==='progress')return coordinator.progress(repo,request.reviewId,request.attempt,{includeResult:request.includeResult,afterCompletedChunk:request.afterCompletedChunk,artifactPath:request.artifactPath});
 requireDesign(owner,'wrong_owner','Trusted controller connection is required');return coordinator.exchange(request,owner);
}

/** Short unary operations share the same owner as the normal MCP step host. */
export async function designReviewOperation(phase:DesignReviewRequest['phase'],raw:unknown,trusted?:TrustedRpcContext,deps:DesignReviewRpcDeps={}):Promise<unknown>{
 requireDesign(raw&&typeof raw==='object'&&!Array.isArray(raw),'invalid_request','Expected operation parameters');
 const fields=raw as Record<string,unknown>;
 requireDesign(fields['phase']===undefined||fields['phase']===phase,'invalid_phase','Operation and phase disagree');
 return designReviewStep({...fields,phase},trusted,deps);
}
