import { Ollama } from 'ollama';
import type { Entity } from '../shared/types.js';
import { loadLocalProviderConfig } from '../config/local.js';
import { getLogger } from '../shared/logger.js';
import {
  isOnnxEmbedderAvailable,
  onnxEmbedDocument,
  onnxEmbedDocuments,
  onnxEmbedQuery,
  ONNX_EMBEDDING_DIM,
  ONNX_EMBEDDING_MODEL,
} from '../agent/providers/onnx-embedder.js';

const log = getLogger('embedder');

const _localDefaults = loadLocalProviderConfig();

export const EMBEDDING_MODEL = _localDefaults.embeddingModel;
export const EMBEDDING_DIM   = _localDefaults.embeddingDim;

const QUERY_PREFIX =
  'Instruct: Given a user question, retrieve relevant code snippets\nQuery: ';

const BATCH_SIZE = 16;

// ---------------------------------------------------------------------------
// Timeouts on Ollama HTTP calls
//
// The `ollama` npm client wraps `undici` fetch with NO default timeout.
// If Ollama stalls on a request (backpressure, GPU thrash, a specific
// input that trips a server-side latent bug), the `await ollama.embed(...)`
// never resolves and there's no `catch` because there's no rejection --
// the whole indexer sits idle forever. Observed 2026-07-13 against
// qwen3-embedding:0.6b on insrc-ide: indexer wedged on a specific
// batch, 0 % CPU, no network activity, no error output. Restart put
// the daemon right back into the same stuck state on the same file.
//
// Fix: race every embed call against a per-request timeout. On timeout
// we log a warning + let the batch's embeddings stay empty; the reembed
// job picks stragglers up next pass.
//
// Times: 60 s per BATCH_SIZE=16 embed is generous (normal is 200 ms on
// GPU, ~5 s on CPU under load); 30 s for single-input calls.
const OLLAMA_EMBED_BATCH_TIMEOUT_MS = 60_000;
const OLLAMA_EMBED_SINGLE_TIMEOUT_MS = 30_000;

const ollama = new Ollama({ host: _localDefaults.host });

/** Race an Ollama call against a timeout. Rejection lets the outer
 *  try/catch continue past the stuck request. The orphaned fetch
 *  keeps running in the background until it dies or completes;
 *  its result is discarded. */
async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

/**
 * Which embedder backend the daemon is serving. Selected once at boot
 * by `initEmbedderBackend()` -- called from `daemon/lifecycle.ts`
 * `bootstrapEmbeddingModel()`. Before initialisation, defaults to
 * `unknown` and every embed call short-circuits to `[]` (same graceful
 * degradation the daemon has always had when Ollama is unreachable).
 */
export type EmbedderBackend = 'ollama' | 'onnx' | 'unknown' | 'disabled';

let activeBackend: EmbedderBackend = 'unknown';

/**
 * Set after `initEmbedderBackend` runs. When the picked backend is
 * `onnx` but the config's `embeddingDim` doesn't match ONNX's 768,
 * we flip to `disabled` -- every embed call returns `[]` so the
 * daemon boots + serves deterministic queries, and each Lance vector
 * op silently no-ops instead of throwing dim-mismatch errors.
 */
export function getActiveEmbedderBackend(): EmbedderBackend {
  return activeBackend;
}

/**
 * Called once by the daemon at boot after probing Ollama and (if
 * needed) the ONNX embedder. Sets the backend used by every embed
 * call from that point forward.
 */
export function setActiveEmbedderBackend(backend: EmbedderBackend): void {
  activeBackend = backend;
  log.info({ backend }, 'embedder backend set');
}

// ---------------------------------------------------------------------------
// Document / query formatting
// ---------------------------------------------------------------------------

function formatDocument(entity: Entity): string {
  // File and module stubs have no meaningful body
  if (!entity.body || entity.kind === 'file' || entity.kind === 'module') {
    return entity.name;
  }
  // Cap at ~8 000 chars to stay comfortably within the 32K context window
  return entity.body.length > 8_000 ? entity.body.slice(0, 8_000) : entity.body;
}

/** Prepend the task instruction prefix used for query embeddings.
 *  Only used when the active backend is Ollama -- ONNX (nomic) uses
 *  its own `search_query: ` prefix applied inside the onnx-embedder
 *  module. */
export function formatQuery(text: string): string {
  return `${QUERY_PREFIX}${text}`;
}

// ---------------------------------------------------------------------------
// Embedding calls (dispatch to the active backend)
// ---------------------------------------------------------------------------

/**
 * Embed a batch of entities in-place.
 * Skips entities that already have embeddings unless `force: true`.
 * Silently no-ops if the active backend can't produce embeddings.
 */
