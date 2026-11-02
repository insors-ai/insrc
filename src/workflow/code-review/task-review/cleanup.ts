import { readdir, realpath, lstat, unlink, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalReviewStory, prepareReviewAdmission } from './admission.js';
import { loadCheckpoint } from './checkpoint.js';
import { requireReview } from './contracts.js';
import { validateTaskBody, taskAttemptSummary } from './record.js';
import type { ReviewSources } from './sources.js';
import { artifactJsonPath, codeReviewArtifactId } from '../../storage.js';

export interface CleanupResult { deleted: string[]; retained: string[]; errors: string[]; }
/** Called under the daemon owner's story fence, after BUILD approval. No models. */
export async function cleanupStoryCheckpoints(project:string,hash:string,story:string,deps:{sources:ReviewSources;unlink?:typeof unlink;onDeleted?:(id:string)=>void}):Promise<CleanupResult>{
 const result:CleanupResult={deleted:[],retained:[],errors:[]},directory=join(project,'.insrc/tmp/code-review');
 try{
  const info=await lstat(directory);requireReview(info.isDirectory()&&!info.isSymbolicLink()&&await realpath(directory)===directory,'cleanup','Unsafe checkpoint directory');
 }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return result;result.retained.push(directory);result.errors.push(String(error));return result;}
 const entries=await readdir(directory,{withFileTypes:true});
 if(entries.length>10000){result.retained.push(directory);result.errors.push('Checkpoint directory exceeds cleanup scan limit');return result;}
 for(const entry of entries){
  const path=join(directory,entry.name);
  try{
   requireReview(entry.isFile()&&!entry.isSymbolicLink()&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\.json$/.test(entry.name),'cleanup','Unsafe or unrecognized checkpoint entry');
   const before=await lstat(path),saved=await loadCheckpoint(path);requireReview(saved,'checkpoint','Missing checkpoint');
   requireReview(saved.project===project&&saved.reviewId===entry.name.slice(0,-5),'checkpoint','Foreign checkpoint identity');
   requireReview(canonicalReviewStory(saved.storyId,hash)===canonicalReviewStory(story,hash),'storyId','Different story; retained');
   const latest=saved.attempts.at(-1);requireReview(latest,'checkpoint','Empty attempt history');
   requireReview(saved.attempts.every(a=>!['pending','running'].includes(a.header.status)&&a['review-response'].crPublication==='complete'),'checkpoint','Unfinished or unpublished attempt; retained');
   // Reuse the existing strict source/history/CR comparison rather than invent a second preservation validator.
   await prepareReviewAdmission(project,saved.reviewId,latest.header.attempt,undefined,latest.header.reviewer,deps.sources,{operation:'resume',epicHash:hash});
   const cr=JSON.parse(await readFile(artifactJsonPath(project,codeReviewArtifactId(hash,canonicalReviewStory(story,hash))),'utf8')) as {meta?:{schemaVersion?:number};body?:unknown};
   requireReview(cr.meta?.schemaVersion===2,'CR','Required permanent CR missing');
   const body=validateTaskBody(cr.body);
   for(const attempt of saved.attempts){
    const summary=body.reviews.find(r=>r.reviewId===saved.reviewId&&r.attempt===attempt.header.attempt);
    requireReview(summary,'CR','Missing saved attempt summary');
    if(attempt['review-response'].failureDiagnostics?.length)requireReview(summary.summary===taskAttemptSummary(attempt),'CR','Pointed native failure summary is not preserved; retain historical checkpoint');
   }
   const after=await lstat(path);
   requireReview(before.ino===after.ino&&before.dev===after.dev&&before.mtimeMs===after.mtimeMs&&before.size===after.size&&!after.isSymbolicLink(),'checkpoint','Checkpoint changed during cleanup');
   requireReview(isDeepStrictEqual(await loadCheckpoint(path),saved),'checkpoint','Checkpoint changed during cleanup');
   await(deps.unlink??unlink)(path);result.deleted.push(path);
   try{deps.onDeleted?.(saved.reviewId);}catch{result.errors.push(`${entry.name}: deleted, but terminal replay cache release failed`);}
  }catch(error){
   if((error as NodeJS.ErrnoException).code==='ENOENT')continue;
   result.retained.push(path);result.errors.push(`${entry.name}: ${error instanceof SyntaxError?'Invalid JSON; retained':error instanceof Error?error.message:String(error)}`);
  }
 }
 return result;
}
