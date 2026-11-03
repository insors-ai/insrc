import assert from 'node:assert/strict';
import { link, mkdtemp, open, readFile, readdir, rm, stat, symlink, unlink, writeFile } from 'node:fs/promises';
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
    const owner = await acquireOwnership(options(root.path));
    try {
      assert.equal(await readFile(join(root.path, LAYOUT_FILE), 'utf8'), LAYOUT_TEXT);
      assert.equal((await readdir(root.path)).includes(LAYOUT_PENDING), false);
      await assert.rejects(acquireOwnership(options(root.path)), (error: unknown) => error instanceof MemoryError && error.code === 'OWNERSHIP_CONFLICT');
      await owner.assertOwned();
    } finally { await owner.close(); }
    const inode = (await stat(join(root.path, OWNER_FILE))).ino;
    const next = await acquireOwnership(options(root.path));
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
    const acquiring = acquireOwnership(options(root.path), { closeOnExec: fd => native.closeOnExec(fd), async exclusive(fd) { descriptor = fd; await native.exclusive(fd); acquired(); await paused; } });
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
    await assert.rejects(acquireOwnership(options(root.path)), MemoryError);
    await unlink(join(root.path, OWNER_FILE));
    await writeFile(join(root.path, OWNER_FILE), '', { mode: 0o600 });
    await link(join(root.path, OWNER_FILE), join(dir, 'hardlinked-owner'));
    let lockCalls = 0;
    await assert.rejects(acquireOwnership(options(root.path), {
      closeOnExec: fd => native.closeOnExec(fd),
      async exclusive(fd) { lockCalls++; await native.exclusive(fd); },
    }), (error: unknown) => error instanceof MemoryError && error.code === 'INVALID_REQUEST');
    assert.equal(lockCalls, 0, 'an unsafe candidate must be rejected before invoking flock');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'layout-state-is-decided-under-ownership-after-one-preflight', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-layout-transition-'));
  const config = options(join(dir, 'data'));
  const native = await loadNative();
  let existingInode = 0;
  try {
    // The first open preflights a new directory. Before it locks, a second
    // cooperating opener initializes it. The first must adopt that marker.
    const owner = await acquireOwnership(config, {
      closeOnExec: fd => native.closeOnExec(fd),
      async exclusive(fd) {
        const initializer = await acquireOwnership(config);
        existingInode = (await stat(join(config.dataDirectory, LAYOUT_FILE))).ino;
        await initializer.close();
        await native.exclusive(fd);
      },
    });
    try {
      await owner.assertOwned();
      assert.equal((await stat(join(config.dataDirectory, LAYOUT_FILE))).ino, existingInode, 'an initialization completed after preflight must not be repeated');
    } finally { await owner.close(); }

    // Guarded validation also refuses a layout made invalid after preflight;
    // failure closes only the failed acquisition descriptor and changes no data.
    let descriptor = -1;
    await assert.rejects(acquireOwnership(config, {
      closeOnExec: fd => native.closeOnExec(fd),
      async exclusive(fd) {
        descriptor = fd; await native.exclusive(fd);
        await writeFile(join(config.dataDirectory, LAYOUT_FILE), 'invalid', { mode: 0o600 });
      },
    }), (error: unknown) => error instanceof MemoryError && error.code === 'INVALID_REQUEST');
    const { fstatSync } = await import('node:fs');
    assert.throws(() => fstatSync(descriptor));
    assert.equal(await readFile(join(config.dataDirectory, LAYOUT_FILE), 'utf8'), 'invalid');
    const probe = await open(join(config.dataDirectory, OWNER_FILE), 'r+');
    try { await native.exclusive(probe.fd); } finally { await probe.close(); }

    const unrelated = options(join(dir, 'unrelated'));
    const { mkdir } = await import('node:fs/promises');
    await mkdir(unrelated.dataDirectory, { mode: 0o700 });
    await writeFile(join(unrelated.dataDirectory, 'index.lance'), 'unrelated');
    await assert.rejects(acquireOwnership(unrelated), (error: unknown) => error instanceof MemoryError && error.code === 'INVALID_REQUEST');
    assert.deepEqual(await readdir(unrelated.dataDirectory), ['index.lance'], 'preflight refusal must not create a lock file');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
