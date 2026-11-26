import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { archiveFixture } from './_runtime-fixture.js';
import { runtimeArchive } from '../runtime-policy.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { managerFixture } from './_manager-fixture.js';
import { createDevSourceOffer, devPreparationPaths } from '../dev.js';
import { ControllerStore } from '../controller-store.js';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'idm-')), children: ChildProcess[] = [];
let runtimeDirectory: string;
before(async () => {
  const archive = await archiveFixture(), identity = runtimeArchive({ os: process.platform as 'darwin' | 'linux' | 'win32', arch: process.arch as 'arm64' | 'x64' });
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const child = process.platform === 'win32' ? spawnFixture('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(root)}`], { stdio: 'ignore' })
    : spawnFixture('tar', ['-xzf', archive, '-C', root, `${identity.root}/bin/node`, `${identity.root}/lib/node_modules/npm`, `${identity.root}/include/node`, `${identity.root}/LICENSE`], { stdio: 'ignore' });
  children.push(child); assert.equal((await once(child, 'close'))[0], 0); runtimeDirectory = join(root, identity.root);
});
after(async () => { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); });
async function scenario(name: string): Promise<void> {
  const child = spawnFixture(join(runtimeDirectory, process.platform === 'win32' ? 'node.exe' : 'bin/node'), [realpathSync('src/installer/__tests__/dev-manager-fixture.mjs'), root, runtimeDirectory, name],
    { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child); let output = '';
  child.stdout!.on('data', data => { output = (output + String(data)).slice(-32_768); });
  child.stderr!.on('data', data => { output = (output + String(data)).slice(-32_768); });
  assert.equal((await once(child, 'close'))[0], 0, output);
}
test('dev-manager-separates-accepted-source-offer-from-final-artifact-and-publishes-once', async () => { await scenario('publish'); });
test('offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned', async () => { await scenario('pinned'); });
test('dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build', async () => { await scenario('open'); });
test('bundle-offer-receipt-and-required-sibling-admission-regressions-preserved', async () => {
  const f = managerFixture();
  try {
    const offer = await f.peers.bundle!.resolve({ mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' });
    assert.equal(offer.kind, 'bundle');
    const shown = await f.manager().checkUpgrade(); assert.equal(shown?.candidateReleaseId, 'next');
    f.peers.bundle!.resolve = async () => createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: '/source', branch: 'installer' }, sourceCommit: 'a'.repeat(40),
      target: f.target, runtime: { version: '22.22.1', target: f.target, sha256: runtimeArchive(f.target).sha256, relativeExecutable: f.target.os === 'win32' ? 'node.exe' : 'bin/node' }, recipeVersion: 'dev-v2-app-only' });
    await assert.rejects(f.manager().checkUpgrade(), { code: 'delivery-invalid' });
    f.peers.lifecycle = undefined;
    await assert.rejects(f.manager().execute({ protocolVersion: 1, installationId: 'fixture', operationId: 'missing-sibling', action: 'upgrade', acceptedOfferId: shown!.offerId }), { code: 'capability-unavailable' });
    assert.equal(f.manager().inspect().kind, 'present'); assert.equal(f.state.shutdowns.length, 0);
  } finally { f.cleanup(); }
});
test('manager checkpoint rejects source mutation after durable acceptance', async () => {
  const f = managerFixture();
  try {
    const delivery = { mode: 'dev' as const, repository: '/source', branch: 'installer' };
    const offer = createDevSourceOffer({ kind: 'dev-source', delivery, sourceCommit: 'a'.repeat(40), target: f.target,
      runtime: { version: '22.22.1', target: f.target, sha256: runtimeArchive(f.target).sha256, relativeExecutable: f.target.os === 'win32' ? 'node.exe' : 'bin/node' }, recipeVersion: 'dev-v2-app-only' });
    const store = ControllerStore.acquire(f.location);
    try { const current = store.inspect(); assert.equal(current.kind, 'present'); if (current.kind === 'present') store.commit({ ...current.snapshot, revision: current.snapshot.revision + 1, installation: { ...current.snapshot.installation, delivery } }, current.snapshot.revision); }
    finally { store.close(); }
    f.peers.dev = { ...f.peers.bundle!, async resolve() { return offer; }, async prepare(_lease, accepted, context) {
      assert.equal(accepted.kind, 'dev-source'); if (accepted.kind !== 'dev-source') throw new Error('wrong offer');
      Object.assign(accepted, createDevSourceOffer({ kind: 'dev-source', delivery, sourceCommit: 'c'.repeat(40), target: accepted.target, runtime: accepted.runtime, recipeVersion: 'dev-v2-app-only' }));
      const attemptId = randomUUID(); context.checkpoint({ schemaVersion: 1, installationId: 'fixture', operationId: context.operationId, sourceOffer: accepted,
        predecessorId: 'old', attemptId, workerNonce: 'n'.repeat(32), ...devPreparationPaths(context.operationId, attemptId), coordinatorRunId: randomUUID(), stage: 'accepted' });
      throw new Error('forged source checkpoint was accepted');
    } };
    const shown = await f.manager().checkUpgrade();
    const result = await f.manager().execute({ protocolVersion: 1, installationId: 'fixture', operationId: 'mutated-source', action: 'upgrade', acceptedOfferId: shown!.offerId });
    assert.equal(result.state.phase, 'blocked'); assert.equal(result.state.errorCode, 'preparation-uncertain');
    assert.equal(existsSync(join(f.home, 'install/operations/mutated-source/dev-preparation.json')), false);
    assert.equal(JSON.parse(readFileSync(join(f.home, 'install/operations/mutated-source/dev-source.json'), 'utf8')).sourceOffer.sourceCommit, offer.sourceCommit);
    assert.equal(f.state.shutdowns.length, 0);
  } finally { f.cleanup(); }
});
test('durable legacy dev offer recovery preserves compatibility diagnostics without preparation or shutdown', async () => {
  for (const legacy of [true, false]) {
    const f = managerFixture();
    try {
      const operationId = 'legacy-recovery', delivery = { mode: 'dev' as const, repository: '/source', branch: 'installer' };
      const offer = createDevSourceOffer({ kind: 'dev-source', delivery, sourceCommit: 'a'.repeat(40), target: f.target,
        runtime: { version: '22.22.1', target: f.target, sha256: runtimeArchive(f.target).sha256,
          relativeExecutable: f.target.os === 'win32' ? 'node.exe' : 'bin/node' }, recipeVersion: 'dev-v2-app-only' });
      const sourceOffer = legacy ? { ...offer, recipeVersion: 'dev-v1' } : { kind: 'dev-source' };
      const store = ControllerStore.acquire(f.location);
      try {
        const current = store.inspect(); assert.equal(current.kind, 'present');
        if (current.kind !== 'present') throw new Error('fixture enrollment missing');
        store.commit({ ...current.snapshot, revision: current.snapshot.revision + 1,
          installation: { ...current.snapshot.installation, delivery, operationId },
          operation: { operationId, phase: 'blocked', predecessorId: 'old', errorCode: 'preparation-uncertain' } }, current.snapshot.revision);
        store.writeOperationData(operationId, 'intent', { protocolVersion: 1, installationId: 'fixture', operationId, action: 'upgrade', acceptedOfferId: 'a'.repeat(64) });
        store.writeOperationData(operationId, 'interruption', { phase: 'preparing' });
        store.writeOperationData(operationId, 'dev-source', { schemaVersion: 1, sourceOffer });
      } finally { store.close(); }
      f.peers.dev = { ...f.peers.bundle!, async resolve() { throw new Error('recovery must not resolve new source'); },
        async prepare() { throw new Error('incompatible source must not prepare'); } };
      const result = await f.manager().execute({ protocolVersion: 1, installationId: 'fixture', operationId, action: 'retry-migration' });
      assert.equal(result.state.phase, 'blocked');
      assert.equal(result.state.errorCode, legacy ? 'source-incompatible' : 'preparation-uncertain', result.state.message);
      if (legacy) assert.match(result.state.message!, /Legacy embedded-runtime.*receipt2/);
      assert.deepEqual(JSON.parse(readFileSync(join(f.home, 'install/operations', operationId, 'dev-source.json'), 'utf8')), { schemaVersion: 1, sourceOffer });
      const inspected = f.manager().inspect(); assert.equal(inspected.kind, 'present');
      if (inspected.kind === 'present') assert.equal(inspected.snapshot.installation.activeReleaseId, 'old');
      assert.equal(existsSync(join(f.home, 'install/operations', operationId, 'candidate.json')), false);
      assert.equal(f.state.shutdowns.length + f.state.migrations.length + f.state.activations.length, 0);
    } finally { f.cleanup(); }
  }
});
test('bundled manager metadata does not start source preparation', async () => {
  const directory = join(root, 'b'); mkdirSync(directory);
  const entry = join(directory, 'entry.mjs'), output = join(directory, 'manager.mjs');
  writeFileSync(entry, `import {InstallerManager} from ${JSON.stringify(realpathSync('src/installer/manager.ts'))};process.stdout.write(JSON.stringify({manager:typeof InstallerManager}));`);
  const child = spawnFixture(join(runtimeDirectory, process.platform === 'win32' ? 'node.exe' : 'bin/node'),
    [realpathSync('src/installer/__tests__/publisher-bundle-fixture.mjs'), directory, entry, output, 'manager'], { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child); let diagnostic = ''; child.stdout!.resume(); child.stderr!.on('data', data => { diagnostic += String(data); });
  assert.equal((await once(child, 'close'))[0], 0, diagnostic);
});
