import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { spawnFixture, stopOwnedChildren, childLine } from '../../daemon/tools/__tests__/_proc.js';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { managerFixture } from './_manager-fixture.js';
import { InstallerManager } from '../manager.js';
import { ControllerStore, inspectController } from '../controller-store.js';
import { requireTerminal } from '../terminal-admission.js';
import type { LaunchAdmission } from '../peer-contracts.js';
import type { ManagerRequest } from '../contracts.js';
const request = (action: ManagerRequest['action'], operationId = 'operation'): ManagerRequest => ({ protocolVersion: 1, installationId: 'fixture', operationId, action });
async function upgrade(f: ReturnType<typeof managerFixture>, operationId = 'operation') {
  const manager = f.manager(), offer = await manager.checkUpgrade(); return manager.execute({ ...request('upgrade', operationId), acceptedOfferId: offer!.offerId });
}
test('cancellation at pre-shutdown observation and control admission sends no shutdown', async () => {
  for (const boundary of ['candidate', 'observation', 'quiescing'] as const) {
    const f = managerFixture(), abort = new AbortController();
    try {
      const manager = f.manager(event => {
        if (boundary === 'candidate' && event.state.phase === 'preparing' && event.state.candidateId
          || boundary === 'quiescing' && event.state.phase === 'quiescing') abort.abort();
      });
      const offer = await manager.checkUpgrade();
      if (boundary === 'observation') f.peers.lifecycle!.observe = async () => { abort.abort(); return f.state.observation; };
      const result = await manager.upgradeFromTerminal(requireTerminal({ stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true } }),
        { ...request('upgrade', `cancel-${boundary}`), acceptedOfferId: offer!.offerId }, undefined, abort.signal);
      assert.equal(result.state.errorCode, 'cancelled', boundary);
      assert.equal(f.state.shutdowns.length, 0, boundary);
      assert.equal(f.state.migrations.length, 0); assert.equal(f.state.activations.length, 0);
      const snapshot = manager.inspect(); assert.equal(snapshot.kind, 'present');
      if (snapshot.kind === 'present') {
        assert.equal(snapshot.snapshot.installation.activeReleaseId, 'old');
        assert.equal(snapshot.snapshot.lastResult?.phase, 'ready');
        assert.equal(snapshot.snapshot.operation?.phase, boundary === 'quiescing' ? 'blocked' : undefined);
      }
      const store = ControllerStore.acquire(f.location); store.close();
    } finally { f.cleanup(); }
  }
});
test('install is rejected even with a forged source/bootstrap marker', async () => {
  const f = managerFixture();
  try {
    const manager = f.manager();
    for (const forged of [{}, { source: 'bootstrap' }, { bootstrap: true }, { terminal: true }]) await assert.rejects(manager.execute({ ...request('install'), ...forged }), { code: 'install-terminal-required' });
    assert.throws(() => requireTerminal({ stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: false } }), { code: 'install-terminal-required' });
    await assert.rejects(manager.install({ terminal: true }, 'operation', { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' }), { code: 'install-terminal-required' });
    assert.equal(f.state.shutdowns.length, 0);
  } finally { f.cleanup(); }
});
test('required peer admission and exact offer state transitions fail closed', async () => {
  const f = managerFixture();
  try {
    const before = inspectController(f.location);
    await assert.rejects(new InstallerManager(f.location, f.target, {}).execute(request('restart')), { code: 'capability-unavailable' });
    assert.deepEqual(inspectController(f.location), before);
    const manager = f.manager(); await assert.rejects(manager.execute({ ...request('upgrade'), acceptedOfferId: 'stale' }), { code: 'offer-stale' });
    assert.deepEqual(inspectController(f.location), before);
    const phases: string[] = [], progressing = f.manager(event => phases.push(event.state.phase));
    const offered = await progressing.checkUpgrade();
    const ready = await progressing.execute({ ...request('upgrade'), acceptedOfferId: offered!.offerId });
    assert.equal(ready.state.phase, 'ready'); assert.equal(ready.state.errorCode, undefined);
    assert.ok(phases.includes('preparing') && phases.includes('quiescing') && phases.includes('migrating') && phases.includes('activating'));
    const current = inspectController(f.location); assert.equal(current.kind, 'present'); if (current.kind === 'present') { assert.equal(current.snapshot.installation.activeReleaseId, 'next'); assert.equal(current.snapshot.operation, undefined); }
    const repeated = await progressing.execute({ ...request('upgrade'), acceptedOfferId: offered!.offerId }); assert.equal(repeated.state.phase, 'ready'); assert.equal(f.state.migrations.length, 1);
    const lock = ControllerStore.acquire(f.location); lock.close();
  } finally { f.cleanup(); }
});
test('manager death and candidate journal receipt projections cannot start duplicate runner', async () => {
  const f = managerFixture();
  try {
    f.state.missingReceipt = true;
    const interrupted = await upgrade(f); assert.equal(interrupted.state.phase, 'blocked'); assert.equal(f.state.migrations.length, 1); assert.equal(f.state.activations.length, 0);
    const receipt = f.state.receipt!;
    f.state.missingReceipt = false; f.state.ownership = 'held';
    assert.equal((await f.manager().execute(request('retry-migration'))).state.phase, 'blocked'); assert.equal(f.state.migrations.length, 1);
    f.state.ownership = 'released'; f.state.missingReceipt = true;
    assert.equal((await f.manager().execute(request('retry-migration'))).state.phase, 'blocked'); assert.equal(f.state.migrations.length, 1);
    f.state.missingReceipt = false; f.state.journalValidated = false;
    assert.equal((await f.manager().execute(request('retry-migration'))).state.phase, 'blocked'); assert.equal(f.state.migrations.length, 1);
    f.state.journalValidated = true; f.state.receipt = { ...receipt, completionNonce: '0'.repeat(64) };
    assert.equal((await f.manager().execute(request('retry-migration'))).state.phase, 'blocked'); assert.equal(f.state.activations.length, 0);
    f.state.receipt = receipt;
    const ready = await f.manager().execute(request('retry-migration')); assert.equal(ready.state.phase, 'ready'); assert.equal(f.state.migrations.length, 1); assert.equal(f.state.activations.length, 1);
  } finally { f.cleanup(); }
});
test('corrupt controller revisions and immutable candidate mismatches fail closed', async () => {
  const f = managerFixture();
  try {
    writeFileSync(join(f.next.directory, 'marker'), 'changed'); const failed = await upgrade(f); assert.equal(failed.state.errorCode, 'operation-failed'); assert.equal(f.state.shutdowns.length, 0);
    let current = inspectController(f.location); if (current.kind !== 'present') throw Error('Lost incumbent');
    assert.equal(current.snapshot.installation.activeReleaseId, 'old'); assert.equal(current.snapshot.lastResult?.phase, 'ready'); assert.equal(current.snapshot.operation, undefined);
    writeFileSync(join(f.next.directory, 'marker'), 'next'); f.state.badReady = true;
    const blocked = await upgrade(f, 'second'); assert.equal(blocked.state.phase, 'blocked'); assert.equal(blocked.state.errorCode, 'readiness-uncertain');
    current = inspectController(f.location); if (current.kind !== 'present') throw Error('Lost incumbent'); assert.equal(current.snapshot.installation.activeReleaseId, 'old');
    const store = ControllerStore.acquire(f.location); try { assert.throws(() => store.commit({ ...current.snapshot, revision: current.snapshot.revision + 1 }, current.snapshot.revision - 1), { code: 'revision-conflict' }); } finally { store.close(); }
    writeFileSync(join(f.home, 'install/controller.json'), '{broken'); await assert.rejects(f.manager().execute(request('start', 'third')), { code: 'controller-corrupt' });
  } finally { f.cleanup(); }
});


test('owned manager self exit leaves candidate running and recovery needs actual wrapper exit receipt', { timeout: 90_000 }, async () => {
  const f = managerFixture(), children: ChildProcess[] = [];
  try {
    const program = fileURLToPath(new URL('./manager-death-fixture.mjs', import.meta.url));
    const owner = spawnFixture(process.execPath, ['--import', 'tsx/esm', program, 'manager', f.home], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(owner);
    const admission = JSON.parse(await childLine(owner)) as LaunchAdmission;
    assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
    const wrapper = spawnFixture(process.execPath, ['--import', 'tsx/esm', program, 'wrapper', f.home, JSON.stringify(admission)], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(wrapper);
    assert.match(await childLine(wrapper), /ready/);
    const ownerClosed = once(owner, 'close'); owner.stdin!.end('exit\n'); assert.deepEqual(await ownerClosed, [0, null]);
    assert.equal(wrapper.exitCode, null, 'wrapper/candidate outlive manager');
    f.peers.lifecycle!.readMigrationExitReceipt = async () => JSON.parse(readFileSync(admission.receiptPath, 'utf8'));
    f.peers.migrations!.reconcileJournal = async () => JSON.parse(readFileSync(join(f.home, 'candidate-journal.json'), 'utf8'));
    f.state.ownership = 'held';
    assert.equal((await f.manager().execute(request('retry-migration'))).state.phase, 'blocked');
    assert.equal(f.state.migrations.length, 0); assert.equal(f.state.activations.length, 0);
    const wrapperClosed = once(wrapper, 'close'); wrapper.stdin!.end('complete\n'); assert.deepEqual(await wrapperClosed, [0, null]);
    f.state.ownership = 'released';
    const ready = await f.manager().execute(request('retry-migration')); assert.equal(ready.state.phase, 'ready');
    assert.equal(f.state.migrations.length, 0, 'replacement manager must not spawn a duplicate migration'); assert.equal(f.state.activations.length, 1);
  } finally { await stopOwnedChildren(children); f.cleanup(); }
});

test('ordinary manager executable rejects forged install and terminal entry rejects redirected streams', async () => {
  const children: ChildProcess[] = [];
  try {
    for (const entry of ['manager-entry.js', 'terminal-entry.js']) {
      const child = spawnFixture(process.execPath, [fileURLToPath(new URL(`../../../out/installer/${entry}`, import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
      let diagnostic = ''; child.stderr!.on('data', (bytes: Buffer) => { diagnostic += bytes; });
      const closed = once(child, 'close'); child.stdin!.end(JSON.stringify({ ...request('install'), source: 'bootstrap' }) + '\n');
      assert.deepEqual(await closed, [1, null]); assert.match(diagnostic, /install-terminal-required/);
    }
  } finally { await stopOwnedChildren(children); }
});

test('preparation receives no controller writer and post-drain tampering blocks migration', async () => {
  const f = managerFixture();
  try {
    const prepare = f.peers.bundle!.prepare;
    f.peers.bundle!.prepare = async (lease, offer) => { assert.equal('commit' in lease, false); assert.equal('writeOperationData' in lease, false); return prepare(lease, offer); };
    const completion = f.peers.lifecycle!.waitShutdownCompletion;
    f.peers.lifecycle!.waitShutdownCompletion = async (location, shutdown) => { const result = await completion(location, shutdown); writeFileSync(join(f.next.directory, 'marker'), 'after-drain-change'); return result; };
    const blocked = await upgrade(f); assert.equal(blocked.state.phase, 'blocked'); assert.equal(f.state.migrations.length, 0); assert.equal(f.state.activations.length, 0);
  } finally { f.cleanup(); }
});

test('free lease or unreachable endpoint alone cannot authorize ordinary startup', async () => {
  const f = managerFixture();
  try {
    f.state.observation = { state: 'absent', resourceOwnershipReleased: true } as never;
    const blocked = await f.manager().execute(request('start'));
    assert.equal(blocked.state.phase, 'blocked'); assert.equal(f.state.activations.length, 0);
  } finally { f.cleanup(); }
});

test('explicit failed-hook recovery requires real prior exit and owning hook retry policy', async () => {
  const f = managerFixture();
  try {
    const launch = f.peers.lifecycle!.launchMigration;
    f.peers.lifecycle!.launchMigration = async (candidate, admission, validate) => { await launch(candidate, admission, validate); f.state.receipt = { ...f.state.receipt!, exitCode: 1 }; f.state.journalValidated = false; };
    assert.equal((await upgrade(f)).state.phase, 'blocked');
    f.state.allowRetry = false;
    assert.equal((await f.manager().execute(request('retry-migration'))).state.phase, 'blocked'); assert.equal(f.state.migrations.length, 1);
    f.state.allowRetry = true;
    f.peers.lifecycle!.launchMigration = async (candidate, admission, validate) => { await launch(candidate, admission, validate); f.state.journalValidated = true; };
    const ready = await f.manager().execute(request('retry-migration')); assert.equal(ready.state.phase, 'ready'); assert.equal(f.state.migrations.length, 2);
  } finally { f.cleanup(); }
});

test('late foreign revision cannot be overwritten by readiness or error persistence', async () => {
  const f = managerFixture();
  try {
    const activate = f.peers.lifecycle!.activate;
    let foreignRevision = 0;
    f.peers.lifecycle!.activate = async (candidate, admission, validate) => {
      const evidence = await activate(candidate, admission, validate);
      const file = join(f.home, 'install/controller.json'), changed = JSON.parse(readFileSync(file, 'utf8'));
      changed.revision += 10; foreignRevision = changed.revision; writeFileSync(file, JSON.stringify(changed)); return evidence;
    };
    await assert.rejects(upgrade(f), { code: 'revision-conflict' });
    const current = inspectController(f.location); assert.equal(current.kind, 'present');
    if (current.kind === 'present') { assert.equal(current.snapshot.revision, foreignRevision); assert.equal(current.snapshot.installation.activeReleaseId, 'old'); assert.equal(current.snapshot.operation?.phase, 'activating'); }
  } finally { f.cleanup(); }
});


test('stop and interrupted stop recovery bypass dependency health and payload checks', async () => {
  const f = managerFixture();
  try {
    // Both dependency failure and damaged selected files must be irrelevant.
    writeFileSync(join(f.old.directory, 'marker'), 'damaged');
    let inspections = 0;
    f.peers.dependencies!.inspect = async () => { inspections++; return { runtimeReady: false, ollama: 'unavailable', agents: { claude: false, codex: false, vibe: false }, recommendations: [], blockers: ['Ollama is unavailable'] }; };
    f.peers.migrations!.verifyInstalled = async () => { throw Error('Stop must not check installed migrations'); };
    const stopOnly = () => new InstallerManager(f.location, f.target, { ...f.peers, bundle: undefined });
    await assert.rejects(new InstallerManager(f.location, f.target, { lifecycle: f.peers.lifecycle }).execute(request('stop', 'missing-peers')), { code: 'capability-unavailable' });
    const completion = f.peers.lifecycle!.waitShutdownCompletion;
    f.peers.lifecycle!.waitShutdownCompletion = async (location, shutdown) => ({ ...await completion(location, shutdown), completionNonce: '0'.repeat(64) });
    const interrupted = await stopOnly().execute(request('stop'));
    assert.equal(interrupted.state.phase, 'blocked'); assert.equal(interrupted.state.errorCode, 'shutdown-uncertain');
    assert.equal(f.state.shutdowns.length, 1); assert.equal(f.state.migrations.length, 0); assert.equal(f.state.activations.length, 0); assert.equal(inspections, 0);
    const shutdown = f.state.shutdowns[0]!;
    f.peers.lifecycle!.reconcileShutdown = async () => undefined;
    assert.equal((await stopOnly().execute(request('retry-migration'))).state.phase, 'blocked');
    f.peers.lifecycle!.reconcileShutdown = (location, expected) => { assert.deepEqual(expected, shutdown); return completion(location, expected); };
    const stopped = await stopOnly().execute(request('retry-migration'));
    assert.equal(stopped.state.phase, 'stopped'); assert.equal(stopped.state.errorCode, undefined);
    assert.equal(f.state.shutdowns.length, 1, 'recovery consumes the original exact completion instead of sending another shutdown');
    const current = inspectController(f.location); assert.equal(current.kind, 'present');
    if (current.kind === 'present') { assert.equal(current.snapshot.installation.activeReleaseId, 'old'); assert.equal(current.snapshot.operation, undefined); }
    f.peers.lifecycle!.reconcileShutdown = completion;
    assert.equal((await stopOnly().execute(request('stop', 'another-stop'))).state.phase, 'blocked', 'a forged completion is still rejected for an ordinary stop');
    f.peers.lifecycle!.waitShutdownCompletion = completion;
    assert.equal((await stopOnly().execute(request('retry-migration', 'another-stop'))).state.phase, 'stopped');
    assert.equal((await stopOnly().execute(request('stop', 'new-stop'))).state.phase, 'stopped');
    assert.equal(inspections, 0, 'neither ordinary stop nor recovery checks dependency health');
  } finally { f.cleanup(); }
});

test('pre-admission manager self exit recovers install and upgrade without duplicate hooks', { timeout: 90_000 }, async () => {
  for (const fresh of [true, false]) {
    const f = managerFixture(), children: ChildProcess[] = [];
    try {
      if (fresh) {
        const store = ControllerStore.acquire(f.location), inspected = store.inspect();
        try {
          if (inspected.kind !== 'present') throw Error('Missing fixture');
          store.commit({ ...inspected.snapshot, revision: inspected.snapshot.revision + 1, installation: { ...inspected.snapshot.installation, activeReleaseId: undefined }, lastResult: undefined }, inspected.snapshot.revision);
        } finally { store.close(); }
      }
      const program = fileURLToPath(new URL('./manager-death-fixture.mjs', import.meta.url));
      const owner = spawnFixture(process.execPath, ['--import', 'tsx/esm', program, 'preparing', f.home], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(owner);
      assert.equal((await childLine(owner)).trim(), 'prepared');
      assert.throws(() => ControllerStore.acquire(f.location), { code: 'busy' });
      const closed = once(owner, 'close'); owner.stdin!.end('exit\n'); assert.deepEqual(await closed, [0, null]);
      const interrupted = inspectController(f.location); assert.equal(interrupted.kind, 'present');
      if (interrupted.kind === 'present') { assert.equal(interrupted.snapshot.operation?.phase, 'preparing'); assert.equal(interrupted.snapshot.operation.candidateId, 'next'); }
      const lease = ControllerStore.acquire(f.location);
      try { assert.equal(lease.readOperationData('operation', 'admission'), undefined); assert.equal(lease.readOperationData('operation', 'shutdown'), undefined); } finally { lease.close(); }
      await assert.rejects(f.manager().execute(request('start', 'other')), { code: 'phase-conflict' });
      f.state.observation = { state: 'uncertain' };
      const uncertain = await f.manager().execute(request('retry-migration'));
      assert.equal(uncertain.state.phase, 'blocked'); assert.equal(f.state.migrations.length, 0); assert.equal(f.state.activations.length, 0);
      f.state.observation = fresh ? { state: 'absent', resourceOwnershipReleased: true, evidence: { kind: 'never-started' } } : { state: 'present', identity: { protocolVersion: 1, installationId: 'fixture', instanceId: 'incumbent', releaseId: 'old', state: 'ready' }, endpoint: f.location.daemonEndpoint };
      const ready = await f.manager().execute(request('retry-migration'));
      assert.equal(ready.state.phase, 'ready'); assert.equal(ready.state.errorCode, undefined);
      assert.equal(f.state.shutdowns.length, fresh ? 0 : 1); assert.equal(f.state.migrations.length, 1); assert.equal(f.state.activations.length, 1);
      assert.equal(f.state.migrations[0]!.candidateReleaseId, 'next');
    } finally { await stopOwnedChildren(children); f.cleanup(); }
  }
});

test('missing launch metadata in a later phase cannot masquerade as preparation recovery', async () => {
  const f = managerFixture();
  try {
    f.state.missingReceipt = true;
    assert.equal((await upgrade(f)).state.phase, 'blocked');
    const admission = join(f.home, 'install/operations/operation/admission.json');
    // Corrupt evidence is not permission to reuse a preparation-only recovery path.
    writeFileSync(admission, 'null');
    for (let retry = 0; retry < 4; retry++) {
      if (retry === 2) unlinkSync(admission);
      const blocked = await f.manager().execute(request('retry-migration'));
      assert.equal(blocked.state.phase, 'blocked'); assert.equal(f.state.migrations.length, 1); assert.equal(f.state.activations.length, 0);
    }
  } finally { f.cleanup(); }
});
