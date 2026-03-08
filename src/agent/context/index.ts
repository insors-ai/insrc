/**
 * Context Assembler — orchestrates the layered memory model.
 *
 * Manages the full lifecycle of context assembly per turn:
 *   L1: System context (static, built once)
 *   L2: Rolling summary (updated on eviction)
 *   L3a: Recent turns (recency-weighted)
 *   L3b: Semantic history (embedding similarity)
 *   L4: Task context (code entities from graph)
 *
 * Public API:
 *   ContextManager — stateful manager instantiated per session
 */

import type { LLMProvider, LLMMessage } from '../../shared/types.js';
import type { AssembledContext } from './budget.js';
import { buildSystemContext, type SystemContextOpts } from './system.js';
import { evictToSummary, type ConversationTurn } from './summary.js';
import { weightedRecent, getEvictable, MAX_RECENT_TURNS } from './recent.js';
import { SemanticHistory, embedText } from './semantic.js';
import { fetchTaskContext, initSession, resetSeenCounts, type DisclosureContext } from './task.js';
import { fitToBudget, type RawLayers } from './overflow.js';

export { type AssembledContext } from './budget.js';
export { type ConversationTurn } from './summary.js';
export { initSession } from './task.js';

export class ContextManager {
  private systemText: string;
  private summary = '';
  private readonly recentTurns: ConversationTurn[] = [];
  private readonly semanticHistory = new SemanticHistory();
  private readonly closureRepos: string[];
  private readonly provider: LLMProvider;
  /** Entity IDs from the most recent L4 fetch — stored in turn on recordTurn(). */
  private lastEntityIds: string[] = [];

  constructor(opts: SystemContextOpts & { closureRepos: string[]; provider: LLMProvider }) {
    this.systemText = buildSystemContext(opts);
    this.closureRepos = opts.closureRepos;
    this.provider = opts.provider;
  }

  /**
   * Record a completed turn. Handles eviction to L2 summary automatically.
   * Merges entity IDs from the last L4 fetch into the turn.
   */
  async recordTurn(turn: ConversationTurn, embedding: number[]): Promise<void> {
    // Merge entity IDs from the most recent L4 context fetch
    if (this.lastEntityIds.length > 0 && turn.entityIds.length === 0) {
      turn.entityIds = this.lastEntityIds;
    }
    this.lastEntityIds = [];

    // Add to recent turns (newest first)
    this.recentTurns.unshift(turn);

    // Store in semantic history with embedding
    this.semanticHistory.add(turn, embedding);

    // Evict overflow turns to summary
    const evictable = getEvictable(this.recentTurns);
    for (const evicted of evictable) {
      this.summary = await evictToSummary(this.summary, evicted, this.provider);
    }
    // Remove evicted turns from recent
    if (evictable.length > 0) {
      this.recentTurns.splice(MAX_RECENT_TURNS);
    }
  }

  /**
   * Assemble full context for one LLM turn.
   *
   * The queryEmbedding is the embedding of the current user message,
   * computed once and shared between L3b retrieval and L4 code search.
   */
  async assemble(userMessage: string, queryEmbedding: number[]): Promise<AssembledContext> {
    // L3a: Recent turns (recency-weighted)
    const recentBlocks = weightedRecent(this.recentTurns);

    // L3b: Semantic history (similarity-based)
    const semanticBlocks = this.semanticHistory.retrieve(queryEmbedding);

    // Build disclosure context for progressive entity disclosure
    const disclosure = this.buildDisclosureContext(queryEmbedding);

    // L4: Task context (code entities from graph search)
    const taskResult = await fetchTaskContext(userMessage, this.closureRepos, disclosure);
    this.lastEntityIds = taskResult.entityIds;

    // Extract entity names mentioned in the user message for overflow preservation
    const preservedNames = extractEntityNames(userMessage);

    const raw: RawLayers = {
      system: this.systemText,
      summary: this.summary,
      recent: recentBlocks,
      semantic: semanticBlocks,
      code: taskResult.blocks,
      preservedNames: preservedNames.size > 0 ? preservedNames : undefined,
    };

    return fitToBudget(raw);
  }

