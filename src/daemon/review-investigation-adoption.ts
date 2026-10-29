/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { checkIntegrity } from '../workflow/artifact-core/lifecycle.js';
import { decodeArtifactHead } from '../workflow/artifact-core/decode.js';
import { constants,openSync,closeSync,readFileSync,fstatSync,readdirSync,realpathSync } from 'node:fs';
import { join,delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from 'node:crypto';
import { PATHS } from '../shared/paths.js';
import { ReviewIntegrationError } from '../shared/review-investigation.js';
import { scopedReviewCatalogDigest } from '../shared/review-investigation-catalog.js';
import { InvestigationReplySchema } from '../shared/review-investigation.js';
import { approvalStateOf } from '../workflow/artifact-core/approval-view.js';
import { ArtifactIds } from '../workflow/artifact-ids.js';
import { digestValue,snapshotValue } from '../workflow/code-review/investigation/identity.js';
import { createInvestigationPolicy } from '../workflow/code-review/investigation/continuation-policy.js';
import { CanonicalReviewWorkAdapter } from './review-investigation-work.js';
import { createRoleRouter } from '../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { qualifyInvestigationAdapter,investigationFileDigest,createQualifiedInvestigationBinding,drainInvestigationInvocation } from '../agent/providers/investigation-session.js';
import type { NativeIsolationEvidence,NativeAdapterIdentity,NativeInvestigationQualification } from '../agent/providers/investigation-session.js';
import { claudeInvestigationArgs,claudeInvestigationLaunchDigest,CLAUDE_INVESTIGATION_ADAPTER } from '../agent/providers/claude-investigation-session.js';
import { codexInvestigationArgs,codexInvestigationLaunchDigest,CODEX_INVESTIGATION_ADAPTER } from '../agent/providers/codex-investigation-session.js';
import type { InvestigationDaemonAdapter,InvestigationRepositoryOptions } from './review-investigation-repository.js';
import type { QualifiedInvestigationSessionBinding,StructuredSchema } from '../shared/types.js';
import type { HeadSnapshot } from '../workflow/artifact-core/store.js';

const text=z.string().min(1).max(4096),digest=z.string().regex(/^[a-f0-9]{64}$/),oid=z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
export const readinessSchema=z.object({version:z.literal(1),kind:z.literal('review-investigation-readiness'),wire:z.literal(1),canonical:z.literal(1),
 sourceCommit:oid,sourceDigest:digest,evaluationRef:text,backendRefs:z.object({'source-only':text,'indexed-impact':text}).strict()}).strict();
const probeSchema=z.object({version:z.literal(1),kind:z.literal('review-investigation-installed-probe'),origin:z.literal('installed-probe'),evidence:z.unknown(),signature:z.string().min(1).max(4096)}).strict();
const evaluationSchema=z.object({version:z.literal(1),kind:z.literal('review-investigation-evaluation'),sourceCommit:oid,sourceDigest:digest,profileDigest:digest,policyDigest:digest,catalogDigest:digest,
 fixtureVersion:text,oracleDigest:digest,adjudicationRef:text,requiredDefects:z.array(text).min(1),foundDefects:z.array(text),requiredCoverage:z.array(text).min(1),covered:z.array(text),
 missingEvidence:z.array(text),liveEvidence:z.literal(false),defaultReplacement:z.literal(false)}).strict();
export const PREDECESSOR_EPIC='8315a11f29fd2812';
export const RECONCILIATION_CLAUSE='For explicit plan-investigation-v1 CODE reviews only, Epic c32aa60534232f36 supersedes predecessor S002/S003 chunk/gather and S005 new CODE-review controller frames. Legacy and pre-S005 saved states retain their original adapters; DEF/HLD/LLD and all other design reviews retain the predecessor pipeline. No automatic migration, default flip or live quality/token-savings claim. Adoption requires current readiness evidence and independent installed-backend qualification; rollback disables new turns, drains active attempts, and preserves status, cancel, usage, accepted receipts and frozen publication reconciliation.';
function refuse(message:string):never{throw new ReviewIntegrationError('not-ready',message);}
export function approvedEvidenceReference(id:string,head:HeadSnapshot):string{return `approved:${id}@${head.revision}#${digestValue({body:head.head.body,citations:head.head.citations??[]})}`;}
export async function readApprovedEvidence(work:CanonicalReviewWorkAdapter,reference:string){
 const match=/^approved:(.+)@([1-9][0-9]*)#([a-f0-9]{64})$/.exec(reference);if(!match||!ArtifactIds.parse(match[1]!))refuse('A versioned canonical approval reference is required');
 const head=await work.readCanonicalHead(match[1]!);if(!head||head.revision!==Number(match[2])||approvalStateOf(head.head.meta)!=='approved'||approvedEvidenceReference(match[1]!,head)!==reference)refuse('Readiness evidence is missing, draft, stale or edited');
 const lifecycle=decodeArtifactHead(match[1]!,JSON.stringify(head.head)).artifact.lifecycle;if(lifecycle.stale||lifecycle.approval?.revision!==head.revision)refuse('Evidence approval does not cover its current revision');
 if(Buffer.byteLength(JSON.stringify(head.head))>1024*1024)refuse('Readiness evidence exceeds its bound');return head;
}
/** Historical engine governance records can retain the checkout path where
 * authored. Bind this one known predecessor to the current canonical store and
 * audited history; never rewrite its metadata or relax review subject readers. */
async function readPredecessorHld(work:CanonicalReviewWorkAdapter){
 await work.options.assertRegistered();const id=`HLD-${PREDECESSOR_EPIC}`,head=await work.options.canonical.readHeadSnapshot(id);if(!head)return null;
 const artifact=decodeArtifactHead(id,JSON.stringify(head.head)).artifact,integrity=checkIntegrity({description:artifact.description,payload:artifact.payload,lifecycle:artifact.lifecycle},await work.options.canonical.history.log(id));
 if(!integrity.ok||artifact.lifecycle.stale||approvalStateOf(head.head.meta)!=='approved'||artifact.lifecycle.approval?.revision!==head.revision)refuse('Predecessor HLD lacks current audited approval');return head;
}
function issueData(head:HeadSnapshot):unknown{const raw=head.head.body['fixIntent'];if(typeof raw!=='string')refuse('Readiness reports must be canonical tracked ISSUE content');try{return JSON.parse(raw);}catch{refuse('Malformed readiness report');}}
/** Source fingerprint includes the implementation under the running daemon,
 * rather than the unrelated project being reviewed. Tests/evaluation outputs
 * are separate pins and do not create a self-referential source digest. */
export function investigationSourceDigest(root=fileURLToPath(new URL('../../',import.meta.url))):string{
 const files:string[]=[];
 const walk=(path:string)=>{for(const e of readdirSync(join(root,path),{withFileTypes:true})){const file=`${path}/${e.name}`;if(e.isSymbolicLink())refuse('Engine source manifest contains a symlink');if(e.isDirectory()){if(e.name!=='__tests__')walk(file);}else if(e.isFile()&&e.name.endsWith('.ts'))files.push(file);}};
 for(const path of ['src/workflow/code-review/investigation','src/workflow/review-pipeline','src/workflow/artifact-core'])walk(path);
 for(const path of ['src/daemon','src/shared','src/agent/providers'])for(const e of readdirSync(join(root,path),{withFileTypes:true}))if(e.isFile()&&e.name.endsWith('.ts')&&(e.name.includes('investigation')||e.name.includes('review')||e.name==='cli-provider.ts'))files.push(`${path}/${e.name}`);
 files.push('package-lock.json','src/prompts/steering-block.md','src/daemon/handler-runtime.ts','src/daemon/steps/code-review-step/handler.ts','src/daemon/threads/method-class.ts','src/mcp/server.ts','src/mcp/review-investigation-bridge.ts','src/mcp/review-investigation-native.ts','src/bin/insrc-review-bridge.ts','src/analyze/context/role-router.ts');
 return digestValue([...new Set(files)].sort().map(path=>({path,digest:investigationFileDigest(join(root,path))})));
}
export function readInvestigationSelection(){
 try{const raw=JSON.parse(readFileSync(PATHS.config,'utf8')) as {codeReview?:{engine?:unknown;investigationReadinessRef?:unknown;predecessorReconciliationRef?:unknown}};return {engine:raw.codeReview?.engine??'legacy',readiness:raw.codeReview?.investigationReadinessRef,reconciliation:raw.codeReview?.predecessorReconciliationRef};}
 catch{return {engine:'legacy',readiness:undefined,reconciliation:undefined};}
}
/** Fixed daemon installation trust anchor. Neither wire packets nor a proposed
 * report can choose a signing key. No keys or credentials are generated/copied. */
export function verifyInstalledProbeSignature(evidence:NativeIsolationEvidence,signature:string,keyPath=join(PATHS.insrc,'review-probe-trust.pem')){
 const fd=openSync(keyPath,constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>16384||(stat.mode&0o022)!==0||(process.getuid&&stat.uid!==process.getuid()))refuse('Unsafe installed-probe trust anchor');const key=readFileSync(fd,'utf8');if(!verify(null,Buffer.from(JSON.stringify(snapshotValue(evidence))),key,Buffer.from(signature,'base64')))refuse('Installed-probe signature did not verify');}finally{closeSync(fd);}
}
export interface InvestigationAdoptionDeps {
 readonly work:CanonicalReviewWorkAdapter;
 readonly selection?:typeof readInvestigationSelection|undefined;
 readonly sourceDigest?:typeof investigationSourceDigest|undefined;
 readonly verifyProbe?:typeof verifyInstalledProbeSignature|undefined;
}
/** Evaluate pins before selecting a provider. No config boolean, fixture result,
 * unsigned CLI claim or draft predecessor record is an activation authority. */
