import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDevSourceOffer, devCandidateFromReceipt, devPreparationPaths, installedReceiptMode, parseDevDelivery,
  parseDevHooks, parseDevPreparation, parseDevReleaseReceipt, parseDevSourceOffer } from '../dev.js';
import type { DevPreparationRecord, DevReleaseReceipt, DevSourceIntent } from '../dev.js';
import { parseDevPreparationResult, parseDevWorkerCancel, parseDevWorkerLaunch } from '../dev-worker.js';
import type { DevPreparationResult } from '../dev-worker.js';
import { canonicalJson, digest } from '../release-descriptor.js';
import { runtimeArchive } from '../runtime-policy.js';

function intent(os: 'linux' | 'win32' = 'linux'): DevSourceIntent {
  const target = { os, arch: 'arm64' as const, baseline: os === 'linux' ? 'ubuntu-24.04' : 'windows-11' };
  return { kind: 'dev-source', delivery: { mode: 'dev', repository: 'https://github.com/insors-ai/insrc.git', branch: 'installer' },
    sourceCommit: 'b'.repeat(40), target, runtime: { version: '22.22.1', target: { ...target }, sha256: runtimeArchive(target).sha256,
      relativeExecutable: os === 'win32' ? 'node.exe' : 'bin/node' }, recipeVersion: 'dev-v2-app-only' };
}
function checkpoint(): DevPreparationRecord {
  return { schemaVersion: 1, installationId: 'home', operationId: 'op', sourceOffer: createDevSourceOffer(intent()),
    attemptId: 'attempt-1', workerNonce: 'n'.repeat(32), ...devPreparationPaths('op', 'attempt-1'), stage: 'building', coordinatorRunId: 'run-1' };
}
function fixture(os: 'linux' | 'win32' = 'linux') {
  const sourceOffer = createDevSourceOffer(intent(os)), inventory = { schemaVersion: 1 as const,
    files: [{ path: 'out/daemon/index.js', bytes: 3, mode: 0o644, sha256: 'a'.repeat(64) }] };
  const inventorySha256 = digest(canonicalJson(inventory));
  const receipt: DevReleaseReceipt = { schemaVersion: 2, mode: 'dev', sourceOffer, inventorySha256, checkoutRelativePath: 'dev/checkouts/attempt-1',
    manifest: { schemaVersion: 1, releaseId: sourceOffer.releaseId, sourceCommit: sourceOffer.sourceCommit, target: sourceOffer.target,
      runtime: sourceOffer.runtime, payloadSha256: inventorySha256, daemonEntry: 'out/daemon/index.js', managerEntry: 'manager.mjs',
      tuiEntry: 'out/cli/index.js', protocolVersion: 1, compatiblePredecessors: ['dev-predecessor'], migrations: [] } };
  return { receipt, inventory };
}

test('dev-source-offer-binds-repo-branch-commit-target-runtime-recipe-without-payload-hash', () => {
  const source = intent(), offer = createDevSourceOffer(source);
  assert.equal(offer.sourceSha256, digest(canonicalJson(source)));
  assert.equal(offer.releaseId, `dev-${offer.sourceSha256.slice(0, 48)}`);
  assert.ok(!('manifest' in offer)); assert.ok(!('payloadSha256' in offer));
  for (const change of [
    (v: DevSourceIntent) => { v.delivery.repository = 'https://github.com/insors-ai/other.git'; },
    (v: DevSourceIntent) => { v.delivery.branch = 'v2'; },
    (v: DevSourceIntent) => { v.sourceCommit = 'c'.repeat(40); },
    (v: DevSourceIntent) => { v.target.baseline = 'other'; v.runtime.target.baseline = 'other'; },
  ]) {
    const changed = structuredClone(source); change(changed);
    assert.notEqual(createDevSourceOffer(changed).sourceSha256, offer.sourceSha256);
    assert.throws(() => parseDevSourceOffer({ ...offer, ...changed }));
  }
  for (const change of [
    { recipeVersion: 'dev-v2' }, { sourceCommit: 'main' }, { runtime: { ...source.runtime, version: '24.0.0' } },
    { runtime: { ...source.runtime, sha256: 'f'.repeat(64) } }, { runtime: { ...source.runtime, relativeExecutable: 'node' } },
    { runtime: { ...source.runtime, target: { ...source.target, baseline: 'other' } } },
    { target: { ...source.target, extra: true } }, { extra: true }, { sourceSha256: 'bad' },
  ]) assert.throws(() => parseDevSourceOffer({ ...offer, ...change }));
  const detached = parseDevSourceOffer(offer); offer.delivery.branch = 'mutated'; assert.equal(detached.delivery.branch, 'installer');
  const windows = intent('win32'); windows.delivery.repository = 'c:\\Users\\person\\source repo';
  assert.equal(createDevSourceOffer(windows).sourceSha256,
    createDevSourceOffer({ ...windows, delivery: { ...windows.delivery, repository: 'C:\\Users\\person\\source repo' } }).sourceSha256);
});

