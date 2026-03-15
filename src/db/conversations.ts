import { Schema, Field, Utf8, Int32, Float32, FixedSizeList } from 'apache-arrow';
import type { Table } from '@lancedb/lancedb';
import type { DbClient } from './client.js';
import { loadConfig } from '../agent/config.js';

// ---------------------------------------------------------------------------
// LanceDB tables for conversation persistence.
//
// conversation_sessions — one row per closed session, retained for cross-
//   session seeding. Pruned by 30-day TTL and 20-per-repo cap.
//
// conversation_turns — persistent turn store. Turns survive session close
//   and are compacted over time via tiered compression.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Entry types and tiers for compaction
// ---------------------------------------------------------------------------

export type ConversationEntryType = 'turn' | 'directive' | 'summary' | 'merged';
export type ConversationTier = 'hot' | 'warm' | 'cold' | 'archive';

const EMBEDDING_DIM = loadConfig().models.embeddingDim;
const ZERO_VEC = new Array<number>(EMBEDDING_DIM).fill(0);

const SESSIONS_SCHEMA = new Schema([
  new Field('id',           new Utf8(), false),
  new Field('repo',         new Utf8(), false),
  new Field('summary',      new Utf8(), false),
  new Field('seenEntities', new Utf8(), false), // JSON-encoded string[]
  new Field('createdAt',    new Utf8(), false),
  new Field('expiresAt',    new Utf8(), false),
  new Field('vector', new FixedSizeList(EMBEDDING_DIM, new Field('item', new Float32(), true)), false),
]);

const TURNS_SCHEMA = new Schema([
  new Field('id',          new Utf8(),  false), // sessionId:idx
  new Field('sessionId',   new Utf8(),  false),
  new Field('idx',         new Int32(), false),
  new Field('user',        new Utf8(),  false),
  new Field('assistant',   new Utf8(),  false),
  new Field('entities',    new Utf8(),  false), // JSON-encoded string[]
  new Field('createdAt',   new Utf8(),  false),
  new Field('repo',        new Utf8(),  false), // repo path for per-repo queries
  new Field('type',        new Utf8(),  false), // 'turn' | 'directive' | 'summary' | 'merged'
  new Field('tier',        new Utf8(),  false), // 'hot' | 'warm' | 'cold' | 'archive'
  new Field('compactedAt', new Utf8(),  false), // ISO timestamp, empty if not compacted
  new Field('sourceIds',   new Utf8(),  false), // JSON string[] of merged source turn IDs
  new Field('vector', new FixedSizeList(EMBEDDING_DIM, new Field('item', new Float32(), true)), false),
]);

// ---------------------------------------------------------------------------
// Table accessors (module-level cache)
// ---------------------------------------------------------------------------

let _sessionsTable: Table | null = null;
let _turnsTable: Table | null = null;

async function getSessionsTable(db: DbClient): Promise<Table> {
  if (_sessionsTable !== null) return _sessionsTable;
  const names = await db.lance.tableNames();
  if (names.includes('conversation_sessions')) {
    _sessionsTable = await db.lance.openTable('conversation_sessions');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _sessionsTable = await (db.lance as any).createEmptyTable('conversation_sessions', SESSIONS_SCHEMA);
  }
  return _sessionsTable!;
}

async function getTurnsTable(db: DbClient): Promise<Table> {
  if (_turnsTable !== null) return _turnsTable;
  const names = await db.lance.tableNames();
  if (names.includes('conversation_turns')) {
    _turnsTable = await db.lance.openTable('conversation_turns');
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _turnsTable = await (db.lance as any).createEmptyTable('conversation_turns', TURNS_SCHEMA);
  }
  return _turnsTable!;
}

// ---------------------------------------------------------------------------
// Session record type
// ---------------------------------------------------------------------------

export interface SessionRecord {
  id: string;
  repo: string;
  summary: string;
  seenEntities: string[];
  createdAt: string;
  expiresAt: string;
  vector: number[];
}

