import { RecordId } from 'surrealdb';
import type { DbClient } from './client.js';
import type { Relation, RelationKind } from '../shared/types.js';

// Map RelationKind to the SurrealDB edge table name (lowercase)
const EDGE_TABLE: Record<RelationKind, string> = {
  DEFINES:    'defines',
  IMPORTS:    'imports',
  CALLS:      'calls',
  INHERITS:   'inherits',
  IMPLEMENTS: 'implements',
  DEPENDS_ON: 'depends_on',
  EXPORTS:    'exports',
  REFERENCES: 'references',
};

function entityRecordId(id: string): RecordId {
  return new RecordId('entity', id);
}

/**
 * Upsert a graph relation edge between two entities.
 * Duplicate RELATE calls are idempotent in SurrealDB when both endpoints exist.
 */
export async function upsertRelation(db: DbClient, relation: Relation): Promise<void> {
  if (!relation.resolved) return; // don't write unresolved stubs to the graph

  const table = EDGE_TABLE[relation.kind];
  await db.query(
    `RELATE $from->${table}->$to`,
    {
      from: entityRecordId(relation.from),
      to:   entityRecordId(relation.to),
    },
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
 * Delete all edges that originate from entities in the given file.
 * Must be called before re-indexing a file to prevent stale edges.
 */
export async function deleteRelationsForFile(db: DbClient, filePath: string): Promise<void> {
  // Find all entity IDs in the file, then delete outgoing edges from each table
  const [entities] = await db.query<[{ id: string }[]]>(
    'SELECT meta::id(id) AS id FROM entity WHERE file = $file',
    { file: filePath },
  );

  if (!entities || entities.length === 0) return;

  const tables = Object.values(EDGE_TABLE);
  for (const table of tables) {
    await db.query(
      `DELETE ${table} WHERE in IN $ids`,
      { ids: entities.map(e => entityRecordId(e.id)) },
    );
  }
}

/**
 * Delete all edges originating from entities in a repo.
 */
export async function deleteRelationsForRepo(db: DbClient, repo: string): Promise<void> {
  const [entities] = await db.query<[{ id: string }[]]>(
    'SELECT meta::id(id) AS id FROM entity WHERE repo = $repo',
    { repo },
  );

  if (!entities || entities.length === 0) return;

  const tables = Object.values(EDGE_TABLE);
  for (const table of tables) {
    await db.query(
      `DELETE ${table} WHERE in IN $ids`,
      { ids: entities.map(e => entityRecordId(e.id)) },
    );
  }
}
