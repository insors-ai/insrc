import assert from 'node:assert/strict';
import fs from 'node:fs';
import io from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { once } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { setImmediate as turn } from 'node:timers/promises';
import { join } from 'node:path';
import { ZipFile } from 'yazl';
import yauzl from 'yauzl';
import { privateRuntimeTest } from './_private-runtime-test.js';
import { boundaryFixture, boundaryPolicy, singleZip } from './_archive-boundary-fixture.js';
import { extractOllamaZip } from '../ollama-zip.js';
import { InstallerError } from '../contracts.js';
import { ollamaCloseUncertain } from '../ollama-cleanup.js';

privateRuntimeTest(import.meta.url, 'zip-extraction-uses-verified-descriptor-across-path-swap-and-positive-close', async () => {
  const f = boundaryFixture(), fromFd = yauzl.fromFd, close = fs.close; let descriptor = -1, closes = 0, closed = false, proofError: unknown;
  try {
    const good = singleZip(), bad = singleZip(Buffer.from('tampered')), input = f.input(good), inode = fs.lstatSync(input.archive).ino;
    assert.equal(good.length, bad.length);
    yauzl.fromFd = ((fd, options, callback) => {
      descriptor = fd; assert.equal(fs.fstatSync(fd).ino, inode);
      fs.renameSync(input.archive, input.archive + '.verified'); fs.writeFileSync(input.archive, bad, { mode: 0o600 });
      return fromFd(fd, options, (error, zip) => {
        if (zip) zip.once('close', () => { closed = true; try { assert.throws(() => fs.fstatSync(fd), { code: 'EBADF' }); } catch (cause) { proofError = cause; } });
        callback!(error, zip);
      });
    }) as typeof yauzl.fromFd;
    fs.close = ((fd, callback) => { if (fd === descriptor) closes++; return close(fd, callback); }) as typeof fs.close;
    syncBuiltinESMExports();
    const result = await extractOllamaZip(input.archive, input.stage, boundaryPolicy(good));
    assert.equal(result.files.length, 1); assert.equal(fs.readFileSync(join(input.stage, 'safe.txt'), 'utf8'), 'original');
    assert.deepEqual(fs.readFileSync(input.archive), bad); assert.equal(closed, true); assert.equal(closes, 1); assert.equal(proofError, undefined); f.preserved();
  } finally { yauzl.fromFd = fromFd; fs.close = close; syncBuiltinESMExports(); f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'cancelled-zip-waits-for-pending-descriptor-read-before-positive-close', async () => {
  const f = boundaryFixture(), fromFd = yauzl.fromFd, read = fs.read, openStream = yauzl.ZipFile.prototype.openReadStreamPromise;
  let descriptor = -1, armed = false, release: (() => void) | undefined, reached!: () => void, positivelyClosed = false, settled = false;
  const boundary = new Promise<void>(resolve => { reached = resolve; });
  try {
    const bytes = singleZip(Buffer.alloc(256 * 1024, 1)), input = f.input(bytes), abort = new AbortController();
    yauzl.fromFd = ((fd, options, callback) => {
      descriptor = fd; return fromFd(fd, options, (error, zip) => { zip?.once('close', () => { positivelyClosed = true; }); callback!(error, zip); });
    }) as typeof yauzl.fromFd;
    yauzl.ZipFile.prototype.openReadStreamPromise = async function (...args) { const stream = await openStream.apply(this, args); armed = true; return stream; };
    fs.read = ((fd, buffer, offset, length, position, callback) => read(fd, buffer, offset, length, position, (error, count, returned) => {
      if (fd === descriptor && armed && length > 1024 && !release) { let delivered = false; release = () => { if (!delivered) { delivered = true; callback(error, count, returned); } }; reached(); }
      else callback(error, count, returned);
    })) as typeof fs.read; syncBuiltinESMExports();
    const operation = extractOllamaZip(input.archive, input.stage, boundaryPolicy(bytes), abort.signal).finally(() => { settled = true; });
    const rejected = assert.rejects(operation, { code: 'cancelled' });
    await boundary; abort.abort(); await turn(); assert.equal(settled, false); assert.equal(positivelyClosed, false); assert.equal(fs.fstatSync(descriptor).isFile(), true);
    release!(); await rejected; assert.equal(positivelyClosed, true); f.preserved();
  } finally { release?.(); yauzl.fromFd = fromFd; fs.read = read; yauzl.ZipFile.prototype.openReadStreamPromise = openStream; syncBuiltinESMExports(); f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'zip-close-error-is-resource-uncertainty-and-never-false-completion', async () => {
  const f = boundaryFixture(), fromFd = yauzl.fromFd, close = fs.close; let descriptor = -1, refused = false;
  try {
    const bytes = singleZip(), input = f.input(bytes);
    yauzl.fromFd = ((fd, options, callback) => { descriptor = fd; return fromFd(fd, options, callback); }) as typeof yauzl.fromFd;
    fs.close = ((fd, callback) => {
      if (fd === descriptor) { refused = true; queueMicrotask(() => callback(Object.assign(new Error('owned close fault'), { code: 'EIO' }))); return; }
      return close(fd, callback);
    }) as typeof fs.close; syncBuiltinESMExports();
    await assert.rejects(extractOllamaZip(input.archive, input.stage, boundaryPolicy(bytes)), { code: 'resource-close-uncertain' });
    assert.equal(refused, true); assert.equal(fs.fstatSync(descriptor).isFile(), true, 'test fault really left the fd open'); f.preserved();
  } finally {
    yauzl.fromFd = fromFd; fs.close = close; syncBuiltinESMExports();
    if (refused) fs.closeSync(descriptor); f.cleanup();
  }
});

privateRuntimeTest(import.meta.url, 'abort-during-zip-close-cancels-after-positive-descriptor-release', async () => {
  const f = boundaryFixture(), fromFd = yauzl.fromFd, close = fs.close, abort = new AbortController(); let descriptor = -1, positive = false;
  try {
    const bytes = singleZip(), input = f.input(bytes);
    yauzl.fromFd = ((fd, options, callback) => { descriptor = fd; return fromFd(fd, options, callback); }) as typeof yauzl.fromFd;
    fs.close = ((fd, callback) => close(fd, error => {
      if (fd === descriptor && !error) { positive = true; abort.abort(); }
      callback(error);
    })) as typeof fs.close; syncBuiltinESMExports();
    await assert.rejects(extractOllamaZip(input.archive, input.stage, boundaryPolicy(bytes), abort.signal), { code: 'cancelled' });
    assert.equal(positive, true); f.preserved();
  } finally { yauzl.fromFd = fromFd; fs.close = close; syncBuiltinESMExports(); f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'zip-cancellation-cannot-erase-unclosed-output-resource-evidence', async () => {
  const f = boundaryFixture(), open = io.open, abort = new AbortController(); let retained: FileHandle | undefined;
  try {
    const bytes = singleZip(), input = f.input(bytes);
    io.open = (async (...args: Parameters<typeof open>) => {
      const handle = await open(...args); if (String(args[0]) !== join(input.stage, 'safe.txt')) return handle;
      retained = handle;
      return new Proxy(handle, { get(target, key) {
        if (key === 'close') return async () => { abort.abort(); throw new InstallerError('resource-close-uncertain', 'owned output really remains open'); };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
    }) as typeof open; syncBuiltinESMExports();
    await assert.rejects(extractOllamaZip(input.archive, input.stage, boundaryPolicy(bytes), abort.signal), (cause: unknown) => { assert.equal(ollamaCloseUncertain(cause), true); return true; });
    assert.ok(retained); assert.equal((await retained.stat()).isFile(), true); f.preserved();
  } finally { io.open = open; syncBuiltinESMExports(); await retained?.close(); f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'large-deflated-zip-consumes-coalesced-output-with-fixed-read-bounds', async () => {
  const f = boundaryFixture();
  try {
    const contents = Buffer.alloc(2 * 1024 * 1024); for (let i = 0; i < contents.length; i++) contents[i] = i % 251;
    const zip = new ZipFile(), parts: Buffer[] = []; zip.outputStream.on('data', bytes => parts.push(bytes)); const ended = once(zip.outputStream, 'end');
    zip.addBuffer(contents, 'large.dat', { compress: true }); zip.end(); await ended;
    const bytes = Buffer.concat(parts), input = f.input(bytes); await extractOllamaZip(input.archive, input.stage, boundaryPolicy(bytes));
    assert.deepEqual(fs.readFileSync(join(input.stage, 'large.dat')), contents); f.preserved();
  } finally { f.cleanup(); }
});
