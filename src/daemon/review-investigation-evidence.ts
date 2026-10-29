/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { realpathSync } from 'node:fs';
import type { ArtifactStore } from '../workflow/artifact-core/store.js';
import { decodeArtifactHead } from '../workflow/artifact-core/decode.js';
import { checkIntegrity } from '../workflow/artifact-core/lifecycle.js';
import { ArtifactIds } from '../workflow/artifact-ids.js';
import { readReviewSource } from '../workflow/code-review/investigation/source.js';
import { digestValue, freezeValue } from '../workflow/code-review/investigation/identity.js';
import { evidenceFromReceipt, validateAttempt } from '../workflow/code-review/investigation/ledger-evidence.js';
import type { LedgerBasis, TrustedInspectionReceipt } from '../workflow/code-review/investigation/ledger-types.js';
import type { ReviewReadReceiptV1 } from '../workflow/code-review/investigation/types.js';
import type { SubjectPreparationDeps } from '../workflow/code-review/investigation/subject.js';
import type { TestRecordTask } from '../workflow/runners/build/test-record.js';

export interface ProductionEvidenceOptions {
 readonly basis:LedgerBasis; readonly sources:SubjectPreparationDeps; readonly canonical:ArtifactStore;
 readonly assertCurrent:()=>Promise<void>;
}
function reject(message:string):never{throw new Error(`Review evidence refused: ${message}`);}
/** A pass requires actual gate execution, including title/file agreement, not a builder report. */
export function verifiedTaskResult(task:TestRecordTask):'pass'|'fail'|'skipped'|'unknown'{
 const arrays=(v:unknown):boolean=>Array.isArray(v);
 if(!arrays(task.tests)||!arrays(task.files)||!task.tests.length)return 'unknown';
 if(task.files.some(f=>f.timedOut||f.exitCode!==0||f.otherFailures.length||f.titles.some(t=>t.result==='fail')))return 'fail';
 let count=0,skipped=false;
 for(const named of task.tests){
  if(named.reported||named.source==='none')return 'unknown';
  if(named.source==='mapping'){
   if(!named.cases.length)return 'unknown';
   for(const c of named.cases){
    const files=task.files.filter(f=>f.file===c.file),titles=files[0]?.titles.filter(t=>t.title===c.title);
    if(files.length!==1||!titles?.length||titles.some(t=>t.result!==c.result))return 'unknown';
    if(c.result==='fail')return 'fail';if(c.result==='not found')return 'unknown';
    skipped ||= c.result==='skipped';count++;
   }
  }else if(named.source==='prefix'||named.source==='touched'){
   if(!named.files.length)return 'unknown';
   for(const path of named.files){const files=task.files.filter(f=>f.file===path);if(files.length!==1||!files[0]!.titles.length)return 'unknown';
    for(const t of files[0]!.titles){skipped ||= t.result==='skipped';count++;}}
  }else return 'unknown';
 }
 return skipped?'skipped':count&&task.testsPassed?'pass':'unknown';
}
/** Daemon-owned adapter. All evidence derives from canonical records or pinned Git objects. */
export class ProductionEvidenceAdapter {
 constructor(readonly options:ProductionEvidenceOptions){}
 inspect=async(reference:string,attemptId:string,signal:AbortSignal):Promise<{read:ReviewReadReceiptV1;inspection:TrustedInspectionReceipt}>=>{
  signal.throwIfAborted();await this.options.assertCurrent();
  const basis=this.options.basis,s=basis.subject,attempt={runId:basis.runId,subjectDigest:s.subjectDigest,attemptId};validateAttempt(attempt,basis);
  if(Buffer.byteLength(reference)>8192)reject('reference exceeds bound');
  const ref=JSON.parse(reference) as Record<string,unknown>;
  if(!ref||typeof ref!=='object'||Array.isArray(ref))reject('invalid reference');
  let read:ReviewReadReceiptV1,fields:Omit<TrustedInspectionReceipt,'receiptId'|'attempt'>;
  if(ref['kind']==='test-result'){
   // TESTS is a canonical Story record, not an approved PLAN. Planless builds
   // have recorded task ids too; membership is verified against TESTS below.
   if(Object.keys(ref).sort().join(',')!=='kind,taskId'||typeof ref['taskId']!=='string'||!ref['taskId'].trim()||ref['taskId'].length>128)reject('invalid recorded test task');
   const key=ArtifactIds.parse(s.build.artifactId);if(!key)reject('invalid BUILD identity');
   const id=`TESTS-${key.epicHash}-${s.storyId}`,head=await this.options.canonical.readHeadSnapshot(id);if(!head)reject('TESTS record missing');
   if(typeof head.head.meta['repoPath']!=='string'||realpathSync(head.head.meta['repoPath'])!==realpathSync(this.options.sources.repoPath))reject('foreign TESTS repository');
   const decoded=decodeArtifactHead(id,JSON.stringify(head.head)).artifact;
   if(!checkIntegrity({description:decoded.description,payload:decoded.payload,lifecycle:decoded.lifecycle},await this.options.canonical.history.log(id)).ok)reject('TESTS integrity mismatch');
   const tasks=head.head.body['tasks'];if(!Array.isArray(tasks))reject('malformed TESTS record');
   const matching=tasks.filter(t=>t?.taskId===ref['taskId']);if(matching.length!==1)reject('missing or ambiguous TESTS task');
   const task=matching[0] as TestRecordTask;
   const pinned=task.commit===s.build.sourceCommit,result=pinned?verifiedTaskResult(task):'unknown';
   const text=JSON.stringify({artifactId:id,revision:head.revision,sourceCommit:task.commit??null,taskId:task.taskId,result,task});
   if(Buffer.byteLength(text)>1024*1024)reject('TESTS inspection exceeds bound');
   const limitations=pinned&&result!=='unknown'?[]:[pinned?'No conclusive actual gate execution.':'TESTS execution is not pinned to BUILD source.'];
   read={reference,sourceDigest:digestValue(head.head),contentRef:`test:${id}@${head.revision}#${head.digest}/${task.taskId}`,text,lines:null,completeness:limitations.length?'partial':'complete',limitations};
   fields={kind:'test-result',source:{path:`.insrc/artifacts/${id}.json`,revision:s.build.sourceCommit,digest:read.sourceDigest,lines:null},role:'context-only',completeness:read.completeness,limitations,contentRef:read.contentRef,readReceipt:null,blockId:null,artifactId:id,testResult:result,index:null};
  }else{
   read=await readReviewSource(s,reference,{},this.options.sources);
   if(read.completeness==='complete'&&!read.lines)read={...read,completeness:'partial',limitations:['Empty source has no inspected textual range.']};
   let path:string,revision:string,blockId:string|null=null,artifactId:string|null=null;
   if(ref['kind']==='artifact'){
    const pin=s.contracts.find(p=>p.artifactId===ref['artifactId']);if(!pin)reject('artifact outside subject');path=pin.path;revision=String(pin.revision);artifactId=pin.artifactId;
   }else if(ref['kind']==='context'){path=String(ref['path']);revision=s.build.sourceCommit;}
   else{
    const matches=s.packets.flatMap(p=>p.blocks.flatMap(b=>[
     {blob:b.oldBlob,path:b.oldPath,lines:b.oldLines,revision:p.parentId,blockId:b.blockId},
     {blob:b.newBlob,path:b.newPath,lines:b.newLines,revision:p.commitId,blockId:b.blockId}
    ])).filter(x=>x.blob===ref['oid']&&x.path&&(!read.lines||x.lines&&read.lines[0]>=x.lines[0]&&read.lines[1]<=x.lines[1]));
    if(matches.length!==1)reject('blob inspection must identify one exact selected changed span; use context for surrounding code');
    const side=matches[0]!;path=side.path!;revision=side.revision;blockId=side.blockId;
   }
   fields={kind:artifactId?'artifact':blockId?'changed-block':'context-source',source:{path,revision,digest:read.sourceDigest,lines:read.lines},role:blockId?'changed-scope':'context-only',completeness:read.completeness,limitations:read.limitations,contentRef:read.contentRef,readReceipt:read,blockId,artifactId,testResult:null,index:null};
  }
  signal.throwIfAborted();await this.options.assertCurrent();signal.throwIfAborted();
  const inspection=freezeValue({...fields,attempt,receiptId:`inspection-${digestValue({attempt,fields})}`});
  evidenceFromReceipt(basis,inspection);return freezeValue({read,inspection});
 };
}
