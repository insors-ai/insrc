/**
 * LMDB env + sub-DB scaffolding for the storage layer.
 *
 * Phase 1.1 of plans/storage-migration-lmdb-lance.md. This file owns
 * the env lifecycle (open/close), exposes typed handles for each of
 * the 19 sub-DBs, and provides minimal txn helpers. ID allocation is
 * 1.2 (separate file); typed record codecs are 1.3; test path injection
 * is 1.4; durability/operational config polish is 1.5.
 *
 * Substrate: lmdb-js 3.5.4 (pinned in Phase 0.1).
 *
 * Sub-DB layout (per design doc graph-storage-lmdb.md "Sub-DB layout"):
 *
 *   Graph (10):
 *     meta                         utf8 string  -> mixed (schema_version, ID counters)
 *     repo                         u32 BE       -> msgpack(Repo)
 *     entity                       u64 BE       -> msgpack(Entity)
 *     entity_id_by_string          utf8         -> u64 entity_id      (forward)
 *     entity_string_by_u64         u64 BE       -> utf8 entity id     (reverse, schema_version >= 2)
 *     name_index                   (u32+u8+utf8) -> dupsort u64 entity_id  (multi-valued; multiple entities can share (repo, kind, name) -- e.g. functions of the same name in different files. Populated since schema_version 2)
 *     out_edge                     (u64+u8+u64) -> msgpack(EdgeProps) | empty
 *     in_edge                      (u64+u8+u64) -> empty
 *     unresolved                   u64 BE       -> msgpack(UnresolvedRelation)
 *     unresolved_by_file           (u32+utf8)   -> dupsort u64 unresolved_id
 *
 *   Plans (2):
 *     plan                         utf8         -> msgpack(Plan)
 *     plan_step                    (utf8+\0+u32) -> msgpack(PlanStep)
 *
 *   Conversations (3):
 *     conversation_session         utf8         -> msgpack(SessionRow)
 *     conversation_turn            (utf8+\0+u32) -> msgpack(TurnRow)
 *     conversation_turn_by_repo    (utf8+\0+utf8) -> dupsort empty
 *
 *   Todos (4):
 *     todo_list                    utf8         -> msgpack(TodoList)
 *     todo_list_by_session         (utf8+\0+utf8) -> dupsort empty
 *     todo_item                    (utf8+\0+utf8+\0+utf8) -> msgpack(TodoItem)
 *     todo_comment                 (utf8+\0+utf8) -> msgpack(TodoComment)
 *
 *   Config (2):
 *     config_entry                 utf8         -> msgpack(ConfigEntry)
 *     config_by_scope              (utf8+\0+utf8+\0+utf8+\0+utf8) -> dupsort empty
 *
 * Lifecycle: lazy-init module singleton, daemon-lifetime. First call
 * to `getGraphStore()` opens the env and all sub-DBs. Concurrent
 * first-callers share the same init promise.
 *
 * NOT for callers outside the graph layer. Public surface lives in
 * `db/graph/{entities,edges,traversal,bulk}.ts` (Phase 2.x).
 */

import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

import { open, type Database, type RootDatabase } from 'lmdb';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';

const log = getLogger('graph-store');

// ---------------------------------------------------------------------------
// Env config (per design doc "Durability, recovery, and operational handling")
// ---------------------------------------------------------------------------

/**
 * Maximum env size (`mapsize`). Set generously: LMDB files are sparse
 * on disk, the OS handles VM range allocation cheaply on 64-bit. 1 TiB
 * gives indefinite headroom; raised at env open and not growable
 * mid-process. Override via `INSRC_LMDB_MAPSIZE_GIB` for tests / CI.
 */
const DEFAULT_MAPSIZE_GIB = 1024;

/**
 * Number of named sub-DBs the env can hold. We have 21 in
 * schema_version 2 (added entity_string_by_u64); pad to 32 for
 * future additions without an env-level migration.
 */
const MAX_DBS = 32;

