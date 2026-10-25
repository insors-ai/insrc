/**
 * LMDB env + sub-DB scaffolding for the storage layer.
 *
 * Phase 1.1 of docs/plans/storage-migration-lmdb-lance.md. This file owns
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
 *     unresolved_by_target         utf8 awaited entity id -> dupsort utf8 unresolved_id   (schema_version >= 5)
 *     export_names                 (u64+utf8)   -> dupsort utf8 target entity id          (schema_version >= 5)
 *     index_state                  u32 BE repoId -> msgpack(IndexStateRow)                (schema_version >= 5)
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

import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { open, type Database, type RootDatabase } from 'lmdb';

import { getLogger } from '../../shared/logger.js';
import { getStoreGuard, HEALTH_LOCKS_LOST } from '../store-guard.js';
import { PATHS } from '../../shared/paths.js';
import { assertNotCompactingElsewhere } from '../../shared/locks/maintenance-lock.js';

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
 * Capacity for the 35 named databases, with room for additive namespaces.
 */
export const MAX_DBS = 64;

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
 *         (docs/plans/repo-registry-strict-contract.md):
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
 *   v4 -- external-service graph vocabulary (additive kinds; no rewrite).
 *   v5 -- nothing lost from the index (Epic c2ba6fa6, Story s1):
 *         - `unresolved_by_target`: a pending relationship that awaits
 *           a target by its entity id, found by that id.
 *         - `export_names`: the names a file re-exports, alias included.
 *         - `index_state`: one IndexStateRow per workspace repository.
 *         The v4 -> v5 migration writes an IndexStateRow for every
 *         workspace repository with fullIndexFinished false and its
 *         pending counts recounted from the stored rows.
 *   v6 -- transactional entity_by_file and entity_by_repo memberships.
 */
export const SCHEMA_VERSION = 6;

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

/**
 * This process's store can no longer be used: its locks were removed by
 * another process (see `StoreHealth`). The message states that cause. It does
 * NOT repeat the library's own text, which blames a system limit that is not
 * involved; the library's text is kept in the health record for the log.
 */
export class LmdbStoreLocksLostError extends LmdbStoreError {
	constructor(operation: string, cause?: unknown) {
		super(
			`The graph store can no longer be used by this process (found during: ${operation}). ` +
			`Its locks were removed by another process that opened and closed the store ` +
			`after this process had lost its file lock on the store's lock file. ` +
			`Nothing more can be read or written until the daemon is restarted.`,
			cause,
		);
		this.name = 'LmdbStoreLocksLostError';
	}
}

/**
 * This process may not open the live store: only the daemon owns it (and,
 * until Story s11 of Epic c2ba6fa6, the MCP server may read it). Every other
 * process that opens and closes the live store can remove the daemon's locks.
 * Thrown before the library's open is called, so no descriptor is opened.
 */
