/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { z } from 'zod';
import { realpathSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { readInvestigationSelection, assertInvestigationAvailability, readApprovedEvidence, readPredecessorHld, PREDECESSOR_EPIC, RECONCILIATION_CLAUSE } from './review-investigation-adoption.js';
import type { InvestigationAdoptionDeps } from './review-investigation-adoption.js';
import { probeExportSchema } from '../shared/review-investigation-probe.js';
import { CLAUDE_V3_ADAPTER, reviewProtocolSchemaFor } from '../shared/review-isolation-evidence.js';
import { ReviewIntegrationError } from '../shared/review-investigation.js';
import { scopedReviewCatalogDigest } from '../shared/review-investigation-catalog.js';
import { digestValue } from '../workflow/code-review/investigation/identity.js';
import { ArtifactIds } from '../workflow/artifact-ids.js';
import { approvalStateOf } from '../workflow/artifact-core/approval-view.js';
import { decodeArtifactHead } from '../workflow/artifact-core/decode.js';
import { RecoveryJournal } from '../workflow/code-review/investigation/recovery-journal.js';
import { RecoveryStore } from '../workflow/code-review/investigation/recovery-store.js';
import { validateRecoveryManifest } from '../workflow/code-review/investigation/recovery-replay.js';
import { readReviewCompletion } from '../workflow/code-review/investigation/completion-receipt.js';
import { ProductionDescriptorStore } from './review-investigation-descriptor.js';
import { daemonRunFiles } from './run-file-ownership.js';
import type { NativeIsolationEvidence } from '../agent/providers/investigation-session.js';
import { createRoleRouter } from '../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { createInvestigationPolicy } from '../workflow/code-review/investigation/continuation-policy.js';
import { investigationBoundaryManifest,compactExecutionBoundaryDigest } from '../agent/providers/investigation-boundary.js';
import { nativeInvestigationEnvironment } from '../agent/providers/native-investigation-session.js';
import { claudeCompactInvestigationAdapter } from '../agent/providers/claude-investigation-session.js';
import { createQualifiedInvestigationBinding, qualifyInvestigationAdapter, drainInvestigationInvocation, investigationFileDigest } from '../agent/providers/investigation-session.js';
import { inspectInstalledInvestigation, assertInstalledImagesPinned } from '../agent/providers/native-investigation-installation.js';
import type { NativeAdapterIdentity, NativeInvestigationQualification } from '../agent/providers/investigation-session.js';
import type { QualifiedInvestigationSessionBinding } from '../shared/types.js';
import type { InvestigationDaemonAdapter } from './review-investigation-repository.js';

const digest=z.string().regex(/^[a-f0-9]{64}$/),text=z.string().min(1).max(4096),cr=z.object({artifactId:text,runId:digest}).strict();
export const compactActivationSchema=z.object({version:z.literal(1),kind:z.literal('review-investigation-activation'),
 implementationBuildId:text,reconciliationRef:text,limitations:z.array(text),
 capabilities:z.array(z.object({backend:z.literal('claude'),mode:z.enum(['source-only','indexed-impact']),probeId:z.uuid(),executionBoundaryDigest:digest,
  acceptance:z.object({clean:cr,knownDefect:cr,crossFile:cr}).strict(),recoveryRunId:digest,concurrencyRunIds:z.array(digest).min(2).max(8)}).strict()).min(1).max(4)
}).strict();
function refuse(message:string):never{throw new ReviewIntegrationError('not-ready',message);}
function issueData(head:Awaited<ReturnType<typeof readApprovedEvidence>>):unknown{
 try{return JSON.parse(String(head.head.body['fixIntent']));}catch{return refuse('Malformed canonical activation decision');}
}
function actualCompactRun(deps:InvestigationAdoptionDeps,runId:string,mode:'source-only'|'indexed-impact',evidence:NativeIsolationEvidence){
 const owner=()=>daemonRunFiles.assertSocketOwned(),descriptor=new ProductionDescriptorStore(deps.work.repoPath,owner).read(runId);
 if(!descriptor||descriptor.reviewerParty!=='daemon'||descriptor.start.sourceMode!==mode)refuse('Activation run is not an admitted independent native review');
 const journal=new RecoveryJournal(deps.work.repoPath,runId,{assertProcessOwner:owner}),manifest=validateRecoveryManifest(journal.read(descriptor.manifestRef) as Parameters<typeof validateRecoveryManifest>[0]);
 const expectedProvider=digestValue({profile:manifest.policy.budget.profile,role:'review',tier:'core',reviewerParty:'daemon',adapterDigest:evidence.identity.executionBoundaryDigest});
 if(descriptor.manifestDigest!==digestValue(manifest)||descriptor.backendDigest!==digestValue(manifest.compatibility)||manifest.compatibility.providerDigest!==expectedProvider
  ||manifest.compatibility.toolsDigest!==scopedReviewCatalogDigest(mode==='indexed-impact','compact-v1')||digestValue(manifest.policy.budget.profile)!==evidence.identity.profileDigest)refuse('Activation run uses another backend, catalog or execution boundary');
 const store=new RecoveryStore(deps.work.repoPath,runId,{assertProcessOwner:owner,assertOwner:()=>{throw Error('Read-only activation verification');},
  readEvidence:async()=>{throw Error('No new inspection during activation verification');},processEpoch:'activation-readonly',currentCompatibility:manifest.compatibility});
 return {descriptor,store,view:store.replay()};
}
/** No probe/oracle approval chain. The collector's owning-daemon replay supplies
 * mechanical qualification; only changing the default needs this one decision. */
export async function compactAdmissionEvidence(deps:InvestigationAdoptionDeps,mode:'source-only'|'indexed-impact'){
 const selection=(deps.selection??readInvestigationSelection)();assertInvestigationAvailability(selection);
 if(selection.enabled!==true)refuse('Compact investigation availability is disabled');
 const reference=mode==='source-only'?selection.sourceProbe:selection.indexedProbe;
 const match=typeof reference==='string'?/^probe:([a-f0-9-]{36})$/.exec(reference):null;
 if(!match)refuse('A mode-specific installed probe reference is required');const probeId=z.uuid().parse(match[1]);
 const read=deps.compactProbe??(async(repo:string,id:string)=>(await import('./review-investigation-gateway.js')).readInstalledInvestigationProbe(repo,id));
 const report=probeExportSchema.parse(await read(deps.work.repoPath,probeId)),evidence=report.candidate;
 if(report.status.probeId!==probeId||report.status.sourceMode!==mode||report.status.state!=='completed'||!evidence||report.status.missingEvidence.length
  ||evidence.identity.kind!=='claude'||evidence.identity.adapterVersion!==CLAUDE_V3_ADAPTER||evidence.identity.catalogDigest!==scopedReviewCatalogDigest(mode==='indexed-impact','compact-v1')
  ||!evidence.identity.executionBoundaryDigest||evidence.identity.executionBoundaryDigest!==report.sourceDigest||evidence.validUntil<=Date.now())refuse('Installed compact probe is missing, stale, unsupported or for another mode');
 if(typeof selection.reconciliation!=='string')refuse('The existing approved predecessor reconciliation is required');
 const reconciliation=await readApprovedEvidence(deps.work,selection.reconciliation),key=ArtifactIds.parse(/^approved:(.+)@/.exec(selection.reconciliation)![1]!);
 const amendment=reconciliation.head.body['amendment'] as Record<string,unknown>|undefined,predecessor=await readPredecessorHld(deps.work),performance=(predecessor?.head.body['nonFunctional'] as Record<string,unknown>|undefined)?.['performance'];
 if(key?.kind!=='AMD'||key.epicHash!==PREDECESSOR_EPIC||amendment?.['type']!=='nonFunctional.retarget'||amendment['property']!=='performance'||amendment['newTarget']!==RECONCILIATION_CLAUSE
  ||!predecessor||performance!==amendment['oldTarget']&&performance!==RECONCILIATION_CLAUSE)refuse('Predecessor reconciliation does not apply');
 if(selection.engine==='plan-investigation-v1'){
  if(typeof selection.activation!=='string')refuse('Default activation requires its single canonical approved decision');
  if(ArtifactIds.parse(/^approved:(.+)@/.exec(selection.activation)?.[1]??'')?.kind!=='ISSUE')refuse('Activation must use one canonical ISSUE decision');
  const decision=compactActivationSchema.parse(issueData(await readApprovedEvidence(deps.work,selection.activation)));
  const capabilities=decision.capabilities.filter(c=>c.backend==='claude'&&c.mode===mode);
  if(capabilities.length!==1)refuse('Activation does not name exactly one matching backend/mode');const capability=capabilities[0]!;
  if(capability.executionBoundaryDigest!==report.sourceDigest||decision.reconciliationRef!==selection.reconciliation)refuse('Activation qualification changed');
  // BUILD completion remains the existing independently reviewed, user-approved
  // canonical act. A fixture label or approved:true field is never sufficient.
  const build=await deps.work.readCanonicalHead(decision.implementationBuildId);
  const tasks=build?.head.body['tasks'];
  const buildLifecycle=build?decodeArtifactHead(decision.implementationBuildId,JSON.stringify(build.head)).artifact.lifecycle:null;
  if(decision.implementationBuildId!=='BUILD-c32aa60534232f36-s7'||!build||approvalStateOf(build.head.meta)!=='approved'||buildLifecycle?.stale||buildLifecycle?.approval?.revision!==build.revision
   ||!Array.isArray(tasks)||tasks.length!==5||new Set(tasks.map(t=>t.id)).size!==5||tasks.some(t=>t?.passed!==true||!['t1','t2','t3','t4','t5'].includes(t.id)))refuse('Implementation BUILD completion is not approved');
  const seen=new Set<string>();
  for(const [kind,reference]of Object.entries(capability.acceptance)){
   const parsed=ArtifactIds.parse(reference.artifactId),head=await deps.work.readCanonicalHead(reference.artifactId),body=head?.head.body;
   const investigation=body?.['investigation'] as Record<string,unknown>|undefined;
   if(parsed?.kind!=='CR'||!head||head.head.meta['reviewedBy']!=='daemon'||body?.['groundingMode']!=='investigation'||investigation?.['runId']!==reference.runId||investigation['sourceMode']!==mode
    ||typeof investigation['checkpointDigest']!=='string'||typeof investigation['coverageRef']!=='string'||seen.has(reference.runId))refuse('Activation requires distinct canonical real-review completion records');
   seen.add(reference.runId);
   const actual=actualCompactRun(deps,reference.runId,mode,evidence),receipt=await readReviewCompletion(actual.store,{canonical:deps.work.options.canonical,actor:{id:'insrc:activation-verification',kind:'system',properties:{}},current:async()=>{throw Error('No publication or mutable source assessment during terminal receipt replay');}});
   if(receipt.artifactId!==reference.artifactId||receipt.artifactRevision!==head.revision||receipt.subjectDigest!==investigation['subjectDigest'])refuse('Acceptance completion receipt differs from its canonical review');
   if(kind==='crossFile'&&new Set(actual.view.state.ledger.evidence.map(e=>e.source.path)).size<2)refuse('Cross-file acceptance lacks inspected evidence from multiple files');
   if(kind==='knownDefect'&&!actual.view.state.ledger.findings.some(f=>f.confidence==='breach'&&['HIGH','MED'].includes(f.severity)))refuse('Known-defect acceptance lacks an actual supported defect finding');
   if(kind==='clean'&&body['verdict']!=='pass'||kind==='knownDefect'&&body['verdict']==='pass')refuse('Activation acceptance outcomes do not match their recorded cases');
  }
  const recovery=actualCompactRun(deps,capability.recoveryRunId,mode,evidence).view;
  if(!recovery.state.accepted.length||recovery.state.attempts<2)refuse('Activation lacks actual checkpoint continuation evidence');
  if(new Set(capability.concurrencyRunIds).size!==capability.concurrencyRunIds.length)refuse('Concurrency evidence must name distinct actual runs');
  for(const runId of capability.concurrencyRunIds)if(actualCompactRun(deps,runId,mode,evidence).view.state.attempts<1)refuse('Concurrency run has no actual invocation');
 }else if(selection.engine!=='legacy'&&selection.engine!==undefined)refuse('Unsupported default engine');
 return {reference:`probe:${probeId}`,report,evidence,read};
}

export async function compactInvestigationAdapter(deps:InvestigationAdoptionDeps,repo:string,mode:'source-only'|'indexed-impact'):Promise<InvestigationDaemonAdapter>{
 const pins=await compactAdmissionEvidence(deps,mode),boundary=investigationBoundaryManifest();
 if(boundary.digest!==pins.evidence.identity.nativeCodeDigest)refuse('Installed compact execution boundary changed');
 const {provider,resolution}=createRoleRouter({cliTimeoutMs:300000}).resolveProviderForRole('review',loadAnalyzeConfig(),repo);
 if(resolution.runner!=='cli-claude'||!provider.runReviewSession||!provider.getReviewBudgetProfile)refuse('This compact qualification supports installed Claude only');
 const profile=provider.getReviewBudgetProfile('reviewer-session'),policy=createInvestigationPolicy(provider),adapter=claudeCompactInvestigationAdapter;
 const cwd=pins.evidence.effective.cwd,schema=JSON.parse(JSON.stringify(reviewProtocolSchemaFor(CLAUDE_V3_ADAPTER)));
 const modelArgs=['--model',resolution.model,...(resolution.effort?['--effort',resolution.effort]:[])],args=adapter.args(schema,modelArgs,cwd,mode==='indexed-impact');
 let binary:string|undefined;for(const path of (process.env['PATH']??'').split(delimiter))try{binary=realpathSync(join(path,'claude'));break;}catch{/* Continue exact PATH lookup. */}
 if(!binary)refuse('Installed Claude is unavailable');const installed=inspectInstalledInvestigation('claude',binary,cwd);assertInstalledImagesPinned(pins.evidence.identity,installed.images);
 let expected:NativeAdapterIdentity={...pins.evidence.identity,binaryVersion:installed.version,binary:{path:binary,digest:investigationFileDigest(binary)},nativeCodeDigest:boundary.digest,
  profileDigest:digestValue(profile),catalogDigest:scopedReviewCatalogDigest(mode==='indexed-impact','compact-v1'),launchDigest:adapter.launchDigest(args,cwd,schema)};
 expected={...expected,executionBoundaryDigest:compactExecutionBoundaryDigest(expected,args,cwd,adapter.configuration(cwd,mode==='indexed-impact'),nativeInvestigationEnvironment())};
 let qualification:NativeInvestigationQualification;
 const assertQualified=async()=>{
  const current=await compactAdmissionEvidence(deps,mode);
  qualification=await qualifyInvestigationAdapter(current.reference,expected,repo,mode==='indexed-impact',{origin:'installed-probe',read:async()=>current.evidence,
   verifyInstalled:async(reference,digest)=>{const fresh=await compactAdmissionEvidence(deps,mode);if(reference!==fresh.reference||digest!==digestValue(fresh.evidence))refuse('Compact installed probe authority changed');}},[CLAUDE_V3_ADAPTER]);
 };
 await assertQualified();const bindings=new Map<string,QualifiedInvestigationSessionBinding>();
 return {provider,modelProtocol:'compact-v1',modelLabel:`${resolution.runner}:${resolution.model}`,compatibilityDigest:expected.executionBoundaryDigest!,assertQualified,execute:async(turn,tools,signal,runtime)=>{
  await assertQualified();const binding=createQualifiedInvestigationBinding(qualification,turn,tools,runtime);bindings.set(turn.runId,binding);
  return provider.runReviewSession!('Review the approved tasks and exact packet scope. Read evidence as needed and durably assess each block through the compact scoped tools. Preserve uncertainty and yield when unfinished.',schema,
   {cwd:repo,deadlineMs:tools.execution.timeoutMs,stallMs:tools.execution.stallMs,internalRetry:false,signal,reviewBudget:tools.execution.budget,investigationBinding:binding});
 },drain:async runId=>{const binding=bindings.get(runId);if(binding){await drainInvestigationInvocation(binding);bindings.delete(runId);}}};
}
