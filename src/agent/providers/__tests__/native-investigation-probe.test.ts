/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliProvider } from '../cli-provider.js';
import { issueInvestigationProbeGrant } from '../investigation-probe-grant.js';
import { investigationFileDigest, inspectQualifiedInvestigationBinding, qualifyInvestigationAdapter, inspectUnsignedIsolationEvidence } from '../investigation-session.js';
import { claudeInvestigationAdapter } from '../claude-investigation-session.js';
import { codexInvestigationAdapter } from '../codex-investigation-session.js';
import { installedInvestigationImages } from '../native-investigation-installation.js';
import { nativeReviewMcpConfiguration } from '../native-investigation-session.js';
import { createInvestigationProbeFixture } from '../../../daemon/review-investigation-probe-fixtures.js';
import { createInvestigationPolicy, admitInvestigationRequest } from '../../../workflow/code-review/investigation/continuation-policy.js';
import { continuationFixture } from '../../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { InvestigationReplySchema } from '../../../shared/review-investigation.js';
import { scopedReviewCatalogDigest } from '../../../shared/review-investigation-catalog.js';
import { digestValue } from '../../../workflow/code-review/investigation/identity.js';
import { runInProcessGroup } from '../../../shared/process-group.js';
import type { QualifiedInvestigationSessionBinding } from '../../../shared/types.js';
import { validateUnsignedProbeExport } from '../../../daemon/review-investigation-probe-export.js';
import { CLAUDE_PROBE_TELEMETRY_VERSION } from '../claude-investigation-probe.js';

const actor = `import {readFileSync,appendFileSync,writeFileSync,existsSync} from 'node:fs';
import {createConnection} from 'node:net';
appendFileSync(new URL('./calls.txt',import.meta.url),'called\\n');
let input='';for await(const c of process.stdin)input+=c;
const argv=process.argv.slice(2);
if(argv.includes('--plugin-dir')){
 if(existsSync(new URL('./control-fail',import.meta.url)))process.exit(3);
 if(existsSync(new URL('./slow-control',import.meta.url)))await new Promise(r=>setTimeout(r,500));
 const {record}=await import(process.cwd()+'/../synthetic-config/canary-record.mjs');
 if(!existsSync(new URL('./control-claims',import.meta.url))){record('hooks',{hook_event_name:'SessionStart'});record('plugins',{hook_event_name:'SessionStart'});record('repository-instructions',{hook_event_name:'InstructionsLoaded',file_path:process.cwd()+'/CLAUDE.md'});record('project-mcp',null);}
 process.stdout.write(JSON.stringify({type:'system',subtype:'init',session_id:'control',tools:['mcp__inert-probe__canary_unscoped'],plugins:['insrc-isolation-canary']})+'\\n'+JSON.stringify({type:'result',is_error:false,result:'All isolation claims passed',structured_output:{control:true}})+'\\n');process.exit(0);
}
const {turn}=JSON.parse(input.split('\\n').at(-1));
const schemaPath=argv[argv.indexOf('--output-schema')+1];
if(existsSync(new URL('./v2-native',import.meta.url))){
 const diagnostics=['Broken symlink or missing file encountered for settings.json at path: /etc/claude-code/managed-settings.json','Found 4 plugins (0 enabled, 4 disabled)','cc-plugin-sec-default@builtin not seated: no managed settings and not a Team or Enterprise organization (max)','Registered 0 hooks from 0 plugins','Initialized versioned plugins system with 0 plugins'];
 if(existsSync(new URL('./policy-missing',import.meta.url)))diagnostics.pop();
 if(existsSync(new URL('./metadata-only',import.meta.url)))diagnostics.push('Host diagnostic metadata '+ 'x'.repeat(100000));
 if(existsSync(new URL('./diagnostic-flood',import.meta.url))){writeFileSync(argv[argv.indexOf('--debug-file')+1],'x'.repeat(1024*1024));setInterval(()=>{},1000);await new Promise(()=>{});}
 writeFileSync(argv[argv.indexOf('--debug-file')+1],diagnostics.map(m=>'2026-10-30T09:33:20.000Z [DEBUG] '+m).join('\\n')+'\\n');
 process.stdout.write(JSON.stringify({type:'system',subtype:'init',session_id:'scripted-v2',claude_code_version:'2.1.310',tools:['StructuredOutput','mcp__insrc-scoped-review__review_read','mcp__insrc-scoped-review__review_progress','mcp__insrc-scoped-review__review_reply'],plugins:[],skills:[],slash_commands:[],permissionMode:'dontAsk',mcp_servers:[{name:'insrc-scoped-review',status:'connected',source:'dynamic'}]})+'\\n');
}
if(existsSync(new URL('./restricted-leak',import.meta.url))){const {record}=await import(process.cwd()+'/../synthetic-config/canary-record.mjs');record('hooks',{hook_event_name:'SessionStart'});}

writeFileSync(new URL('./observed.json',import.meta.url),JSON.stringify({args:argv,home:process.env.HOME,codexHome:process.env.CODEX_HOME,schema:argv.includes('--output-schema')?JSON.parse(readFileSync(schemaPath,'utf8')):null,hasApiKey:process.env.ANTHROPIC_API_KEY!==undefined,hasNodeOptions:process.env.NODE_OPTIONS!==undefined}));
if(existsSync(new URL('./early-exit',import.meta.url))){process.stdout.write(JSON.stringify({type:'result',result:'I denied everything',structured_output:{tools:[],hooks:[],plugins:[]}}));process.exit(0);}
const config=JSON.parse(readFileSync(process.cwd()+'/investigation-binding-'+process.env.INSRC_REVIEW_NATIVE_BINDING_ID+'.json','utf8'));
const {expiresAt,...binding}=config.binding;
async function call(progress){return new Promise((yes,no)=>{const s=createConnection(config.socket);let text='';s.on('error',no);s.on('connect',()=>s.write(JSON.stringify({...binding,operation:'progress',progress})+'\\n'));s.on('data',c=>{text+=c;const end=text.indexOf('\\n');if(end<0)return;const r=JSON.parse(text.slice(0,end));s.destroy();if(r.ok)yes(r.result);else no(Error('refused'));});});}
for(let i=0;i<2;i++)await call({runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,progressId:'p'+i,expectedSequence:i,blockId:'probe-block-'+(i+1),disposition:'unverified',evidenceIds:[],notes:'synthetic',coverageUpdates:[],findings:[],outstandingWork:[]});
setInterval(()=>{},1000);
`;

