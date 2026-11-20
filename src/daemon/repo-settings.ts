/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The repo-scoped tracker settings methods (Story s3): `repo.settings.get`,
 * `repo.settings.set` and `repo.trackerConfig.ensure`.
 *
 * The daemon is the only writer of `~/.insrc/github.json`; every client reaches
 * the file through these methods. Business errors are returned as data
 * (`{ ok: false, error }`), never thrown. Repo identity is the exact registered
 * path string: no alias lookup and no symlink resolution.
 */

import { REPO_TRACKER_FIELDS, validateRepoSetting } from '../config/repo-fields.js';
import { getLogger } from '../shared/logger.js';
import { createGithubTracker } from '../workflow/tracker/github-adapter.js';
import type { PortResult, TrackerPort } from '../workflow/tracker/port.js';
import {
	GithubConfigError, OWNER_NAME_RE, REPO_NAME_RE, githubConfigPath, resolveGithubConfigFromFile,
} from '../workflow/config/github.js';
import type { GithubConfigFile, GithubEntry } from '../workflow/config/github.js';
import { readRepoEntry, writeRepoEntryKeys } from '../workflow/config/github-store.js';
import type { WriteError, WriteResult } from '../workflow/config/github-store.js';
import { InvalidCommandSetting, PROJECT_TYPE_GUIDANCE, detectProjectType, profileFromSetting } from './steps/build-step/validation-checks.js';
import type { CommandsSource, ProjectType } from './steps/build-step/validation-checks.js';
import { policyReader } from '../workflow/team/policy-reader.js';
import type { PolicyReader } from '../workflow/team/types.js';
import { isToolDenied } from '../workflow/tracker/tool-denied.js';
import type { RpcHandlers } from './server.js';

const log = getLogger('repo-settings');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RepoSettingsError = {
	readonly code: WriteError['code'] | 'unknown-key' | 'read-only-key' | 'invalid-value' | 'repo-not-registered';
	readonly message: string;
};

export interface SigninStatus {
	readonly state: 'signed-in' | 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected' | 'disabled';
	readonly login?: string;
	readonly reason?: string;
}

export interface ResolvedTarget {
	readonly type: 'github' | 'none';
	readonly owner?: string;
	readonly repo?: string;
	readonly source: 'per-repo-config' | 'default-config' | 'git-remote';
	readonly error?: string;
}

export type PolicyRows =
	| { readonly ok: true; readonly mode: 'none' }
	| { readonly ok: true; readonly mode: 'team'; readonly values: Readonly<Record<string, unknown>>; readonly source: { readonly ref: string; readonly fetchedAt: string } }
	| { readonly ok: false; readonly reason: string };

/** The three build keys a project type's typical commands fill, written together. */
export interface BuildSuggestion {
	readonly typecheckCommand: string;
	readonly testCommand: string;
	readonly resultFormat: 'exit-code';
}

/** Read-only: what the build gate would use for a repo, and what could be set when it has no commands. */
export interface BuildSetup {
	readonly projectType: ProjectType;
	readonly commandsSource: CommandsSource | 'invalid';
	/** Why the stored commands are 'invalid'. */
	readonly note?: string;
	/** Typical commands for the type; only for a repo with no commands whose type has them. */
	readonly suggestion?: BuildSuggestion;
}

/** What `applyBuildDefaults` did at repo add. A default is a typical command, never a verified one. */
export type BuildDefaultsOutcome =
	| { readonly applied: true; readonly projectType: ProjectType }
	| { readonly applied: false; readonly reason: 'already-set' | 'node-default' | 'no-typical-commands' | 'write-failed'; readonly note?: string };

export interface RepoSettingsPayload {
	readonly repo: string;
	/** Only the keys the repo's own entry sets. */
	readonly values: Readonly<Record<string, string | boolean>>;
	readonly resolved: ResolvedTarget;
	readonly signin: SigninStatus;
	readonly policy: PolicyRows;
	readonly buildSetup: BuildSetup;
}

export type SettingsResult =
	| { readonly ok: true; readonly payload: RepoSettingsPayload }
	| { readonly ok: false; readonly error: RepoSettingsError };

export type EnsureResult =
	| { readonly ok: true; readonly changed: boolean }
	| { readonly ok: false; readonly error: RepoSettingsError };

export interface RepoSettingsDeps {
	/** The registered repo paths, exactly as `repo.add` stored them. */
	readonly registeredRepos: () => Promise<readonly string[]>;
	/** Installs or removes the git hooks; when given, setting `gitHooks` drives it and the key is written only if it succeeded. */
	readonly applyGitHooks?: ((repo: string, enabled: boolean) => Promise<{ ok: true } | { ok: false; error: { message: string } }>) | undefined;
	readonly configPath?: () => string;
	readonly readPolicy?: PolicyReader;
	/** Builds the tracker adapter; only `whoAmI` is ever called. */
	readonly makeTracker?: (owner: string, repo: string) => Pick<TrackerPort, 'whoAmI'>;
	readonly writeKeys?: typeof writeRepoEntryKeys;
}

