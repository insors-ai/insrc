import { runWithConnectionExecution } from '../../shared/step-context.js';
import { captureAnalysisDiagnostics } from '../connection-access.js';
/**
 * Resolve a request's scope ONCE.
 *
 * A scope is a kind and a text value (`AnalyzeScopeRef`). What the
 * value means depends on the kind: a directory, a file, a symbol in a
 * file, or the id of a registered data connection. Everything that
 * needs "the repo", "the directory lookups run in", "the entity" or
 * "the connection" for a request takes it from a `ResolvedScope`
 * rather than reading the value itself.
 *
 * Rules per kind:
 *   - repo / module / manifest-dir / workspace: the value is a
 *     directory. Lookups run in THAT directory, whether or not a
 *     registered repo contains it.
 *   - file: the value is the file. Lookups run in the registered repo
 *     that contains it (longest prefix), else in the file's directory.
 *   - symbol: the value is `<absolute file path>#<entity name>`, split
 *     at the LAST '#'. The name must match exactly one stored entity
 *     of that file. A symbol cannot be served from the file system
 *     alone, so its repo must be registered and indexed.
 *   - connection: the value is a connection id. Connections are
 *     declared per repo; the id must be declared by exactly one
 *     registered repo, and lookups run in that repo.
 */

import { analysisConnectionContext, assertAnalysisConnectionExecution } from '../connection-access.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';
import { ConnectionExecutionError } from '../../shared/step-context.js';
import { savedConnectionResolver } from '../../daemon/db/pool-cache.js';
import { stat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';

import { loadConnections } from '../../daemon/db/config.js';
import type { LoadedConnections } from '../../daemon/db/config.js';
import { findEntitiesByFile, listEntitiesForRepo, repoHasAnyEntity } from '../../db/entities.js';
import { listRepos } from '../../db/repos.js';
import type { AnalyzeScopeRef, AnalyzeTarget } from '../../shared/analyze-types.js';
import { getLogger } from '../../shared/logger.js';
import { stepCwd } from '../../shared/step-context.js';
import type { Entity, RegisteredRepo } from '../../shared/types.js';
import type { DocsArea } from '../docs-retrieval.js';

import { TARGET_TO_KINDS } from '../classifier/validate.js';

import {
	ScopeKindTargetMismatchError,
	ScopeNotFoundError,
	ScopeNotIndexedError,
	ScopeRefUnresolvedError,
	ScopeRepoMismatchError,
} from './invariants.js';

const log = getLogger('analyze:context:scope');

/** Separates the file path from the entity name in a symbol scope's value. */
export const SYMBOL_SEPARATOR = '#';

export interface ResolvedScope {
	readonly kind:  AnalyzeScopeRef['kind'];
	/** The value, in its canonical spelling for a path (equivalent spellings give one value); as given for a connection. */
	readonly value: string;
	/** The registered repo that contains the scope (longest prefix),
	 *  or the connection's repo; null when none is registered. */
	readonly repoPath: string | null;
	/** The directory lookups run in. */
	readonly lookupPath: string;
	/** file and symbol. */
	readonly filePath?: string | undefined;
	/** symbol. */
	readonly entityId?: string | undefined;
	/** symbol. */
	readonly entityName?: string | undefined;
	/** connection. */
	readonly connectionId?: string | undefined;
	readonly connectionRevision?: string | undefined;
}

/** The readers resolveScope needs. Defaulted to the real stores; tests supply them. */
export interface ScopeDeps {
	/**
	 * The directory a relative path scope value is resolved against: the
	 * repository the call resolved (stepScope and prepareScope pass it).
	 * Absent, a relative path stays as given and `validateRequestScope`
	 * refuses it.
	 */
	readonly baseDir?: string | undefined;
	/** Test seam: how the validation reads the file system. Absent, the real file system. */
	readonly kindOfPath?: ((path: string) => Promise<'file' | 'directory' | 'other' | 'missing'>) | undefined;
	listRepos(): Promise<readonly RegisteredRepo[]>;
	findEntitiesByFile(file: string): Promise<readonly Entity[]>;
	listEntitiesForRepo(repoPath: string, opts?: { readonly limit: 1 } | undefined): Promise<readonly Entity[]>;
	loadConnections(repoPath: string): Promise<LoadedConnections>;
	/**
	 * OPTIONAL fast path (Epic c2ba6fa6 Story s3, ac4): whether a repo
	 * holds any stored entity, without building its entity list. When
	 * absent, callers fall back to `listEntitiesForRepo(...).length ===
	 * 0`. Optional (not required) so the ~30 existing files that
	 * construct a `ScopeDeps`-shaped object literal keep compiling and
	 * behaving unchanged.
	 */
	repoHasAnyEntity?: ((repoPath: string) => Promise<boolean>) | undefined;
}

const REAL_DEPS: ScopeDeps = {
	listRepos:           () => listRepos(null),
	findEntitiesByFile:  (file) => findEntitiesByFile(null, file),
	listEntitiesForRepo: (repoPath, opts) => listEntitiesForRepo(null, repoPath, opts),
	loadConnections,
	repoHasAnyEntity:    (repoPath) => repoHasAnyEntity(null, repoPath),
};

/** The scope readers with relative paths resolved against `baseDir` (the call's repository); `deps` unchanged when there is none. */
/** The validation's file-system reader for a set of scope readers: their seam, or the real one. */
export function checkDepsOf(deps: ScopeDeps | undefined): ScopeCheckDeps | undefined {
	return deps?.kindOfPath !== undefined ? { kindOfPath: deps.kindOfPath } : undefined;
}

export function scopeDepsWithBase(deps: ScopeDeps | undefined, baseDir: string | undefined): ScopeDeps | undefined {
	return baseDir === undefined ? deps : { ...(deps ?? REAL_DEPS), baseDir };
}

export async function resolveScope(
	ref: AnalyzeScopeRef,
	deps: ScopeDeps = REAL_DEPS,
	execution?: ConnectionExecutionContext,
): Promise<ResolvedScope> {
	assertAnalysisConnectionExecution(execution);
	const result = await runWithConnectionExecution(execution, () => resolveScopeUnchecked(ref, deps, execution));
	assertAnalysisConnectionExecution(execution);
	return result;
}

async function resolveScopeUnchecked(ref: AnalyzeScopeRef, deps: ScopeDeps, execution?: ConnectionExecutionContext): Promise<ResolvedScope> {
	switch (ref.kind) {
		case 'repo':
		case 'module':
		case 'manifest-dir':
		case 'workspace': {
			const path = canonicalPath(ref.value, deps.baseDir);
			return {
				kind:       ref.kind,
				value:      path,
				repoPath:   await containingRepoOrNull(path, deps),
				lookupPath: path,
			};
		}
		case 'file': {
			const path = canonicalPath(ref.value, deps.baseDir);
			const repoPath = await containingRepoOrNull(path, deps);
			return {
				kind:       'file',
				value:      path,
				repoPath,
				lookupPath: repoPath ?? directoryOf(path),
				filePath:   path,
			};
		}
		case 'symbol':
			return resolveSymbol(ref.value, deps);
		case 'connection':
			return resolveConnection(ref.value, deps, execution);
	}
}

/**
 * The one spelling of a path the analyzer uses for a scope: an absolute path
 * with `.`, `..`, repeated and trailing separators folded away. The same
 * spelling picks the containing repository, is statted by the validation, and
 * filters the entities, so `/work/a/../b/f.ts` is `/work/b/f.ts` everywhere.
 * A relative path is resolved against `baseDir` (the call's repository)
 * when one is given; with none it is left as it was and refused by
 * `validateRequestScope`. Lexical only:
 * symbolic links are not followed.
 */
export function canonicalPath(path: string, baseDir?: string | undefined): string {
	if (isAbsolute(path)) return resolvePath(path);
	return baseDir !== undefined && isAbsolute(baseDir) ? resolvePath(baseDir, path) : path;
}

/** The kinds of scope each kind of source accepts: the shape of `TARGET_TO_KINDS`. */
export type KindsPerTarget = Readonly<Record<AnalyzeTarget, ReadonlyArray<AnalyzeScopeRef['kind']>>>;

/**
 * Check that a kind of scope goes with a kind of source, then resolve
 * the scope. The pairing is tested against the classifier's table
 * BEFORE anything is resolved, so a refused pairing reads no store.
 */
export async function resolveScopeForTarget(
	ref:    AnalyzeScopeRef,
	target: AnalyzeTarget,
	deps?:  ScopeDeps,
	/** The table of kinds per kind of source. Always the classifier's; a test
	 *  passes a stand-in to show that no other list is consulted. */
	table:  KindsPerTarget = TARGET_TO_KINDS,
	execution?: ConnectionExecutionContext,
): Promise<ResolvedScope> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory' && target === 'data' && ref.kind !== 'connection' && ref.value !== execution.connectionAccess.lookupRoot) throw new ConnectionExecutionError('session-expired');
	if (!table[target].includes(ref.kind)) {
		throw new ScopeKindTargetMismatchError(ref.kind, target, table[target]);
	}
	return resolveScope(ref, deps, execution);
}

