import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, stat, symlink, link } from 'node:fs/promises';
import { fork } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MemoryFactory } from '../index.js';
import type { MemoryFactory as FactoryContract, MemoryService } from '../types.js';
import { MemoryError } from '../errors.js';
import { options } from './fixtures/options.js';
import { nativeTest } from './fixtures/node22.js';

type Message = { event: string; code?: string | undefined };
function watch(peer: EventEmitter, send: (message: string) => void) {
  const inbox: Message[] = [];
  const waiters: { kinds: string[]; resolve: (message: Message) => void }[] = [];
  peer.on('message', (message: Message) => {
    const index = waiters.findIndex(waiter => waiter.kinds.includes(message.event));
    if (index < 0) inbox.push(message); else waiters.splice(index, 1)[0]!.resolve(message);
  });
  return { send, next(...kinds: string[]): Promise<Message> {
    const index = inbox.findIndex(message => kinds.includes(message.event));
    if (index >= 0) return Promise.resolve(inbox.splice(index, 1)[0]!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { const i = waiters.indexOf(waiter); if (i >= 0) waiters.splice(i, 1); reject(Error('peer message deadline exceeded')); }, 10_000);
      const waiter = { kinds, resolve(message: Message) { clearTimeout(timer); resolve(message); } }; waiters.push(waiter);
    });
  } };
}
const sourceEntry = new URL('../../dist/index.js', import.meta.url).href;
const helper = new URL('./fixtures/owner-peer.mjs', import.meta.url);

nativeTest(import.meta.url, 'same-process-package-copy-thread-process-contention', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-contend-'));
  const workers: Worker[] = []; const services: MemoryService[] = [];
  try {
    const root = join(dir, 'same');
    const first = MemoryFactory.open(options(root)).then(value => ({ value }), error => ({ error }));
    const second = MemoryFactory.open(options(root)).then(value => ({ value }), error => ({ error }));
    const results = [await first, await second];
    const winners = results.filter((r): r is { value: MemoryService } => 'value' in r);
    assert.equal(winners.length, 1); services.push(winners[0]!.value);

    const copy = join(dir, 'copy');
    await cp(fileURLToPath(new URL('../../dist', import.meta.url)), join(copy, 'dist'), { recursive: true });
    await cp(fileURLToPath(new URL('../../package.json', import.meta.url)), join(copy, 'package.json'));
    await symlink(dirname(dirname(createRequire(import.meta.url).resolve('fs-ext/package.json'))), join(copy, 'node_modules'), 'dir');
    const independent = (await import(pathToFileURL(join(copy, 'dist/index.js')).href)).MemoryFactory as FactoryContract;
    assert.notEqual(independent, MemoryFactory);
    await assert.rejects(independent.open(options(root)), (e: unknown) => e instanceof Error && 'code' in e && e.code === 'OWNERSHIP_CONFLICT');
    const isolated = await independent.open(options(join(dir, 'independent'))); services.push(isolated);

    const threadRoot = join(dir, 'threads');
    const peers = [];
    for (let i = 0; i < 2; i++) {
      const worker = new Worker(helper, { workerData: { path: threadRoot, entry: sourceEntry }, execArgv: [], trackUnmanagedFds: true });
      workers.push(worker); const peer = watch(worker, message => worker.postMessage(message)); peers.push(peer); await peer.next('booted');
    }
    for (const peer of peers) peer.send('open');
    const a = await peers[0]!.next('ready', 'refused'); const b = await peers[1]!.next('ready', 'refused');
    assert.equal([a,b].filter(m => m.event === 'ready').length, 1);
    const winner = a.event === 'ready' ? 0 : 1; const loser = winner === 0 ? 1 : 0;
    peers[winner]!.send('close'); await peers[winner]!.next('released');
    peers[loser]!.send('open'); assert.equal((await peers[loser]!.next('ready', 'refused')).event, 'ready');
    await workers[loser]!.terminate(); // A terminated thread cannot leave a live writer.
    const recovered = await MemoryFactory.open(options(threadRoot)); services.push(recovered);
  } finally {
    for (const worker of workers) await worker.terminate();
    for (const service of services) await service.close();
    await rm(dir, { recursive: true, force: true });
  }
});

nativeTest(import.meta.url, 'killed-owner-release-stopped-owner-exclusion-and-aliases', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'memory-process-'));
  const root = join(dir, 'data');
  const env = { ...process.env }; delete env['NODE_TEST_CONTEXT'];
  const child = fork(fileURLToPath(helper), [root, sourceEntry], { execArgv: [], env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  const peer = watch(child, message => child.send(message));
  try {
    await peer.next('booted'); peer.send('open'); assert.equal((await peer.next('ready', 'refused')).event, 'ready');
    await symlink(root, join(dir, 'alias'));
    const inode = (await stat(join(root, '.owner.lock'))).ino;
    process.kill(child.pid!, 'SIGSTOP');
    await assert.rejects(MemoryFactory.open(options(join(dir, 'alias'))), (error: unknown) => error instanceof MemoryError && error.code === 'OWNERSHIP_CONFLICT');
    child.kill('SIGKILL'); await exited;
    const recovered = await MemoryFactory.open(options(root));
    assert.equal((await stat(join(root, '.owner.lock'))).ino, inode);
    await recovered.close();
    await link(join(root, '.owner.lock'), join(dir, 'hardlink'));
    await assert.rejects(MemoryFactory.open(options(root)), MemoryError);
    assert.ok((await readFile(join(root, 'layout.json'), 'utf8')).includes('insrc-project-memory'));
  } finally { child.kill('SIGKILL'); await exited; await rm(dir, { recursive: true, force: true }); }
});
