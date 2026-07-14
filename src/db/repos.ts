/**
 * Repo registry CRUD on the LMDB graph store. Phase 2.1 of
 * plans/storage-migration-lmdb-lance.md.
 *
 * Surface preserved verbatim: callers (`daemon/index.ts`,
 * `indexer/index.ts`, RPC handlers) keep using `addRepo / removeRepo /
 * listRepos / updateRepoStatus` with the same parameter shapes. The
 * `db: DbClient` parameter is retained (vestigial) for caller back-
 * compat. Internally we route through the LMDB module singleton
 * (`getGraphStore`).
 *
 * Internal model:
 *   - Public API uses `path` as the externally-visible repo identifier
 *     (matching today's caller pattern).
 *   - LMDB key for the `repo` sub-DB is u32 sequential, allocated from
 *     the meta counter (`db/graph/ids.ts`). The mapping path → u32 is
 *     a linear scan of the small repo set (~hundreds, single-digit ms
 *     even at thousands).
 *   - Cross-cascade (delete repo → delete entities → delete edges)
 *     lands in Phase 2.10 once the other CRUD modules exist.
 */

import { statSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';

import type { RegisteredRepo } from '../shared/types.js';
import {
	getGraphStore,
	withWriteTxn,
	type GraphStore,
} from './graph/store.js';
import { allocateRepoIdInTxn } from './graph/ids.js';
import { encodeRepoKey } from './graph/keys.js';
import {
	encodeRepoRow,
	decodeRepoRow,
	type RepoRow,
	type RepoStatus,
} from './graph/codec.js';

/**
 * Paths we refuse to register as a repo. Includes filesystem root,
 * OS-level system dirs, volatile / temp dirs, and the parent dirs
 * that contain user homes (`/Users`, `/home`, `/root`). Registering
 * any of these as a repo would have the indexer scan a huge subtree
 * containing zero source code and many unrelated manifest files
 * (this caused the 2026-05-07 phantom-empty-repo bug where 14k
 * entities got attached to `repo=""`).
 *
 * Compared post-`path.resolve` so trailing slashes / `..` segments
 * normalise to the canonical form. Caller can still pass any
 * subdirectory under `/Users/<name>/...` -- only the bare prefixes
 * are banned.
 */
const BANNED_REPO_ROOTS = new Set([
	'/',
	'/tmp',
	'/var',
	'/usr',
	'/bin',
	'/sbin',
	'/etc',
	'/sys',
	'/proc',
	'/dev',
	'/root',
	'/Users',
	'/home',
	'/private',
	'/private/tmp',
	'/private/var',
	'/Library',
	'/System',
	'/Applications',
	'/Volumes',
	'/opt',
	'/Network',
	'/run',
	'/boot',
	'/srv',
	'/mnt',
	'/media',
]);

export class InvalidRepoPathError extends Error {
	constructor(message: string, override readonly cause?: unknown) {
		super(message);
		this.name = 'InvalidRepoPathError';
	}
}

/**
 * Shape-only validation: empty / absolute / banned-root checks.
 * No filesystem access -- safe to call against synthetic paths in
 * tests. Returns the normalised path on success.
 *
 * Throws `InvalidRepoPathError` on rejection. Used by `addRepo()`
 * (which can be called with synthetic paths in tests) as a defense-
 * in-depth check after the IPC handler's full validation.
 */
export function validateRepoPathShape(path: unknown): string {
	if (typeof path !== 'string') {
		throw new InvalidRepoPathError(`repo path must be a string (got ${typeof path})`);
	}
	if (path.length === 0) {
		throw new InvalidRepoPathError('repo path cannot be empty');
	}
	if (!isAbsolute(path)) {
		throw new InvalidRepoPathError(`repo path must be absolute: '${path}'`);
	}
	// `resolve` collapses trailing slashes, `.`, `..`, and on macOS
	// also normalises `/private/var/folders/...` -- canonical form is
	// what we compare to BANNED_REPO_ROOTS.
	const normalised = resolve(path);
	if (BANNED_REPO_ROOTS.has(normalised)) {
		throw new InvalidRepoPathError(
			`'${normalised}' is a system / volatile directory and cannot be registered as a repo`,
		);
	}
	return normalised;
}

/**
 * Full validation: shape + filesystem existence + isDirectory check.
 * Throws `InvalidRepoPathError` on rejection. Used by the `repo.add`
 * IPC handler so a bad path can never reach the LMDB registry.
 * Idempotent + side-effect-free; safe to call multiple times.
 */
export function validateRepoPath(path: unknown): string {
	const normalised = validateRepoPathShape(path);
	let stat: ReturnType<typeof statSync>;
	try {
		stat = statSync(normalised);
	} catch (err) {
		throw new InvalidRepoPathError(
			`'${normalised}' does not exist or is not accessible: ${(err as Error).message}`,
			err,
		);
	}
	if (!stat.isDirectory()) {
		throw new InvalidRepoPathError(`'${normalised}' is not a directory`);
	}
	return normalised;
}

/** Vestigial `DbClient` param shape, kept for caller back-compat. */
type DbClient = unknown;

// ---------------------------------------------------------------------------
// Public API (signatures unchanged from the DuckDB era)
// ---------------------------------------------------------------------------

export async function addRepo(_db: DbClient, repo: RegisteredRepo): Promise<void> {
	// Defense in depth -- shape-only validation here (no filesystem
	// existence check) so synthetic-path tests still work. The IPC
	// handler at `daemon/index.ts:repo.add` does the full validation
	// (shape + statSync) on the live path before any DB write.
	const normalisedPath = validateRepoPathShape(repo.path);
	const name = repo.name || basename(normalisedPath);
	await withWriteTxn(s => {
		const existing = findRepoIdByPath(s, normalisedPath);
		const id = existing ?? allocateRepoIdInTxn(s);
		const row: RepoRow = {
			id,
			kind:        'workspace',
			path:        normalisedPath,
			name,
			addedAt:     parseTimestamp(repo.addedAt),
			lastIndexed: parseOptionalTimestamp(repo.lastIndexed),
			status:      repo.status,
			errorMsg:    repo.errorMsg ?? '',
		};
		s.repo.put(encodeRepoKey(id), encodeRepoRow(row));
	});
}

export async function removeRepo(_db: DbClient, path: string): Promise<void> {
	// Phase 2.10 cascade: delete entities (which transitively cascades
	// to out_edge / in_edge mirrors + entity_id_by_string + name_index),
	// then unresolved relations for the repo, then conversation sessions
	// for the repo (which transitively cascades to turns + by_repo
	// index entries), then plans for the repo, then the repo row itself.
	//
	// LanceDB row cleanup (entity_vec / session_vec / turn_vec / config_
	// vec for entries belonging to this repo) is wired in Phase 3.x.
	const { deleteEntitiesForRepo } = await import('./entities.js');
	const { deleteUnresolvedForRepo } = await import('./relations.js');
	const { deleteSessionsForRepo } = await import('./conversations.js');
	// Cleanup: deletePlansForRepo (agent/tasks/plan-store) was the legacy
	// agent planner storage -- gone with the agent subsystem.

	await deleteEntitiesForRepo(null, path);
	await deleteUnresolvedForRepo(null, path);
	await deleteSessionsForRepo(null, path);

	await withWriteTxn(s => {
		const id = findRepoIdByPath(s, path);
		if (id === undefined) return;
		s.repo.remove(encodeRepoKey(id));
	});
}

/**
 * List all user-facing (workspace) repos. The four reserved
 * `kind: 'shared-modules'` rows (provisioned at first boot / by the
 * v2->v3 migration) are an implementation detail of the
 * repo-registry-strict-contract design and never appear here.
 *
 * Internal callers that need to see those rows iterate
 * `store.repo` directly inside a txn (see the v2->v3 migration in
 * `db/graph/migrations.ts` for the canonical pattern).
 */
export async function listRepos(_db: DbClient): Promise<RegisteredRepo[]> {
	const store = await getGraphStore();
	const out: RegisteredRepo[] = [];
	for (const { value } of store.repo.getRange()) {
		const row = decodeRepoRow(value as Buffer);
		if (row.kind !== 'workspace') continue;
		out.push(rowToRepo(row));
	}
	return out;
}

export async function updateRepoStatus(
	_db: DbClient,
	path: string,
	status: RegisteredRepo['status'],
	lastIndexed?: string,
	errorMsg?: string,
): Promise<void> {
	await withWriteTxn(s => {
		const id = findRepoIdByPath(s, path);
		if (id === undefined) {
			// Path isn't registered -- silently no-op to match the prior
			// DuckDB behaviour where the UPDATE matched zero rows.
			return;
		}
		const key = encodeRepoKey(id);
		const cur = s.repo.get(key);
		if (cur === undefined) return;
		const row = decodeRepoRow(cur as Buffer);
		const next: RepoRow = {
			...row,
			status:      status as RepoStatus,
			lastIndexed: parseOptionalTimestamp(lastIndexed),
			errorMsg:    errorMsg ?? '',
		};
		s.repo.put(key, encodeRepoRow(next));
	});
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Linear scan of the `repo` sub-DB looking for the row matching `path`.
 * O(N) where N is the repo count; expected ≤ a few hundred even on
 * heavy users. If N ever grows to thousands a `path → id` secondary
 * sub-DB is the obvious next step; not warranted today.
 *
 * Must be called inside a txn (the sync `getRange` iterator is bound
 * to the caller's txn snapshot).
 */
function findRepoIdByPath(store: GraphStore, path: string): number | undefined {
	for (const { key, value } of store.repo.getRange()) {
		const row = decodeRepoRow(value as Buffer);
		if (row.path === path) {
			return (key as Buffer).readUInt32BE(0);
		}
	}
	return undefined;
}

/**
 * Phase 5.x strict-contract: in-txn repoId lookup. Returns the
 * matching repoId or `undefined` if no row has this path.
 *
 * Use from inside a `withWriteTxn` / `withReadTxn` / `transaction`
 * callback. For non-txn callers use `lookupRepoId()` below (which
 * opens its own read txn).
 *
 * Linear scan of the repo sub-DB; cheap at typical scale (registry
 * holds < 100 rows in any realistic deployment).
 */
export function lookupRepoIdInTxn(store: GraphStore, path: string): number | undefined {
	return findRepoIdByPath(store, path);
}

/**
 * Phase 5.x strict-contract: standalone repoId lookup. Returns the
 * matching repoId or `undefined` if no row has this path. Opens
 * its own read txn; safe to call outside any other txn.
 */
export async function lookupRepoId(path: string): Promise<number | undefined> {
	if (typeof path !== 'string' || path.length === 0) return undefined;
	const store = await getGraphStore();
	return findRepoIdByPath(store, path);
}

/**
 * Thrown when a caller hands a `repoId` (or a `repo` path that
 * resolves to none) to a write site that requires the repo to be
 * pre-registered. The Phase 5.x strict-contract design makes
 * `addRepo()` the sole allocator; storage-layer auto-allocation
 * (the old `ensureRepo()` helper) is gone, so an unregistered
 * repo is a programming error -- the caller forgot to call
 * `addRepo()` first.
 */
export class UnregisteredRepoError extends Error {
	constructor(public readonly repo: string | number) {
		super(
			typeof repo === 'string'
				? `repo path '${repo}' is not registered (call addRepo() first)`
				: `repoId ${repo} is not registered (no row in the repo sub-DB)`,
		);
		this.name = 'UnregisteredRepoError';
	}
}

function rowToRepo(row: RepoRow): RegisteredRepo {
	const r: RegisteredRepo = {
		kind:    row.kind,
		path:    row.path,
		name:    row.name,
		addedAt: formatTimestamp(row.addedAt),
		status:  row.status,
	};
	if (row.namespace !== undefined) r.namespace   = row.namespace;
	if (row.lastIndexed > 0)         r.lastIndexed = formatTimestamp(row.lastIndexed);
	if (row.errorMsg !== '')         r.errorMsg    = row.errorMsg;
	return r;
}

function parseTimestamp(s: string): number {
	const n = Date.parse(s);
	return Number.isFinite(n) ? n : 0;
}

function parseOptionalTimestamp(s: string | undefined): number {
	if (s === undefined || s === '') return 0;
	return parseTimestamp(s);
}

function formatTimestamp(ms: number): string {
	return new Date(ms).toISOString();
}
