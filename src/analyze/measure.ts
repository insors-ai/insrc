/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The request measure (LLD-b9d5c5c40df5a574-s2, shared contract sc3).
 *
 * A request's size is counted from what the request touches and mapped to one
 * of the five sizes by ONE table, here. Nothing else in the analyzer maps a
 * count to a size, and no size is picked by a model or assumed.
 *
 * A measure has one of three sources:
 *   - 'named-area'     the stored entities of the area a scope names;
 *   - 'data-source'    the objects of a live data source;
 *   - 'lookup-results' what the lookups of an executed plan returned.
 *
 * A request that cannot be counted is the largest size, with `determined`
 * false and the reason in `note`. A size a caller states is kept as
 * `sizeHint` and never changes `size`.
 *
 * The file has two halves. The first holds the type, the table and the
 * functions that work on what they are given: they read no store. The second
 * is the measuring pass, which resolves a scope and counts it from the stored
 * graph, from the disk or from a live data source. Nothing here calls a model,
 * and the measuring pass never throws: a count it cannot take is a measure
 * that is not determined.
 */

import { listFilesForConnection } from '../daemon/db/list-files.js';
import { listEntitiesForRepo } from '../db/entities.js';
import { listRepos } from '../db/repos.js';
import type { AnalyzeScope, AnalyzeScopeRef, AnalyzeTarget, ClassifiedIntent } from '../shared/analyze-types.js';
import type { KvDriver, RdbmsDriver } from '../shared/db-driver.js';
import type { Entity, RegisteredRepo } from '../shared/types.js';
import { scopeErrorMapping } from './context/invariants.js';
import { resolveScopeForTarget } from './context/scope.js';
import type { ResolvedScope, ScopeDeps } from './context/scope.js';
import { isCompletenessRecord } from './completeness.js';

// The measure's one line is written with the completeness line, by a module
// that loads no store: the agent tools' process reads it and opens none.
export { renderMeasureLine } from './completeness.js';
import { filesNamedBy } from './explore/types.js';
import type { ExecutedExploration } from './explore/types.js';
import { acquireDataPool, dataScopeOf } from './runtimes/data/_shared.js';
import type { DataScope } from './runtimes/data/_shared.js';
import { walkFiles } from './runtimes/infra/_shared.js';
import { liesUnder } from './runtimes/shared/source-modules.js';
import { inAreaOf, resolveTaskScope } from './runtimes/shared/task-scope.js';

/** What a request touched, and the size it maps to. */
export interface RequestMeasure {
	readonly source:     'lookup-results' | 'named-area' | 'data-source';
	/** Entities of the named area, objects of the data source, or items the lookups returned. */
	readonly items:      number;
	/** Distinct files those items lie in; 0 for a relational or key-value source. */
	readonly files:      number;
	/** Length of the lookup results as the answer step is given them; null for the other two sources. */
	readonly characters: number | null;
	readonly size:       AnalyzeScope;
	/** False: no count could be taken. `size` is then 'XL', `items` and `files` are 0, and `note` says why. */
	readonly determined: boolean;
	/** What a caller, a slash command or the planner model stated. Never affects `size`. */
	readonly sizeHint?:  AnalyzeScope | undefined;
	readonly note?:      string | undefined;
}

/** An intent with no size yet: what the classifier returns and what a caller of the context builder passes. */
export type UnsizedIntent = Omit<ClassifiedIntent, 'scope'>;

/**
 * The one table from counts to sizes: the upper bounds of XS, S, M and L for
 * each of the two counts. A count above the last bound is XL.
 */
export const SIZE_THRESHOLDS = {
	files: [1, 20, 200, 1500],
	items: [50, 500, 5000, 20000],
} as const;

const SIZES: readonly AnalyzeScope[] = ['XS', 'S', 'M', 'L', 'XL'];

/** The position of a count among a column's bounds: 0 for XS up to 4 for XL. */
function rank(count: number, bounds: readonly number[], what: string): number {
	if (!Number.isInteger(count) || count < 0) {
		throw new RangeError(`sizeOfCounts: ${what} must be a whole number that is not negative; got ${count}`);
	}
	const at = bounds.findIndex(bound => count <= bound);
	return at === -1 ? bounds.length : at;
}

