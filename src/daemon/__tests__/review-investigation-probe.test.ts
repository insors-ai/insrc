/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Worker, isMainThread } from 'node:worker_threads';
import { createConnection } from 'node:net';
import { setImmediate } from 'node:timers/promises';
import { InvestigationProbeService } from '../review-investigation-probe.js';
import type { ProbeServiceOptions } from '../review-investigation-probe.js';
import { probeTransport } from '../review-investigation-gateway.js';
import { buildHandlerRuntime } from '../handler-runtime.js';
import { methodClasses, MAIN_DAEMON_CONNECTION_METHODS } from '../threads/method-class.js';
import { Router } from '../threads/router.js';
import { TargetRegistry } from '../threads/registry.js';
import { directDispatch, IpcServer } from '../server.js';
import { rpc } from '../../shared/ipc-client.js';
import { acquireInvestigationProvider } from '../review-investigation-provider-lane.js';
import { digestValue } from '../../workflow/code-review/investigation/identity.js';
import { PROBE_RESPONSE_BYTES, PROBE_REQUIRED_CHECKS } from '../../shared/review-investigation-probe.js';

const method = 'codeReview.investigation.probe';
function start(repo: string) { return { version: 1, operation: 'start', requestId: randomUUID(), repo, sourceMode: 'source-only',
  reviewBudget: { version: 1, hostContextReserveTokens: 100, profile: { profileVersion: 1, providerId: 'host', transport: 'controller', transportVersion: '1',
    schemaDialect: 'controller-json-v1', promptDialect: 'controller-frame-v1', qualification: 'controller-reserved', declaredToolsJson: '[]',
    nativeReserveTokens: 0, transportReserveTokens: 0, completionReserveTokens: 100, inspectionReserveTokens: 0 } } }; }
const execute: ProbeServiceOptions['execute'] = async (_request, status) => ({ version: 1, kind: 'review-investigation-probe-observations',
  origin: 'unsigned-installed-observations', sourceCommit: 'a'.repeat(40), sourceDigest: 'b'.repeat(64),
  status: { ...status, state: 'unsupported', endedAt: Date.now(), missingEvidence: ['fixture-does-not-qualify-native'] } });
async function fixture(run = execute) {
  const root = mkdtempSync(join(tmpdir(), 'probe-service-')), repo = join(root, 'repo');
  const { mkdirSync } = await import('node:fs'); mkdirSync(repo);
  const options: ProbeServiceOptions = { directory: join(root, 'records'), assertOwner: () => assert.equal(isMainThread, true), registeredRepos: async () => [repo], execute: run };
  const service = new InvestigationProbeService(options);
  return { root, repo, options, service, close: () => rmSync(root, { recursive: true, force: true }) };
}
async function terminal(service: InvestigationProbeService, repo: string, probeId: string) {
  for (let i = 0; i < 100; i++) {
    const result = await service.dispatch({ version: 1, operation: 'status', repo, probeId });
    if (!['queued', 'running', 'cancelling'].includes((result.status as { state: string }).state)) return result;
    await setImmediate();
  }
  throw Error('Probe fixture did not settle');
}

test('Real routed probe IPC registers all operations on owning main daemon and strict gateway dispatcher', async () => {
  const f = await fixture();
  const none = {} as never;
  const runtime = buildHandlerRuntime({ db: none, configStore: none, queue: none, indexer: none, startedAt: 0,
    shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
    probeHandler: params => probeTransport(params, async () => f.service) });
  assert.equal(typeof runtime.rpcHandlers[method], 'function');
  assert.equal(methodClasses.classOf(method), 'session'); assert.equal(MAIN_DAEMON_CONNECTION_METHODS.has(method), true);
  const router = new Router({ classOf: methodClasses.classOf, registry: new TargetRegistry(), routed: new Set(['session']),
    local: directDispatch(runtime.rpcHandlers, runtime.streamHandlers), holdMs: 100 });
  const socket = join(f.root, 'ipc.sock'), server = new IpcServer(router.forward, Date.now, socket);
  const ask = (params: unknown) => rpc<Record<string, unknown>>(method, params, () => createConnection(socket), { timeoutMs: 5000 });
  const workerAsk = async (params: unknown) => {
    const worker = new Worker(new URL('./helpers/probe-ipc-worker.mjs', import.meta.url), { workerData: { socket, params } });
    try { return await new Promise<Record<string, unknown>>((resolve, reject) => { worker.once('message', value => value.error ? reject(Error(value.error)) : resolve(value.result)); worker.once('error', reject); }); }
    finally { await worker.terminate(); }
  };
  try {
    await server.listen();
    const accepted = await ask(start(f.repo)), probeId = (accepted.status as { probeId: string }).probeId;
    await terminal(f.service, f.repo, probeId);
    for (const operation of ['status', 'cancel', 'export']) {
      const result = await workerAsk({ version: 1, operation, repo: f.repo, probeId });
      assert.equal((result.status as { probeId: string }).probeId, probeId);
    }
    const fromWorker = await workerAsk(start(f.repo)), second = (fromWorker.status as { probeId: string }).probeId;
    await terminal(f.service, f.repo, second);
    assert.equal(fromWorker.kind, 'investigation-probe');
  } finally { await server.close(); f.close(); }
});

