import { Schema, Field, Utf8, Int32, Bool, Float32, FixedSizeList } from 'apache-arrow';
import type { Table } from '@lancedb/lancedb';
import type { DbClient } from './client.js';
import type { Entity, EntityKind, Language } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Apache Arrow schema for the LanceDB 'entities' table.
// All fields are non-nullable — avoids Bool null-bitmap bugs and type-
// inference failures on first insert. Empty string '' is the sentinel for
// optional Utf8 fields that are absent; false for optional booleans.
// ---------------------------------------------------------------------------
const ENTITIES_SCHEMA = new Schema([
  new Field('id',             new Utf8(),   false),
  new Field('kind',           new Utf8(),   false),
  new Field('name',           new Utf8(),   false),
  new Field('language',       new Utf8(),   false),
  new Field('repo',           new Utf8(),   false),
  new Field('file',           new Utf8(),   false),
  new Field('startLine',      new Int32(),  false),
  new Field('endLine',        new Int32(),  false),
  new Field('body',           new Utf8(),   false),
  new Field('indexedAt',      new Utf8(),   false),
  new Field('embeddingModel', new Utf8(),   false),
  new Field('isExported',     new Bool(),   false),
  new Field('isAsync',        new Bool(),   false),
  new Field('isAbstract',     new Bool(),   false),
  new Field('signature',      new Utf8(),   false),
  new Field('hash',           new Utf8(),   false),
  new Field('rootPath',       new Utf8(),   false),
  new Field('vector', new FixedSizeList(2048, new Field('item', new Float32(), true)), false),
]);

// Module-level cache — re-used across calls within the same daemon process
let _table: Table | null = null;

async function getEntitiesTable(db: DbClient): Promise<Table | null> {
  if (_table !== null) return _table;
  const names = await db.lance.tableNames();
  if (!names.includes('entities')) return null;
  _table = await db.lance.openTable('entities');
  return _table;
}

/** Helper: run a Kuzu query (with optional params) and return all rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function kuzuExec(db: DbClient, stmt: string, params?: any): Promise<Record<string, unknown>[]> {
  let result;
  if (params) {
    const prepared = await db.graph.prepare(stmt);
    result = await db.graph.execute(prepared, params);
  } else {
    result = await db.graph.query(stmt);
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const qr = Array.isArray(result) ? result[0]! : result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (qr as any).getAll() as Promise<Record<string, unknown>[]>;
}

// ---------------------------------------------------------------------------
// Row ↔ Entity mapping
// ---------------------------------------------------------------------------

const ZERO_VEC = new Array<number>(2048).fill(0);

function entityToRow(entity: Entity): Record<string, unknown> {
  return {
    id:             entity.id,
    kind:           entity.kind,
    name:           entity.name,
    language:       entity.language,
    repo:           entity.repo,
    file:           entity.file,
    startLine:      entity.startLine,
    endLine:        entity.endLine,
    body:           entity.body,
    indexedAt:      entity.indexedAt,
    embeddingModel: entity.embeddingModel ?? '',
    // Non-nullable with sentinels: false / '' for absent optional fields
    isExported:     entity.isExported  ?? false,
    isAsync:        entity.isAsync     ?? false,
    isAbstract:     entity.isAbstract  ?? false,
    signature:      entity.signature   ?? '',
    hash:           entity.hash        ?? '',
    rootPath:       entity.rootPath    ?? '',
    // Use provided embedding if 2048-dim, otherwise store zero vector as sentinel
    vector:         entity.embedding.length === 2048 ? entity.embedding : ZERO_VEC,
  };
}

function rowToEntity(row: Record<string, unknown>): Entity {
  const entity: Entity = {
    id:        row['id']        as string,
    kind:      row['kind']      as EntityKind,
    name:      row['name']      as string,
    language:  row['language']  as Language,
    repo:      row['repo']      as string,
    file:      row['file']      as string,
    startLine: row['startLine'] as number,
    endLine:   row['endLine']   as number,
    body:      row['body']      as string,
    indexedAt: row['indexedAt'] as string,
    embedding: (row['vector']   as number[]) ?? [],
  };
  // Optional fields — '' / false are sentinels for "not set"
  const em = row['embeddingModel'] as string;  if (em)           entity.embeddingModel = em;
  if (row['isExported'] === true)  entity.isExported  = true;
  if (row['isAsync']    === true)  entity.isAsync     = true;
  if (row['isAbstract'] === true)  entity.isAbstract  = true;
  const sg = row['signature'] as string;       if (sg)           entity.signature      = sg;
  const hh = row['hash']      as string;       if (hh)           entity.hash           = hh;
  const rp = row['rootPath']  as string;       if (rp)           entity.rootPath       = rp;
  return entity;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a batch of entities into LanceDB and create corresponding Kuzu
 * Entity stub nodes for graph traversal.
 * The indexer pre-deletes file entities before calling this, so add() suffices.
 */