// ---------------------------------------------------------------------------
// Pure pieces
// ---------------------------------------------------------------------------

/** Maps every `whoAmI` outcome to a sign-in state. A thrown exception becomes `rejected`. */
export async function mapSignin(read: () => PortResult<string> | Promise<PortResult<string>>): Promise<SigninStatus> {
	let result: PortResult<string>;
	try {
		result = await read();
	} catch (e) {
		if (isToolDenied(e)) throw e;   // a denied call stops the read; it is not a rejected sign-in
		return { state: 'rejected', reason: (e as Error).message };
	}
	if (result.ok) {
		return result.value.length > 0
			? { state: 'signed-in', login: result.value }
			: { state: 'missing-signin', reason: 'gh is not signed in (no login returned)' };
	}
	return { state: result.kind, reason: result.reason };
}

async function mapPolicy(read: PolicyReader, repo: string): Promise<PolicyRows> {
	let result: Awaited<ReturnType<PolicyReader>>;
	try {
		result = await read(repo);
	} catch (e) {
		return { ok: false, reason: (e as Error).message };
	}
	if (!result.ok) return { ok: false, reason: result.reason };
	if (result.value === 'none') return { ok: true, mode: 'none' };
	const p = result.value;
	return {
		ok: true, mode: 'team',
		values: {
			teamMode: p.teamMode, signoffStages: p.signoffStages, claimsEnforced: p.claimsEnforced,
			claimUnits: p.claimUnits, administrators: p.administrators, forceTaskIssues: p.forceTaskIssues,
		},
		source: { ref: p.source.ref, fetchedAt: p.source.fetchedAt },
	};
}

/** The repo's own local-row values: only keys its own entry sets, never the default entry. */
function ownValues(entry: GithubEntry | undefined): Record<string, string | boolean> {
	const values: Record<string, string | boolean> = {};
	if (entry === undefined) return values;
	for (const row of REPO_TRACKER_FIELDS) {
		if (row.kind !== 'local' || !Object.hasOwn(entry, row.key)) continue;
		const v = (entry as Record<string, unknown>)[row.key];
		if (typeof v === 'string' || typeof v === 'boolean') values[row.key] = v;
	}
	return values;
}

const BUILD_KEYS = ['typecheckCommand', 'testCommand', 'resultFormat'] as const;

/** The typical commands of a type that has them (every type but node and unknown). */
function typicalCommands(type: ProjectType): BuildSuggestion | undefined {
	if (type === 'node' || type === 'unknown') return undefined;
	const g = PROJECT_TYPE_GUIDANCE[type];
	return { typecheckCommand: g.typecheck, testCommand: g.test, resultFormat: 'exit-code' };
}

/** The build setup of the repo at `repoPath` with its own entry: reads, never writes. */
export function buildSetupFor(repoPath: string, entry: GithubEntry | undefined): BuildSetup {
	const projectType = detectProjectType(repoPath);
	const own = entry as Record<string, unknown> | undefined;
	const setting: Record<string, unknown> = {};
	for (const key of BUILD_KEYS) if (own !== undefined && Object.hasOwn(own, key)) setting[key] = own[key];
	if (Object.keys(setting).length === 0) {
		const suggestion = typicalCommands(projectType);
		return projectType === 'node'
			? { projectType, commandsSource: 'node-default' }
			: { projectType, commandsSource: 'none', ...(suggestion !== undefined ? { suggestion } : {}) };
	}
	try {
		return { projectType, commandsSource: profileFromSetting(projectType, setting).commandsSource };
	} catch (e) {
		if (!(e instanceof InvalidCommandSetting)) throw e;
		return { projectType, commandsSource: 'invalid', note: e.message };
	}
}

/**
 * At repo add: stores the project type's typical commands when the repo's own entry sets none of the three
 * keys. One write, so no lone command is left; never overwrites; never throws.
 */
export async function applyBuildDefaults(
	repoPath: string,
	deps: { readonly configPath?: string; readonly writeKeys?: typeof writeRepoEntryKeys } = {},
): Promise<BuildDefaultsOutcome> {
	try {
		const configPath = deps.configPath ?? githubConfigPath();
		const read = readRepoEntry(repoPath, configPath);
		if (!read.ok) return { applied: false, reason: 'write-failed', note: read.error.message };
		const own = read.entry as Record<string, unknown> | undefined;
		if (own !== undefined && BUILD_KEYS.some(k => Object.hasOwn(own, k))) return { applied: false, reason: 'already-set' };
		const projectType = detectProjectType(repoPath);
		if (projectType === 'node') return { applied: false, reason: 'node-default' };
		const typical = typicalCommands(projectType);
		if (typical === undefined) return { applied: false, reason: 'no-typical-commands' };
		const written = await (deps.writeKeys ?? writeRepoEntryKeys)(repoPath, { ...typical }, configPath);
		if (!written.ok) return { applied: false, reason: 'write-failed', note: written.error.message };
		return { applied: true, projectType };
	} catch (e) {
		log.warn({ repoPath, err: (e as Error).message }, 'applyBuildDefaults failed');
		return { applied: false, reason: 'write-failed', note: (e as Error).message };
	}
}

