/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { parentPort,workerData } from 'node:worker_threads';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { installReviewNativeSpawnGuard } from '../../shared/review-native-guard.js';
import type { ReviewKey } from '../../shared/review-resources.js';
import type { ReviewCleanupTarget } from '../../workflow/review/cleanup-owner.js';
installReviewNativeSpawnGuard();
const {startDaemonWorker}=await import('./worker-entry.js');
const {serveRequests}=await import('./worker-requests.js');
const {directDispatch}=await import('../server.js');
const {loadStoredCheckpoint}=await import('../../workflow/code-review/task-review/checkpoint.js');
const {loadStoredDesignCheckpoint}=await import('../../workflow/review/design-review/checkpoint.js');
const {canonicalReviewStory}=await import('../../workflow/code-review/task-review/admission.js');
const {cleanupDesignArtifact}=await import('../../workflow/review/design-review/cleanup.js');
const {TaskReviewCoordinator}=await import('../../workflow/code-review/task-review/coordinator.js');
const {DesignReviewCoordinator}=await import('../../workflow/review/design-review/coordinator.js');
const {RegistryReviewSources}=await import('../../workflow/code-review/task-review/sources.js');
const {validateTaskBody}=await import('../../workflow/code-review/task-review/record.js');
const {artifactJsonPath,codeReviewArtifactId}=await import('../../workflow/storage.js');
const {readDesignFile}=await import('../../workflow/review/design-review/subject.js');
startDaemonWorker(workerData);
serveRequests(parentPort!,directDispatch({
 'review.cleanup.describe':async()=>{
  const key=workerData.key as ReviewKey;
  if(key.family==='code'){
   const cp=await loadStoredCheckpoint(join(key.project,'.insrc/tmp/code-review',`${key.reviewId}.json`));if(!cp)return undefined;
   const last=cp.attempts.at(-1)!,refs=Object.values(last.submitted.documents).filter(Boolean).map(d=>d!.path);
   const epicHash=/^STORY-([a-f0-9]{16})-s\d+$/.exec(cp.storyId)?.[1]??refs.map(p=>/(?:-(?:[a-z]+-)?|E\d{8})([a-f0-9]{16})(?:-s\d+)?(?:\.(?:json|md)|\/)/i.exec(p)?.[1]).find(Boolean);
   return{attempt:last.header.attempt,reviewer:last.header.reviewer,storyId:cp.storyId,...(epicHash?{epicHash}:{})};
  }
  const cp=await loadStoredDesignCheckpoint(key.project,key.reviewId);if(!cp)return undefined;
  const last=cp.attempts.at(-1)!,qualified='subject'in cp?cp.subject:undefined;
  const artifactPath=qualified?.canonicalPath??('submitted'in last&&last.submitted?last.submitted.artifactPath:undefined);
  const artifactId='artifactId'in cp?cp.artifactId:undefined;
  return{attempt:last.number,reviewer:last.reviewer??qualified?.reviewer,...(artifactPath?{artifactPath}:{}),...(artifactId?{artifactId}:{})};
 },
 'review.cleanup.history':async()=>{
  const {key,attempt,options}=workerData.history as {key:ReviewKey;attempt:number;options:{artifactPath?:string;epicHash?:string;storyId?:string;includeResult?:boolean;afterCompletedChunk?:number}};
  if(key.family==='design')return new DesignReviewCoordinator().progress(key.project,key.reviewId,attempt,options);
  const cp=await loadStoredCheckpoint(join(key.project,'.insrc/tmp/code-review',`${key.reviewId}.json`));
  if(cp)return new TaskReviewCoordinator({sources:new RegistryReviewSources({repoPath:key.project,sessionId:'stored-read',requestId:0,send:()=>{}}),provider:()=>{throw new Error('Stored reads cannot invoke providers');}}).progress(key.project,key.reviewId,attempt);
  if(!options.epicHash||!/^[a-f0-9]{16}$/.test(options.epicHash)||options.storyId!==undefined&&!/^s\d+$/.test(options.storyId))throw new Error('Permanent code history requires its canonical epic locator');
  let body:ReturnType<typeof validateTaskBody>|undefined;
  const read=(story:string)=>{const path=artifactJsonPath(key.project,codeReviewArtifactId(options.epicHash!,story));const value=validateTaskBody((JSON.parse(readDesignFile(key.project,path)) as {body:unknown}).body);if(value.storyId!==story)throw new Error('Permanent review belongs to another story');return value;};
  if(options.storyId)body=read(options.storyId);
  else{
   const files=await readdir(join(key.project,'.insrc/artifacts'));if(files.length>10000)throw new Error('Permanent history lookup requires an explicit storyId at this repository size');
   for(const file of files){const match=new RegExp(`^CR-${options.epicHash}-(s[0-9]+)\\.json$`).exec(file);if(!match)continue;
    let candidate:ReturnType<typeof validateTaskBody>;try{candidate=read(match[1]!);}catch{continue;}
    if(!candidate.reviews.some(r=>r.reviewId===key.reviewId&&r.attempt===attempt)&&!candidate.admissionFailures?.some(r=>r.reviewId===key.reviewId&&r.attempt.header.attempt===attempt))continue;
    if(body)throw new Error('Permanent review locator is ambiguous; supply storyId');body=candidate;
   }
  }
  if(!body)throw new Error('Permanent review not found; supply its storyId locator');
  const review=body.reviews.find(r=>r.reviewId===key.reviewId&&r.attempt===attempt);
  if(review)return{reviewId:key.reviewId,attempt,status:review.status,crPublication:'complete',executionState:'inactive',completedTasks:review.tasks.length,totalTasks:review.failedAttempt?.header.selectedTaskIds.length??review.tasks.length,interrupted:false,hasError:!!review.failedAttempt,freshness:'stale',progress:null};
  const failure=body.admissionFailures?.find(f=>f.reviewId===key.reviewId&&f.attempt.header.attempt===attempt)?.attempt;
  if(!failure)throw new Error('Permanent review attempt not found');
  return{reviewId:key.reviewId,attempt,status:failure.header.status,crPublication:'pending',executionState:'inactive',completedTasks:0,totalTasks:0,interrupted:failure.header.status==='interrupted',hasError:!!failure.error,freshness:'stale',progress:failure.progress,admission:{validation:'unverified',...(failure.error?{error:failure.error}:{})}};
 },
 'review.cleanup.execute':async()=>{const target=workerData.target as ReviewCleanupTarget;if(target.family!=='design')throw new Error('Design cleanup scope required');return{candidates:[],...await cleanupDesignArtifact(target.project,target.artifactId,{ownerScope:true})};},
 'review.cleanup.discover':async()=>{
 const target=workerData.target as ReviewCleanupTarget,dir=join(target.project,'.insrc/tmp',target.family==='code'?'code-review':'design-review');
 if(target.family==='code'){const {requireApprovedBuildForReviewCleanup}=await import('../task-review-rpc.js');await requireApprovedBuildForReviewCleanup(target.project,target.epicHash,target.storyId);}
 let names:string[];try{names=await readdir(dir);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return{candidates:[],retained:[],errors:[]};throw e;}
 if(names.length>10000)throw new Error('Review cleanup directory exceeds scan limit');
 const candidates:Array<{reviewId:string;attempt:number}>=[],retained:string[]=[],errors:string[]=[];
 for(const name of names){if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\.json$/.test(name))continue;const id=name.slice(0,-5);try{
  if(target.family==='code'){
   const cp=await loadStoredCheckpoint(join(dir,name));if(cp&&canonicalReviewStory(cp.storyId,target.epicHash)===target.storyId)candidates.push({reviewId:id,attempt:cp.attempts.at(-1)!.header.attempt});
  }else{const cp=await loadStoredDesignCheckpoint(target.project,id);if(cp&&'artifactId'in cp&&cp.artifactId===target.artifactId)candidates.push({reviewId:id,attempt:cp.attempts.at(-1)!.number});}
 }catch(e){retained.push(join(dir,name));errors.push(String(e));}}
 return{candidates,retained,errors};
}}));
parentPort!.postMessage('worker-ready');
