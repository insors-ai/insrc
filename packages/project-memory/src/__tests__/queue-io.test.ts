import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, readFile, rename, readdir, rm, symlink, link, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireOwnership } from '../ownership.js';
import { MemoryError } from '../errors.js';
import { QueueIo, INITIAL_SEGMENT, segmentName } from '../queue/io.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';

nativeTest(import.meta.url, 'owned-bootstrap-short-write-and-directory-sync', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-queue-io-')));
  const owner = await acquireOwnership(options(root));
  const events: string[] = [];
  let writes = 0;
  const io = new QueueIo(owner, root, {
    async before(op, name) { events.push(op + ':' + name); },
    async write(file, bytes, offset, length, position) {
      writes++;
      return (await file.write(bytes, offset, Math.min(length, 7), position)).bytesWritten;
    },
  });
  try {
    await io.start(); const first = await io.bootstrap();
    assert.ok(writes > 2, 'short writes must loop');
    assert.ok(events.includes('directory-sync:root'));
    assert.ok(events.includes('directory-sync:queue'));
    assert.ok(events.includes('directory-sync:segments'));
    assert.equal(events.indexOf('file-sync:format.json') < events.lastIndexOf('directory-sync:queue'), true);
    assert.equal(events.indexOf('file-sync:segments/' + segmentName(INITIAL_SEGMENT)) < events.lastIndexOf('directory-sync:segments'), true);
    assert.deepEqual(await readdir(join(root, 'queue')), ['format.json', 'segments']);
    assert.equal((await readFile(join(root, 'queue', 'format.json'), 'utf8')).includes(first.queueId), true);
    await io.close();
    const next = new QueueIo(owner, root);
    try { await next.start(); assert.equal((await next.bootstrap()).queueId, first.queueId); }
    finally { await next.close(); }
    // Queue close does not release the S1 guard.
    await owner.assertOwned();
    await assert.rejects(acquireOwnership(options(root)), (e: unknown) => e instanceof MemoryError && e.code === 'OWNERSHIP_CONFLICT');
  } finally { await io.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'uncertain-write-fences-without-unsafe-cleanup', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-queue-zero-')));
  const owner = await acquireOwnership(options(root));
  let zero = false;
  const io = new QueueIo(owner, root, { async write(file, bytes, offset, length, position) {
    if (zero) return 0;
    return (await file.write(bytes, offset, length, position)).bytesWritten;
  } });
  try {
    await io.start(); await io.bootstrap(); zero = true;
    await assert.rejects(io.write('recovery.json', Buffer.from('sensitive'), 'create'), MemoryError);
    assert.equal(io.fenced, true);
    await assert.rejects(io.write('fault.json', Buffer.from('other'), 'create'), MemoryError);
    assert.equal((await readFile(join(root, 'queue', 'recovery.json'))).length, 0);
    await io.close(); await owner.assertOwned();
  } finally { await io.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'unsafe-queue-files-and-directory-replacement-are-refused', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-queue-unsafe-')));
  const owner = await acquireOwnership(options(root));
  const io = new QueueIo(owner, root);
  try {
    await io.start(); await io.bootstrap();
    await writeFile(join(root, 'outside'), 'private', { mode: 0o600 });
    await symlink(join(root, 'outside'), join(root, 'queue', 'fault.json'));
    await assert.rejects(io.read('fault.json', 512), MemoryError);
    await assert.rejects(io.read('../outside', 512), MemoryError);
    await assert.rejects(io.read('format.json', 1), MemoryError);
    await link(join(root, 'queue', 'format.json'), join(root, 'linked-format'));
    await assert.rejects(io.read('format.json', 512), MemoryError);
    assert.equal(await readFile(join(root, 'outside'), 'utf8'), 'private');
    await rename(join(root, 'queue'), join(root, 'preserved-queue'));
    await mkdir(join(root, 'queue'), { mode: 0o700 });
    await assert.rejects(io.assertOwned(), MemoryError);
    assert.equal((await readdir(join(root, 'queue'))).length, 0);
  } finally { await io.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});

nativeTest(import.meta.url, 'file-sync-failure-preserves-written-bytes-and-ownership', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-queue-sync-')));
  const owner = await acquireOwnership(options(root));
  let fail = false;
  const io = new QueueIo(owner, root, { async before(op) { if (fail && op === 'file-sync') throw Error('private disk path'); } });
  try {
    await io.start(); await io.bootstrap(); fail = true;
    await assert.rejects(io.write('recovery.json', Buffer.from('written'), 'create'), (error: unknown) => error instanceof MemoryError && !error.message.includes('private disk path'));
    assert.equal(io.fenced, true);
    assert.equal(await readFile(join(root, 'queue', 'recovery.json'), 'utf8'), 'written');
    await io.close(); await owner.assertOwned();
  } finally { await io.close(); await owner.close(); await rm(root, { recursive: true, force: true }); }
});
