/**
 * File-based checkpoint persistence for agent runs.
 *
 * All state lives under ~/.insrc/agents/<runId>/ as plain JSON files.
 * No daemon dependency — agents work even if daemon is down.
 *
 * Crash safety: all writes use atomic temp-file + rename.
 */

import {
  mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync,
  existsSync, rmSync, readdirSync, openSync, writeSync, closeSync,
  constants,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { PATHS } from '../../shared/paths.js';
import type { Checkpoint, RunMeta, RunIndexEntry } from './types.js';

// ---------------------------------------------------------------------------
// Atomic write
// ---------------------------------------------------------------------------

/** Write data to path atomically: write to tmp, then rename. */
export function atomicWriteSync(path: string, data: string): void {
  const tmp = path + '.tmp';
  writeFileSync(tmp, data, 'utf-8');
  renameSync(tmp, path);
}

/** Clean orphaned .tmp files in a directory (from prior crashes). */
export function cleanOrphanedTmp(dir: string): void {
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.endsWith('.tmp')) {
        try { unlinkSync(join(dir, entry)); } catch { /* ok */ }
      }
    }
  } catch { /* dir may not exist */ }
}

// ---------------------------------------------------------------------------
// Run directory management
// ---------------------------------------------------------------------------

/** Resolve the run directory path for a given runId. */
export function resolveRunDir(runId: string): string {
  return join(PATHS.agents, runId);
}

/** Create a new run directory with artifacts/ subdirectory. Returns the path. */
export function createRunDir(runId: string): string {
  const runDir = resolveRunDir(runId);
  mkdirSync(join(runDir, 'artifacts'), { recursive: true });
  return runDir;
}

// ---------------------------------------------------------------------------
// Checkpoint persistence
// ---------------------------------------------------------------------------

export function writeCheckpoint(runDir: string, checkpoint: Checkpoint): void {
  atomicWriteSync(join(runDir, 'state.json'), JSON.stringify(checkpoint, null, 2));
}