async function fixture(kind: 'claude' | 'codex' = 'claude', qualifying = false) {
  const repo = mkdtempSync(join(tmpdir(), 'native-probe-test-'));
  if (kind === 'codex') {
    mkdirSync(join(repo, 'bin'));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: '@openai/codex', type: 'module' }));
    const triple = process.platform === 'linux' ? `${process.arch === 'x64' ? 'x86_64' : 'aarch64'}-unknown-linux-musl` : `${process.arch === 'x64' ? 'x86_64' : 'aarch64'}-apple-darwin`;
    const vendor = join(repo, 'vendor', triple, 'bin'); mkdirSync(vendor, { recursive: true });
    writeFileSync(join(vendor, 'codex'), 'explicitly non-executed runtime fixture', { mode: 0o700 });
  }
  const binary = kind === 'codex' ? join(repo, 'bin', 'codex.js') : join(repo, 'fake-claude.mjs');
  writeFileSync(binary, `#!${process.execPath}\n${actor}`); chmodSync(binary, 0o700);
  const provider = new CliProvider({ kind, binPath: binary });
  if (qualifying) writeFileSync(join(repo,'v2-native'),'explicit scripted native evidence, not installed qualification');
  const f = continuationFixture(), policy = createInvestigationPolicy(provider), probeId = randomUUID(), attemptId = randomUUID();
  const budget = { policy: policy.budget, admitted: admitInvestigationRequest(policy, { turn: f.turn, seed: f.context.seed }, InvestigationReplySchema),
    outputAllowanceTokens: policy.budget.profile.completionReserveTokens, reviewId: probeId, callId: attemptId, stage: 'probe', role: 'probe', attempt: 1 };
  const abort = new AbortController();
  const probe = await createInvestigationProbeFixture({ registeredRepos: [repo], probeId, attemptId,
    sourceMode: 'source-only', budget, signal: abort.signal, assertCurrent: () => {} });
  const command = nativeReviewMcpConfiguration(probe.cwd, false).mcpServers['insrc-scoped-review'];
  const file = (path: string) => ({ path: realpathSync(path), digest: investigationFileDigest(realpathSync(path)) });
  const adapter = kind === 'claude' ? claudeInvestigationAdapter : codexInvestigationAdapter;
  const profile = provider.getReviewBudgetProfile('reviewer-session'), args = adapter.args(InvestigationReplySchema, [], probe.cwd, false);
  const identity = { kind, adapterVersion: adapter.version, binaryVersion: qualifying ? CLAUDE_PROBE_TELEMETRY_VERSION : 'explicitly-nonqualifying-fixture',
    binary: file(binary), runtimeFiles: [...installedInvestigationImages(kind, binary, probe.cwd).filter(pin => pin.path !== binary), file(command.command), file(command.args.find(p => p.endsWith('insrc-review-bridge.ts'))!)],
    profileDigest: digestValue(profile), catalogDigest: scopedReviewCatalogDigest(false), launchDigest: adapter.launchDigest(args, probe.cwd, InvestigationReplySchema) };
  const context = { origin: 'installed-probe' as const, probeId, attemptId, repo, cwd: probe.cwd, sourceMode: 'source-only' as const,
    identity, budget, deadlineAt: Date.now() + 30_000, assertCurrent: () => {}, observe: async () => {},
    runtime: { requestId: randomUUID(), sourceCommit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), fixture: probe } };
  return { repo, provider, probe, abort, context, close: async () => { await probe.dispose(); rmSync(repo, { recursive: true, force: true }); } };
}

