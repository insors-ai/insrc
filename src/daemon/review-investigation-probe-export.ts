/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { lstatSync, realpathSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, isAbsolute } from 'node:path';
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
  if(!['native-output.json','observations.jsonl','investigation-mcp.json','investigation-settings.json'].includes(basename(path)))throw Error('Unsupported probe evidence file');
  if(fixtureRoot&&fixtureRoot!==root)throw Error('Probe evidence spans different fixture roots');fixtureRoot=root;
  if(file.kind==='checkpoint-journal')for(const line of readFileSync(path,'utf8').split('\n').filter(Boolean)){
   const event=JSON.parse(line) as {probeId?:unknown;attemptId?:unknown};
   if(event.probeId!==report.status.probeId||event.attemptId!==report.status.attemptId)throw Error('Probe journal belongs to another invocation');
  }
 }
 if(report.candidate){
  if(!report.status.identity)throw Error('Missing pinned probe identity');
  inspectUnsignedIsolationEvidence(report.candidate,report.status.identity,report.status.repo,report.status.sourceMode==='indexed-impact',
   ['claude-scoped-v1','codex-scoped-v1']);
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
 if(report.candidate){
  const root=fileURLToPath(new URL('../../',import.meta.url));
  if(!installedSourceMatches(root,report.sourceCommit,['src','package-lock.json'])||report.sourceDigest!==investigationSourceDigest(root))throw Error('Probe source is stale');
  const {provider,resolution}=createRoleRouter({cliTimeoutMs:300000}).resolveProviderForRole('review',loadAnalyzeConfig(),report.status.repo);
  const kind=resolution.runner==='cli-claude'?'claude':resolution.runner==='cli-codex'?'codex':null;
  if(!kind||!provider.getReviewBudgetProfile||kind!==report.candidate.identity.kind||digestValue(provider.getReviewBudgetProfile('reviewer-session'))!==report.candidate.identity.profileDigest)throw Error('Probe review role is stale');
  const adapter=kind==='claude'?claudeInvestigationAdapter:codexInvestigationAdapter;
  const args=['--model',resolution.model,...(resolution.effort?kind==='claude'?['--effort',resolution.effort]:['-c',`model_reasoning_effort=${resolution.effort}`]:[])];
  const cwd=report.candidate.effective.cwd;
  if(adapter.launchDigest(adapter.args(InvestigationReplySchema,args,cwd,report.status.sourceMode==='indexed-impact'),cwd,InvestigationReplySchema)!==report.candidate.identity.launchDigest)throw Error('Probe launch environment changed');
 }
 return report;
}
