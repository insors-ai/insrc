/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One FileFilter per repository per analysis run (Epic c2ba6fa6 s6 code
 * review). Building a filter walks the whole repository and asks git for its
 * tracked files; an analysis run asks for one at several places (the plan's
 * RepoIgnoreFilter, the concept.resolve and module.profile walkers, each infra
 * inventory's file walk, the request measure). Inside `withRunFileFilters` they
 * all share one instance per repository root, so the run also judges every
 * path by one consistent snapshot of the rules. Outside a run, `runFileFilter`
 * builds a fresh filter, as before.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { resolve } from 'node:path';

import { createFileFilter, type FileFilter } from '../../indexer/file-filter.js';

const runFilters = new AsyncLocalStorage<Map<string, FileFilter>>();

/** Run `fn` as one analysis run: its FileFilters are shared. A run inside a
 *  run (a plan execution inside an analyze request) shares its caller's. */
export function withRunFileFilters<T>(fn: () => Promise<T>): Promise<T> {
	if (runFilters.getStore() !== undefined) return fn();
	return runFilters.run(new Map(), fn);
}

/** The run's FileFilter for `repoRoot`, built on first use; a fresh one outside a run. */
export function runFileFilter(repoRoot: string): FileFilter {
	const filters = runFilters.getStore();
	if (filters === undefined) return createFileFilter(repoRoot);
	const root = resolve(repoRoot);
	let filter = filters.get(root);
	if (filter === undefined) {
		filter = createFileFilter(root);
		filters.set(root, filter);
	}
	return filter;
}
