import { readdir, realpath, lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalReviewStory, prepareReviewAdmission } from './admission.js';
import { loadStoredCheckpoint } from './checkpoint.js';
import { requireReview,isCodeAdmission } from './contracts.js';
import { qualifiedCodeView } from './worker-checkpoint.js';
import { validateTaskBody, taskAttemptSummary,mergeCodeAdmissionFailure,codeReviewPreservationDigest } from './record.js';
import { withoutReviewResourceGuard,persistReviewResourceAudit } from '../../review/resource-audit.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { readDesignFile } from '../../review/design-review/subject.js';
import type { ReviewSources } from './sources.js';
import { artifactJsonPath, codeReviewArtifactId } from '../../storage.js';

export interface CleanupResult { deleted: string[]; retained: string[]; errors: string[]; }
/** Called under the daemon owner's story fence, after BUILD approval. No models. */
export async function cleanupStoryCheckpoints(project:string,hash:string,story:string,deps:{sources:ReviewSources;unlink?:typeof unlink;onDeleted?:(id:string)=>void;ownerReviewId?:string}):Promise<CleanupResult>{
 const result:CleanupResult={deleted:[],retained:[],errors:[]},directory=join(project,'.insrc/tmp/code-review');
 try{
  const info=await lstat(directory);requireReview(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(directory)===directory,'cleanup','Unsafe checkpoint directory');
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return result;result.retained.push(directory);result.errors.push(String(error));return result;}
 const entries=await readdir(directory,{withFileTypes:true});
 if(entries.length>10000){result.retained.push(directory);result.errors.push('Checkpoint directory exceeds cleanup scan limit');return result;}
 for(const entry of entries){
  if(deps.ownerReviewId&&entry.name!==`${deps.ownerReviewId}.json`)continue;
  const path=join(directory,entry.name);
  try{
   requireReview(entry.isFile()&&!entry.isSymbolicLink()&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\.json$/.test(entry.name),'cleanup','Unsafe or unrecognized checkpoint entry');
   const saved=await loadStoredCheckpoint(path);requireReview(saved,'checkpoint','Missing checkpoint');
   requireReview(saved.project===project&&saved.reviewId===entry.name.slice(0,-5),'checkpoint','Foreign checkpoint identity');
   requireReview(canonicalReviewStory(saved.storyId,hash)===canonicalReviewStory(story,hash),'storyId','Different story; retained');
   const latest=saved.attempts.at(-1);requireReview(latest,'checkpoint','Empty attempt history');
   requireReview(saved.attempts.every(a=>!a.resourceGuard?.openLeases.length&&!['pending','running'].includes(a.header.status)&&(isCodeAdmission(a)||a['review-response'].crPublication==='complete')),'checkpoint','Unfinished, unpublished or resource-fenced attempt; retained');
   const qualified=qualifiedCodeView(saved);
   // Reuse the existing strict source/history/CR comparison rather than invent a second preservation validator.
   if(qualified){const last=qualified.attempts.at(-1)!;await prepareReviewAdmission(project,saved.reviewId,last.header.attempt,undefined,last.header.reviewer,deps.sources,{operation:'resume',epicHash:hash,qualifiedHistory:qualified});}
   const cr=JSON.parse(readDesignFile(project,artifactJsonPath(project,codeReviewArtifactId(hash,canonicalReviewStory(story,hash))))) as {meta?:{schemaVersion?:number};body?:unknown};
   requireReview(cr.meta?.schemaVersion===2||cr.meta?.schemaVersion===3,'CR','Required permanent CR missing');
   const body=validateTaskBody(cr.body);
   for(const attempt of saved.attempts){
    if(isCodeAdmission(attempt)){requireReview(codeReviewPreservationDigest(mergeCodeAdmissionFailure(body,saved.reviewId,attempt))===codeReviewPreservationDigest(body),'CR','Technical admission history is not preserved');continue;}
    const summary=body.reviews.find(r=>r.reviewId===saved.reviewId&&r.attempt===attempt.header.attempt);
    requireReview(summary,'CR','Missing saved attempt summary');
    if(attempt['review-response'].failureDiagnostics?.length)requireReview(summary.summary===taskAttemptSummary(attempt),'CR','Pointed native failure summary is not preserved; retain historical checkpoint');
   }
   // Requalification uses host-owned Git leases whose open/close metadata is
   // saved in this very checkpoint. Only those operational fields may change.
   const current=await loadStoredCheckpoint(path);requireReview(current&&!current.attempts.some(a=>a.resourceGuard?.openLeases.length),'checkpoint','Resources remain active');
   const evidence=(cp:typeof saved)=>({...cp,schemaVersion:2,attempts:cp.attempts.map(withoutReviewResourceGuard)});
   requireReview(isDeepStrictEqual(evidence(current),evidence(saved)),'checkpoint','Reviewed checkpoint changed during cleanup');
   await persistReviewResourceAudit(createRepoLifecycle(project).store,codeReviewArtifactId(hash,story),{project,family:'code',reviewId:saved.reviewId},current.attempts.flatMap(a=>a.resourceGuard?[{attempt:a.header.attempt,resourceGuard:a.resourceGuard}]:[]));
   const before=await lstat(path),again=await loadStoredCheckpoint(path),after=await lstat(path);
   requireReview(before.ino===after.ino&&before.dev===after.dev&&before.mtimeMs===after.mtimeMs&&before.size===after.size&&!after.isSymbolicLink()&&isDeepStrictEqual(again,current),'checkpoint','Checkpoint changed during cleanup');
   await(deps.unlink??unlink)(path);result.deleted.push(path);
   try{deps.onDeleted?.(saved.reviewId);}catch{result.errors.push(`${entry.name}: deleted, but terminal replay cache release failed`);}
  }catch(error){
   if((error as NodeJS.ErrnoException).code==='ENOENT')continue;
   result.retained.push(path);result.errors.push(`${entry.name}: ${error instanceof SyntaxError?'Invalid JSON; retained':error instanceof Error?error.message:String(error)}`);
  }
 }
 return result;
}