// LMDB key size: lmdb-js builds the underlying LMDB C library with
// `MDB_MAXKEYSIZE=0` (compile-time unlimited). Keys can run up to
// ~8000 bytes. Our key shapes are well under this -- name_index is
// the longest at (u32 + u8 + utf8 name); long Java FQNs fit easily.

/**
 * Schema version stored under `meta.schema_version`. Bumped only when
 * the on-disk wire format changes in a non-additive way (e.g. an enum
 * slot is removed or repurposed). Adding a new sub-DB or a new field
 * to a record value is additive and does NOT bump the version.
 *
 * Pre-flight policy at env-open:
 *   stored == expected -> proceed
 *   stored <  expected -> run forward migration (none yet at v1)
 *   stored >  expected -> hard-fail (newer daemon wrote it; never
 *                         silently downgrade)
 *   missing            -> first boot; write the version
 */
/**
 * Version history:
 *   v1 -- initial LMDB substrate.
 *   v2 -- added derived indices populated on writes:
 *         - `entity_string_by_u64` (reverse u64→string lookup,
 *            replaces O(N) cursor scan in lookups)
 *         - `name_index` populated (was opened in v1 but never
 *            written; replaces O(N) entity-table scan in
 *            findEntitiesByName)
 *         The forward sub-DBs (entity / entity_id_by_string)
 *         remain authoritative; the reverse + name indices are
 *         derived and rebuilt by the v1→v2 migration on existing
 *         envs.
 *   v3 -- repo-registry strict contract
 *         (plans/repo-registry-strict-contract.md):
 *         - RepoRow gains a `kind: RepoKind` discriminator
 *           ('workspace' | 'shared-modules') and an optional
 *           `namespace: SharedModulesNamespace` field for
 *           shared-modules rows.
 *         - Shared-modules reserved registry rows are pre-allocated
 *           at fixed reserved IDs at the top of u32 space (see
 *           SHARED_MODULES_REPO_ID).
 *         - The v2 → v3 forward migration provisions the reserved
 *           rows, rewires existing module entities (kind='module')
 *           to point at the matching namespace row, drops phantom
 *           workspace rows whose path is empty / banned / non-
 *           existent, and bumps the version.
 */
export const SCHEMA_VERSION = 3;

const META_SCHEMA_VERSION = 'schema_version';

// ---------------------------------------------------------------------------
// Custom error classes for env-open failure paths
// ---------------------------------------------------------------------------

export class LmdbStoreError extends Error {
	constructor(message: string, override readonly cause?: unknown) {
		super(message);
		this.name = 'LmdbStoreError';
	}
}

export class LmdbStoreLockConflict extends LmdbStoreError {
	constructor(path: string, cause?: unknown) {
		super(
			`LMDB env at '${path}' is locked by another process. ` +
			`Stop the running daemon (or remove the lock if it crashed) ` +
			`before retrying.`,
			cause,
		);
		this.name = 'LmdbStoreLockConflict';
	}
}

export class LmdbStoreCorrupted extends LmdbStoreError {
	constructor(path: string, cause?: unknown) {
		super(
			`LMDB env at '${path}' appears corrupted (both meta pages ` +
			`invalid). Restore from backup or delete the file to ` +
			`re-index from source. Never auto-rebuild -- the user must ` +
			`acknowledge data loss.`,
			cause,
		);
		this.name = 'LmdbStoreCorrupted';
	}
}

export class LmdbStoreMapsizeTooSmall extends LmdbStoreError {
	constructor(path: string, requestedGiB: number, cause?: unknown) {
		super(
			`LMDB env at '${path}' is larger than the requested mapsize ` +
			`(${requestedGiB} GiB). Re-open with INSRC_LMDB_MAPSIZE_GIB ` +
			`set to at least the existing file size.`,
			cause,
		);
		this.name = 'LmdbStoreMapsizeTooSmall';
	}
}