// ---------------------------------------------------------------------------
// Turn persistence
// ---------------------------------------------------------------------------

export interface TurnRecord {
  sessionId: string;
  idx: number;
  user: string;
  assistant: string;
  entities: string[];
  vector: number[];
  repo: string;
  type?: ConversationEntryType | undefined;
  tier?: ConversationTier | undefined;
  compactedAt?: string | undefined;
  sourceIds?: string[] | undefined;
  createdAt?: string | undefined;
}

/**
 * Save a single turn to the conversation_turns table.
 * Called after each recordTurn() via daemon RPC (fire-and-forget).
 */
export async function saveTurn(db: DbClient, turn: TurnRecord): Promise<void> {
  const table = await getTurnsTable(db);
  await table.add([{
    id:          `${turn.sessionId}:${turn.idx}`,
    sessionId:   turn.sessionId,
    idx:         turn.idx,
    user:        turn.user,
    assistant:   turn.assistant,
    entities:    JSON.stringify(turn.entities),
    createdAt:   new Date().toISOString(),
    repo:        turn.repo,
    type:        turn.type ?? 'turn',
    tier:        turn.tier ?? 'hot',
    compactedAt: turn.compactedAt ?? '',
    sourceIds:   JSON.stringify(turn.sourceIds ?? []),
    vector:      turn.vector.length === EMBEDDING_DIM ? turn.vector : ZERO_VEC,
  }]);
}

// ---------------------------------------------------------------------------
// Session close — promote summary, retain raw turns
// ---------------------------------------------------------------------------

/**
 * Close a session: persist the final summary to conversation_sessions.
 * Raw turns are retained for compaction and cross-session L3b hydration.
 */
export async function closeSession(
  db: DbClient,
  session: { id: string; repo: string; summary: string; seenEntities: string[] },
  summaryVector: number[],
): Promise<void> {
  const sessionsTable = await getSessionsTable(db);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString(); // 30 days

  await sessionsTable.add([{
    id:           session.id,
    repo:         session.repo,
    summary:      session.summary,
    seenEntities: JSON.stringify(session.seenEntities),
    createdAt:    now,
    expiresAt:    expiresAt,
    vector:       summaryVector.length === EMBEDDING_DIM ? summaryVector : ZERO_VEC,
  }]);

  // Raw turns are retained — compaction manages lifecycle
}

// ---------------------------------------------------------------------------
// Cross-session seeding
// ---------------------------------------------------------------------------

/**
 * Search prior session summaries for the same repo, ordered by vector
 * similarity to the opening message embedding. Returns top-3 non-expired
 * summaries sorted by recency.
 */