export function readCheckpoint(runDir: string): Checkpoint | null {
  const path = join(runDir, 'state.json');
  cleanOrphanedTmp(runDir);
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Heartbeat (separate file to avoid write races with state.json)
// ---------------------------------------------------------------------------

export function writeHeartbeat(runDir: string): void {
  atomicWriteSync(join(runDir, 'heartbeat.json'), JSON.stringify({ ts: new Date().toISOString() }));
}

export function readHeartbeat(runDir: string): string | null {
  try {
    const raw = readFileSync(join(runDir, 'heartbeat.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { ts: string };
    return parsed.ts;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Run metadata
// ---------------------------------------------------------------------------

export function writeMeta(runDir: string, meta: RunMeta): void {
  atomicWriteSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2));
}

export function readMeta(runDir: string): RunMeta | null {
  try {
    const raw = readFileSync(join(runDir, 'meta.json'), 'utf-8');
    return JSON.parse(raw) as RunMeta;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Event log (append-only JSONL)
// ---------------------------------------------------------------------------

export function appendEvent(runDir: string, event: Record<string, unknown>): void {
  const path = join(runDir, 'events.jsonl');
  const line = JSON.stringify({ ...event, ts: new Date().toISOString() }) + '\n';
  try {
    writeFileSync(path, line, { flag: 'a' });
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export function writeArtifact(runDir: string, name: string, content: string): string {
  const path = join(runDir, 'artifacts', name);
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteSync(path, content);
  return path;
}

export function readArtifact(runDir: string, name: string): string | null {
  try {
    return readFileSync(join(runDir, 'artifacts', name), 'utf-8');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Run index (~/.insrc/agents/index.json)
// ---------------------------------------------------------------------------

export function readIndex(): RunIndexEntry[] {
  try {
    const raw = readFileSync(PATHS.agentIndex, 'utf-8');
    return JSON.parse(raw) as RunIndexEntry[];
  } catch {
    return [];
  }
}

export function updateIndex(entry: RunIndexEntry): void {
  mkdirSync(PATHS.agents, { recursive: true });
  const entries = readIndex();
  const idx = entries.findIndex(e => e.runId === entry.runId);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  atomicWriteSync(PATHS.agentIndex, JSON.stringify(entries, null, 2));
}

export function removeFromIndex(runId: string): void {
  const entries = readIndex().filter(e => e.runId !== runId);
  mkdirSync(PATHS.agents, { recursive: true });
  atomicWriteSync(PATHS.agentIndex, JSON.stringify(entries, null, 2));
}

// ---------------------------------------------------------------------------
// Run lock (O_CREAT | O_EXCL for atomicity)
// ---------------------------------------------------------------------------

interface LockData {
  pid: number;
  acquiredAt: string;
}

export function acquireLock(runDir: string): boolean {
  const lockPath = join(runDir, 'lock');
  try {
    const fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
    const data: LockData = { pid: process.pid, acquiredAt: new Date().toISOString() };
    writeSync(fd, JSON.stringify(data));
    closeSync(fd);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') {
      // Lock exists — check if owner is still alive
      try {
        const raw = readFileSync(lockPath, 'utf-8');
        const lock = JSON.parse(raw) as LockData;
        try {
          process.kill(lock.pid, 0); // probe only — no signal sent
          return false; // genuinely locked by another live process
        } catch {
          // Owner is dead — stale lock. Break it and retry once.
          try { unlinkSync(lockPath); } catch { /* ok */ }
          return acquireLock(runDir);
        }
      } catch {
        // Can't read lock file — try to break it
        try { unlinkSync(lockPath); } catch { /* ok */ }
        return acquireLock(runDir);
      }
    }
    throw err;
  }
}

export function releaseLock(runDir: string): void {
  try { unlinkSync(join(runDir, 'lock')); } catch { /* ok */ }
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

/** Delete a run directory and remove it from the index. */
export function deleteRun(runId: string): void {
  const runDir = resolveRunDir(runId);
  try {
    rmSync(runDir, { recursive: true, force: true });
  } catch { /* ok if already gone */ }
  removeFromIndex(runId);
}

/** Prune completed runs older than maxAgeDays. Returns count of pruned runs. */
export function pruneCompleted(maxAgeDays: number): number {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const entries = readIndex();
  let pruned = 0;
  for (const entry of entries) {
    if (entry.status === 'completed' && new Date(entry.updatedAt).getTime() < cutoff) {
      deleteRun(entry.runId);
      pruned++;
    }
  }
  return pruned;
}

// ---------------------------------------------------------------------------
// Crash detection
// ---------------------------------------------------------------------------

/** Check all 'running' entries and reclassify dead/stuck ones as 'crashed'. */
export function detectCrashes(): RunIndexEntry[] {
  const entries = readIndex();
  const crashed: RunIndexEntry[] = [];
  const STALE_THRESHOLD_MS = 120_000; // 2 minutes

  for (const entry of entries) {
    if (entry.status !== 'running') continue;

    const runDir = resolveRunDir(entry.runId);
    const checkpoint = readCheckpoint(runDir);
    if (!checkpoint) continue;

    let isDead = false;

    // Check PID liveness
    try {
      process.kill(checkpoint.pid, 0);
      // Process alive — check heartbeat staleness
      const hb = readHeartbeat(runDir);
      if (hb && (Date.now() - new Date(hb).getTime()) > STALE_THRESHOLD_MS) {
        isDead = true;
      }
    } catch {
      // ESRCH — process is dead
      isDead = true;
    }

    if (isDead) {
      checkpoint.status = 'crashed';
      writeCheckpoint(runDir, checkpoint);
      entry.status = 'crashed';
      updateIndex(entry);
      crashed.push(entry);
    }
  }

  return crashed;
}