/**
 * The size of two counts: the larger of the two sizes the table gives, so that
 * a few very large files, or many small ones, are not sized too small.
 *
 * @throws RangeError a count is negative or not a whole number
 */
export function sizeOfCounts(counts: { readonly files: number; readonly items: number }): AnalyzeScope {
	const byFiles = rank(counts.files, SIZE_THRESHOLDS.files, 'files');
	const byItems = rank(counts.items, SIZE_THRESHOLDS.items, 'items');
	return SIZES[Math.max(byFiles, byItems)]!;
}

/** A measure of a count that was taken. */
function determined(
	source:     RequestMeasure['source'],
	counts:     { readonly files: number; readonly items: number },
	characters: number | null,
	sizeHint:   AnalyzeScope | undefined,
): RequestMeasure {
	return {
		source,
		items:      counts.items,
		files:      counts.files,
		characters,
		size:       sizeOfCounts(counts),
		determined: true,
		...(sizeHint !== undefined ? { sizeHint } : {}),
	};
}

/**
 * The measure of a request whose count could not be taken: the largest size,
 * with the reason. A count taken of part of the area goes in the note, never
 * in `items` or `files`.
 */
export function notDetermined(
	source:   RequestMeasure['source'],
	note:     string,
	sizeHint?: AnalyzeScope,
): RequestMeasure {
	return {
		source,
		items:      0,
		files:      0,
		characters: null,
		size:       'XL',
		determined: false,
		...(sizeHint !== undefined ? { sizeHint } : {}),
		note,
	};
}

/**
 * The measure of the area a scope names, from the stored entities of the repo
 * that was read.
 *
 * @param scope    the request's scope, resolved by the one scope function
 * @param entities ALL stored entities of that repo; they are narrowed here with
 *                 the scope's area predicate, so a module, file or symbol scope
 *                 counts its own area and not the whole repo
 */
export function measureNamedArea(
	scope:     ResolvedScope,
	entities:  readonly Entity[],
	sizeHint?: AnalyzeScope,
): RequestMeasure {
	const inArea = inAreaOf(scope);
	const files = new Set<string>();
	let items = 0;
	for (const e of entities) {
		if (!inArea(e)) continue;
		items += 1;
		// By path, so the count does not depend on a parser storing a 'file' entity.
		if (e.file.length > 0) files.add(e.file);
	}
	return determined('named-area', { files: files.size, items }, null, sizeHint);
}

/** Said when no lookup of an executed plan returned a result to count. */
export const NO_LOOKUP_RESULT_TO_COUNT = 'no lookup returned a result to count: every lookup failed or is not supported';

/**
 * The measure of a request from what its lookups returned.
 *
 * `items` is the sum of the returned counts of the outputs that carry a
 * completeness record; a failed or unsupported lookup adds nothing, also when
 * it carries partial findings. `files` is the distinct paths the outputs name,
 * through `filesNamedBy`. `characters` is the length of those outputs as the
 * answer step is given them; it is recorded for the handling of large results
 * and does not take part in the size.
 */
export function measureLookupResults(
	results:   readonly ExecutedExploration[],
	sizeHint?: AnalyzeScope,
): RequestMeasure {
	const files = new Set<string>();
	let items = 0;
	let characters = 0;
	let counted = 0;
	/** The lookups whose output does not have the shape of its type, so the files it names cannot be read. */
	const unreadable: string[] = [];
	for (const r of results) {
		const output = r.output;
		if (output.type === 'failed' || output.type === 'unsupported') continue;
		if (!isCompletenessRecord(output.completeness)) continue;
		counted += 1;
		items += output.completeness.returned;
		// The measure is taken after the lookups ran and before the answer is
		// written. An output that is not shaped as its type says is a defect of
		// its lookup; it must not cost the request its answer, so it is named in
		// the measure's note and its files are not counted.
		try {
			for (const file of filesNamedBy(output)) files.add(file);
		} catch {
			unreadable.push(`${r.exploration.type} [${r.exploration.id}]`);
		}
		// The answer step is given each output as indented JSON.
		characters += JSON.stringify(output, null, 2).length;
	}
	if (counted === 0) return notDetermined('lookup-results', NO_LOOKUP_RESULT_TO_COUNT, sizeHint);
	const measure = determined('lookup-results', { files: files.size, items }, characters, sizeHint);
	if (unreadable.length === 0) return measure;
	return { ...measure, note: `the files named by ${unreadable.length} result(s) could not be read and are not counted: ${unreadable.join(', ')}` };
}

