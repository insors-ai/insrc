import assert from 'node:assert/strict';
import { after } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm, lstat, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeTest, node22 } from './fixtures/node22.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
let directory: string | undefined;
let setup: Promise<{ dir: string; env: NodeJS.ProcessEnv; files: string[] }> | undefined;
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
function packed() {
  return setup ??= (async () => {
    const dir = directory = await mkdtemp(join(tmpdir(), 'memory-packed-'));
    const env = { ...process.env, PATH: dirname(node22()) + ':' + process.env['PATH'], CXXFLAGS: '-std=c++17' };
    for (const key of Object.keys(env)) if (/^npm_/i.test(key) || ['NODE_PATH', 'NODE_OPTIONS', 'NODE_TEST_CONTEXT', 'INSRC_HOME'].includes(key)) delete env[key];
    env['NPM_CONFIG_USERCONFIG'] = join(dir, 'empty.npmrc');
    env['NPM_CONFIG_GLOBALCONFIG'] = join(dir, 'global.npmrc');
    await writeFile(env['NPM_CONFIG_USERCONFIG']!, ''); await writeFile(env['NPM_CONFIG_GLOBALCONFIG']!, '');
    const npm = (args: string[], cwd = dir) => execFileSync('npm', args, { cwd, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 4_000_000 });
    const result = JSON.parse(npm(['pack', root, '--json', '--pack-destination', dir])) as { filename: string; files: { path: string }[] }[];
    const artifact = result[0]!;
    await writeFile(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    npm(['install', '--no-audit', '--no-fund', join(dir, artifact.filename), 'typescript@5.9.3', '@types/node@22.20.5']);
    const installed = join(dir, 'node_modules/@insrc/project-memory');
    assert.equal((await lstat(installed)).isSymbolicLink(), false);
    assert.equal(env['NODE_PATH'], undefined);
    return { dir, env, files: artifact.files.map(f => f.path) };
  })();
}
const consumer = `import assert from 'node:assert/strict';
import { MemoryFactory } from '@insrc/project-memory';
import type { MemoryFactory as Factory, MemoryOptions } from '@insrc/project-memory';
const factory: Factory = MemoryFactory;
let calls = 0;
const opts: MemoryOptions = { dataDirectory: process.argv[2]!, models: { embeddingModel: 'test', embeddingDimension: 1, async complete() { calls++; return null; }, async embed() { calls++; return [1]; } }, policy: { async bind(projectId) { return { projectId, root: '/host', scopeEpoch: '1' }; }, async admit(_b, event) { return event; } }, logger: { write() {} }, limits: { maxEventBytes: 1024, segmentBytes: 4096, maxPendingBytes: 8192, modelTimeoutMs: 1000 } };
const service = await factory.open(opts); await service.ready();
const command = { version: 1 as const, scope: { projectId: 'packed' }, source: { producerId: 'consumer', eventId: 'stable-event', sessionId: 'session', turnId: 'turn', sourceVersion: '1' }, kind: 'capture' as const, payload: { text: 'durable evidence' } };
const receipt = await service.submit(command); assert.equal(receipt.state, 'accepted');
if (process.argv[3] === 'crash') {
  process.stdout.write(JSON.stringify(receipt) + '\\n', () => process.kill(process.pid, 'SIGKILL'));
  await new Promise<void>(() => {});
}
if (process.argv[4]) assert.deepEqual(receipt, JSON.parse(process.argv[4]));
assert.deepEqual(await service.operation({ scope: command.scope, operationId: receipt.operationId }), receipt);
for (const request of [service.context({ scope: command.scope, budgetTokens: 100 }), service.search({ scope: command.scope, budgetTokens: 100, query: 'x', limit: 1 }), service.inspect({ scope: command.scope, memoryId: 'missing' })]) await assert.rejects(request, (e: { code?: string }) => e.code === 'NOT_READY');
assert.deepEqual(await service.drain(1000), { completed: true, pending: 0 });
await service.close(); await service.close(); assert.equal(calls, 0);
assert.deepEqual(await opts.models.embed('still usable', new AbortController().signal), [1]);
`;
let compiled: Promise<Awaited<ReturnType<typeof packed>>> | undefined;
function compileConsumer() {
  return compiled ??= (async () => {
    const result = await packed(), { dir, env } = result;
    await writeFile(join(dir, 'consumer.mts'), consumer);
    execFileSync(node22(), ['node_modules/typescript/bin/tsc', '--strict', '--exactOptionalPropertyTypes', '--module', 'nodenext', '--target', 'es2022', '--skipLibCheck', 'consumer.mts'], { cwd: dir, env, stdio: 'pipe' });
    return result;
  })();
}
nativeTest(import.meta.url, 'packed-isolated-node22-consumer', async () => {
  const { dir, env } = await compileConsumer();
  // No force-exit: leaked handles fail this natural-exit deadline.
  execFileSync(node22(), ['consumer.mjs', join(dir, 'data')], { cwd: dir, env, timeout: 10_000, stdio: 'pipe' });
});
nativeTest(import.meta.url, 'packed-native-missing-import-versus-open', async () => {
  const { dir, env } = await packed();
  const native = join(dir, 'node_modules/fs-ext');
  await rename(native, native + '.unavailable');
  try {
    const unsafe = join(dir, 'unsafe-layout');
    await mkdir(unsafe, { mode: 0o700 }); await writeFile(join(unsafe, 'index.lance'), 'unrelated');
    await writeFile(join(dir, 'missing.mjs'), `import assert from 'node:assert/strict';\nconst before = process.eventNames().map(String).sort();\nconst { MemoryFactory } = await import('@insrc/project-memory');\nawait import('@insrc/project-memory/node');\nassert.deepEqual(process.eventNames().map(String).sort(), before);\nconst options = { dataDirectory: ${JSON.stringify(join(dir, 'missing-data'))}, models: { embeddingModel: 'x', embeddingDimension: 1, async complete() {}, async embed() {} }, policy: { async bind() {}, async admit() {} }, logger: { write() {} }, limits: { maxEventBytes: 1024, segmentBytes: 4096, maxPendingBytes: 8192, modelTimeoutMs: 1000 } };\nawait assert.rejects(MemoryFactory.open({ ...options, dataDirectory: ${JSON.stringify(join(dir, 'unsafe-layout'))} }), e => e.code === 'INVALID_REQUEST');\nawait assert.rejects(MemoryFactory.open(options), e => e.code === 'NOT_READY');\n`);
    execFileSync(node22(), ['missing.mjs'], { cwd: dir, env, timeout: 10_000, stdio: 'pipe' });
  } finally { await rename(native + '.unavailable', native); }
});
nativeTest(import.meta.url, 'tarball-public-dependency-and-asset-allowlist', async () => {
  const { dir, files } = await packed();
  for (const required of ['package.json', 'README.md', 'LICENSE', 'dist/index.js', 'dist/index.d.ts', 'dist/host-node.js']) assert.ok(files.includes(required), required);
  for (const file of files) assert.match(file, /^(?:package\.json|README\.md|LICENSE|dist\/(?:queue\/)?[\w-]+\.(?:js|d\.ts)(?:\.map)?)$/);
  for (const module of ['types', 'shape', 'codec', 'io', 'checkpoint', 'index-record', 'recovery', 'receipts', 'retirement', 'file-queue', 'admission']) {
    assert.ok(files.includes('dist/queue/' + module + '.js')); assert.ok(files.includes('dist/queue/' + module + '.d.ts'));
  }
  const manifest = JSON.parse(await readFile(join(dir, 'node_modules/@insrc/project-memory/package.json'), 'utf8'));
  assert.deepEqual(manifest.dependencies, { 'fs-ext': '2.1.1' });
  assert.deepEqual(Object.keys(manifest.exports), ['.', './node']);
});

nativeTest(import.meta.url, 'packed-external-submit-crash-reopen-and-operation', async () => {
  const { dir, env } = await compileConsumer();
  const data = join(dir, 'crash-data'); let observed = '';
  try { execFileSync(node22(), ['consumer.mjs', data, 'crash'], { cwd: dir, env, timeout: 10_000, encoding: 'utf8' }); assert.fail('consumer must be killed without closing'); }
  catch (error) {
    const failure = error as { signal?: string; stdout?: string };
    assert.equal(failure.signal, 'SIGKILL'); observed = String(failure.stdout).trim();
  }
  const receipt = JSON.parse(observed); assert.equal(receipt.state, 'accepted');
  execFileSync(node22(), ['consumer.mjs', data, 'reopen', JSON.stringify(receipt)], { cwd: dir, env, timeout: 10_000, stdio: 'pipe' });
});
