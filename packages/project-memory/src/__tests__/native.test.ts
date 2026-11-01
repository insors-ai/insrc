import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNative } from '../native.js';
import { MemoryError } from '../errors.js';

test('node22-fs-ext-abi-and-separate-descriptor-probe', async () => {
  assert.equal(process.versions.node.split('.')[0], '22', 'native qualification requires Node 22');
  assert.equal(process.versions.modules, '127');
  const native = await loadNative();
  const dir = await mkdtemp(join(tmpdir(), 'memory-native-'));
  const a = await open(join(dir, 'owner'), 'w+', 0o600);
  const b = await open(join(dir, 'owner'), 'r+');
  try {
    native.closeOnExec(a.fd);
    await native.exclusive(a.fd);
    await assert.rejects(native.exclusive(b.fd), (error: NodeJS.ErrnoException) => ['EWOULDBLOCK', 'EAGAIN'].includes(error.code ?? ''));
    await a.close();
    await native.exclusive(b.fd);
  } finally { await a.close(); await b.close(); await rm(dir, { recursive: true, force: true }); }
});

test('native-load-failure-is-not-ready', async () => {
  for (const loader of [async () => { throw new Error('private native error'); }, async () => ({})]) {
    await assert.rejects(loadNative(loader), (error: unknown) => error instanceof MemoryError && error.code === 'NOT_READY' && !error.message.includes('private'));
  }
});
