/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { resolve, relative } from 'node:path';
import { findEntitiesByFile } from '../db/entities.js';
import { findCallers, resolveClosure } from '../db/search.js';
import { readIndexState } from '../db/index-state.js';
import type { Entity } from '../shared/types.js';
import { readReviewSource, sourceReference } from '../workflow/code-review/investigation/source.js';
import { digestValue, freezeValue } from '../workflow/code-review/investigation/identity.js';
import { evidenceFromReceipt, validateAttempt } from '../workflow/code-review/investigation/ledger-evidence.js';
import type { LedgerBasis, EvidenceV1, TrustedInspectionReceipt } from '../workflow/code-review/investigation/ledger-types.js';
import type { ImpactCapabilityV1 } from '../workflow/code-review/investigation/continuation-types.js';
import type { SubjectPreparationDeps } from '../workflow/code-review/investigation/subject.js';

/** Trusted daemon seams, never a client-supplied graph or completeness assertion. */
export interface ReviewImpactGraph {
 state:()=>Promise<{revision:string;completeness:'partial'|'unknown'}>;
 entities:(file:string)=>Promise<readonly Entity[]>;
 callers:(id:string)=>Promise<readonly Entity[]>;
 closure:()=>Promise<readonly string[]>;
}
export function daemonReviewImpactGraph(repoPath:string):ReviewImpactGraph{
 return {state:async()=>{const s=await readIndexState(repoPath);return {revision:s?`generation-${s.generation}-${digestValue(s)}`:'unavailable',completeness:s?'partial':'unknown'};},
  entities:file=>findEntitiesByFile(null,file),callers:id=>findCallers(null,id),closure:()=>resolveClosure(null,repoPath)};
}
export interface ProductionImpactOptions {
 readonly basis:LedgerBasis;readonly sources:SubjectPreparationDeps;readonly graph:ReviewImpactGraph;
 readonly mode:'source-only'|'indexed-impact';readonly attemptId:string;readonly signal:AbortSignal;
 readonly assertCurrent:()=>Promise<void>;
}
/** Only selected new-side entities with matching pinned file hash AND source body are queryable.
 * The graph has no commit-wide snapshot guarantee, so caller discovery always remains partial. */