/**
 * The file-system path matched against the registry for a scope: to
 * find its repo's last-indexed time, and for the indexed check. A
 * connection has none -- an empty string says "no registered repo to
 * check" (a connection's data is not in the code graph).
 */
export function freshnessPathOf(scope: ResolvedScope): string {
	if (scope.kind === 'connection') return '';
	return scope.filePath ?? scope.value;
}

/** The registered repo containing `path` at a path-segment boundary; the longest wins. */
export function longestPrefixRepo(
	path:  string,
	repos: readonly RegisteredRepo[],
): RegisteredRepo | undefined {
	let best: RegisteredRepo | undefined;
	for (const r of repos) {
		const contains = path === r.path || path.startsWith(`${r.path}/`);
		if (!contains) continue;
		if (best === undefined || r.path.length > best.path.length) best = r;
	}
	return best;
}

/**
 * For the kinds that can be served from the file system: a registry
 * that cannot be read leaves the repo unknown rather than failing the
 * request (the code source's indexed check decides later).
 */
async function containingRepoOrNull(path: string, deps: ScopeDeps): Promise<string | null> {
	let repos: readonly RegisteredRepo[];
	try {
		repos = await deps.listRepos();
	} catch (err) {
		captureAnalysisDiagnostics(log).emit('debug', () => [{ path, err: (err as Error).message }, 'resolveScope: registry read failed; repo unknown']);
		return null;
	}
	return longestPrefixRepo(path, repos)?.path ?? null;
}

