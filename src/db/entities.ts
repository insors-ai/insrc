import { RecordId } from 'surrealdb';
import type { DbClient } from './client.js';
import type { Entity } from '../shared/types.js';

function entityRecordId(id: string): RecordId {
  return new RecordId('entity', id);
}

/**
 * Upsert a single entity into the graph.
 * Uses the entity's `id` field as the SurrealDB record ID.
 */
export async function upsertEntity(db: DbClient, entity: Entity): Promise<void> {
  const { id, ...fields } = entity;
  await db.upsert(entityRecordId(id)).content(fields);
}

/**
 * Upsert multiple entities in a single transaction.
 */
export async function upsertEntities(db: DbClient, entities: Entity[]): Promise<void> {
  for (const entity of entities) {
    await upsertEntity(db, entity);
  }
}

/**
 * Delete all entity records whose `file` field matches the given path.
 * Called when a file is deleted or before re-indexing.
 */
export async function deleteEntitiesForFile(db: DbClient, filePath: string): Promise<void> {
  await db.query('DELETE entity WHERE file = $file', { file: filePath });
}

/**
 * Delete all entity records belonging to a repo.
 */
export async function deleteEntitiesForRepo(db: DbClient, repo: string): Promise<void> {
  await db.query('DELETE entity WHERE repo = $repo', { repo });
}

/**
 * Fetch a single entity by its stable ID. Returns null if not found.
 */
export async function getEntity(db: DbClient, id: string): Promise<Entity | null> {
  const [rows] = await db.query<[Entity[]]>(
    'SELECT *, meta::id(id) AS id FROM entity WHERE meta::id(id) = $id LIMIT 1',
    { id },
  );
  return rows?.[0] ?? null;
}

/**
 * List all entities belonging to a repo.
 */
export async function listEntitiesForRepo(db: DbClient, repo: string): Promise<Entity[]> {
  const [rows] = await db.query<[Entity[]]>(
    'SELECT *, meta::id(id) AS id FROM entity WHERE repo = $repo',
    { repo },
  );
  return rows ?? [];
}

/**
 * List entities that have no embedding yet (embedding array is empty).
 */
export async function listUnembeddedEntities(db: DbClient, repo: string): Promise<Entity[]> {
  const [rows] = await db.query<[Entity[]]>(
    'SELECT *, meta::id(id) AS id FROM entity WHERE repo = $repo AND array::len(embedding) = 0',
    { repo },
  );
  return rows ?? [];
}

/**
 * Update only the embedding field of an entity (used by the reembed job).
 */
export async function updateEmbedding(
  db: DbClient,
  id: string,
  embedding: number[],
  embeddingModel: string,
): Promise<void> {
  await db.query(
    'UPDATE $rid SET embedding = $embedding, embeddingModel = $model',
    { rid: entityRecordId(id), embedding, model: embeddingModel },
  );
}
