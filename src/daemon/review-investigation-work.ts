/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { realpathSync } from 'node:fs';
import { ArtifactIds } from '../workflow/artifact-ids.js';
import { decodeArtifactHead } from '../workflow/artifact-core/decode.js';
import { checkIntegrity } from '../workflow/artifact-core/lifecycle.js';
import { approvalStateOf } from '../workflow/artifact-core/approval-view.js';
import type { ArtifactStore, HeadSnapshot } from '../workflow/artifact-core/store.js';
import { readApprovedWork } from '../workflow/code-review/investigation/work.js';
import type { VerifiedWorkArtifact, VerifiedWorkInputs } from '../workflow/code-review/investigation/work.js';
import { SubjectPreparationError } from '../workflow/code-review/investigation/types.js';
import type { ApprovedWorkSnapshot, PrepareReviewRequest, ScopeAttestation } from '../workflow/code-review/investigation/types.js';
import { digestValue, snapshotValue } from '../workflow/code-review/investigation/identity.js';
import { assertOid } from '../workflow/code-review/investigation/git-packets.js';
import { renderDefineMarkdown, isDefineBody } from '../workflow/artifacts/define.js';
import { renderHldMarkdown, isHldBody } from '../workflow/artifacts/hld.js';
import { renderLldMarkdown, isLldBody } from '../workflow/artifacts/lld.js';
import { renderPlanMarkdown, isPlanBody } from '../workflow/artifacts/plan.js';
import { renderIssueMarkdown, isIssueBody } from '../workflow/artifacts/issue.js';
import { renderSpecMarkdown, isSpecBody } from '../workflow/artifacts/spec.js';

export interface CanonicalReviewWorkOptions {
 readonly repoId:string; readonly repoPath:string; readonly canonical:ArtifactStore;
 /** Rechecks the daemon registry; it must never allocate membership. */
 readonly assertRegistered:()=>Promise<void>;
}
function fail(message:string):never{throw new SubjectPreparationError('unapproved-contract',message);}
function renderCanonical(id:string,head:HeadSnapshot['head']):string{
 const kind=ArtifactIds.parse(id)?.kind;
 const guards={DEF:isDefineBody,HLD:isHldBody,LLD:isLldBody,PLAN:isPlanBody,ISSUE:isIssueBody,SPEC:isSpecBody};
 const guard=guards[kind as keyof typeof guards];
 if(!guard||!guard(head.body))throw new SubjectPreparationError('invalid-input','Malformed canonical contract body.');
 // Codecs establish identity; these existing renderers determine the exact canonical contract text.
 switch(kind){
  case 'DEF':return renderDefineMarkdown(head as unknown as Parameters<typeof renderDefineMarkdown>[0]);
  case 'HLD':return renderHldMarkdown(head as unknown as Parameters<typeof renderHldMarkdown>[0]);
  case 'LLD':return renderLldMarkdown(head as unknown as Parameters<typeof renderLldMarkdown>[0]);
  case 'PLAN':return renderPlanMarkdown(head as unknown as Parameters<typeof renderPlanMarkdown>[0]);
  case 'ISSUE':return renderIssueMarkdown(head as unknown as Parameters<typeof renderIssueMarkdown>[0]);
  case 'SPEC':return renderSpecMarkdown(head as unknown as Parameters<typeof renderSpecMarkdown>[0]);
  default:throw new SubjectPreparationError('invalid-input','Unsupported approved review contract kind.');
 }
}
/** Existing approved ISSUE tracking records can carry explicit scope evidence without a new artifact kind.
 * Their fixIntent is JSON {kind:'review-scope-v1',attestations:[...proof fields excluding ref]}.
 * The canonical approval covers this exact content/revision; caller approval flags are never read. */