test('Trusted probe executes one control and one restricted phase with exact pins and bounded cancellation', async () => {
  const f = await fixture();
  try {
    const grant = issueInvestigationProbeGrant(f.context);
    const result = await f.provider.runInvestigationProbe({ grant, signal: f.abort.signal });
    assert.equal(readFileSync(join(f.repo, 'calls.txt'), 'utf8'), 'called\ncalled\n');
    assert.deepEqual(result.status.observations.filter(o => o.verdict !== 'unverifiable').map(o => o.check), ['durable-progress', 'cancellation-exit', 'cross-run']);
    assert.equal(result.status.state, 'unsupported', 'scripted actor did not establish native effective inventory');
    assert.equal(result.candidate, undefined);
    assert.equal(result.status.usage.modelCalls, null, 'subprocess count is not actual model-call telemetry');
    assert.ok(result.status.missingEvidence.includes('effective-inventory'));
    assert.equal(existsSync(f.probe.bindingPath), false);
    assert.equal(JSON.parse(readFileSync(join(f.probe.root, 'native-output.json'), 'utf8')).exitSignal, 'SIGKILL');
    await assert.rejects(() => f.provider.runInvestigationProbe({ grant, signal: f.abort.signal }), /consumed/);
  } finally { await f.close(); }
  const large = await fixture();
  try {
    (large.probe.tools.seed as Record<string, unknown>)['oversize'] = 'x'.repeat(500_000);
    const grant = issueInvestigationProbeGrant(large.context);
    await assert.rejects(() => large.provider.runInvestigationProbe({ grant, signal: large.abort.signal }));
    assert.equal(existsSync(join(large.repo, 'calls.txt')), false, 'inclusive admission refuses before launch');
  } finally { await large.close(); }
});

test('Complete paired host evidence emits a completed Claude v2 candidate and qualifies through installed authority', async () => {
  const f=await fixture('claude',true);
  try {
    const report=await f.provider.runInvestigationProbe({grant:issueInvestigationProbeGrant(f.context),signal:f.abort.signal});
    assert.equal(report.status.state,'completed');assert.deepEqual(report.status.missingEvidence,[]);
    assert.ok(report.candidate);assert.equal(report.candidate.effective.protocolTools?.[0]?.name,'StructuredOutput');
    assert.equal(report.candidate.effective.evidenceBasis?.length,14);
    assert.ok(report.canaries?.checks.every(c=>c.controlObserved&&!c.restrictedObserved&&c.verdict==='unverifiable'),'raw silence is not rewritten as proof');
    const checked=validateUnsignedProbeExport(report);let verified=0;
    // This explicitly synthetic authority exercises the installed-origin
    // verification callback. It does not publish/approve production evidence or
    // certify this scripted binary as the real installed CLI.
    const q=await qualifyInvestigationAdapter('synthetic-installed-authority',f.context.identity,f.repo,false,{
      origin:'installed-probe',read:async()=>checked.candidate!,verifyInstalled:async(reference,digest)=>{
        verified++;assert.equal(reference,'synthetic-installed-authority');assert.equal(digest,digestValue(checked.candidate));
        inspectUnsignedIsolationEvidence(checked.candidate!,f.context.identity,f.repo,false,['claude-scoped-v2']);
      }},['claude-scoped-v2']);
    assert.equal(verified,1);assert.equal(q.origin,'installed-probe');
    assert.equal(readFileSync(join(f.repo,'calls.txt'),'utf8'),'called\ncalled\n');
    for(const file of report.evidenceFiles??[])assert.ok(file.bytes<=8*1024*1024);
  } finally {await f.close();}
});

