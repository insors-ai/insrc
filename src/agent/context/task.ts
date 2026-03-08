import { rpc } from '../../cli/client.js';
import { countTokens, TOKEN_BUDGET } from './budget.js';
import type { Entity } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// L4 — Task Context (Code Entities)
//
// Semantic search + 1-hop graph expansion → formatted code entity blocks.
// Uses progressive disclosure based on visibility context:
//   - Never seen this session: full body (up to 800 chars) + callers/callees
//   - Visible in L3a (recent turns): signature only
//   - Seen earlier via L3b (semantic history): name + file location only
//   - Seen ≥3 times total: name + file location only
//
// From design: "Single embed call per turn serves both L4 (code search)
// and L3b (history retrieval)."
// ---------------------------------------------------------------------------

const L4_TOKEN_BUDGET = TOKEN_BUDGET.code;

/** Track how many times each entity has been shown. */
const seenCounts = new Map<string, number>();

/** Context about which entities are already visible in L3a/L3b. */
export interface DisclosureContext {
  /** Entity IDs visible in L3a (recent turns). */
  recentEntityIds: Set<string>;
  /** Entity IDs visible in L3b (semantic history retrieval). */
  semanticEntityIds: Set<string>;
}

/** Result of fetchTaskContext — blocks + entity IDs for turn tracking. */
export interface TaskContextResult {
  blocks: string[];
  entityIds: string[];
}

/**
 * Called once at session start.
 * Returns the dependency closure repo paths for scoping searches.
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

/**
 * Fetch L4 task context for one agent turn.
 *
 * Returns formatted code entity blocks (ordered by relevance, highest-score
 * first) and the entity IDs referenced (for turn tracking).
 */
export async function fetchTaskContext(
  query: string,
  _closureRepos: string[],
  disclosure?: DisclosureContext | undefined,
  limit = 10,
): Promise<TaskContextResult> {
  let entities: Entity[];
  try {
    entities = await rpc<Entity[]>('search.query', { text: query, limit });
  } catch {
    return { blocks: [], entityIds: [] };
  }

  if (entities.length === 0) return { blocks: [], entityIds: [] };

  const blocks: string[] = [];
  const entityIds: string[] = [];
  let totalTokens = 0;

  for (const entity of entities) {
    if (totalTokens >= L4_TOKEN_BUDGET) break;

    // 1-hop graph expansion
    let callers: Entity[] = [];
    let callees: Entity[] = [];
    try {
      [callers, callees] = await Promise.all([
        rpc<Entity[]>('search.callers', { entityId: entity.id }),
        rpc<Entity[]>('search.callees', { entityId: entity.id }),
      ]);
    } catch {
      // graph queries are optional
    }

    const block = formatEntity(entity, callers, callees, disclosure);
    const blockTokens = countTokens(block);
    blocks.push(block);
    entityIds.push(entity.id);
    totalTokens += blockTokens;

    // Track seen count
    seenCounts.set(entity.id, (seenCounts.get(entity.id) ?? 0) + 1);
  }

  return { blocks, entityIds };
}

/**
 * Reset seen counts (e.g., on session reset).
 */
export function resetSeenCounts(): void {
  seenCounts.clear();
}

// ---------------------------------------------------------------------------
// Entity formatting with progressive disclosure
// ---------------------------------------------------------------------------

function formatEntity(
  entity: Entity,
  callers: Entity[],
  callees: Entity[],
  disclosure?: DisclosureContext | undefined,
): string {
  const loc = `${entity.file}:${entity.startLine}-${entity.endLine}`;
  const header = `[${entity.kind} ${entity.name} — ${loc}]`;
  const totalSeen = seenCounts.get(entity.id) ?? 0;

  // Level 3: Seen ≥3 times total or visible in L3b → name + file only
  if (totalSeen >= 3 || disclosure?.semanticEntityIds.has(entity.id)) {
    return header;
  }

  // Level 2: Visible in L3a (recent turns) or seen before → signature only
  if (disclosure?.recentEntityIds.has(entity.id) || totalSeen >= 1) {
    const sig = entity.signature ?? entity.body.split('\n')[0] ?? '';
    return `${header}\n${sig}`;
  }

  // Level 1: First appearance — full body (truncated at 800 chars) + callers/callees
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
