/* Copyright (c) Procix Software India. Licensed under the MIT License. */

/**
 * The git-hook methods (Story 9ac84abac177b399/s1): `repo.gitHooks.install`, `repo.gitHooks.uninstall` and
 * `repo.gitHooks.status`. They are the only code that writes hook files. Business errors come back as data, never thrown.
 * The `gitHooks` setting equals what is installed: it is set true only after at least one block is written and false only
 * after every block is removed. `repo.settings.set` of that key calls `applyGitHooks`, so the setting drives the files.
 */

import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../shared/logger.js';
import { revParseValues } from '../workflow/git-calls.js';
import { githubConfigPath } from '../workflow/config/github.js';
import { writeRepoEntryKeys } from '../workflow/config/github-store.js';
import { applyBlock, removeBlock } from './git-hooks/hook-block.js';
import { inspectHook } from './git-hooks/hook-inspect.js';
import type { HookInspection } from './git-hooks/hook-inspect.js';
import type { RpcHandlers } from './server.js';

const log = getLogger('daemon:git-hooks');

export const GIT_HOOK_NAMES = ['post-merge', 'post-rewrite'] as const;

export interface GitHooksError { readonly code: 'repo-not-registered' | 'not-a-git-repository' | 'hooks-failed' | 'setting-failed'; readonly message: string }

export interface HookReport {
	readonly name: string;
	/** Install and uninstall: the action took effect (or there was nothing to do). Status: our block is present. */
	readonly installed: boolean;
	readonly reason?: string | undefined;
	readonly foreign?: boolean | undefined;
	readonly earlyExit?: boolean | undefined;
	readonly stale?: boolean | undefined;
}

export type GitHooksResult =
	| { readonly ok: true; readonly hooksDir: string; readonly hooks: readonly HookReport[]; readonly setting: boolean }
	| { readonly ok: false; readonly error: GitHooksError };

export interface GitHooksDeps {
	readonly registeredRepos: () => Promise<readonly string[]>;
	/** The compiled hook entry the blocks record; defaults to the one beside this daemon. */
	readonly entryPath?: string | undefined;
	/** Resolves the hooks directory; defaults to the typed git_rev_parse gitPath query (honours core.hooksPath). */
	readonly hooksDir?: ((repo: string) => Promise<string>) | undefined;
	/** Writes the gitHooks setting; defaults to github.json through the store. */
	readonly setFlag?: ((repo: string, value: boolean) => Promise<{ ok: true } | { ok: false; message: string }>) | undefined;
}

const defaultEntry = (): string => fileURLToPath(new URL('../bin/insrc-git-hook.js', import.meta.url));

async function defaultHooksDir(repo: string): Promise<string> {
	const first = (await revParseValues(repo, { gitPath: 'hooks' }))[0];
	if (first === undefined) throw new Error('git printed no hooks directory');
	return isAbsolute(first) ? first : resolve(repo, first);
}

export interface GitHooks {
	readonly handlers: RpcHandlers;
	/** Install (true) or remove (false) the blocks and set the setting to match. */
	apply(repo: string, enabled: boolean): Promise<GitHooksResult>;
}

export function createGitHooks(deps: GitHooksDeps): GitHooks {
	const entry = deps.entryPath ?? defaultEntry();
	const hooksDirOf = deps.hooksDir ?? defaultHooksDir;
	const setFlag = deps.setFlag ?? (async (repo: string, value: boolean) => {
		const written = await writeRepoEntryKeys(repo, { gitHooks: value }, githubConfigPath());
		return written.ok ? { ok: true as const } : { ok: false as const, message: written.error.message };
	});
	const fail = (code: GitHooksError['code'], message: string): GitHooksResult => ({ ok: false, error: { code, message } });

	async function prepare(raw: unknown): Promise<{ repo: string; dir: string } | GitHooksResult> {
		if (typeof raw !== 'string' || !(await deps.registeredRepos()).includes(raw)) {
			return fail('repo-not-registered', `${String(raw)} is not a registered repo path (use the path exactly as registered)`);
		}
		try { return { repo: raw, dir: await hooksDirOf(raw) }; } catch (error) {
			return fail('not-a-git-repository', `${raw}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	const isResult = (x: { repo: string; dir: string } | GitHooksResult): x is GitHooksResult => 'ok' in x;

	async function apply(raw: unknown, enabled: boolean): Promise<GitHooksResult> {
		const ready = await prepare(raw);
		if (isResult(ready)) return ready;
		const hooks: HookReport[] = [];
		for (const name of GIT_HOOK_NAMES) {
			const file = resolve(ready.dir, name);
			const before = enabled ? await inspectHook(file, entry) : undefined;
			const done = enabled ? await applyBlock(file, entry, name) : await removeBlock(file);
			hooks.push(done.ok
				? { name, installed: enabled, ...(before?.foreign === true ? { foreign: true } : {}), ...(before?.earlyExit === true ? { earlyExit: true } : {}) }
				: { name, installed: !enabled ? true : false, reason: done.reason });
		}
		const anyWritten = hooks.some(h => h.installed);
		const target = enabled ? anyWritten : false;
		const incomplete = !enabled && hooks.some(h => h.reason !== undefined);
		if (enabled && !anyWritten) return fail('hooks-failed', hooks.map(h => `${h.name}: ${h.reason}`).join('; '));
		if (incomplete) return fail('hooks-failed', hooks.filter(h => h.reason !== undefined).map(h => `${h.name}: ${h.reason}`).join('; '));
		const flagged = await setFlag(ready.repo, target);
		if (!flagged.ok) return fail('setting-failed', flagged.message);
		log.info({ repo: ready.repo, enabled, hooks: hooks.map(h => h.name) }, 'git hooks applied');
		return { ok: true, hooksDir: ready.dir, hooks, setting: target };
	}

	async function status(raw: unknown): Promise<GitHooksResult> {
		const ready = await prepare(raw);
		if (isResult(ready)) return ready;
		const hooks: HookReport[] = [];
		for (const name of GIT_HOOK_NAMES) {
			const seen: HookInspection = await inspectHook(resolve(ready.dir, name), entry);
			hooks.push({ name, installed: seen.present, foreign: seen.foreign, earlyExit: seen.earlyExit, stale: seen.stale, ...(seen.unreadable !== undefined ? { reason: seen.unreadable } : {}) });
		}
		return { ok: true, hooksDir: ready.dir, hooks, setting: hooks.some(h => h.installed) };
	}

	const repoOf = (params: unknown): unknown => (params as { repo?: unknown } | null)?.repo;
	return {
		apply,
		handlers: {
			'repo.gitHooks.install': async (params) => apply(repoOf(params), true),
			'repo.gitHooks.uninstall': async (params) => apply(repoOf(params), false),
			'repo.gitHooks.status': async (params) => status(repoOf(params)),
		},
	};
}

