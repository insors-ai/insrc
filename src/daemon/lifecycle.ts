import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import { ensureEmbeddingModel, isOllamaAvailable } from '../indexer/embedder.js';

// ---------------------------------------------------------------------------
// PID file management
// ---------------------------------------------------------------------------

/** Write the current process PID to daemon.pid. */
export function writePid(): void {
  mkdirSync(PATHS.insrc, { recursive: true });
  writeFileSync(PATHS.pidFile, String(process.pid), 'utf8');
}

/** Remove daemon.pid and daemon.sock (best-effort). */
export function clearPid(): void {
  try { rmSync(PATHS.pidFile); } catch { /* ignore */ }
  try { rmSync(PATHS.sockFile); } catch { /* ignore */ }
}

/**
 * Return true if a daemon is already running.
 * If daemon.pid exists but the process is dead, cleans up the stale files
 * and returns false so startup can proceed normally.
 */
export function isAlreadyRunning(): boolean {
  if (!existsSync(PATHS.pidFile)) return false;

  let pid: number;
  try {
    pid = parseInt(readFileSync(PATHS.pidFile, 'utf8').trim(), 10);
    if (isNaN(pid)) { clearPid(); return false; }
  } catch {
    clearPid();
    return false;
  }

  try {
    process.kill(pid, 0); // signal 0: probe only, no actual signal
    return true;           // process is alive
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') {
      // No such process — stale PID
      clearPid();
      return false;
    }
    if (code === 'EPERM') {
      // Process exists, we just don't have permission to signal it
      return true;
    }
    clearPid();
    return false;
  }
}

// ---------------------------------------------------------------------------
// Embedding model bootstrap
// ---------------------------------------------------------------------------

export interface ModelBootstrapState {
  status: 'checking' | 'pulling' | 'ready' | 'unavailable';
  pct?:   number;
}

let modelState: ModelBootstrapState = { status: 'checking' };

export function getModelState(): ModelBootstrapState { return modelState; }

/**
 * Check Ollama availability and pull the embedding model if missing.
 * Non-blocking — sets modelState for callers to inspect via getModelState().
 * If Ollama is not reachable, logs a warning and sets status = 'unavailable'.
 */
export async function bootstrapEmbeddingModel(): Promise<void> {
  const available = await isOllamaAvailable();
  if (!available) {
    modelState = { status: 'unavailable' };
    console.warn('[daemon] Ollama not reachable — embeddings will be disabled until available');
    return;
  }

  try {
    modelState = { status: 'pulling', pct: 0 };
    await ensureEmbeddingModel(pct => {
      modelState = { status: 'pulling', pct };
    });
    modelState = { status: 'ready' };
    console.log('[daemon] embedding model ready');
  } catch (err) {
    console.error('[daemon] failed to bootstrap embedding model:', err);
    modelState = { status: 'unavailable' };
  }
}
