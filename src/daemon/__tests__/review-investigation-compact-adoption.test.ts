/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { investigationBoundaryManifest,compactExecutionBoundaryDigest,INVESTIGATION_BOUNDARY_ROOTS } from '../../agent/providers/investigation-boundary.js';
import { CLAUDE_V3_ADAPTER,ISOLATION_CHECKS,CAPABILITY_BOUNDARY,isolationBasisFor,reviewProtocolSchemaDigestFor } from '../../shared/review-isolation-evidence.js';
import { scopedReviewToolCatalog,scopedReviewCatalogDigest } from '../../shared/review-investigation-catalog.js';
import { fixture } from './review-investigation-fixtures.js';
import { compactAdmissionEvidence,compactInvestigationAdapter } from '../review-investigation-compact-adoption.js';
import { CanonicalReviewWorkAdapter } from '../review-investigation-work.js';
import { LifecycleService } from '../../workflow/artifact-core/lifecycle-service.js';
import { emptyLifecycle } from '../../workflow/artifact-core/decode.js';
import { approvedEvidenceReference,PREDECESSOR_EPIC,RECONCILIATION_CLAUSE } from '../review-investigation-adoption.js';
import type { InvestigationSelection } from '../review-investigation-adoption.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';

test('compact qualification fingerprints executable closure and fails closed while report-only changes preserve proof',()=>{
 const root=mkdtempSync(join(tmpdir(),'compact-boundary-'));
 const write=(path:string,text:string)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),text);};
 try{
  for(const path of INVESTIGATION_BOUNDARY_ROOTS)write(path,"export const marker = 'original';\n");
  write('package-lock.json','{}');write('out/bin/insrc-process-broker','native-image');write('out/bin/insrc-shutdown-watchdog.js','watchdog-image');
  write('src/daemon/review-investigation-bridge.ts',"import { value } from './review-investigation-compact.js'; export { value };\n");
  write('src/daemon/review-investigation-compact.ts',"export const value = 'host projection v1';\n");
  const baseline=investigationBoundaryManifest(root);
  write('src/daemon/review-investigation-compact.ts',"export const value = 'host grouping/report v2';\n");
  write('docs/acceptance-report.md','new report');assert.equal(investigationBoundaryManifest(root).digest,baseline.digest);
  write('src/daemon/review-investigation-bridge.ts',"import { value } from './review-investigation-compact.js'; export { value };\nexport const changedAuth = true;\n");
  assert.notEqual(investigationBoundaryManifest(root).digest,baseline.digest);
  write('src/bin/insrc-review-bridge.ts',"import './unmapped-dependency.js';\n");
  assert.throws(()=>investigationBoundaryManifest(root),/ENOENT/);
  write('src/bin/insrc-review-bridge.ts',"const name = 'runtime'; import(name);\n");
  assert.throws(()=>investigationBoundaryManifest(root),/not bounded/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('compact qualification renewal preserves boundary identity but CLI images launch permissions and environment changes invalidate it',()=>{
 const base={kind:'claude' as const,adapterVersion:CLAUDE_V3_ADAPTER,binaryVersion:'fixture',nativeCodeDigest:'a'.repeat(64),binary:{path:'/installed/claude',digest:'b'.repeat(64)},runtimeFiles:[],profileDigest:'c'.repeat(64),catalogDigest:'d'.repeat(64),launchDigest:'e'.repeat(64)};
 const one=compactExecutionBoundaryDigest(base,['--mcp-config','/tmp/one/mcp.json','--permission-mode','dontAsk'],'/tmp/one',{'/tmp/one/mcp.json':{path:'/tmp/one/binding.json'}},{HOME:'/existing-auth'});
 const renew=compactExecutionBoundaryDigest({...base,launchDigest:'f'.repeat(64)},['--mcp-config','/tmp/two/mcp.json','--permission-mode','dontAsk'],'/tmp/two',{'/tmp/two/mcp.json':{path:'/tmp/two/binding.json'}},{HOME:'/existing-auth'});
 assert.equal(renew,one,'private cwd/probe renewal is not another activation decision');
 for(const change of [{binary:{...base.binary,digest:'1'.repeat(64)}},{nativeCodeDigest:'2'.repeat(64)},{catalogDigest:'3'.repeat(64)}])assert.notEqual(compactExecutionBoundaryDigest({...base,...change},['--mcp-config','/tmp/one/mcp.json','--permission-mode','dontAsk'],'/tmp/one',{'/tmp/one/mcp.json':{path:'/tmp/one/binding.json'}},{HOME:'/existing-auth'}),one);
 assert.notEqual(compactExecutionBoundaryDigest(base,['--permission-mode','bypassPermissions'],'/tmp/one',{},{}),one);
});

test('compact pilot admission separates availability and mode qualification from one canonical default activation decision',async()=>{
 const f=await fixture(false,false,false);try{
  const store=f.repository.options.canonical,work=new CanonicalReviewWorkAdapter({repoId:'repo',repoPath:f.dir,canonical:store,assertRegistered:async()=>{}}),lifecycle=new LifecycleService({store});
  const actor={id:'fixture:operator',kind:'person' as const,properties:{}};
  const put=async(id:string,body:Record<string,unknown>,approve=true)=>{
   await store.write({id,description:'Synthetic admission fixture only',references:[],attachments:[],lifecycle:emptyLifecycle(0),payload:{body,citations:[]}},actor);
   if(approve)await lifecycle.apply(id,'approve',actor,{override:{reason:'Synthetic canonical policy test, not installation or review qualification'}});
   return approvedEvidenceReference(id,(await work.readCanonicalHead(id))!);
  };
  await put(`ISSUE-${PREDECESSOR_EPIC}`,{});await put(`HLD-${PREDECESSOR_EPIC}`,{nonFunctional:{performance:'old policy'}});
  const reconciliation=await put(`AMD-${PREDECESSOR_EPIC}-1`,{amendment:{type:'nonFunctional.retarget',property:'performance',oldTarget:'old policy',newTarget:RECONCILIATION_CLAUSE}});
  const probeId=randomUUID(),attemptId=randomUUID(),effectiveDigest='9'.repeat(64);
  const identity={kind:'claude' as const,adapterVersion:CLAUDE_V3_ADAPTER,binaryVersion:'synthetic-not-installed',nativeCodeDigest:'8'.repeat(64),executionBoundaryDigest:'7'.repeat(64),binary:{path:'/synthetic/claude',digest:'6'.repeat(64)},runtimeFiles:[],profileDigest:'5'.repeat(64),catalogDigest:scopedReviewCatalogDigest(false,'compact-v1'),launchDigest:'4'.repeat(64)};
  const effective={cwd:'/synthetic/private',configFiles:[{path:'/synthetic/private/config.json',digest:'3'.repeat(64)}],builtinTools:[],inheritedConfigSources:[],mcpServers:['insrc-scoped-review'],plugins:[],hooks:[],repositoryInstructions:[],credentialCopies:[],auth:'existing-cli-oauth',catalog:JSON.parse(JSON.stringify(scopedReviewToolCatalog(false,'compact-v1'))),boundary:CAPABILITY_BOUNDARY,protocolTools:[{name:'StructuredOutput',schemaDigest:reviewProtocolSchemaDigestFor(CLAUDE_V3_ADAPTER)}],evidenceBasis:ISOLATION_CHECKS.map(check=>({check,basis:isolationBasisFor(check),policyVersion:1,rawDigests:['2'.repeat(64)]}))};
  const candidate={version:1,identity,effective,trace:{effectiveDigest,events:[]},validUntil:Date.now()+60000};
  const report={version:1,kind:'review-investigation-probe-observations',origin:'unsigned-installed-observations',sourceCommit:f.commitId,sourceDigest:identity.executionBoundaryDigest,
   status:{version:1,probeId,requestId:randomUUID(),attemptId,repo:f.dir,sourceMode:'source-only',state:'completed',identity,startedAt:Date.now()-1000,endedAt:Date.now(),missingEvidence:[],usage:{modelCalls:null,inputTokens:null,outputTokens:null,latencyMs:1000},observations:ISOLATION_CHECKS.map(check=>({check,verdict:['durable-progress','cancellation-exit'].includes(check)?'observed-allowed':'observed-denied',attemptId,launchDigest:identity.launchDigest,effectiveDigest,provenance:'observer-attestation',observationDigest:'1'.repeat(64),detail:'Synthetic policy fixture, no installed authority',at:Date.now()}))},candidate};
  let selection:InvestigationSelection={engine:'legacy',enabled:true,readiness:undefined,reconciliation,sourceProbe:`probe:${probeId}`};
  const deps={work,selection:()=>selection,compactProbe:async()=>report};
  const ready=await compactAdmissionEvidence(deps,'source-only');assert.equal(ready.reference,`probe:${probeId}`);
  assert.equal(selection.engine,'legacy');
  await assert.rejects(()=>compactInvestigationAdapter(deps,f.dir,'source-only'),/boundary changed/,'synthetic admission data never becomes installed invocation authority');
  await assert.rejects(()=>compactAdmissionEvidence(deps,'indexed-impact'),/mode-specific/);
  selection={...selection,enabled:false};await assert.rejects(()=>compactAdmissionEvidence(deps,'source-only'),/disabled/);
  selection={...selection,enabled:true,engine:'plan-investigation-v1'};await assert.rejects(()=>compactAdmissionEvidence(deps,'source-only'),/single canonical approved/);
  const decision={version:1,kind:'review-investigation-activation',implementationBuildId:'BUILD-c32aa60534232f36-s7',reconciliationRef:reconciliation,limitations:[],capabilities:[{backend:'claude',mode:'source-only',probeId,executionBoundaryDigest:identity.executionBoundaryDigest,acceptance:{clean:{artifactId:'CR-1111111111111111-s1',runId:'a'.repeat(64)},knownDefect:{artifactId:'CR-2222222222222222-s1',runId:'b'.repeat(64)},crossFile:{artifactId:'CR-3333333333333333-s1',runId:'c'.repeat(64)}},recoveryRunId:'d'.repeat(64),concurrencyRunIds:['e'.repeat(64),'f'.repeat(64)]}]};
  selection={...selection,activation:await put('ISSUE-4444444444444444',{fixIntent:JSON.stringify(decision)},false)};
  await assert.rejects(()=>compactAdmissionEvidence(deps,'source-only'),/draft/);
  selection={...selection,activation:await put('ISSUE-5555555555555555',{fixIntent:JSON.stringify({...decision,approved:true})})};
  await assert.rejects(()=>compactAdmissionEvidence(deps,'source-only'));
  const renewalDecision={...decision,capabilities:decision.capabilities.map(c=>({...c,probeId:randomUUID()}))};
  selection={...selection,activation:await put('ISSUE-6666666666666666',{fixIntent:JSON.stringify(renewalDecision)})};
  await assert.rejects(()=>compactAdmissionEvidence(deps,'source-only'),/BUILD completion/,'fixture labels and an approved decision without actual implementation completion cannot activate');
  assert.equal(digestValue(candidate.identity),digestValue(identity));
 }finally{f.close();}
});
