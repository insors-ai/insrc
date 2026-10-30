/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { probeExportSchema, PROBE_RESPONSE_BYTES, PROBE_OBSERVATION_BYTES } from '../shared/review-investigation-probe.js';
import type { InvestigationProbeExport } from '../shared/review-investigation-probe.js';
import { investigationFileDigest, inspectUnsignedIsolationEvidence } from '../agent/providers/investigation-session.js';
import { snapshotValue, digestValue } from '../workflow/code-review/investigation/identity.js';
import { createRoleRouter } from '../analyze/context/role-router.js';
import { loadAnalyzeConfig } from '../config/analyze.js';
import { installedSourceMatches } from './installed-commit.js';
import { investigationSourceDigest } from './review-investigation-adoption.js';
import { claudeInvestigationAdapter } from '../agent/providers/claude-investigation-session.js';
import { codexInvestigationAdapter } from '../agent/providers/codex-investigation-session.js';
import { InvestigationReplySchema } from '../shared/review-investigation.js';
import { readProbeCanaryEvidence } from './review-investigation-canaries.js';
import { claudeInvestigationControlArgs, CLAUDE_PROBE_CONTROL_CATALOG, CLAUDE_PROBE_CONTROL_SCHEMA } from '../agent/providers/claude-investigation-session.js';
import { scopedReviewCatalogDigest } from '../shared/review-investigation-catalog.js';
import { inspectInstalledInvestigation, assertInstalledImagesPinned } from '../agent/providers/native-investigation-installation.js';