export class LmdbStoreSchemaVersionMismatch extends LmdbStoreError {
	constructor(stored: number, expected: number) {
		super(
			`LMDB graph store was written by a newer daemon ` +
			`(schema_version ${stored}) than this one expects ` +
			`(${expected}). Upgrade the daemon, or downgrade by ` +
			`wiping the env and re-indexing -- never silently downgrade.`,
		);
		this.name = 'LmdbStoreSchemaVersionMismatch';
	}
}

// ---------------------------------------------------------------------------
// Sub-DB shape definitions
// ---------------------------------------------------------------------------

/**
 * Generic Database type without narrowing key/value generics. We rely
 * on the helpers in `keys.ts` for key encoding and on call-site value
 * codecs (msgpack) for value shape; lmdb-js will faithfully store and
 * retrieve raw Buffers.
 */
type AnyDb = Database;

export interface GraphStore {
	root: RootDatabase;

	// Graph
	meta:                AnyDb;
	repo:                AnyDb;
	entity:              AnyDb;
	entityIdByString:    AnyDb;
	entityStringByU64:   AnyDb;
	nameIndex:           AnyDb;
	outEdge:             AnyDb;
	inEdge:              AnyDb;
	unresolved:          AnyDb;
	unresolvedByFile:    AnyDb;

	// Plans
	plan:                AnyDb;
	planStep:            AnyDb;

	// Conversations
	conversationSession: AnyDb;
	conversationTurn:    AnyDb;
	conversationTurnByRepo: AnyDb;

	// Todos
	todoList:            AnyDb;
	todoListBySession:   AnyDb;
	todoItem:            AnyDb;
	todoComment:         AnyDb;

	// Config
	configEntry:         AnyDb;
	configByScope:       AnyDb;

	// Doc summaries -- one row per doc/section entity, produced by the
	// post-indexing summariser (plans/docs-module.md Section 8).
	docSummary:          AnyDb;
	// Secondary index: repoId -> entityU64. dupSort so a repo has many
	// summary rows; enables per-repo sweeps without scanning the whole
	// docSummary sub-DB.
	docSummaryByRepo:    AnyDb;