/** A bare file name resolves against the caller's directory: the step
 *  context's cwd inside a step call, process.cwd() outside one. */
function directoryOf(filePath: string): string {
	const dir = dirname(filePath);
	return dir === '' || dir === '.' ? stepCwd() : dir;
}

async function resolveSymbol(value: string, deps: ScopeDeps): Promise<ResolvedScope> {
	const at = value.lastIndexOf(SYMBOL_SEPARATOR);
	const rawFile  = at === -1 ? '' : value.slice(0, at);
	const filePath = rawFile.length === 0 ? '' : canonicalPath(rawFile, deps.baseDir);
	const name     = at === -1 ? '' : value.slice(at + 1);
	if (filePath.length === 0 || name.length === 0) {
		throw new ScopeRefUnresolvedError(
			`kind='symbol' expects '<absolute file path>${SYMBOL_SEPARATOR}<entity name>'; got '${value}'.`,
		);
	}

	// A symbol resolves to a stored entity, so the index is checked
	// BEFORE the entity is looked for: otherwise a symbol in a repo
	// that is not indexed would be reported as "no entity of that name".
	const repos = await deps.listRepos();
	const repo = longestPrefixRepo(filePath, repos);
	if (repo === undefined) {
		throw new ScopeNotIndexedError(filePath, undefined, 'no registered repo contains the scope path');
	}
	// The file's own entities are what is needed, and finding any is
	// proof the repo is indexed. Only when the file has none is the
	// first repository match read, to tell "the repo is not indexed" from "this file
	// holds no entities" -- so a symbol that resolves costs one read.
	const inFile = await deps.findEntitiesByFile(filePath);
	if (inFile.length === 0) {
		const repoEntities = await deps.listEntitiesForRepo(repo.path, { limit: 1 });
		if (repoEntities.length === 0) {
			throw new ScopeNotIndexedError(
				filePath,
				repo.path,
				`registered repo has zero indexed entities (status: ${repo.status})`,
			);
		}
	}
	const matches = inFile.filter(e => e.name === name);
	if (matches.length === 0) {
		throw new ScopeRefUnresolvedError(
			`kind='symbol': no stored entity named '${name}' in '${filePath}'.`,
		);
	}
	if (matches.length > 1) {
		const listed = matches
			.map(e => `${e.kind} '${e.name}' at line ${e.startLine}`)
			.join('; ');
		throw new ScopeRefUnresolvedError(
			`kind='symbol': ${matches.length} stored entities named '${name}' in '${filePath}' (${listed}).`,
		);
	}
	const entity = matches[0]!;
	return {
		kind:       'symbol',
		value:      `${filePath}${SYMBOL_SEPARATOR}${name}`,
		repoPath:   repo.path,
		lookupPath: repo.path,
		filePath,
		entityId:   entity.id,
		entityName: entity.name,
	};
}

/**
 * Is `connectionId` declared by at least one registered repo? The
 * classifier's validator asks this for a connection scope. (Whether
 * exactly one repo declares it is decided when the scope is resolved.)
 * An unreadable connections file is reported, not skipped.
 */
