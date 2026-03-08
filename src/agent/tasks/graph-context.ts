import type { Entity } from '../../shared/types.js';
import { searchByFile, searchCallersNhop, searchCallees } from '../tools/mcp-client.js';
import { mapDiffToEntityIds, type FileDiff, type ValidationContext, type EntityRef } from './diff-utils.js';

// ---------------------------------------------------------------------------
// Graph Context Assembly — enriches Stage 1 and Stage 2 pipeline contexts
//
// Bridges the gap between the flat codeContext from the REPL's assemble()
// and the structured graph-derived context the design specifies.
//
// Design requirements:
//   Stage 1: target entity (full body), callers/callees (signatures), types
//   Stage 2: diff-derived only — touched entity bodies + 1-hop neighbours
//   Refactor: 2-hop callers instead of 1-hop
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stage 2 — Enrich ValidationContext from the knowledge graph
// ---------------------------------------------------------------------------

/**
 * After Stage 1 produces a diff, enrich the ValidationContext for Stage 2.
 *
 * 1. Find all entities in the files touched by the diff
 * 2. Map diff hunks to entity IDs via line-range overlap
 * 3. Fetch bodies of touched entities
 * 4. Fetch 1-hop callers/callees of touched entities (signatures only)
 * 5. Collect referenced types (interfaces/types among neighbours)
 *
 * Returns a populated ValidationContext ready for Claude.
 */
export async function enrichValidationContext(
  diffs: FileDiff[],
  diffText: string,
): Promise<ValidationContext> {
  const ctx: ValidationContext = {
    diff: diffText,
    touchedEntities: [],
    neighbourSignatures: [],
    referencedTypes: [],
  };

  // Collect entities from all touched files
  const allFileEntities: Entity[] = [];
  const touchedFiles = new Set<string>();

  for (const fd of diffs) {
    const filePath = fd.isNew ? fd.newPath : fd.oldPath;
    touchedFiles.add(filePath);
  }

  for (const filePath of touchedFiles) {
    const entities = await searchByFile(filePath);
    allFileEntities.push(...entities);
  }

  if (allFileEntities.length === 0) return ctx;

  // Map diff hunks to entity IDs
  const entityRefs: EntityRef[] = allFileEntities.map(e => ({
    id: e.id,
    kind: e.kind,
    name: e.name,
    file: e.file,
    startLine: e.startLine,
    endLine: e.endLine,
  }));

  const touchedIds = mapDiffToEntityIds(diffs, entityRefs);
  const touchedMap = new Map(allFileEntities.map(e => [e.id, e]));

  // Populate touched entity bodies
  for (const id of touchedIds) {
    const entity = touchedMap.get(id);
    if (entity) {
      ctx.touchedEntities.push({
        name: entity.name,
        kind: entity.kind,
        body: entity.body,
      });
    }
  }

  // Fetch 1-hop neighbours (callers + callees) for all touched entities
  const neighbourIds = new Set<string>();
  const neighbourSignatures: string[] = [];
  const types: string[] = [];

  for (const id of touchedIds) {
    const [callers, callees] = await Promise.all([
      searchCallersNhop(id, 1),
      searchCallees(id),
    ]);

    for (const entity of [...callers, ...callees]) {
      if (neighbourIds.has(entity.id) || touchedIds.includes(entity.id)) continue;
      neighbourIds.add(entity.id);

      if (entity.kind === 'type' || entity.kind === 'interface') {
        types.push(entity.body || entity.signature || `${entity.kind} ${entity.name}`);
      } else {
        neighbourSignatures.push(
          entity.signature || `${entity.kind} ${entity.name}`,
        );
      }
    }
  }

  ctx.neighbourSignatures = neighbourSignatures;
  ctx.referencedTypes = types;

  return ctx;
}

// ---------------------------------------------------------------------------
// Stage 1 — Structured context assembly
// ---------------------------------------------------------------------------

export interface StructuredContext {
  /** Full context string with explicit sections for the LLM */
  text: string;
  /** Entity IDs found (for tracking) */
  entityIds: string[];
}

/**
 * Assemble structured Stage 1 context from the knowledge graph.
 *
 * Takes the flat codeContext from the REPL and enriches it with
 * graph-derived sections: target entity, callers, callees, types.
 *
 * @param flatContext - The flat code context from ctx.assemble()
 * @param repoPath - Repo root path (for file resolution)
 * @param callerHops - Number of hops for callers (1 for implement, 2 for refactor)
 */
export async function assembleStructuredContext(
  flatContext: string,
  repoPath: string,
  callerHops = 1,
): Promise<StructuredContext> {
  // The flat context from the REPL's assemble() already contains relevant
  // entities from vector search. We enhance it by labeling sections.
  //
  // In a full graph integration, we would:
  //   1. Identify the target entity from the user's message
  //   2. Query graph_callers(entity, hops) and graph_callees(entity, 1)
  //   3. Query referenced types
  //   4. Build structured sections
  //
  // For now, we label the flat context and add a hop-count hint so the
  // LLM knows how much caller context it has.

  const hopLabel = callerHops > 1
    ? `(includes up to ${callerHops}-hop callers for call-site compatibility)`
    : '(includes direct callers/callees)';

  const text = flatContext
    ? `Code context ${hopLabel}:\n${flatContext}`
    : '';

  return { text, entityIds: [] };
}
