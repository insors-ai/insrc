import { countTokens } from './budget.js';
import type { ConversationTurn } from './summary.js';

// ---------------------------------------------------------------------------
// L3a — Recent Turns
//
// Last 5 turns with recency weighting:
//   Turn -1 (most recent): full text
//   Turn -2: 75% — trim assistant response tail
//   Turn -3: 50% — user message + first half of response
//   Turn -4: 25% — user message + first paragraph of response
//   Turn -5: user message only
//   Turn -6+: evicted to L2 (summarized)
// ---------------------------------------------------------------------------

const MAX_RECENT = 5;

/**
 * Apply recency weighting to recent turns.
 * Returns formatted text blocks, ordered newest-first.
 *
 * @param turns - Recent turns, ordered newest-first (index 0 = most recent).
 */
export function weightedRecent(turns: ConversationTurn[]): string[] {
  const blocks: string[] = [];

  for (let i = 0; i < Math.min(turns.length, MAX_RECENT); i++) {
    const turn = turns[i]!;
    blocks.push(formatWeightedTurn(turn, i));
  }

  return blocks;
}

/**
 * Check if turns need eviction (more than MAX_RECENT).
 * Returns the turns to evict (oldest first).
 */
export function getEvictable(turns: ConversationTurn[]): ConversationTurn[] {
  if (turns.length <= MAX_RECENT) return [];
  return turns.slice(MAX_RECENT);
}

/**
 * Format a turn with recency weighting.
 * @param turn - The conversation turn
 * @param age - 0 = most recent, 1 = second most recent, etc.
 */
function formatWeightedTurn(turn: ConversationTurn, age: number): string {
  const user = `User: ${turn.userMessage}`;

  switch (age) {
    case 0:
      // Full text
      return `${user}\nAssistant: ${turn.assistantResponse}`;

    case 1: {
      // 75% — trim assistant tail
      const cutoff = Math.floor(turn.assistantResponse.length * 0.75);
      const trimmed = turn.assistantResponse.slice(0, cutoff);
      return `${user}\nAssistant: ${trimmed}...`;
    }

    case 2: {
      // 50% — first half of response
      const cutoff = Math.floor(turn.assistantResponse.length * 0.5);
      const trimmed = turn.assistantResponse.slice(0, cutoff);
      return `${user}\nAssistant: ${trimmed}...`;
    }

    case 3: {
      // 25% — first paragraph of response
      const firstPara = turn.assistantResponse.split('\n\n')[0] ?? '';
      const cutoff = Math.floor(turn.assistantResponse.length * 0.25);
      const trimmed = firstPara.length < cutoff ? firstPara : turn.assistantResponse.slice(0, cutoff);
      return `${user}\nAssistant: ${trimmed}...`;
    }

    default:
      // Turn -5+: user message only
      return user;
  }
}

/**
 * Return recent turns with recency-weighted truncation applied.
 * Unlike weightedRecent() which returns formatted strings, this returns
 * structured turns for use as alternating user/assistant messages.
 */
export function weightedRecentTurns(turns: ConversationTurn[]): ConversationTurn[] {
  const result: ConversationTurn[] = [];
  for (let i = 0; i < Math.min(turns.length, MAX_RECENT); i++) {
    const turn = turns[i]!;
    result.push(truncateTurnByAge(turn, i));
  }
  return result;
}

function truncateTurnByAge(turn: ConversationTurn, age: number): ConversationTurn {
  switch (age) {
    case 0: return turn; // full
    case 1: return { ...turn, assistantResponse: turn.assistantResponse.slice(0, Math.floor(turn.assistantResponse.length * 0.75)) };
    case 2: return { ...turn, assistantResponse: turn.assistantResponse.slice(0, Math.floor(turn.assistantResponse.length * 0.5)) };
    case 3: {
      const firstPara = turn.assistantResponse.split('\n\n')[0] ?? '';
      const cutoff = Math.floor(turn.assistantResponse.length * 0.25);
      return { ...turn, assistantResponse: firstPara.length < cutoff ? firstPara : turn.assistantResponse.slice(0, cutoff) };
    }
    default: return { ...turn, assistantResponse: '' }; // user message only
  }
}

/** Maximum number of recent turns to keep. */
export const MAX_RECENT_TURNS = MAX_RECENT;