	// Exploration cache -- one row per successful exploration
	// invocation (concept.resolve / module.profile / etc.). Keyed by
	// (repoId, repoLastIndexedAt, paramHash) so a re-index
	// automatically invalidates every cached entry for that repo.
	// See plans/exploration-based-context-build.md Section 7.
	explorationCache:    AnyDb;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: GraphStore | null = null;
let _initPromise: Promise<GraphStore> | null = null;

/**
 * Backing-env path. Defaults to `PATHS.lmdb` (`~/.insrc/graph.lmdb`).
 * Tests override via `setGraphStorePath()` to a tmpdir.
 */
let _path: string = PATHS.lmdb;

/**
 * Override the backing-env path. ONLY for tests -- production code
 * should never call this. Must be called BEFORE `getGraphStore()` of
 * the test, otherwise the singleton is already pinned to the old
 * path. Pair with `closeGraphStore()` in test setup/teardown.
 */
export function setGraphStorePath(path: string): void {
	_path = path;
}

/**
 * Lazy-init the env + all sub-DBs.
 */
export async function getGraphStore(): Promise<GraphStore> {
	if (_instance !== null) return _instance;
	if (_initPromise !== null) return _initPromise;

	_initPromise = (async (): Promise<GraphStore> => {
		const t0 = Date.now();
		const mapsizeBytes = readMapsizeBytes();

		// lmdb-js creates a single file at `_path`; ensure the parent
		// directory exists. Do NOT mkdir _path itself -- it's a file, not
		// a directory.
		const parent = dirname(_path);
		if (!existsSync(parent)) {
			mkdirSync(parent, { recursive: true });
		}

		// Wrap the lmdb-js open() with classified error mapping per the
		// design doc "Env-open failures" matrix. Full durability default
		// (no MDB_NOSYNC / MDB_NOMETASYNC / MDB_MAPASYNC) -- the spike
		// validated this is plenty fast at our write rate.
		let root: RootDatabase;
		try {
			root = open({
				path:    _path,
				mapSize: mapsizeBytes,
				maxDbs:  MAX_DBS,
			});
		} catch (e) {
			throw classifyOpenError(e, _path, mapsizeBytes / 1024 ** 3);
		}

		const open_ = (name: string, opts: { dupSort?: boolean } = {}): AnyDb => root.openDB({
			name,
			keyEncoding:  'binary',
			encoding:     'binary',
			dupSort:      opts.dupSort ?? false,
		});

		const store: GraphStore = {
			root,

			// Graph -- meta uses ordered-binary keys so callers can write
			// short utf8 strings directly (lmdb-js encodes string→buffer
			// transparently for ordered-binary). Values are msgpack-default.
			meta:               root.openDB({ name: 'meta', keyEncoding: 'ordered-binary' }),
			repo:               open_('repo'),
			entity:             open_('entity'),
			entityIdByString:   root.openDB({ name: 'entity_id_by_string', keyEncoding: 'ordered-binary' }),
			entityStringByU64:  root.openDB({
				name:        'entity_string_by_u64',
				keyEncoding: 'binary',
				encoding:    'ordered-binary',  // string values
			}),
			nameIndex:          open_('name_index', { dupSort: true }),
			outEdge:            open_('out_edge'),
			inEdge:             open_('in_edge'),
			unresolved:         root.openDB({ name: 'unresolved', keyEncoding: 'ordered-binary' }),
			unresolvedByFile:   open_('unresolved_by_file', { dupSort: true }),

			// Plans -- `plan` is utf8 id keyed; planStep keys are pre-
			// encoded composite Buffers so binary is fine
			plan:               root.openDB({ name: 'plan', keyEncoding: 'ordered-binary' }),
			planStep:           open_('plan_step'),

			// Conversations -- session is utf8 id keyed; turn keys are
			// pre-encoded composite Buffers
			conversationSession:    root.openDB({ name: 'conversation_session', keyEncoding: 'ordered-binary' }),
			conversationTurn:       open_('conversation_turn'),
			conversationTurnByRepo: open_('conversation_turn_by_repo', { dupSort: true }),

			// Todos -- todoList + todoItem are utf8 id keyed; todoComment
			// uses a composite (item_id, comment_id) key for per-item
			// range scans.
			todoList:           root.openDB({ name: 'todo_list', keyEncoding: 'ordered-binary' }),
			todoListBySession:  open_('todo_list_by_session', { dupSort: true }),
			todoItem:           root.openDB({ name: 'todo_item', keyEncoding: 'ordered-binary' }),
			todoComment:        open_('todo_comment'),

			// Config -- configEntry is utf8 id keyed
			configEntry:        root.openDB({ name: 'config_entry', keyEncoding: 'ordered-binary' }),
			configByScope:      open_('config_by_scope', { dupSort: true }),

			// Doc summaries -- keyed by entity u64 (matches the entity
			// sub-DB); values are msgpack-encoded DocSummary. The
			// repo-secondary index enables per-repo sweeps for
			// live-project-context assembly.
			docSummary:         open_('doc_summary'),
			docSummaryByRepo:   open_('doc_summary_by_repo', { dupSort: true }),

			// Exploration cache -- 20-byte composite key
			// (repoId u32 || lastIndexedAt u64 || paramHash u64). See
			// db/exploration-cache.ts for the layout.
			explorationCache:   open_('exploration_cache'),
		};

		// Schema-version pre-flight check. Wrapped in a write txn so the
		// first-boot write commits before any caller can read.
		const stored = readSchemaVersion(store);
		if (stored === undefined) {
			// First boot at the current schema -- write the version AND
			// provision the reserved shared-modules registry rows. The
			// v2->v3 migration also provisions them, but it only fires
			// when migrating an existing v2 env; a fresh-boot env never
			// hits the migration path, so without this call the four
			// `kind: 'shared-modules'` rows would be missing.
			const { provisionSharedModulesRows } = await import('./migrations.js');
			await root.transaction(() => {
				writeSchemaVersion(store, SCHEMA_VERSION);
				provisionSharedModulesRows(store);
			});
		} else if (stored > SCHEMA_VERSION) {
			await root.close();
			throw new LmdbStoreSchemaVersionMismatch(stored, SCHEMA_VERSION);
		} else if (stored < SCHEMA_VERSION) {
			// Forward-migration path. Phase 7.2 ships the runner with
			// an empty registry (v1 is the first version); the moment
			// a v2 migration is added, this path activates without any
			// further env-open changes.
			const { runMigrations } = await import('./migrations.js');
			try {
				const applied = await runMigrations(store, stored, SCHEMA_VERSION);
				log.info(
					{ stored, target: SCHEMA_VERSION, applied },
					'forward migrations complete',
				);
			} catch (e) {
				await root.close();
				throw e;
			}
		}

		log.info(
			{
				initMs:        Date.now() - t0,
				mapsizeGiB:    mapsizeBytes / 1024 ** 3,
				schemaVersion: SCHEMA_VERSION,
				path:          _path,
			},
			'lmdb graph store initialised',
		);
		_instance = store;
		return store;
	})();

	try {
		return await _initPromise;
	} catch (e) {
		_initPromise = null;
		throw e;
	}
}

/**
 * Sweep stale reader slots from the LMDB lock-file -- killed daemons
 * leave their reader-table slot occupied, which pins the writer's
 * free-list and bloats the file until the slot is released.
 *
 * `mdb_reader_check()` (lmdb-js: `root.readerCheck()`) walks the lock
 * table, drops slots whose PID no longer exists, and returns the count
 * cleared. Cheap (a lock-file scan); safe to call any time.
 *
 * No-op when the env isn't open (don't force a lazy open just to
 * readerCheck). Errors are logged and swallowed -- this is a defensive
 * housekeeping op and a transient failure shouldn't cascade.
 *
 * Daemon startup runs this once via `runReaderCheck('startup')`, then a
 * 5-min timer runs `runReaderCheck('periodic')`. See Phase 5.5 of
 * plans/storage-migration-lmdb-lance.md and the "Stale reader slots"
 * row in plans/graph-storage-lmdb.md's risk table.
 */
export function runReaderCheck(reason: string): number {
	const inst = _instance;
	if (inst === null) return 0;
	try {
		const cleared = inst.root.readerCheck();
		if (cleared > 0) {
			log.warn(
				{ cleared, reason, readers: inst.root.readerList() },
				'lmdb readerCheck cleared stale reader slots',
			);
		} else {
			log.debug({ reason }, 'lmdb readerCheck: no stale slots');
		}
		return cleared;
	} catch (e) {
		log.warn({ err: errMessage(e), reason }, 'lmdb readerCheck failed');
		return 0;
	}
}

export interface CompactResult {
	readonly beforeBytes: number;
	readonly afterBytes:  number;
	readonly savedBytes:  number;
	readonly elapsedMs:   number;
}

/**
 * Offline compaction (Phase 7.4). LMDB never returns freed pages to
 * the OS -- they're tracked on a per-env free-list and reused for
 * new writes. After a large delete burst (e.g. `deleteRepo` on a
 * 100k-entity repo) the file stays inflated. `compactGraphStore`
 * reclaims that space:
 *
 *   1. `root.backup(<env>.compact, compact: true)` writes a
 *      defragged copy (mdb_env_copy2(MDB_CP_COMPACT)). Concurrent
 *      reads + writes are safe; the snapshot reflects state at
 *      backup-start.
 *   2. Close the env (drains in-flight readers; serialises against
 *      any writer that landed between steps 1 and 2 -- those writes
 *      are lost; caller is expected to quiesce the system before
 *      compact, see the daemon-side check).
 *   3. Atomic rename: original → `.bak`, `.compact` → original.
 *   4. Re-open the env at the original path.
 *   5. Best-effort delete `.bak` on success. Left in place on rename
 *      failure so the user can manually recover.
 *
 * Returns size delta in bytes. Throws `LmdbStoreError` on any step.
 */
export async function compactGraphStore(): Promise<CompactResult> {
	const inst = _instance;
	if (inst === null) {
		throw new LmdbStoreError('cannot compact: graph store is not open');
	}
	const t0 = Date.now();
	const originalPath = _path;
	const compactPath  = `${originalPath}.compact`;
	const bakPath      = `${originalPath}.bak`;
	const lockPath     = `${originalPath}-lock`;

	if (!existsSync(originalPath)) {
		throw new LmdbStoreError(`compact: source env '${originalPath}' missing`);
	}
	const beforeBytes = statSync(originalPath).size;

	// Pre-clear any leftover .compact / .bak from a prior aborted run.
	if (existsSync(compactPath)) rmSync(compactPath, { force: true });
	if (existsSync(bakPath))     rmSync(bakPath,     { force: true });

	// Step 1: write the compacted copy. Don't go through `backupGraphStore`
	// because it asserts _instance != null -- which we'll need to clear
	// in step 2 before the rename. Inline the call so the same `inst`
	// is reused.
	await inst.root.backup(compactPath, true);

	// Step 2: close the env so the file isn't held open during rename.
	_instance = null;
	_initPromise = null;
	try {
		await inst.root.close();
	} catch (e) {
		// Reset partial state, then bubble up.
		_instance = null;
		throw new LmdbStoreError(`compact: close failed: ${errMessage(e)}`, e);
	}

	// Step 3: atomic rename. If anything fails here, the .bak + .compact
	// files stay on disk for manual recovery.
	try {
		renameSync(originalPath, bakPath);
		renameSync(compactPath, originalPath);
		// Lock files are a leftover from the previous open; LMDB
		// recreates them on the next open. Best-effort cleanup.
		if (existsSync(lockPath)) rmSync(lockPath, { force: true });
	} catch (e) {
		// Try to roll back to a usable state. If `.bak` exists but
		// `original` doesn't, restore it.
		if (existsSync(bakPath) && !existsSync(originalPath)) {
			try { renameSync(bakPath, originalPath); } catch { /* ignore */ }
		}
		throw new LmdbStoreError(`compact: rename failed: ${errMessage(e)}`, e);
	}

	// Step 4: re-open the env at the original path.
	await getGraphStore();

	// Step 5: best-effort cleanup of .bak (the pre-compact original).
	const afterBytes = statSync(originalPath).size;
	if (existsSync(bakPath)) {
		try {
			rmSync(bakPath, { force: true });
		} catch (e) {
			log.warn(
				{ path: bakPath, err: errMessage(e) },
				'compact succeeded but .bak cleanup failed; remove manually',
			);
		}
	}

	return {
		beforeBytes,
		afterBytes,
		savedBytes: beforeBytes - afterBytes,
		elapsedMs:  Date.now() - t0,
	};
}

/**
 * Hot backup: snapshot the LMDB env file to `targetPath` while the
 * daemon is still serving reads / writes.
 *
 * Wraps `root.backup()` (lmdb-js's surface for `mdb_env_copy2`):
 * opens a snapshot read txn under the hood and copies the full env
 * file -- meta page + all sub-DBs -- atomically. Concurrent writers
 * can keep going; they just won't appear in the snapshot.
 *
 * `compact: true` strips dead pages while copying (slower, smaller
 * file). Hot backups want speed, so the default is `false`. The
 * Phase 7.4 `insrc daemon compact` CLI uses `compact: true` to
 * produce a defragged copy.
 */
export async function backupGraphStore(
	targetPath: string,
	opts: { compact?: boolean } = {},
): Promise<void> {
	const inst = _instance;
	if (inst === null) {
		throw new LmdbStoreError('cannot backup: graph store is not open');
	}
	await inst.root.backup(targetPath, opts.compact ?? false);
}

/**
 * Close the env. Called by the daemon's graceful-shutdown handler.
 * Errors are logged but not re-thrown (the daemon is on the way down).
 */
export async function closeGraphStore(): Promise<void> {
	const inst = _instance;
	_instance = null;
	_initPromise = null;
	if (inst === null) return;
	try {
		await inst.root.close();
	} catch (e) {
		log.warn({ err: errMessage(e) }, 'lmdb graph store close failed');
	}
}

// ---------------------------------------------------------------------------
// Txn helpers (Phase 1.5 will harden these with timing + retry)
// ---------------------------------------------------------------------------

/**
 * Run `fn` inside an LMDB write transaction. Single-writer at a time
 * (LMDB serializes write txns); concurrent callers queue up. Throws
 * propagate; the txn aborts and partial changes are discarded.
 */
export async function withWriteTxn<T>(
	fn: (store: GraphStore) => T | Promise<T>,
): Promise<T> {
	const store = await getGraphStore();
	return store.root.transaction(() => fn(store));
}

/**
 * Synchronous variant for tight bulk-write loops where the caller wants
 * to drive the txn boundary explicitly. The async variant is preferred
 * for normal usage.
 */
export function withWriteTxnSync<T>(
	store: GraphStore,
	fn: () => T,
): T {
	return store.root.transactionSync(fn);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function readMapsizeBytes(): number {
	const raw = process.env['INSRC_LMDB_MAPSIZE_GIB'];
	if (raw === undefined || raw.length === 0) return DEFAULT_MAPSIZE_GIB * 1024 ** 3;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		log.warn({ raw }, 'INSRC_LMDB_MAPSIZE_GIB invalid; falling back to default');
		return DEFAULT_MAPSIZE_GIB * 1024 ** 3;
	}
	return parsed * 1024 ** 3;
}

function errMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/**
 * Map raw lmdb-js open() errors onto our typed error classes per the
 * design doc "Env-open failures" matrix.
 */
function classifyOpenError(e: unknown, path: string, requestedGiB: number): LmdbStoreError {
	const msg = errMessage(e).toLowerCase();
	// Lock conflict -- another process already has the env open
	if (msg.includes('resource temporarily unavailable')
	 || msg.includes('busy')
	 || msg.includes('lock')) {
		return new LmdbStoreLockConflict(path, e);
	}
	// Mapsize too small for existing file
	if (msg.includes('mdb_map_full')
	 || msg.includes('map_full')
	 || msg.includes('map size limit')) {
		return new LmdbStoreMapsizeTooSmall(path, requestedGiB, e);
	}
	// Corrupted meta pages -- catch the LMDB "invalid argument" /
	// "page is corrupted" / "MDB_VERSION_MISMATCH" / "MDB_INVALID"
	// family of errors
	if (msg.includes('mdb_invalid')
	 || msg.includes('mdb_version_mismatch')
	 || msg.includes('not an lmdb')
	 || msg.includes('corrupt')
	 || msg.includes('invalid file')) {
		return new LmdbStoreCorrupted(path, e);
	}
	// Unknown -- preserve the original error message inside our class
	return new LmdbStoreError(`failed to open LMDB env at '${path}': ${errMessage(e)}`, e);
}

function readSchemaVersion(store: GraphStore): number | undefined {
	// `meta` sub-DB uses default (msgpack) value encoding -- numbers
	// round-trip cleanly without manual buffer packing.
	const v = store.meta.get(META_SCHEMA_VERSION);
	if (v === undefined) return undefined;
	if (typeof v === 'number') return v;
	throw new LmdbStoreError(`meta.schema_version has unexpected type: ${typeof v}`);
}

function writeSchemaVersion(store: GraphStore, version: number): void {
	void store.meta.put(META_SCHEMA_VERSION, version);
}
