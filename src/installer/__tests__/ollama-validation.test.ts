import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, unlinkSync, symlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { dependencyPort } from '../dependencies.js';
import { prepareOllama, verifyPreparedOllama } from '../ollama-prepare.js';
import { canonicalJson } from '../release-descriptor.js';
import { ollamaFixture } from './_ollama-fixture.js';
import { observeOllamaReads } from './_ollama-read-sentinel.js';
import { privateRuntimeTest } from './_private-runtime-test.js';

async function preparedFixture() {
  const f = await ollamaFixture();
  try {
    const { policy, offer } = await f.input();
    const prepared = await prepareOllama(f.location, policy, offer, f.context(), { recheck: f.recheck, transport: f.transport });
    return { ...f, prepared, policy, offer };
  } catch (error) { await f.cleanup(); throw error; }
}

privateRuntimeTest(import.meta.url, 'inspection-and-reconciliation-share-three-second-bound-without-payload-hashing', async () => {
  const f = await preparedFixture(); let observer: ReturnType<typeof observeOllamaReads> | undefined;
  let release: (() => void) | undefined, entered = false, finished = false;
  try {
    observer = observeOllamaReads(f.prepared.directory);
    let started = performance.now();
    const report = await dependencyPort(f.target, f.location, f.options).inspect(f.location);
    assert.equal(report.ollama, 'installed-not-running', JSON.stringify(report));
    assert.ok(performance.now() - started < 3000);
    assert.ok(observer.reads.length > 0, 'the sentinel observes the real bounded target-header reads');
    assert.ok(observer.reads.every(read => read.bytes <= 4096)); await observer.drain(); observer.restore();
    const wait = new Promise<void>(resolve => { release = resolve; });
    const inventory = join(f.prepared.directory, 'inventory.json');
    observer = observeOllamaReads(f.prepared.directory, async file => {
      if (file === inventory) { entered = true; await wait; finished = true; }
    });
    started = performance.now();
    const bounded = await dependencyPort(f.target, f.location, { ...f.options, budgetMs: 100 }).inspect(f.location);
    assert.equal(entered, true, 'the delayed read belongs to reconciliation, after presence probes');
    assert.equal(finished, false); assert.equal(bounded.ollama, 'unavailable');
    assert.ok(bounded.blockers.some(text => text.includes('aggregate deadline')));
    assert.ok(performance.now() - started < 2000, 'reconciliation has no separate deep-verification deadline');
    release(); await observer.drain(); assert.equal(finished, true);
    const cancel = new AbortController(); cancel.abort();
    await assert.rejects(dependencyPort(f.target, f.location, f.options).inspect(f.location, { signal: cancel.signal }), { code: 'cancelled' });
  } finally { release?.(); await observer?.drain(); observer?.restore(); await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'same-size-installed-content-change-does-not-trigger-digest-reverification', async () => {
  const f = await preparedFixture();
  const data = join(f.prepared.directory, 'lib/data.dat'), original = readFileSync(data);
  const observer = observeOllamaReads(f.prepared.directory); let downloads = 0;
  try {
    writeFileSync(data, Buffer.alloc(original.length, 2));
    const verified = await verifyPreparedOllama(f.location, f.policy, f.prepared.directory);
    assert.equal(verified.inventorySha256, f.prepared.inventorySha256);
    assert.equal((await dependencyPort(f.target, f.location, f.options).inspect(f.location)).ollama, 'installed-not-running');
    const reused = await prepareOllama(f.location, f.policy, f.offer, f.context(), { recheck: f.recheck,
      transport: async () => { downloads++; return f.transport(); } });
    assert.equal(reused.inventorySha256, f.prepared.inventorySha256); assert.equal(downloads, 0);
    assert.ok(observer.reads.length > 0); assert.ok(observer.reads.every(read => read.file !== 'lib/data.dat'));
  } finally { await observer.drain(); observer.restore(); await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'receipt-closure-and-layout-errors-block-reuse-without-content-rehash', async () => {
  for (const kind of ['receipt', 'closure', 'layout', 'size', 'link', ...(process.platform === 'win32' ? [] : ['mode'])]) {
    const f = await preparedFixture(); let observer: ReturnType<typeof observeOllamaReads> | undefined;
    try {
      const data = join(f.prepared.directory, 'lib/data.dat');
      if (kind === 'receipt') {
        const path = join(f.prepared.directory, '.ollama-receipt.json'), receipt = JSON.parse(readFileSync(path, 'utf8'));
        receipt.assetSha256 = '0'.repeat(64); writeFileSync(path, canonicalJson(receipt));
      } else if (kind === 'closure') {
        const path = join(f.home, f.prepared.identity.recordRelativePath).replace(/\.json$/, '.closed.json');
        const closure = JSON.parse(readFileSync(path, 'utf8')); closure.inventorySha256 = '0'.repeat(64); writeFileSync(path, canonicalJson(closure));
      } else if (kind === 'layout') unlinkSync(data);
      else if (kind === 'size') writeFileSync(data, 'short');
      else if (kind === 'link') { unlinkSync(data); symlinkSync(join(f.home, 'application-data'), data); }
      else chmodSync(data, 0o755);
      observer = observeOllamaReads(f.prepared.directory);
      const report = await dependencyPort(f.target, f.location, f.options).inspect(f.location);
      assert.equal(report.ollama, 'unavailable', `${kind}: ${JSON.stringify(report)}`);
      let downloads = 0;
      await assert.rejects(prepareOllama(f.location, f.policy, f.offer, f.context(), { recheck: f.recheck,
        transport: async () => { downloads++; return f.transport(); } }), { code: kind === 'receipt' || kind === 'closure' ? 'dependency-uncertain' : 'archive-unsafe' }, kind);
      assert.equal(downloads, 0, `${kind}: invalid installed evidence cannot trigger acquisition`);
      assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
    } finally { await observer?.drain(); observer?.restore(); await f.cleanup(); }
  }
});

privateRuntimeTest(import.meta.url, 'archive-digest-mismatch-still-rejects-live-acquisition', async () => {
  const f = await ollamaFixture();
  try {
    const { policy, offer } = await f.input(), corrupt = Buffer.from(f.bytes); corrupt[corrupt.length - 1]! ^= 1;
    let sent = 0;
    await assert.rejects(prepareOllama(f.location, policy, offer, f.context(), { recheck: f.recheck,
      transport: async () => { sent++; return { status: 200, body: Readable.from([corrupt]) }; } }), /digest|SHA|hash/i);
    assert.equal(sent, 1); assert.equal(existsSync(offer.destination), false);
    assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
  } finally { await f.cleanup(); }
});