  /** Build disclosure context from L3a and L3b entity IDs. */
  private buildDisclosureContext(queryEmbedding: number[]): DisclosureContext {
    // Collect entity IDs from recent turns (L3a)
    const recentEntityIds = new Set<string>();
    for (const turn of this.recentTurns) {
      for (const id of turn.entityIds) {
        recentEntityIds.add(id);
      }
    }

    // Collect entity IDs from semantic history turns (L3b)
    const semanticEntityIds = new Set<string>();
    const semanticTurns = this.semanticHistory.retrieveTurns(queryEmbedding);
    for (const turn of semanticTurns) {
      for (const id of turn.entityIds) {
        semanticEntityIds.add(id);
      }
    }

    return { recentEntityIds, semanticEntityIds };
  }

  /**
   * Build LLM messages from assembled context.
   * Returns [system, ...history context as user message, current user message].
   */
  buildMessages(assembled: AssembledContext, userMessage: string): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // L1: System
    messages.push({ role: 'system', content: assembled.system.text });

    // L2 + L3b: Summary and semantic history as context preamble
    const contextParts: string[] = [];
    if (assembled.summary.text) {
      contextParts.push(`## Session Summary\n${assembled.summary.text}`);
    }
    if (assembled.semantic.text) {
      contextParts.push(`## Related Past Exchanges\n${assembled.semantic.text}`);
    }
    if (assembled.code.text) {
      contextParts.push(`## Relevant Code\n${assembled.code.text}`);
    }

    // L3a: Recent turns as alternating user/assistant messages
    // The recent blocks are already formatted — inject as context
    if (assembled.recent.text) {
      contextParts.push(`## Recent Conversation\n${assembled.recent.text}`);
    }

    if (contextParts.length > 0) {
      messages.push({ role: 'user', content: contextParts.join('\n\n') });
      messages.push({ role: 'assistant', content: 'Understood. I have the context.' });
    }

    // Current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Embed user message text. Single call shared between L3b and L4.
   */
  async embedQuery(text: string): Promise<number[]> {
    return embedText(this.provider, text);
  }

  /**
   * Seed L2 summary from prior session summaries.
   * Called once at session start after cross-session retrieval.
   */
  seedSummary(text: string): void {
    if (text) this.summary = text;
  }

  /** Get the entity IDs from the most recent L4 fetch. */
  getLastEntityIds(): string[] {
    return this.lastEntityIds;
  }

  /** Get current summary (for debugging/display). */
  getSummary(): string {
    return this.summary;
  }

  /** Get recent turn count. */
  getRecentCount(): number {
    return this.recentTurns.length;
  }

  /** Get semantic history size. */
  getSemanticSize(): number {
    return this.semanticHistory.size;
  }

  /** Reset all state (for session restart). */
  reset(): void {
    this.summary = '';
    this.recentTurns.length = 0;
    this.lastEntityIds = [];
    resetSeenCounts();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract likely entity names from user message for overflow preservation.
 *
 * Heuristic: camelCase, PascalCase, snake_case identifiers, and backtick-quoted names.
 * These are entity names the user explicitly mentioned — they should survive overflow.
 */
function extractEntityNames(message: string): Set<string> {
  const names = new Set<string>();

  // Backtick-quoted identifiers: `functionName`
  const backtickPattern = /`([a-zA-Z_]\w+)`/g;
  let m: RegExpExecArray | null;
  while ((m = backtickPattern.exec(message)) !== null) {
    names.add(m[1]!);
  }

  // camelCase or PascalCase identifiers (at least 2 parts)
  const camelPattern = /\b([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b/g;
  while ((m = camelPattern.exec(message)) !== null) {
    names.add(m[1]!);
  }

  // PascalCase (starts with uppercase, has another uppercase)
  const pascalPattern = /\b([A-Z][a-z]+(?:[A-Z][a-z0-9]*)+)\b/g;
  while ((m = pascalPattern.exec(message)) !== null) {
    names.add(m[1]!);
  }

  // snake_case identifiers
  const snakePattern = /\b([a-z]\w*_\w+)\b/g;
  while ((m = snakePattern.exec(message)) !== null) {
    names.add(m[1]!);
  }

  return names;
}