test('Internal post-ACK cancellation qualifies only after actual process drain while operator cancellation stays cancelled', async () => {
  const f=await fixture('claude',true);
  try {
    const running=f.provider.runInvestigationProbe({grant:issueInvestigationProbeGrant(f.context),signal:f.abort.signal});
    const watch=setInterval(()=>{if(f.probe.state().sequence>=1)f.abort.abort();},1);
    let report;try{report=await running;}finally{clearInterval(watch);}
    assert.equal(report.status.state,'cancelled');assert.equal(report.candidate,undefined);
    const phase=report.phases?.at(-1);assert.equal(phase?.aborted,true);assert.equal(phase?.exitSignal,'SIGKILL');
  } finally {await f.close();}
});

test('A reachable v2 candidate still refuses inactive controls missing native policy and restricted leaks', async () => {
  for(const [marker,expected] of [['control-claims','unsupported'],['policy-missing','unsupported'],['restricted-leak','failed']] as const){
    const f=await fixture('claude',true);
    try{writeFileSync(join(f.repo,marker),'synthetic negative case');const report=await f.provider.runInvestigationProbe({grant:issueInvestigationProbeGrant(f.context),signal:f.abort.signal});
      assert.equal(report.status.state,expected,marker);assert.equal(report.candidate,undefined,marker);
    }finally{await f.close();}
  }
});

test('Oversized native diagnostics drain the process and are discarded without a retry', async () => {
  const f=await fixture('claude',true);
  try{writeFileSync(join(f.repo,'diagnostic-flood'),'synthetic overflow');
    await assert.rejects(()=>f.provider.runInvestigationProbe({grant:issueInvestigationProbeGrant(f.context),signal:f.abort.signal}),/diagnostic|Diagnostic/);
    assert.equal(readFileSync(join(f.repo,'calls.txt'),'utf8'),'called\ncalled\n');
    assert.equal(existsSync(join(f.probe.cwd,'investigation-debug.log')),false);
  }finally{await f.close();}
});

test('Host-only diagnostic metadata consumes retained bytes but never model context budget', async () => {
  const f=await fixture('claude',true);
  try{writeFileSync(join(f.repo,'metadata-only'),'synthetic host metadata');
    const report=await f.provider.runInvestigationProbe({grant:issueInvestigationProbeGrant(f.context),signal:f.abort.signal});
    assert.equal(f.context.budget.policy.totalTokens,128000);assert.equal(report.status.state,'completed');assert.ok(report.candidate);
    const debug=report.evidenceFiles!.find(f=>f.kind==='native-diagnostic')!;assert.ok(debug.bytes>100000&&debug.bytes<=256*1024);
    assert.ok(report.evidenceFiles!.reduce((n,f)=>n+f.bytes,0)<=8*1024*1024);validateUnsignedProbeExport(report);
  }finally{await f.close();}
});