export async function embedEntities(
  entities: Entity[],
  opts?: { force?: boolean },
): Promise<void> {
  const toEmbed = opts?.force
    ? entities
    : entities.filter(e => e.embedding.length === 0 && e.body !== '');

  if (toEmbed.length === 0) return;
  if (activeBackend === 'disabled' || activeBackend === 'unknown') return;

  if (activeBackend === 'ollama') {
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const batch  = toEmbed.slice(i, i + BATCH_SIZE);
      const inputs = batch.map(formatDocument);

      try {
        const result = await withTimeout(
          ollama.embed({ model: EMBEDDING_MODEL, input: inputs }),
          OLLAMA_EMBED_BATCH_TIMEOUT_MS,
          `ollama.embed (batch=${inputs.length})`,
        );
        for (let j = 0; j < batch.length; j++) {
          const entity    = batch[j];
          const embedding = result.embeddings[j];
          if (entity && embedding) {
            entity.embedding      = embedding;
            entity.embeddingModel = EMBEDDING_MODEL;
          }
        }
      } catch (err) {
        // Timeout or transport error -- leave embeddings empty; reembed
        // job backfills next pass. LOG so a persistent stall is visible
        // (silent catch is what let the pre-timeout hang go unnoticed).
        log.warn(
          { err: (err as Error).message, batchSize: inputs.length, sampleName: batch[0]?.name, sampleFile: batch[0]?.file },
          'ollama embedEntities batch failed; skipping batch',
        );
      }
    }
    return;
  }

  // ONNX path -- one batch at a time to keep memory bounded, though
  // the underlying pipeline handles the batch internally.
  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch  = toEmbed.slice(i, i + BATCH_SIZE);
    const inputs = batch.map(formatDocument);
    try {
      const vectors = await onnxEmbedDocuments(inputs);
      for (let j = 0; j < batch.length; j++) {
        const entity = batch[j];
        const embedding = vectors[j];
        if (entity && embedding) {
          entity.embedding      = embedding;
          entity.embeddingModel = ONNX_EMBEDDING_MODEL;
        }
      }
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'ONNX embedEntities batch failed');
    }
  }
}

/**
 * Embed a single user query string.
 * Returns an empty array if no embedder backend is active or the
 * active backend fails.
 */
export async function embedQuery(text: string): Promise<number[]> {
  if (activeBackend === 'disabled' || activeBackend === 'unknown') return [];
  if (activeBackend === 'onnx') {
    try { return await onnxEmbedQuery(text); }
    catch (err) { log.warn({ err: (err as Error).message }, 'ONNX embedQuery failed'); return []; }
  }
  try {
    const result = await withTimeout(
      ollama.embed({
        model: EMBEDDING_MODEL,
        input: formatQuery(text),
      }),
      OLLAMA_EMBED_SINGLE_TIMEOUT_MS,
      'ollama.embed (query)',
    );
    return result.embeddings[0] ?? [];
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'ollama embedQuery failed');
    return [];
  }
}

/**
 * Embed raw text as a document (no query instruction prefix).
 * Used for config entry indexing.
 * Returns an empty array if no embedder backend is active or the
 * active backend fails.
 */
export async function embedText(text: string): Promise<number[]> {
  if (!text) return [];
  if (activeBackend === 'disabled' || activeBackend === 'unknown') return [];
  if (activeBackend === 'onnx') {
    try { return await onnxEmbedDocument(text); }
    catch (err) { log.warn({ err: (err as Error).message }, 'ONNX embedText failed'); return []; }
  }
  // Cap at ~8000 chars same as entity documents
  const input = text.length > 8_000 ? text.slice(0, 8_000) : text;
  try {
    const result = await withTimeout(
      ollama.embed({
        model: EMBEDDING_MODEL,
        input,
      }),
      OLLAMA_EMBED_SINGLE_TIMEOUT_MS,
      'ollama.embed (text)',
    );
    return result.embeddings[0] ?? [];
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'ollama embedText failed');
    return [];
  }
}

// ---------------------------------------------------------------------------
// Health / bootstrap
// ---------------------------------------------------------------------------

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    await ollama.list();
    return true;
  } catch {
    return false;
  }
}

/** Is the configured embedding model actually installed in Ollama? */
export async function isConfiguredEmbeddingModelInstalled(): Promise<boolean> {
  try {
    const { models } = await ollama.list();
    return models.some(
      m => m.name === EMBEDDING_MODEL ||
           m.name.startsWith(EMBEDDING_MODEL.split(':')[0] ?? ''),
    );
  } catch {
    return false;
  }
}

/**
 * Ensure the embedding model is installed in Ollama.
 * Pulls it (with progress logging) if not present.
 * Throws if Ollama itself is unreachable.
 */
export async function ensureEmbeddingModel(
  onProgress?: (pct: number) => void,
): Promise<void> {
  const { models } = await ollama.list();
  const installed  = models.some(
    m => m.name === EMBEDDING_MODEL ||
         m.name.startsWith(EMBEDDING_MODEL.split(':')[0] ?? ''),
  );
  if (installed) return;

  const stream = await ollama.pull({ model: EMBEDDING_MODEL, stream: true });
  for await (const event of stream) {
    if (event.total && event.completed) {
      onProgress?.(Math.round((event.completed / event.total) * 100));
    }
  }
}

// ---------------------------------------------------------------------------
// ONNX bootstrap helpers (re-exported for daemon/lifecycle.ts)
// ---------------------------------------------------------------------------

export { isOnnxEmbedderAvailable, ONNX_EMBEDDING_DIM, ONNX_EMBEDDING_MODEL };
