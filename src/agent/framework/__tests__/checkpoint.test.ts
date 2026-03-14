/**
 * Tests for checkpoint persistence, run lifecycle, locking, and crash detection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync, rmSync, existsSync, readFileSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import {
  atomicWriteSync,
  cleanOrphanedTmp,
  writeCheckpoint,
  readCheckpoint,
  writeHeartbeat,
  readHeartbeat,
  writeMeta,
  readMeta,
  appendEvent,
  writeArtifact,
  readArtifact,
  acquireLock,
  releaseLock,
} from '../checkpoint.js';

import type { Checkpoint, RunMeta } from '../types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  const dir = join(tmpdir(), `insrc-test-${randomUUID()}`);
  mkdirSync(join(dir, 'artifacts'), { recursive: true });
  return dir;
}

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    runId: 'run-1',
    agentId: 'designer',
    version: 1,
    stepName: 'init',
    stepIndex: 0,
    state: { foo: 'bar' },
    status: 'running',
    pid: process.pid,
    heartbeat: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    completedSteps: [],
    ...overrides,
  };
}

function makeMeta(): RunMeta {
  return {
    agentId: 'designer',
    version: 1,
    repo: '/tmp/repo',
    createdAt: new Date().toISOString(),
    inputHash: 'abc123',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('atomicWriteSync', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes file content', () => {
    const path = join(dir, 'test.json');
    atomicWriteSync(path, '{"ok":true}');
    expect(readFileSync(path, 'utf-8')).toBe('{"ok":true}');
  });

  it('removes .tmp file after write', () => {
    const path = join(dir, 'test.json');
    atomicWriteSync(path, 'data');
    expect(existsSync(path + '.tmp')).toBe(false);
  });
});

describe('cleanOrphanedTmp', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('removes .tmp files', () => {
    writeFileSync(join(dir, 'state.json.tmp'), 'orphan');
    writeFileSync(join(dir, 'other.tmp'), 'orphan2');
    writeFileSync(join(dir, 'keep.json'), 'real');
    cleanOrphanedTmp(dir);
    expect(existsSync(join(dir, 'state.json.tmp'))).toBe(false);
    expect(existsSync(join(dir, 'other.tmp'))).toBe(false);
    expect(existsSync(join(dir, 'keep.json'))).toBe(true);
  });

  it('handles non-existent directory gracefully', () => {
    expect(() => cleanOrphanedTmp('/tmp/does-not-exist-xyz')).not.toThrow();
  });
});

describe('checkpoint read/write', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('round-trips a checkpoint', () => {
    const cp = makeCheckpoint();
    writeCheckpoint(dir, cp);
    const loaded = readCheckpoint(dir);
    expect(loaded).toEqual(cp);
  });

  it('returns null for missing checkpoint', () => {
    expect(readCheckpoint(dir)).toBeNull();
  });

  it('preserves state data', () => {
    const cp = makeCheckpoint({ state: { items: [1, 2, 3], nested: { a: true } } });
    writeCheckpoint(dir, cp);
    const loaded = readCheckpoint(dir);
    expect(loaded?.state).toEqual({ items: [1, 2, 3], nested: { a: true } });
  });
});

describe('heartbeat', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes and reads heartbeat timestamp', () => {
    writeHeartbeat(dir);
    const ts = readHeartbeat(dir);
    expect(ts).toBeTruthy();
    // Should be a valid ISO string within the last few seconds
    const delta = Date.now() - new Date(ts!).getTime();
    expect(delta).toBeLessThan(5000);
  });

  it('returns null for missing heartbeat', () => {
    expect(readHeartbeat(dir)).toBeNull();
  });
});

describe('run metadata', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('round-trips metadata', () => {
    const meta = makeMeta();
    writeMeta(dir, meta);
    expect(readMeta(dir)).toEqual(meta);
  });

  it('returns null for missing metadata', () => {
    expect(readMeta(dir)).toBeNull();
  });
});

describe('event log', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('appends events as JSONL', () => {
    appendEvent(dir, { kind: 'step_start', step: 'init' });
    appendEvent(dir, { kind: 'step_end', step: 'init' });
    const lines = readFileSync(join(dir, 'events.jsonl'), 'utf-8')
      .trim().split('\n');
    expect(lines).toHaveLength(2);
    const first = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(first['kind']).toBe('step_start');
    expect(first['ts']).toBeTruthy();
  });
});

describe('artifacts', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('writes and reads an artifact', () => {
    const path = writeArtifact(dir, 'design.md', '# Design');
    expect(path).toContain('artifacts');
    expect(readArtifact(dir, 'design.md')).toBe('# Design');
  });

  it('supports nested artifact paths', () => {
    writeArtifact(dir, 'sub/nested.txt', 'hello');
    expect(readArtifact(dir, 'sub/nested.txt')).toBe('hello');
  });

  it('returns null for missing artifact', () => {
    expect(readArtifact(dir, 'nope.txt')).toBeNull();
  });
});

describe('run lock', () => {
  let dir: string;

  beforeEach(() => { dir = makeTmpDir(); });
  afterEach(() => {
    releaseLock(dir);
    rmSync(dir, { recursive: true, force: true });
  });

  it('acquires lock on first attempt', () => {
    expect(acquireLock(dir)).toBe(true);
  });

  it('fails to acquire when already held by this process', () => {
    acquireLock(dir);
    // Same PID is alive, so second acquire should fail
    expect(acquireLock(dir)).toBe(false);
  });

  it('can re-acquire after release', () => {
    acquireLock(dir);
    releaseLock(dir);
    expect(acquireLock(dir)).toBe(true);
  });

  it('breaks stale lock from dead PID', () => {
    // Write a lock file with a PID that doesn't exist
    const lockPath = join(dir, 'lock');
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, acquiredAt: new Date().toISOString() }));
    // Should break the stale lock and succeed
    expect(acquireLock(dir)).toBe(true);
  });
});
