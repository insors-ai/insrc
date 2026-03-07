import type { DbClient } from './client.js';
import type { Relation, RelationKind } from '../shared/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function kuzuExec(db: DbClient, stmt: string, params: any): Promise<void> {
  const prepared = await db.graph.prepare(stmt);
  await db.graph.execute(prepared, params);
}

// Relation kind → Kuzu REL TABLE name (must match schema.ts)
const REL_TABLE: Record<RelationKind, string> = {
  DEFINES:    'DEFINES',
  IMPORTS:    'IMPORTS',
  CALLS:      'CALLS',
  INHERITS:   'INHERITS',
  IMPLEMENTS: 'IMPLEMENTS',
  DEPENDS_ON: 'DEPENDS_ON',
  EXPORTS:    'EXPORTS',
  REFERENCES: 'REFERENCES',
};

/**
 * Upsert a graph relation edge between two Entity stubs in Kuzu.
 * Entity stubs must already exist (created by upsertEntities).
 * Unresolved relations (import specifiers not mapped to an entity) are skipped.
 */
export async function upsertRelation(db: DbClient, relation: Relation): Promise<void> {
  if (!relation.resolved) return;

  const rel = REL_TABLE[relation.kind];
  // MERGE prevents duplicate edges
  await kuzuExec(
    db,
    `MATCH (a:Entity {id: $from}), (b:Entity {id: $to}) MERGE (a)-[:${rel}]->(b)`,
    { from: relation.from, to: relation.to },
  );
}

/**
 * Upsert multiple relations.
 */
export async function upsertRelations(db: DbClient, relations: Relation[]): Promise<void> {
  for (const rel of relations) {
    await upsertRelation(db, rel);
  }
}

/**
 * Delete all edges originating from entities in the given file.
 * In practice this is handled by DETACH DELETE in deleteEntitiesForFile(),
 * but kept for explicit call sites in the indexer pipeline.
 */
export async function deleteRelationsForFile(_db: DbClient, _filePath: string): Promise<void> {
  // Edges are removed automatically via DETACH DELETE on Entity stubs
  // (see entities.ts deleteEntitiesForFile). No separate action needed.
}

/**
 * Delete all edges originating from entities in a repo.
 */
export async function deleteRelationsForRepo(_db: DbClient, _repo: string): Promise<void> {
  // Edges are removed automatically via DETACH DELETE on Entity stubs
  // (see entities.ts deleteEntitiesForRepo). No separate action needed.
}
