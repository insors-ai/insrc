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

import { dirname } from 'node:path';

import { loadConnections } from '../../daemon/db/config.js';
import type { LoadedConnections } from '../../daemon/db/config.js';
import { findEntitiesByFile, listEntitiesForRepo } from '../../db/entities.js';
import { listRepos } from '../../db/repos.js';
import type { AnalyzeScopeRef } from '../../shared/analyze-types.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, RegisteredRepo } from '../../shared/types.js';

import { ScopeNotIndexedError, ScopeRefUnresolvedError } from './invariants.js';

const log = getLogger('analyze:context:scope');

/** Separates the file path from the entity name in a symbol scope's value. */
export const SYMBOL_SEPARATOR = '#';

export interface ResolvedScope {
	readonly kind:  AnalyzeScopeRef['kind'];
	/** The value as the request gave it. */
	readonly value: string;
	/** The registered repo that contains the scope (longest prefix),
	 *  or the connection's repo; null when none is registered. */
	readonly repoPath: string | null;
	/** The directory lookups run in. */
	readonly lookupPath: string;
	/** file and symbol. */
	readonly filePath?: string;
	/** symbol. */
	readonly entityId?: string;
	/** symbol. */
	readonly entityName?: string;
	/** connection. */
	readonly connectionId?: string;
}

/** The readers resolveScope needs. Defaulted to the real stores; tests supply them. */
export interface ScopeDeps {
	listRepos(): Promise<readonly RegisteredRepo[]>;
	findEntitiesByFile(file: string): Promise<readonly Entity[]>;
	listEntitiesForRepo(repoPath: string): Promise<readonly Entity[]>;
	loadConnections(repoPath: string): Promise<LoadedConnections>;
}

const REAL_DEPS: ScopeDeps = {
	listRepos:           () => listRepos(null),
	findEntitiesByFile:  (file) => findEntitiesByFile(null, file),
	listEntitiesForRepo: (repoPath) => listEntitiesForRepo(null, repoPath),
	loadConnections,
};

export async function resolveScope(
	ref:  AnalyzeScopeRef,
	deps: ScopeDeps = REAL_DEPS,
): Promise<ResolvedScope> {
	switch (ref.kind) {
		case 'repo':
		case 'module':
		case 'manifest-dir':
		case 'workspace':
			return {
				kind:       ref.kind,
				value:      ref.value,
				repoPath:   await containingRepoOrNull(ref.value, deps),
				lookupPath: ref.value,
			};
		case 'file': {
			const repoPath = await containingRepoOrNull(ref.value, deps);
			return {
				kind:       'file',
				value:      ref.value,
				repoPath,
				lookupPath: repoPath ?? directoryOf(ref.value),
				filePath:   ref.value,
			};
		}
		case 'symbol':
			return resolveSymbol(ref.value, deps);
		case 'connection':
			return resolveConnection(ref.value, deps);
	}
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
		log.debug({ path, err: (err as Error).message }, 'resolveScope: registry read failed; repo unknown');
		return null;
	}
	return longestPrefixRepo(path, repos)?.path ?? null;
}

function directoryOf(filePath: string): string {
	const dir = dirname(filePath);
	return dir === '' || dir === '.' ? process.cwd() : dir;
}

async function resolveSymbol(value: string, deps: ScopeDeps): Promise<ResolvedScope> {
	const at = value.lastIndexOf(SYMBOL_SEPARATOR);
	const filePath = at === -1 ? '' : value.slice(0, at);
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
	const repoEntities = await deps.listEntitiesForRepo(repo.path);
	if (repoEntities.length === 0) {
		throw new ScopeNotIndexedError(
			filePath,
			repo.path,
			`registered repo has zero indexed entities (status: ${repo.status})`,
		);
	}

	const inFile = await deps.findEntitiesByFile(filePath);
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
		value,
		repoPath:   repo.path,
		lookupPath: repo.path,
		filePath,
		entityId:   entity.id,
		entityName: entity.name,
	};
}

async function resolveConnection(connectionId: string, deps: ScopeDeps): Promise<ResolvedScope> {
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
