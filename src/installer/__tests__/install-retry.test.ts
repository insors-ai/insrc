import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { managerFixture } from './_manager-fixture.js';
import { ControllerStore } from '../controller-store.js';
import { InstallerError } from '../contracts.js';
import type { DependencyReport } from '../contracts.js';
import { createDependencyOperationContext, requireDependencyOperation, requireDependencyRetry } from '../dependency-context.js';
import { dependencyAttemptIdentity } from '../ollama-policy.js';
import { dependencyLockIdentity, ensureDependencyDirectory, writeDependencyRecord } from '../ollama-records.js';
import { canonicalJson } from '../release-descriptor.js';
import { controlBinding } from '../native.js';
import { dependencyPort } from '../dependencies.js';
import { ollamaFixture } from './_ollama-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { requireTerminal } from '../terminal-admission.js';
import { runTerminalInstall } from '../terminal-install.js';
import type { TerminalUI } from '../terminal-install.js';

const delivery = { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' } as const;
const originalId = 'interrupted-install';
const ready: DependencyReport = { runtimeReady: true, ollama: 'ready', agents: { claude: false, codex: false, vibe: false }, recommendations: [], blockers: [] };
function ui(answers: string[]): TerminalUI & { output: string[] } {
  const output: string[] = [];
  return { streams: { stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true } }, output,
    async ask(question) { output.push(question); const value = answers.shift(); if (value === undefined) throw Object.assign(new Error('EOF'), { name: 'TerminalClosedError' }); return value; },
    write(value) { output.push(value); }, close() {} };
}
const admission = () => requireTerminal(ui([]).streams);
function readData(home: string, operation: string, name: string): unknown {
  return JSON.parse(readFileSync(join(home, 'install/operations', operation, `${name}.json`), 'utf8'));
}
async function interrupted(home?: string) {
  const f = managerFixture(home, true), store = ControllerStore.acquire(f.location);
  try {
    const current = store.inspect(); assert.equal(current.kind, 'present'); if (current.kind !== 'present') throw new Error('missing fixture');
    store.commit({ ...current.snapshot, revision: current.snapshot.revision + 1,
      installation: { ...current.snapshot.installation, activeReleaseId: undefined, operationId: undefined }, operation: undefined, lastResult: undefined }, current.snapshot.revision);
  } finally { store.close(); }
  f.state.observation = { state: 'absent', resourceOwnershipReleased: true, evidence: { kind: 'never-started' } };
  const events: string[] = []; let offerId = 'original-offer';
  f.peers.dependencies = {
    async inspect() { return { ...ready, ollama: 'missing', ollamaInstallOffer: { id: offerId, version: offerId, destination: join(f.home, 'deps/fixture') }, blockers: ['Ollama missing'] }; },
    async decide(_location, decision, context) {
      const owner = requireDependencyOperation(f.location, context);
      if (owner.operationId === originalId) throw new InstallerError('dependency-uncertain', 'Interrupted before delivery');
      events.push(`decision:${decision.offerId}`); return ready;
    },
    async cleanupInstall(location, context) { requireDependencyRetry(location, context); events.push('cleanup-start'); events.push('cleanup-done'); },
  };
  const base = f.peers.bundle!;
  f.peers.bundle = { ...base, async resolve(input) { events.push('resolve'); return base.resolve(input); },
    async prepare(...args) { events.push('prepare'); return base.prepare(...args); } };
  const result = await f.manager().install(admission(), originalId, delivery, { offerId, choice: 'install' });
  assert.equal(result.state.phase, 'blocked'); assert.equal(f.manager().inspect().installRetryOperationId, originalId);
  events.length = 0;
  return { ...f, events, setOffer(value: string) { offerId = value; },
    run(terminal: TerminalUI, signal?: AbortSignal) {
      return runTerminalInstall({ location: f.location, target: f.target, peers: f.peers, ui: terminal, operationId: originalId, signal,
        select: async () => ({ node: 'fixture', entry: 'fixture', managerEntry: 'fixture', releaseId: f.next.releaseId, location: f.location }),
        publish: () => '', launch: async () => { events.push('tui'); return { code: 0, signal: null }; } });
    } };
}

