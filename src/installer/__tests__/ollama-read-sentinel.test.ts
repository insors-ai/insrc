import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { observeOllamaReads } from './_ollama-read-sentinel.js';

test('payload-read-sentinel-covers-sync-async-stream-and-path-read-entrypoints', async () => {
  const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'read-boundary-'));
  const executable = join(root, 'ollama'), data = join(root, 'data.dat'), metadata = join(root, 'inventory.json');
  fs.writeFileSync(executable, Buffer.alloc(16384, 1)); fs.writeFileSync(data, 'payload'); fs.writeFileSync(metadata, '{}');
  const observer = observeOllamaReads(root);
  const fds: number[] = [], handles: Awaited<ReturnType<typeof io.open>>[] = [];
  const callback = (run: (done: (error: NodeJS.ErrnoException | null, ...args: any[]) => void) => void) =>
    new Promise<any[]>((resolve, reject) => run((error, ...args) => error ? reject(error) : resolve(args)));
  const consume = async (stream: fs.ReadStream, closes = true) => { const closed = closes ? once(stream, 'close') : undefined; for await (const _part of stream) { /* record real bounded reads */ } await closed; };
  try {
    // Metadata is allowed through path strings, Buffer, URL and FileHandle APIs.
    assert.equal(fs.readFileSync(metadata, 'utf8'), '{}');
    assert.equal((await io.readFile(pathToFileURL(metadata))).toString(), '{}');
    assert.equal((await callback(done => fs.readFile(Buffer.from(metadata), done)))[0].toString(), '{}');
    const metaHandle = await io.open(metadata, 'r'); handles.push(metaHandle);
    assert.equal((await metaHandle.readFile()).toString(), '{}'); await metaHandle.close();
    const fd = fs.openSync(executable, 'r'); fds.push(fd);
    assert.equal(fs.readSync(fd, Buffer.alloc(16), 0, 16, 0), 16);
    assert.equal(fs.readvSync(fd, [Buffer.alloc(8)], 0), 8);
    assert.equal((await callback(done => fs.read(fd, Buffer.alloc(16), 0, 16, 0, done)))[0], 16);
    assert.equal((await callback(done => fs.readv(fd, [Buffer.alloc(8)], 0, done)))[0], 8);
    const [asyncFd] = await callback(done => fs.open(Buffer.from(executable), 'r', done)); fds.push(asyncFd);
    assert.equal(fs.readSync(asyncFd, Buffer.alloc(8), { position: 0 }), 8);
    const handle = await io.open(pathToFileURL(executable), 'r'); handles.push(handle);
    assert.equal((await handle.read({ buffer: Buffer.alloc(16), position: 0 })).bytesRead, 16);
    assert.equal((await handle.readv([Buffer.alloc(8)], 0)).bytesRead, 8);
    // All whole-content entrypoints reject before admitting installed reads.
    for (const path of [executable, Buffer.from(executable), pathToFileURL(executable), data, fd]) {
      assert.throws(() => fs.readFileSync(path), /whole installed-file read/);
      assert.throws(() => fs.readFile(path, () => {}), /whole installed-file read/);
      if (typeof path !== 'number') await assert.rejects(io.readFile(path), /whole installed-file read/);
    }
    await assert.rejects(handle.readFile(), /whole installed-file read/);
    await assert.rejects(io.readFile(handle), /whole installed-file read/);
    assert.throws(() => handle.readableWebStream(), /unbounded installed web stream/);
    assert.throws(() => handle.readLines(), /unbounded installed line stream/);
    assert.throws(() => fs.readSync(fd, Buffer.alloc(8192), 0, 8192, 0), /full installed-file read/);
    assert.throws(() => fs.read(fd, Buffer.alloc(8192), 0, 8192, 0, () => {}), /full installed-file read/);
    await assert.rejects(handle.read(Buffer.alloc(8192), 0, 8192, 0), /full installed-file read/);
    const dataFd = fs.openSync(data, 'r'); fds.push(dataFd);
    assert.throws(() => fs.readSync(dataFd, Buffer.alloc(1), 0, 1, 0), /unexpected content read/);
    for (const path of [executable, Buffer.from(executable), pathToFileURL(executable)]) {
      assert.throws(() => fs.createReadStream(path), /unbounded installed stream/);
    }
    assert.throws(() => fs.createReadStream('', { fd, autoClose: false }), /unbounded installed stream/);
    assert.throws(() => handle.createReadStream(), /unbounded installed stream/);
    assert.throws(() => fs.createReadStream(data, { start: 0, end: 1 }), /unexpected content read/);
    await consume(fs.createReadStream(pathToFileURL(executable), { start: 0, end: 31 }));
    await consume(fs.createReadStream('', { fd: asyncFd, autoClose: false, start: 0, end: 15 }), false);
    const streaming = await io.open(executable, 'r'); handles.push(streaming);
    await consume(streaming.createReadStream({ start: 0, end: 15 }));
    assert.ok(observer.reads.length > 0); assert.ok(observer.metadataReads.length > 0);
    assert.ok(observer.reads.every(read => read.file === 'ollama' && read.bytes <= 4096));
    assert.ok(observer.reads.some(read => read.api === 'stream'));
  } finally {
    for (const handle of handles) if (handle.fd !== -1) await handle.close();
    for (const fd of fds) fs.closeSync(fd);
    await observer.drain(); observer.restore(); fs.rmSync(root, { recursive: true, force: true });
  }
});