// ---------------------------------------------------------------------------
// The measuring pass
// ---------------------------------------------------------------------------

/** What the measuring pass reads through; a test stands its own readers in. */
export interface MeasureDeps {
	/** The scope function's readers (the registry, the stored entities, the connections file). */
	readonly scope?:        ScopeDeps | undefined;
	/** All stored entities of a repo. */
	readonly listEntities?: ((repoPath: string) => Promise<readonly Entity[]>) | undefined;
	/** The registered repos. */
	readonly listRepos?:    (() => Promise<readonly RegisteredRepo[]>) | undefined;
	/** The infra tasks' file walk. */
	readonly walk?:         typeof walkFiles | undefined;
}

let depsForTest: MeasureDeps | undefined;
/** Test seam: pass undefined to go back to the real stores and the real disk. */
export function _setMeasureDepsForTest(deps: MeasureDeps | undefined): void {
	depsForTest = deps;
}

const readEntities = (repoPath: string): Promise<readonly Entity[]> =>
	depsForTest?.listEntities !== undefined ? depsForTest.listEntities(repoPath) : listEntitiesForRepo(null, repoPath);
const readRepos = (): Promise<readonly RegisteredRepo[]> =>
	depsForTest?.listRepos !== undefined ? depsForTest.listRepos() : listRepos(null);

const reasonOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The source a measure of this scope would have had, for one that could not be taken. */
function sourceFor(kind: AnalyzeScopeRef['kind'], target: AnalyzeTarget): RequestMeasure['source'] {
	return kind === 'connection' || target === 'data' ? 'data-source' : 'named-area';
}

/**
 * The one measuring pass for a request that has run no lookup: resolve the
 * scope, then count it.
 *
 * A code, docs, infra or data request is resolved with the scope function of
 * the plan tasks, which checks the index for code and docs; a generic request
 * with the generic resolution, which that function does not accept.
 *
 * Never throws. Every rejection of the resolution is caught, not only the
 * scope errors: the registry and the store are read while a symbol or a
 * connection is resolved and while the index is checked, and any of those
 * reads can fail.
 */
export async function measureRequestScope(
	scopeRef:  AnalyzeScopeRef,
	target:    AnalyzeTarget,
	sizeHint?: AnalyzeScope,
): Promise<RequestMeasure> {
	let scope: ResolvedScope;
	try {
		scope = target === 'generic'
			? await resolveScopeForTarget(scopeRef, 'generic', depsForTest?.scope)
			: await resolveTaskScope(scopeRef, target, 'the request measure', depsForTest?.scope);
	} catch (err) {
		const scoped = scopeErrorMapping(err);
		const note = scoped !== undefined
			? scoped.message
			: `the scope could not be resolved, because a read of the registry or the store failed (${reasonOf(err)})`;
		return notDetermined(sourceFor(scopeRef.kind, target), note, sizeHint);
	}
	return measureResolvedScope(scope, target, sizeHint);
}

/**
 * The measure of a scope that is already resolved. What is counted depends on
 * the kind of source:
 *
 *   - a connection scope, of a data or a generic request: the live source;
 *   - any other scope of a data request: the connections registered at it;
 *   - infra: the files the infra tasks' own walk visits under the directory;
 *   - code, docs and generic: the stored entities of the scope's area.
 *
 * Never throws: a read that fails gives a measure that is not determined.
 */
export async function measureResolvedScope(
	scope:     ResolvedScope,
	target:    AnalyzeTarget,
	sizeHint?: AnalyzeScope,
): Promise<RequestMeasure> {
	try {
		if (scope.kind === 'connection') return await measureDataSource(dataScopeOf(scope), sizeHint);
		if (target === 'data') return await measureDataPool(dataScopeOf(scope).poolPath, sizeHint);
		if (target === 'infra') return await measureInfraDirectory(scope.lookupPath, sizeHint);
		return await measureStoredArea(scope, sizeHint);
	} catch (err) {
		return notDetermined(sourceFor(scope.kind, target), `the count could not be taken (${reasonOf(err)})`, sizeHint);
	}
}

