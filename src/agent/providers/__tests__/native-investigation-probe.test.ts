/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliProvider } from '../cli-provider.js';
import { issueInvestigationProbeGrant } from '../investigation-probe-grant.js';
import { investigationFileDigest, inspectQualifiedInvestigationBinding } from '../investigation-session.js';
import { claudeInvestigationAdapter } from '../claude-investigation-session.js';
import { nativeReviewMcpConfiguration } from '../native-investigation-session.js';
import { createInvestigationProbeFixture } from '../../../daemon/review-investigation-probe-fixtures.js';
import { createInvestigationPolicy, admitInvestigationRequest } from '../../../workflow/code-review/investigation/continuation-policy.js';
import { continuationFixture } from '../../../workflow/code-review/investigation/__tests__/continuation-fixtures.js';
import { InvestigationReplySchema } from '../../../shared/review-investigation.js';
import { scopedReviewCatalogDigest } from '../../../shared/review-investigation-catalog.js';
import { digestValue } from '../../../workflow/code-review/investigation/identity.js';
import { runInProcessGroup } from '../../../shared/process-group.js';
import type { QualifiedInvestigationSessionBinding } from '../../../shared/types.js';

const actor = `import {readFileSync,appendFileSync,writeFileSync,existsSync} from 'node:fs';
import {createConnection} from 'node:net';
appendFileSync(new URL('./calls.txt',import.meta.url),'called\\n');
let input='';for await(const c of process.stdin)input+=c;
const {turn}=JSON.parse(input.split('\\n').at(-1));
writeFileSync(new URL('./observed.json',import.meta.url),JSON.stringify({args:process.argv.slice(2),home:process.env.HOME,hasApiKey:process.env.ANTHROPIC_API_KEY!==undefined,hasNodeOptions:process.env.NODE_OPTIONS!==undefined}));
if(existsSync(new URL('./early-exit',import.meta.url))){process.stdout.write(JSON.stringify({type:'result',result:'I denied everything',structured_output:{tools:[],hooks:[],plugins:[]}}));process.exit(0);}
const config=JSON.parse(readFileSync(process.cwd()+'/investigation-binding-'+process.env.INSRC_REVIEW_NATIVE_BINDING_ID+'.json','utf8'));
const {expiresAt,...binding}=config.binding;
async function call(progress){return new Promise((yes,no)=>{const s=createConnection(config.socket);let text='';s.on('error',no);s.on('connect',()=>s.write(JSON.stringify({...binding,operation:'progress',progress})+'\\n'));s.on('data',c=>{text+=c;const end=text.indexOf('\\n');if(end<0)return;const r=JSON.parse(text.slice(0,end));s.destroy();if(r.ok)yes(r.result);else no(Error('refused'));});});}
for(let i=0;i<2;i++)await call({runId:turn.runId,subjectDigest:turn.subjectDigest,generation:turn.generation,attemptId:turn.attemptId,progressId:'p'+i,expectedSequence:i,blockId:'probe-block-'+(i+1),disposition:'unverified',evidenceIds:[],notes:'synthetic',coverageUpdates:[],findings:[],outstandingWork:[]});
setInterval(()=>{},1000);
`;

async function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'native-probe-test-')), binary = join(repo, 'fake-claude.mjs');
  writeFileSync(binary, `#!${process.execPath}\n${actor}`); chmodSync(binary, 0o700);
  const provider = new CliProvider({ kind: 'claude', binPath: binary });
  const f = continuationFixture(), policy = createInvestigationPolicy(provider), probeId = randomUUID(), attemptId = randomUUID();
  const budget = { policy: policy.budget, admitted: admitInvestigationRequest(policy, { turn: f.turn, seed: f.context.seed }, InvestigationReplySchema),
    outputAllowanceTokens: policy.budget.profile.completionReserveTokens, reviewId: probeId, callId: attemptId, stage: 'probe', role: 'probe', attempt: 1 };
  const abort = new AbortController();
  const probe = await createInvestigationProbeFixture({ registeredRepos: [repo], probeId, attemptId,
    sourceMode: 'source-only', budget, signal: abort.signal, assertCurrent: () => {} });
  const command = nativeReviewMcpConfiguration(probe.cwd, false).mcpServers['insrc-scoped-review'];
  const file = (path: string) => ({ path: realpathSync(path), digest: investigationFileDigest(realpathSync(path)) });
  const profile = provider.getReviewBudgetProfile('reviewer-session'), args = claudeInvestigationAdapter.args(InvestigationReplySchema, [], probe.cwd, false);
  const identity = { kind: 'claude' as const, adapterVersion: claudeInvestigationAdapter.version, binaryVersion: 'explicitly-nonqualifying-fixture',
    binary: file(binary), runtimeFiles: [file(command.command), file(command.args.find(p => p.endsWith('insrc-review-bridge.ts'))!)],
    profileDigest: digestValue(profile), catalogDigest: scopedReviewCatalogDigest(false), launchDigest: claudeInvestigationAdapter.launchDigest(args, probe.cwd, InvestigationReplySchema) };
  const context = { origin: 'installed-probe' as const, probeId, attemptId, repo, cwd: probe.cwd, sourceMode: 'source-only' as const,
    identity, budget, deadlineAt: Date.now() + 30_000, assertCurrent: () => {}, observe: async () => {},
    runtime: { requestId: randomUUID(), sourceCommit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64), fixture: probe } };
  return { repo, provider, probe, abort, context, close: async () => { await probe.dispose(); rmSync(repo, { recursive: true, force: true }); } };
}

test('Trusted probe executes once with exact pinned launch, inclusive budget and bounded cancellation', async () => {
  const f = await fixture();
  try {
    const grant = issueInvestigationProbeGrant(f.context);
    const result = await f.provider.runInvestigationProbe({ grant, signal: f.abort.signal });
    assert.equal(readFileSync(join(f.repo, 'calls.txt'), 'utf8'), 'called\n');
    assert.deepEqual(result.status.observations.filter(o => o.verdict !== 'unverifiable').map(o => o.check), ['durable-progress', 'cancellation-exit']);
    assert.equal(result.status.state, 'unsupported', 'scripted actor did not establish native effective inventory');
    assert.equal(result.candidate, undefined);
    assert.equal(result.status.usage.modelCalls, null, 'subprocess count is not actual model-call telemetry');
    assert.ok(result.status.missingEvidence.includes('effective-inventory'));
    assert.equal(existsSync(f.probe.bindingPath), false);
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
