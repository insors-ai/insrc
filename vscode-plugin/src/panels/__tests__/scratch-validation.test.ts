import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { ScratchValidationClient, SCRATCH_CODEC_VERSION, type ScratchValidationPort } from '../scratch-validation-client.js';
import { SCRATCH_NOTE_BYTES } from '../scratch-editor-protocol.js';
import { scratchEditorHtml } from '../scratch-editor-html.js';
import { runInProcessGroup } from '../../../../src/shared/process-group.js';

test('scratch worker bounds startup timeout cancellation epoch and queued data transfer', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let receive!: (value: unknown) => void, fail!: () => void, terminated = 0;
  const messages: Record<string, unknown>[] = [];
  const port: ScratchValidationPort = { post: value => messages.push(value as Record<string, unknown>),
    listen: (message, error) => { receive = message; fail = error; return () => {}; }, terminate: () => { terminated++; } };
  const client = new ScratchValidationClient(port, 1000);
  const epoch = messages[0]!['epoch'];
  const request = { source: 'Before\n', draft: 'After\n', baseKey: '1:' + 'a'.repeat(64), expectedIntent: 'a'.repeat(64) };
  const first = client.run(request);
  receive({ type: 'ready', epoch: 'wrong', codecVersion: SCRATCH_CODEC_VERSION }); assert.equal(messages.length, 1);
  receive({ type: 'ready', epoch, codecVersion: SCRATCH_CODEC_VERSION });
  assert.equal(messages.length, 3); assert.equal(messages[1]!['type'], 'base'); assert.equal(messages[1]!['draft'], undefined); assert.equal(messages[2]!['source'], undefined);
  const replaced = client.run(request); const rejected = assert.rejects(replaced, /superseded/);
  const latest = client.run({ ...request, draft: 'Newest\n' }); await rejected;
  receive({ type: 'result', epoch: 'wrong', requestId: 1, baseKey: request.baseKey, allowed: true }); assert.equal(messages.length, 3);
  receive({ type: 'result', epoch, requestId: 1, baseKey: request.baseKey, allowed: true }); assert.equal((await first).allowed, true); assert.equal(messages.length, 5);
  assert.equal(messages[4]!['draft'], 'Newest\n');
  const disposed = assert.rejects(latest, /disposed/); client.dispose(); await disposed; assert.equal(terminated, 1); fail(); assert.equal(terminated, 1);
  const timed = new ScratchValidationClient(port, 1000); const pending = timed.run(request); const timedRejection = assert.rejects(pending, /timed out/);
  context.mock.timers.tick(1001); await timedRejection; assert.equal(terminated, 2);
  await assert.rejects(timed.run(request), /unavailable/);
  const bounded = new ScratchValidationClient(port, 1000);
  await assert.rejects(bounded.run({ ...request, source: 'x'.repeat(SCRATCH_NOTE_BYTES + 1) }), /bounds/);
  await assert.rejects(bounded.run({ ...request, expectedIntent: 'execute()' }), /bounds/); bounded.dispose();
});

test('scratch exact configured codec and real blob worker agree under packaged CSP', { timeout: 90_000 }, async () => {
  const chrome = process.env['INSRC_CHROME_BIN'] ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
  assert.ok(chrome, 'Required worker/CSP qualification needs Chrome');
  const dir = await mkdtemp(join(tmpdir(), 'insrc-scratch-worker-'));
  const abort = new AbortController(); let child: ReturnType<typeof runInProcessGroup> | undefined;
  let result!: (value: unknown) => void;
  const evidence = new Promise<unknown>(resolve => { result = resolve; });
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://fixture');
    if (url.pathname === '/result') { result(JSON.parse(url.searchParams.get('data')!)); response.end('complete'); return; }
    const files: Record<string, string> = { '/': 'index.html', '/driver.js': 'driver.js', '/driver.css': 'driver.css' };
    const name = files[url.pathname]; if (!name) { response.writeHead(404); response.end(); return; }
    void readFile(join(dir, name)).then(bytes => { response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(bytes); }, () => { response.writeHead(404); response.end(); });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { bundleScratchEditor } = await import('../../../esbuild.mjs'); await bundleScratchEditor(dir);
    const worker = await readFile(join(dir, 'validator.js'), 'utf8'); assert.doesNotMatch(worker, /\bimport\s*\(|\bimportScripts\s*\(/);
    if (process.env['INSRC_WORKER_DEBUG_SOURCE']) await writeFile(process.env['INSRC_WORKER_DEBUG_SOURCE'], worker);
    await build({ entryPoints: [fileURLToPath(new URL('./fixtures/scratch-codec-worker-browser.ts', import.meta.url))], outfile: join(dir, 'driver.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', logLevel: 'silent', loader: { '.woff': 'file', '.woff2': 'file', '.ttf': 'file' } });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
    const html = scratchEditorHtml({ script: 'vscode-webview://fixture/driver.js', style: 'vscode-webview://fixture/driver.css', cspSource: 'vscode-webview://fixture', workerSource: worker }, 'worker_nonce')
      .replaceAll('vscode-webview://fixture', origin);
    assert.match(html, /connect-src 'none'; worker-src blob:/); await writeFile(join(dir, 'index.html'), html);
    child = runInProcessGroup(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, origin], { signal: abort.signal, timeoutMs: 60_000 });
    const data = await Promise.race([evidence, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Worker parity/CSP evidence timed out')), 50_000); }), child.then(r => { throw new Error('Chrome closed before worker evidence: ' + r.stderr.slice(-2000)); })]) as { error?: string; rows: { schema: boolean; serializer: boolean; admission: boolean; intent: boolean }[]; wrongIntent: boolean; violations: string[]; lifecycle: { created: number; terminated: number; urlsCreated: number; urlsRevoked: number }; rejectedAfterDispose: boolean };
    assert.equal(data.error, undefined, JSON.stringify(data));
    assert.equal(data.rows.length, 21); for (const row of data.rows) assert.deepEqual(row, { schema: true, serializer: true, admission: true, intent: true });
    assert.equal(data.wrongIntent, false); assert.deepEqual(data.violations, []);
    assert.deepEqual(data.lifecycle, { created: 1, terminated: 1, urlsCreated: 1, urlsRevoked: 1 }); assert.equal(data.rejectedAfterDispose, true);
  } finally { clearTimeout(timer); abort.abort(); if (child) await child; await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});

test('scratch packaged host worker independently validates Markdown without DOM or native access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'insrc-scratch-host-worker-'));
  const file = join(dir, 'validator.cjs');
  let worker: Worker | undefined, client: ScratchValidationClient | undefined;
  try {
    await build({ entryPoints: [fileURLToPath(new URL('../scratch-validation-host-worker.ts', import.meta.url))], outfile: file, bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'silent' });
    const bundled = await readFile(file, 'utf8'); assert.doesNotMatch(bundled, /require\(["'](?:vscode|node:fs|node:child_process)["']\)/);
    worker = new Worker(file); const owned = worker;
    client = new ScratchValidationClient({ post: value => owned.postMessage(value), listen: (message, error) => { owned.on('message', message); owned.on('error', error); return () => { owned.off('message', message); owned.off('error', error); }; }, terminate: () => { void owned.terminate(); } });
    assert.equal((await client.run({ source: 'Before\n', draft: 'After\n', baseKey: '1:a' })).allowed, true);
    assert.equal((await client.run({ source: '---\ntitle: keep\n---\n', draft: 'After\n', baseKey: '2:b' })).allowed, false);
  } finally { client?.dispose(); if (worker) await worker.terminate(); await rm(dir, { recursive: true, force: true }); }
});