test('Deleting changing or swapping any evidence basis raw phase pin or candidate refuses qualification', async () => {
  const f=await fixture('claude',true);
  try{
    const report=await f.provider.runInvestigationProbe({grant:issueInvestigationProbeGrant(f.context),signal:f.abort.signal});
    assert.equal(report.status.state,'completed');validateUnsignedProbeExport(report);
    const copy=()=>structuredClone(report);
    let changed=copy();delete changed.candidate;assert.throws(()=>validateUnsignedProbeExport(changed));
    changed=copy();delete changed.candidate;changed.status.state='unsupported';assert.throws(()=>validateUnsignedProbeExport(changed));
    changed=copy();changed.candidate!.validUntil++;assert.throws(()=>validateUnsignedProbeExport(changed));
    changed=copy();changed.candidate!.effective.evidenceBasis![0]!.rawDigests=['0'.repeat(64)];
    changed.candidate!.trace.effectiveDigest=digestValue(changed.candidate!.effective);
    for(const observation of changed.status.observations)observation.effectiveDigest=changed.candidate!.trace.effectiveDigest;
    changed.phases![1]!.effectiveDigest=changed.candidate!.trace.effectiveDigest;
    assert.throws(()=>validateUnsignedProbeExport(changed));
    changed=copy();changed.status.observations[0]!.at++;assert.throws(()=>validateUnsignedProbeExport(changed));
    changed=copy();changed.evidenceFiles=changed.evidenceFiles!.filter(f=>f.kind!=='source-policy');assert.throws(()=>validateUnsignedProbeExport(changed));
    changed=copy();changed.phases![1]!.outputPath=changed.phases![0]!.outputPath;assert.throws(()=>validateUnsignedProbeExport(changed));
    const host=report.evidenceFiles!.find(f=>f.kind==='source-policy')!,original=readFileSync(host.path,'utf8');
    try{const forged=JSON.parse(original);forged.before[0].state='present';const text=JSON.stringify(forged);writeFileSync(host.path,text);
      changed=copy();const descriptor=changed.evidenceFiles!.find(f=>f.kind==='source-policy')!;descriptor.bytes=Buffer.byteLength(text);descriptor.digest=investigationFileDigest(host.path);
      assert.throws(()=>validateUnsignedProbeExport(changed),'even rehashed host data must satisfy source policy');
    }finally{writeFileSync(host.path,original);}
    const native=report.evidenceFiles!.find(f=>f.kind==='native-output')!,originalNative=readFileSync(native.path,'utf8');
    try{const raw=JSON.parse(originalNative);raw.stdout=raw.stdout.split('\n').map((line:string)=>{if(!line)return line;const event=JSON.parse(line);if(event.type==='system'&&event.subtype==='init')event.tools.push('Bash');return JSON.stringify(event);}).join('\n');
      const text=JSON.stringify(raw);writeFileSync(native.path,text);changed=copy();const descriptor=changed.evidenceFiles!.find(f=>f.kind==='native-output')!;
      descriptor.bytes=Buffer.byteLength(text);descriptor.digest=investigationFileDigest(native.path);changed.phases![1]!.outputBytes=descriptor.bytes;
      assert.throws(()=>validateUnsignedProbeExport(changed),'native leak cannot be hidden by rehashed file/phase metadata');
    }finally{writeFileSync(native.path,originalNative);}
    const binary=f.context.identity.binary.path,originalBinary=readFileSync(binary,'utf8');
    try{writeFileSync(binary,originalBinary+'\n// changed runtime');assert.throws(()=>validateUnsignedProbeExport(report));}
    finally{writeFileSync(binary,originalBinary);}
    validateUnsignedProbeExport(report);
  }finally{await f.close();}
});

test('Codex probe preserves strict schema cleanup and actual process drain', async () => {
  const f = await fixture('codex');
  try {
    const result = await f.provider.runInvestigationProbe({ grant: issueInvestigationProbeGrant(f.context), signal: f.abort.signal });
    const observed = JSON.parse(readFileSync(join(f.repo, 'bin', 'observed.json'), 'utf8'));
    assert.equal(observed.args.includes('--ignore-user-config'), true);
    assert.equal(observed.args.includes('--strict-config'), true);
    assert.equal(observed.schema.additionalProperties, false);
    assert.equal(observed.codexHome, process.env['CODEX_HOME']);
    assert.equal(result.status.state, 'unsupported');
    assert.equal(result.candidate, undefined);
    assert.ok(result.status.observations.some(o => o.check === 'cancellation-exit' && o.verdict === 'observed-allowed'));
    assert.equal(existsSync(join(f.probe.cwd, 'investigation-schema.json')), false);
    assert.equal(existsSync(f.probe.bindingPath), false);
    assert.equal(readFileSync(join(f.repo, 'bin', 'calls.txt'), 'utf8'), 'called\n');
  } finally { await f.close(); }
  const missing = await fixture('codex');
  try {
    const identity = { ...missing.context.identity, runtimeFiles: missing.context.identity.runtimeFiles.filter(pin => !pin.path.includes('/vendor/')) };
    await assert.rejects(() => missing.provider.runInvestigationProbe({ grant: issueInvestigationProbeGrant({ ...missing.context, identity }), signal: missing.abort.signal }), /absent or stale/);
    assert.equal(existsSync(join(missing.repo, 'bin', 'calls.txt')), false);
  } finally { await missing.close(); }
});

