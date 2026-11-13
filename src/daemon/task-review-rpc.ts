/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { realpath,readFile } from 'node:fs/promises';
import { isMainThread,workerData } from 'node:worker_threads';
import { productionReviews } from './review-service.js';
import type { TrustedRpcContext } from './request-context.js';
import { ownedReviewCleanup } from '../workflow/review/cleanup-owner.js';
import { cleanupStoryCheckpoints } from '../workflow/code-review/task-review/cleanup.js';
import { RegistryReviewSources } from '../workflow/code-review/task-review/sources.js';
import { requireReview } from '../workflow/code-review/task-review/contracts.js';
import { approvalStateOf } from '../workflow/artifact-core/approval-view.js';
import { artifactJsonPath,buildArtifactId } from '../workflow/storage.js';
import { lifecycleFor } from './lifecycle-registry.js';

export const startTaskReview=(raw:unknown,trusted?:TrustedRpcContext)=>productionReviews().codeStart(raw,trusted);
export const readTaskReviewProgress=(raw:unknown,trusted?:TrustedRpcContext)=>productionReviews().codeProgress(raw,trusted);
export const publishStoredTaskReview=(raw:unknown,trusted?:TrustedRpcContext)=>productionReviews().codePublish(raw,trusted);
export const exchangeControllerTaskReview=(raw:unknown,trusted:TrustedRpcContext|undefined,phase:'assignment'|'scope'|'result'|'activity')=>productionReviews().codeControl(raw,trusted,phase);

async function cleanupTarget(raw:unknown){
 requireReview(raw&&typeof raw==='object','request','Expected story cleanup request');
 const p=raw as Record<string,unknown>;
 requireReview(typeof p['repo']==='string'&&p['repo'].startsWith('/'),'repo','Expected absolute project');
 const repo=await realpath(p['repo']);
 requireReview(typeof p['epicHash']==='string'&&/^[a-f0-9]{16}$/.test(p['epicHash'])&&typeof p['storyId']==='string'&&/^s\d+$/.test(p['storyId']),'storyId','Expected canonical story identity');
 return{repo,hash:p['epicHash'],story:p['storyId']};
}
/** The approval consumer does only identity routing. Integrity/source history
 * checks execute under the main exclusion in the dedicated cleanup owner. */
export async function cleanupApprovedTaskReviews(raw:unknown){
 const {repo,hash,story}=await cleanupTarget(raw);
 const owned=await ownedReviewCleanup({project:repo,family:'code',epicHash:hash,storyId:story});
 if(!owned)throw new Error('Dedicated review cleanup owner unavailable');return owned;
}
export async function requireApprovedBuildForReviewCleanup(repo:string,hash:string,story:string):Promise<void>{
 const id=buildArtifactId(hash,story),stored=await lifecycleFor(repo).service.inspect(id);
 requireReview(stored?.integrity.ok,'BUILD','BUILD integrity cannot be verified');
 const build=JSON.parse(await readFile(artifactJsonPath(repo,id),'utf8')) as {meta:Record<string,unknown>};
 requireReview(approvalStateOf(build.meta)==='approved','BUILD','Story BUILD approval is required for cleanup');
}
/** Private registered owner operation; never exposed as an RPC argument. */
export async function cleanupTaskReviewsInOwner(raw:unknown,reviewId:string){
 const {repo,hash,story}=await cleanupTarget(raw);
 requireReview(!isMainThread&&workerData?.role==='review'&&workerData.review?.key?.project===repo&&workerData.review?.key?.reviewId===reviewId,'cleanup','Registered cleanup worker required');
 await requireApprovedBuildForReviewCleanup(repo,hash,story);
 return cleanupStoryCheckpoints(repo,hash,story,{sources:new RegistryReviewSources({repoPath:repo,sessionId:'review-cleanup',requestId:0,send:()=>{}}),ownerReviewId:reviewId});
}
