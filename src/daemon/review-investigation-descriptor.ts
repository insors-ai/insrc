/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { constants,openSync,closeSync,fsyncSync,mkdirSync,lstatSync,readFileSync,writeFileSync,realpathSync,linkSync,unlinkSync,fstatSync,readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PRODUCTION_REVIEW_RUNTIME_PATH } from '../shared/review-runtime-paths.js';
import { digestValue, snapshotValue } from '../workflow/code-review/investigation/identity.js';
import { recoveryId } from '../workflow/code-review/investigation/recovery-types.js';
import { ReviewIntegrationError,parseReviewInvestigationCommand } from '../shared/review-investigation.js';
import type { ReviewInvestigationCommand } from '../shared/review-investigation.js';
export type InvestigationStart=Extract<ReviewInvestigationCommand,{operation:'start'}>;
export interface ProductionReviewDescriptor {
 readonly version:1;readonly engine:'plan-investigation-v1';readonly adapterVersion:1;
 readonly repoId:string;readonly repoPath:string;readonly runId:string;readonly requestDigest:string;
 readonly start:InvestigationStart;readonly manifestRef:string;readonly manifestDigest:string;
 readonly subjectDigest:string;readonly policyDigest:string;readonly backendDigest:string;
 readonly authorParty:'controller'|'daemon';readonly reviewerParty:'controller'|'daemon';
}
export function productionRunId(repoId:string,requestId:string):string{return digestValue({repoId,requestId});}
function sync(path:string){const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{fsyncSync(fd);}finally{closeSync(fd);}}
/** Immutable discovery only. Accepted state always comes from RecoveryStore's journal. */
export class ProductionDescriptorStore {
 readonly repoPath:string;readonly directory:string;
 constructor(repoPath:string,private readonly guard:()=>void){
  this.repoPath=realpathSync(repoPath);this.directory=join(this.repoPath,PRODUCTION_REVIEW_RUNTIME_PATH);this.check(true);
  for(const name of readdirSync(this.directory))if(/^temp-[a-f0-9-]{36}$/.test(name)){
   const path=join(this.directory,name),stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw Error('Unsafe descriptor temporary');this.guard();unlinkSync(path);
  }
  sync(this.directory);
 }
 private check(create=false){
  this.guard();let path=this.repoPath;
  for(const [i,part] of PRODUCTION_REVIEW_RUNTIME_PATH.split('/').entries()){
   const parent=path;path=join(path,part);
   if(create)try{mkdirSync(path,{mode:0o700});sync(parent);}catch(cause){if((cause as NodeJS.ErrnoException).code!=='EEXIST')throw cause;}
   const stat=lstatSync(path);if(!stat.isDirectory()||stat.isSymbolicLink()||i>=2&&(stat.mode&0o077)!==0)throw Error('Unsafe production review directory');
  }
 }
 read(runId:string):ProductionReviewDescriptor|null{
  recoveryId(runId);this.check();let fd:number;
  try{fd=openSync(join(this.directory,`${runId}.json`),constants.O_RDONLY|constants.O_NOFOLLOW);}catch(cause){if((cause as NodeJS.ErrnoException).code==='ENOENT')return null;throw cause;}
  try{
   const stat=fstatSync(fd);if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077)!==0||stat.size>1024*1024)throw Error('Unsafe production descriptor');
   const raw=JSON.parse(readFileSync(fd,'utf8')) as {descriptor:ProductionReviewDescriptor;digest:string};
   const d=raw.descriptor,start=parseReviewInvestigationCommand(d.start);
   if(d.version!==1||d.engine!=='plan-investigation-v1'||d.adapterVersion!==1||start.operation!=='start'||d.runId!==runId
    ||d.repoPath!==this.repoPath||d.repoId!==start.repoId||realpathSync(start.repo)!==this.repoPath
    ||productionRunId(d.repoId,start.requestId)!==runId||d.requestDigest!==digestValue(start)||raw.digest!==digestValue(d)
    ||!d.manifestRef.startsWith(`${runId}/`)||d.manifestRef!==`${runId}/${d.manifestDigest}`
    ||!['controller','daemon'].includes(d.authorParty)||!['controller','daemon'].includes(d.reviewerParty)||d.authorParty===d.reviewerParty
    ||![d.subjectDigest,d.policyDigest,d.backendDigest,d.manifestDigest].every(v=>/^[a-f0-9]{64}$/.test(v)))throw new ReviewIntegrationError('identity-conflict','Invalid production descriptor binding');
   this.check();return snapshotValue(d);
  }finally{closeSync(fd);}
 }
 install(descriptor:ProductionReviewDescriptor):ProductionReviewDescriptor{
  recoveryId(descriptor.runId);this.check();
  const temp=join(this.directory,`temp-${randomUUID()}`),target=join(this.directory,`${descriptor.runId}.json`);
  const fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{const text=JSON.stringify({descriptor,digest:digestValue(descriptor)});if(Buffer.byteLength(text)>1024*1024)throw Error('Descriptor exceeds bound');writeFileSync(fd,text);fsyncSync(fd);this.check();
   try{linkSync(temp,target);}catch(cause){if((cause as NodeJS.ErrnoException).code!=='EEXIST')throw cause;}
  }finally{closeSync(fd);unlinkSync(temp);}
  sync(this.directory);const actual=this.read(descriptor.runId)!;
  if(digestValue(actual)!==digestValue(descriptor))throw new ReviewIntegrationError('identity-conflict','Conflicting production admission');return actual;
 }
}
