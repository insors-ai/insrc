/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the daemon self-update runner (Story S001 / sc1, plan t1 + t2).
 * Every side-effecting boundary is an injected seam, so nothing here spawns a
 * real process, restarts a real daemon, or touches ~/.insrc.
 *
 * Run: npx tsx --test src/daemon/__tests__/update-runner.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  launchUpdate,
  readUpdateOutcome,
  writeUpdateOutcome,
  runDetachedUpdate,
  type SpawnFn,
  type SpawnedChild,
} from '../update-runner.js';
import { PATHS } from '../../shared/paths.js';
import type { DaemonUpdateOutcome, DaemonUpdateResult } from '../../shared/types.js';

/** A temp daemon root containing scripts/daemon-ctl.sh so resolveDaemonCtl passes. */
function makeDaemonRoot(): { root: string; daemonCtl: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'insrc-daemon-root-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  const daemonCtl = join(root, 'scripts', 'daemon-ctl.sh');
  writeFileSync(daemonCtl, '#!/usr/bin/env bash\nexit 0\n');
  return { root, daemonCtl, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function tmpFile(name: string): string {
  return join(mkdtempSync(join(tmpdir(), 'insrc-upd-')), name);
}

/** A recording fake spawn that returns a stub child. */
function recordingSpawn(): { spawn: SpawnFn; calls: Array<{ command: string; args: readonly string[]; options: Record<string, unknown> }>; unrefs: number } {
  const calls: Array<{ command: string; args: readonly string[]; options: Record<string, unknown> }> = [];
  let unrefs = 0;
  const spawn: SpawnFn = (command, args, options) => {
    calls.push({ command, args, options });
    const child: SpawnedChild = { pid: 4321, unref: () => { unrefs++; } };
    return child;
  };
  return { spawn, calls, get unrefs() { return unrefs; } } as unknown as { spawn: SpawnFn; calls: Array<{ command: string; args: readonly string[]; options: Record<string, unknown> }>; unrefs: number };
}

// ---------------------------------------------------------------------------
// t1 — types + PATHS entries
// ---------------------------------------------------------------------------

test('t1: PATHS carries the two S001 daemon-home entries under the insrc dir', () => {
  assert.equal(typeof PATHS.updateOutcome, 'string');
  assert.equal(typeof PATHS.updateLock, 'string');
  assert.ok(PATHS.updateOutcome.startsWith(PATHS.insrc), 'updateOutcome lives under ~/.insrc');
  assert.ok(PATHS.updateLock.startsWith(PATHS.insrc), 'updateLock lives under ~/.insrc');
  assert.notEqual(PATHS.updateOutcome, PATHS.updateLock);
  // Type-level: the sc1 payload shapes are constructible.
  const r: DaemonUpdateResult = { launched: true, message: 'x' };
  const o: DaemonUpdateOutcome = { state: 'succeeded', finishedAt: new Date().toISOString() };
  assert.equal(r.launched, true);
  assert.equal(o.state, 'succeeded');
});

// ---------------------------------------------------------------------------
// t2 — launchUpdate
// ---------------------------------------------------------------------------

test('t2: launchUpdate spawns the detached daemon-ctl.sh restart child with detached/unref/stdio-to-log', () => {
  const { root, daemonCtl, cleanup } = makeDaemonRoot();
  const lockPath = tmpFile('lock.json');
  const rec = recordingSpawn();
  try {
    const result = launchUpdate({
      spawn: rec.spawn,
      daemonRoot: root,
      lockPath,
      openLog: () => 'ignore',
      now: () => 1000,
      isPidAlive: () => false,
    });
    assert.equal(result.launched, true);
    assert.equal(rec.calls.length, 1);
    const call = rec.calls[0]!;
    assert.equal(call.command, process.execPath);
    assert.ok(call.args.includes(daemonCtl), 'argv carries the resolved daemon-ctl.sh path');
    assert.ok(call.args.includes('restart'), "argv carries the 'restart' subcommand");
    assert.equal(call.options['detached'], true);
    assert.deepEqual(call.options['stdio'], ['ignore', 'ignore', 'ignore']);
    assert.equal(rec.unrefs, 1, 'the child is unref()d so it outlives the daemon');
    // The in-flight marker was written keyed on the child pid.
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8')) as { pid: number; startedAt: number };
    assert.equal(lock.pid, 4321);
    assert.equal(lock.startedAt, 1000);
  } finally {
    cleanup();
    rmSync(lockPath, { force: true });
  }
});

test('t2: launchUpdate rejects a concurrent launch when a live marker is present; a stale marker is ignored', () => {
  const { root, cleanup } = makeDaemonRoot();
  const lockPath = tmpFile('lock.json');
  try {
    // Live marker: pid alive + fresh.
    writeFileSync(lockPath, JSON.stringify({ pid: 777, startedAt: 5000 }));
    const liveSpawn = recordingSpawn();
    assert.throws(
      () => launchUpdate({ spawn: liveSpawn.spawn, daemonRoot: root, lockPath, openLog: () => 'ignore', now: () => 5000, isPidAlive: () => true }),
      /update already in progress/,
    );
    assert.equal(liveSpawn.calls.length, 0, 'no second helper is spawned');

    // Stale marker: pid dead → launch proceeds.
    const staleSpawn = recordingSpawn();
    const result = launchUpdate({ spawn: staleSpawn.spawn, daemonRoot: root, lockPath, openLog: () => 'ignore', now: () => 6000, isPidAlive: () => false });
    assert.equal(result.launched, true);
    assert.equal(staleSpawn.calls.length, 1, 'a stale marker does not block a fresh update');
  } finally {
    cleanup();
    rmSync(lockPath, { force: true });
  }
});

test('t2: launchUpdate throws cannot-locate BEFORE any spawn or marker write when the root/helper is missing', () => {
  const lockPath = tmpFile('lock.json');
  const rec = recordingSpawn();
  try {
    assert.throws(
      () => launchUpdate({ spawn: rec.spawn, daemonRoot: join(tmpdir(), 'nope-does-not-exist-xyz'), lockPath, openLog: () => 'ignore' }),
      /cannot locate daemon root \/ helper/,
    );
    assert.equal(rec.calls.length, 0, 'nothing is spawned');
    assert.equal(existsSync(lockPath), false, 'no marker is written');
  } finally {
    rmSync(lockPath, { force: true });
  }
});

// ---------------------------------------------------------------------------
// t2 — readUpdateOutcome / writeUpdateOutcome
// ---------------------------------------------------------------------------

test('t2: readUpdateOutcome parses a present record and returns null for absent / unparseable (never throws)', () => {
  const outcomePath = tmpFile('outcome.json');
  // absent
  assert.equal(readUpdateOutcome({ outcomePath }), null);
  // present
  const rec: DaemonUpdateOutcome = { state: 'failed', error: 'boom', finishedAt: '2026-09-24T00:00:00.000Z' };
  writeFileSync(outcomePath, JSON.stringify(rec));
  assert.deepEqual(readUpdateOutcome({ outcomePath }), rec);
  // unparseable
  writeFileSync(outcomePath, '{ not json');
  assert.equal(readUpdateOutcome({ outcomePath }), null);
  rmSync(outcomePath, { force: true });
});

test('t2: writeUpdateOutcome persists the record and clears the in-flight marker', () => {
  const outcomePath = tmpFile('outcome.json');
  const lockPath = tmpFile('lock.json');
  writeFileSync(lockPath, JSON.stringify({ pid: 1, startedAt: 0 }));
  const outcome: DaemonUpdateOutcome = { state: 'succeeded', finishedAt: '2026-09-24T00:00:00.000Z' };
  writeUpdateOutcome(outcome, { outcomePath, lockPath });
  assert.deepEqual(JSON.parse(readFileSync(outcomePath, 'utf-8')), outcome);
  assert.equal(existsSync(lockPath), false, 'the marker is cleared once the outcome is recorded');
  rmSync(outcomePath, { force: true });
});

// ---------------------------------------------------------------------------
// t2 — runDetachedUpdate outcome writer (zero vs non-zero exit)
// ---------------------------------------------------------------------------

/** Build a fake child that scripts a close code (+ optional stderr chunk). */
function fakeChild(code: number, stderr?: string): { spawn: SpawnFn; child: EventEmitter & { stderr: EventEmitter } } {
  const stderrEmitter = new EventEmitter();
  const child = Object.assign(new EventEmitter(), { stderr: stderrEmitter, pid: 99, unref: () => {} });
  const spawn: SpawnFn = () => {
    queueMicrotask(() => {
      if (stderr) stderrEmitter.emit('data', Buffer.from(stderr));
      child.emit('close', code);
    });
    return child as unknown as SpawnedChild;
  };
  return { spawn, child: child as EventEmitter & { stderr: EventEmitter } };
}

test('t2: runDetachedUpdate writes state:succeeded on a zero exit and clears the marker', async () => {
  const outcomePath = tmpFile('outcome.json');
  const lockPath = tmpFile('lock.json');
  writeFileSync(lockPath, JSON.stringify({ pid: 1, startedAt: 0 }));
  const { spawn } = fakeChild(0);
  const outcome = await runDetachedUpdate('/tmp/daemon-ctl.sh', { spawn, outcomePath, lockPath });
  assert.equal(outcome.state, 'succeeded');
  assert.equal(outcome.error, undefined);
  assert.equal((JSON.parse(readFileSync(outcomePath, 'utf-8')) as DaemonUpdateOutcome).state, 'succeeded');
  assert.equal(existsSync(lockPath), false);
  rmSync(outcomePath, { force: true });
});

test('t2: runDetachedUpdate writes state:failed with the raw stderr on a non-zero exit; no retry/rollback', async () => {
  const outcomePath = tmpFile('outcome.json');
  const lockPath = tmpFile('lock.json');
  writeFileSync(lockPath, JSON.stringify({ pid: 1, startedAt: 0 }));
  const { spawn } = fakeChild(4, 'fatal: merge conflict on package-lock.json');
  const outcome = await runDetachedUpdate('/tmp/daemon-ctl.sh', { spawn, outcomePath, lockPath });
  assert.equal(outcome.state, 'failed');
  assert.match(outcome.error ?? '', /merge conflict/);
  assert.equal(existsSync(lockPath), false, 'the marker is cleared even on failure');
  rmSync(outcomePath, { force: true });
});
