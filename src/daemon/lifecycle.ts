import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { PATHS } from '../shared/paths.js';
import {
  EMBEDDING_DIM,
  ensureEmbeddingModel,
  isConfiguredEmbeddingModelInstalled,
  isOllamaAvailable,
  isOnnxEmbedderAvailable,
  ONNX_EMBEDDING_DIM,
  ONNX_EMBEDDING_MODEL,
  setActiveEmbedderBackend,
} from '../indexer/embedder.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('daemon');

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
  /** `ready` covers both Ollama-ready and ONNX-ready (see `backend`).
   *  `disabled` fires when the ONNX fallback was picked but the config's
   *  `embeddingDim` doesn't match ONNX_EMBEDDING_DIM — in that case the
   *  daemon boots + serves deterministic queries, but every embed call
   *  returns [] and every Lance vector op silently no-ops. */
  status:  'checking' | 'pulling' | 'ready' | 'unavailable' | 'disabled';
  backend: 'ollama' | 'onnx' | 'unknown' | 'disabled';
  /** Ollama pull progress percentage. Only set while status='pulling'. */
  pct?:    number;
  /** Human-readable reason set on `disabled` to help the user act. */
  reason?: string;
}

let modelState: ModelBootstrapState = { status: 'checking', backend: 'unknown' };

export function getModelState(): ModelBootstrapState { return modelState; }

/**
 * Pick the embedding backend and prepare it.
 *
 * Decision tree:
 *   1. Ollama reachable AND configured embedding model installed → use
 *      Ollama.
 *   2. Ollama reachable, model NOT installed → pull the model, then use
 *      Ollama. (Same behaviour as v0.)
 *   3. Ollama NOT reachable → fall back to the in-process ONNX embedder
 *      (nomic-embed-text-v1.5, 768-dim). If the config's embeddingDim
 *      is anything other than 768 we can't safely write to the existing
 *      Lance schema, so we set backend='disabled' and log a clear
 *      recovery path.
 *
 * Non-blocking (called with `void` at boot). Sets `modelState` and the
 * embedder module's active backend so subsequent embed calls dispatch
 * correctly.
 */
export async function bootstrapEmbeddingModel(): Promise<void> {
  const ollamaUp = await isOllamaAvailable();

  if (ollamaUp) {
    const installed = await isConfiguredEmbeddingModelInstalled();
    if (installed) {
      setActiveEmbedderBackend('ollama');
      modelState = { status: 'ready', backend: 'ollama' };
      log.info('embedder backend: ollama (model already installed)');
      return;
    }
    // Ollama reachable but the model isn't installed → try to pull.
    try {
      modelState = { status: 'pulling', backend: 'ollama', pct: 0 };
      await ensureEmbeddingModel(pct => {
        modelState = { status: 'pulling', backend: 'ollama', pct };
      });
      setActiveEmbedderBackend('ollama');
      modelState = { status: 'ready', backend: 'ollama' };
      log.info('embedder backend: ollama (model pulled)');
      return;
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'Ollama model pull failed; attempting ONNX fallback');
      // fall through to ONNX
    }
  } else {
    log.info('Ollama not reachable; falling back to in-process ONNX embedder');
  }

  // Fallback: ONNX in-process embedder.
  const onnxOk = await isOnnxEmbedderAvailable();
  if (!onnxOk) {
    setActiveEmbedderBackend('unknown');
    modelState = {
      status: 'unavailable', backend: 'unknown',
      reason: 'Ollama not reachable AND ONNX embedder failed to load; embeddings disabled.',
    };
    log.error(modelState.reason);
    return;
  }

  // ONNX loaded. Reconcile against the Lance schema dim baked in from
  // config at module init time. Existing Lance tables carry that dim.
  if (EMBEDDING_DIM !== ONNX_EMBEDDING_DIM) {
    const reason =
      `ONNX fallback picked but config embeddingDim=${EMBEDDING_DIM} != ` +
      `${ONNX_EMBEDDING_MODEL}'s ${ONNX_EMBEDDING_DIM}. ` +
      `Vector search + writes DISABLED. To enable: either (a) start Ollama with the ` +
      `configured model, or (b) update ~/.insrc/config.json ` +
      `(models.providers.local.embeddingModel="${ONNX_EMBEDDING_MODEL}", ` +
      `models.providers.local.embeddingDim=${ONNX_EMBEDDING_DIM}), ` +
      `rm -rf ~/.insrc/lance, and re-add repos.`;
    setActiveEmbedderBackend('disabled');
    modelState = { status: 'disabled', backend: 'disabled', reason };
    log.error({ configDim: EMBEDDING_DIM, onnxDim: ONNX_EMBEDDING_DIM }, reason);
    return;
  }

  // ONNX + dim match → all vector ops route through nomic.
  setActiveEmbedderBackend('onnx');
  modelState = { status: 'ready', backend: 'onnx' };
  log.info({ model: ONNX_EMBEDDING_MODEL, dim: ONNX_EMBEDDING_DIM }, 'embedder backend: onnx');
}
