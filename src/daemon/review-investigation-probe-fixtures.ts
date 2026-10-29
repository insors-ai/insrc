/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, openSync, closeSync, fsyncSync, fstatSync, constants, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import type { ReviewExecutionBudget } from '../shared/review-budget.js';
import { PROBE_OBSERVATION_BYTES } from '../shared/review-investigation-probe.js';
import type { InvestigationTools, InvestigationState, InvestigationTurnV1 } from '../workflow/code-review/investigation/continuation-types.js';
import { digestValue, snapshotValue } from '../workflow/code-review/investigation/identity.js';
import { ScopedReviewBridge } from './review-investigation-bridge.js';
import { startNativeReviewBroker } from '../mcp/review-investigation-native.js';
import { nativeReviewMcpConfiguration } from '../agent/providers/native-investigation-session.js';

interface ProbeFixtureOptions {
  readonly registeredRepos: readonly string[];
  readonly probeId: string;
  readonly attemptId: string;
  readonly sourceMode: 'source-only' | 'indexed-impact';
  readonly budget: ReviewExecutionBudget;
  readonly signal: AbortSignal;
  readonly assertCurrent: () => void;
}
const contains = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'));
};

/** Synthetic work only. No canonical subject, production qualification or source
 * adapter is constructed. Silence of a canary is NOT evidence of denial. */
