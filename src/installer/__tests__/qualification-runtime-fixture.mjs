import { register } from 'tsx/esm/api';
register();
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import yauzl from 'yauzl';
import { ZipFile } from 'yazl';
import { QUALIFICATION_TIME_BUDGETS as policy } from '../qualification-time-budgets.mjs';
const { RUNTIME_LIMITS, runtimeInventoryJson, runtimeCompletionJson } = await import('../runtime-metadata.ts');
const { stageRuntime, closedRuntimeOperation } = await import('../runtime-acquire.ts');
const { verifyRuntimeEntry, resolveRuntimeStore } = await import('../runtime-store.ts');
const { extractRuntimeArchiveBytes } = await import('../runtime-archive.ts');
const { downloadJson, downloadVerifiedAsset, downloadBoundedAsset } = await import('../download.ts');
const { runtimePolicy, runtimeArchive } = await import('../runtime-policy.ts');
const [root, mode] = process.argv.slice(2);
const timing = policy.runtime, sha = bytes => createHash('sha256').update(bytes).digest('hex');

if (mode === 'timers') {
  const observed = [], timeout = AbortSignal.timeout;
  AbortSignal.timeout = ms => { observed.push(ms); return new AbortController().signal; };
  try {
    const stopped = Error('stop before native allocation');
    await assert.rejects(stageRuntime({ assertHeld() { throw stopped; }, location: {} }, {}), error => error === stopped);
    assert.deepEqual(observed.splice(0), [timing.acquisitionMs]);
    await assert.rejects(verifyRuntimeEntry(root, {}));
    await assert.rejects(resolveRuntimeStore({}, {}));
    assert.deepEqual(observed.splice(0), [timing.verificationMs, timing.verificationMs]);
    const bytes = Buffer.from('{}'), transport = async () => ({ status: 200, body: Readable.from([bytes]) });
    assert.deepEqual(await downloadJson('https://fixture.invalid/metadata', { transport }), {});
    const asset = { url: 'https://fixture.invalid/asset', bytes: bytes.length, sha256: sha(bytes) };
    await downloadVerifiedAsset(asset, join(root, 'verified'), { transport });
    assert.deepEqual(observed.splice(0), [timing.acquisitionMs, timing.acquisitionMs]);
    const owner = new AbortController();
    await downloadBoundedAsset(asset, join(root, 'bounded'), 1024, owner.signal, async (_url, signal) => {
      assert.equal(signal, owner.signal); return transport();
    });
    assert.deepEqual(observed, [], 'bounded download must not add a shorter nested timer');
  } finally { AbortSignal.timeout = timeout; }

  // Exercise the actual ZIP parser with a controlled decoder that withholds its
  // close callback. fromBuffer owns no file descriptor; this is resource-proof
  // testing of unqualified fixture bytes, never native Windows evidence.
  const data = Buffer.from('unqualified decoder fixture'), target = { os: 'win32', arch: 'x64', baseline: 'fixture' };
  const zip = new ZipFile(), chunks = [], ended = once(zip.outputStream, 'end');
  zip.outputStream.on('data', bytes => chunks.push(bytes));
  zip.addBuffer(data, `${runtimeArchive(target).root}/node.exe`); zip.end(); await ended;
  const original = yauzl.fromBuffer, timer = globalThis.setTimeout, decoders = [], archives = [], drains = [];
  yauzl.fromBuffer = function(bytes, options, callback) {
    return original.call(this, bytes, options, (error, file) => {
      if (file) {
        archives.push(file);
        file.openReadStream = (_entry, accept) => {
          const state = {};
          const stream = new Readable({ autoDestroy: false,
            read() { this.push(data); this.push(null); },
            destroy(error, done) { state.release = () => done(error); } });
          state.stream = stream; state.closed = once(stream, 'close'); decoders.push(state);
          accept(null, stream);
        };
      }
      callback(error, file);
    });
  };
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms === timing.resourceDrainMs) { drains.push(ms); return timer(callback, 1, ...args); }
    return timer(callback, ms, ...args);
  };
  try {
    await assert.rejects(extractRuntimeArchiveBytes(Buffer.concat(chunks), root, target, new AbortController().signal),
      { code: 'resource-close-uncertain' });
    assert.ok(drains.length > 0); assert.ok(drains.every(ms => ms === timing.resourceDrainMs));
  } finally {
    globalThis.setTimeout = timer; yauzl.fromBuffer = original;
    for (const decoder of decoders) { assert.ok(decoder.release); decoder.release(); await decoder.closed; assert.equal(decoder.stream.closed, true); }
    for (const file of archives) file.close();
  }
} else if (mode === 'closure') {
  const timer = globalThis.setTimeout, drains = [];
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms === timing.resourceDrainMs) { drains.push(ms); return timer(callback, 1, ...args); }
    return timer(callback, ms, ...args);
  };
  try {
    const signal = new AbortController(); signal.abort(Error('explicit cancellation'));
    await assert.rejects(closedRuntimeOperation(new Promise(() => {}), signal.signal), { code: 'resource-close-uncertain' });
    assert.deepEqual(drains, [timing.resourceDrainMs]);
    assert.equal(await closedRuntimeOperation(Promise.resolve('actual closed result'), signal.signal), 'actual closed result');
  } finally { globalThis.setTimeout = timer; }
} else if (mode === 'compatibility') {
  const { installerSchemas } = await import('../schemas.ts');
  const { createDevSourceOffer, devPreparationPaths } = await import('../dev.ts');
  const { parseDevWorkerLaunch } = await import('../dev-worker.ts');
  assert.deepEqual(RUNTIME_LIMITS, { completionBytes: 65536, inventoryBytes: 16777216, entries: 32768,
    entryBytes: 134217728, expandedBytes: 1073741824, compressedBytes: 268435456,
    networkMs: timing.acquisitionMs, verificationMs: timing.verificationMs });
  assert.deepEqual(runtimePolicy, JSON.parse(readFileSync(new URL('../runtime-policy.json', import.meta.url), 'utf8')));
  assert.deepEqual(Object.keys(installerSchemas.runtime.properties).sort(), ['relativeExecutable', 'sha256', 'target', 'version']);
  assert.deepEqual(Object.keys(installerSchemas.snapshot.properties).sort(), ['installation', 'lastResult', 'operation', 'revision', 'schemaVersion']);
  const target = { os: 'linux', arch: 'arm64', baseline: 'fixture' };
  const runtime = { version: '22.22.1', target, sha256: runtimeArchive(target).sha256, relativeExecutable: 'bin/node' };
  const sourceOffer = createDevSourceOffer({ kind: 'dev-source', delivery: { mode: 'dev', repository: '/source', branch: 'installer' },
    sourceCommit: 'a'.repeat(40), target, runtime, recipeVersion: 'dev-v2-app-only' });
  const checkpoint = { schemaVersion: 1, installationId: 'fixture', operationId: 'op', attemptId: 'attempt', workerNonce: 'n'.repeat(32),
    sourceOffer, ...devPreparationPaths('op', 'attempt'), stage: 'accepted', coordinatorRunId: randomUUID() };
  const launch = { schemaVersion: 1, kind: 'prepare', checkpoint };
  assert.deepEqual(parseDevWorkerLaunch(launch), launch);
  assert.throws(() => parseDevWorkerLaunch({ ...launch, profile: policy.profile }), { code: 'schema-invalid' });
  const inventory = [{ path: 'node', bytes: 1, sha256: 'a'.repeat(64), mode: 420 }];
  assert.equal(runtimeInventoryJson(inventory), JSON.stringify({ schemaVersion: 1, files: inventory }));
  const completion = { schemaVersion: 1, identity: runtime, profileVersion: 'node22-minimal-v1',
    inventorySha256: 'b'.repeat(64), npmVersion: '10.9.4', headersVersion: '22.22.1' };
  assert.deepEqual(JSON.parse(runtimeCompletionJson(completion)), completion);
} else { throw Error('Unknown qualification runtime fixture'); }