test('dev-receipt-binds-final-manifest-inventory-and-contained-checkout-without-self-hash', () => {
  const { receipt, inventory } = fixture(), directory = `/tmp/home/releases/${receipt.sourceOffer.releaseId}`;
  const candidate = devCandidateFromReceipt(directory, receipt, inventory);
  assert.deepEqual(candidate, { releaseId: receipt.manifest.releaseId, directory, manifest: receipt.manifest,
    descriptorSha256: digest(canonicalJson(receipt)), payloadSha256: receipt.inventorySha256, inventorySha256: receipt.inventorySha256 });
  assert.notEqual(candidate.descriptorSha256, receipt.sourceOffer.sourceSha256);
  assert.notEqual(candidate.payloadSha256, receipt.sourceOffer.sourceSha256);
  for (const change of [
    { inventorySha256: 'f'.repeat(64) }, { manifest: { ...receipt.manifest, sourceCommit: 'a'.repeat(40) } },
    { manifest: { ...receipt.manifest, releaseId: 'another' } }, { schemaVersion: 3 }, { descriptorSha256: 'a'.repeat(64) },
    { checkoutRelativePath: 'dev/checkouts/../selected' }, { checkoutRelativePath: 'dev/checkouts/attempt-1/subdir' },
    { checkoutRelativePath: 'install/staging/attempt-1' }, { checkoutRelativePath: 'dev/checkouts/CON' },
    { manifest: { ...receipt.manifest, migrations: [{ id: 'm', version: '1', module: '../bad.js' }] } },
    { manifest: { ...receipt.manifest, compatiblePredecessors: [receipt.manifest.releaseId] } },
  ]) assert.throws(() => parseDevReleaseReceipt({ ...receipt, ...change }));
  assert.throws(() => devCandidateFromReceipt('/tmp/another', receipt, inventory));
  assert.throws(() => devCandidateFromReceipt(directory, receipt, { ...inventory, files: [] }));
  for (const path of ['.dev-release.json', '.release.json', 'inventory.json', '../escape', 'C:/escape', 'out/CON', 'out/link:stream']) {
    const changed = { ...inventory, files: [{ ...inventory.files[0]!, path }] }, sha = digest(canonicalJson(changed));
    assert.throws(() => devCandidateFromReceipt(directory, { ...receipt, inventorySha256: sha, manifest: { ...receipt.manifest, payloadSha256: sha } }, changed));
  }
  const win = fixture('win32');
  assert.equal(devCandidateFromReceipt(`c:\\Users\\person\\releases\\${win.receipt.manifest.releaseId}`, win.receipt, win.inventory).directory,
    `C:\\Users\\person\\releases\\${win.receipt.manifest.releaseId}`);
});

test('dev receipt2 and recipe reject legacy embedded formats without changing public manifest1', () => {
  const { receipt, inventory } = fixture();
  assert.equal(receipt.schemaVersion, 2);
  assert.equal(receipt.manifest.schemaVersion, 1);
  assert.equal(receipt.sourceOffer.recipeVersion, 'dev-v2-app-only');
  assert.throws(() => parseDevReleaseReceipt({ ...receipt, schemaVersion: 1 }), /Legacy embedded-runtime/);
  const legacy = { ...receipt.sourceOffer, recipeVersion: 'dev-v1' };
  assert.throws(() => parseDevSourceOffer(legacy), /Legacy embedded-runtime/);
  assert.throws(() => parseDevPreparation({ ...checkpoint(), sourceOffer: legacy }), /Legacy embedded-runtime/);
  assert.throws(() => parseDevWorkerLaunch({ schemaVersion: 1, kind: 'prepare', checkpoint: { ...checkpoint(), sourceOffer: legacy } }), /Legacy embedded-runtime/);
  for (const path of ['tools/node/bin/node', 'runtime/node.tar.gz']) {
    const changed = { ...inventory, files: [{ ...inventory.files[0]!, path }] }, sha = digest(canonicalJson(changed));
    assert.throws(() => devCandidateFromReceipt(`/tmp/releases/${receipt.manifest.releaseId}`, {
      ...receipt, inventorySha256: sha, manifest: { ...receipt.manifest, payloadSha256: sha },
    }, changed), /runtime distribution contribution/);
  }
});

