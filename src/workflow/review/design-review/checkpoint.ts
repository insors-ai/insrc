/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { promises as fs, constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ArtifactIds } from '../../artifact-ids.js';
import { artifactJsonPath } from '../../storage.js';
import { DESIGN_LIMITS, DesignCheckpointSchema, decodeDesign, requireDesign } from './contracts.js';
import type { DesignReviewCheckpoint } from './contracts.js';

export function designCheckpointPath(project: string, reviewId: string): string {
 requireDesign(isAbsolute(project)&&resolve(project)===project,'invalid_project','Expected canonical absolute project');
 requireDesign(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(reviewId),'invalid_review_id','Expected literal review identifier');
 return join(project,'.insrc/tmp/design-review',`${reviewId}.json`);
}
async function checkDirectories(project: string, create: boolean): Promise<boolean> {
 requireDesign(await fs.realpath(project)===project,'invalid_project','Project must be canonical');
 let path=project;
 for(const part of ['.insrc','tmp','design-review']) {
  path=join(path,part);
  let stat;
  try { stat=await fs.lstat(path); }
  catch(error) {
   if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
   if(!create)return false;
   try {await fs.mkdir(path,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
   stat=await fs.lstat(path);
  }
  requireDesign(stat.isDirectory()&&!stat.isSymbolicLink()&&await fs.realpath(path)===path,'invalid_checkpoint_path','Checkpoint directory is not canonical');
 }
 return true;
}
function checkIdentity(project: string, id: string, checkpoint: DesignReviewCheckpoint): void {
 const key=ArtifactIds.parse(checkpoint.artifactId);
 requireDesign(checkpoint.reviewId===id&&checkpoint.project===project&&checkpoint.subject.project===project&&checkpoint.subject.artifactId===checkpoint.artifactId,'foreign_checkpoint','Checkpoint identity does not match request');
 requireDesign(key&&['DEF','HLD','LLD'].includes(key.kind)&&key.kind===checkpoint.subject.kind,'foreign_checkpoint','Invalid checkpoint subject');
 requireDesign(checkpoint.subject.canonicalPath===artifactJsonPath(project,checkpoint.artifactId),'foreign_checkpoint','Noncanonical subject in checkpoint');
 const doc=relative(join(project,'docs'),checkpoint.subject.documentPath);
 requireDesign(doc!==''&&!doc.startsWith('..')&&!isAbsolute(doc),'foreign_checkpoint','Subject document must remain in project docs');
 requireDesign(checkpoint.attempts.every((a,i)=>a.number===i+1),'invalid_checkpoint','Attempt sequence is not contiguous');
 for(const attempt of checkpoint.attempts) {
  requireDesign(attempt.progress.checkpointPath===designCheckpointPath(project,id),'foreign_checkpoint','Progress names another checkpoint');
  requireDesign(attempt.completedChunks.every(r=>Buffer.byteLength(JSON.stringify(r))<=DESIGN_LIMITS.resultBytes),'result_too_large','Stored chunk result exceeds page limit');
  const ids=new Set(attempt.completedChunks.map(r=>r.chunkId));
  requireDesign(ids.size===attempt.completedChunks.length,'invalid_checkpoint','Duplicate accepted chunk results');
  if(attempt.report) requireDesign(attempt.report.reviewId===id&&attempt.report.attempt===attempt.number&&attempt.report.artifactId===checkpoint.artifactId&&attempt.report.reviewedContentIdentity===attempt.baseline.contentIdentity&&JSON.stringify(attempt.report.chunks)===JSON.stringify(attempt.completedChunks),'invalid_checkpoint','Report does not match accepted attempt');
 }
}
export async function loadDesignCheckpoint(project: string, reviewId: string): Promise<DesignReviewCheckpoint | undefined> {
 const path=designCheckpointPath(project,reviewId);
 if(!await checkDirectories(project,false))return undefined;
 let file;
 try {file=await fs.open(path,constants.O_RDONLY|constants.O_NOFOLLOW);}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
 try {
  const stat=await file.stat();
  requireDesign(stat.isFile()&&stat.size<=DESIGN_LIMITS.checkpointBytes,'checkpoint_too_large','Expected bounded regular checkpoint');
  const bytes=Buffer.alloc(stat.size+1);let size=0;
  while(size<bytes.length){const read=await file.read(bytes,size,bytes.length-size,null);if(!read.bytesRead)break;size+=read.bytesRead;}
  requireDesign(size<=stat.size,'checkpoint_changed','Checkpoint changed while reading');
  const checkpoint=decodeDesign(DesignCheckpointSchema,JSON.parse(bytes.subarray(0,size).toString('utf8')));
  checkIdentity(project,reviewId,checkpoint);return checkpoint;
 } finally {await file.close();}
}
/** A failed pre-rename write leaves the previous accepted snapshot intact. No advance may follow a rejected save. */
export async function saveDesignCheckpoint(project: string, input: DesignReviewCheckpoint): Promise<void> {
 const checkpoint=decodeDesign(DesignCheckpointSchema,input),path=designCheckpointPath(project,checkpoint.reviewId);
 checkIdentity(project,checkpoint.reviewId,checkpoint);
 await checkDirectories(project,true);
 // Refuse corrupt/foreign existing state instead of destroying it on a new write.
 const previous=await loadDesignCheckpoint(project,checkpoint.reviewId);
 requireDesign(!previous||previous.artifactId===checkpoint.artifactId,'foreign_checkpoint','Cannot replace another subject');
 if(previous)for(const old of previous.attempts){
  const next=checkpoint.attempts[old.number-1];
  requireDesign(next&&JSON.stringify(next.baseline)===JSON.stringify(old.baseline)&&JSON.stringify(next.inventory)===JSON.stringify(old.inventory),'immutable_history','Cannot replace an admitted baseline/inventory');
  requireDesign(!old.plan||JSON.stringify(next.plan)===JSON.stringify(old.plan),'immutable_history','Cannot replace an accepted plan');
  requireDesign(old.completedChunks.every((r,i)=>JSON.stringify(r)===JSON.stringify(next.completedChunks[i])),'immutable_history','Cannot replace completed feedback');
 }
 const raw=JSON.stringify(checkpoint,null,2)+'\n';
 requireDesign(Buffer.byteLength(raw)<=DESIGN_LIMITS.checkpointBytes,'checkpoint_too_large','Checkpoint exceeds limit');
 const temporary=`${path}.${randomUUID()}.tmp`;
 let created=false;
 try {
  const file=await fs.open(temporary,'wx',0o600);
  created=true;
  try {await file.writeFile(raw);await file.sync();}finally{await file.close();}
  await fs.rename(temporary,path);
  const directory=await fs.open(dirname(path),'r');
  try{await directory.sync();}finally{await directory.close();}
 } finally {
  if(created)await fs.unlink(temporary).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;});
 }
}