export class LmdbStoreNotOwnerError extends LmdbStoreError {
	constructor(path: string) {
		super(
			`Refusing to open the live graph store at '${path}': only the insrc daemon may open it. ` +
			`A test must set a temporary store with setGraphStorePath(); any other code must ask the daemon over its socket.`,
		);
		this.name = 'LmdbStoreNotOwnerError';
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
	understandingCurrent: AnyDb;
	understandingAttempt: AnyDb;
	understandingAudit: AnyDb;
	understandingRequest: AnyDb;
	understandingOwnerIndex: AnyDb;
	understandingScopeIndex: AnyDb;
	understandingReceipt: AnyDb;
	understandingMeta: AnyDb;

	root: RootDatabase;

	// Graph
	meta:                AnyDb;
	repo:                AnyDb;
	entity:              AnyDb;
	entityByFile:        AnyDb;
	entityByRepo:        AnyDb;
	entityIdByString:    AnyDb;
	entityStringByU64:   AnyDb;
	nameIndex:           AnyDb;
	outEdge:             AnyDb;
	inEdge:              AnyDb;
	unresolved:          AnyDb;
	unresolvedByFile:    AnyDb;
	unresolvedByTarget:  AnyDb;
	exportNames:         AnyDb;
	indexState:          AnyDb;

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
	// post-indexing summariser (docs/plans/docs-module.md Section 8).
	docSummary:          AnyDb;
	// Secondary index: repoId -> entityU64. dupSort so a repo has many
	// summary rows; enables per-repo sweeps without scanning the whole
	// docSummary sub-DB.
	docSummaryByRepo:    AnyDb;
	// Summaries held across a full index (ISSUE-dced4385): (repoId u32 ||
	// UTF-8 string entity id) -> msgpack(DocSummary). Written in the
	// repository delete's transaction, written back once the rebuild has
	// stored the documents again.
	docSummaryCarry:     AnyDb;

	// Exploration cache -- one row per successful exploration
	// invocation (concept.resolve / module.profile / etc.). Keyed by
	// (repoId, repoLastIndexedAt, paramHash) so a re-index
	// automatically invalidates every cached entry for that repo.
	// See docs/plans/exploration-based-context-build.md Section 7.
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
export function getGraphStorePath(): string { return _path; }

export function setGraphStorePath(path: string): void {
	if (_instance !== null || _initPromise !== null) throw new Error('close graph store before changing its path');
	_path = path;
}

// ---------------------------------------------------------------------------
// Who may open the live store
// ---------------------------------------------------------------------------
//
// Module variables, set only by calls: a child process inherits neither, so a
// test run or a CLI started by the daemon is refused like any other process.

let _ownsLiveStore = false;

/** Called once by the daemon's entry point, before anything opens the store. */
export function declareLiveStoreOwner(): void {
	_ownsLiveStore = true;
}

/** The path with symbolic links resolved. For a file that does not exist
 *  yet: a link is followed to its target (even when the target is missing),
 *  otherwise its directory's resolved path is joined with its name. */
function resolvedStorePath(path: string, depth = 0): string {
	const abs = resolve(path);
	try { return realpathSync(abs); } catch { /* not there yet, or a dangling link */ }
	if (depth < 16) {
		try {
			if (lstatSync(abs).isSymbolicLink()) return resolvedStorePath(resolve(dirname(abs), readlinkSync(abs)), depth + 1);
		} catch { /* no such entry */ }
	}
	try { return join(realpathSync(dirname(abs)), basename(abs)); } catch { return abs; }
}

/**
 * True when `path`, with symbolic links resolved, is the live store's data
 * file or its lock file. Opening and closing a second descriptor on the lock
 * file inside the daemon drops the daemon's lock on it (Story s4).
 */
export function isLiveStoreFile(path: string): boolean {
	const p = resolvedStorePath(path);
	const live = resolvedStorePath(PATHS.lmdb);
	return p === live || p === `${live}-lock`;
}

/** Throws `LmdbStoreNotOwnerError` when `path` is the live store and this
 *  process has not declared itself the owner. */
function assertMayOpen(path: string): void {
	if (_ownsLiveStore) return;
	if (resolvedStorePath(path) === resolvedStorePath(PATHS.lmdb)) throw new LmdbStoreNotOwnerError(path);
}

/**
 * True when this process declared itself the owner of the live stores. Read
 * by the vector store's open: the owner declaration governs both stores
 * (Epic c2ba6fa6, Story s11, ac7).
 */
export function isLiveStoreOwnerDeclared(): boolean {
	return _ownsLiveStore;
}

/** A path with symbolic links resolved, as the owner checks compare them
 *  (also for a path that does not exist yet). */
export function resolveStorePath(path: string): string {
	return resolvedStorePath(path);
}

/** ONLY for tests: forget the owner declaration. */
export function resetLiveStoreDeclarationsForTests(): void {
	_ownsLiveStore = false;
}

// ---------------------------------------------------------------------------
// Store health
// ---------------------------------------------------------------------------

/**
 * The one record of whether this process's store can still be used. It
 * starts as `ok`, is set ONCE, and never returns to `ok` in the same process:
 * only a restart clears it.
 *
 * `locks-lost` is what follows when another process opens and closes the
 * store after this process lost its file lock on the store's lock file: that
 * close removes the semaphores this process still uses. How each kind of call
 * then fails is pinned by `__tests__/lock-loss-reproduction.test.ts`:
 *
 *   - a read throws: code -30775 (MDB_LOCK_FAILURE) in a process that never
 *     read, code 22 with MDB_BAD_RSLOT in one that had (a daemon always has);
 *   - a synchronous transaction throws a bare code 22 ("Invalid argument");
 *   - an asynchronous transaction never settles.
 */
export type StoreHealth =
	| { readonly state: 'ok' }
	| {
		readonly state:          'locks-lost';
		readonly at:             string;
		readonly operation:      string;
		readonly detectedBy:     'sync-write' | 'write-timeout-probe' | 'read';
		/** The library's own text, for the log only: it names a system limit
		 *  that is not the cause. */
		readonly libraryMessage: string;
	};

let _health: StoreHealth = { state: 'ok' };

/**
 * Store health is shared by every daemon thread (Epic 86197ac6, s1): the
 * process-wide health word in the store guard's block says whether ANY thread
 * found the locks lost. The thread that found it broadcasts its full record;
 * until that record arrives, another thread reports the detecting thread.
 */
let _mirroredAt: string | undefined;
let _healthBroadcast: ((health: StoreHealth) => void) | undefined;

function currentHealth(): StoreHealth {
	if (_health.state !== 'ok') return _health;
	const guard = getStoreGuard();
	if (guard.health('graph') !== HEALTH_LOCKS_LOST) return _health;
	_mirroredAt ??= new Date().toISOString();
	return {
		state: 'locks-lost', at: _mirroredAt, detectedBy: 'read', libraryMessage: '',
		operation: `an operation on daemon thread ${guard.healthSetBy('graph')}`,
	};
}

export function getStoreHealth(): StoreHealth {
	return currentHealth();
}

/** Called by the thread that found the locks lost, with its full record, so the daemon can pass it to every thread. */
export function setStoreHealthBroadcaster(fn: ((health: StoreHealth) => void) | undefined): void {
	_healthBroadcast = fn;
}

/** Take the full locks-lost record another thread found; never logs (the finder already did). */
export function receiveStoreHealth(health: StoreHealth): void {
	if (health.state === 'locks-lost' && _health.state === 'ok') _health = health;
}

const MDB_LOCK_FAILURE = -30775;
const EINVAL           = 22;

function errCode(e: unknown): unknown {
	return (e as { code?: unknown } | null)?.code;
}

/** True for the two ways a READ fails once the locks are gone. A bare code 22
 *  is not one of them: it is the general "invalid argument". */
function isLockLossReadError(e: unknown): boolean {
	const code = errCode(e);
	return code === MDB_LOCK_FAILURE || (code === EINVAL && errMessage(e).includes('MDB_BAD_RSLOT'));
}

function recordLocksLost(operation: string, detectedBy: Exclude<StoreHealth, { state: 'ok' }>['detectedBy'], cause: unknown): void {
	if (currentHealth().state !== 'ok') return;
	_health = { state: 'locks-lost', at: new Date().toISOString(), operation, detectedBy, libraryMessage: errMessage(cause) };
	// Only the first detection in the process logs and broadcasts.
	if (!getStoreGuard().markLocksLost('graph')) return;
	_healthBroadcast?.(_health);
	log.error(
		{ operation, detectedBy, libraryMessage: _health.libraryMessage },
		'lmdb graph store lost its locks: another process opened and closed the store; this process must be restarted',
	);
}

/**
 * For a caller that catches an error from a store READ (the daemon's request
 * server and queue runner): when the error is a lock failure, record it and
 * return true, and the caller answers with `LmdbStoreLocksLostError`. Returns
 * true as well for that named error itself (already recorded), false otherwise.
 */
export function recordStoreFailureIfLockError(err: unknown, operation: string): boolean {
	if (err instanceof LmdbStoreLocksLostError) return true;
	if (!isLockLossReadError(err)) return false;
	recordLocksLost(operation, 'read', err);
	return true;
}

/** Fixed key of the probe read. It need not exist. */
const PROBE_KEY = 'store_health_probe';

let _probeObserver: ((result: 'ok' | 'locks-lost') => void) | null = null;

/**
 * One read, to tell a store that lost its locks from one that is only slow or
 * that threw for another reason. A read is the one call that fails fast and
 * cleanly in that state. Returns the read's error when it is a lock failure.
 */
function probeForLockLoss(store: GraphStore): unknown | undefined {
	let lost: unknown;
	try {
		store.meta.get(PROBE_KEY);
	} catch (e) {
		if (isLockLossReadError(e)) lost = e;
	}
	_probeObserver?.(lost === undefined ? 'ok' : 'locks-lost');
	return lost;
}

/** How long `withWriteTxn` waits for a write before it probes the store. An
 *  ordinary write here takes milliseconds. */
let _writeProbeAfterMs = 10_000;

/** ONLY for tests: shorten the wait before a write is probed. */
export function setWriteProbeAfterMsForTests(ms: number): void {
	_writeProbeAfterMs = ms;
}

/** ONLY for tests: be told of every probe read and its result. */
export function setStoreProbeObserverForTests(fn: ((result: 'ok' | 'locks-lost') => void) | null): void {
	_probeObserver = fn;
}

/** ONLY for tests: a process's health is never cleared in production. */
export function resetStoreHealthForTests(): void {
	_health = { state: 'ok' };
	_mirroredAt = undefined;
	getStoreGuard().resetHealthForTests('graph');
}

/**
 * Lazy-init the env + all sub-DBs.
 *
 * Rejects with `LmdbStoreLocksLostError` once the store's health is
 * locks-lost. Every read and write begins here, so this is the one read-side
 * place the failure is raised: no later call reaches the library.
 */
export async function getGraphStore(): Promise<GraphStore> {
	const health = currentHealth();
	if (health.state === 'locks-lost') throw new LmdbStoreLocksLostError(`opening the store (failed earlier during: ${health.operation})`);
	// While daemon maintenance compacts on another thread, this thread neither uses nor reopens the store.
	assertNotCompactingElsewhere();
	if (_instance !== null) return _instance;
	if (_initPromise !== null) return _initPromise;
	// Before anything touches the path: no directory, no lock file, no open.
	assertMayOpen(_path);

	_initPromise = (async (): Promise<GraphStore> => {
		const t0 = Date.now();
		const mapsizeBytes = readMapsizeBytes();
		// What an interrupted compaction left (a crash, kill -9): finished or
		// rolled back here; a swapped-in copy is checked against its manifest below.
		const unverified = recoverCompactionLeftovers(_path);

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
			understandingCurrent: root.openDB({ name: 'understanding_current', keyEncoding: 'binary' }),
			understandingAttempt: root.openDB({ name: 'understanding_attempt', keyEncoding: 'binary' }),
			understandingAudit: root.openDB({ name: 'understanding_audit', keyEncoding: 'binary' }),
			understandingRequest: root.openDB({ name: 'understanding_request', keyEncoding: 'binary' }),
			understandingOwnerIndex: root.openDB({ name: 'understanding_owner_index', keyEncoding: 'binary' }),
			understandingScopeIndex: root.openDB({ name: 'understanding_scope_index', keyEncoding: 'binary' }),
			understandingReceipt: root.openDB({ name: 'understanding_receipt', keyEncoding: 'binary' }),
			understandingMeta: root.openDB({ name: 'understanding_meta', keyEncoding: 'binary' }),


			// Graph -- meta uses ordered-binary keys so callers can write
			// short utf8 strings directly (lmdb-js encodes string→buffer
			// transparently for ordered-binary). Values are msgpack-default.
			meta:               root.openDB({ name: 'meta', keyEncoding: 'ordered-binary' }),
			repo:               open_('repo'),
			entity:             open_('entity'),
			entityByFile:       open_('entity_by_file', { dupSort: true }),
			entityByRepo:       open_('entity_by_repo', { dupSort: true }),
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
			unresolvedByTarget: open_('unresolved_by_target', { dupSort: true }),
			exportNames:        open_('export_names', { dupSort: true }),
			indexState:         open_('index_state'),

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
			docSummaryCarry:    open_('doc_summary_carry'),

			// Exploration cache -- 20-byte composite key
			// (repoId u32 || lastIndexedAt u64 || paramHash u64). See
			// db/exploration-cache.ts for the layout.
			explorationCache:   open_('exploration_cache'),
		};

		// A compacted copy swapped in but not yet checked: before any write of
		// this open, every named database must hold the entries it held when
		// the copy was taken. If not, the original comes back and is opened.
		if (unverified !== undefined) {
			const found = entryCounts(store);
			const differs = Object.keys({ ...unverified.counts, ...found }).filter(name => unverified.counts[name] !== found[name]);
			if (differs.length > 0) {
				log.error({ path: _path, differs, expected: unverified.counts, found }, 'compaction: the compacted copy does not match the store it was taken from; restoring the original');
				await root.close();
				restoreFromBak(_path);
				_lastCompactionCheck = 'restored';
				_initPromise = null;
				return getGraphStore();
			}
			finishVerifiedCompaction(_path);
			_lastCompactionCheck = 'verified';
		}

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
			// A child transaction, so a throw leaves no partial first boot (ISSUE-5437d6e5).
			await root.childTransaction(() => {
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

		// The IndexState check on open (Epic c2ba6fa6 s1): pending counts are
		// recounted from the stored classes; a row that differs is corrected and
		// a row of an unregistered repository deleted. A failure is logged and
		// does not stop the store opening: completeness is reported, not relied on.
		try {
			const { reconcileIndexStateInTxn } = await import('./index-state-rows.js');
			const corrections = await root.childTransaction(() => reconcileIndexStateInTxn(store));
			for (const c of corrections) log.warn(c, c.kind === 'row-deleted' ? 'index state: row of an unregistered repository deleted' : 'index state: stored pending counts differed from a recount; corrected');
		} catch (e) {
			log.error({ err: e }, 'index state: the recount on open failed; counts are left as stored');
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
 * docs/plans/storage-migration-lmdb-lance.md and the "Stale reader slots"
 * row in docs/plans/graph-storage-lmdb.md's risk table.
 */
export function runReaderCheck(reason: string): number {
	const inst = _instance;
	if (inst === null) return 0;
	if (currentHealth().state === 'locks-lost') return 0;
	// A read that failed outside a request or a job (a timer, the boot
	// sequence, a handler that swallows its own failures) is recorded by
	// nobody. This check runs anyway, so it also asks whether the store can
	// still be read.
	const lost = probeForLockLoss(inst);
	if (lost !== undefined) {
		recordLocksLost(`the reader check (${reason})`, 'read', lost);
		return 0;
	}
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

/** How often the daemon re-checks the reader table (and probes the store). */
export const READER_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Run `runReaderCheck('periodic')` on a timer. The caller clears the timer. */
export function startPeriodicReaderCheck(intervalMs: number = READER_CHECK_INTERVAL_MS): NodeJS.Timeout {
	return setInterval(() => { runReaderCheck('periodic'); }, intervalMs);
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
 *      defragged copy (mdb_env_copy2(MDB_CP_COMPACT)), fenced: if any
 *      write commits while it is taken, nothing is swapped (the caller is
 *      expected to quiesce the system; daemon maintenance holds its lock).
 *   2. Close the env.
 *   3. The swap: the copy is fsynced, a manifest records the entries of
 *      every named database, the original gets a second name (`.bak`),
 *      and the copy replaces the store name in one atomic rename.
 *   4. Re-open: the open checks the copy against the manifest, then
 *      removes `.bak` -- or, on any difference, restores the original.
 *
 * A crash (kill -9, power loss) at any point leaves the original or a
 * checked copy: the next open finishes or rolls back what was left
 * (recoverCompactionLeftovers). Data is never lost to a compaction.
 *
 * Returns size delta in bytes. Throws `LmdbStoreError` on any step.
 *
 * `beforeRename` runs after the close and before the rename (Epic 86197ac6
 * s2): daemon maintenance passes a check that every other handle on the
 * native environment is closed. When it resolves false nothing is renamed:
 * the compacted copy is removed, the original store is reopened, and the call
 * rejects. Without it, behaviour is unchanged.
 */
export async function compactGraphStore(opts: { readonly beforeRename?: () => Promise<boolean> } = {}): Promise<CompactResult> {
	const inst = _instance;
	if (inst === null) {
		throw new LmdbStoreError('cannot compact: graph store is not open');
	}
	const t0 = Date.now();
	const originalPath = _path;
	const { compactPath, bakPath, manifestPath, lockPath } = compactionPaths(originalPath);

	if (!existsSync(originalPath)) {
		throw new LmdbStoreError(`compact: source env '${originalPath}' missing`);
	}
	const beforeBytes = statSync(originalPath).size;

	// Pre-clear any leftover .compact / .bak from a prior aborted run.
	if (existsSync(compactPath)) rmSync(compactPath, { force: true });
	if (existsSync(bakPath))     rmSync(bakPath,     { force: true });
	if (existsSync(manifestPath)) rmSync(manifestPath, { force: true });

	// Step 1: write the compacted copy, fenced: what every named database
	// holds, and the last committed transaction, before and after the copy.
	// Don't go through `backupGraphStore` because it asserts _instance !=
	// null -- which we'll need to clear in step 2 before the rename.
	const txnBefore = lastTxnId(inst);
	const counts = entryCounts(inst);
	await inst.root.backup(compactPath, true);
	// A write committed while the copy was taken is not in it: nothing is swapped.
	if (lastTxnId(inst) !== txnBefore) {
		rmSync(compactPath, { force: true });
		throw new LmdbStoreError('compact: a write was committed while the copy was taken; nothing renamed');
	}

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

	// Step 2b: the caller's last check before the files change.
	if (opts.beforeRename !== undefined && !(await opts.beforeRename())) {
		rmSync(compactPath, { force: true });
		await getGraphStore();
		throw new LmdbStoreError('compact: the environment was still open; nothing renamed');
	}

	// Step 3: the swap, safe against a crash at any point. The copy is on disk
	// before it is named; the manifest records what it must hold; the original
	// stays reachable as .bak (a second name for the same file); the copy then
	// replaces the store name in one atomic rename, so a store file exists at
	// every moment. On the next open (below, or after a crash at boot) the copy
	// is checked against the manifest and the original restored if it differs.
	try {
		crashPoint('before-swap');
		fsyncFile(compactPath);
		writeFileSync(manifestPath, JSON.stringify({ version: 1, counts, lastTxnId: txnBefore, writtenAt: new Date().toISOString() } satisfies CompactionManifest));
		fsyncFile(manifestPath);
		crashPoint('after-manifest');
		linkSync(originalPath, bakPath);
		fsyncDir(dirname(originalPath));
		crashPoint('after-link');
		renameSync(compactPath, originalPath);
		fsyncDir(dirname(originalPath));
		crashPoint('after-rename');
		// Lock files are a leftover from the previous open; LMDB
		// recreates them on the next open. Every handle is closed by now.
		if (existsSync(lockPath)) rmSync(lockPath, { force: true });
	} catch (e) {
		if (e instanceof SimulatedCrash) throw e;
		// The store name still holds the original or the copy; the next open sorts out the rest.
		throw new LmdbStoreError(`compact: the swap failed: ${errMessage(e)}`, e);
	}

	// Step 4: re-open the env at the original path; the open checks the copy
	// against the manifest and removes .bak and the manifest, or restores the original.
	_lastCompactionCheck = undefined;
	await getGraphStore();
	if (_lastCompactionCheck !== 'verified') {
		throw new LmdbStoreError('compact: the compacted copy did not match the store; the original was restored');
	}

	const afterBytes = statSync(originalPath).size;
	return {
		beforeBytes,
		afterBytes,
		savedBytes: beforeBytes - afterBytes,
		elapsedMs:  Date.now() - t0,
	};
}

// ---------------------------------------------------------------------------
// Reclaimable space (daemon maintenance, Epic 86197ac6 s2)
// ---------------------------------------------------------------------------

/** One B-tree's page counts, as getStats() reports them. */
export interface TreePages {
	readonly treeBranchPageCount: number;
	readonly treeLeafPageCount: number;
	readonly overflowPages: number;
}

export interface Reclaimable {
	readonly fileBytes: number;
	readonly usedBytes: number;
	readonly reclaimableBytes: number;
	/** reclaimableBytes as a % of fileBytes. */
	readonly reclaimablePct: number;
}

/** What compaction would give back: the file size less the pages the trees use (branch + leaf + overflow). */
export function reclaimableFrom(trees: readonly TreePages[], pageSize: number, fileBytes: number): Reclaimable {
	const pages = trees.reduce((n, t) => n + t.treeBranchPageCount + t.treeLeafPageCount + t.overflowPages, 0);
	const usedBytes = Math.min(fileBytes, pages * pageSize);
	const reclaimableBytes = fileBytes - usedBytes;
	return { fileBytes, usedBytes, reclaimableBytes, reclaimablePct: fileBytes > 0 ? (reclaimableBytes / fileBytes) * 100 : 0 };
}

/** Whether `r` is worth a compaction: both thresholds must be met. */
export function worthCompacting(r: Reclaimable, minPct: number, minMb: number): boolean {
	return r.reclaimablePct >= minPct && r.reclaimableBytes >= minMb * 1024 * 1024;
}

/**
 * The open store's reclaimable space: pages in use summed over every named
 * database, plus the main and free-list trees, against the file size.
 * Undefined when the store is not open on this thread.
 */
export function graphStoreReclaimable(): Reclaimable | undefined {
	const inst = _instance;
	if (inst === null) return undefined;
	const root = inst.root.getStats() as TreePages & { pageSize: number; free?: TreePages };
	const trees: TreePages[] = [root, ...(root.free !== undefined ? [root.free] : [])];
	for (const [name, db] of Object.entries(inst)) {
		if (name !== 'root') trees.push((db as AnyDb).getStats() as TreePages);
	}
	return reclaimableFrom(trees, root.pageSize, statSync(_path).size);
}

// ---------------------------------------------------------------------------
// Compaction safety: the manifest, the check on open, crash recovery
// ---------------------------------------------------------------------------

/** What a swapped-in compacted copy must hold: entries per named database when the copy was taken. */
interface CompactionManifest {
	readonly version: 1;
	readonly counts: Readonly<Record<string, number>>;
	readonly lastTxnId: number;
	readonly writtenAt: string;
}

/** Where compaction stops as if the process were killed there (tests only). */
export type CompactionCrashPoint = 'before-swap' | 'after-manifest' | 'after-link' | 'after-rename';
let _crashAt: CompactionCrashPoint | undefined;

/** Thrown at the simulated crash point: nothing after it runs, so the files are as a kill -9 there leaves them. */
export class SimulatedCrash extends Error {
	constructor(readonly point: CompactionCrashPoint) { super(`simulated crash at ${point}`); }
}

/** Tests only: make the next compaction stop at `point`, leaving the files as a crash there would. */
export function setCompactionCrashPointForTests(point: CompactionCrashPoint | undefined): void {
	_crashAt = point;
}

function crashPoint(point: CompactionCrashPoint): void {
	if (_crashAt === point) { _crashAt = undefined; throw new SimulatedCrash(point); }
}

/** The outcome of the last check of a swapped-in copy on open (read by compactGraphStore). */
let _lastCompactionCheck: 'verified' | 'restored' | undefined;

function compactionPaths(path: string): { compactPath: string; bakPath: string; manifestPath: string; lockPath: string } {
	return { compactPath: `${path}.compact`, bakPath: `${path}.bak`, manifestPath: `${path}.compact-manifest`, lockPath: `${path}-lock` };
}

/** Entries per named database of the open store. */
function entryCounts(store: GraphStore): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const [name, db] of Object.entries(store)) {
		if (name === 'root') continue;
		counts[name] = ((db as AnyDb).getStats() as { entryCount: number }).entryCount;
	}
	return counts;
}

function lastTxnId(store: GraphStore): number {
	return (store.root.getStats() as { lastTxnId: number }).lastTxnId;
}

function fsyncFile(path: string): void {
	const fd = openSync(path, 'r+');
	try { fsyncSync(fd); } finally { closeSync(fd); }
}

function fsyncDir(path: string): void {
	let fd: number | undefined;
	try {
		fd = openSync(path, 'r');
		fsyncSync(fd);
	} catch (e) {
		// Some file systems refuse fsync on a directory; the renames are still atomic.
		log.debug({ path, err: errMessage(e) }, 'compaction: directory fsync not available');
	} finally {
		if (fd !== undefined) closeSync(fd);
	}
}

/**
 * Before the store opens: finish or roll back what an interrupted compaction
 * left. Returns the manifest to check the store against when a compacted copy
 * was swapped in and not yet checked.
 *
 *   - a .compact copy never replaced the store: removed;
 *   - no store file but a .bak (a crash between the two renames of a daemon
 *     before this change): the original is restored;
 *   - .bak is the store file itself (a crash before the swap): removed;
 *   - .bak differs and a manifest exists (a crash after the swap, before the
 *     check): kept, and the copy is checked on open;
 *   - .bak differs and no manifest (the check passed): removed.
 */
function recoverCompactionLeftovers(path: string): CompactionManifest | undefined {
	const { compactPath, bakPath, manifestPath, lockPath } = compactionPaths(path);
	if (existsSync(compactPath)) {
		rmSync(compactPath, { force: true });
		log.warn({ path: compactPath }, 'compaction recovery: removed a compacted copy that never replaced the store');
	}
	const hasBak = existsSync(bakPath);
	const manifest = readManifest(manifestPath);
	if (!existsSync(path)) {
		if (hasBak) {
			renameSync(bakPath, path);
			if (existsSync(lockPath)) rmSync(lockPath, { force: true });
			log.warn({ path }, 'compaction recovery: the store file was missing; restored the pre-compaction original');
		}
		if (existsSync(manifestPath)) rmSync(manifestPath, { force: true });
		return undefined;
	}
	if (hasBak) {
		const same = statSync(bakPath).ino === statSync(path).ino;
		if (!same && manifest !== undefined) {
			log.warn({ path }, 'compaction recovery: a compacted copy was swapped in and not checked; checking it on open');
			return manifest;
		}
		rmSync(bakPath, { force: true });
		log.warn({ path: bakPath, reason: same ? 'the swap never happened' : 'the copy was already checked' }, 'compaction recovery: removed the pre-compaction original');
	}
	if (existsSync(manifestPath)) rmSync(manifestPath, { force: true });
	return undefined;
}

function readManifest(path: string): CompactionManifest | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const m = JSON.parse(readFileSync(path, 'utf8')) as CompactionManifest;
		return m.version === 1 && typeof m.counts === 'object' ? m : undefined;
	} catch {
		// Torn (a crash while it was written, before .bak existed): nothing was swapped.
		return undefined;
	}
}

/** The checked copy stays: the manifest goes first, then .bak (a .bak without a manifest is known good to remove). */
function finishVerifiedCompaction(path: string): void {
	const { bakPath, manifestPath } = compactionPaths(path);
	rmSync(manifestPath, { force: true });
	fsyncDir(dirname(path));
	rmSync(bakPath, { force: true });
	log.info({ path }, 'compaction: the compacted copy matched the store it was taken from');
}

/** Put the original back under the store name (one atomic rename) and drop the manifest. */
function restoreFromBak(path: string): void {
	const { bakPath, manifestPath, lockPath } = compactionPaths(path);
	renameSync(bakPath, path);
	fsyncDir(dirname(path));
	if (existsSync(lockPath)) rmSync(lockPath, { force: true });
	rmSync(manifestPath, { force: true });
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
	// A failure that no call has met yet must be found HERE: the library's
	// close never returns once the semaphores are gone.
	if (currentHealth().state === 'ok') {
		const lost = probeForLockLoss(inst);
		if (lost !== undefined) recordLocksLost('closing the store', 'read', lost);
	}
	const health = currentHealth();
	if (health.state === 'locks-lost') {
		log.warn({ operation: health.operation, at: health.at }, 'lmdb graph store close skipped: the store lost its locks');
		return;
	}
	try {
		await inst.root.close();
	} catch (e) {
		log.warn({ err: errMessage(e) }, 'lmdb graph store close failed');
	}
}

// ---------------------------------------------------------------------------
// Txn helpers (Phase 1.5 will harden these with timing + retry)
// ---------------------------------------------------------------------------

/** A synchronous callback's result: a Promise-returning callback does not type-check. */
type SyncResult<T> = T extends PromiseLike<unknown> ? never : T;

function isThenable(v: unknown): boolean {
	return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function';
}

/**
 * Run `fn` inside an LMDB write transaction. Single-writer at a time
 * (LMDB serializes write txns); concurrent callers queue up. When `fn`
 * throws, nothing it wrote is kept and the promise rejects with its error.
 *
 * `fn` runs as an lmdb CHILD transaction (ISSUE-5437d6e5). lmdb's plain
 * `transaction()` batches many callers into one shared write transaction and
 * commits a throwing callback's writes; a child transaction is aborted on a
 * throw while its batch neighbours commit. `fn` must be synchronous: an async
 * child callback holds the write transaction open across its await, and a
 * second caller arriving then runs nested inside it and loses its writes if
 * the first throws. The type refuses a Promise-returning callback; at run
 * time a thenable result is refused by aborting the child; only what the
 * callback wrote before returning it is discarded. The refused Promise keeps
 * running: a write it makes after an await is a standalone lmdb write that
 * commits, and its rejection is swallowed so it cannot crash the process.
 * The compile-time type is the guard; the run-time refusal reports misuse.
 *
 * On a store that lost its locks the library's transaction NEVER settles, so
 * the wait is bounded: each time the bound passes, the store is probed with
 * one read. A probe that fails as a lock failure records it and rejects with
 * `LmdbStoreLocksLostError`; a probe that returns means the write is only
 * slow, and the wait goes on.
 */
export async function withWriteTxn<T>(
	fn: (store: GraphStore) => SyncResult<T>,
): Promise<T> {
	const store = await getGraphStore();
	const run = (): T => {
		const result = fn(store) as T;
		if (isThenable(result)) {
			// Never awaited: handle its rejection so it is not an unhandled rejection.
			(result as PromiseLike<unknown>).then(undefined, () => { /* refused callback */ });
			throw new Error('withWriteTxn callbacks must be synchronous');
		}
		return result;
	};
	// A child transaction nested in an open one returns a plain value, not a promise.
	const txn = Promise.resolve(store.root.childTransaction(run) as T | Promise<T>).then(value => ({ value }));

	for (;;) {
		let timer: NodeJS.Timeout | undefined;
		const bound = new Promise<'bound'>(res => { timer = setTimeout(() => res('bound'), _writeProbeAfterMs); });
		let outcome: { value: T } | 'bound';
		try {
			outcome = await Promise.race([txn, bound]);
		} catch (e) {
			// A write that does throw on such a store says only "invalid argument".
			throw confirmLockLoss(store, e, 'a write transaction', 'sync-write') ?? e;
		} finally {
			clearTimeout(timer);
		}
		if (outcome !== 'bound') return outcome.value;

		const lost = probeForLockLoss(store);
		if (lost !== undefined) {
			recordLocksLost('a write transaction', 'write-timeout-probe', lost);
			txn.catch(() => { /* abandoned: it will never settle */ });
			throw new LmdbStoreLocksLostError('a write transaction', lost);
		}
	}
}

/** For an error thrown by a WRITE: when it may be a lock failure (its code is
 *  22 or -30775), confirm with a probe read, since code 22 is the general
 *  "invalid argument" and the record cannot be cleared. Returns the named
 *  error when confirmed (and records it), undefined otherwise. */
function confirmLockLoss(
	store: GraphStore,
	e: unknown,
	operation: string,
	detectedBy: 'sync-write' | 'write-timeout-probe',
): LmdbStoreLocksLostError | undefined {
	if (e instanceof LmdbStoreLocksLostError) return e;
	const code = errCode(e);
	if (code !== EINVAL && code !== MDB_LOCK_FAILURE) return undefined;
	const lost = probeForLockLoss(store);
	if (lost === undefined) return undefined;
	recordLocksLost(operation, detectedBy, lost);
	return new LmdbStoreLocksLostError(operation, e);
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
	const health = currentHealth();
	if (health.state === 'locks-lost') throw new LmdbStoreLocksLostError(`a synchronous write (failed earlier during: ${health.operation})`);
	try {
		return store.root.transactionSync(fn);
	} catch (e) {
		throw confirmLockLoss(store, e, 'a synchronous write transaction', 'sync-write') ?? e;
	}
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
