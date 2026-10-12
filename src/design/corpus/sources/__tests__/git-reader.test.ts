/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readPinnedSources, runGitBinary, gitEnvironment } from '../git-reader.js';
import type { BinaryGitRunner } from '../git-reader.js';
import { isLfsPointer } from '../eligibility.js';
import { gitFixture } from './git-fixtures.js';

test('pinned-reader preserves binary commit bytes despite worktree and branch changes', async () => {
  for (const format of ['sha1', 'sha256'] as const) {
    const f = gitFixture(format);
    try {
      writeFileSync(join(f.dir, 'binary.bin'), 'Changed branch'); f.git('add', '.'); f.git('commit', '-qm', 'Move branch');
      writeFileSync(join(f.dir, 'binary.bin'), 'Dirty worktree');
      const result = await readPinnedSources(f.dir, f.request); assert.equal(result.ok, true);
      if (result.ok) assert.deepEqual(result.value, [{ path: 'binary.bin', bytes: f.binary }]);
    } finally { f.dispose(); }
  }
});
test('pinned-reader rejects missing commits paths and corrupt object framing', async () => {
  const f = gitFixture();
  try {
    for (const request of [{ ...f.request, revision: 'f'.repeat(40) }, { ...f.request, paths: ['absent'] },
      { ...f.request, revision: f.git('rev-parse', 'HEAD:binary.bin') }]) assert.equal((await readPinnedSources(f.dir, request)).ok, false);
    for (const corrupt of [(b: Uint8Array) => b.subarray(0, b.length - 1), (b: Uint8Array) => { const copy = new Uint8Array(b); copy[copy.length - 2] = 0; return copy; }]) {
      const run: BinaryGitRunner = async (...args) => corrupt(await runGitBinary(...args));
      assert.equal((await readPinnedSources(f.dir, f.request, { run })).ok, false);
    }
  } finally { f.dispose(); }
});
test('reader-safety rejects selected unsafe paths before I/O and ignores unselected paths', async () => {
  const f = gitFixture(); let calls = 0;
  const run: BinaryGitRunner = async () => { calls++; throw new Error('Must not run'); };
  try {
    for (const paths of [['unsafe%file'], ['a:b'], ['../binary.bin'], ['binary.bin', 'BINARY.bin'], ['café', 'cafe\u0301']]) {
      assert.equal((await readPinnedSources(f.dir, { ...f.request, paths }, { run })).ok, false);
    }
    assert.equal(calls, 0); assert.equal((await readPinnedSources(f.dir, f.request)).ok, true);
  } finally { f.dispose(); }
});
test('reader-safety rejects symlinks and submodules and leaves LFS unresolved', async () => {
  const f = gitFixture();
  try {
    assert.equal((await readPinnedSources(f.dir, { ...f.request, paths: ['link'] })).ok, false);
    f.git('update-index', '--add', '--cacheinfo', `160000,${f.request.revision},submodule`); f.git('commit', '-qm', 'Submodule object only');
    assert.equal((await readPinnedSources(f.dir, { ...f.request, revision: f.git('rev-parse', 'HEAD'), paths: ['submodule'] })).ok, false);
    const lfs = await readPinnedSources(f.dir, { ...f.request, paths: ['lfs'] }); assert.equal(lfs.ok, true);
    if (lfs.ok) assert.equal(isLfsPointer(lfs.value[0]!.bytes), true);
  } finally { f.dispose(); }
});
test('reader-safety prevents replacement filters lazy fetch and config-driven commands', async () => {
  const f = gitFixture();
  try {
    const original = f.git('rev-parse', 'HEAD:binary.bin'); writeFileSync(join(f.dir, 'replacement'), 'Replacement');
    const replacement = f.git('hash-object', '-w', 'replacement'); f.git('replace', original, replacement);
    f.git('config', 'core.fsmonitor', 'touch SHOULD_NOT_RUN');
    f.git('config', 'filter.evil.smudge', 'touch SHOULD_NOT_RUN');
    writeFileSync(join(f.dir, '.gitattributes'), '*.bin filter=evil');
    const calls: string[][] = [];
    const run: BinaryGitRunner = async (args, bytes, opts) => { calls.push([...args]); return runGitBinary(args, bytes, opts); };
    const result = await readPinnedSources(f.dir, f.request, { run }); assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value[0]!.bytes, f.binary);
    assert.equal(existsSync(join(f.dir, 'SHOULD_NOT_RUN')), false);
    assert.ok(calls.every(args => args.join(' ') === 'cat-file --batch'));
    assert.equal(gitEnvironment()['GIT_NO_LAZY_FETCH'], '1');
    const previous = process.env['GIT_CONFIG_COUNT']; process.env['GIT_CONFIG_COUNT'] = '100';
    try { assert.equal(gitEnvironment()['GIT_CONFIG_COUNT'], undefined); assert.equal((await readPinnedSources(f.dir, f.request)).ok, true); }
    finally { if (previous === undefined) delete process.env['GIT_CONFIG_COUNT']; else process.env['GIT_CONFIG_COUNT'] = previous; }
    // A promised but absent object must never be fetched. The transport command leaves a marker if invoked.
    const missing = createHash('sha1').update('blob 0\0').digest('hex');
    f.git('config', 'extensions.partialClone', 'origin'); f.git('config', 'remote.origin.promisor', 'true');
    f.git('config', 'remote.origin.url', 'ext::touch SHOULD_NOT_RUN');
    assert.equal((await readPinnedSources(f.dir, { ...f.request, revision: missing })).ok, false);
    assert.equal(existsSync(join(f.dir, 'SHOULD_NOT_RUN')), false);
  } finally { f.dispose(); }
});