test('Probe UUID replay/conflict, crash interruption, readonly status and bounded export', async () => {
  let calls = 0;
  const f = await fixture(async (...args) => { calls++; return execute(...args); });
  const release = await acquireInvestigationProvider(new AbortController().signal);
  try {
    const request = start(f.repo), first = await f.service.dispatch(request), probeId = (first.status as { probeId: string }).probeId;
    const replayed = await f.service.dispatch(request);
    assert.equal((replayed.status as { probeId: string }).probeId, probeId); assert.equal(calls, 0);
    await assert.rejects(() => f.service.dispatch({ ...request, sourceMode: 'indexed-impact' }), /payload conflict/);
    const file = join(f.options.directory, `${probeId}.json`), before = readFileSync(file, 'utf8');
    await f.service.dispatch({ version: 1, operation: 'status', repo: f.repo, probeId }); assert.equal(readFileSync(file, 'utf8'), before);
    await f.service.dispatch({ version: 1, operation: 'cancel', repo: f.repo, probeId }); assert.equal(calls, 0);
    release();
    const nextRequest = start(f.repo), next = await f.service.dispatch(nextRequest), nextId = (next.status as { probeId: string }).probeId;
    await terminal(f.service, f.repo, nextId);
    const exported = await f.service.dispatch({ version: 1, operation: 'export', repo: f.repo, probeId: nextId });
    assert.equal((exported.report as { candidate?: unknown }).candidate, undefined);
    const interruptedRequest = start(f.repo), interruptedId = randomUUID();
    const saved = JSON.parse(readFileSync(join(f.options.directory, `${nextId}.json`), 'utf8'));
    saved.request = interruptedRequest; saved.requestDigest = digestValue(interruptedRequest);
    Object.assign(saved.status, { probeId: interruptedId, requestId: interruptedRequest.requestId, state: 'running' }); delete saved.report;
    writeFileSync(join(f.options.directory, `${interruptedId}.json`), JSON.stringify(saved), { mode: 0o600 });
    const restarted = new InvestigationProbeService(f.options), count = calls;
    const replay = await restarted.dispatch(interruptedRequest);
    assert.equal((replay.status as { state: string }).state, 'interrupted');
    await assert.rejects(() => restarted.dispatch({ version: 1, operation: 'export', repo: f.repo, probeId: interruptedId }), /incomplete/);
    await setImmediate(); assert.equal(calls, count);
    await assert.rejects(() => f.service.dispatch({ ...start(f.repo), reviewBudget: { ...request.reviewBudget,
      profile: { ...request.reviewBudget.profile, declaredToolsJson: 'x'.repeat(PROBE_RESPONSE_BYTES) } } }), /exceeds bound/);
    assert.ok(readdirSync(f.options.directory).every(name => !name.startsWith('temp-')));
  } finally { release(); f.close(); }
});

test('Malformed probe never enters production investigation or legacy parsers', async () => {
  let factories = 0;
  const provider = async () => { factories++; throw Error('must not reach service'); };
  for (const packet of [{}, { ...start('/missing'), prompt: 'arbitrary source' }, { version: 2, operation: 'start' },
    { phase: 'investigation', version: 1, engine: 'plan-investigation-v1', command: {} }]) {
    const result = await probeTransport(packet, provider);
    assert.equal(result.next, 'error'); assert.equal(result.legacyFallback, false);
  }
  assert.equal(factories, 0);
});

test('Oversized unsigned candidate fails explicitly instead of exporting truncated evidence', async () => {
  const f = await fixture(async (request, status) => {
    const base = await execute(request, status, new AbortController().signal, async () => {});
    const hash = 'a'.repeat(64), identity = { kind: 'claude' as const, adapterVersion: 'nonqualifying-fixture', binaryVersion: 'fixture',
      binary: { path: '/synthetic/bin', digest: hash }, runtimeFiles: [], profileDigest: hash, catalogDigest: hash, launchDigest: hash };
    return { ...base, status: { ...base.status, state: 'completed', identity, missingEvidence: [],
      observations: PROBE_REQUIRED_CHECKS.map(check => ({ check, verdict: check === 'durable-progress' || check === 'cancellation-exit' ? 'observed-allowed' : 'observed-denied',
        attemptId: status.attemptId, launchDigest: hash, effectiveDigest: hash, observationDigest: hash, provenance: 'runtime-event', detail: 'synthetic boundary fixture only', at: 1 })) },
      candidate: { version: 1, identity, effective: { cwd: '/synthetic', configFiles: [{ path: '/synthetic/config', digest: hash }],
        builtinTools: [], inheritedConfigSources: [], mcpServers: ['insrc-scoped-review'], plugins: [], hooks: [], repositoryInstructions: [], credentialCopies: [],
        auth: 'existing-cli-oauth', catalog: ['x'.repeat(PROBE_RESPONSE_BYTES)] }, trace: { effectiveDigest: hash, events: [] }, validUntil: Date.now() + 1000 } };
  });
  try {
    const first = await f.service.dispatch(start(f.repo)), probeId = (first.status as { probeId: string }).probeId;
    const final = await terminal(f.service, f.repo, probeId), status = final.status as { state: string; missingEvidence: string[] };
    assert.equal(status.state, 'failed'); assert.ok(status.missingEvidence.includes('probe-evidence-bound-exceeded'));
    await assert.rejects(() => f.service.dispatch({ version: 1, operation: 'export', repo: f.repo, probeId }), /incomplete/);
  } finally { f.close(); }
});
