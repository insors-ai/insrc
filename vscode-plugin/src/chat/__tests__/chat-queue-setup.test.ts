// Epic E20261014613abdb3 Story S001 t6 — setting up the repository's chat queue in the extension.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createQueueFactory, processAliveCheck, queuePathOf, QUEUE_UNSUPPORTED_NOTICE, repoKeyOf, WINDOW_KEY_STATE, windowKeyOf,
} from '../chat-queue-setup.js';
import type { SqliteDatabase } from '../chat-queue-store.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = (...p: string[]): string => readFileSync(join(here, ...p), 'utf8');
const code = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('extension wiring: the repo key hashes the real path of the git top-level of the chat folder, the window key is kept in workspaceState, the store opens under ~/.insrc/chat-queue, engines.vscode is ^1.141.0 and engines.node >=22.13, isAlive combines the pid and start-time checks, and when node:sqlite cannot load the chat keeps the direct path and shows the notice once', () => {
  // THE REPO KEY: two folders of one working tree (its root and a subfolder) share it; the real path counts.
  const tops: Record<string, string> = { '/w/repo': '/w/repo\n', '/w/repo/vscode-plugin': '/w/repo\n', '/w/link/sub': '/w/link\n' };
  const real: Record<string, string> = { '/w/repo': '/w/repo', '/w/link': '/w/repo' };
  const deps = { gitTopLevel: (cwd: string) => tops[cwd], realpath: (p: string) => real[p] ?? p };
  const sha = (p: string): string => createHash('sha256').update(p).digest('hex').slice(0, 16);
  assert.equal(repoKeyOf('/w/repo', deps), sha('/w/repo'));
  assert.equal(repoKeyOf('/w/repo/vscode-plugin', deps), repoKeyOf('/w/repo', deps), 'a subfolder shares the queue');
  assert.equal(repoKeyOf('/w/link/sub', deps), repoKeyOf('/w/repo', deps), 'through a symlink too (real path)');
  assert.match(repoKeyOf('/w/repo', deps), /^[0-9a-f]{16}$/);
  // Outside git (git fails or answers nothing): the folder itself.
  assert.equal(repoKeyOf('/w/plain', { gitTopLevel: () => { throw new Error('not a git repository'); }, realpath: (p) => p }), sha('/w/plain'));
  assert.equal(repoKeyOf('/w/plain', { gitTopLevel: () => undefined, realpath: () => { throw new Error('ENOENT'); } }), sha('/w/plain'));

  // THE WINDOW KEY: created once, kept in the workspace's state, the same after a reload.
  const state = new Map<string, string>();
  const ws = { get: (k: string) => state.get(k), update: (k: string, v: string) => void state.set(k, v) };
  let n = 0;
  const first = windowKeyOf(ws, () => `id-${++n}`);
  assert.equal(first, 'id-1');
  assert.equal(state.get(WINDOW_KEY_STATE), 'id-1');
  assert.equal(windowKeyOf(ws, () => `id-${++n}`), 'id-1', 'a reload reads the same key');

  // THE STORE PATH.
  assert.equal(queuePathOf('/home/u/.insrc', 'abcd'), '/home/u/.insrc/chat-queue/abcd.sqlite');

  // isAlive: the pid alive, and when a start time is given, the same process.
  const alive = processAliveCheck((pid) => pid === 7 || pid === 8, (pid) => (pid === 7 ? 100 : 200));
  assert.equal(alive(7), true);
  assert.equal(alive(7, 100), true);
  assert.equal(alive(7, 101), false, 'a reused pid is not the same process');
  assert.equal(alive(9), false);

  // THE FACTORY: a working runtime gives a worker factory; one without node:sqlite gives none and one notice.
  const dir = mkdtempSync(join(tmpdir(), 'insrc-queue-setup-'));
  try {
    const notices: string[] = [];
    const base = { now: () => Date.now(), pluginVersion: 't', claim: { windowKey: 'w', pid: process.pid }, isAlive: () => false, log: { warn: () => {}, error: () => {} }, notify: (m: string) => void notices.push(m) };
    const ok = createQueueFactory({ ...base, path: queuePathOf(dir, 'k1'), openDatabase: (p) => new DatabaseSync(p) as unknown as SqliteDatabase });
    assert.equal(typeof ok, 'function');
    const worker = ok!({ run: async () => ({ kind: 'done' }) });
    worker.dispose();
    assert.deepEqual(notices, []);
    const none = createQueueFactory({ ...base, path: queuePathOf(dir, 'k2'), openDatabase: () => { throw new Error("Cannot find module 'node:sqlite'"); } });
    assert.equal(none, undefined, 'the chat keeps its direct path');
    assert.deepEqual(notices, [QUEUE_UNSUPPORTED_NOTICE], 'said once, plainly');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // THE WIRING in extension.ts, and the engines.
  const ext = code(read('..', '..', 'extension.ts'));
  assert.match(ext, /const chatQueue = createQueueFactory\(\{/);
  assert.match(ext, /path: queuePathOf\(PATHS\.insrc, repoKeyOf\(chatCwd\(\), \{/, 'under ~/.insrc/chat-queue, keyed by the chat folder');
  assert.match(ext, /gitTopLevel: \(cwd\) => execFileSync\('git', \['-C', cwd, 'rev-parse', '--show-toplevel'\]/);
  assert.match(ext, /createRequire\(import\.meta\.url\)\('node:sqlite'\)/, 'node:sqlite is loaded lazily, inside openDatabase');
  assert.doesNotMatch(ext, /from 'node:sqlite'/, 'never imported at the top (that would fail the whole extension)');
  assert.match(ext, /windowKey: windowKeyOf\(\s*\{ get: \(k\) => context\.workspaceState\.get<string>\(k\), update: \(k, v\) => context\.workspaceState\.update\(k, v\) \}/);
  assert.match(ext, /isAlive: processAliveCheck\(defaultIsAlive, defaultProcessStartTime\),/);
  assert.match(ext, /notify: \(message\) => void vscode\.window\.showWarningMessage\(message\),/);
  assert.match(ext, /\.\.\.\(chatQueue !== undefined \? \{ queue: chatQueue \} : \{\}\),/, 'no queue: the direct path');
  const pkg = JSON.parse(read('..', '..', '..', 'package.json')) as { engines: Record<string, string> };
  assert.deepEqual(pkg.engines, { vscode: '^1.141.0', node: '>=22.13' });
});