export async function createInvestigationProbeFixture(options: ProbeFixtureOptions) {
  options.signal.throwIfAborted(); options.assertCurrent();
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-p-'))), cwd = join(root, 'cwd');
  let journal: number | undefined, broker: Awaited<ReturnType<typeof startNativeReviewBroker>> | undefined;
  const abort = new AbortController(), signal = AbortSignal.any([options.signal, abort.signal]);
  const clients = new Set<Socket>(), network = createServer(socket => {
    clients.add(socket); socket.on('close', () => clients.delete(socket)); socket.on('error', () => {});
    try { append({ kind: 'canary-hit', capability: 'network' }); } catch (cause) { failure = cause; abort.abort(); }
    socket.end('probe canary\n');
  });
  let failure: unknown, closing: Promise<void> | undefined;
  const bridge = new ScopedReviewBridge(`probe-${randomUUID()}`, options.assertCurrent);
  function append(value: unknown) {
    signal.throwIfAborted(); options.assertCurrent();
    if (journal === undefined) throw Error('Probe journal closed');
    const line = JSON.stringify({ version: 1, probeId: options.probeId, attemptId: options.attemptId, value }) + '\n';
    if (Buffer.byteLength(line) + fstatSync(journal).size > PROBE_OBSERVATION_BYTES) {
      failure = new Error('Probe observation limit exceeded'); abort.abort(); throw failure;
    }
    writeFileSync(journal, line); fsyncSync(journal);
  }
  async function close() {
    if (closing) return closing;
    closing = Promise.resolve().then(async () => {
      signal.removeEventListener('abort', onAbort); abort.abort();
      try { await bridge.shutdown(); }
      finally {
        try { if (broker) await broker.close(); }
        finally {
          for (const client of clients) client.destroy();
          if (network.listening) await new Promise<void>(resolve => network.close(() => resolve()));
          if (journal !== undefined) { closeSync(journal); journal = undefined; }
        }
      }
    });
    return closing;
  }
  const onAbort = () => { void close().catch(cause => { failure = cause; }); };
  network.on('error', cause => { failure = cause; abort.abort(); });
  try {
    for (const path of options.registeredRepos.map(path => realpathSync(path))) {
      if (contains(path, root) || contains(root, path)) throw Error('Probe root overlaps a registered repository');
    }
    mkdirSync(cwd, { mode: 0o700 });
    const journalPath = join(root, 'observations.jsonl');
    journal = openSync(journalPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    const marker = randomUUID(), canaryPath = join(root, 'filesystem-canary.txt');
    writeFileSync(canaryPath, `insrc inert canary ${marker}\n`, { mode: 0o600 });
    const shadow = join(root, 'synthetic-config'); mkdirSync(shadow, { mode: 0o700 });
    for (const name of ['CLAUDE.md', 'AGENTS.md', 'hook-marker.txt', 'plugin-marker.txt'])
      writeFileSync(join(shadow, name), `inert probe marker ${marker}\n`, { mode: 0o600 });
    // An inert MCP canary lives only in the synthetic root. It is never added to
    // the real user's MCP configuration and never reads OAuth material.
    const fakeMcp = join(shadow, 'canary-mcp.mjs'), mcpHit = join(root, 'mcp-canary-hit.jsonl');
    writeFileSync(fakeMcp, `import {appendFileSync} from 'node:fs';\nimport {createInterface} from 'node:readline';\nappendFileSync(${JSON.stringify(mcpHit)},JSON.stringify({kind:'canary-hit',capability:'mcp',marker:${JSON.stringify(marker)}})+'\\n',{mode:0o600});\ncreateInterface({input:process.stdin}).on('line',line=>{try{const r=JSON.parse(line);if(r.id===undefined)return;const result=r.method==='initialize'?{protocolVersion:r.params?.protocolVersion??'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'inert-probe',version:'1'}}:r.method==='tools/list'?{tools:[]}:{content:[{type:'text',text:'inert canary'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');}catch{}});\n`, { mode: 0o600 });
    writeFileSync(join(shadow, 'synthetic-mcp.json'), JSON.stringify({ mcpServers: { 'inert-probe': { command: realpathSync(process.execPath), args: [fakeMcp] } } }), { mode: 0o600 });
    await new Promise<void>((resolve, reject) => { network.once('error', reject); network.listen(0, '127.0.0.1', () => { network.removeListener('error', reject); resolve(); }); });
    const address = network.address(); if (!address || typeof address === 'string') throw Error('Probe listener unavailable');
    const blockIds = ['probe-block-1', 'probe-block-2'] as const;
    const subjectDigest = digestValue({ probeId: options.probeId, attemptId: options.attemptId, blockIds, marker });
    const turn: InvestigationTurnV1 = { runId: `probe-${options.probeId}`, subjectDigest, generation: 1,
      attemptId: options.attemptId, requestDigest: digestValue({ marker, subjectDigest }), policyDigest: digestValue(options.budget.policy),
      assignment: [...blockIds], navigationRefs: blockIds.map(id => `fixture:${id}`), unresolvedRefs: [], priorAcceptedCheckpoint: 'probe-initial',
      limits: { attemptMs: 300000, activeMsRemaining: 300000, continuationsRemaining: 1, inclusiveTokenLimit: 128000 } };
    let state: InvestigationState = { ledger: { runId: turn.runId, subjectDigest, evidence: [], coverage: [], findings: [] },
      sequence: 0, checkpoint: 'probe-initial', accepted: [], consumedActiveMs: 0, attempts: 1, uncertainProgressId: null, usage: [] };
    const tools: InvestigationTools = {
      seed: { probeOnly: true, scope: { subjectDigest, packets: [{ blocks: blockIds.map(blockId => ({ blockId })) }] } },
      impact: { mode: options.sourceMode, index: null, queryChangedEntityCallers: options.sourceMode === 'indexed-impact' ? async () => [] : null },
      execution: { budget: options.budget, timeoutMs: 300000, stallMs: 300000, internalRetry: false },
      read: async reference => {
        signal.throwIfAborted(); options.assertCurrent();
        if (!turn.navigationRefs.includes(reference)) throw Error('Probe reads only synthetic navigation references');
        return { reference, sourceDigest: digestValue(reference), contentRef: reference, text: 'Synthetic probe block; checkpoint it without findings.',
          lines: [1, 1], completeness: 'complete', limitations: ['Synthetic probe; no repository or index evidence'], evidenceId: reference };
      },
      progress: async progress => {
        signal.throwIfAborted(); options.assertCurrent();
        const copy = snapshotValue(progress), payloadDigest = digestValue(copy);
        const prior = state.accepted.find(p => p.progress.progressId === copy.progressId);
        if (prior) { if (prior.payloadDigest !== payloadDigest) throw Error('Conflicting probe progress replay'); return prior.receipt; }
        if (copy.runId !== turn.runId || copy.subjectDigest !== subjectDigest || copy.generation !== turn.generation || copy.attemptId !== turn.attemptId ||
          copy.expectedSequence !== state.sequence || copy.blockId !== blockIds[state.sequence] || copy.coverageUpdates.length || copy.findings.length ||
          copy.evidenceIds.length || copy.outstandingWork.length) throw Error('Invalid synthetic probe checkpoint');
        const receipt = { runId: turn.runId, subjectDigest, generation: 1, progressId: copy.progressId, blockId: copy.blockId,
          sequence: state.sequence + 1, checkpointDigest: digestValue({ previous: state.checkpoint, payloadDigest }) };
        append({ kind: 'block-ack', progress: copy, receipt }); // fsync before ACK
        state = { ...state, sequence: receipt.sequence, checkpoint: receipt.checkpointDigest,
          accepted: [...state.accepted, { payloadDigest, progress: copy, receipt }] };
        return receipt;
      },
    };
    const grant = bridge.issue({ repo: cwd, turn, tools, peer: 'native-cli', signal, ttlMs: 300000,
      assertCurrent: options.assertCurrent, state: () => state });
    broker = await startNativeReviewBroker(cwd, grant.binding, raw => bridge.dispatch(raw, 'native-cli'));
    const configuration = nativeReviewMcpConfiguration(cwd, options.sourceMode === 'indexed-impact');
    writeFileSync(join(cwd, 'investigation-mcp.json'), JSON.stringify(configuration), { mode: 0o600 });
    writeFileSync(join(cwd, 'investigation-settings.json'), '{}', { mode: 0o600 });
    signal.addEventListener('abort', onAbort, { once: true });
    signal.throwIfAborted();
    return { root, cwd, turn, tools, binding: grant.binding, bindingPath: broker.bindingPath,
      journalPath, canaryPath, syntheticConfig: shadow, networkUrl: `http://127.0.0.1:${address.port}/`,
      state: () => snapshotValue(state), error: () => failure,
      dispatch: (raw: unknown) => bridge.dispatch(raw, 'native-cli'),
      close,
      // Preserve immutable configuration/evidence after close for independent
      // attestation; only explicit disposal removes this daemon-created root.
      dispose: async () => { await close(); rmSync(root, { recursive: true, force: true }); },
    };
  } catch (cause) {
    await close(); rmSync(root, { recursive: true, force: true }); throw cause;
  }
}
