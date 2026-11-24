import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRun } from '../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../scripts/test-harness/process.mjs';
import { fingerprint } from '../../../scripts/test-harness/build.mjs';
const { resolveDevSource, prepareDevGit, ownedDevGit, inspectManagedDevCheckout, inspectLocalDevSource } = await import('../dev-git.ts');
const { executeDevWorker, devWorkerPaths } = await import('../dev-worker.ts');
const { devPreparationPaths, parseDevReleaseReceipt } = await import('../dev.ts');
const { resolveInstallationLocation } = await import('../location.ts');
const { canonicalJson, digest } = await import('../release-descriptor.ts');
const { runtimeArchive } = await import('../runtime-policy.ts');
const [root, scenario] = process.argv.slice(2), ownerRoot = join(root, 'owner'); mkdirSync(ownerRoot);
const base = createRun(ownerRoot, { mode: 'build' }), run = { ...base, environment: () => ({ ...base.environment(), INSRC_BUILD_CONFIRM_CLOSURE: '1' }) };
const target = { os: process.platform, arch: process.arch, baseline: 'git-fixture' };
const runtime = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: process.platform === 'win32' ? 'node.exe' : 'bin/node' };
function fixtureStage(stage, record, prepared) {
  const files = [];
  for (const path of ['bootstrap.mjs', 'manager.mjs', 'native/control.node', `tools/node/${runtime.relativeExecutable}`, 'out/daemon/index.js', 'out/cli/index.js', ...prepared.migrations.map(x => x.module)]) {
    const value = Buffer.from('controlled Git preparation fixture'); mkdirSync(dirname(join(stage, path)), { recursive: true }); writeFileSync(join(stage, path), value);
    files.push({ path, bytes: value.length, mode: 0o644, sha256: digest(value) });
  }
  const inventory = canonicalJson({ schemaVersion: 1, files }), inventorySha256 = digest(inventory), offer = record.sourceOffer;
  const receipt = { schemaVersion: 1, mode: 'dev', sourceOffer: offer, inventorySha256, checkoutRelativePath: record.checkoutRelativePath,
    manifest: { schemaVersion: 1, releaseId: offer.releaseId, sourceCommit: offer.sourceCommit, target, runtime, payloadSha256: inventorySha256,
      daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs', tuiEntry: 'out/cli/index.js', protocolVersion: 1,
      compatiblePredecessors: prepared.compatiblePredecessors, migrations: prepared.migrations } };
  writeFileSync(join(stage, 'inventory.json'), inventory); writeFileSync(join(stage, '.dev-release.json'), canonicalJson(receipt));
  return { inventorySha256, receipt };
}
await withRun(run, async scope => {
  const git = ownedDevGit(run, scope), repository = join(root, 'source repo 源'); mkdirSync(repository);
  await git(['init', '--quiet', '--initial-branch=installer'], repository);
  await git(['config', 'user.name', 'fixture'], repository); await git(['config', 'user.email', 'fixture@example.invalid'], repository);
  mkdirSync(join(repository, 'src')); mkdirSync(join(repository, 'hooks'));
  writeFileSync(join(repository, '.gitignore'), '.insrc/tmp/\nout/\nnode_modules/\n');
  writeFileSync(join(repository, 'src/main.ts'), 'base\n');
  const migrations = [{ id: 'second', version: '2', module: 'hooks/second.js' }, { id: 'first', version: '1', module: 'hooks/first.js' }];
  for (const hook of migrations) writeFileSync(join(repository, hook.module), 'export default {};\n');
  writeFileSync(join(repository, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', insrcInstaller: { schemaVersion: 1, migrations } }));
  await git(['add', '.'], repository); await git(['commit', '--quiet', '-m', 'base'], repository);
  const initialCommit = (await git(['rev-parse', 'HEAD'], repository)).text.trim();
  await git(['checkout', '--quiet', '-b', 'unrelated'], repository); writeFileSync(join(repository, 'src/main.ts'), 'unrelated\n');
  await git(['commit', '--quiet', '-am', 'unrelated'], repository); await git(['checkout', '--quiet', 'installer'], repository);
  const delivery = { mode: 'dev', repository, branch: 'installer' };
  const offer = await resolveDevSource(delivery, target, runtime);
  assert.equal(offer.sourceCommit, initialCommit);
  async function advance(text = 'next\n') {
    writeFileSync(join(repository, 'src/main.ts'), text); await git(['commit', '--quiet', '-am', text.trim()], repository);
    return resolveDevSource(delivery, target, runtime);
  }
  let installationSequence = 0;
  function installation(_name) { const home = join(root, `h${installationSequence++}`); mkdirSync(home); return resolveInstallationLocation('fixture', { home }); }
  async function build(location, accepted, attemptId, predecessor, expectedFailure) {
    const record = { schemaVersion: 1, installationId: location.installationId, operationId: `op-${attemptId}`, attemptId, workerNonce: 'n'.repeat(32),
      sourceOffer: accepted, ...devPreparationPaths(`op-${attemptId}`, attemptId), coordinatorRunId: randomUUID(), stage: 'accepted',
      ...(predecessor ? { predecessorId: predecessor.manifest.releaseId } : {}) };
    let receipt, prepared;
    const result = await executeDevWorker(location.home, { schemaVersion: 1, kind: 'prepare', checkpoint: record }, { environment: process.env, work: async (owner, commands, signal, stage) => {
      prepared = await prepareDevGit(owner, commands, record, { location, predecessor, signal });
      const value = fixtureStage(stage, record, prepared); receipt = value.receipt; return { inventorySha256: value.inventorySha256 };
    } });
    const paths = devWorkerPaths(location.home, record);
    if (expectedFailure) {
      assert.equal(result.outcome, 'failed'); assert.equal(JSON.parse(readFileSync(paths.diagnostic, 'utf8')).code, expectedFailure);
      return { result, record, paths };
    }
    assert.equal(result.outcome, 'prepared', existsSync(paths.diagnostic) ? readFileSync(paths.diagnostic, 'utf8') : 'preparation failed');
    return { receipt: parseDevReleaseReceipt(receipt), prepared, record, paths };
  }
  function publish(location, selected) {
    mkdirSync(join(location.home, 'releases'), { recursive: true });
    renameSync(selected.paths.stage, join(location.home, 'releases', selected.receipt.manifest.releaseId));
  }
  if (scenario === 'exact') {
    const location = installation('home'), first = await build(location, offer, 'first');
    assert.equal(readFileSync(join(first.paths.checkout, 'src/main.ts'), 'utf8'), 'base\n');
    assert.deepEqual(first.prepared.migrations, migrations); assert.deepEqual(first.prepared.compatiblePredecessors, []);
    assert.equal((await git(['for-each-ref', '--format=%(refname)'], first.paths.checkout)).text.includes('unrelated'), false);
    publish(location, first);
    mkdirSync(join(first.paths.checkout, 'out')); writeFileSync(join(first.paths.checkout, 'out/ignored.js'), 'ignored build output changed');
    const hook = join(root, 'unexpected-hook'), marker = join(root, 'hook-ran');
    writeFileSync(hook, `#!/bin/sh\nprintf unexpected > '${marker.replaceAll("'", "'\\''")}'\n`, { mode: 0o700 });
    await git(['config', 'core.fsmonitor', hook], first.paths.checkout);
    await inspectManagedDevCheckout(location, first.receipt, git);
    assert.equal(existsSync(marker), false);
    const next = await advance(), second = await build(location, next, 'second', first.receipt);
    assert.deepEqual(second.prepared.compatiblePredecessors, [offer.releaseId]);
    assert.equal(readFileSync(join(second.paths.checkout, 'src/main.ts'), 'utf8'), 'next\n');
    assert.equal(readFileSync(join(first.paths.checkout, 'src/main.ts'), 'utf8'), 'base\n');
    publish(location, second);
    await build(location, offer, 'backward', second.receipt, 'source-incompatible');
  } else if (scenario === 'preserve') {
    for (const kind of ['tracked', 'untracked', 'conflict', 'origin', 'head', 'fingerprint', 'missing', 'linked']) {
      const location = installation(`home-${kind}`), selected = await build(location, offer, `selected-${kind}`); publish(location, selected);
      const checkout = selected.paths.checkout;
      if (kind === 'tracked') writeFileSync(join(checkout, 'src/main.ts'), 'keep my changes');
      if (kind === 'untracked') writeFileSync(join(checkout, 'notes.txt'), 'keep my notes');
      if (kind === 'conflict') {
        await git(['config', 'user.name', 'fixture'], checkout); await git(['config', 'user.email', 'fixture@example.invalid'], checkout);
        writeFileSync(join(checkout, 'src/main.ts'), 'selected change\n'); await git(['commit', '--quiet', '-am', 'selected change'], checkout);
        await git(['fetch', '--quiet', 'origin', 'refs/heads/unrelated'], checkout);
        assert.equal((await git(['merge', '--quiet', '--no-edit', 'FETCH_HEAD'], checkout, [0, 1])).code, 1);
      }
      if (kind === 'origin') await git(['remote', 'set-url', 'origin', join(root, 'foreign')], checkout);
      if (kind === 'head') await git(['checkout', '--quiet', '-b', 'user-branch'], checkout);
      if (kind === 'fingerprint') writeFileSync(join(checkout, '.insrc/tmp/dev-preparation/result.json'), '{}');
      if (kind === 'missing') renameSync(checkout, `${checkout}-preserved`);
      if (kind === 'linked') { renameSync(checkout, `${checkout}-preserved`); symlinkSync(`${checkout}-preserved`, checkout); }
      const preserved = kind === 'missing' || kind === 'linked' ? `${checkout}-preserved` : checkout;
      const before = fingerprint(preserved, readdirSync(preserved));
      await assert.rejects(inspectManagedDevCheckout(location, selected.receipt, git), { code: 'source-dirty' });
      assert.equal(fingerprint(preserved, readdirSync(preserved)), before);
    }
    const before = readFileSync(join(repository, 'src/main.ts'), 'utf8'); writeFileSync(join(repository, 'src/main.ts'), 'local dirty');
    await assert.rejects(inspectLocalDevSource(delivery, git), { code: 'source-dirty' });
    assert.equal(readFileSync(join(repository, 'src/main.ts'), 'utf8'), 'local dirty'); writeFileSync(join(repository, 'src/main.ts'), before);
  } else if (scenario === 'readonly') {
    const location = installation('home'); writeFileSync(join(location.home, 'incumbent.keep'), 'keep');
    const beforeSource = fingerprint(repository, readdirSync(repository)), beforeHome = fingerprint(location.home, readdirSync(location.home));
    for (let index = 0; index < 2; index++) assert.deepEqual(await resolveDevSource(delivery, target, runtime, { environment: { ...process.env, GIT_DIR: '/must-not-touch', GIT_WORK_TREE: '/must-not-touch', GIT_TRACE: '1' } }), offer);
    assert.equal(fingerprint(repository, readdirSync(repository)), beforeSource); assert.equal(fingerprint(location.home, readdirSync(location.home)), beforeHome);
    const response = await scope.start(process.execPath, ['-e', "process.stdout.write('x'.repeat(100000))"], { outputLimitBytes: 1024 });
    assert.equal(response.launchError, 'command-output-limit'); assert.ok(readFileSync(response.log).length <= 1024);
  } else if (scenario === 'pinned') {
    const moved = await advance(); assert.notEqual(moved.sourceSha256, offer.sourceSha256); assert.notEqual(moved.releaseId, offer.releaseId);
    const location = installation('home'), accepted = await build(location, offer, 'accepted');
    assert.equal(readFileSync(join(accepted.paths.checkout, 'src/main.ts'), 'utf8'), 'base\n');
    assert.equal(accepted.receipt.manifest.sourceCommit, initialCommit);
    await git(['checkout', '--quiet', '--orphan', 'replacement'], repository);
    await git(['commit', '--quiet', '-m', 'replacement root'], repository);
    await git(['branch', '-f', 'installer', 'replacement'], repository);
    const otherLocation = installation('missing-accepted-object'); writeFileSync(join(otherLocation.home, 'incumbent.keep'), 'keep');
    await build(otherLocation, offer, 'unavailable', undefined, 'source-fetch-failed');
    assert.equal(readFileSync(join(otherLocation.home, 'incumbent.keep'), 'utf8'), 'keep');
  }
});
