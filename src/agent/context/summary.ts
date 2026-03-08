import type { LLMProvider } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// L2 — Rolling Summary
//
// Compressed representation of evicted conversation turns.
// Updated when L3a overflows (turn -6 evicted).
// Uses local model to compress, max 3 sentences.
// ---------------------------------------------------------------------------

export interface ConversationTurn {
  userMessage: string;
  assistantResponse: string;
  /** Entity IDs referenced in this turn (for L3b storage). */
  entityIds: string[];
}

/**
 * Compress an evicted turn into the running summary.
 *
 * The local model preserves: decisions made, file names, entity names,
 * open questions. Max 3 sentences total.
 */
export async function evictToSummary(
  currentSummary: string,
  evictedTurn: ConversationTurn,
  provider: LLMProvider,
): Promise<string> {
  const turnText = formatTurn(evictedTurn);

  const messages = [
    {
      role: 'system' as const,
      content:
        'Update the running summary to include the new exchange. ' +
        'Preserve: decisions made, file names, entity names, open questions. ' +
        'Be concise. Max 3 sentences total. Return only the updated summary.',
    },
    {
      role: 'user' as const,
      content: currentSummary
        ? `Current summary:\n${currentSummary}\n\nNew exchange:\n${turnText}`
        : `New exchange:\n${turnText}`,
    },
  ];

  try {
    const response = await provider.complete(messages, {
      maxTokens: 250,
      temperature: 0,
    });
    return response.text.trim();
  } catch {
    // If local model unavailable, append a minimal extract
    const firstLine = evictedTurn.userMessage.split('\n')[0] ?? '';
    return currentSummary
      ? `${currentSummary} User asked: "${firstLine.slice(0, 100)}".`
      : `User asked: "${firstLine.slice(0, 100)}".`;
  }
}

function formatTurn(turn: ConversationTurn): string {
  const user = turn.userMessage.slice(0, 500);
  const assistant = turn.assistantResponse.slice(0, 500);
  return `User: ${user}\nAssistant: ${assistant}`;
}
