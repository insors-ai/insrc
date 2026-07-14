/**
 * LMDB-backed config-entry store.
 *
 * Phase 2.8 of plans/storage-migration-lmdb-lance.md. Public surface
 * preserved verbatim from the prior DuckDB-backed implementation: the
 * `ConfigStore` class with `upsertEntry / deleteEntry / deleteByScope /
 * getEntry / listEntries / vectorSearch`. Constructor still takes a
 * `db: DbClient` arg; it's kept as vestigial back-compat (the new
 * implementation routes through the LMDB module singleton).
 *
 * @deprecated since 2026-06-17. The memory substrate's per-owner typed
 * memory store (`daemon/substrate/memory-store.ts`) is the canonical storage
 * for preferences and learned facts. See
 * [`design/memory-context.html`](../../../design/memory-context.html).
 *
 * Storage:
 *   - `config_entry` sub-DB: utf8 entry_id -> msgpack(ConfigEntryRow)
 *   - `config_by_scope` sub-DB: dupsort secondary index keyed by
 *     (utf8 scope, \0, utf8 namespace, \0, utf8 category, \0, utf8 entry_id)
 *     -> empty. Hierarchical prefix scans (scope only, scope+namespace,
 *     scope+namespace+category) supported.
 *
 * Embedding storage is **deferred to Phase 3.4** -- `vectorSearch`
 * returns [] until Phase 3.4 wires LanceDB ANN. Reads return
 * `embedding: []` on the deserialized record. `upsertEntry` accepts
 * the embedding parameter but doesn't persist it.
 */

import type {
	ConfigEntry,
	ConfigNamespace,
	Language,
} from '../shared/types.js';
import {
	getGraphStore,
	withWriteTxn,
	type GraphStore,
} from '../db/graph/store.js';
import {
	encodeConfigByScopeKey,
	encodeConfigByScopePrefix,
	prefixSuccessor,
} from '../db/graph/keys.js';
import {
	decodeConfigEntryRow,
	encodeConfigEntryRow,
	type ConfigEntryRow,
} from '../db/graph/codec.js';
import { formatScope, parseScope } from './paths.js';

type DbClient = unknown;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function entryToRow(entry: ConfigEntry): ConfigEntryRow {
	return {
		id:          entry.id,
		scope:       formatScope(entry.scope),
		namespace:   entry.namespace,
		category:    entry.category,
		language:    entry.language,
		name:        entry.name,
		filePath:    entry.filePath,
		body:        entry.body,
		tags:        [...entry.tags],
		updatedAt:   parseTs(entry.updatedAt),
		contentHash: entry.contentHash,
	};
}

function rowToEntry(row: ConfigEntryRow): ConfigEntry {
	return {
		id:          row.id,
		scope:       parseScope(row.scope),
		namespace:   row.namespace as ConfigNamespace,
		category:    row.category,
		language:    row.language as Language | 'all',
		name:        row.name,
		filePath:    row.filePath,
		body:        row.body,
		tags:        row.tags,
		updatedAt:   formatTs(row.updatedAt),
		contentHash: row.contentHash,
		// Embedding lives in LanceDB; Phase 3.4 wires the read path
		embedding:   [],
	};
}

function parseTs(s: string | undefined): number {
	if (s === undefined || s === '') return 0;
	const n = Date.parse(s);
	return Number.isFinite(n) ? n : 0;
}