/**
 * The stored entities of a scope's area. This is a count only when a
 * registered repo contains the scope and holds stored entities: a count of
 * zero taken from a path the index does not hold would size an unindexed
 * request as the smallest.
 */
async function measureStoredArea(scope: ResolvedScope, sizeHint: AnalyzeScope | undefined): Promise<RequestMeasure> {
	if (scope.repoPath === null) {
		// A workspace above the repos: the sum over the registered repos under it.
		if (scope.kind === 'workspace') return measureReposUnder(scope.lookupPath, sizeHint);
		return notDetermined('named-area',
			`the index holds nothing for the path ${scope.lookupPath}: no registered repository contains it`, sizeHint);
	}
	const entities = await readEntities(scope.repoPath);
	if (entities.length === 0) {
		return notDetermined('named-area',
			`the index holds nothing for the path ${scope.lookupPath}: the repository ${scope.repoPath} holds no stored entity`, sizeHint);
	}
	return measureNamedArea(scope, entities, sizeHint);
}

/** A workspace that no registered repo contains: every registered repo under it, each read once. */
async function measureReposUnder(workspace: string, sizeHint: AnalyzeScope | undefined): Promise<RequestMeasure> {
	const repos = (await readRepos()).filter(r => r.kind !== 'shared-modules' && liesUnder(workspace, r.path));
	if (repos.length === 0) {
		return notDetermined('named-area', `no registered repository lies under the workspace ${workspace}`, sizeHint);
	}
	const files = new Set<string>();
	let items = 0;
	// One repo after another: the store is read serially.
	for (const repo of repos) {
		const entities = await readEntities(repo.path);
		if (entities.length === 0) {
			return notDetermined('named-area',
				`the repository ${repo.path} under the workspace ${workspace} holds no stored entity`, sizeHint);
		}
		items += entities.length;
		for (const e of entities) {
			if (e.file.length > 0) files.add(e.file);
		}
	}
	return determined('named-area', { files: files.size, items }, null, sizeHint);
}

/**
 * An infra request: the files the infra tasks' own walk visits under the
 * directory, walked to the end. The stored graph is not used, because the
 * infra tasks do not read it. (The stakeholder's decision of 2026-10-09.)
 */
async function measureInfraDirectory(root: string, sizeHint: AnalyzeScope | undefined): Promise<RequestMeasure> {
	const walk = depsForTest?.walk ?? walkFiles;
	let walked: Awaited<ReturnType<typeof walkFiles>>;
	try {
		walked = await walk(root, null);
	} catch (err) {
		return notDetermined('named-area', `the directory ${root} could not be read (${reasonOf(err)})`, sizeHint);
	}
	const count = walked.files.length;
	if (walked.unreadable.length > 0) {
		const named = walked.unreadable.map(u => u.what).join(', ');
		return notDetermined('named-area',
			`${walked.unreadable.length} of the directories under ${root} could not be read (${named}); ` +
			`${count} files were counted in the rest`, sizeHint);
	}
	if (walked.truncated) {
		return notDetermined('named-area', `the walk of ${root} was cut at ${count} files`, sizeHint);
	}
	return determined('named-area', { files: count, items: count }, null, sizeHint);
}

/** A measure of a data source's objects: compared with the FILES column of the table. */
function dataMeasure(objects: number, files: number, sizeHint: AnalyzeScope | undefined): RequestMeasure {
	return {
		source:     'data-source',
		items:      objects,
		files,
		characters: null,
		// A table, a collection or a file is the unit a data analysis reads, as a file is for code.
		size:       sizeOfCounts({ files: objects, items: 0 }),
		determined: true,
		...(sizeHint !== undefined ? { sizeHint } : {}),
	};
}

/** The key-value kinds whose namespace listing is a sample of keys, not a list of what exists. */
const SAMPLED_KINDS: ReadonlySet<string> = new Set(['redis', 'valkey', 'keydb', 'etcd']);

