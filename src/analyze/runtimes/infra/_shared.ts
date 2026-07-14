/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared helpers for the infra-target deterministic runtimes
 * (discovery-families / inventory-kubernetes / inventory-terraform).
 *
 * Mirrors the code/_shared.ts pattern: scopeRef reading + repo
 * path resolution + a filesystem walker. Internal to infra/.
 */

import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { TemplateExecuteArgs } from '../../executor/types.js';

// ---------------------------------------------------------------------------
// scopeRef reading + repo path resolution (mirrors code helpers)
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

export function resolveRepoPath(scopeRef: ScopeRef, templateLabel: string): string {
	switch (scopeRef.kind) {
		case 'repo':
		case 'manifest-dir':
		case 'workspace':
			return scopeRef.value;
		default:
			throw new Error(
				`${templateLabel}: scopeRef.kind='${scopeRef.kind}' not supported yet. ` +
					'Supported in this revision: repo, manifest-dir, workspace.',
			);
	}
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
 * Stops + flags `truncated=true` after `cap` files; the caller logs
 * the truncation so reviewers know the inventory may be partial.
 */
export async function walkFiles(
	root: string,
	cap:  number = DEFAULT_FILE_CAP,
): Promise<{ files: readonly WalkedFile[]; truncated: boolean }> {
	const out: WalkedFile[] = [];
	let truncated = false;

	const visit = async (dir: string): Promise<void> => {
		if (out.length >= cap) { truncated = true; return; }

		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			// Inaccessible dir -- skip silently. The caller's intent is
			// inventory, not exhaustive perm enumeration.
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
	return { files: out, truncated };
}