export async function seedFromPrior(
  db: DbClient,
  repo: string,
  queryVector: number[],
  limit = 3,
): Promise<SessionRecord[]> {
  const table = await getSessionsTable(db);
  const now = new Date().toISOString();
  const safeRepo = repo.replace(/'/g, "''");

  try {
    const rows = await table
      .search(queryVector)
      .where(`repo = '${safeRepo}' AND expiresAt > '${now}'`)
      .limit(limit)
      .toArray();

    const records = rows.map(rowToSessionRecord);
    // Sort by recency (vector search returns by similarity)
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Deletion helpers
// ---------------------------------------------------------------------------

/** Delete all raw turns for a session. */
export async function deleteTurnsForSession(db: DbClient, sessionId: string): Promise<void> {
  const table = await getTurnsTable(db);
  const safeId = sessionId.replace(/'/g, "''");
  try {
    await table.delete(`sessionId = '${safeId}'`);
  } catch {
    // Table may be empty — ignore
  }
}

/** Delete a session summary by ID. */
export async function deleteSessionRecord(db: DbClient, sessionId: string): Promise<void> {
  const table = await getSessionsTable(db);
  const safeId = sessionId.replace(/'/g, "''");
  try {
    await table.delete(`id = '${safeId}'`);
  } catch {
    // Ignore if not found
  }
}

/** Delete all session summaries for a repo (for /forget). */
export async function deleteSessionsForRepo(db: DbClient, repo: string): Promise<void> {
  const table = await getSessionsTable(db);
  const safeRepo = repo.replace(/'/g, "''");
  try {
    await table.delete(`repo = '${safeRepo}'`);
  } catch {
    // Ignore if not found
  }
}

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

/**
 * Delete expired session summaries and enforce per-repo cap of 20.
 * Plan/PlanStep nodes are NOT affected — they live in Kuzu only.
 */
export async function pruneConversations(db: DbClient): Promise<{ expired: number; capped: number }> {
  const table = await getSessionsTable(db);
  let expired = 0;
  let capped = 0;

  // 1. Delete expired summaries
  const now = new Date().toISOString();
  try {
    const expiredRows = await table.query().where(`expiresAt < '${now}'`).select(['id']).toArray();
    expired = expiredRows.length;
    if (expired > 0) {
      await table.delete(`expiresAt < '${now}'`);
    }
  } catch {
    // Table may be empty
  }

  // 2. Cap at 20 summaries per repo
  try {
    const allSessions = await table.query().toArray();
    const byRepo = new Map<string, Array<Record<string, unknown>>>();
    for (const row of allSessions) {
      const repo = row['repo'] as string;
      if (!byRepo.has(repo)) byRepo.set(repo, []);
      byRepo.get(repo)!.push(row as Record<string, unknown>);
    }

    for (const [repo, sessions] of byRepo) {
      if (sessions.length <= 20) continue;
      sessions.sort((a, b) =>
        (b['createdAt'] as string).localeCompare(a['createdAt'] as string),
      );
      const toDelete = sessions.slice(20);
      for (const row of toDelete) {
        const safeId = (row['id'] as string).replace(/'/g, "''");
        await table.delete(`id = '${safeId}'`);
        capped++;
      }
    }
  } catch {
    // Ignore errors during cap enforcement
  }

  return { expired, capped };
}

// ---------------------------------------------------------------------------
// Turn search (for L3b hydration and compaction)
// ---------------------------------------------------------------------------

/**
 * Search turns by repo using vector similarity.
 * Returns turns ordered by relevance to the query vector.
 */
export async function searchTurnsByRepo(
  db: DbClient,
  repo: string,
  queryVector: number[],
  limit = 20,
): Promise<TurnRecord[]> {
  const table = await getTurnsTable(db);
  const safeRepo = repo.replace(/'/g, "''");

  try {
    const rows = await table
      .search(queryVector)
      .where(`repo = '${safeRepo}' AND type IN ('turn', 'directive', 'merged')`)
      .limit(limit)
      .toArray();

    return rows.map(rowToTurnRecord);
  } catch {
    return [];
  }
}

/**
 * Get all turns for a repo (for compaction). No vector search — returns all.
 */
export async function getAllTurnsForRepo(
  db: DbClient,
  repo: string,
): Promise<TurnRecord[]> {
  const table = await getTurnsTable(db);
  const safeRepo = repo.replace(/'/g, "''");

  try {
    const rows = await table.query().where(`repo = '${safeRepo}'`).toArray();
    return rows.map(rowToTurnRecord);
  } catch {
    return [];
  }
}

/**
 * Get all turns across all repos (for compaction without repo filter).
 */
export async function getAllTurns(db: DbClient): Promise<TurnRecord[]> {
  const table = await getTurnsTable(db);
  try {
    const rows = await table.query().toArray();
    return rows.map(rowToTurnRecord);
  } catch {
    return [];
  }
}

/**
 * Delete specific turns by ID.
 */
export async function deleteTurnsByIds(db: DbClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const table = await getTurnsTable(db);
  const idList = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
  try {
    await table.delete(`id IN (${idList})`);
  } catch {
    // Ignore errors
  }
}

/**
 * Add compacted turn entries (for compaction output).
 */
export async function addCompactedTurns(db: DbClient, turns: TurnRecord[]): Promise<void> {
  if (turns.length === 0) return;
  const table = await getTurnsTable(db);
  await table.add(turns.map(t => ({
    id:          `${t.sessionId}:${t.idx}`,
    sessionId:   t.sessionId,
    idx:         t.idx,
    user:        t.user,
    assistant:   t.assistant,
    entities:    JSON.stringify(t.entities),
    createdAt:   new Date().toISOString(),
    repo:        t.repo,
    type:        t.type ?? 'merged',
    tier:        t.tier ?? 'cold',
    compactedAt: new Date().toISOString(),
    sourceIds:   JSON.stringify(t.sourceIds ?? []),
    vector:      t.vector.length === EMBEDDING_DIM ? t.vector : ZERO_VEC,
  })));
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export interface ConversationStats {
  totalTurns: number;
  byType: Record<string, number>;
  byTier: Record<string, number>;
  byRepo: Record<string, number>;
  sessions: number;
}

/**
 * Get conversation storage statistics for monitoring.
 */
export async function getConversationStats(
  db: DbClient,
  repo?: string,
): Promise<ConversationStats> {
  const turns = repo ? await getAllTurnsForRepo(db, repo) : await getAllTurns(db);

  const byType: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  const byRepo: Record<string, number> = {};

  for (const t of turns) {
    const type = t.type ?? 'turn';
    const tier = t.tier ?? 'hot';
    byType[type] = (byType[type] ?? 0) + 1;
    byTier[tier] = (byTier[tier] ?? 0) + 1;
    byRepo[t.repo] = (byRepo[t.repo] ?? 0) + 1;
  }

  const sessionsTable = await getSessionsTable(db);
  let sessions = 0;
  try {
    const allSessions = await sessionsTable.query().toArray();
    sessions = repo
      ? allSessions.filter(s => (s['repo'] as string) === repo).length
      : allSessions.length;
  } catch { /* ignore */ }

  return { totalTurns: turns.length, byType, byTier, byRepo, sessions };
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToTurnRecord(row: Record<string, unknown>): TurnRecord {
  let entities: string[] = [];
  try {
    const raw = row['entities'] as string;
    if (raw) entities = JSON.parse(raw) as string[];
  } catch { /* ignore */ }

  let sourceIds: string[] = [];
  try {
    const raw = row['sourceIds'] as string;
    if (raw) sourceIds = JSON.parse(raw) as string[];
  } catch { /* ignore */ }

  return {
    sessionId:   (row['sessionId']   as string) ?? '',
    idx:         (row['idx']         as number) ?? 0,
    user:        (row['user']        as string) ?? '',
    assistant:   (row['assistant']   as string) ?? '',
    entities,
    vector:      (row['vector']      as number[]) ?? [],
    repo:        (row['repo']        as string) ?? '',
    type:        ((row['type']       as string) ?? 'turn') as ConversationEntryType,
    tier:        ((row['tier']       as string) ?? 'hot') as ConversationTier,
    compactedAt: (row['compactedAt'] as string) ?? '',
    sourceIds,
    createdAt:   (row['createdAt']   as string) ?? '',
  };
}

function rowToSessionRecord(row: Record<string, unknown>): SessionRecord {
  let seenEntities: string[] = [];
  try {
    const raw = row['seenEntities'] as string;
    if (raw) seenEntities = JSON.parse(raw) as string[];
  } catch { /* ignore */ }

  return {
    id:           row['id']        as string,
    repo:         row['repo']      as string,
    summary:      row['summary']   as string,
    seenEntities,
    createdAt:    row['createdAt'] as string,
    expiresAt:    row['expiresAt'] as string,
    vector:       (row['vector']   as number[]) ?? [],
  };
}

/** Reset module-level table caches (for testing). */
export function resetTableCaches(): void {
  _sessionsTable = null;
  _turnsTable = null;
}
