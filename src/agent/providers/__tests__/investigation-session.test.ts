/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,chmodSync,rmSync,existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { qualifyInvestigationAdapter,createQualifiedInvestigationBinding,inspectQualifiedInvestigationBinding,investigationFileDigest,ISOLATION_DENIAL_PROBES } from '../investigation-session.js';
import type { NativeAdapterIdentity,NativeIsolationEvidence } from '../investigation-session.js';
import { scopedReviewToolCatalog,scopedReviewCatalogDigest } from '../../../mcp/review-investigation-bridge.js';
import { continuationFixture } from '../../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { digestValue } from '../../../workflow/code-review/investigation/identity.js';
import { admitInvestigationRequest } from '../../../workflow/code-review/investigation/continuation-policy.js';
import type { InvestigationTools } from '../../../workflow/code-review/investigation/continuation-types.js';
import { CliProvider } from '../cli-provider.js';
import { OllamaProvider } from '../ollama.js';

test('Effective native isolation qualification rejects inherited tools and unproven binaries',async()=>{
 const root=mkdtempSync(join(tmpdir(),'insrc-isolation-test-')),repo=mkdtempSync(join(tmpdir(),'insrc-isolation-repo-')),f=continuationFixture();
 try{
  const bin=join(root,'fake-cli'),config=join(root,'private-config.json'),called=join(root,'called');
  writeFileSync(bin,`#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(called)},'called');\n`);chmodSync(bin,0o700);writeFileSync(config,'{"mcpServers":{}}',{mode:0o600});
  const identity:NativeAdapterIdentity={kind:'claude',adapterVersion:'claude-scoped-v1',binaryVersion:'fixture-1',binary:{path:bin,digest:investigationFileDigest(bin)},runtimeFiles:[],profileDigest:digestValue(f.context.policy.budget.profile),catalogDigest:scopedReviewCatalogDigest(false),launchDigest:'a'.repeat(64)};
  const effective={cwd:root,configFiles:[{path:config,digest:investigationFileDigest(config)}],builtinTools:[],inheritedConfigSources:[],mcpServers:['insrc-scoped-review'],plugins:[],hooks:[],repositoryInstructions:[],credentialCopies:[],auth:'existing-cli-oauth' as const,catalog:JSON.parse(JSON.stringify(scopedReviewToolCatalog(false))) as unknown[]};
  const evidence:NativeIsolationEvidence={version:1,identity,effective,validUntil:Date.now()+60000,trace:{effectiveDigest:digestValue(effective),events:[...ISOLATION_DENIAL_PROBES.map(capability=>({kind:'denied' as const,capability})),{kind:'block-ack',sequence:1},{kind:'block-ack',sequence:2},{kind:'cancel-requested'},{kind:'process-exited',cancelled:true}]}};
  const authority={origin:'scripted-fixture' as const,read:async()=>evidence};
  const qualify=(changed:NativeIsolationEvidence=evidence,expected=identity,supported=['claude-scoped-v1'])=>qualifyInvestigationAdapter('fixture:qualification',expected,repo,false,{...authority,read:async()=>changed},supported);
  const qualification=await qualify();assert.equal(qualification.origin,'scripted-fixture');
  const tools:InvestigationTools={seed:f.context.seed,impact:f.context.impact,read:async()=>{throw Error('not called');},progress:async()=>{throw Error('not called');},execution:{budget:{policy:f.context.policy.budget,admitted:admitInvestigationRequest(f.context.policy,{turn:f.turn,seed:f.context.seed},f.context.schema),outputAllowanceTokens:100,reviewId:f.turn.runId,callId:'fixture',stage:'judge',role:'investigation',attempt:1},timeoutMs:300000,stallMs:300000,internalRetry:false}};
  const binding=createQualifiedInvestigationBinding(qualification,f.turn,tools);
  await assert.rejects(()=>inspectQualifiedInvestigationBinding(binding,identity),/fixtures do not certify/);
  assert.equal((await inspectQualifiedInvestigationBinding(binding,identity,false)).turn.runId,f.turn.runId);
  await assert.rejects(()=>inspectQualifiedInvestigationBinding({...binding},identity,false),/Untrusted/);
  assert.throws(()=>createQualifiedInvestigationBinding({...qualification},f.turn,tools),/not issued/);
  await assert.rejects(()=>qualify(evidence,identity,[]),/Unsupported or unproven/);
  await assert.rejects(()=>qualify(evidence,{...identity,binaryVersion:'unproven'}),/identity/);
  await assert.rejects(()=>qualifyInvestigationAdapter('unproven-installed',identity,repo,false,{origin:'installed-probe',read:async()=>evidence},['claude-scoped-v1']),/independent verification/);
  // A fixture reader's extra 'installed' claim is not the verifier's authority origin.
  const claimed=await qualify({...evidence,origin:'installed-probe'} as NativeIsolationEvidence);assert.equal(claimed.origin,'scripted-fixture');
  for(const field of ['builtinTools','inheritedConfigSources','plugins','hooks','repositoryInstructions','credentialCopies'] as const){
   const changed={...effective,[field]:['inherited authority']};await assert.rejects(()=>qualify({...evidence,effective:changed,trace:{...evidence.trace,effectiveDigest:digestValue(changed)}}),/Inherited configuration/);
  }
  const broad={...effective,catalog:[...effective.catalog,{name:'shell'}]};await assert.rejects(()=>qualify({...evidence,effective:broad}),/catalogue/);
  await assert.rejects(()=>qualify({...evidence,effective:{...effective,mcpServers:['insrc-scoped-review','user-server']}}),/Inherited/);
  await assert.rejects(()=>qualify({...evidence,trace:{...evidence.trace,events:evidence.trace.events.filter(e=>e.kind!=='denied'||e.capability!=='hooks')}}),/Missing independent/);
  await assert.rejects(()=>qualify({...evidence,trace:{...evidence.trace,events:evidence.trace.events.filter(e=>e.kind!=='process-exited')}}),/cancellation not proven/);
  await assert.rejects(()=>qualify({...evidence,validUntil:Date.now()-1}),/expired/);
  const provider=new CliProvider({kind:'claude',binPath:bin});await assert.rejects(()=>provider.runReviewSession('do not run',{type:'object'},{cwd:repo,deadlineMs:1000,investigationBinding:binding}),/fixtures do not certify/);assert.equal(existsSync(called),false);
  await assert.rejects(()=>new OllamaProvider('fixture','http://127.0.0.1:1').runReviewSession('do not call',{type:'object'},{cwd:repo,deadlineMs:1000,investigationBinding:binding}),/no qualified native/);
  writeFileSync(config,'changed');await assert.rejects(()=>inspectQualifiedInvestigationBinding(binding,identity,false),/changed/);writeFileSync(config,'{"mcpServers":{}}');
  writeFileSync(bin,'changed');await assert.rejects(()=>inspectQualifiedInvestigationBinding(binding,identity,false),/changed/);
 }finally{rmSync(root,{recursive:true,force:true});rmSync(repo,{recursive:true,force:true});}
});