export async function upsertEntities(db: DbClient, entities: Entity[]): Promise<void> {
  if (entities.length === 0) return;
  const rows = entities.map(entityToRow);

  // Create table with explicit schema on first use, or append to existing
  let table = await getEntitiesTable(db);
  if (table === null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _table = await (db.lance as any).createEmptyTable('entities', ENTITIES_SCHEMA);
    table = _table!;
  }
  await table.add(rows);

  // Create lightweight Entity stubs in Kuzu for graph edge endpoints
  for (const e of entities) {
    await kuzuExec(db, 'MERGE (n:Entity {id: $id}) SET n.kind = $kind', { id: e.id, kind: e.kind });
  }
}

/**
 * Delete all entity records whose `file` field matches the given path.
 * Also DETACH DELETEs the corresponding Kuzu stubs (removes connected edges too).
 */
export async function deleteEntitiesForFile(db: DbClient, filePath: string): Promise<void> {
  const table = await getEntitiesTable(db);
  if (table === null) return;

  const safeFile = filePath.replace(/'/g, "''");
  const rows = await table.query().where(`file = '${safeFile}'`).select(['id']).toArray();
  await table.delete(`file = '${safeFile}'`);

  for (const row of rows) {
    await kuzuExec(db, 'MATCH (n:Entity {id: $id}) DETACH DELETE n', { id: row['id'] as string });
  }
}

/**
 * Delete all entity records belonging to a repo.
 */
export async function deleteEntitiesForRepo(db: DbClient, repo: string): Promise<void> {
  const table = await getEntitiesTable(db);
  if (table === null) return;

  const safeRepo = repo.replace(/'/g, "''");
  const rows = await table.query().where(`repo = '${safeRepo}'`).select(['id']).toArray();
  await table.delete(`repo = '${safeRepo}'`);

  for (const row of rows) {
    await kuzuExec(db, 'MATCH (n:Entity {id: $id}) DETACH DELETE n', { id: row['id'] as string });
  }
}

/**
 * Fetch a single entity by its stable ID. Returns null if not found.
 */
export async function getEntity(db: DbClient, id: string): Promise<Entity | null> {
  const table = await getEntitiesTable(db);
  if (table === null) return null;
  const safeId = id.replace(/'/g, "''");
  const rows = await table.query().where(`id = '${safeId}'`).limit(1).toArray();
  return rows[0] ? rowToEntity(rows[0] as Record<string, unknown>) : null;
}

/**
 * List all entities belonging to a repo.
 */
export async function listEntitiesForRepo(db: DbClient, repo: string): Promise<Entity[]> {
  const table = await getEntitiesTable(db);
  if (table === null) return [];
  const safeRepo = repo.replace(/'/g, "''");
  const rows = await table.query().where(`repo = '${safeRepo}'`).toArray();
  return rows.map(r => rowToEntity(r as Record<string, unknown>));
}

/**
 * List entities not yet embedded (embeddingModel = '' sentinel).
 */
export async function listUnembeddedEntities(db: DbClient, repo: string): Promise<Entity[]> {
  const table = await getEntitiesTable(db);
  if (table === null) return [];
  const safeRepo = repo.replace(/'/g, "''");
  const rows = await table.query()
    .where(`repo = '${safeRepo}' AND embeddingModel = ''`)
    .toArray();
  return rows.map(r => rowToEntity(r as Record<string, unknown>));
}

/**
 * Update the embedding vector and model name for an entity (used by the reembed job).
 */
export async function updateEmbedding(
  db: DbClient,
  id: string,
  embedding: number[],
  embeddingModel: string,
): Promise<void> {
  const table = await getEntitiesTable(db);
  if (table === null) return;
  const safeId = id.replace(/'/g, "''");
  const rows = await table.query().where(`id = '${safeId}'`).limit(1).toArray();
  if (rows.length === 0) return;

  const updated = { ...(rows[0] as Record<string, unknown>), vector: embedding, embeddingModel };
  await table.delete(`id = '${safeId}'`);
  await table.add([updated]);
}