test('invalid-option-like-ref-source-and-ambiguous-receipts-rejected', () => {
  const delivery = intent().delivery;
  for (const branch of ['-c', '../main', 'main..other', 'main@{1}', 'main~1', 'main^', 'main:other', 'main?x', 'main*x', '[x]', 'foo\\bar', 'a//b', '.hidden', 'a/.hidden', 'a.lock', 'a/b.lock', '/main', 'main/', 'main.', 'main\nother', '']) {
    assert.throws(() => parseDevDelivery({ ...delivery, branch }), branch);
  }
  for (const repository of ['-upload-pack=bad', 'relative/repo', 'ext::helper', 'http://example.test/repo', 'ftp://example.test/repo',
    'https://user:secret@example.test/repo', 'https://user@example.test/repo', 'https://example.test/repo#bad', 'https://example.test/repo?bad',
    'ssh://user:secret@example.test/repo', 'ssh://git@example.test', 'ssh://git@example.test/',
    'git@bad host:org/repo.git', 'bad user@example.test:org/repo.git', 'git@-host:org/repo.git',
    'ssh://git@-host/org/repo.git', 'ssh://-host/org/repo.git', 'ssh://git@%2dhost/org/repo.git',
    'ssh://-user@example.test/org/repo.git', 'ssh://bad%20user@example.test/org/repo.git',
    '/tmp/../repo', 'C:\\repo\\..\\other', 'x\ny']) {
    assert.throws(() => parseDevDelivery({ ...delivery, repository }), repository);
  }
  for (const repository of ['/tmp/source with spaces/源', 'C:\\Users\\source repo', 'git@example.test:org/repo.git', 'ssh://git@example.test/org/repo.git']) {
    assert.equal(parseDevDelivery({ ...delivery, repository }).mode, 'dev');
  }
  assert.equal(installedReceiptMode(true, false), 'bundle'); assert.equal(installedReceiptMode(false, true), 'dev');
  assert.throws(() => installedReceiptMode(true, true)); assert.throws(() => installedReceiptMode(false, false));
  assert.throws(() => parseDevSourceOffer({ ...createDevSourceOffer(intent()), message: 'x'.repeat(70_000) }));
});

test('preparation protocol binds paths source nonce run and bounded complete results', () => {
  const record = checkpoint(), paths = devPreparationPaths(record.operationId, record.attemptId);
  assert.deepEqual(parseDevPreparation(record), record);
  for (const change of [ { stage: 'unknown' }, { extra: true }, { workerNonce: 'short' }, { operationId: '../op' },
    { checkoutRelativePath: 'dev/checkouts/foreign' }, { stageRelativePath: 'install/staging/foreign' },
    { resultRelativePath: `${paths.checkoutRelativePath}/other.json` }, { coordinatorRunId: '' }, { predecessorId: record.sourceOffer.releaseId } ]) {
    assert.throws(() => parseDevPreparation({ ...record, ...change }));
  }
  const accepted = { ...record, stage: 'accepted' as const }; delete accepted.coordinatorRunId;
  assert.equal(parseDevWorkerLaunch({ schemaVersion: 1, kind: 'prepare', checkpoint: accepted }).checkpoint.stage, 'accepted');
  assert.throws(() => parseDevWorkerLaunch({ schemaVersion: 1, kind: 'prepare', checkpoint: record }));
  const cancel = { schemaVersion: 1, kind: 'cancel', operationId: record.operationId, attemptId: record.attemptId, workerNonce: record.workerNonce };
  assert.equal(parseDevWorkerCancel(cancel, record).kind, 'cancel');
  for (const change of [{ operationId: 'other' }, { attemptId: 'other' }, { workerNonce: 'f'.repeat(32) }, { extra: true }]) {
    assert.throws(() => parseDevWorkerCancel({ ...cancel, ...change }, record));
  }
  const result: DevPreparationResult = { schemaVersion: 1, installationId: record.installationId, operationId: record.operationId,
    attemptId: record.attemptId, workerNonce: record.workerNonce, sourceSha256: record.sourceOffer.sourceSha256,
    coordinatorRunId: record.coordinatorRunId!, outcome: 'prepared', cleanupSha256: 'a'.repeat(64), inputFingerprint: 'b'.repeat(64),
    outputFingerprint: 'c'.repeat(64), inventorySha256: 'd'.repeat(64) };
  assert.deepEqual(parseDevPreparationResult(result, record), result);
  for (const change of [{ installationId: 'other' }, { operationId: 'other' }, { attemptId: 'other' }, { workerNonce: 'x'.repeat(32) },
    { sourceSha256: 'f'.repeat(64) }, { coordinatorRunId: 'other' }, { cleanupSha256: '' }, { outputFingerprint: undefined },
    { inventorySha256: undefined }, { extra: true }]) assert.throws(() => parseDevPreparationResult({ ...result, ...change }, record));
  assert.throws(() => parseDevPreparationResult(result, accepted));
});

test('commit migration metadata preserves order and rejects malformed or duplicate hooks', () => {
  assert.deepEqual(parseDevHooks(undefined), []);
  const migrations = [{ id: 'second', version: '2', module: 'hooks/second.js' }, { id: 'first', version: '1', module: 'hooks/first.js' }];
  assert.deepEqual(parseDevHooks({ schemaVersion: 1, migrations }), migrations);
  for (const value of [null, {}, { schemaVersion: 2, migrations }, { schemaVersion: 1, migrations, extra: true },
    { schemaVersion: 1, migrations: [...migrations, migrations[0]] }, { schemaVersion: 1, migrations: [{ ...migrations[0], module: '../escape' }] },
    { schemaVersion: 1, migrations: [{ ...migrations[0], execute: true }] }]) assert.throws(() => parseDevHooks(value));
});