export async function productionImpactAdapter(o:ProductionImpactOptions){
 const mapped=new Map<string,{blockId:string;sourceDigest:string}>(),receipts=new Map<string,TrustedInspectionReceipt>();
 const changedEntity=(ref:string)=>mapped.get(ref)??null;
 const impactReceipts=(values:readonly EvidenceV1[])=>values.map(v=>{const r=receipts.get(v.evidenceId);if(!r)throw Error('Unknown native caller receipt');return r;});
 if(o.mode==='source-only')return {impact:{mode:'source-only',index:null,queryChangedEntityCallers:null} satisfies ImpactCapabilityV1,changedEntity,impactReceipts,entityReferences:[] as readonly string[]};
 const s=o.basis.subject,attempt={runId:o.basis.runId,subjectDigest:s.subjectDigest,attemptId:o.attemptId};validateAttempt(attempt,o.basis);
 const check=async()=>{o.signal.throwIfAborted();await o.assertCurrent();o.signal.throwIfAborted();};await check();
 const state=await o.graph.state(),closure=new Set((await o.graph.closure()).map(p=>resolve(p)));
 if(!closure.has(resolve(o.sources.repoPath)))throw Error('Registered dependency closure excludes active repository');
 const paths=[...new Set(s.packets.flatMap(p=>p.blocks.filter(b=>p.commitId===s.build.sourceCommit&&b.newPath&&b.newLines).map(b=>b.newPath!)))];
 for(const path of paths){
  const full=await readReviewSource(s,sourceReference({kind:'context',path,start:1,end:1}),{},o.sources);
  const entities=await o.graph.entities(resolve(o.sources.repoPath,path));
  const files=entities.filter(e=>e.kind==='file'&&resolve(e.repo)===resolve(o.sources.repoPath)&&resolve(e.file)===resolve(o.sources.repoPath,path));
  if(files.length!==1||files[0]!.hash!==full.sourceDigest.slice(0,16))continue;
  for(const e of entities){
   if(e.kind==='file'||resolve(e.repo)!==resolve(o.sources.repoPath)||resolve(e.file)!==resolve(o.sources.repoPath,path)
    ||!e.body.trim()||e.body.length>1024*1024||!Number.isSafeInteger(e.startLine)||!Number.isSafeInteger(e.endLine)||e.startLine<1||e.endLine<e.startLine||e.endLine-e.startLine>=500)continue;
   const blocks=s.packets.flatMap(p=>p.commitId===s.build.sourceCommit?p.blocks:[]).filter(b=>b.newPath===path&&b.newLines&&e.startLine<=b.newLines[1]&&e.endLine>=b.newLines[0]);
   if(blocks.length!==1)continue;
   const read=await readReviewSource(s,sourceReference({kind:'context',path,start:e.startLine,end:e.endLine}),{},o.sources);
   // Parser bodies may exclude indentation surrounding the node, never source inside it.
   if(read.completeness!=='complete'||read.sourceDigest!==full.sourceDigest||read.text?.trim()!==e.body.trim())continue;
   mapped.set(e.id,{blockId:blocks[0]!.blockId,sourceDigest:full.sourceDigest});
  }
 }
 await check();if(digestValue(await o.graph.state())!==digestValue(state))throw Error('Index changed during entity qualification');
 const impact:ImpactCapabilityV1={mode:'indexed-impact',index:{revision:state.revision,freshness:'unknown',completeness:state.completeness},queryChangedEntityCallers:async(ref:string)=>{
  await check();if(!mapped.has(ref))throw Error('Entity is not qualified selected scope');
  if(digestValue(await o.graph.state())!==digestValue(state))throw Error('Index changed after qualification');
  if(digestValue([...(await o.graph.closure())].map(p=>resolve(p)).sort())!==digestValue([...closure].sort()))throw Error('Registered dependency closure changed');
  const callers=await o.graph.callers(ref),allowed=callers.filter(e=>closure.has(resolve(e.repo)));
  // Bounded structural summaries are discovery only, never complete source inspections.
  const summaries=allowed.slice(0,100).map(e=>({entityId:e.id.slice(0,512),name:e.name.slice(0,512),repo:e.repo.slice(0,4096),path:relative(e.repo,e.file).slice(0,4096),startLine:e.startLine,endLine:e.endLine}));
  await check();if(digestValue(await o.graph.state())!==digestValue(state))throw Error('Index changed during caller lookup');
  const limitations=['Caller graph completeness and commit freshness are not established. Empty results do not prove no impact.',
   'Caller summaries require separate pinned source inspection; dependency source is not part of the root context tree.',...(allowed.length>100?['Caller results truncated to 100.']:[])];
  const data={entityRef:ref,index:state,summaries,totalWithinClosure:allowed.length},digest=digestValue(data);
  const native:TrustedInspectionReceipt=freezeValue({receiptId:`caller-${digestValue({attempt,data})}`,attempt,kind:'caller-impact',
   source:{path:`caller-query/${ref}`,revision:s.build.sourceCommit,digest,lines:null},role:'context-only',completeness:'partial',limitations,
   contentRef:`caller-discovery:${digest}:${JSON.stringify(summaries)}`,readReceipt:null,blockId:mapped.get(ref)!.blockId,artifactId:null,testResult:null,
   index:{sourceCommit:s.build.sourceCommit,indexId:state.revision,freshness:'unknown',coverage:state.completeness}});
  const value=evidenceFromReceipt(o.basis,native);receipts.set(value.evidenceId,native);return [value];
 }};
 return {impact,changedEntity,impactReceipts,entityReferences:freezeValue([...mapped.keys()])};
}
