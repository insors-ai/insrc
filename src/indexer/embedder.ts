import { Ollama } from 'ollama';
import type { Entity, AgentConfig } from '../shared/types.js';
import { loadConfig } from '../agent/config.js';

const config = loadConfig();

export const EMBEDDING_MODEL = config.models.embedding;
export const EMBEDDING_DIM   = config.models.embeddingDim;

const QUERY_PREFIX =
  'Instruct: Given a user question, retrieve relevant code snippets\nQuery: ';

const BATCH_SIZE = 16;

const ollama = new Ollama({ host: config.ollama.host });

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

/** Prepend the task instruction prefix used for query embeddings. */
export function formatQuery(text: string): string {
  return `${QUERY_PREFIX}${text}`;
}

// ---------------------------------------------------------------------------
// Embedding calls
// ---------------------------------------------------------------------------

/**
 * Embed a batch of entities in-place.
 * Skips entities that already have embeddings unless `force: true`.
 * Silently no-ops if Ollama is unavailable.
 */
export async function embedEntities(
  entities: Entity[],
  opts?: { force?: boolean },
): Promise<void> {
  const toEmbed = opts?.force
    ? entities
    : entities.filter(e => e.embedding.length === 0 && e.body !== '');

  if (toEmbed.length === 0) return;

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch  = toEmbed.slice(i, i + BATCH_SIZE);
    const inputs = batch.map(formatDocument);

    try {
      const result = await ollama.embed({ model: EMBEDDING_MODEL, input: inputs });
      for (let j = 0; j < batch.length; j++) {
        const entity    = batch[j];
        const embedding = result.embeddings[j];
        if (entity && embedding) {
          entity.embedding      = embedding;
          entity.embeddingModel = EMBEDDING_MODEL;
        }
      }
    } catch {
      // Ollama unavailable — leave embeddings empty; reembed job will backfill
    }
  }
}

/**
 * Embed a single user query string (with task instruction prefix).
 * Returns an empty array if Ollama is unavailable.
 */
export async function embedQuery(text: string): Promise<number[]> {
  try {
    const result = await ollama.embed({
      model: EMBEDDING_MODEL,
      input: formatQuery(text),
    });
    return result.embeddings[0] ?? [];
  } catch {
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
