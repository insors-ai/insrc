import type { Entity } from '../../shared/types.js';
import type { ContextProvider, ExecutionStep, PipelineLogger } from './types.js';

// ---------------------------------------------------------------------------
// Context fetching — graph-aware context for pipeline stages
//
// Uses the ContextProvider to fetch relevant code entities for each step.
// Formats entities with progressive disclosure (full body → signature → name)
// and respects a per-step token budget.
// ---------------------------------------------------------------------------

/** Maximum chars of entity body to include at full disclosure. */
const MAX_BODY_CHARS = 800;

/** Default per-step context budget in tokens (chars / 3). */
const DEFAULT_STEP_CONTEXT_TOKENS = 4_000;

/**
 * Fetch graph context for a single execution step.
 *
 * 1. Vector search using the step's prompt as query
 * 2. 1-hop graph expansion on top results (callers + callees)
 * 3. Format with progressive disclosure
 * 4. Trim to token budget
 *
 * Returns formatted context string, or empty string if no provider / no results.
 */
export async function fetchStepContext(
  step: ExecutionStep,
  provider: ContextProvider | undefined,
  seenEntityIds: Set<string>,
  onEvent?: PipelineLogger,
  tokenBudget = DEFAULT_STEP_CONTEXT_TOKENS,
): Promise<string> {
  if (!provider) return '';

  // Build a search query from the step's prompt + title
  const query = `${step.title}: ${step.prompt}`.slice(0, 500);

  // Vector search
  const entities = await provider.search(query, 8);
  if (entities.length === 0) return '';

  onEvent?.({
    stage: 'execute',
    status: 'step-context',
    step: step.index,
    entityCount: entities.length,
  });

  // 1-hop expansion for the top 3 entities (avoid expensive expansion on all)
  const expansions = new Map<string, { callers: Entity[]; callees: Entity[] }>();
  const toExpand = entities.slice(0, 3);

  await Promise.all(
    toExpand.map(async (entity) => {
      const result = await provider.expand(entity.id);
      expansions.set(entity.id, result);
    }),
  );

  // Format entities with progressive disclosure
  const blocks: string[] = [];
  let totalChars = 0;
  const charBudget = tokenBudget * 3; // chars ≈ tokens * 3

  for (const entity of entities) {
    if (totalChars >= charBudget) break;

    const expansion = expansions.get(entity.id);
    const block = formatEntity(entity, expansion, seenEntityIds);
    totalChars += block.length;
    blocks.push(block);

    // Track this entity as seen for future steps
    seenEntityIds.add(entity.id);
  }

  return blocks.join('\n\n---\n\n');
}

/**
 * Fetch context relevant to the analyze stage.
 *
 * Uses the user's original message as the search query.
 * Returns both formatted context and the list of referenced entity names
 * (to enrich AnalysisResult.referencedEntities).
 */
export async function fetchAnalyzeContext(
  userMessage: string,
  provider: ContextProvider | undefined,
  onEvent?: PipelineLogger,
): Promise<{ context: string; entityNames: string[] }> {
  if (!provider) return { context: '', entityNames: [] };

  const entities = await provider.search(userMessage, 10);

  onEvent?.({
    stage: 'context',
    status: 'search',
    query: userMessage,
    resultCount: entities.length,
  });

  if (entities.length === 0) return { context: '', entityNames: [] };

  // Expand top 5 for analyze (more thorough than per-step)
  const blocks: string[] = [];
  const entityNames: string[] = [];

  for (const entity of entities.slice(0, 5)) {
    const expansion = await provider.expand(entity.id);

    onEvent?.({
      stage: 'context',
      status: 'expand',
      entityName: entity.name,
      callers: expansion.callers.length,
      callees: expansion.callees.length,
    });

    blocks.push(formatEntityFull(entity, expansion));
    entityNames.push(`${entity.kind}:${entity.name} (${entity.file}:${entity.startLine})`);
  }

  // Include remaining entities at signature level
  for (const entity of entities.slice(5)) {
    const sig = entity.signature ?? entity.body.split('\n')[0] ?? '';
    blocks.push(`[${entity.kind} ${entity.name} — ${entity.file}:${entity.startLine}]\n${sig}`);
    entityNames.push(`${entity.kind}:${entity.name} (${entity.file}:${entity.startLine})`);
  }

  return { context: blocks.join('\n\n---\n\n'), entityNames };
}

// ---------------------------------------------------------------------------
// Entity formatting
// ---------------------------------------------------------------------------

/**
 * Progressive disclosure formatting:
 *   - First time seen: full body + callers/callees
 *   - Seen before: signature only
 */
function formatEntity(
  entity: Entity,
  expansion: { callers: Entity[]; callees: Entity[] } | undefined,
  seenIds: Set<string>,
): string {
  const loc = `${entity.file}:${entity.startLine}-${entity.endLine}`;
  const header = `[${entity.kind} ${entity.name} — ${loc}]`;

  // Already seen in a prior step → signature only
  if (seenIds.has(entity.id)) {
    const sig = entity.signature ?? entity.body.split('\n')[0] ?? '';
    return `${header}\n${sig}`;
  }

  // First time → full body + graph neighbours
  return formatEntityFull(entity, expansion, header);
}

function formatEntityFull(
  entity: Entity,
  expansion?: { callers: Entity[]; callees: Entity[] },
  header?: string,
): string {
  const loc = `${entity.file}:${entity.startLine}-${entity.endLine}`;
  const hdr = header ?? `[${entity.kind} ${entity.name} — ${loc}]`;

  const body = entity.body.length > MAX_BODY_CHARS
    ? entity.body.slice(0, MAX_BODY_CHARS) + '\n...'
    : entity.body;

  const lines = [hdr, body];

  if (expansion) {
    if (expansion.callers.length > 0) {
      const callerList = expansion.callers
        .slice(0, 5)
        .map(c => `${c.name} (${c.file}:${c.startLine})`)
        .join(', ');
      lines.push(`Callers: ${callerList}`);
    }

    if (expansion.callees.length > 0) {
      const calleeList = expansion.callees
        .slice(0, 5)
        .map(c => `${c.name} (${c.file}:${c.startLine})`)
        .join(', ');
      lines.push(`Calls: ${calleeList}`);
    }
  }

  return lines.join('\n');
}