function formatTs(ms: number): string {
	if (ms === 0) return '';
	return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// ConfigStore class (surface preserved)
// ---------------------------------------------------------------------------

export class ConfigStore {
	constructor(_db: DbClient) {
		// `db` retained for caller back-compat; unused. The LMDB
		// substrate is opened lazily by `db/graph/store.ts`.
		void _db;
	}

	async upsertEntry(entry: ConfigEntry): Promise<void> {
		const row = entryToRow(entry);
		await withWriteTxn(s => {
			// Read prior row (if any) so we can clean up the by-scope index
			// when scope/namespace/category change.
			const prevBuf = s.configEntry.get(entry.id);
			if (prevBuf !== undefined) {
				const prev = decodeConfigEntryRow(prevBuf as Buffer);
				if (prev.scope !== row.scope
				 || prev.namespace !== row.namespace
				 || prev.category !== row.category) {
					s.configByScope.remove(
						encodeConfigByScopeKey(prev.scope, prev.namespace, prev.category, prev.id),
						Buffer.alloc(0),
					);
				}
			}
			s.configEntry.put(entry.id, encodeConfigEntryRow(row));
			s.configByScope.put(
				encodeConfigByScopeKey(row.scope, row.namespace, row.category, row.id),
				Buffer.alloc(0),
			);
		});
		// Phase 3.4: persist embedding to Lance after the LMDB commit
		if (entry.embedding.length > 0) {
			const { writeConfigEmbedding } = await import('../db/lance/config-vec.js');
			await writeConfigEmbedding({
				id:        entry.id,
				embedding: new Float32Array(entry.embedding),
				scope:     row.scope,
				namespace: row.namespace,
				category:  row.category,
				language:  row.language,
			});
		}
	}

	async deleteEntry(id: string): Promise<void> {
		await withWriteTxn(s => {
			const buf = s.configEntry.get(id);
			if (buf === undefined) return;
			const row = decodeConfigEntryRow(buf as Buffer);
			s.configByScope.remove(
				encodeConfigByScopeKey(row.scope, row.namespace, row.category, row.id),
				Buffer.alloc(0),
			);
			s.configEntry.remove(id);
		});
		// Phase 3.4 cascade: drop the Lance row
		const { deleteConfigVec } = await import('../db/lance/config-vec.js');
		await deleteConfigVec(id);
	}

	async deleteByScope(scope: string): Promise<void> {
		const store = await getGraphStore();
		// Walk the by_scope index for this scope to find affected ids
		const prefix = encodeConfigByScopePrefix(scope);
		const succ = prefixSuccessor(prefix);
		const ids: string[] = [];
		for (const { key } of store.configByScope.getRange({ start: prefix, end: succ })) {
			const k = key as Buffer;
			// key shape: scope \0 namespace \0 category \0 entry_id
			// Find the last \0 separator -- everything after is entry_id.
			const lastSep = k.lastIndexOf(0);
			if (lastSep < 0) continue;
			ids.push(k.subarray(lastSep + 1).toString('utf8'));
		}
		if (ids.length === 0) return;
		await withWriteTxn(s => {
			for (const id of ids) {
				const buf = s.configEntry.get(id);
				if (buf === undefined) continue;
				const row = decodeConfigEntryRow(buf as Buffer);
				s.configByScope.remove(
					encodeConfigByScopeKey(row.scope, row.namespace, row.category, row.id),
					Buffer.alloc(0),
				);
				s.configEntry.remove(id);
			}
		});
		// Phase 3.4 cascade: bulk-drop the Lance rows for this scope
		const { deleteConfigVecsForScope } = await import('../db/lance/config-vec.js');
		await deleteConfigVecsForScope(scope);
	}

	async getEntry(id: string): Promise<ConfigEntry | null> {
		const store = await getGraphStore();
		const buf = store.configEntry.get(id);
		if (buf === undefined) return null;
		return rowToEntry(decodeConfigEntryRow(buf as Buffer));
	}

	async listEntries(opts?: {
		namespace?: string | undefined;
		category?: string | undefined;
		scope?: string | undefined;
	}): Promise<ConfigEntry[]> {
		const store = await getGraphStore();
		const wantNs = opts?.namespace !== undefined ? opts.namespace : null;
		const wantCat = opts?.category !== undefined ? opts.category : null;
		const wantScope = opts?.scope !== undefined ? opts.scope : null;

		// If scope is provided, use the by_scope index for an O(matches)
		// scan rather than a full table scan.
		if (wantScope !== null) {
			return await listViaScopeIndex(store, wantScope, wantNs, wantCat);
		}

		// No scope filter: full scan with in-memory filtering. Acceptable
		// at typical scale (hundreds of entries).
		const out: ConfigEntry[] = [];
		for (const { value } of store.configEntry.getRange()) {
			const row = decodeConfigEntryRow(value as Buffer);
			if (wantNs !== null && row.namespace !== wantNs) continue;
			if (wantCat !== null && row.category !== wantCat) continue;
			out.push(rowToEntry(row));
		}
		return out;
	}

	async vectorSearch(
		queryVec: number[],
		where?: string | undefined,
		limit = 10,
	): Promise<Array<{ entry: ConfigEntry; distance: number }>> {
		if (queryVec.length === 0) return [];
		let hits;
		try {
			const { searchConfigVecs } = await import('../db/lance/config-vec.js');
			hits = await searchConfigVecs(queryVec, where, limit);
		} catch {
			// Match the prior DuckDB-era behaviour: silently return [] when
			// the vector store rejects the query (dim mismatch / bad
			// where syntax / etc.).
			return [];
		}
		if (hits.length === 0) return [];
		const store = await getGraphStore();
		const out: Array<{ entry: ConfigEntry; distance: number }> = [];
		for (const h of hits) {
			const buf = store.configEntry.get(h.id);
			if (buf === undefined) continue;
			const row = decodeConfigEntryRow(buf as Buffer);
			out.push({ entry: rowToEntry(row), distance: h.distance });
		}
		return out;
	}
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function listViaScopeIndex(
	store: GraphStore,
	scope: string,
	namespace: string | null,
	category: string | null,
): Promise<ConfigEntry[]> {
	// Build the most-specific prefix we can given the optional filters.
	let prefix: Buffer;
	if (namespace !== null && category !== null) {
		prefix = encodeConfigByScopePrefix(scope, namespace, category);
	} else if (namespace !== null) {
		prefix = encodeConfigByScopePrefix(scope, namespace);
	} else {
		prefix = encodeConfigByScopePrefix(scope);
	}
	const succ = prefixSuccessor(prefix);

	const ids: string[] = [];
	for (const { key } of store.configByScope.getRange({ start: prefix, end: succ })) {
		const k = key as Buffer;
		const lastSep = k.lastIndexOf(0);
		if (lastSep < 0) continue;
		ids.push(k.subarray(lastSep + 1).toString('utf8'));
	}

	const out: ConfigEntry[] = [];
	for (const id of ids) {
		const buf = store.configEntry.get(id);
		if (buf === undefined) continue;
		const row = decodeConfigEntryRow(buf as Buffer);
		// In-memory secondary filtering covers the case where the prefix
		// captured more than the user asked for (e.g. namespace given
		// but category absent -> prefix matches all categories under
		// that namespace, which is what we want anyway).
		if (namespace !== null && row.namespace !== namespace) continue;
		if (category  !== null && row.category  !== category)  continue;
		out.push(rowToEntry(row));
	}
	return out;
}