async function resolveTarget(file: GithubConfigFile, entry: GithubEntry | undefined, repo: string): Promise<ResolvedTarget> {
	try {
		const r = await resolveGithubConfigFromFile(file, repo);
		return r.type === 'github'
			? { type: 'github', owner: r.owner, repo: r.repo, source: r.source }
			: { type: 'none', source: r.source };
	} catch (e) {
		if (!(e instanceof GithubConfigError)) throw e;
		return { type: 'github', source: entry !== undefined ? 'per-repo-config' : 'git-remote', error: e.message };
	}
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function createRepoSettingsHandlers(deps: RepoSettingsDeps): RpcHandlers {
	const configPath = (): string => deps.configPath?.() ?? githubConfigPath();
	const readPolicy = deps.readPolicy ?? policyReader;
	const makeTracker = deps.makeTracker ?? createGithubTracker;
	const writeKeys = deps.writeKeys ?? writeRepoEntryKeys;

	const fail = (code: RepoSettingsError['code'], message: string): { ok: false; error: RepoSettingsError } =>
		({ ok: false, error: { code, message } });

	async function registered(repo: unknown): Promise<string | { ok: false; error: RepoSettingsError }> {
		if (typeof repo !== 'string' || !(await deps.registeredRepos()).includes(repo)) {
			return fail('repo-not-registered', `${String(repo)} is not a registered repo path (use the path exactly as registered)`);
		}
		return repo;
	}

	/** One strict read; the target, values and sign-in all come from that snapshot. */
	async function payloadFor(repo: string): Promise<SettingsResult> {
		const read = readRepoEntry(repo, configPath());
		if (!read.ok) return { ok: false, error: read.error };
		const resolved = await resolveTarget(read.file, read.entry, repo);

		// Sign-in is the signed-in user (`gh api user`), which does not depend on the
		// target, so it is read whenever the tracker is github, even if the target is unresolved.
		const signin: SigninStatus = resolved.type === 'github'
			? await mapSignin(() => makeTracker(resolved.owner ?? '', resolved.repo ?? '').whoAmI())
			: { state: 'disabled', reason: 'the tracker is off for this repo' };
		return { ok: true, payload: { repo, values: ownValues(read.entry), resolved, signin, policy: await mapPolicy(readPolicy, repo), buildSetup: buildSetupFor(repo, read.entry) } };
	}

	const asData = (r: WriteResult | { ok: false; error: RepoSettingsError }): { ok: false; error: RepoSettingsError } | null =>
		r.ok ? null : { ok: false, error: r.error };

	return {
		'repo.settings.get': async (params) => {
			const repo = await registered((params as { repo?: unknown } | null)?.repo);
			if (typeof repo !== 'string') return repo;
			return await payloadFor(repo);
		},

		'repo.settings.set': async (params) => {
			const p = (params ?? {}) as { repo?: unknown; key?: unknown; value?: unknown };
			const repo = await registered(p.repo);
			if (typeof repo !== 'string') return repo;
			const checked = validateRepoSetting(typeof p.key === 'string' ? p.key : '', p.value);
			if (!checked.ok) return fail(checked.code, checked.message);
			if (p.key === 'gitHooks' && deps.applyGitHooks !== undefined) {
				// the installer sets the key itself once the files match, so the setting never says more than is installed
				const applied = await deps.applyGitHooks(repo, checked.value === true);
				if (!applied.ok) return fail('write-failed', applied.error.message);
				return await payloadFor(repo);
			}
			const written = await writeKeys(repo, { [p.key as string]: checked.value }, configPath());
			const failed = asData(written);
			if (failed !== null) {
				log.warn({ repo, key: p.key, code: failed.error.code }, 'repo.settings.set failed');
				return failed;
			}
			return await payloadFor(repo);
		},

		'repo.trackerConfig.ensure': async (params) => {
			const p = (params ?? {}) as { repo?: unknown; owner?: unknown; name?: unknown };
			const repo = await registered(p.repo);
			if (typeof repo !== 'string') return repo;
			if (typeof p.owner !== 'string' || !OWNER_NAME_RE.test(p.owner)) return fail('invalid-value', `'${String(p.owner)}' is not a valid GitHub owner`);
			if (typeof p.name !== 'string' || !REPO_NAME_RE.test(p.name)) return fail('invalid-value', `'${String(p.name)}' is not a valid GitHub repository name`);
			const written = await writeKeys(repo, { type: 'github', owner: p.owner, repo: p.name, pushTasks: true, commitArtifacts: true }, configPath());
			if (!written.ok) {
				log.warn({ repo, code: written.error.code }, 'repo.trackerConfig.ensure failed');
				return { ok: false, error: written.error };
			}
			return { ok: true, changed: written.changed } satisfies EnsureResult;
		},
	};
}