export class InvestigationAdoptionPolicy {
 constructor(private readonly deps:InvestigationAdoptionDeps){}
 assertSelected(){if((this.deps.selection??readInvestigationSelection)().engine!=='plan-investigation-v1')refuse('Investigation scheduling is disabled; legacy remains selected');}
 async evidence(mode:'source-only'|'indexed-impact'){
  this.assertSelected();const selection=(this.deps.selection??readInvestigationSelection)();if(typeof selection.readiness!=='string'||typeof selection.reconciliation!=='string')refuse('Version-pinned readiness and reconciliation approvals are required');
  const readiness=readinessSchema.parse(issueData(await readApprovedEvidence(this.deps.work,selection.readiness)));
  if(!this.deps.sourceDigest){const root=fileURLToPath(new URL('../../',import.meta.url));try{const untracked=execFileSync('git',['ls-files','--others','--exclude-standard','--','src/daemon','src/shared','src/agent/providers','src/workflow/code-review/investigation','src/workflow/review-pipeline','src/workflow/artifact-core','src/mcp'],{cwd:root,encoding:'utf8',timeout:10000});if(untracked.trim())refuse('Engine source contains uncommitted new files');execFileSync('git',['diff','--quiet',readiness.sourceCommit,'--','src/workflow/code-review/investigation','src/workflow/review-pipeline','src/workflow/artifact-core','src/daemon','src/shared','src/agent/providers','src/mcp','src/bin/insrc-review-bridge.ts','src/analyze/context/role-router.ts','package-lock.json'],{cwd:root,stdio:'ignore',timeout:10000});}catch{refuse('Evaluated source commit does not match the running checkout');}}
  if(readiness.sourceDigest!==(this.deps.sourceDigest??investigationSourceDigest)())refuse('Running engine source differs from evaluated source');
  const reconciliation=await readApprovedEvidence(this.deps.work,selection.reconciliation),id=/^approved:(.+)@/.exec(selection.reconciliation)![1]!,key=ArtifactIds.parse(id);
  const amendment=reconciliation.head.body['amendment'] as Record<string,unknown>|undefined;
  if(key?.kind!=='AMD'||key.epicHash!==PREDECESSOR_EPIC||amendment?.['type']!=='nonFunctional.retarget'||amendment['property']!=='performance'||amendment['newTarget']!==RECONCILIATION_CLAUSE)refuse('Approved predecessor code-only reconciliation is required');
  const predecessor=await readPredecessorHld(this.deps.work);const currentPerformance=(predecessor?.head.body['nonFunctional'] as Record<string,unknown>|undefined)?.['performance'];
  if(!predecessor||(currentPerformance!==amendment['oldTarget']&&currentPerformance!==RECONCILIATION_CLAUSE))refuse('Predecessor reconciliation no longer applies to the installed HLD');
  const report=probeSchema.parse(issueData(await readApprovedEvidence(this.deps.work,readiness.backendRefs[mode]))),evidence=snapshotValue(report.evidence) as NativeIsolationEvidence;
  (this.deps.verifyProbe??verifyInstalledProbeSignature)(evidence,report.signature);
  const evaluation=evaluationSchema.parse(issueData(await readApprovedEvidence(this.deps.work,readiness.evaluationRef)));
  if(evaluation.sourceCommit!==readiness.sourceCommit||evaluation.sourceDigest!==readiness.sourceDigest||evaluation.profileDigest!==evidence.identity.profileDigest||evaluation.catalogDigest!==scopedReviewCatalogDigest(mode==='indexed-impact')||evaluation.missingEvidence.length||evaluation.requiredDefects.some(id=>!evaluation.foundDefects.includes(id))||evaluation.requiredCoverage.some(id=>!evaluation.covered.includes(id)))refuse('Evaluation evidence is stale, incomplete or does not preserve required defects/coverage');
  await readApprovedEvidence(this.deps.work,evaluation.adjudicationRef);
  return {readiness,report,evidence,evaluation};
 }
 async adapter(repo:string,mode:'source-only'|'indexed-impact'):Promise<InvestigationDaemonAdapter>{
  const pins=await this.evidence(mode),{provider,resolution}=createRoleRouter({cliTimeoutMs:300000}).resolveProviderForRole('review',loadAnalyzeConfig(),repo);
  if(!provider.runReviewSession||!provider.getReviewBudgetProfile||!['cli-claude','cli-codex'].includes(resolution.runner))refuse('Review role has no independently qualified native investigation backend');
  const kind=resolution.runner==='cli-claude'?'claude':'codex',profile=provider.getReviewBudgetProfile('reviewer-session'),policy=createInvestigationPolicy(provider);
  if(pins.evaluation.policyDigest!==policy.digest)refuse('Evaluated review policy changed');
  const cwd=pins.evidence.effective.cwd,schema=JSON.parse(JSON.stringify(InvestigationReplySchema)) as StructuredSchema,modelArgs=['--model',resolution.model,...(resolution.effort?(kind==='claude'?['--effort',resolution.effort]:['-c',`model_reasoning_effort=${resolution.effort}`]):[])];
  const args=kind==='claude'?claudeInvestigationArgs(schema,modelArgs,cwd,mode==='indexed-impact'):codexInvestigationArgs(schema,modelArgs,cwd,mode==='indexed-impact');
  let binary:string|undefined;for(const dir of (process.env['PATH']??'').split(delimiter))try{binary=realpathSync(join(dir,kind));break;}catch{/* Continue installed PATH lookup. */}if(!binary)refuse('Qualified CLI is not installed on daemon PATH');
  const expected:NativeAdapterIdentity={...pins.evidence.identity,kind,adapterVersion:kind==='claude'?CLAUDE_INVESTIGATION_ADAPTER:CODEX_INVESTIGATION_ADAPTER,binary:{path:binary,digest:investigationFileDigest(binary)},profileDigest:digestValue(profile),catalogDigest:scopedReviewCatalogDigest(mode==='indexed-impact'),launchDigest:kind==='claude'?claudeInvestigationLaunchDigest(args,cwd):codexInvestigationLaunchDigest(args,cwd,schema)};
  let qualification:NativeInvestigationQualification;
  const assertQualified=async()=>{const current=await this.evidence(mode);qualification=await qualifyInvestigationAdapter(current.readiness.backendRefs[mode],expected,repo,mode==='indexed-impact',{origin:'installed-probe',read:async()=>current.evidence,verifyInstalled:async(reference,digest)=>{if(reference!==current.readiness.backendRefs[mode]||digest!==digestValue(current.evidence))refuse('Probe authority binding changed');(this.deps.verifyProbe??verifyInstalledProbeSignature)(current.evidence,current.report.signature);}},[expected.adapterVersion]);};
  await assertQualified();const bindings=new Map<string,QualifiedInvestigationSessionBinding>();
  return {provider,modelLabel:`${resolution.runner}:${resolution.model}`,compatibilityDigest:digestValue(expected),assertQualified,execute:async(turn,tools,signal,runtime)=>{
   await assertQualified();const binding=createQualifiedInvestigationBinding(qualification,turn,tools,runtime);bindings.set(turn.runId,binding);
   return provider.runReviewSession!('Investigate the approved tasks and selected commit blocks using only the scoped broker. Read evidence on demand, checkpoint each block, and keep missing impact/test evidence explicit. Final output must match the accepted scoped reply.',schema,{cwd:repo,deadlineMs:tools.execution.timeoutMs,stallMs:tools.execution.stallMs,internalRetry:false,signal,reviewBudget:tools.execution.budget,investigationBinding:binding});
  },drain:async runId=>{const binding=bindings.get(runId);if(binding){await drainInvestigationInvocation(binding);bindings.delete(runId);}}};
 }
}
export function productionInvestigationAdmission(options:Pick<InvestigationRepositoryOptions,'repoId'|'repoPath'|'canonical'|'assertRegistered'>){
 const policyFor=async()=>{
  const selection=readInvestigationSelection();let work=new CanonicalReviewWorkAdapter(options),reference=selection.readiness;
  // Engine-wide evidence may live in a separately registered governance repo;
  // projects do not need copies of the engine's predecessor design artifacts.
  if(typeof reference==='string'&&reference.startsWith('repo:')){
   const match=/^repo:(.+)::(approved:.+)$/.exec(reference);if(!match)refuse('Malformed evidence repository reference');
   const repo=realpathSync(match[1]!);const {lookupRepoId}=await import('../db/repos.js');const id=await lookupRepoId(repo);if(id===undefined)refuse('Evidence repository must already be registered');
   const {lifecycleFor}=await import('./lifecycle-registry.js');work=new CanonicalReviewWorkAdapter({repoId:String(id),repoPath:repo,canonical:lifecycleFor(repo).store,assertRegistered:async()=>{if(await lookupRepoId(repo)!==id)refuse('Evidence repository registration changed');}});reference=match[2]!;
  }
  return new InvestigationAdoptionPolicy({work,selection:()=>({...selection,readiness:reference})});
 };
 return {assertSelected:()=>{if(readInvestigationSelection().engine!=='plan-investigation-v1')refuse('Investigation scheduling is disabled; legacy remains selected');},
 assertReady:async(_operation:'start'|'resume'|'publish',mode:'source-only'|'indexed-impact'='source-only')=>{await (await policyFor()).adapter(options.repoPath,mode);},daemonAdapter:async(_subject:unknown,mode:'source-only'|'indexed-impact')=>(await policyFor()).adapter(options.repoPath,mode)};
}