export async function connectionIsRegistered(
	connectionId: string,
	deps: ScopeDeps = REAL_DEPS,
	execution?: ConnectionExecutionContext,
): Promise<boolean> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory') {
		const entries = await savedConnectionResolver.list(analysisConnectionContext(execution.connectionAccess.lookupRoot, execution));
		assertAnalysisConnectionExecution(execution);
		return entries.some(entry => entry.key.id === connectionId);
	}
	const repos = await deps.listRepos();
	// Serial on purpose: one file read per repo, in registry order.
	for (const repo of repos) {
		let loaded: LoadedConnections;
		try {
			loaded = await deps.loadConnections(repo.path);
		} catch (err) {
			throw new ScopeRefUnresolvedError(
				`Connection '${connectionId}' could not be checked: the connections file of ` +
					`repo '${repo.path}' could not be read (${(err as Error).message}).`,
			);
		}
		if (loaded.resolved.some(c => c.id === connectionId)) return true;
	}
	return false;
}

async function resolveConnection(connectionId: string, deps: ScopeDeps, execution?: ConnectionExecutionContext): Promise<ResolvedScope> {
	if (execution?.mode === 'session-memory') {
		const root = execution.connectionAccess.lookupRoot;
		const entries = await savedConnectionResolver.list(analysisConnectionContext(root, execution));
		assertAnalysisConnectionExecution(execution);
		const entry = entries.find(candidate => candidate.key.id === connectionId);
		if (!entry) throw new ScopeRefUnresolvedError('Connection is not available at the attached root.');
		return { kind: 'connection', value: connectionId, repoPath: root, lookupPath: root, connectionId, connectionRevision: entry.revision };
	}
	const repos = await deps.listRepos();
	const declaring: string[] = [];
	// Serial on purpose: one file read per repo, in registry order.
	for (const repo of repos) {
		let loaded: LoadedConnections;
		try {
			loaded = await deps.loadConnections(repo.path);
		} catch (err) {
			// Not skipped: the unreadable file could be the one that
			// declares the id, or could hide a second declaration.
			throw new ScopeRefUnresolvedError(
				`Connection '${connectionId}' could not be resolved: the connections file of ` +
					`repo '${repo.path}' could not be read (${(err as Error).message}).`,
			);
		}
		if (loaded.resolved.some(c => c.id === connectionId)) declaring.push(repo.path);
	}
	if (declaring.length === 0) {
		throw new ScopeRefUnresolvedError(`Connection '${connectionId}' is not registered in any repo.`);
	}
	if (declaring.length > 1) {
		throw new ScopeRefUnresolvedError(
			`Connection '${connectionId}' is registered in ${declaring.length} repos ` +
				`(${declaring.join(', ')}); name the repo instead.`,
		);
	}
	const repoPath = declaring[0]!;
	return {
		kind:         'connection',
		value:        connectionId,
		repoPath,
		lookupPath:   repoPath,
		connectionId,
	};
}

// ---------------------------------------------------------------------------
// What a reader of the stored graph does with its resolved scope
// ---------------------------------------------------------------------------

/**
 * The repo whose stored entities a task reads: the registered repo that
 * contains the scope, or, where none is known (the registry could not be read
 * or holds no repo), the scope's own directory, as before.
 */
export function graphRepoOf(scope: ResolvedScope): string {
	return scope.repoPath ?? scope.lookupPath;
}

/**
 * Whether an entity of that repo lies in the AREA the scope names:
 *   - symbol: the one entity;
 *   - file: the entities of that file;
 *   - module: the entities whose file lies under the directory;
 *   - repo, manifest directory, workspace: the directory too. When it IS the
 *     repo that was read, every entity is kept untouched, exactly as before;
 *     when it is a directory inside that repo, only what lies under it.
 */
/**
 * The key graph reads are given at the places a plan context is built: the
 * containing registered repository for a scope that names an AREA (module,
 * manifest directory, file, symbol, connection), and, for a repo or workspace
 * scope, the value it has always had (its own path), so those callers see no change.
 */
export function planRepoOf(scope: ResolvedScope): string {
	return scope.kind === 'repo' || scope.kind === 'workspace' ? scope.lookupPath : graphRepoOf(scope);
}

export function inAreaOf(scope: ResolvedScope): (entity: { readonly id: string; readonly file: string }) => boolean {
	if (scope.kind === 'symbol') return e => e.id === scope.entityId;
	if (scope.kind === 'file') return e => e.file === scope.filePath;
	const dir = scope.lookupPath;
	if (scope.kind !== 'module' && dir === graphRepoOf(scope)) return () => true;
	return e => e.file === dir || e.file.startsWith(`${dir}/`);
}

