import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { node22Fixture } from './_runtime-fixture.js';
import { spawnFixture, stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { DevWorkerInput } from '../dev-worker.js';
import { createDevSourceOffer, devPreparationPaths } from '../dev.js';
import { runtimeArchive } from '../runtime-policy.js';
async function scenario(name: string): Promise<void> {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'insrc-dev-worker-')), children: ChildProcess[] = [], node = await node22Fixture();
  try {
    const file = realpathSync('src/installer/__tests__/dev-worker-fixture.mjs');
    const child = spawnFixture(node.executable, [file, root, name], { env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); let output = '';
    child.stdout!.on('data', value => { output += String(value); }); child.stderr!.on('data', value => { output += String(value); });
    const code = (await once(child, 'close'))[0]; assert.equal(code, 0, output);
  } finally { await stopOwnedChildren(children); node.cleanup(); rmSync(root, { recursive: true, force: true }); }
}
test('cancel-or-terminal-eof-drains-owned-preparation-actors-before-return', async () => { await scenario('abort'); await scenario('eof'); });
test('held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup', async () => { await scenario('tamper'); await scenario('held'); });
test('worker-protocol-rejects-foreign-checkpoint-and-empty-prepared-result', async () => {
  for (const name of ['nested', 'foreign', 'empty', 'missing', 'missing-file', 'tampered-file', 'wrong-size', 'extra-file']) await scenario(name);
});
test('owned-process evidence excludes unregistered detached descendants', async () => { await scenario('unregistered-detached'); });
test('worker completion durably flushes proof and refuses a failed result flush', async () => { await scenario('durable-proof'); await scenario('flush-failure'); await scenario('directory-failure'); });
test('worker input rejects oversized launch and foreign cancellation frames', async () => {
  const target = { os: 'linux' as const, arch: 'arm64' as const, baseline: 'protocol' };
  const sourceOffer = createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: 'https://example.test/repo.git', branch: 'installer' },
    sourceCommit: 'a'.repeat(40), target, runtime: { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: 'bin/node' }, recipeVersion: 'dev-v1' });
  const checkpoint = { schemaVersion: 1, installationId: 'home', operationId: 'op', attemptId: 'attempt', workerNonce: 'n'.repeat(32), sourceOffer,
    ...devPreparationPaths('op', 'attempt'), stage: 'accepted', coordinatorRunId: randomUUID() };
  for (const frame of ['x'.repeat(70_000), JSON.stringify({ schemaVersion: 1, kind: 'prepare', checkpoint, extra: true }) + '\n']) {
    const stream = new PassThrough(), channel = new DevWorkerInput(stream);
    const pending = assert.rejects(channel.launch, { code: 'schema-invalid' }); stream.write(frame); await pending;
    assert.equal(channel.controller.signal.aborted, true); channel.dispose(); stream.destroy();
  }
  const stream = new PassThrough(), channel = new DevWorkerInput(stream);
  stream.write(JSON.stringify({ schemaVersion: 1, kind: 'prepare', checkpoint }) + '\n'); await channel.launch;
  stream.write(JSON.stringify({ schemaVersion: 1, kind: 'cancel', operationId: 'other', attemptId: checkpoint.attemptId, workerNonce: checkpoint.workerNonce }) + '\n');
  assert.equal(channel.controller.signal.aborted, true);
  assert.equal(channel.controller.signal.reason.code, 'identity-mismatch'); channel.dispose(); stream.destroy();
});

test('worker framing preserves fragmented UTF-8 and rejects malformed byte frames', async () => {
  const target = { os: 'linux' as const, arch: 'arm64' as const, baseline: 'protocol' };
  const sourceOffer = createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: '/tmp/源/😀', branch: '分支' },
    sourceCommit: 'a'.repeat(40), target, runtime: { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: 'bin/node' }, recipeVersion: 'dev-v1' });
  const checkpoint = { schemaVersion: 1, installationId: 'home', operationId: 'utf8', attemptId: 'attempt', workerNonce: 'n'.repeat(32), sourceOffer,
    ...devPreparationPaths('utf8', 'attempt'), stage: 'accepted', coordinatorRunId: randomUUID() };
  const frame = Buffer.from(JSON.stringify({ schemaVersion: 1, kind: 'prepare', checkpoint }) + '\n');
  for (const width of [1, 2, 7, frame.length]) {
    const stream = new PassThrough(), channel = new DevWorkerInput(stream);
    try {
      for (let offset = 0; offset < frame.length; offset += width) stream.write(frame.subarray(offset, offset + width));
      assert.deepEqual((await channel.launch).checkpoint, checkpoint);
      assert.equal(channel.controller.signal.aborted, false);
    } finally { channel.dispose(); stream.destroy(); }
  }
  const stream = new PassThrough(), channel = new DevWorkerInput(stream);
  try {
    const rejected = assert.rejects(channel.launch);
    stream.write(Buffer.from([0xff, 10])); await rejected;
    assert.equal(channel.controller.signal.aborted, true);
  } finally { channel.dispose(); stream.destroy(); }
});
