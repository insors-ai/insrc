import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, readdir, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareRoot, validateOptions, LAYOUT_FILE, LAYOUT_PENDING, LAYOUT_TEXT, OWNER_FILE } from '../configuration.js';
import { acquireOwnership } from '../ownership.js';
import { loadNative } from '../native.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';

nativeTest(import.meta.url, 'exclusive-descriptor-and-owned-bootstrap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-owner-'));
  try {
    const root = await prepareRoot(validateOptions(options(join(dir, 'data'))));
    await writeFile(join(root.path, LAYOUT_PENDING), LAYOUT_TEXT.slice(0, 15), { mode: 0o600 });
    const owner = await acquireOwnership(root);
    try {
      assert.equal(await readFile(join(root.path, LAYOUT_FILE), 'utf8'), LAYOUT_TEXT);
      assert.equal((await readdir(root.path)).includes(LAYOUT_PENDING), false);
      await assert.rejects(acquireOwnership(root), (error: unknown) => error instanceof MemoryError && error.code === 'OWNERSHIP_CONFLICT');
      await owner.assertOwned();
    } finally { await owner.close(); }
    const inode = (await stat(join(root.path, OWNER_FILE))).ino;
    const next = await acquireOwnership(root);
    assert.equal((await stat(join(root.path, OWNER_FILE))).ino, inode);
    await Promise.all([next.close(), next.close()]);
    await assert.rejects(next.assertOwned(), MemoryError);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'native-callback-cleanup-and-inode-faults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-owner-fault-'));
  try {
    const root = await prepareRoot(validateOptions(options(join(dir, 'data'))));
    const native = await loadNative();
    let wake!: () => void; let acquired!: () => void;
    const paused = new Promise<void>(resolve => { wake = resolve; });
    const locked = new Promise<void>(resolve => { acquired = resolve; });
    let descriptor = -1;
    const acquiring = acquireOwnership(root, { closeOnExec: fd => native.closeOnExec(fd), async exclusive(fd) { descriptor = fd; await native.exclusive(fd); acquired(); await paused; } });
    await locked;
    // A delayed native callback still holds the actual descriptor/lock.
    const other = await open(join(root.path, OWNER_FILE), 'r+');
    try { await assert.rejects(native.exclusive(other.fd)); } finally { await other.close(); }
    await unlink(join(root.path, OWNER_FILE));
    await writeFile(join(root.path, OWNER_FILE), '', { mode: 0o600 });
    const failed = assert.rejects(acquiring, MemoryError);
    wake(); await failed;
    const { fstatSync } = await import('node:fs');
    assert.throws(() => fstatSync(descriptor), 'cleanup must close the failed acquisition fd after callback completion');
    await unlink(join(root.path, OWNER_FILE));
    await symlink(join(root.path, 'outside'), join(root.path, OWNER_FILE));
    await assert.rejects(acquireOwnership(root), MemoryError);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