/**
 * The area of a docs scope, for a task that hands its selection to document
 * retrieval: the file of a file scope, the directory of a module scope or of a
 * directory inside the repo that is read. Undefined when the scope takes the
 * whole repo, so that retrieval is called exactly as before.
 */
export function docsAreaOf(scope: ResolvedScope): DocsArea | undefined {
	if (scope.kind === 'file' && scope.filePath !== undefined) return { file: scope.filePath };
	if (scope.kind !== 'module' && scope.lookupPath === graphRepoOf(scope)) return undefined;
	return { directory: scope.lookupPath };
}

/** The area a request names, when it is narrower than the repository it lies in. */
export type ScopeArea =
	| { readonly kind: 'dir';    readonly path: string }
	| { readonly kind: 'file';   readonly path: string }
	| { readonly kind: 'symbol'; readonly entityId: string; readonly filePath: string };

/**
 * The area a scope names, or null when it is the whole repository (a
 * workspace, repo or connection scope, or a directory that is the repo
 * itself), so that a caller keeps its behaviour exactly as before. A symbol's
 * area is the one entity, the same entity the request sizing reads.
 */
export function scopeArea(scope: ResolvedScope): ScopeArea | null {
	if (scope.kind === 'symbol') {
		return scope.entityId !== undefined && scope.filePath !== undefined
			? { kind: 'symbol', entityId: scope.entityId, filePath: scope.filePath }
			: null;
	}
	if (scope.kind === 'file') return scope.filePath !== undefined ? { kind: 'file', path: scope.filePath } : null;
	if (scope.kind === 'connection' || scope.kind === 'workspace' || scope.kind === 'repo') return null;
	// module and manifest-dir: a directory, unless it is the repository itself
	return scope.kind !== 'module' && scope.lookupPath === graphRepoOf(scope) ? null : { kind: 'dir', path: scope.lookupPath };
}

/** A stable text for the area, for a cache key: `repo` for the whole repository. */
export function scopeAreaKey(scope: ResolvedScope): string {
	const area = scopeArea(scope);
	if (area === null) return 'repo';
	return area.kind === 'symbol' ? `symbol:${area.entityId}` : `${area.kind}:${area.path}`;
}

// ---------------------------------------------------------------------------
// The validation of a request's scope
// ---------------------------------------------------------------------------

/** The file-system reader of the validation; a test supplies a stand-in. */
export interface ScopeCheckDeps {
	kindOfPath(path: string): Promise<'file' | 'directory' | 'other' | 'missing'>;
}

const REAL_CHECK_DEPS: ScopeCheckDeps = {
	async kindOfPath(path) {
		try {
			const info = await stat(path);
			return info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other';
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return 'missing';
			throw err;
		}
	},
};

/**
 * Check a resolved scope against the file system and the call's repository.
 * A file scope must name a regular file; a module or manifest-dir scope a
 * directory; a file, module, manifest-dir or symbol scope that lies in a
 * registered repository must lie in `expectedRepo`. A path that exists and
 * holds no stored entity is a valid empty area. Workspace, repo and
 * connection scopes are left to the existing checks.
 *
 * @throws ScopeNotFoundError      the path is missing or the wrong kind of path.
 * @throws ScopeRepoMismatchError  the scope lies in another registered repository.
 */
export async function validateRequestScope(
	scope:        ResolvedScope,
	expectedRepo: string | undefined,
	deps:         ScopeCheckDeps = REAL_CHECK_DEPS,
): Promise<void> {
	if (scope.kind === 'workspace' || scope.kind === 'repo' || scope.kind === 'connection') return;
	if (scope.kind === 'file' || scope.kind === 'module' || scope.kind === 'manifest-dir') {
		const path  = scope.kind === 'file' ? (scope.filePath ?? scope.lookupPath) : scope.lookupPath;
		// A relative path has one spelling per caller directory, never one canonical value: it is refused, not guessed.
		if (!isAbsolute(path)) throw new ScopeNotFoundError(scope.kind, path, 'not an absolute path');
		const found = await deps.kindOfPath(path);
		const want  = scope.kind === 'file' ? 'file' : 'directory';
		if (found === 'missing') throw new ScopeNotFoundError(scope.kind, path, 'missing');
		if (found !== want) throw new ScopeNotFoundError(scope.kind, path, want === 'file' ? 'not a file' : 'not a directory');
	}
	// The scope's registered repository must be the call's: a nested registered repository is another repository.
	const at = scope.filePath ?? scope.lookupPath;
	if (expectedRepo !== undefined && scope.repoPath !== null && scope.repoPath !== expectedRepo) {
		throw new ScopeRepoMismatchError(at, scope.repoPath, expectedRepo);
	}
}
