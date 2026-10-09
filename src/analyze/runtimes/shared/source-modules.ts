/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The ONE definition of a module for the code plan tasks, and the reading of
 * a task's module value (LLD-b9d5c5c4-s8, task t1).
 *
 * No parser stores an entity of kind 'module' for a repository's own
 * directories: each stores one only for an IMPORTED module, in a shared
 * namespace with an empty repo and file. So a repository's modules are
 * derived here, from what the index does store:
 *
 *   (a) a stored entity of kind 'module' whose file lies in the area. It owns
 *       every source file under the directory of its file, at any depth;
 *   (b) a directory that directly holds at least one SOURCE FILE (a stored
 *       entity of kind 'file' that is not an artifact) and lies neither in
 *       nor under a stored module entity's directory.
 *
 * A directory that holds source only in its sub-directories is not a module
 * of its own; its sub-directories are. It is still a valid module VALUE for
 * the functional-surface task, whose surface is everything under it.
 *
 * Everything here works on entities it is given. It reads no store and calls
 * no model.
 */

import type { Entity } from '../../../shared/types.js';
import type { ResolvedScope } from '../../context/scope.js';

import { graphRepoOf } from './task-scope.js';

/** The template whose module value is read here; it heads every refusal. */
const SURFACE_TEMPLATE = 'code.surface.functional';

/** One module of an area. */
export interface SourceModule {
	/** The module's directory: absolute, no trailing slash. */
	readonly directory: string;
	/** A stored module entity's name; else the directory relative to the repo, '.' for the repo's own. */
	readonly name:      string;
	/** Source files DIRECTLY in the directory. */
	readonly fileCount: number;
	/** A stored module entity's language; else the language most of the directory's source files have. */
	readonly language:  string;
	/** Present when the module is a stored entity of kind 'module'. */
	readonly entity?:   Entity | undefined;
}

/** What a task's module value names. */
export interface NamedModule {
	readonly directory: string;
	readonly name:      string;
	/** A stored module entity's file; else the directory. */
	readonly path:      string;
	readonly entity?:   Entity | undefined;
}

/** A stored entity of kind 'file' that is not an artifact. */
export function isSourceFile(entity: Entity): boolean {
	return entity.kind === 'file' && entity.artifact !== true;
}

/** The directory of a file path: forward slashes, no trailing slash. */
export function directoryOf(file: string): string {
	const idx = file.lastIndexOf('/');
	return idx <= 0 ? file.slice(0, Math.max(idx, 0)) : file.slice(0, idx);
}

/** Whether a path is the directory or lies under it. `pay` never contains `payments`. */
export function liesUnder(directory: string, path: string): boolean {
	return path === directory || path.startsWith(`${directory}/`);
}

/** A directory named relative to the repo that was read: '.' for the repo's own. */
function relativeName(repo: string, directory: string): string {
	if (directory === repo) return '.';
	return directory.startsWith(`${repo}/`) ? directory.slice(repo.length + 1) : directory;
}

/** The kinds of scope whose area is one file or one entity: smaller than any directory. */
function areaIsBelowADirectory(scope: ResolvedScope): boolean {
	return scope.kind === 'file' || scope.kind === 'symbol';
}

/**
 * The modules of a scope's area, sorted by directory.
 *
 * @param scope               the task's resolved scope
 * @param entities            the repo's entities ALREADY narrowed to the scope's area: the modules listed come from them
 * @param storedModulesOfRepo ALL the repo's stored entities of kind 'module', not narrowed: a stored module entity whose
 *                            file lies above the area still owns the files under its directory, so rule (b) is tested
 *                            against every one of them and the module of a file does not depend on the scope
 */
