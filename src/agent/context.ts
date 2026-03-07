/**
 * Agent graph context assembly.
 *
 * Builds structured LLM context from the Code Knowledge Graph each turn.
 * The agent calls this before each LLM invocation to populate the L4 task
 * context layer (~16K token budget).
 *
 * Public API:
 *   initSession     — resolve dependency closure at session start
 *   fetchTaskContext — semantic search + 1-hop graph expansion → formatted string
 */

import { rpc } from '../cli/client.js';
import type { Entity } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Token budget
// ---------------------------------------------------------------------------

/** Approximate chars → tokens ratio for code (conservative: 1 token ≈ 3 chars). */
const CHARS_PER_TOKEN = 3;
/** L4 task context token budget (~16K tokens). */
const L4_TOKEN_BUDGET = 16_000;
const L4_CHAR_BUDGET  = L4_TOKEN_BUDGET * CHARS_PER_TOKEN;

// ---------------------------------------------------------------------------
// Session init
// ---------------------------------------------------------------------------

/**
 * Called once at session start.
 * Returns the dependency closure repo paths for scoping all searches.
 *
 * On error (daemon not running, repo not indexed) returns just the root repo.
 */
export async function initSession(repoPath: string): Promise<string[]> {
  try {
    const closure = await rpc<string[]>('search.closure', { repoPath });
    if (Array.isArray(closure) && closure.length > 0) return closure;
  } catch {
    // daemon not reachable or method not implemented yet
  }
  return [repoPath];
}

// ---------------------------------------------------------------------------
// Task context assembly
// ---------------------------------------------------------------------------

/**
 * Formats a single entity as a compact context block.
 *
 * Example output:
 *   [function calculateTotal — src/cart/total.ts:42-55]
 *   function calculateTotal(items: Item[]): number { ... }
 */
function formatEntity(entity: Entity, callers: Entity[], callees: Entity[]): string {
  const loc    = `${entity.file}:${entity.startLine}-${entity.endLine}`;
  const header = `[${entity.kind} ${entity.name} — ${loc}]`;

  // Truncate body at 800 chars to keep individual entities from dominating the budget
  const body = entity.body.length > 800
    ? entity.body.slice(0, 800) + '\n...'
    : entity.body;

  const lines = [header, body];

  if (callers.length > 0) {
    const callerList = callers
      .slice(0, 5)
      .map(c => `${c.name} (${c.file}:${c.startLine})`)
      .join(', ');
    lines.push(`Callers: ${callerList}`);
  }

  if (callees.length > 0) {
    const calleeList = callees
      .slice(0, 5)
      .map(c => `${c.name} (${c.file}:${c.startLine})`)
      .join(', ');
    lines.push(`Calls: ${calleeList}`);
  }

  return lines.join('\n');
}

/**
 * Fetch structured task context for one agent turn.
 *
 * Steps:
 *  1. Semantic search scoped to the closure repos
 *  2. For each top result, expand 1-hop callers + callees via graph
 *  3. Format as structured text blocks, trimmed to L4_TOKEN_BUDGET
 *
 * Returns empty string if the daemon is unreachable.
 */
export async function fetchTaskContext(
  query:        string,
  closureRepos: string[],
  limit         = 10,
): Promise<string> {
  let entities: Entity[];
  try {
    entities = await rpc<Entity[]>('search.query', { text: query, limit });
  } catch {
    return '';
  }

  if (entities.length === 0) return '';

  const blocks: string[] = [];
  let totalChars = 0;

  for (const entity of entities) {
    // Stay within the L4 budget
    if (totalChars >= L4_CHAR_BUDGET) break;

    // 1-hop graph expansion
    let callers: Entity[] = [];
    let callees: Entity[] = [];
    try {
      [callers, callees] = await Promise.all([
        rpc<Entity[]>('search.callers', { entityId: entity.id }),
        rpc<Entity[]>('search.callees', { entityId: entity.id }),
      ]);
    } catch {
      // graph queries are optional — proceed without them
    }

    const block = formatEntity(entity, callers, callees);
    blocks.push(block);
    totalChars += block.length;
  }

  return blocks.join('\n\n---\n\n');
}
