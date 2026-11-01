/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { readPinnedSources } from '../git-reader.js';
import type { BinaryGitRunner } from '../git-reader.js';
import { requiredSourcePaths } from '../eligibility.js';
import { sourceFixture } from './fixtures.js';
import { gitFixture } from './git-fixtures.js';


test('reader-safety bounds aggregate source and shared evidence bytes and counts', async () => {
  const f = gitFixture();
  try {
    const exact = await readPinnedSources(f.dir, f.request, { limits: { bytes: f.binary.length, files: 1 } }); assert.equal(exact.ok, true);
    const short = await readPinnedSources(f.dir, f.request, { limits: { bytes: f.binary.length - 1 } }); assert.equal(short.ok, false);
    assert.equal(!short.ok && short.issues[0]!.code, 'limit.exceeded');
    assert.equal((await readPinnedSources(f.dir, f.request, { limits: { metadataBytes: 1 } })).ok, false);
    assert.equal((await readPinnedSources(f.dir, f.request, { limits: { timeoutMs: 30001 } })).ok, false);
    let calls = 0; const run: BinaryGitRunner = async () => { calls++; throw new Error('No IO'); };
    assert.equal((await readPinnedSources(f.dir, { ...f.request, paths: ['binary.bin', 'lfs'] }, { run, limits: { files: 1 } })).ok, false);
    assert.equal(calls, 0);
    const policy = sourceFixture(); const required = requiredSourcePaths(policy.policy, policy.request); assert.equal(required.ok, true);
    if (required.ok) { assert.equal(required.value.filter(p => p === 'LICENSE').length, 1); assert.equal(required.value.length, 4); }
    assert.equal((await readPinnedSources(f.dir, { ...f.request, paths: Array.from({ length: 10001 }, (_, i) => `f${i}`) }, { run })).ok, false);
    assert.equal(calls, 0);
    const closure = sourceFixture();
    closure.policy.profiles[0]!.licenseEvidence = Array.from({ length: 10000 }, (_, i) => ({ path: `e${i}`, digest: 'a'.repeat(64) }));
    const overflow = requiredSourcePaths(closure.policy, { ...closure.request, paths: ['good.txt'] });
    assert.equal(!overflow.ok && overflow.issues[0]!.code, 'limit.exceeded');
  } finally { f.dispose(); }
});
test('reader-safety cancels timed-out aborted and failed reads without admitted bytes', async () => {
  const git = gitFixture();
  try {
    let internal: AbortSignal | undefined;
    const external = new AbortController();
    const stalled: BinaryGitRunner = async (_args, _input, options) => { internal = options.signal; return new Promise(() => {}); };
    const timed = await readPinnedSources(git.dir, git.request, { run: stalled, signal: external.signal, limits: { requestTimeoutMs: 10 } });
    assert.equal(timed.ok, false); assert.equal(!timed.ok && timed.issues[0]!.code, 'limit.exceeded');
    assert.equal(getEventListeners(external.signal, 'abort').length, 0);
    assert.ok(internal?.aborted); assert.equal(getEventListeners(internal!, 'abort').length, 0);
    const failed: BinaryGitRunner = async () => { throw new Error('private payload'); }; const result = await readPinnedSources(git.dir, git.request, { run: failed });
    assert.equal(result.ok, false); assert.equal('value' in result, false);
  } finally { git.dispose(); }
});
test('reader-safety rejects a truncated object without leaks', async () => {
  const f = gitFixture();
  try {
    const malformed: BinaryGitRunner = async () => Buffer.from(`${f.request.revision} commit 999\nshort\n`);
    const result = await readPinnedSources(f.dir, f.request, { run: malformed }); assert.equal(result.ok, false); assert.equal('value' in result, false);
  } finally { f.dispose(); }
});