test('Claude probe retains OAuth without credential copies and never fabricates cancellation proof', async () => {
  for (const early of [false, true]) {
    const f = await fixture();
    try {
      if (early) writeFileSync(join(f.repo, 'early-exit'), 'fixture');
      const result = await f.provider.runInvestigationProbe({ grant: issueInvestigationProbeGrant(f.context), signal: f.abort.signal });
      const observed = JSON.parse(readFileSync(join(f.repo, 'observed.json'), 'utf8'));
      assert.equal(observed.home, process.env['HOME']);
      assert.equal(observed.hasApiKey, false);
      assert.equal(observed.hasNodeOptions, false);
      assert.equal(observed.args.includes('--bare'), false);
      assert.equal(result.candidate, undefined);
      assert.equal(result.status.state, 'unsupported');
      assert.equal(result.status.observations.some(o => o.check === 'cancellation-exit'), !early);
      assert.equal(existsSync(join(f.probe.cwd, 'auth.json')), false);
      assert.equal(existsSync(join(f.probe.cwd, '.credentials.json')), false);
    } finally { await f.close(); }
  }
});

test('Production native session refuses probe grants and unchanged installed-proof checks hold', async () => {
  const f = await fixture();
  try {
    const grant = issueInvestigationProbeGrant(f.context);
    await assert.rejects(() => inspectQualifiedInvestigationBinding(grant as unknown as QualifiedInvestigationSessionBinding, f.context.identity), /Untrusted/);
    await assert.rejects(() => f.provider.runReviewSession('never launch', InvestigationReplySchema, { cwd: f.repo, deadlineMs: 1000,
      investigationBinding: grant as unknown as QualifiedInvestigationSessionBinding }), /Untrusted/);
    assert.equal(existsSync(join(f.repo, 'calls.txt')), false);
    writeFileSync(f.context.identity.binary.path, 'changed installed bytes');
    await assert.rejects(() => f.provider.runInvestigationProbe({ grant, signal: f.abort.signal }), /runtime changed/);
    assert.equal(existsSync(join(f.repo, 'calls.txt')), false);
  } finally { await f.close(); }
});

test('Probe capture overflow and spawn observation failure drain the actual process', async () => {
  const overflow = await runInProcessGroup(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'],
    { timeoutMs: 5000, maxOutputBytes: 1000 });
  assert.equal(overflow.outputLimitExceeded, true);
  assert.ok(Buffer.byteLength(overflow.stdout) <= 1000);
  const failed = await runInProcessGroup(process.execPath, ['-e', 'setInterval(()=>{},1000)'],
    { timeoutMs: 5000, onSpawn: () => { throw Error('observer failed'); } });
  assert.equal(failed.observerFailed, true);
  assert.equal(failed.timedOut, false);
});

test('Restricted capability leaks fail and control-phase evidence cannot qualify production', async () => {
  const leak = await fixture();
  try {
    writeFileSync(join(leak.repo, 'restricted-leak'), 'fixture');
    const report = await leak.provider.runInvestigationProbe({ grant: issueInvestigationProbeGrant(leak.context), signal: leak.abort.signal });
    assert.equal(report.status.state, 'failed'); assert.equal(report.candidate, undefined);
    assert.ok(report.status.observations.some(o => o.check === 'hooks' && o.verdict === 'observed-allowed'));
    assert.ok(report.canaries?.checks.find(c => c.capability === 'hooks')?.restrictedObserved);
    assert.deepEqual(report.phases?.map(p => p.phase), ['control', 'restricted']);
    assert.notEqual(report.phases?.[0]?.launchDigest, report.phases?.[1]?.launchDigest);
    assert.equal(report.phases?.[1]?.launchDigest, report.status.identity?.launchDigest);
  } finally { await leak.close(); }
  const claims = await fixture();
  try {
    writeFileSync(join(claims.repo, 'control-claims'), 'fixture');
    const report = await claims.provider.runInvestigationProbe({ grant: issueInvestigationProbeGrant(claims.context), signal: claims.abort.signal });
    assert.equal(report.candidate, undefined); assert.equal(report.status.state, 'unsupported');
    assert.ok(report.canaries?.checks.every(c => !c.controlObserved && c.verdict === 'unverifiable'));
    assert.equal(report.status.observations.find(o => o.check === 'approval')?.verdict, 'unverifiable');
    assert.equal(report.status.observations.find(o => o.check === 'cross-run')?.verdict, 'observed-denied');
  } finally { await claims.close(); }
});