privateRuntimeTest(import.meta.url, 'explicit-install-retry-completes-cleanup-before-fresh-install', async () => {
  const f = await interrupted();
  try {
    const old = readData(f.home, originalId, 'dependency') as { attemptNonce: string };
    f.setOffer('current-new-offer'); const terminal = ui(['yes', '', '', '', 'yes', 'yes']);
    const result = await f.run(terminal); assert.equal(result.kind, 'completed', terminal.output.join(''));
    assert.deepEqual(f.events, ['cleanup-start', 'cleanup-done', 'resolve', 'decision:current-new-offer', 'prepare', 'tui']);
    assert.ok(result.event); assert.notEqual(result.event.operationId, originalId);
    const fresh = readData(f.home, result.event.operationId, 'dependency') as { attemptNonce: string; decision: { offerId: string } };
    assert.notEqual(fresh.attemptNonce, old.attemptNonce); assert.equal(fresh.decision.offerId, 'current-new-offer');
    assert.deepEqual(readData(f.home, originalId, 'dependency'), old);
    assert.equal((readData(f.home, originalId, 'install-retry') as { cleanupComplete: boolean }).cleanupComplete, true);
    assert.equal(terminal.output.filter(x => x.includes('Retry install?')).length, 1);
    assert.ok(terminal.output.some(x => x.includes('Install and start Ollama current-new-offer')));
    assert.deepEqual(f.state.shutdowns, []); assert.equal(readFileSync(join(f.old.directory, 'marker'), 'utf8'), 'old');
  } finally { f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'install-retry-requires-explicit-terminal-admission-and-original-install-intent', async () => {
  const f = await interrupted();
  try {
    const file = join(f.home, 'install/controller.json'), before = readFileSync(file), terminal = ui(['']);
    assert.equal((await f.run(terminal)).kind, 'cancelled'); assert.deepEqual(f.events, []); assert.deepEqual(readFileSync(file), before);
    await assert.rejects(f.manager().retryInstall({ terminal: true }, originalId), { code: 'install-terminal-required' });
    await assert.rejects(f.manager().retryInstall(admission(), 'another-operation'), { code: 'phase-conflict' });
    await assert.rejects(f.manager().execute({ protocolVersion: 1, installationId: 'fixture', operationId: originalId, action: 'retry-install' }), { code: 'schema-invalid' });
    await assert.rejects(f.manager().execute({ protocolVersion: 1, installationId: 'fixture', operationId: originalId, action: 'retry-migration' }), { code: 'install-retry-required' });
    assert.deepEqual(readFileSync(file), before); assert.deepEqual(f.events, []);
    const wire = await f.manager().execute({ protocolVersion: 1, installationId: 'fixture', operationId: 'inspect-only', action: 'inspect' });
    assert.equal('installRetryOperationId' in JSON.parse(wire.state.message!), false, 'private terminal hint does not change the manager wire report');
  } finally { f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'upgrade-retry-never-enters-install-cleanup-or-changes-selected-release', async () => {
  const f = managerFixture(); let cleanups = 0;
  try {
    f.peers.dependencies!.inspect = async () => ({ ...ready, ollama: 'missing', ollamaInstallOffer: { id: 'offer', version: 'fixture', destination: f.home }, blockers: ['missing'] });
    f.peers.dependencies!.decide = async () => { throw new InstallerError('dependency-uncertain', 'Interrupted upgrade dependency'); };
    f.peers.dependencies!.cleanupInstall = async () => { cleanups++; };
    const offer = await f.manager().checkUpgrade(); assert.ok(offer);
    const result = await f.manager().upgradeFromTerminal(admission(), { protocolVersion: 1, installationId: 'fixture', operationId: 'upgrade-operation', action: 'upgrade', acceptedOfferId: offer.offerId }, { offerId: 'offer', choice: 'install' });
    assert.equal(result.state.phase, 'blocked');
    const before = readFileSync(join(f.home, 'install/controller.json'));
    await assert.rejects(f.manager().retryInstall(admission(), 'upgrade-operation'), { code: 'phase-conflict' });
    assert.equal(f.manager().inspect().installRetryOperationId, undefined);
    const terminal = ui(['yes']); const uiResult = await runTerminalInstall({ location: f.location, target: f.target, peers: f.peers, ui: terminal });
    assert.equal(uiResult.kind, 'failed'); assert.equal(terminal.output.some(x => x.includes('Retry install?')), false);
    assert.equal(cleanups, 0); assert.deepEqual(readFileSync(join(f.home, 'install/controller.json')), before);
    assert.equal(readFileSync(join(f.old.directory, 'marker'), 'utf8'), 'old');
  } finally { f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'install-cleanup-rejects-every-other-owner-admission-before-writes', async () => {
  for (const kind of ['candidate-id', 'candidate', 'dev-preparation', 'delivery-preparation', 'shutdown', 'migration', 'activation', 'later-phase', 'upgrade-intent', 'foreign-home', 'missing-scope']) {
    const f = await interrupted();
    try {
      const store = ControllerStore.acquire(f.location);
      try {
        const inspection = store.inspect(); assert.equal(inspection.kind, 'present'); if (inspection.kind !== 'present') throw new Error('missing fixture');
        if (kind === 'candidate-id' || kind === 'later-phase') store.commit({ ...inspection.snapshot, revision: inspection.snapshot.revision + 1,
          operation: { ...inspection.snapshot.operation!, ...(kind === 'candidate-id' ? { candidateId: 'next' } : { phase: 'migrating' as const }) } }, inspection.snapshot.revision);
        else if (kind === 'upgrade-intent') store.writeOperationData(originalId, 'intent', { protocolVersion: 1, installationId: 'fixture', operationId: originalId, action: 'upgrade', acceptedOfferId: 'a'.repeat(64) }, true);
        else if (kind === 'foreign-home') store.writeOperationData(originalId, 'install-preparation', { ...(readData(f.home, originalId, 'install-preparation') as object), home: f.home + '-other' }, true);
        else if (kind === 'missing-scope') unlinkSync(join(f.home, 'install/operations', originalId, 'install-preparation.json'));
        else store.writeOperationData(originalId, kind === 'migration' || kind === 'activation' ? 'admission' : kind, { purpose: kind });
      } finally { store.close(); }
      const before = readFileSync(join(f.home, 'install/controller.json'));
      await assert.rejects(f.manager().retryInstall(admission(), originalId), { code: 'phase-conflict' });
      assert.deepEqual(f.events, []); assert.deepEqual(readFileSync(join(f.home, 'install/controller.json')), before);
      assert.equal(existsSync(join(f.home, 'install/operations', originalId, 'install-retry.json')), false);
    } finally { f.cleanup(); }
  }
});

privateRuntimeTest(import.meta.url, 'cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect', async () => {
  for (const kind of ['failure', 'cancel']) {
    const f = await interrupted(), abort = new AbortController();
    try {
      f.peers.dependencies!.cleanupInstall = async (location, context) => {
        requireDependencyRetry(location, context); f.events.push('cleanup-start');
        if (kind === 'cancel') { abort.abort(); context.assertCurrent(); }
        throw new InstallerError('dependency-uncertain', 'Cleanup not completed');
      };
      const result = await f.run(ui(['yes']), abort.signal);
      assert.equal(result.kind, kind === 'cancel' ? 'cancelled' : 'failed'); assert.deepEqual(f.events, ['cleanup-start']);
      const inspected = f.manager().inspect(); assert.equal(inspected.kind, 'present');
      if (inspected.kind === 'present') { assert.equal(inspected.snapshot.operation?.operationId, originalId); assert.equal(inspected.snapshot.operation?.phase, 'blocked'); }
      assert.equal(existsSync(join(f.home, 'install/operations', originalId, 'install-retry.json')), false);
      assert.deepEqual(readdirSync(join(f.home, 'install/operations')), [originalId]);
    } finally { f.cleanup(); }
  }
});

privateRuntimeTest(import.meta.url, 'repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first', async () => {
  const f = await interrupted();
  try {
    await f.manager().retryInstall(admission(), originalId);
    const before = readFileSync(join(f.home, 'install/operations', originalId, 'install-retry.json'));
    const inspection = f.manager().inspect(); assert.equal(inspection.kind, 'present');
    if (inspection.kind === 'present') assert.equal(inspection.snapshot.operation, undefined);
    assert.equal(inspection.installRetryOperationId, originalId, 'new terminal can find cleanup completed before process loss');
    f.events.length = 0;
    const result = await f.run(ui(['yes', '', '', '', 'yes', 'yes'])); assert.equal(result.kind, 'completed');
    assert.deepEqual(readFileSync(join(f.home, 'install/operations', originalId, 'install-retry.json')), before);
    assert.equal(f.events.indexOf('cleanup-done') < f.events.indexOf('resolve'), true); assert.notEqual(result.event?.operationId, originalId);
  } finally { f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'decline-creates-no-dependency-context-record-or-process-and-remains-certain', async () => {
  const f = await interrupted();
  try {
    await f.manager().retryInstall(admission(), originalId);
    f.peers.dependencies!.decide = async (_location, decision, context) => {
      assert.equal(decision.choice, 'decline'); assert.equal(context, undefined);
      return { ...ready, ollama: 'missing', blockers: ['declined'] };
    };
    const result = await f.manager().install(admission(), 'declined-install', delivery, { offerId: 'original-offer', choice: 'decline' });
    assert.equal(result.state.errorCode, 'dependency-blocked');
    assert.equal(existsSync(join(f.home, 'install/operations/declined-install/dependency.json')), false);
    assert.equal(existsSync(join(f.home, 'deps')), false); assert.equal(f.state.migrations.length, 0); assert.equal(f.state.activations.length, 0);
  } finally { f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'actual-cleanup-process-death-retries-missing-items-with-fresh-manager-and-delivery', async () => {
  const base = await ollamaFixture('fixture'), f = await interrupted(base.home), children: ChildProcess[] = [];
  try {
    const { policy, offer } = await base.input(), dependency = readData(f.home, originalId, 'dependency') as { attemptNonce: string };
    const context = createDependencyOperationContext(f.location, f.target.os, { operationId: originalId, attemptNonce: dependency.attemptNonce, assertCurrent() {}, progress() {} });
    const identity = dependencyAttemptIdentity(f.location, policy, offer, context);
    for (const path of [`deps/ollama/.attempts/${originalId}`, identity.stageRelativePath]) ensureDependencyDirectory(f.location, path, context.assertCurrent);
    const record = join(f.home, identity.recordRelativePath), stage = join(f.home, identity.stageRelativePath), handle = controlBinding().acquire(`${record}.lock`);
    try {
      writeDependencyRecord(f.location, handle, record, { schemaVersion: 2, identity, absence: offer.absence, actor: 'in-process-preparation', externalActors: 0,
        policy, lockProtocol: 'in-process-native-v1', lockIdentity: dependencyLockIdentity(`${record}.lock`) });
      writeFileSync(join(stage, 'partial-download'), 'only owned partial bytes', { mode: 0o600 });
    } finally { controlBinding().close(handle); }
    const store = ControllerStore.acquire(f.location);
    try { store.writeOperationData(originalId, 'dependency', { ...(readData(f.home, originalId, 'dependency') as object), decision: { offerId: offer.id, choice: 'install' } }, true); }
    finally { store.close(); }
    const temporary = [`${record}.${randomUUID()}.tmp`, `${record}.${randomUUID()}.tmp`];
    for (const path of temporary) writeFileSync(path, 'interrupted record bytes', { mode: 0o600 });
    const input = join(base.root, 'cleanup-child.json'); writeFileSync(input, JSON.stringify({ home: f.home, operationId: originalId, policy }));
    const child = spawnFixture(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./install-retry-death-fixture.mjs', import.meta.url)), input], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }); children.push(child);
    let diagnostic = ''; child.stderr!.on('data', bytes => { diagnostic = (diagnostic + bytes.toString()).slice(-8192); });
    const boundary = await Promise.race([once(child, 'message'), once(child, 'close').then(result => { throw new Error(`cleanup child exited ${result}: ${diagnostic}`); })]);
    assert.deepEqual(boundary[0], { boundary: 'temporary-unlinked-before-completion' });
    assert.equal(existsSync(stage), false); assert.equal(temporary.filter(path => existsSync(path)).length, 1);
    assert.equal(existsSync(record.replace(/\.json$/, '.retry-done.json')), false);
    assert.equal(existsSync(join(f.home, 'install/operations', originalId, 'install-retry.json')), false);
    // Only this captured fixture process is terminated, never a daemon/service.
    const closed = once(child, 'close'); assert.equal(child.kill('SIGKILL'), true); assert.deepEqual(await closed, [null, 'SIGKILL']);
    assert.deepEqual(readdirSync(join(f.home, 'install/operations')), [originalId]);
    const fresh = managerFixture(f.home, false), real = dependencyPort(base.target, base.location, base.options), events: string[] = [];
    fresh.state.observation = { state: 'absent', resourceOwnershipReleased: true, evidence: { kind: 'never-started' } };
    // These are new typed delivery/lifecycle fixtures, never the original peer
    // closures. The cleanup itself uses the real dependency adapter/journals.
    const bundle = fresh.peers.bundle!;
    fresh.peers.bundle = { ...bundle, async resolve(input) { events.push('resolve'); return bundle.resolve(input); }, async prepare(...args) { events.push('prepare'); return bundle.prepare(...args); } };
    fresh.peers.dependencies = { async inspect() { return ready; }, async decide() { throw new Error('ready existing state needs no dependency installation'); },
      async cleanupInstall(location, owner) { events.push('cleanup-start'); await real.cleanupInstall!(location, owner); events.push('cleanup-done'); } };
    const result = await runTerminalInstall({ location: fresh.location, target: fresh.target, peers: fresh.peers, ui: ui(['yes', '', '', '', 'yes']), operationId: originalId,
      select: async () => ({ node: 'fixture', entry: 'fixture', managerEntry: 'fixture', releaseId: fresh.next.releaseId, location: fresh.location }), publish: () => '', launch: async () => ({ code: 0, signal: null }) });
    assert.equal(result.kind, 'completed', result.event?.state.message); assert.notEqual(result.event?.operationId, originalId);
    assert.deepEqual(events, ['cleanup-start', 'cleanup-done', 'resolve', 'prepare']);
    assert.ok(temporary.every(path => !existsSync(path))); assert.equal(existsSync(record.replace(/\.json$/, '.retry-done.json')), true);
    assert.equal((readData(f.home, originalId, 'install-retry') as { cleanupComplete: boolean }).cleanupComplete, true);
    assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain'); assert.equal(readFileSync(join(f.old.directory, 'marker'), 'utf8'), 'old');
    assert.equal(canonicalJson(readData(f.home, originalId, 'dependency')), canonicalJson({ ...dependency, decision: { offerId: offer.id, choice: 'install' } }));
  } finally { await stopOwnedChildren(children); await base.cleanup(); }
});
