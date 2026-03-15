import type { LLMProvider, LLMMessage } from '../../../shared/types.js';
import type { RequirementTodo } from './types.js';
import { SEARCH_PLAN_SYSTEM } from './prompts.js';

// ---------------------------------------------------------------------------
// Search Planner — LLM-driven categorized search for the sketch phase
//
// Instead of blindly vector-searching the raw requirement text, the LLM
// analyzes the requirement and generates targeted search queries with
// category filters (code, artifact, all).
// ---------------------------------------------------------------------------

export interface PlannedSearch {
  /** The search text (short, focused, 2-6 words) */
  query: string;
  /** What to search: code entities, artifact files, or everything */
  filter: 'all' | 'code' | 'artifact';
  /** Human label: "interfaces", "configs", "schemas", etc. */
  category: string;
  /** How many results to return (5-15) */
  limit: number;
}

/**
 * Ask the LLM to plan categorized search queries for a requirement.
 *
 * Returns 3-6 targeted searches. Falls back to a single broad search
 * using the raw requirement text if the LLM response can't be parsed.
 */
export async function planSearches(
  requirement: RequirementTodo,
  localProvider: LLMProvider,
): Promise<PlannedSearch[]> {
  const messages: LLMMessage[] = [
    { role: 'system', content: SEARCH_PLAN_SYSTEM },
    { role: 'user', content: requirement.statement },
  ];

  try {
    const response = await localProvider.complete(messages, {
      maxTokens: 512,
      temperature: 0.1,
    });

    return parseSearchPlan(response.text, requirement.statement);
  } catch {
    // LLM call failed — fall back to raw requirement search
    return [fallbackSearch(requirement.statement)];
  }
}

/**
 * Parse the LLM's JSON output into validated PlannedSearch entries.
 * Falls back to a single broad search if parsing fails.
 */
export function parseSearchPlan(text: string, statement: string): PlannedSearch[] {
  // Strip markdown fences if present
  const cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract JSON array from the text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return [fallbackSearch(statement)];
  }

  const validFilters = new Set(['all', 'code', 'artifact']);
  const searches: PlannedSearch[] = [];

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;

    const query = typeof rec['query'] === 'string' ? rec['query'].trim() : '';
    if (!query) continue;

    const filter = validFilters.has(rec['filter'] as string)
      ? (rec['filter'] as PlannedSearch['filter'])
      : 'all';
    const category = typeof rec['category'] === 'string' ? rec['category'] : 'general';
    const limit = typeof rec['limit'] === 'number' ? Math.min(Math.max(rec['limit'], 3), 20) : 10;

    searches.push({ query, filter, category, limit });
  }

  if (searches.length === 0) {
    return [fallbackSearch(statement)];
  }

  // Cap at 8 queries to bound total search time
  return searches.slice(0, 8);
}

export function fallbackSearch(statement: string): PlannedSearch {
  return { query: statement, filter: 'all', category: 'general', limit: 15 };
}
