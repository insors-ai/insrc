import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { managerFixture } from './_manager-fixture.js';
import { ollamaFixture } from './_ollama-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { dependencyPort } from '../dependencies.js';
import { requireDependencyOperation } from '../dependency-context.js';
import { ControllerStore } from '../controller-store.js';
import { InstallerError } from '../contracts.js';
import { dependencyAttemptPaths } from '../ollama-policy.js';
import { dependencyPath } from '../ollama-records.js';
import { controlBinding } from '../native.js';
import type { DependencyReport, ManagerRequest } from '../contracts.js';
import { requireTerminal } from '../terminal-admission.js';
import { runTerminalInstall } from '../terminal-install.js';
import type { TerminalUI } from '../terminal-install.js';

const ready: DependencyReport = { runtimeReady: true, ollama: 'ready', agents: { claude: false, codex: false, vibe: false }, recommendations: [], blockers: [] };
const missing = (home: string): DependencyReport => ({ ...ready, ollama: 'missing', ollamaInstallOffer: { id: 'exact-offer', version: 'fixture', destination: home }, blockers: ['Ollama missing'] });
const request = (action: ManagerRequest['action'], operationId = 'dependency-operation'): ManagerRequest => ({ protocolVersion: 1, installationId: 'fixture', operationId, action });
const terminalAdmission = () => requireTerminal({ stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true } });
function ui(answers: string[]): TerminalUI & { output: string[] } {
  const output: string[] = [];
  return { streams: { stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true } }, output,
    async ask(question) { output.push(question); const answer = answers.shift(); if (answer === undefined) throw Object.assign(new Error('EOF'), { name: 'TerminalClosedError' }); return answer; },
    write(message) { output.push(message); }, close() {} };
}
async function integrated() {
  const base = await ollamaFixture('fixture'), f = managerFixture(base.home, true), children: ChildProcess[] = [];
  const driver = fileURLToPath(new URL('./ollama-service-worker-fixture.mjs', import.meta.url));
  let launches = 0, downloads = 0;
  const preparation = { transport: async () => { downloads++; return base.transport(); } };
  const compose = (beforeLaunch?: (() => void) | undefined, beforeFiniteClose?: (() => Promise<void>) | undefined) => {
    f.peers.dependencies = dependencyPort(base.target, base.location, { ...base.options, preparation: { ...preparation, beforeFiniteClose }, service: { workerEntrypoint: driver, readinessMs: 3000,
      launch: async (_frame, record) => {
        beforeLaunch?.(); launches++;
        const child = spawnFixture(process.execPath, [driver, base.home, record, 'ready'], { stdio: ['ignore', 'ignore', 'pipe'] }); children.push(child);
        child.stderr!.resume(); await once(child, 'spawn'); return { started: true };
      } } });
  };
  compose();
  return { ...base, f, compose, count: () => ({ launches, downloads }),
    async cleanup() {
      const state = join(base.root, 'service-state'); mkdirSync(state, { recursive: true }); writeFileSync(join(state, 'stop'), 'close owned fixture');
      try { for (const child of children) if (child.exitCode === null && child.signalCode === null) await once(child, 'close'); }
      finally { await stopOwnedChildren(children); await base.cleanup(); }
    } };
}