export function sourceModulesOf(
	scope:               ResolvedScope,
	entities:            readonly Entity[],
	storedModulesOfRepo: readonly Entity[],
): SourceModule[] {
	const repo = graphRepoOf(scope);

	// Source files directly in each directory of the area, with their languages.
	const perDirectory = new Map<string, { count: number; languages: Map<string, number> }>();
	for (const e of entities) {
		if (!isSourceFile(e)) continue;
		const dir = directoryOf(e.file);
		const seen = perDirectory.get(dir) ?? { count: 0, languages: new Map<string, number>() };
		seen.count += 1;
		seen.languages.set(e.language, (seen.languages.get(e.language) ?? 0) + 1);
		perDirectory.set(dir, seen);
	}

	// (a) The stored module entities the area contains, under every kind of scope.
	const modules: SourceModule[] = [];
	for (const e of entities) {
		if (e.kind !== 'module') continue;
		const directory = directoryOf(e.file);
		modules.push({
			directory,
			name:      e.name,
			fileCount: perDirectory.get(directory)?.count ?? 0,
			language:  e.language,
			entity:    e,
		});
	}

	// (b) Directories that directly hold source, where the area is a directory.
	if (!areaIsBelowADirectory(scope)) {
		// An imported module has an empty file and owns no directory of this repo.
		const storedDirectories = storedModulesOfRepo
			.filter(e => e.kind === 'module' && e.file.length > 0)
			.map(e => directoryOf(e.file));
		for (const [directory, seen] of perDirectory) {
			if (storedDirectories.some(owned => liesUnder(owned, directory))) continue;
			modules.push({
				directory,
				name:      relativeName(repo, directory),
				fileCount: seen.count,
				language:  mostCommon(seen.languages),
			});
		}
	}

	return modules.sort((a, b) =>
		a.directory !== b.directory ? (a.directory < b.directory ? -1 : 1) : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** The key with the highest count; the alphabetically first on a tie. */
function mostCommon(counts: ReadonlyMap<string, number>): string {
	let best = '';
	let bestCount = -1;
	for (const [key, count] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
		if (count > bestCount) { best = key; bestCount = count; }
	}
	return best;
}

/**
 * Step 1 of reading a module value: is it the id of a stored entity?
 *
 * Needs neither a scope nor a repo's entities, so an id is read exactly as
 * before this Story, whatever the run's scope is. A value that is a path is
 * not looked up. Returns null when no stored entity has that id: the value is
 * then a directory path, for `moduleOfDirectory`.
 *
 * @param lookup the store's own reader; the runtime passes `id => getEntity(db, id)`
 * @throws Error when the id is a stored entity of another kind
 */
export async function moduleOfEntityId(
	value:  string,
	lookup: (id: string) => Promise<Entity | null>,
): Promise<NamedModule | null> {
	if (value.includes('/')) return null;
	const entity = await lookup(value);
	if (entity === null) return null;
	if (entity.kind !== 'module') {
		throw new Error(`${SURFACE_TEMPLATE}: entity '${value}' has kind='${entity.kind}', expected 'module'`);
	}
	return { directory: directoryOf(entity.file), name: entity.name, path: entity.file, entity };
}

/**
 * Step 2 of reading a module value: a directory path under the run's scope.
 *
 * Tested in this order, so that each refusal has one cause and one message:
 * the kind of the run's scope; whether the directory lies in the repo that was
 * read and in the scope's area; whether a stored source file lies under it.
 *
 * @param entities the repo's entities already narrowed to the scope's area
 * @throws Error for each refusal
 */
export function moduleOfDirectory(
	value:    string,
	scope:    ResolvedScope,
	entities: readonly Entity[],
): NamedModule {
	if (areaIsBelowADirectory(scope)) {
		throw new Error(
			`${SURFACE_TEMPLATE}: the module value '${value}' is a directory path, and the run's scope is a ${scope.kind} scope. ` +
			`A scope of one file or one symbol holds no directory to describe.`,
		);
	}

	// A relative value is joined to the repo that was read: the registered repo
	// that contains the scope or, when none is known, the scope's own directory.
	const repo = graphRepoOf(scope);
	const directory = absoluteDirectory(value, repo);
	const area = scope.lookupPath;
	if (!liesUnder(repo, directory) || !liesUnder(area, directory)) {
		throw new Error(
			`${SURFACE_TEMPLATE}: the module value '${value}' names the directory '${directory}', ` +
			`which lies outside the area of the run's scope ('${area}').`,
		);
	}

	if (!entities.some(e => isSourceFile(e) && liesUnder(directory, e.file))) {
		throw new Error(
			`${SURFACE_TEMPLATE}: the module value '${value}' names the directory '${directory}', ` +
			`and no stored source file lies under it in the repo '${repo}'.`,
		);
	}
	return { directory, name: relativeName(repo, directory), path: directory };
}

/** A directory value made absolute: joined to `base` when relative, with no trailing slash. */
function absoluteDirectory(value: string, base: string): string {
	let path = value.startsWith('/') ? value : value.replace(/^(\.\/)+/, '');
	if (!path.startsWith('/')) {
		path = path === '' || path === '.' ? base : `${base}/${path}`;
	}
	while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
	return path;
}
