/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The repo gate (Story 64703b708590bd68/s1, task t2): a daemon call that modifies files in a user repository must name an absolute,
 * registered repository, and every file path in the call must lie inside it. The gate reads only its arguments: never the daemon's
 * INSRC_REPO or working directory. The table of modifying calls is the audit of task t1 (./repo-call-audit.ts).
 */

import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';

import { RPC_AUDIT, STEP_PHASE_AUDIT } from './repo-call-audit.js';

export type RepoRefusalCode = 'repo-missing' | 'repo-not-absolute' | 'repo-not-directory' | 'repo-not-registered' | 'path-outside-repo';

/** One row of {@link FILE_MODIFYING_METHODS}. */
export interface RepoCallRule {
	/** The param that holds the repo. */
	readonly repoParam: string;
	/** The params that hold a file or artifact path (a string or an array of strings). */
	readonly pathParams: readonly string[];
	/** A step phase after the first: the repo comes from the run's state token when the call has none. */
	readonly repoFromRunToken?: boolean;
}

export type RepoCallCheck =
	| { readonly ok: true; readonly repo: string; readonly params: Record<string, unknown> }
	| { readonly ok: false; readonly code: RepoRefusalCode; readonly message: string };

/** Every RPC method (`workflow.approve`) and step phase (`workflow-step.start`) that modifies files, from the audit. */
export const FILE_MODIFYING_METHODS: Readonly<Record<string, RepoCallRule>> = Object.freeze(Object.fromEntries(
	Object.entries({ ...RPC_AUDIT, ...STEP_PHASE_AUDIT })
		.filter(([, e]) => e.kind === 'modifying')
		.map(([name, e]) => [name, {
			repoParam: e.repoParam!,
			pathParams: e.pathParams ?? [],
			...(e.repoFromRunToken === true ? { repoFromRunToken: true } : {}),
		}]),
));

/** What the caller of the gate may add. */
export interface RepoCallOptions {
	/** The repo the run's state token recorded when the run started; used only by a rule with repoFromRunToken. */
	readonly runTokenRepo?: string | undefined;
}

const refuse = (code: RepoRefusalCode, message: string): RepoCallCheck => ({ ok: false, code, message });

/** The path as the registry compares it: real when it exists, else lexically resolved, with no trailing separator. */
function canonical(p: string): string {
	const abs = resolve(p);
	try { return realpathSync(abs); } catch { return abs; }
}

/** The real path of `p`, or of its nearest existing ancestor with the rest appended (a path to be created). */
function realOrAncestor(p: string): string {
	let head = p; const tail: string[] = [];
	for (;;) {
		if (existsSync(head)) { const real = realpathSync(head); return tail.length === 0 ? real : join(real, ...tail.reverse()); }
		const parent = dirname(head);
		if (parent === head) return p;
		tail.push(head.slice(parent.length + 1)); head = parent;
	}
}

const inside = (root: string, p: string): boolean => { const r = relative(root, p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

/**
 * Check a call to `method` against its rule. A method that is not in the table is not gated (the caller does not call the gate for it).
 * `registered` holds the registered repositories' paths. Never throws; the result says why a call is refused.
 */
export function requireRepoForCall(method: string, params: unknown, registered: ReadonlySet<string>, opts: RepoCallOptions = {}): RepoCallCheck {
	const rule = FILE_MODIFYING_METHODS[method];
	if (rule === undefined) return refuse('repo-missing', `${method}: not a file-modifying call in the table`);
	const given = (params ?? {}) as Record<string, unknown>;
	const named = given[rule.repoParam];
	const fromToken = rule.repoFromRunToken === true && (typeof named !== 'string' || named.length === 0) ? opts.runTokenRepo : undefined;
	const repoRaw = typeof named === 'string' && named.length > 0 ? named : fromToken;
	if (typeof repoRaw !== 'string' || repoRaw.length === 0) {
		return refuse('repo-missing', `${method}: \`${rule.repoParam}\` (an absolute path of a registered repository) is required; the daemon does not fall back to INSRC_REPO, the session workspace or its working directory`);
	}
	if (!isAbsolute(repoRaw)) return refuse('repo-not-absolute', `${method}: \`${rule.repoParam}\` must be an absolute path, got '${repoRaw}'`);
	if (!existsSync(repoRaw) || !statSync(repoRaw).isDirectory()) return refuse('repo-not-directory', `${method}: \`${rule.repoParam}\` '${repoRaw}' is not a directory`);
	const repo = canonical(repoRaw);
	const known = new Set([...registered].map(canonical));
	if (!known.has(repo)) return refuse('repo-not-registered', `${method}: '${repoRaw}' is not a registered repository (add it with repo.add)`);

	const out: Record<string, unknown> = { ...given, [rule.repoParam]: repo };
	for (const key of rule.pathParams) {
		const v = given[key];
		if (v === undefined) continue;
		const rewrite = (p: unknown): string | RepoCallCheck => {
			if (typeof p !== 'string' || p.length === 0) return refuse('path-outside-repo', `${method}: \`${key}\` must be a non-empty path`);
			const lexical = normalize(isAbsolute(p) ? p : join(repo, p));
			return inside(repo, realOrAncestor(lexical)) && inside(repo, lexical)
				? lexical
				: refuse('path-outside-repo', `${method}: \`${key}\` '${p}' is outside the repository ${repo}`);
		};
		if (Array.isArray(v)) {
			const list: string[] = [];
			for (const item of v) { const r = rewrite(item); if (typeof r !== 'string') return r; list.push(r); }
			out[key] = list;
		} else {
			const r = rewrite(v); if (typeof r !== 'string') return r; out[key] = r;
		}
	}
	return { ok: true, repo, params: out };
}

/**
 * The gate with the registry read through `load`: a registry that cannot be read refuses the call, it never lets it through.
 */
export async function gateRepoCall(method: string, params: unknown, load: () => Promise<ReadonlySet<string>>, opts: RepoCallOptions = {}): Promise<RepoCallCheck> {
	let registered: ReadonlySet<string>;
	try { registered = await load(); } catch (err) {
		return refuse('repo-not-registered', `${method}: the repository registry could not be read (${err instanceof Error ? err.message : String(err)}), so the call is refused`);
	}
	return requireRepoForCall(method, params, registered, opts);
}

/** Whether the audit puts `method` in the table. */
export const isFileModifying = (method: string): boolean => Object.prototype.hasOwnProperty.call(FILE_MODIFYING_METHODS, method);

