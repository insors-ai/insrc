/**
 * Story E20260923401ae5fb:S006 / t2 — the rotation-aware LogTail (sc9 Debug).
 * Driven over FAKE listSegments/readLines/watch — no real disk watcher.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createLogTail, type LogTailDeps } from '../log-tail.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A scriptable fs seam: segments + per-file lines are mutable; a manual watch trigger. */
function fakeDeps(init: {
  segments?: string[];
  files?: Record<string, string[]>;
  maxLines?: number;
  listThrows?: boolean;
  readThrows?: boolean;
  watchThrows?: boolean;
} = {}): {
  deps: LogTailDeps;
  set: (segments: string[], files: Record<string, string[]>) => void;
  fire: () => void;
  watching: () => boolean;
} {
  let segments = init.segments ?? [];
  let files = init.files ?? {};
  let onEvent: (() => void) | undefined;
  const deps: LogTailDeps = {
    logDir: '/tmp/logs',
    stem: 'daemon',
    listSegments: () => {
      if (init.listThrows) throw new Error('listSegments failed');
      return segments;
    },
    readLines: (file) => {
      if (init.readThrows) throw new Error('readLines failed');
      return files[file] ?? [];
    },
    watch: (_dir, cb) => {
      if (init.watchThrows) throw new Error('watch failed');
      onEvent = cb;
      return () => {
        onEvent = undefined;
      };
    },
    maxLines: init.maxLines ?? 500,
  };
  return {
    deps,
    set: (s, f) => {
      segments = s;
      files = f;
    },
    fire: () => onEvent?.(),
    watching: () => onEvent !== undefined,
  };
}

test('follow emits the maxLines-bounded initial tail then follows appended lines on a watch event', () => {
  const f = fakeDeps({
    segments: ['/tmp/logs/daemon.1.log'],
    files: { '/tmp/logs/daemon.1.log': ['a', 'b', 'c', 'd'] },
    maxLines: 2,
  });
  const batches: readonly string[][] = [];
  const acc: string[][] = [];
  const dispose = createLogTail(f.deps).follow((lines) => acc.push([...lines]));
  void batches;
  assert.deepEqual(acc[0], ['c', 'd'], 'initial tail is the last maxLines lines only');

  // Append two lines and fire the watcher.
  f.set(['/tmp/logs/daemon.1.log'], { '/tmp/logs/daemon.1.log': ['a', 'b', 'c', 'd', 'e', 'f'] });
  f.fire();
  assert.deepEqual(acc[1], ['e', 'f'], 'only the newly-appended lines are emitted');
  dispose();
});

test('a rotation (active segment roll) is tracked — appends emit from the new segment without drop/duplicate', () => {
  const f = fakeDeps({
    segments: ['/tmp/logs/daemon.1.log'],
    files: { '/tmp/logs/daemon.1.log': ['old1', 'old2'] },
    maxLines: 500,
  });
  const acc: string[][] = [];
  const dispose = createLogTail(f.deps).follow((lines) => acc.push([...lines]));
  assert.deepEqual(acc[0], ['old1', 'old2'], 'initial tail of the first segment');

  // A newer segment appears (rotation); its first lines must emit fresh (no dup of old).
  f.set(['/tmp/logs/daemon.1.log', '/tmp/logs/daemon.2.log'], {
    '/tmp/logs/daemon.1.log': ['old1', 'old2'],
    '/tmp/logs/daemon.2.log': ['new1', 'new2'],
  });
  f.fire();
  assert.deepEqual(acc[1], ['new1', 'new2'], 'the rotated segment emits its lines from the start');

  // A further append to the active segment emits only the delta.
  f.set(['/tmp/logs/daemon.1.log', '/tmp/logs/daemon.2.log'], {
    '/tmp/logs/daemon.1.log': ['old1', 'old2'],
    '/tmp/logs/daemon.2.log': ['new1', 'new2', 'new3'],
  });
  f.fire();
  assert.deepEqual(acc[2], ['new3'], 'only the delta of the active segment');
  dispose();
});

test('dispose() is idempotent and guarantees no onLines fires after dispose', () => {
  const f = fakeDeps({
    segments: ['/tmp/logs/daemon.1.log'],
    files: { '/tmp/logs/daemon.1.log': ['a'] },
  });
  const acc: string[][] = [];
  const dispose = createLogTail(f.deps).follow((lines) => acc.push([...lines]));
  const countAtDispose = acc.length;
  dispose();
  assert.equal(f.watching(), false, 'dispose removed the watcher');
  assert.doesNotThrow(() => dispose(), 'a second dispose is a no-op');

  // A late event after dispose must not emit.
  f.set(['/tmp/logs/daemon.1.log'], { '/tmp/logs/daemon.1.log': ['a', 'b'] });
  f.fire();
  assert.equal(acc.length, countAtDispose, 'no onLines fires after dispose');
});

test('a missing dir / readLines throw / watch throw is swallowed — follow never throws', () => {
  // listSegments throws → no active segment → an empty initial emit, no throw.
  const listBad = fakeDeps({ listThrows: true });
  const accA: string[][] = [];
  assert.doesNotThrow(() => createLogTail(listBad.deps).follow((l) => accA.push([...l])));
  assert.deepEqual(accA[0], [], 'a failed listSegments degrades to an empty initial emit');

  // readLines throws → the initial emit yields nothing, no throw.
  const readBad = fakeDeps({
    segments: ['/tmp/logs/daemon.1.log'],
    files: { '/tmp/logs/daemon.1.log': ['x'] },
    readThrows: true,
  });
  const accB: string[][] = [];
  assert.doesNotThrow(() => createLogTail(readBad.deps).follow((l) => accB.push([...l])));
  assert.equal(accB.length, 0, 'a failed readLines emits nothing (never throws)');

  // watch throws → the initial tail still delivered, follow returns a dispose.
  const watchBad = fakeDeps({
    segments: ['/tmp/logs/daemon.1.log'],
    files: { '/tmp/logs/daemon.1.log': ['x', 'y'] },
    watchThrows: true,
  });
  const accC: string[][] = [];
  let dispose: (() => void) | undefined;
  assert.doesNotThrow(() => {
    dispose = createLogTail(watchBad.deps).follow((l) => accC.push([...l]));
  });
  assert.deepEqual(accC[0], ['x', 'y'], 'the initial tail is still delivered when watch fails');
  assert.doesNotThrow(() => dispose?.(), 'the returned dispose still works');
});

test('source-scan: log-tail.ts imports no vscode, no cloud, and NOT the daemon-side src/cli/services/debug.ts (k5)', () => {
  const src = readFileSync(join(HERE, '..', 'log-tail.ts'), 'utf8');
  // Scan IMPORT statements only (a prose mention of the CLI parity in a comment is fine).
  const imports = [...src.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
  assert.ok(!imports.some((s) => s === 'vscode'), 'log-tail must not import vscode');
  assert.ok(!imports.some((s) => /cli\/services\/debug/.test(s)), 'log-tail must NOT import the daemon debug service (thin bundle)');
  assert.ok(!imports.some((s) => /undici|^https?:/.test(s)), 'log-tail imports no cloud/HTTP client');
});
