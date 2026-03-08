import type { LLMProvider } from '../../shared/types.js';
import type { ConversationTurn } from './summary.js';

// ---------------------------------------------------------------------------
// L3b — Semantic History
//
// In-memory store of past turns with embeddings. On each new turn, the user
// message is embedded once (shared with L4 code search). The top-K most
// similar past turns are retrieved via cosine similarity.
//
// Skipped for the first MAX_RECENT (5) turns — recent turns are already
// fully visible in L3a.
//
// Phase 5 will persist this to LanceDB via the daemon.
// ---------------------------------------------------------------------------

const TOP_K = 4;
const MIN_TURNS_FOR_SEMANTIC = 5;

interface StoredTurn {
  turn: ConversationTurn;
  embedding: number[];
}

export class SemanticHistory {
  private readonly store: StoredTurn[] = [];

  /** Total number of stored turns. */
  get size(): number {
    return this.store.length;
  }

  /**
   * Add a turn with its pre-computed embedding.
   * The embedding should come from the user message (computed once per turn).
   */
  add(turn: ConversationTurn, embedding: number[]): void {
    if (embedding.length === 0) return;
    this.store.push({ turn, embedding });
  }

  /**
   * Retrieve the top-K most similar past turns to the query embedding.
   * Returns formatted text blocks ordered by similarity (highest first).
   *
   * Returns empty if fewer than MIN_TURNS_FOR_SEMANTIC turns are stored
   * (L3a already covers recent turns).
   */
  retrieve(queryEmbedding: number[], skip: number = MIN_TURNS_FOR_SEMANTIC): string[] {
    return this.topK(queryEmbedding, skip).map(({ turn, score }) => {
      const trimmed = turn.assistantResponse.length > 300
        ? turn.assistantResponse.slice(0, 300) + '...'
        : turn.assistantResponse;
      return `[similarity=${score.toFixed(3)}] User: ${turn.userMessage}\nAssistant: ${trimmed}`;
    });
  }

  /**
   * Retrieve the raw ConversationTurn objects for the top-K similar turns.
   * Used by the disclosure context builder to collect entity IDs.
   */
  retrieveTurns(queryEmbedding: number[], skip: number = MIN_TURNS_FOR_SEMANTIC): ConversationTurn[] {
    return this.topK(queryEmbedding, skip).map(({ turn }) => turn);
  }

  private topK(queryEmbedding: number[], skip: number): Array<{ turn: ConversationTurn; score: number }> {
    if (this.store.length < skip || queryEmbedding.length === 0) return [];

    const scored = this.store.map((entry, idx) => ({
      idx,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
      turn: entry.turn,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, TOP_K);
  }
}

/**
 * Embed text using the provider's embed method.
 * Returns empty array on failure (never throws).
 */
export async function embedText(provider: LLMProvider, text: string): Promise<number[]> {
  try {
    return await provider.embed(text);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Vector math
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