/**
 * The measure of one live data source: its tables, its namespaces or its
 * files, through the complete mode of the driver's own listing.
 *
 * Not determined, each with its own reason, when the source cannot be
 * reached; the driver has no listing or answers that listing is not
 * supported; the listing fails or reports that it was cut; or the source is
 * one whose listing is a sample of keys. It never starts a scan of a live
 * store's keys.
 */
export async function measureDataSource(scope: DataScope, sizeHint?: AnalyzeScope): Promise<RequestMeasure> {
	const nd = (note: string): RequestMeasure => notDetermined('data-source', note, sizeHint);
	const id = scope.connectionId;
	if (id === undefined) return nd('no connection is named: a data source is measured one connection at a time');

	let pool: Awaited<ReturnType<typeof acquireDataPool>>;
	let driver: Awaited<ReturnType<typeof pool.acquire>>;
	try {
		pool = await acquireDataPool(scope.poolPath);
		await pool.reload();
		driver = await pool.acquire(id);
	} catch (err) {
		return nd(`the source '${id}' cannot be reached (${reasonOf(err)})`);
	}

	try {
		switch (driver.family) {
			case 'rdbms': {
				const r = driver as RdbmsDriver;
				if (typeof r.listTables !== 'function') return nd(`the driver '${driver.kind}' of '${id}' has no table listing`);
				const listing = await r.listTables({ complete: true });
				if (listing.truncated) return nd(`the table listing of '${id}' was cut at ${listing.tables.length} tables`);
				return dataMeasure(listing.tables.length, 0, sizeHint);
			}
			case 'kv': {
				if (SAMPLED_KINDS.has(driver.kind)) {
					return nd(`the source '${id}' (${driver.kind}) has no namespaces to count; its listing is a sample of keys`);
				}
				const k = driver as KvDriver;
				if (typeof k.listNamespaces !== 'function') return nd(`the driver '${driver.kind}' of '${id}' has no namespace listing`);
				const listing = await k.listNamespaces({ complete: true });
				if (!listing.supported) return nd(`the source '${id}' (${driver.kind}) answers that listing its namespaces is not supported`);
				if (listing.truncated) return nd(`the namespace listing of '${id}' was cut at ${listing.namespaces.length} namespaces`);
				return dataMeasure(listing.namespaces.length, 0, sizeHint);
			}
			case 'file': {
				const config = pool.list().find(c => c.id === id);
				if (config === undefined || typeof config.path !== 'string') return nd(`the file connection '${id}' has no path`);
				const listing = await listFilesForConnection(config.path, { recursive: config.recursive === true });
				if (listing.truncated) return nd(`the file listing of '${id}' was cut at ${listing.files.length} files`);
				return dataMeasure(listing.files.length, listing.files.length, sizeHint);
			}
			default:
				return nd(`the source '${id}' is of a family that has no listing (${String((driver as { family?: unknown }).family)})`);
		}
	} catch (err) {
		return nd(`the listing of '${id}' failed (${reasonOf(err)})`);
	}
}

/**
 * A data request on a repo, a workspace or a manifest directory: the sum over
 * the connections registered at that path, one call of `measureDataSource`
 * per connection id, one after another. A sum that includes a source that
 * could not be counted is not a count.
 */
async function measureDataPool(poolPath: string, sizeHint: AnalyzeScope | undefined): Promise<RequestMeasure> {
	const pool = await acquireDataPool(poolPath);
	await pool.reload();
	const ids = pool.list().map(c => c.id);

	let objects = 0;
	let files = 0;
	const uncounted: string[] = [];
	for (const id of ids) {
		const one = await measureDataSource({ poolPath, connectionId: id });
		if (!one.determined) { uncounted.push(one.note ?? `the source '${id}' could not be counted`); continue; }
		objects += one.items;
		files += one.files;
	}
	if (uncounted.length > 0) {
		return notDetermined('data-source',
			`${uncounted.length} of the ${ids.length} connections registered at ${poolPath} could not be counted: ${uncounted.join('; ')}; ` +
			`${objects} objects were counted in the other ${ids.length - uncounted.length}`, sizeHint);
	}
	return dataMeasure(objects, files, sizeHint);
}