/** Read-only validation. No signer, lifecycle writer or qualification issuer. */
export function validateUnsignedProbeExport(input:unknown):InvestigationProbeExport{
 const report=probeExportSchema.parse(input);
 if(Buffer.byteLength(JSON.stringify(report))>PROBE_RESPONSE_BYTES)throw Error('Probe export exceeds bound');
 let fixtureRoot:string|undefined;
 for(const file of report.evidenceFiles??[]){
  const path=realpathSync(file.path),stat=lstatSync(file.path),temp=realpathSync(tmpdir()),rel=relative(temp,path);
  const root=rel.split('/')[0];
  if(path!==file.path||isAbsolute(rel)||rel.startsWith('../')||!root?.startsWith('insrc-p-')||!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
   (stat.mode&0o077)||stat.size>PROBE_OBSERVATION_BYTES||stat.size!==file.bytes||investigationFileDigest(path)!==file.digest)throw Error('Probe evidence file is stale or unsafe');
  const owner=lstatSync(dirname(path));if(!owner.isDirectory()||(owner.mode&0o077))throw Error('Unsafe evidence directory');
  if(!['native-output.json','native-control-output.json','observations.jsonl','investigation-mcp.json','investigation-settings.json','canary-manifest.json','canary-control.jsonl','canary-restricted.jsonl','host-checks.json','native-control-debug.log','native-restricted-debug.log','source-policy-host.json'].includes(basename(path)))throw Error('Unsupported probe evidence file');
  if(fixtureRoot&&fixtureRoot!==root)throw Error('Probe evidence spans different fixture roots');fixtureRoot=root;
  if(file.kind==='checkpoint-journal')for(const line of readFileSync(path,'utf8').split('\n').filter(Boolean)){
   const event=JSON.parse(line) as {probeId?:unknown;attemptId?:unknown};
   if(event.probeId!==report.status.probeId||event.attemptId!==report.status.attemptId)throw Error('Probe journal belongs to another invocation');
  }
 }
 if(report.phases){
  const files=report.evidenceFiles??[];
  if(new Set(files.map(f=>f.path)).size!==files.length||files.reduce((n,f)=>n+f.bytes,0)>PROBE_OBSERVATION_BYTES)throw Error('Duplicate or over-bound phase evidence');
  const canaries=report.canaries!;
  if(!files.some(f=>f.kind==='canary-manifest'&&f.path===canaries.manifestPath))throw Error('Missing canary manifest descriptor');
  const verified=readProbeCanaryEvidence(canaries.manifestPath),root=dirname(canaries.manifestPath);
  if(verified.manifest.probeId!==report.status.probeId||verified.manifest.attemptId!==report.status.attemptId||
   verified.manifestDigest!==canaries.manifestDigest||digestValue(verified.checks)!==digestValue(canaries.checks))throw Error('Stale or foreign phase manifest/signals');
  for(const name of ['canary-control.jsonl','canary-restricted.jsonl'])if(!files.some(f=>f.kind==='canary-signals'&&f.path===join(root,name)))throw Error('Missing canary signal descriptor');
  const hostFile=files.find(f=>f.kind==='host-checks'&&f.path===join(root,'host-checks.json'));
  if(!hostFile)throw Error('Missing host boundary observations');
  const host=JSON.parse(readFileSync(hostFile.path,'utf8')) as Record<string,unknown>;
  if(Object.keys(host).sort().join(',')!=='approvalRejected,attemptId,crossRunRejected,phase,positiveAfter,positiveBefore,probeId,version'||
   host['version']!==1||host['phase']!=='restricted'||host['probeId']!==report.status.probeId||host['attemptId']!==report.status.attemptId||
   typeof host['positiveBefore']!=='boolean'||typeof host['positiveAfter']!=='boolean'||typeof host['approvalRejected']!=='boolean'||
   !Number.isSafeInteger(host['crossRunRejected'])||Number(host['crossRunRejected'])<0||Number(host['crossRunRejected'])>6)throw Error('Foreign host boundary observations');
  const alive=host['positiveBefore']&&host['positiveAfter'];
  for(const check of ['cross-run','approval'] as const){
   const observation=report.status.observations.find(o=>o.check===check);
   const verdict=check==='cross-run'?(alive?(host['crossRunRejected']===6?'observed-denied':'observed-allowed'):'unverifiable'):
    alive&&!host['approvalRejected']?'observed-allowed':report.candidate?.identity.adapterVersion==='claude-scoped-v2'&&alive&&host['approvalRejected']?'observed-denied':'unverifiable';
   if(!observation||observation.observationDigest!==digestValue(host)||observation.verdict!==verdict)throw Error('Host boundary evidence promoted or changed');
  }
  for(const phase of report.phases){
   if(phase.phase==='control'&&(phase.catalogDigest!==digestValue(JSON.parse(CLAUDE_PROBE_CONTROL_CATALOG))||
    phase.effectiveDigest!==digestValue({phase:'control',manifestDigest:canaries.manifestDigest})))throw Error('Control template binding changed');
   if(phase.outputPath===null){if(!['failed','cancelled','interrupted'].includes(report.status.state))throw Error('Missing native phase output');continue;}
   const kind=phase.phase==='control'?'control-output':'native-output',name=phase.phase==='control'?'native-control-output.json':'native-output.json';
   const file=files.find(f=>f.kind===kind&&f.path===phase.outputPath);
   if(!file||file.path!==join(root,name)||file.bytes!==phase.outputBytes)throw Error('Foreign or promoted phase output');
   const raw=JSON.parse(readFileSync(file.path,'utf8')) as {exitCode?:unknown;exitSignal?:unknown;aborted?:unknown;timedOut?:unknown;durationMs?:unknown};
   if(raw.exitCode!==phase.exitCode||(raw.exitSignal??null)!==phase.exitSignal||(raw.aborted??false)!==phase.aborted||raw.timedOut!==phase.timedOut||raw.durationMs!==phase.usage.latencyMs)throw Error('Phase process observation changed');
  }
  if(report.phases[1]?.launchDigest===report.phases[0]?.launchDigest)throw Error('Control and restricted launch identities must differ');
  if(!report.status.identity)throw Error('Missing phase installation identity');
  for(const pin of [report.status.identity.binary,...report.status.identity.runtimeFiles])if(realpathSync(pin.path)!==pin.path||investigationFileDigest(pin.path)!==pin.digest)throw Error('Phase runtime pin is stale');
 }
 if(report.candidate){
  if(!report.status.identity)throw Error('Missing pinned probe identity');
  inspectUnsignedIsolationEvidence(report.candidate,report.status.identity,report.status.repo,report.status.sourceMode==='indexed-impact',
   ['claude-scoped-v1','claude-scoped-v2','codex-scoped-v1']);
  if((report.evidenceFiles??[]).filter(f=>f.kind==='native-output'||f.kind==='checkpoint-journal').length!==2)throw Error('Candidate lacks independent raw evidence');
  const journal=report.evidenceFiles!.find(f=>f.kind==='checkpoint-journal')!,output=report.evidenceFiles!.find(f=>f.kind==='native-output')!;
  const events=readFileSync(journal.path,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line) as {value?:{kind?:string;receipt?:{sequence?:number}}});
  const sequences=events.filter(e=>e.value?.kind==='block-ack').map(e=>e.value!.receipt?.sequence);
  if(sequences.length<2||sequences.some((n,i)=>n!==i+1))throw Error('Candidate lacks durable ordered ACK evidence');
  const process=JSON.parse(readFileSync(output.path,'utf8')) as {aborted?:unknown;exitSignal?:unknown;spawnError?:unknown};
  if(process.aborted!==true||process.exitSignal!=='SIGKILL'||process.spawnError)throw Error('Candidate lacks actual cancellation exit evidence');
 }
 return snapshotValue(report,PROBE_RESPONSE_BYTES);
}

