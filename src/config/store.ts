/**
 * Config vector store — LanceDB wrapper for config entries.
 *
 * Uses a separate LanceDB database at ~/.insrc/config-store/,
 * isolated from the code entity store at ~/.insrc/lance/.
 *
 * Follows the same patterns as src/db/entities.ts:
 * - Apache Arrow schema with all non-nullable fields
 * - Sentinel values for absent optional fields
 * - Module-level table cache
 */

import { Schema, Field, Utf8, Float32, FixedSizeList } from 'apache-arrow';
import type { Connection, Table } from '@lancedb/lancedb';
import type {
  ConfigCategory,
  ConfigEntry,
  ConfigNamespace,
  ConfigScope,
  Language,
} from '../shared/types.js';
import { loadConfig } from '../agent/config.js';
import { formatScope, parseScope } from './paths.js';

const { embeddingDim: EMBEDDING_DIM } = loadConfig().models;

// ---------------------------------------------------------------------------
// Apache Arrow schema for the 'config_entries' table
// ---------------------------------------------------------------------------

const CONFIG_SCHEMA = new Schema([
  new Field('id',          new Utf8(), false),
  new Field('scope',       new Utf8(), false),   // formatted: 'global' or 'project:<path>'
  new Field('namespace',   new Utf8(), false),
  new Field('category',    new Utf8(), false),
  new Field('language',    new Utf8(), false),
  new Field('name',        new Utf8(), false),
  new Field('filePath',    new Utf8(), false),
  new Field('body',        new Utf8(), false),
  new Field('tags',        new Utf8(), false),   // comma-separated
  new Field('updatedAt',   new Utf8(), false),
  new Field('contentHash', new Utf8(), false),
  new Field('vector', new FixedSizeList(EMBEDDING_DIM, new Field('item', new Float32(), true)), false),
]);

const TABLE_NAME = 'config_entries';
const ZERO_VEC = new Array<number>(EMBEDDING_DIM).fill(0);

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function configEntryToRow(entry: ConfigEntry): Record<string, unknown> {
  return {
    id:          entry.id,
    scope:       formatScope(entry.scope),
    namespace:   entry.namespace,
    category:    entry.category,
    language:    entry.language,
    name:        entry.name,
    filePath:    entry.filePath,
    body:        entry.body,
    tags:        entry.tags.join(','),
    updatedAt:   entry.updatedAt,
    contentHash: entry.contentHash,
    vector:      entry.embedding.length === EMBEDDING_DIM ? entry.embedding : ZERO_VEC,
  };
}

function rowToConfigEntry(row: Record<string, unknown>): ConfigEntry {
  const tagsRaw = row['tags'] as string;
  return {
    id:          row['id']          as string,
    scope:       parseScope(row['scope'] as string),
    namespace:   row['namespace']   as ConfigNamespace,
    category:    row['category']    as ConfigCategory,
    language:    row['language']    as Language | 'all',
    name:        row['name']        as string,
    filePath:    row['filePath']    as string,
    body:        row['body']        as string,
    tags:        tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [],
    updatedAt:   row['updatedAt']   as string,
    contentHash: row['contentHash'] as string,
    embedding:   (row['vector']     as number[]) ?? [],
  };
}

// ---------------------------------------------------------------------------
// ConfigStore class
// ---------------------------------------------------------------------------

export class ConfigStore {
  private _lance: Connection;
  private _table: Table | null = null;

  constructor(lance: Connection) {
    this._lance = lance;
  }

  /** Get or open the config entries table. Returns null if table doesn't exist. */
  private async getTable(): Promise<Table | null> {
    if (this._table !== null) return this._table;
    const names = await this._lance.tableNames();
    if (!names.includes(TABLE_NAME)) return null;
    this._table = await this._lance.openTable(TABLE_NAME);
    return this._table;
  }

  /** Ensure the table exists, creating it if needed. */
  private async ensureTable(): Promise<Table> {
    let table = await this.getTable();
    if (table === null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._table = await (this._lance as any).createEmptyTable(TABLE_NAME, CONFIG_SCHEMA);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      table = this._table!;
    }
    return table;
  }

  /** Upsert a config entry (delete existing by id, then add). */
  async upsertEntry(entry: ConfigEntry): Promise<void> {
    const table = await this.ensureTable();
    const safeId = entry.id.replace(/'/g, "''");
    try {
      await table.delete(`id = '${safeId}'`);
    } catch {
      // Table may be empty — ignore delete errors
    }
    await table.add([configEntryToRow(entry)]);
  }

  /** Delete a config entry by id. */
  async deleteEntry(id: string): Promise<void> {
    const table = await this.getTable();
    if (table === null) return;
    const safeId = id.replace(/'/g, "''");
    await table.delete(`id = '${safeId}'`);
  }

  /** Delete all entries matching a scope string (e.g. 'global' or 'project:/path'). */
  async deleteByScope(scope: string): Promise<void> {
    const table = await this.getTable();
    if (table === null) return;
    const safeScope = scope.replace(/'/g, "''");
    await table.delete(`scope = '${safeScope}'`);
  }

  /** Fetch a single entry by id. */
  async getEntry(id: string): Promise<ConfigEntry | null> {
    const table = await this.getTable();
    if (table === null) return null;
    const safeId = id.replace(/'/g, "''");
    const rows = await table.query().where(`id = '${safeId}'`).limit(1).toArray();
    return rows[0] ? rowToConfigEntry(rows[0] as Record<string, unknown>) : null;
  }

  /** List entries with optional filters. */
  async listEntries(opts?: {
    namespace?: string | undefined;
    category?: string | undefined;
    scope?: string | undefined;
  }): Promise<ConfigEntry[]> {
    const table = await this.getTable();
    if (table === null) return [];

    const conditions: string[] = [];
    if (opts?.namespace) {
      const safe = opts.namespace.replace(/'/g, "''");
      conditions.push(`namespace = '${safe}'`);
    }
    if (opts?.category) {
      const safe = opts.category.replace(/'/g, "''");
      conditions.push(`category = '${safe}'`);
    }
    if (opts?.scope) {
      const safe = opts.scope.replace(/'/g, "''");
      conditions.push(`scope = '${safe}'`);
    }

    let query = table.query();
    if (conditions.length > 0) {
      query = query.where(conditions.join(' AND '));
    }

    const rows = await query.toArray();
    return rows.map(r => rowToConfigEntry(r as Record<string, unknown>));
  }

  /**
   * Vector search on config entries.
   * Returns raw rows with distance — caller handles ranking/boosting.
   */
  async vectorSearch(
    queryVec: number[],
    where?: string | undefined,
    limit = 10,
  ): Promise<Array<{ entry: ConfigEntry; distance: number }>> {
    if (queryVec.length === 0) return [];

    const table = await this.getTable();
    if (table === null) return [];

    let search = table.vectorSearch(queryVec).distanceType('cosine').limit(limit);
    if (where) {
      search = search.where(where);
    }

    const rows = await search.toArray();
    return rows.map(r => ({
      entry: rowToConfigEntry(r as Record<string, unknown>),
      distance: (r as Record<string, unknown>)['_distance'] as number,
    }));
  }
}
