import { privateRuntimeTest } from './_private-runtime-test.js';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareOllama, closedOllamaAttempts, verifyPreparedOllama } from '../ollama-prepare.js';
import { dependencyAttemptIdentity } from '../ollama-policy.js';
import { dependencyPort } from '../dependencies.js';
import { controlBinding } from '../native.js';
import { downloadBoundedAsset, downloadVerifiedAsset } from '../download.js';
import { OLLAMA_LIMITS } from '../ollama-policy.js';
import { ollamaFixture } from './_ollama-fixture.js';
import type { DependencyOperationContext } from '../peer-contracts.js';
import { createDependencyRetryContext } from '../dependency-context.js';
import { cleanupOllamaInstallAttempt } from '../ollama-recovery.js';

privateRuntimeTest(import.meta.url, 'stale-forged-and-cross-home-offers-reject-before-mutation', async () => {
  const f = await ollamaFixture();
  try {
    const large = { url: 'https://github.com/ollama/ollama/releases/download/v0.0.1-fixture/large.zip', bytes: 3 * 1024 ** 3, sha256: 'a'.repeat(64) };
    let sent = 0; const send = async () => { sent++; throw new Error('S3 large asset reached transport'); };
    await assert.rejects(downloadVerifiedAsset(large, join(f.root, 'large'), { transport: send }), /Invalid bounded/); assert.equal(sent, 0);
    await assert.rejects(downloadBoundedAsset(large, join(f.root, 'large'), OLLAMA_LIMITS.compressed, new AbortController().signal, send), /S3 large asset/); assert.equal(sent, 1);
    const { policy, offer } = await f.input(), context = f.context();
    for (const [location, candidate, owner] of [[f.location, { ...offer, id: 'f'.repeat(64) }, context],
      [f.location, { ...offer, destination: join(f.root, 'foreign') }, context],
      [{ ...f.location, home: join(f.root, 'foreign') }, offer, context], [f.location, offer, { ...context }]] as const) {
      await assert.rejects(prepareOllama(location, policy, candidate, owner as DependencyOperationContext, { recheck: f.recheck, transport: f.transport }));
      assert.equal(existsSync(join(f.home, 'deps')), false);
    }
    const port = dependencyPort(f.target, f.location, f.options);
    const declined = await port.decide(f.location, { offerId: offer.id, choice: 'decline' }); assert.equal(declined.ollama, 'missing');
    assert.equal(existsSync(join(f.home, 'deps')), false);
    writeFileSync(join(f.bin, f.target.os === 'win32' ? 'ollama.exe' : 'ollama'), 'existing user executable', { mode: 0o755 });
    await assert.rejects(prepareOllama(f.location, policy, offer, context, { recheck: f.recheck, transport: f.transport }), { code: 'dependency-offer-stale' });
    assert.equal(existsSync(join(f.home, 'deps')), false);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state', async () => {
  for (const race of ['policy', 'destination', 'endpoint'] as const) {
    const f = await ollamaFixture();
    try {
      const { policy, offer } = await f.input(); let checks = 0, publications = 0;
      await assert.rejects(prepareOllama(f.location, policy, offer, f.context(), { transport: f.transport,
        async recheck(signal) {
          if (++checks === 2) {
            if (race === 'policy') { const changed = structuredClone(policy); changed.limits.fileBytes--; f.setPolicy(changed); }
            if (race === 'destination') { mkdirSync(offer.destination, { recursive: true, mode: 0o700 }); writeFileSync(join(offer.destination, 'sentinel'), 'retain'); }
            if (race === 'endpoint') { f.server.listen(f.port, '127.0.0.1'); await once(f.server, 'listening'); }
          }
          return f.recheck(signal);
        }, publish() { publications++; } }), { code: 'dependency-offer-stale' });
      assert.equal(checks, 2); assert.equal(publications, 0); assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
      if (race === 'destination') assert.equal(readFileSync(join(offer.destination, 'sentinel'), 'utf8'), 'retain');
      if (race === 'endpoint') assert.equal(f.server.listening, true);
      assert.equal((await closedOllamaAttempts(f.location)).length, 1);
    } finally { await f.cleanup(); }
  }
});

privateRuntimeTest(import.meta.url, 'download-size-digest-layout-and-fsync-failures-never-report-ready', async () => {
  for (const failure of ['size', 'digest', 'layout', 'fsync', 'publication'] as const) {
    const f = await ollamaFixture();
    try {
      if (failure === 'layout') { const p = structuredClone(f.policy); p.layout.requiredFiles.push('lib/missing-library.so'); f.setPolicy(p); }
      const { policy, offer } = await f.input(), owner = f.context(); let sent = 0;
      await assert.rejects(prepareOllama(f.location, policy, offer, owner, { recheck: f.recheck,
        transport: async () => { sent++; const bytes = failure === 'size' ? f.bytes.subarray(1) : failure === 'digest' ? Buffer.from(f.bytes).fill(0, 0, 1) : f.bytes; return { status: 200, body: Readable.from([bytes]) }; },
        ...(failure === 'fsync' ? { flushFile() { throw new Error('injected fsync failure'); } } : {}),
        ...(failure === 'publication' ? { publish(handle: object, from: string, to: string) { controlBinding().publishDirectory(handle, from, to); throw new Error('injected post-publication fsync uncertainty'); } } : {}),
      }));
      assert.equal(sent, 1); assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
      const report = await dependencyPort(f.target, f.location, f.options).inspect(f.location); assert.notEqual(report.ollama, 'ready');
      if (failure !== 'publication') { assert.equal(existsSync(offer.destination), false); assert.equal((await closedOllamaAttempts(f.location)).length, 1); }
      else {
        assert.equal(existsSync(offer.destination), true); await verifyPreparedOllama(f.location, policy, offer.destination);
        await assert.rejects(prepareOllama(f.location, policy, offer, f.context('b'.repeat(64)), { recheck: f.recheck, transport: async () => { throw new Error('must not redownload'); } }), { code: 'dependency-uncertain' });
      }
    } finally { await f.cleanup(); }
  }
  const f = await ollamaFixture();
  try {
    const { policy, offer } = await f.input(), context = f.context();
    const prepared = await prepareOllama(f.location, policy, offer, context, { recheck: f.recheck, transport: f.transport });
    assert.equal(prepared.directory, offer.destination); assert.equal((await closedOllamaAttempts(f.location)).length, 1);
    const cli = join(prepared.directory, policy.layout.executable), inode = lstatSync(cli).ino;
    const reused = await prepareOllama(f.location, policy, offer, context, { recheck: f.recheck, transport: async () => { throw new Error('reuse cannot download'); } });
    assert.equal(reused.inventorySha256, prepared.inventorySha256); assert.equal(lstatSync(cli).ino, inode);
    writeFileSync(cli, 'tampered'); await assert.rejects(prepareOllama(f.location, policy, offer, context, { recheck: f.recheck, transport: f.transport }));
    assert.equal(readFileSync(cli, 'utf8'), 'tampered'); assert.equal(existsSync(join(f.home, 'releases')), false);
  } finally { await f.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'finite-actor-closure-uncertainty-blocks-retry-and-cleanup', async () => {
  for (const kind of ['cooperating-work', 'transport-close', 'transport-close-rejected'] as const) {
  const f = await ollamaFixture(); let release!: () => void;
  const cancel = new AbortController();
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let record: string | undefined;
  try {
    const { policy, offer } = await f.input(), owner = f.context('a'.repeat(64), cancel.signal), identity = dependencyAttemptIdentity(f.location, policy, offer, owner);
    record = join(f.home, identity.recordRelativePath);
    await assert.rejects(prepareOllama(f.location, policy, offer, owner, { recheck: f.recheck,
      transport: kind === 'cooperating-work' ? f.transport : async () => {
        const response = await f.transport(); response.body.once('close', () => cancel.abort());
        return { ...response, closed: kind === 'transport-close' ? blocked : Promise.reject(new Error('no positive transport closure')) };
      }, prepareMs: 5000, cleanupMs: 150, ...(kind === 'cooperating-work' ? { beforeFiniteClose: () => { cancel.abort(); return blocked; } } : {}) }), { code: 'dependency-uncertain' });
    assert.equal(existsSync(join(f.home, identity.stageRelativePath)), true); assert.equal(existsSync(offer.destination), false);
    await assert.rejects(closedOllamaAttempts(f.location), { code: 'dependency-uncertain' });
    await assert.rejects(prepareOllama(f.location, policy, offer, f.context('b'.repeat(64)), { recheck: f.recheck, transport: async () => { throw new Error('no second actor'); } }), { code: 'dependency-uncertain' });
    release();
    const closed = record.replace(/\.json$/, '.closed.json'), until = performance.now() + 5000;
    if (kind !== 'transport-close-rejected') {
      const disposed = record.replace(/\.json$/, '.disposed.json');
      while (!existsSync(disposed) && performance.now() < until) await delay(10);
      assert.equal(existsSync(closed), true); assert.equal(JSON.parse(readFileSync(closed, 'utf8')).outcome, 'cancelled');
      assert.equal(existsSync(disposed), true); assert.equal((await closedOllamaAttempts(f.location)).length, 1);
    } else { await delay(10); assert.equal(existsSync(closed), false); }
    assert.equal(existsSync(offer.destination), false);
    if (kind === 'transport-close-rejected') {
      assert.equal(existsSync(record.replace(/\.json$/, '.disposed.json')), false);
      await assert.rejects(closedOllamaAttempts(f.location), { code: 'dependency-uncertain' });
    }
  } finally { cancel.abort(); release(); await delay(10); await f.cleanup(); }
  }
  const f = await ollamaFixture(), cancel = new AbortController(); let release!: () => void, finished!: () => void;
  let verificationStarted = false;
  const pending = new Promise<void>(resolve => { release = resolve; }), closed = new Promise<void>(resolve => { finished = resolve; });
  try {
    const { policy, offer } = await f.input();
    await prepareOllama(f.location, policy, offer, f.context(), { recheck: f.recheck, transport: f.transport });
    const inode = lstatSync(join(offer.destination, policy.layout.executable)).ino, started = performance.now();
    await assert.rejects(prepareOllama(f.location, policy, offer, f.context('a'.repeat(64), cancel.signal), { recheck: f.recheck, transport: f.transport,
      prepareMs: 5000, cleanupMs: 40, async verifyExisting(...args) { verificationStarted = true; cancel.abort(); try { await pending; return await verifyPreparedOllama(...args); } finally { finished(); } } }), { code: 'dependency-uncertain' });
    assert.ok(performance.now() - started < 1000, 'stalled reuse verification has bounded cancellation/drain');
    await assert.rejects(prepareOllama(f.location, policy, offer, f.context(), { recheck: f.recheck, transport: f.transport }), { code: 'dependency-uncertain' });
    assert.equal(lstatSync(join(offer.destination, policy.layout.executable)).ino, inode);
    release(); await closed; await new Promise<void>(resolve => setImmediate(resolve));
    await prepareOllama(f.location, policy, offer, f.context(), { recheck: f.recheck, transport: async () => { throw new Error('verified reuse cannot download'); } });
  } finally { cancel.abort(); release(); if (verificationStarted) await closed; await f.cleanup(); }
  const production = await ollamaFixture(), probeCancel = new AbortController();
  let releaseProbe!: () => void, probeFinished!: () => void, probeStarted = false;
  const probeWait = new Promise<void>(resolve => { releaseProbe = resolve; }), probeClosed = new Promise<void>(resolve => { probeFinished = resolve; });
  try {
    const { policy, offer } = await production.input(), io = production.options.io!; let roots = 0, downloads = 0;
    production.options.io = { ...io, async realpath(file) {
      if (file === production.options.runtimeDirectory && ++roots === 3) {
        probeStarted = true; probeCancel.abort();
        try { await probeWait; return await io.realpath(file); } finally { probeFinished(); }
      }
      return io.realpath(file);
    } };
    const port = dependencyPort(production.target, production.location, { ...production.options, preparation: { cleanupMs: 40, prepareMs: 5000,
      transport: async () => { downloads++; return production.transport(); } } });
    const owner = production.context('a'.repeat(64), probeCancel.signal), id = dependencyAttemptIdentity(production.location, policy, offer, owner);
    await assert.rejects(port.decide(production.location, { choice: 'install', offerId: offer.id }, owner), { code: 'dependency-uncertain' });
    assert.equal(probeStarted, true); assert.equal(downloads, 1); assert.equal(existsSync(offer.destination), false);
    const record = join(production.home, id.recordRelativePath);
    assert.equal(JSON.parse(readFileSync(record.replace(/\.json$/, '.closed.json'), 'utf8')).outcome, 'prepared');
    assert.equal(existsSync(record.replace(/\.json$/, '.cleanup.json')), false, 'an unclosed production probe cannot authorize cleanup');
    assert.equal(existsSync(join(production.home, id.stageRelativePath)), true);
    await assert.rejects(port.decide(production.location, { choice: 'install', offerId: offer.id }, production.context('b'.repeat(64))), { code: 'dependency-uncertain' });
    assert.equal(downloads, 1); releaseProbe(); await probeClosed; await new Promise<void>(resolve => setImmediate(resolve));
  } finally { probeCancel.abort(); releaseProbe(); if (probeStarted) await probeClosed; await production.cleanup(); }
});

privateRuntimeTest(import.meta.url, 'private-preparation-cancellation-blocks-later-publication', async () => {
  for (const kind of ['abort-before-download', 'abort-after-extract', 'owner-lost'] as const) {
    const f = await ollamaFixture();
    try {
      const { policy, offer } = await f.input(), cancel = new AbortController(); let publication = 0;
      await assert.rejects(prepareOllama(f.location, policy, offer, f.context('a'.repeat(64), cancel.signal), { recheck: f.recheck,
        transport: async () => { if (kind === 'abort-before-download') cancel.abort(); return f.transport(); },
        beforeFiniteClose: async () => { if (kind === 'owner-lost') f.loseOwner(); else cancel.abort(); }, publish() { publication++; } }));
      assert.equal(publication, 0); assert.equal(existsSync(offer.destination), false); assert.equal((await closedOllamaAttempts(f.location)).length, 1);
      assert.equal(readFileSync(join(f.home, 'application-data'), 'utf8'), 'retain');
      const stage = join(f.home, 'deps/ollama/.staging/prepare-operation'); assert.deepEqual(readdirSync(stage), []);
    } finally { await f.cleanup(); }
  }
  const f = await ollamaFixture(), cancel = new AbortController(); let release!: () => void;
  const disposal = new Promise<void>(resolve => { release = resolve; }); let cancelledAt = 0;
  let record = '';
  try {
    const { policy, offer } = await f.input(), owner = f.context('a'.repeat(64), cancel.signal);
    record = join(f.home, dependencyAttemptIdentity(f.location, policy, offer, owner).recordRelativePath);
    await assert.rejects(prepareOllama(f.location, policy, offer, owner, { recheck: f.recheck, transport: f.transport, cleanupMs: 250,
      async beforeFiniteClose() { cancelledAt = performance.now(); cancel.abort(); await delay(175); }, beforeStageDisposal: () => disposal }), { code: 'dependency-uncertain' });
    assert.ok(performance.now() - cancelledAt < 350, 'finite drain and disposal share one 250 ms budget');
    assert.equal(existsSync(record.replace(/\.json$/, '.disposed.json')), false); assert.equal(existsSync(offer.destination), false);
    release();
    // The timed-out original cleanup stops before further deletes. Explicit
    // Retry gets a fresh bounded cleanup budget after the old actor closes.
    const end = performance.now() + 5000;
    while (true) {
      try { await cleanupOllamaInstallAttempt(f.location, createDependencyRetryContext(f.location, f.target.os, { ...f.context() })); break; }
      catch (cause) { if (performance.now() >= end) throw cause; await delay(10); }
    }
    const disposed = record.replace(/\.json$/, '.disposed.json');
    assert.equal(existsSync(disposed), true); assert.equal((await closedOllamaAttempts(f.location)).length, 1);
  } finally { cancel.abort(); release(); await delay(10); await f.cleanup(); }
});