/** Production candidates must still match the installed source and selected
 * review role. A passing unsigned check still cannot qualify or activate. */
export function validateInstalledProbeExport(input:unknown):InvestigationProbeExport{
 const report=validateUnsignedProbeExport(input);
 if(report.candidate||report.phases){
  const root=fileURLToPath(new URL('../../',import.meta.url));
  if(!installedSourceMatches(root,report.sourceCommit,['src','package-lock.json'])||report.sourceDigest!==investigationSourceDigest(root))throw Error('Probe source is stale');
  const {provider,resolution}=createRoleRouter({cliTimeoutMs:300000}).resolveProviderForRole('review',loadAnalyzeConfig(),report.status.repo);
  const kind=resolution.runner==='cli-claude'?'claude':resolution.runner==='cli-codex'?'codex':null;
  const identity=report.candidate?.identity??report.status.identity;
  if(!identity||!kind||!provider.getReviewBudgetProfile||kind!==identity.kind||digestValue(provider.getReviewBudgetProfile('reviewer-session'))!==identity.profileDigest||identity.catalogDigest!==scopedReviewCatalogDigest(report.status.sourceMode==='indexed-impact'))throw Error('Probe review role/catalog is stale');
  const adapter=kind==='claude'?claudeInvestigationAdapter:codexInvestigationAdapter;
  const args=['--model',resolution.model,...(resolution.effort?kind==='claude'?['--effort',resolution.effort]:['-c',`model_reasoning_effort=${resolution.effort}`]:[])];
  const cwd=report.candidate?.effective.cwd??readProbeCanaryEvidence(report.canaries!.manifestPath).manifest.cwd;
  const installed=inspectInstalledInvestigation(kind,identity.binary.path,cwd);
  if(installed.version!==identity.binaryVersion)throw Error('Probe runtime version is stale');
  assertInstalledImagesPinned(identity,installed.images);
  if(adapter.launchDigest(adapter.args(InvestigationReplySchema,args,cwd,report.status.sourceMode==='indexed-impact'),cwd,InvestigationReplySchema)!==identity.launchDigest)throw Error('Probe launch environment changed');
  if(report.phases){
   if(kind!=='claude'||adapter.launchDigest(claudeInvestigationControlArgs(args,cwd,report.status.sourceMode==='indexed-impact'),cwd,CLAUDE_PROBE_CONTROL_SCHEMA)!==report.phases[0]!.launchDigest)throw Error('Probe control launch environment changed');
   for(const [path,value] of Object.entries(adapter.configuration(cwd,report.status.sourceMode==='indexed-impact')))
    if(digestValue(JSON.parse(readFileSync(path,'utf8')))!==digestValue(value))throw Error('Restricted configuration changed');
  }
 }
 return report;
}
