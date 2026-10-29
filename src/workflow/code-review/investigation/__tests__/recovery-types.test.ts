/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recoveryId, recoveryDigest, recoveryInteger, recoveryValue, recoveryVersion, RecoveryError } from '../recovery-types.js';
import { recoveryDirectory } from './recovery-fixtures.js';
test('Recovery contract shapes, version and identity refusal', () => {
 for (const value of ['../escape', '', '/absolute', 'a.b', 'x'.repeat(129), null]) assert.throws(() => recoveryId(value), RecoveryError);
 recoveryId('run-1'); recoveryDigest('a'.repeat(64)); recoveryInteger(0); recoveryVersion(1);
 assert.throws(() => recoveryVersion(2), { code: 'unsupported' });
 assert.throws(() => recoveryDigest('abc')); assert.throws(() => recoveryInteger(NaN));
 assert.throws(() => recoveryValue({ get secret(){ throw Error('getter invoked'); } }), RecoveryError);
 const value = { a: [1] }; const copy = recoveryValue(value); value.a.push(2); assert.deepEqual(copy, { a: [1] }); assert.ok(Object.isFrozen(copy));
});
test('Bounded child-worker handshake kill and reopen feasibility', { timeout: 10000 }, async () => {
 const f = recoveryDirectory(), path = join(f.repo, 'boundary');
 const child = fork(new URL('./recovery-worker.ts', import.meta.url), [path], { execArgv: ['--import', 'tsx'], stdio: ['ignore','ignore','pipe','ipc'] });
 const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
 try {
  const [message] = await once(child, 'message', { signal: AbortSignal.timeout(6000) });
  assert.deepEqual(message, { boundary: 'synced' });
  const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
  assert.equal(readFileSync(path, 'utf8'), 'durable-handshake\n');
 } finally { clearTimeout(timer); child.kill('SIGKILL'); f.cleanup(); }
});