test('Combined phase deadline budget capture bounds and shared provider lane prevent retries or overlap', async () => {
  const f = await fixture();
  try {
    const report = await f.provider.runInvestigationProbe({ grant: issueInvestigationProbeGrant(f.context), signal: f.abort.signal });
    assert.equal(readFileSync(join(f.repo, 'calls.txt'), 'utf8'), 'called\ncalled\n');
    assert.ok(report.phases![1]!.startedAt >= report.phases![0]!.endedAt);
    assert.ok(report.evidenceFiles!.reduce((n, file) => n + file.bytes, 0) <= 8 * 1024 * 1024);
    assert.equal(report.status.usage.modelCalls, null);
  } finally { await f.close(); }
  const large = await fixture();
  try {
    (large.probe.tools.seed as Record<string, unknown>)['extra'] = 'x'.repeat(120_000);
    await assert.rejects(() => large.provider.runInvestigationProbe({ grant: issueInvestigationProbeGrant(large.context), signal: large.abort.signal }), /Inclusive paired probe budget/);
    assert.equal(existsSync(join(large.repo, 'calls.txt')), false);
  } finally { await large.close(); }
  const slow = await fixture();
  try {
    writeFileSync(join(slow.repo, 'slow-control'), 'fixture');
    const grant = issueInvestigationProbeGrant({ ...slow.context, deadlineAt: Date.now() + 250 });
    await assert.rejects(() => slow.provider.runInvestigationProbe({ grant, signal: slow.abort.signal }), /control failed|deadline elapsed/i);
    assert.equal(existsSync(join(slow.repo, 'observed.json')), false, 'restricted child never starts after failed control');
    if (existsSync(join(slow.repo, 'calls.txt'))) assert.equal(readFileSync(join(slow.repo, 'calls.txt'), 'utf8'), 'called\n');
    await assert.rejects(() => slow.provider.runInvestigationProbe({ grant, signal: slow.abort.signal }), /consumed/);
  } finally { await slow.close(); }
});

test('Raw phase export rejects tampering foreign roots stale pins and control-to-production promotion', async () => {
  const f = await fixture();
  try {
    const report = await f.provider.runInvestigationProbe({ grant: issueInvestigationProbeGrant(f.context), signal: f.abort.signal });
    assert.equal(validateUnsignedProbeExport(report).candidate, undefined);
    const clone = () => JSON.parse(JSON.stringify(report)) as typeof report;
    const promoted = clone(); promoted.phases![1]!.outputPath = promoted.phases![0]!.outputPath;
    assert.throws(() => validateUnsignedProbeExport(promoted));
    const overlap = clone(); overlap.phases![1]!.startedAt = overlap.phases![0]!.startedAt - 1;
    assert.throws(() => validateUnsignedProbeExport(overlap));
    const foreign = clone(); foreign.phases![1]!.attemptId = randomUUID();
    assert.throws(() => validateUnsignedProbeExport(foreign));
    const outside = clone(); outside.canaries!.manifestPath = '/etc/passwd';
    assert.throws(() => validateUnsignedProbeExport(outside));
    const path = report.phases![0]!.outputPath!, before = readFileSync(path, 'utf8');
    writeFileSync(path, before + ' '); assert.throws(() => validateUnsignedProbeExport(report)); writeFileSync(path, before);
    const settings = join(f.probe.cwd, '.claude', 'settings.json'), original = readFileSync(settings, 'utf8');
    writeFileSync(settings, '{}'); assert.throws(() => validateUnsignedProbeExport(report), /changed/); writeFileSync(settings, original);
    writeFileSync(f.context.identity.binary.path, 'changed runtime');
    assert.throws(() => validateUnsignedProbeExport(report), /stale/);
  } finally { await f.close(); }
});