privateRuntimeTest(import.meta.url, 'accepted-official-payload-is-user-only-and-discloses-install-and-start', async () => {
  const i = await integrated(), terminal = ui(['yes', 'yes', 'yes']);
  try {
    const before = await i.f.peers.dependencies!.inspect(i.location); assert.ok(before.ollamaInstallOffer);
    const result = await runTerminalInstall({ location: i.location, target: i.target, peers: i.f.peers, ui: terminal, operationId: 'terminal-dependency',
      select: async () => ({ node: 'fixture', entry: 'fixture', managerEntry: 'fixture', releaseId: 'next', location: i.location }), publish: () => '', launch: async () => ({ code: 0, signal: null }) });
    assert.equal(result.kind, 'completed', terminal.output.join('')); assert.deepEqual(i.count(), { downloads: 1, launches: 1 });
    const transcript = terminal.output.join(''), prompt = `Install and start Ollama ${i.policy.version} at ${before.ollamaInstallOffer.destination}? [y/N]`;
    assert.ok(transcript.includes(prompt));
    for (const disclosure of [i.endpoint, join(i.home, i.policy.modelsRelativePath), join(i.home, i.policy.logsRelativePath), dirname(join(i.home, i.policy.modelsRelativePath)), 'No models are downloaded automatically']) {
      assert.ok(transcript.indexOf(disclosure) >= 0 && transcript.indexOf(disclosure) < transcript.indexOf(prompt), disclosure);
    }
    assert.equal(readFileSync(join(i.home, 'application-data'), 'utf8'), 'retain'); assert.deepEqual(readdirSync(join(i.home, i.policy.modelsRelativePath)), []);
    const checkpoint = JSON.parse(readFileSync(join(i.home, 'install/operations/terminal-dependency/dependency.json'), 'utf8'));
    assert.match(checkpoint.attemptNonce, /^[a-f0-9]{64}$/); assert.equal(checkpoint.operationId, 'terminal-dependency'); assert.equal(checkpoint.decision.offerId, before.ollamaInstallOffer.id);
    const state = i.f.manager().inspect(); assert.equal(state.kind, 'present'); if (state.kind === 'present') { assert.equal(state.snapshot.operation, undefined); assert.equal(state.snapshot.lastResult?.phase, 'ready'); }
    const lock = ControllerStore.acquire(i.location); lock.close();
  } finally { await i.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'cancellation-and-eof-block-later-publication-or-service-admission', async () => {
  for (const boundary of ['eof', 'terminal-probe', 'locked-probe', 'finite-preparation', 'service-admission'] as const) {
    const i = await integrated(), cancel = new AbortController(), terminal = ui(boundary === 'eof' ? ['yes', 'yes'] : ['yes', 'yes', 'yes']);
    try {
      if (boundary === 'terminal-probe' || boundary === 'locked-probe') {
        const inspect = i.f.peers.dependencies!.inspect; let calls = 0;
        i.f.peers.dependencies!.inspect = async (location, context) => { assert.equal(context?.signal, cancel.signal); const report = await inspect(location, context); if (++calls === (boundary === 'terminal-probe' ? 1 : 2)) cancel.abort(); return report; };
      } else if (boundary === 'finite-preparation') i.compose(undefined, async () => { cancel.abort(); });
      else if (boundary === 'service-admission') i.compose(() => cancel.abort());
      const result = await runTerminalInstall({ location: i.location, target: i.target, peers: i.f.peers, ui: terminal, operationId: `cancel-${boundary}`, signal: cancel.signal,
        launch: async () => { throw new Error('cancelled installation launched TUI'); } });
      assert.equal(result.kind, 'cancelled', terminal.output.join('')); assert.equal(i.f.state.shutdowns.length, 0); assert.equal(i.f.state.migrations.length, 0);
      assert.equal(i.count().launches, boundary === 'service-admission' ? 1 : 0);
      assert.equal(i.count().downloads, boundary === 'finite-preparation' || boundary === 'service-admission' ? 1 : 0);
      if (boundary === 'service-admission') assert.match(terminal.output.join(''), /accepted.*may remain running or unverified/i);
      if (boundary === 'finite-preparation') assert.equal(existsSync(join(i.home, 'deps/ollama', i.policy.version)), false, 'cancelled finite work cannot publish');
      const lock = ControllerStore.acquire(i.location); lock.close();
    } finally { await i.cleanup(); }
  }
});

privateRuntimeTest(import.meta.url, 'terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions', async () => {
  const f = managerFixture();
  try {
    const manager = f.manager(), before = readFileSync(join(f.home, 'install/controller.json'));
    await manager.execute(request('inspect')); const offer = await manager.checkUpgrade(); assert.deepEqual(readFileSync(join(f.home, 'install/controller.json')), before);
    let decisions = 0;
    f.peers.dependencies!.inspect = async () => missing(f.home);
    f.peers.dependencies!.decide = async (location, decision, input) => {
      decisions++; const context = requireDependencyOperation(location, input); context.assertCurrent();
      assert.equal(context.operationId, 'dependency-operation'); assert.match(context.attemptNonce, /^[a-f0-9]{64}$/);
      const stored = JSON.parse(readFileSync(join(f.home, 'install/controller.json'), 'utf8')); assert.equal(stored.operation.phase, 'preparing'); assert.equal(stored.operation.operationId, context.operationId);
      assert.deepEqual(JSON.parse(readFileSync(join(f.home, 'install/operations/dependency-operation/intent.json'), 'utf8')).action, 'upgrade');
      assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
      assert.deepEqual(Object.keys(context).sort(), ['assertCurrent', 'attemptNonce', 'operationId', 'progress', 'signal']);
      assert.equal(decision.offerId, 'exact-offer'); context.progress('dependency-test', 'Accepted exact user-only dependency'); return ready;
    };
    const result = await manager.upgradeFromTerminal(terminalAdmission(), { ...request('upgrade'), acceptedOfferId: offer!.offerId }, { offerId: 'exact-offer', choice: 'install' });
    assert.equal(result.state.phase, 'ready'); assert.equal(decisions, 1);
    const activation = f.state.activations[0]!;
    f.state.observation = { state: 'present', identity: { protocolVersion: 1, installationId: 'fixture', instanceId: activation.childInstanceId, releaseId: 'next', state: 'ready' }, endpoint: f.location.daemonEndpoint };
    f.peers.dependencies!.inspect = async () => { throw new Error('stop must bypass dependency health'); };
    assert.equal((await f.manager().execute(request('stop', 'stop-operation'))).state.phase, 'stopped'); assert.equal(decisions, 1);
    await assert.rejects(manager.execute({ ...request('upgrade', 'forged-flag'), acceptedOfferId: offer!.offerId, installOllama: true }));
  } finally { f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'dependency-uncertain-recovery-preserves-operation-and-prevents-duplicate-side-effects', async () => {
  const f = managerFixture(); let decisions = 0, preparations = 0;
  try {
    const manager = f.manager(), offer = await manager.checkUpgrade(), prepare = f.peers.bundle!.prepare;
    f.peers.bundle!.prepare = async (...args) => { preparations++; return prepare(...args); };
    f.peers.dependencies!.inspect = async () => missing(f.home);
    f.peers.dependencies!.decide = async () => { decisions++; throw new InstallerError('dependency-uncertain', 'Admitted finite dependency work has no positive closure'); };
    const blocked = await manager.upgradeFromTerminal(terminalAdmission(), { ...request('upgrade'), acceptedOfferId: offer!.offerId }, { offerId: 'exact-offer', choice: 'install' });
    assert.equal(blocked.state.phase, 'blocked'); assert.equal(blocked.state.errorCode, 'dependency-uncertain'); assert.equal(preparations, 0);
    const checkpointFile = join(f.home, 'install/operations/dependency-operation/dependency.json'), checkpoint = readFileSync(checkpointFile);
    await assert.rejects(f.manager().execute(request('start', 'different-operation')), { code: 'phase-conflict' });
    writeFileSync(checkpointFile, JSON.stringify({ ...JSON.parse(checkpoint.toString()), attemptNonce: 'forged' }));
    assert.equal((await f.manager().execute(request('retry-migration'))).state.errorCode, 'dependency-uncertain');
    writeFileSync(checkpointFile, checkpoint);
    f.peers.dependencies!.inspect = async () => ({ ...ready, ollama: 'unavailable', blockers: ['Unclosed admitted dependency work'] });
    const unresolved = await f.manager().execute(request('retry-migration')); assert.equal(unresolved.state.errorCode, 'dependency-uncertain'); assert.equal(unresolved.state.phase, 'blocked');
    assert.equal(decisions, 1); assert.equal(preparations, 0); assert.equal(f.state.shutdowns.length, 0); assert.deepEqual(readFileSync(checkpointFile), checkpoint);
    f.peers.dependencies!.inspect = async () => ready;
    f.peers.bundle!.resolve = async () => { throw new Error('recovery changed the originally accepted release'); };
    const recovered = await f.manager().execute(request('retry-migration')); assert.equal(recovered.state.phase, 'ready', recovered.state.message);
    assert.equal(decisions, 1); assert.equal(preparations, 1); assert.equal(f.state.migrations.length, 1); assert.equal(f.state.activations.length, 1); assert.deepEqual(readFileSync(checkpointFile), checkpoint);
  } finally { f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'real-install-retry-waits-for-owned-actor-closure-and-cleans-original-policy', async () => {
  const i = await integrated(), store = ControllerStore.acquire(i.location), cancel = new AbortController();
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; }), reached = new Promise<void>(resolve => { entered = resolve; });
  try {
    const current = store.inspect(); assert.equal(current.kind, 'present'); if (current.kind !== 'present') throw new Error('missing fixture');
    store.commit({ ...current.snapshot, revision: current.snapshot.revision + 1, installation: { ...current.snapshot.installation, activeReleaseId: undefined }, lastResult: undefined }, current.snapshot.revision);
  } finally { store.close(); }
  i.f.state.observation = { state: 'absent', resourceOwnershipReleased: true, evidence: { kind: 'never-started' } };
  try {
    const offer = (await i.input()).offer;
    // This real finite actor is deliberately held after extraction. Cancellation
    // returns while it still owns the original non-inherited native lock.
    i.f.peers.dependencies = dependencyPort(i.target, i.location, { ...i.options, preparation: { transport: i.transport, cleanupMs: 100,
      beforeFiniteClose: async () => { entered(); cancel.abort(); await waiting; } } });
    const install = i.f.manager().install(terminalAdmission(), 'real-interrupted-install', { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' }, { offerId: offer.id, choice: 'install' }, cancel.signal);
    await reached; const blocked = await install; assert.equal(blocked.state.phase, 'blocked');
    const checkpoint = JSON.parse(readFileSync(join(i.home, 'install/operations/real-interrupted-install/dependency.json'), 'utf8'));
    const paths = dependencyAttemptPaths('real-interrupted-install', checkpoint.attemptNonce), record = dependencyPath(i.location, paths.recordRelativePath);
    assert.equal(existsSync(dependencyPath(i.location, paths.stageRelativePath)), true);
    await assert.rejects(i.f.manager().retryInstall(terminalAdmission(), 'real-interrupted-install'), { code: 'dependency-uncertain' });
    assert.equal(i.f.state.migrations.length, 0); assert.equal(i.f.state.activations.length, 0);
    release();
    const ends = performance.now() + 5000;
    for (;;) {
      try { const handle = controlBinding().acquire(`${record}.lock`); controlBinding().close(handle); break; }
      catch (error) { if (performance.now() >= ends) throw error; await new Promise(resolve => setTimeout(resolve, 10)); }
    }
    // Current policy has changed. Cleanup must use the stored accepted policy;
    // it cannot require that the old offer still exists in the current catalog.
    i.setPolicy({ ...i.policy, version: '0.0.2-fixture', asset: { ...i.policy.asset, url: i.policy.asset.url.replace('v0.0.1-fixture', 'v0.0.2-fixture') } });
    i.f.peers.dependencies = dependencyPort(i.target, i.location, { ...i.options, preparation: { transport: async () => { throw new Error('cleanup must not download'); } } });
    await i.f.manager().retryInstall(terminalAdmission(), 'real-interrupted-install');
    assert.equal(existsSync(dependencyPath(i.location, paths.stageRelativePath)), false);
    assert.equal(existsSync(join(i.home, 'deps/ollama', i.policy.version)), false);
    const result = i.f.manager().inspect(); assert.equal(result.kind, 'present');
    if (result.kind === 'present') { assert.equal(result.snapshot.operation, undefined); assert.equal(result.snapshot.installation.activeReleaseId, undefined); }
    const current = await i.f.peers.dependencies!.inspect(i.location); assert.equal(current.ollamaInstallOffer?.version, '0.0.2-fixture');
    assert.equal(readFileSync(join(i.home, 'application-data'), 'utf8'), 'retain'); assert.deepEqual(i.count(), { launches: 0, downloads: 0 });
  } finally { release(); await i.cleanup(); }
});
