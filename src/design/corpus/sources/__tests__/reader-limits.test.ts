/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import type { spawn } from 'node:child_process';
import { readPinnedSources, createGitRunner } from '../git-reader.js';
import type { BinaryGitRunner } from '../git-reader.js';
import { requiredSourcePaths } from '../eligibility.js';
import { sourceFixture } from './fixtures.js';
import { gitFixture } from './git-fixtures.js';

function processFixture(behavior: 'hang' | 'exit' | 'spawn' | 'stdout' | 'stderr' | 'stream') {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), killed: 0,
    kill() { this.killed++; queueMicrotask(() => this.emit('close', null)); return true; } });
  const spawnFake = (() => {
    child.stdin.once('finish', () => queueMicrotask(() => {
      if (behavior === 'stdout') child.stdout.write(Buffer.alloc(257));
      if (behavior === 'stderr') child.stderr.write(Buffer.alloc(257));
      if (behavior === 'stream') child.stdout.emit('error', new Error('private payload'));
      if (behavior === 'spawn') child.emit('error', new Error('private payload'));
      if (behavior === 'exit' || behavior === 'spawn') child.emit('close', 1);
    }));
    return child;
  }) as unknown as typeof spawn;
  return { child, run: createGitRunner(spawnFake) };
}
const options = { cwd: '/tmp', stdoutLimit: 256, stderrLimit: 256, timeoutMs: 10 };

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
  } finally { f.dispose(); }
});
test('reader-safety cancels timed-out aborted and failed children without admitted bytes', async () => {
  for (const behavior of ['hang', 'exit', 'spawn', 'stream'] as const) {
    const f = processFixture(behavior), abort = new AbortController();
    await assert.rejects(f.run(['cat-file', '--batch'], new Uint8Array(), { ...options, signal: abort.signal }), error => {
      assert.ok(error instanceof Error); assert.ok(!error.message.includes('private payload')); return true;
    });
    assert.equal(getEventListeners(abort.signal, 'abort').length, 0);
    if (behavior === 'hang' || behavior === 'stream') assert.ok(f.child.killed > 0);
  }
  const f = processFixture('hang'), abort = new AbortController();
  const pending = f.run(['cat-file', '--batch'], new Uint8Array(), { ...options, timeoutMs: 1000, signal: abort.signal });
  abort.abort(); await assert.rejects(pending, /cancelled/); assert.equal(f.child.killed, 1); assert.equal(getEventListeners(abort.signal, 'abort').length, 0);
  const git = gitFixture();
  try {
    const failed = processFixture('exit'); const result = await readPinnedSources(git.dir, git.request, { run: failed.run });
    assert.equal(result.ok, false); assert.equal('value' in result, false);
  } finally { git.dispose(); }
});
test('reader-safety rejects truncated or oversized stdout and stderr without leaks', async () => {
  for (const behavior of ['stdout', 'stderr'] as const) {
    const f = processFixture(behavior); const signal = new AbortController().signal;
    await assert.rejects(f.run(['cat-file', '--batch'], new Uint8Array(), { ...options, signal }), /exceeds? byte limit/);
    assert.equal(f.child.killed, 1); assert.equal(getEventListeners(signal, 'abort').length, 0);
  }
  const f = gitFixture();
  try {
    const malformed: BinaryGitRunner = async () => Buffer.from(`${f.request.revision} commit 999\nshort\n`);
    const result = await readPinnedSources(f.dir, f.request, { run: malformed }); assert.equal(result.ok, false); assert.equal('value' in result, false);
  } finally { f.dispose(); }
});