export function approvedScopeReference(artifactId:string,revision:number,proof:Omit<ScopeAttestation,'ref'>):string{
 return `scope:${artifactId}@${revision}#${digestValue(proof)}`;
}
export class CanonicalReviewWorkAdapter {
 readonly repoPath:string;
 constructor(readonly options:CanonicalReviewWorkOptions){this.repoPath=realpathSync(options.repoPath);}
 private async head(id:string):Promise<HeadSnapshot|null>{
  await this.options.assertRegistered();
  const head=await this.options.canonical.readHeadSnapshot(id);if(!head)return null;
  if(typeof head.head.meta['repoPath']!=='string'||realpathSync(head.head.meta['repoPath'])!==this.repoPath)throw new SubjectPreparationError('invalid-input','Canonical record belongs to another repository.');
  const a=decodeArtifactHead(id,JSON.stringify(head.head)).artifact;
  const integrity=checkIntegrity({description:a.description,payload:a.payload,lifecycle:a.lifecycle},await this.options.canonical.history.log(id));
  if(!integrity.ok)throw new SubjectPreparationError('stale-contract',`Canonical contract integrity failed: ${integrity.reason}.`);
  return head;
 }
 /** Canonical non-approvable records (BUILD/TESTS) still require repository and history integrity. */
 readCanonicalHead=(id:string):Promise<HeadSnapshot|null>=>this.head(id);
 async approved(id:string,request:PrepareReviewRequest):Promise<VerifiedWorkArtifact>{
  const head=await this.head(id);if(!head)fail(`Missing approved contract ${id}.`);
  const key=ArtifactIds.parse(id),root=ArtifactIds.parse(request.rootArtifactId);
  if(!key||!root||key.epicHash!==root.epicHash||(key.story!==undefined&&key.story!==request.storyId))throw new SubjectPreparationError('invalid-input','Contract identity differs from requested work.');
  const a=decodeArtifactHead(id,JSON.stringify(head.head)).artifact;
  if(approvalStateOf(head.head.meta)!=='approved'||a.lifecycle.stale||a.lifecycle.approval?.revision!==head.revision)fail(`Contract ${id} is not approved at its current revision.`);
  let text:string;try{text=renderCanonical(id,head.head);}catch(cause){throw new SubjectPreparationError('invalid-input','Canonical contract cannot be rendered.',{cause});}
  return {artifactId:id,path:`.insrc/artifacts/${id}.json`,revision:head.revision,contentDigest:digestValue({body:head.head.body,citations:head.head.citations??[],text}),
   repoId:this.options.repoId,rootArtifactId:request.rootArtifactId,storyId:key.story??null,status:'approved',approvedRevision:head.revision,body:head.head.body,text};
 }
 async readVerifiedInputs(request:PrepareReviewRequest):Promise<VerifiedWorkInputs>{
  if(request.repoId!==this.options.repoId)throw new SubjectPreparationError('invalid-input','Repository identity mismatch.');
  const root=ArtifactIds.parse(request.rootArtifactId),buildKey=ArtifactIds.parse(request.buildArtifactId);
  if(!root||!['DEF','ISSUE','SPEC','LLD'].includes(root.kind)||!buildKey||buildKey.kind!=='BUILD'
   ||buildKey.epicHash!==root.epicHash||buildKey.story!==request.storyId)throw new SubjectPreparationError('invalid-input','Root/BUILD identity mismatch.');
  const build=await this.head(request.buildArtifactId);if(!build)throw new SubjectPreparationError('invalid-input','Canonical BUILD is missing.');
  const sourceCommit=build.head.body['commit'];if(typeof sourceCommit!=='string')throw new SubjectPreparationError('invalid-input','BUILD has no pinned source commit.');assertOid(sourceCommit);
  const tasks=build.head.body['tasks'];
  if(tasks!==undefined&&(!Array.isArray(tasks)||!tasks.length||tasks.some(t=>!t||typeof t!=='object'||t.passed!==true)))throw new SubjectPreparationError('invalid-input','BUILD task validation is incomplete.');
  const upstream:VerifiedWorkArtifact[]=[await this.approved(request.rootArtifactId,request)];
  if(root.kind==='DEF')upstream.push(await this.approved(`HLD-${root.epicHash}`,request));
  const lldId=`LLD-${root.epicHash}-${request.storyId}`;
  if(lldId!==request.rootArtifactId&&await this.head(lldId))upstream.push(await this.approved(lldId,request));
  const planId=`PLAN-${root.epicHash}-${request.storyId}`;
  const plan=await this.head(planId)?await this.approved(planId,request):null;
  return {build:{artifactId:request.buildArtifactId,revision:build.revision,sourceCommit,repoId:this.options.repoId,rootArtifactId:request.rootArtifactId,storyId:request.storyId},
   route:plan?'planned':'approved-upstream',plan,upstream};
 }
 readWork=(request:PrepareReviewRequest):Promise<ApprovedWorkSnapshot>=>readApprovedWork(request,this);
 async assertFresh(work:ApprovedWorkSnapshot):Promise<void>{
  const current=await this.readWork({repoId:work.repoId,rootArtifactId:work.rootArtifactId,storyId:work.storyId,buildArtifactId:work.build.artifactId,selections:[]});
  if(digestValue(current)!==digestValue(work))throw new SubjectPreparationError('stale-contract','Canonical approved work or rendered contract changed.');
 }
 /** A scope reference names an independently approved canonical tracking artifact, never a filesystem path. */
 async readAttestation(reference:string,request:PrepareReviewRequest):Promise<ScopeAttestation>{
  const match=/^scope:(ISSUE-[a-f0-9]{16})@([1-9][0-9]*)#([a-f0-9]{64})$/.exec(reference);
  if(!match)throw new SubjectPreparationError('ambiguous-attribution','Explicit approved scope reference is required; commit trailers are insufficient.');
  const id=match[1]!,head=await this.head(id);if(!head||head.revision!==Number(match[2]))fail('Approved scope revision changed or is missing.');
  const a=decodeArtifactHead(id,JSON.stringify(head.head)).artifact;
  if(approvalStateOf(head.head.meta)!=='approved'||a.lifecycle.stale||a.lifecycle.approval?.revision!==head.revision)fail('Scope evidence is not approved at its current revision.');
  let envelope:{kind?:unknown;attestations?:unknown};
  try{envelope=JSON.parse(String(head.head.body['fixIntent']));}catch{throw new SubjectPreparationError('ambiguous-attribution','Scope tracking record has no structured proof.');}
  if(envelope.kind!=='review-scope-v1'||!Array.isArray(envelope.attestations))throw new SubjectPreparationError('ambiguous-attribution','Unsupported scope evidence record.');
  const proof=envelope.attestations.find(p=>digestValue(p)===match[3]) as Omit<ScopeAttestation,'ref'>|undefined;
  const work=await this.readWork(request);
  if(!proof||proof.rootArtifactId!==request.rootArtifactId||proof.storyId!==request.storyId||proof.buildArtifactId!==request.buildArtifactId
   ||proof.sourceCommit!==work.build.sourceCommit)throw new SubjectPreparationError('ambiguous-attribution','Approved proof belongs to another scope or BUILD source.');
  return snapshotValue({...proof,ref:reference});
 }
}