/** Prepare, never approve/apply, the code-only exception through the existing
 * canonical amendment proposal API. Repeated preparation discovers its record. */
export async function preparePredecessorReconciliation(work:CanonicalReviewWorkAdapter,lifecycle:import('../workflow/artifact-core/lifecycle-service.js').LifecycleService){
 const {listAmendments,nextAmendmentId,proposeAmendment}=await import('../workflow/amendments/store.js');
 const head=await readPredecessorHld(work);if(!head)refuse('Predecessor HLD is required to prepare its reconciliation');
 const slug=head.head.meta['epicSlug'],runId=head.head.meta['runId'],oldTarget=(head.head.body['nonFunctional'] as Record<string,unknown>|undefined)?.['performance'];
 if(typeof slug!=='string'||typeof runId!=='string'||typeof oldTarget!=='string')refuse('Predecessor HLD identity/performance target is malformed');
 const proposalRun='adoption-c32aa60534232f36';const existing=listAmendments(work.repoPath,PREDECESSOR_EPIC).find(a=>a.proposedBy.runId===proposalRun&&a.amendment.type==='nonFunctional.retarget'&&a.amendment.newTarget===RECONCILIATION_CLAUSE);
 if(existing)return {id:existing.id,status:existing.status,pendingExternalApproval:existing.status==='pending'};
 const id=nextAmendmentId(work.repoPath,PREDECESSOR_EPIC);
 await proposeAmendment(work.repoPath,{id,epicHash:PREDECESSOR_EPIC,epicSlug:slug,hldBaseRunId:runId,amendment:{type:'nonFunctional.retarget',property:'performance',oldTarget,newTarget:RECONCILIATION_CLAUSE,rationale:'Add only the explicit new-engine CODE-review exception; retain predecessor design and legacy behavior.'},rationale:'S6 adoption prerequisite. This proposal neither changes sibling LLDs nor enables investigation. Separate explicit approval and independently verified readiness are still required.',citations:[],proposedBy:{workflow:'build',runId:proposalRun,storyId:'s6',stepId:'t12'},proposedAt:new Date().toISOString(),status:'pending'},{lifecycle});
 return {id,status:'pending',pendingExternalApproval:true};
}
