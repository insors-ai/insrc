/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers for the infra-target deterministic runtimes
 * (discovery-families / inventory-kubernetes / inventory-terraform).
 *
 * scopeRef reading + a filesystem walker. Internal to infra/. A task's scope
 * is resolved by the one scope function, shared/task-scope.ts.
 */

import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { TemplateExecuteArgs } from '../../executor/types.js';
import { buildCompleteness } from '../../completeness.js';
import type { Completeness, ReachedLimit, SkippedItem } from '../../completeness.js';

// ---------------------------------------------------------------------------
// scopeRef reading
// ---------------------------------------------------------------------------

export interface ScopeRef {
	readonly kind:  string;
	readonly value: string;
}

export function readScopeRef(args: TemplateExecuteArgs, templateLabel: string): ScopeRef {
	const raw = (args.task.params as Record<string, unknown>)['scopeRef'];
	if (raw === null || typeof raw !== 'object') {
		throw new Error(
			`${templateLabel}: task.params.scopeRef missing (taskId=${args.task.taskId}). ` +
				'INV-5 should have rejected this plan -- check the planner validator.',
		);
	}
	const obj   = raw as Record<string, unknown>;
	const kind  = obj['kind'];
	const value = obj['value'];
	if (typeof kind !== 'string' || typeof value !== 'string') {
		throw new Error(
			`${templateLabel}: task.params.scopeRef has wrong shape (taskId=${args.task.taskId})`,
		);
	}
	return { kind, value };
}

// ---------------------------------------------------------------------------
// Filesystem walking
// ---------------------------------------------------------------------------

/** Directory names that are NEVER walked into -- saves a ton of work on
 *  monorepos / projects with deep node_modules / .git histories. */
const SKIP_DIRS = new Set([
	'.git',
	'node_modules',
	'.next',
	'.svelte-kit',
	'.nuxt',
	'.cache',
	'dist',
	'build',
	'out',
	'target',
	'__pycache__',
	'.venv',
	'venv',
	'.tox',
	'.idea',
	'.vscode',
	'.gradle',
	'.terraform',  // terraform's local plugin/state cache; downloaded, not user-authored
]);

/** Hard cap on files inspected per runtime call. Plans never need
 *  the entire filesystem; this is a backstop against runaway walks. */
export const DEFAULT_FILE_CAP = 5000;

/**
 * The completeness record of a runtime built on `walkFiles`: `returned` items
 * came out of the files the walk yielded. A walk that stopped at its cap is a
 * limit on what the result was built FROM; the walk's own exclusions are
 * stated as its rule.
 */
export function fileWalkCompleteness(
	returned:  number,
	truncated: boolean,
	extra: {
		readonly limited?: readonly ReachedLimit[] | undefined;
		readonly skipped?: readonly SkippedItem[] | undefined;
		readonly cap?:     number | undefined;
	} = {},
): Completeness {
	const cap = extra.cap ?? DEFAULT_FILE_CAP;
	const limited: ReachedLimit[] = [...(extra.limited ?? [])];
	if (truncated) {
		limited.push({
			what: 'files walked', limit: cap, scope: 'source',
			reason: `the file walk stops at ${cap} files; files beyond that were not inspected`,
		});
	}
	return buildCompleteness({
		returned,
		limited,
		...(extra.skipped !== undefined ? { skipped: extra.skipped } : {}),
		basis:     'filesystem',
		basisNote: `Not walked, by rule: symbolic links, and directories named ${[...SKIP_DIRS].join(', ')}.`,
	});
}

/** The `skipped` entry for a file an inventory could not read or parse. */
export function unreadableFile(relPath: string, err: unknown): SkippedItem {
	return { what: relPath, reason: `it could not be read or parsed (${err instanceof Error ? err.message.split('\n')[0] : String(err)})` };
}

export interface WalkedFile {
	readonly absPath: string;
	/** Path relative to the walk root, using `/` separators. */
	readonly relPath: string;
}

/**
 * Recursively walk `root`, yielding every regular file (in
 * deterministic depth-first, name-sorted order). Symlinks are NOT
 * followed. SKIP_DIRS are excluded.
 *
 * Stops + flags `truncated=true` after `cap` files. A directory below the
 * root that cannot be read is returned in `unreadable`; a root that cannot
 * be read throws. The caller puts both in its completeness record.
 */
export async function walkFiles(
	root: string,
	cap:  number = DEFAULT_FILE_CAP,
): Promise<{ files: readonly WalkedFile[]; truncated: boolean; unreadable: readonly SkippedItem[] }> {
	const out: WalkedFile[] = [];
	let truncated = false;
	const unreadable: SkippedItem[] = [];

	const visit = async (dir: string): Promise<void> => {
		if (out.length >= cap) { truncated = true; return; }

		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch (err) {
			// The walk's root: the task could not run. A directory below it is
			// expected on a real tree (permissions): the walk goes on, and the
			// directory is named so the result says what it does not cover.
			if (dir === root) throw err;
			unreadable.push({
				what:   relative(root, dir).split(sep).join('/'),
				reason: `the directory could not be read (${(err as NodeJS.ErrnoException).code ?? (err as Error).message})`,
			});
			return;
		}
		entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

		for (const ent of entries) {
			if (out.length >= cap) { truncated = true; return; }
			if (ent.isSymbolicLink()) continue;
			const abs = join(dir, ent.name);
			if (ent.isDirectory()) {
				if (SKIP_DIRS.has(ent.name)) continue;
				await visit(abs);
			} else if (ent.isFile()) {
				const rel = relative(root, abs).split(sep).join('/');
				out.push({ absPath: abs, relPath: rel });
			}
		}
	};

	await visit(root);
	return { files: out, truncated, unreadable };
}
