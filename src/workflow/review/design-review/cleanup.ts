/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants, openSync, closeSync, fstatSync, readSync, lstatSync, realpathSync, readdirSync, mkdtempSync, chmodSync, writeFileSync, renameSync, unlinkSync, rmdirSync, copyFileSync, fsyncSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { ArtifactStore } from '../../artifact-core/store.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';
import { checkIntegrity } from '../../artifact-core/lifecycle.js';
import type { CleanupResult } from '../../code-review/task-review/cleanup.js';
import { DesignReviewError, DESIGN_LIMITS, requireDesign,isDesignAdmission } from './contracts.js';
import type { StoredDesignCheckpoint } from './contracts.js';
import { decodeStoredDesignCheckpoint } from './admission-checkpoint.js';
import { designCheckpointPath, validateStoredDesignIdentity } from './checkpoint.js';
import { designPreservationDigest, validatePermanentDesignReview } from './history.js';
import { designArtifactActive, withDesignArtifactFence } from './fence.js';
import { ownedReviewCleanup } from '../cleanup-owner.js';
import { persistReviewResourceAudit } from '../resource-audit.js';

interface Claim {schemaVersion:1;project:string;artifactId:string;reviewId:string;source:string;digest:string;ino:number;dev:number;state:'claimed'|'quarantine';}
export interface DesignCleanupDeps {
 readonly ownerReviewId?:string;
 readonly ownerScope?:true;
 readonly store?:ArtifactStore;
 readonly onDeleted?:(reviewId:string)=>void;
 /** Fault/race injection at real filesystem boundaries; never supplied by normal callers. */
 readonly boundary?:(stage:'beforeClaim'|'afterClaim'|'beforeDelete',source:string,claimed:string)=>void|Promise<void>;
}
const releasers=new Map<string,(reviewId:string)=>void>();
export function registerDesignCleanupRelease(project:string,release:(id:string)=>void):void{releasers.set(project,release);}
function present(path:string):boolean{try{lstatSync(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}}
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function bounded(path:string,limit:number):{bytes:Buffer;ino:number;dev:number}{
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{const st=fstatSync(fd);requireDesign(st.isFile()&&st.size<=limit,'unsafe_cleanup','Expected bounded regular file');
  const bytes=Buffer.alloc(st.size+1);let size=0,n=0;while(size<bytes.length&&(n=readSync(fd,bytes,size,bytes.length-size,null))>0)size+=n;
  requireDesign(size===st.size,'unsafe_cleanup','File changed while reading');return{bytes:bytes.subarray(0,size),ino:st.ino,dev:st.dev};
 }finally{closeSync(fd);}
}
function syncDirectory(path:string):void{const fd=openSync(path,constants.O_RDONLY);try{fsyncSync(fd);}finally{closeSync(fd);}}
function saveManifest(dir:string,claim:Claim,create=false):void{
 const path=join(dir,'claim.json');writeFileSync(path,JSON.stringify(claim),{mode:0o600,flag:create?'wx':'w'});
 const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{fsyncSync(fd);}finally{closeSync(fd);}syncDirectory(dir);
}
function decode(bytes:Buffer,project:string,id:string):StoredDesignCheckpoint{
 const cp=decodeStoredDesignCheckpoint(JSON.parse(bytes.toString('utf8')));validateStoredDesignIdentity(project,id,cp);return cp;
}
async function preserved(project:string,artifactId:string,cp:StoredDesignCheckpoint,store:ArtifactStore):Promise<void>{
 requireDesign(!cp.attempts.some(a=>'resourceGuard'in a&&a.resourceGuard?.openLeases.length),'resource_pending','Review resources are unresolved');
 requireDesign(cp.project===project&&cp.artifactId===artifactId,'foreign_checkpoint','Different project/artifact');
 requireDesign(!designArtifactActive(project,artifactId),'active_review','Artifact has active review ownership');
 const head=await store.readWithHistory(artifactId);
 requireDesign(['approved','in-signoff','signed-off','completed'].includes(head.lifecycle.status)&&head.lifecycle.approval?.revision===head.lifecycle.revision.number,'not_approved','Artifact is not currently approved');
 requireDesign(checkIntegrity(head,head.changeLog).ok,'approval_integrity','Approval history is inconsistent');
 const latest=cp.attempts.at(-1)!;
 requireDesign(!isDesignAdmission(latest)&&latest.report&&['passed','changes_requested','incomplete'].includes(latest.status)&&latest.publication?.state==='complete','unpublished_review','Latest work is unfinished or unpublished');
 const entry=head.changeLog.find(e=>e.id===latest.publication!.artifactHistoryEntryId);
 requireDesign(entry?.operation==='review'&&(entry.outcome?.data as {kind?:unknown}|undefined)?.kind==='design-chunk-review','unpreserved_review','Permanent review entry is missing');
 const record=validatePermanentDesignReview(entry.outcome!.data,{project,artifactId});
 requireDesign(record.reviewId===cp.reviewId&&record.attempts.length+(record.schemaVersion===2?record.admissionFailures.length:0)===cp.attempts.length&&record.preservationDigest===designPreservationDigest(cp),'unpreserved_review','Full attempt history differs from permanent evidence');
}
/** Deletes only verified private claims. The public checkpoint pathname is never unlinked. */
export async function cleanupDesignArtifact(projectInput:string,artifactId:string,deps:DesignCleanupDeps={}):Promise<CleanupResult>{
 if(!deps.ownerReviewId&&!deps.ownerScope&&!deps.boundary){const owned=await ownedReviewCleanup({project:realpathSync(projectInput),family:'design',artifactId});if(owned)return owned;}
 const result:CleanupResult={deleted:[],retained:[],errors:[]},project=realpathSync(projectInput),root=dirname(designCheckpointPath(project,'cleanup'));
 const retain=(path:string,error:unknown)=>{result.retained.push(path);result.errors.push(`${path}: ${error instanceof Error?error.message:String(error)}`);};
 try{return await withDesignArtifactFence(project,artifactId,async()=>{
  if(designArtifactActive(project,artifactId)){retain(root,'active review');return result;}
  if(!present(root))return result;
  for(const dir of [join(project,'.insrc'),join(project,'.insrc/tmp'),root]){const st=lstatSync(dir);requireDesign(st.isDirectory()&&!st.isSymbolicLink()&&realpathSync(dir)===dir,'unsafe_cleanup','Checkpoint parent must be canonical');}
  const store=deps.store??createRepoLifecycle(project).store;
  async function finish(dir:string,c:Claim):Promise<void>{
   const claimed=join(dir,'checkpoint.json');
   if(c.state==='quarantine'){retain(claimed,'quarantined claim requires inspection');return;}
   if(!present(claimed)){retain(dir,'claim has no checkpoint; public pathname left untouched');return;}
   try{
    const got=bounded(claimed,DESIGN_LIMITS.checkpointBytes);
    requireDesign(got.ino===c.ino&&got.dev===c.dev&&digest(got.bytes)===c.digest,'changed_claim','Claimed bytes changed or were replaced');
    const cp=decode(got.bytes,project,c.reviewId);await preserved(project,artifactId,cp,store);
    await persistReviewResourceAudit(store,artifactId,{project,family:'design',reviewId:cp.reviewId},cp.attempts.flatMap(a=>'resourceGuard'in a&&a.resourceGuard?[{attempt:a.number,resourceGuard:a.resourceGuard}]:[]));
    await deps.boundary?.('beforeDelete',c.source,claimed);
    await preserved(project,artifactId,cp,store);
    const final=bounded(claimed,DESIGN_LIMITS.checkpointBytes);requireDesign(final.ino===got.ino&&final.dev===got.dev&&final.bytes.equals(got.bytes),'changed_claim','Private claim changed before deletion');
    unlinkSync(claimed);syncDirectory(dir);result.deleted.push(c.source);
    // A replacement at the public pathname retains its own replay ownership.
    if(!present(c.source)){try{(deps.onDeleted??releasers.get(project))?.(c.reviewId);}catch(error){result.errors.push(`Replay release failed: ${String(error)}`);}}
    unlinkSync(join(dir,'claim.json'));rmdirSync(dir);syncDirectory(root);
   }catch(error){
    if(!(error instanceof DesignReviewError)&&!['ELOOP','ENOENT'].includes((error as NodeJS.ErrnoException).code??'')){retain(claimed,error);return;}
    c.state='quarantine';saveManifest(dir,c);
    // COPYFILE_EXCL is a no-clobber restore. Keep the private evidence too.
    try{const st=lstatSync(claimed);if(st.isFile()&&!st.isSymbolicLink())copyFileSync(claimed,c.source,constants.COPYFILE_EXCL);}catch{}
    retain(claimed,error);
   }
  }
  const entries=readdirSync(root,{withFileTypes:true});
  for(const entry of entries){
   if(deps.ownerReviewId&&!entry.name.startsWith('.cleanup-')&&entry.name!==`${deps.ownerReviewId}.json`)continue;
   const path=join(root,entry.name);
   if(entry.name.startsWith('.cleanup-')){
    try{
     const st=lstatSync(path);requireDesign(st.isDirectory()&&!st.isSymbolicLink()&&realpathSync(path)===path&&(st.mode&0o077)===0&&(process.getuid===undefined||st.uid===process.getuid()),'unsafe_cleanup','Unsafe private claim directory');
     const c=JSON.parse(bounded(join(path,'claim.json'),8192).bytes.toString('utf8')) as Claim;
     if(c.project!==project||c.artifactId!==artifactId)continue;
     if(deps.ownerReviewId&&c.reviewId!==deps.ownerReviewId)continue;
     requireDesign(c.schemaVersion===1&&c.source===designCheckpointPath(project,c.reviewId)&&/^[a-f0-9]{64}$/.test(c.digest)&&Number.isSafeInteger(c.ino)&&Number.isSafeInteger(c.dev)&&['claimed','quarantine'].includes(c.state),'unsafe_cleanup','Malformed claim metadata');
     await finish(path,c);
    }catch(error){retain(path,error);}continue;
   }
   if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\.json$/.test(entry.name))continue;
   try{
    const got=bounded(path,DESIGN_LIMITS.checkpointBytes),raw=JSON.parse(got.bytes.toString('utf8')) as {project?:unknown;artifactId?:unknown};
    // Identity filter precedes deep validation. Foreign state is never claimed.
    if(raw.project!==project||raw.artifactId!==artifactId){retain(path,'foreign project/artifact');continue;}
    const reviewId=entry.name.slice(0,-5),cp=decode(got.bytes,project,reviewId);await preserved(project,artifactId,cp,store);
    const dir=mkdtempSync(join(root,'.cleanup-'));chmodSync(dir,0o700);
    const c:Claim={schemaVersion:1,project,artifactId,reviewId,source:path,digest:digest(got.bytes),ino:got.ino,dev:got.dev,state:'claimed'};
    saveManifest(dir,c,true);syncDirectory(root);const claimed=join(dir,'checkpoint.json');
    await deps.boundary?.('beforeClaim',path,claimed);renameSync(path,claimed);syncDirectory(dir);syncDirectory(root);
    await deps.boundary?.('afterClaim',path,claimed);await finish(dir,c);
   }catch(error){retain(path,error);}
  }
  return result;
 });}catch(error){retain(root,error);return result;}
}
