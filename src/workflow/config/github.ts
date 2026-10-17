/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * GitHub tracker config — Phase F.
 *
 * Loads `~/.insrc/github.json`. Resolves per-repo entries with a
 * git-remote fallback for repos not explicitly configured. The
 * resolved config is what the tracker prompts embed so the LLM
 * knows which repo to `gh` against.
 *
 * Config file shape:
 * ```json
 * {
 *   "default": {
 *     "owner": "myorg",
 *     "repo":  "myrepo",
 *     "epicLabel":     "insrc:epic",
 *     "storyLabel":    "insrc:story",
 *     "useMilestones": false
 *   },
 *   "repos": {
 *     "/abs/path/to/repo": { "owner": "...", "repo": "..." }
 *   }
 * }
 * ```
 *
 * Missing config is not an error — the loader falls back to the
 * git remote's owner/repo and the built-in defaults for labels.
 *
 * We do NOT own the GitHub connection: `gh` must be installed and
 * authenticated (`gh auth login`). The prompt tells the LLM to
 * preflight with `gh auth status`; if that fails, execute step
 * aborts cleanly.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PATHS } from '../../shared/paths.js';
import { gitOriginOwnerRepo, parseGithubRemoteUrl } from '../tracker/github.js';
import type { PortResult } from '../tracker/port.js';

// Re-exported for back-compat (tests + callers import these here).
export { parseGithubRemoteUrl };
export { gitOriginOwnerRepo as parseGitRemoteOwnerRepo };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Adapter type. `'github'` uses the `gh` CLI; `'none'` disables all
 *  tracker integration (approve-time auto-push AND manual
 *  `tracker.*` MCP workflows). The default when no matching entry
 *  is found (including when `~/.insrc/github.json` is absent) is
 *  `'none'` — the tracker is opt-in. Set `"type": "github"` with an
 *  owner + repo (or rely on the entry-level owner/repo for
 *  back-compat) to enable. */
export type TrackerAdapter = 'github' | 'none';

export interface GithubEntry {
	/** Adapter selector. If omitted, defaults to `'github'`. Set to
	 *  `'none'` to disable the tracker for this entry — owner/repo
	 *  then become irrelevant and can be omitted. */
	readonly type?:         TrackerAdapter;
	readonly owner?:        string;
	readonly repo?:         string;
	readonly epicLabel?:    string;      // default 'insrc:epic'
	readonly storyLabel?:   string;      // default 'insrc:story'
	readonly taskLabel?:    string;      // default 'insrc:task'
	readonly useMilestones?: boolean;    // default false
	/** Push Task-tier issues (one per PlanTask) as native GitHub issues,
	 *  sub-issues of the Story, when a plan is approved. Opt-in (default
	 *  false) — Task issues can be numerous and lean on org features
	 *  (issue types + sub-issues) that not every org enables. */
	readonly pushTasks?:    boolean;     // default false
	/** Commit + push the workflow artifacts (JSON + rendered MD) on approval, so
	 *  the chain is portable (anyone who pulls can proceed). Default true. */
	readonly commitArtifacts?: boolean;  // default true
	/** Native GitHub issue-type name applied to Task issues. Set to ''
	 *  to create untyped Task issues. Default 'Task'. Falls back to an
	 *  untyped issue when the org has no such type. */
	readonly taskIssueType?: string;    // default 'Task'
	/** Native GitHub issue-type names for Epic + Story issues (fail-open to
	 *  untyped when the org has no such type). Default 'Epic' / 'Story'. */
	readonly epicIssueType?:  string;   // default 'Epic'
	readonly storyIssueType?: string;   // default 'Story'
}

export interface GithubConfigFile {
	readonly default?: GithubEntry;
	readonly repos?:   Readonly<Record<string, GithubEntry>>;
}

export type ResolvedGithubConfigSource = 'per-repo-config' | 'default-config' | 'git-remote';

/** Discriminated by `type`.
 *   - `type: 'github'` carries owner/repo/labels (guaranteed non-empty).
 *   - `type: 'none'`   carries no repo target; every tracker call
 *                      short-circuits with a clear skip / refuse. */
export type ResolvedGithubConfig =
	| {
		readonly type:          'github';
		readonly owner:         string;
		readonly repo:          string;
		readonly epicLabel:     string;
		readonly storyLabel:    string;
		readonly taskLabel:     string;
		readonly useMilestones: boolean;
		readonly pushTasks:     boolean;
		readonly commitArtifacts: boolean;
		readonly taskIssueType: string;
		readonly epicIssueType:  string;
		readonly storyIssueType: string;
		readonly source:        ResolvedGithubConfigSource;
	}
	| {
		readonly type:          'none';
		readonly source:        ResolvedGithubConfigSource;
	};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_EPIC_LABEL:  string = 'insrc:epic';
const DEFAULT_STORY_LABEL: string = 'insrc:story';
const DEFAULT_TASK_LABEL:  string = 'insrc:task';
const DEFAULT_TASK_ISSUE_TYPE: string = 'Task';
const DEFAULT_EPIC_ISSUE_TYPE: string = 'Epic';
const DEFAULT_STORY_ISSUE_TYPE: string = 'Story';

// ---------------------------------------------------------------------------
// Config path
// ---------------------------------------------------------------------------

/** Resolves the config file location. Honors `INSRC_GITHUB_CONFIG`
 *  when set — used by tests to keep the resolver away from the user's
 *  real `~/.insrc/github.json`. */
export function githubConfigPath(): string {
	const override = process.env['INSRC_GITHUB_CONFIG'];
	if (typeof override === 'string' && override.length > 0) return override;
	return join(PATHS.insrc, 'github.json');
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export function loadGithubConfigFile(configPath: string = githubConfigPath()): GithubConfigFile {
	if (!existsSync(configPath)) return {};
	try {
		const raw = readFileSync(configPath, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed !== 'object' || parsed === null) return {};
		return parsed as GithubConfigFile;
	} catch {
		return {};
	}
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Errors surface when neither the config file nor the git remote
 *  yields a valid owner/repo. The tracker workflows refuse to
 *  proceed without a target. */
export class GithubConfigError extends Error {
	constructor(msg: string) { super(msg); this.name = 'GithubConfigError'; }
}

/** Resolve the effective config for a repo. Precedence:
 *   1. `github.json` `repos.<repoPath>` entry — the repo's OWN config;
 *      may name an explicit owner/repo, or `{ type: 'github' }` to
 *      auto-detect the repo's git remote.
 *   2. `github.json` `default` entry — supplies github-enablement +
 *      shared label/behaviour settings ONLY. Its owner/repo (if any) is
 *      IGNORED: a repo's tracker target NEVER comes from a global
 *      default — it always resolves to the repo's own git remote.
 *   3. Implicit default: `{ type: 'none' }`.
 *
 *  The result is a discriminated union on `type`:
 *   - `{ type: 'github', owner, repo, ... }` — a real tracker target.
 *   - `{ type: 'none' }` — no tracker. Tracker operations short-circuit.
 *
 *  Why a global default may not target a repo: a `default` with an
 *  explicit owner/repo would silently push EVERY unconfigured repo's
 *  issues to that one repo (the AFM-epics-into-insrc bug). The target
 *  must be the repo's own — per-repo config or `git remote origin`.
 *
 *  Throws `GithubConfigError` only when github is enabled for the repo
 *  but no owner/repo could be resolved (per-repo entry named none, or
 *  the git remote could not be parsed). Callers gate on this. */
export function resolveGithubConfig(repoPath: string, configPath: string = githubConfigPath()): ResolvedGithubConfig {
	const file = loadGithubConfigFile(configPath);
	const perRepo = file.repos?.[repoPath];
	if (perRepo !== undefined) {
		// The repo's OWN entry — an explicit owner/repo here is intentional.
		const resolved = resolveEntry(perRepo, file.default, repoPath, 'per-repo-config', true);
		if (resolved !== null) return resolved;
	}
	if (file.default !== undefined) {
		// Global default: honour its enablement + label/behaviour settings,
		// but NEVER its owner/repo — the target is the repo's git remote. The
		// tier source stays 'default-config'; resolveEntry's git-remote branch
		// self-labels 'git-remote' when it resolves an actual target.
		const resolved = resolveEntry(file.default, undefined, repoPath, 'default-config', false);
		if (resolved !== null) return resolved;
	}
	// Implicit default: none. The user hasn't opted in.
	return { type: 'none', source: 'default-config' };
}

/** Resolve a single entry into a config value.
 *   - `type: 'none'` → none.
 *   - Entry has owner AND repo (and `allowEntryTarget`) → github.
 *   - Explicit `type: 'github'` with missing owner/repo → git-remote fallback,
 *     throwing `GithubConfigError` when that fails.
 *   - Empty / partial entries → null (caller falls through to the next tier).
 *
 *  `allowEntryTarget` gates whether this entry's own owner/repo may be used
 *  as the target. It is `true` for a repo's own per-repo entry and `false`
 *  for the global default — a global default must never target a repo, so
 *  its owner/repo is skipped and the target resolves to the git remote. */
function resolveEntry(
	entry: GithubEntry,
	fallbackDefaults: GithubEntry | undefined,
	repoPath: string,
	source: ResolvedGithubConfigSource,
	allowEntryTarget: boolean,
): ResolvedGithubConfig | null {
	if (entry.type === 'none') {
		return { type: 'none', source };
	}
	const hasOwner = allowEntryTarget && typeof entry.owner === 'string' && entry.owner.length > 0;
	const hasRepo  = allowEntryTarget && typeof entry.repo  === 'string' && entry.repo.length  > 0;
	if (hasOwner && hasRepo) {
		return {
			type:          'github',
			owner:         entry.owner!,
			repo:          entry.repo!,
			epicLabel:     entry.epicLabel  ?? fallbackDefaults?.epicLabel  ?? DEFAULT_EPIC_LABEL,
			storyLabel:    entry.storyLabel ?? fallbackDefaults?.storyLabel ?? DEFAULT_STORY_LABEL,
			taskLabel:     entry.taskLabel  ?? fallbackDefaults?.taskLabel  ?? DEFAULT_TASK_LABEL,
			useMilestones: entry.useMilestones ?? fallbackDefaults?.useMilestones ?? false,
			pushTasks:     entry.pushTasks ?? fallbackDefaults?.pushTasks ?? false,
			commitArtifacts: entry.commitArtifacts ?? fallbackDefaults?.commitArtifacts ?? true,
			taskIssueType: entry.taskIssueType ?? fallbackDefaults?.taskIssueType ?? DEFAULT_TASK_ISSUE_TYPE,
			epicIssueType: entry.epicIssueType ?? fallbackDefaults?.epicIssueType ?? DEFAULT_EPIC_ISSUE_TYPE,
			storyIssueType: entry.storyIssueType ?? fallbackDefaults?.storyIssueType ?? DEFAULT_STORY_ISSUE_TYPE,
			source,
		};
	}
	if (entry.type === 'github') {
		// User explicitly asked for github but did not name a target.
		// Fall back to the git origin remote, or throw with a
		// specific reason so the misconfiguration surfaces.
		const remote = gitOriginOwnerRepo(repoPath);
		if (remote === null) {
			throw new GithubConfigError(
				`GitHub tracker requested (type: 'github') for repo '${repoPath}' but no ` +
				`owner/repo is set and 'git remote get-url origin' could not be parsed. ` +
				`Add owner + repo to the entry in ${githubConfigPath()}.`,
			);
		}
		return {
			type:          'github',
			owner:         remote.owner,
			repo:          remote.repo,
			epicLabel:     entry.epicLabel  ?? fallbackDefaults?.epicLabel  ?? DEFAULT_EPIC_LABEL,
			storyLabel:    entry.storyLabel ?? fallbackDefaults?.storyLabel ?? DEFAULT_STORY_LABEL,
			taskLabel:     entry.taskLabel  ?? fallbackDefaults?.taskLabel  ?? DEFAULT_TASK_LABEL,
			useMilestones: entry.useMilestones ?? fallbackDefaults?.useMilestones ?? false,
			pushTasks:     entry.pushTasks ?? fallbackDefaults?.pushTasks ?? false,
			commitArtifacts: entry.commitArtifacts ?? fallbackDefaults?.commitArtifacts ?? true,
			taskIssueType: entry.taskIssueType ?? fallbackDefaults?.taskIssueType ?? DEFAULT_TASK_ISSUE_TYPE,
			epicIssueType: entry.epicIssueType ?? fallbackDefaults?.epicIssueType ?? DEFAULT_EPIC_ISSUE_TYPE,
			storyIssueType: entry.storyIssueType ?? fallbackDefaults?.storyIssueType ?? DEFAULT_STORY_ISSUE_TYPE,
			source:        'git-remote',
		};
	}
	// Empty entry with no `type`, no owner, no repo — nothing to do; let the caller fall through.
	return null;
}

// ---------------------------------------------------------------------------
// Strict resolution (team features: `loadTracker` only)
// ---------------------------------------------------------------------------

export interface StrictTrackerTarget {
	readonly owner: string;
	readonly repo: string;
}

const OWNER_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const REPO_NAME_RE = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

function strictRefuse(reason: string): PortResult<StrictTrackerTarget> {
	return { ok: false, kind: 'rejected', reason };
}

function strictTarget(owner: unknown, repo: unknown, where: string): PortResult<StrictTrackerTarget> {
	if (typeof owner !== 'string' || !OWNER_NAME_RE.test(owner)) return strictRefuse(`${where}: invalid GitHub owner '${String(owner)}'`);
	if (typeof repo !== 'string' || !REPO_NAME_RE.test(repo)) return strictRefuse(`${where}: invalid GitHub repo '${String(repo)}'`);
	return { ok: true, value: { owner, repo } };
}

function strictOrigin(repoPath: string, where: string): PortResult<StrictTrackerTarget> {
	const remote = gitOriginOwnerRepo(repoPath);
	if (remote === null) return strictRefuse(`${where}: type 'github' names no owner/repo and the origin remote of '${repoPath}' could not be parsed`);
	return strictTarget(remote.owner, remote.repo, `${where} (origin remote)`);
}

/** Strict counterpart of {@link resolveGithubConfig} for team features. Same
 *  precedence (the repo's own entry; the default entry enables only and never
 *  supplies a target), but every malformed or unsupported configuration is a
 *  refusal instead of a silent fallback to "no tracker". `resolveGithubConfig`
 *  stays lenient and untouched; only `loadTracker` calls this. */
export function resolveStrictTrackerTarget(repoPath: string, configPath: string = githubConfigPath()): PortResult<StrictTrackerTarget> {
	if (!existsSync(configPath)) return strictRefuse(`no tracker is configured: ${configPath} does not exist`);
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(configPath, 'utf8'));
	} catch (err) {
		return strictRefuse(`${configPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return strictRefuse(`${configPath} must contain a JSON object`);
	const file = parsed as Record<string, unknown>;

	const repos = file['repos'];
	if (repos !== undefined && (typeof repos !== 'object' || repos === null || Array.isArray(repos))) return strictRefuse(`${configPath}: 'repos' must be an object`);
	const own = (repos as Record<string, unknown> | undefined)?.[repoPath];
	if (own !== undefined) {
		const r = strictEntry(own, repoPath, 'the repo entry', true);
		if (r !== null) return r;
	}
	const def = file['default'];
	if (def !== undefined) {
		const r = strictEntry(def, repoPath, "the 'default' entry", false);
		if (r !== null) return r;
	}
	return strictRefuse(`no tracker is configured for '${repoPath}' (type none)`);
}

/** null = the entry says nothing (fall through to the next tier). */
function strictEntry(raw: unknown, repoPath: string, where: string, allowEntryTarget: boolean): PortResult<StrictTrackerTarget> | null {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return strictRefuse(`${where} must be a JSON object`);
	const e = raw as Record<string, unknown>;
	const type = e['type'];
	if (type !== undefined && type !== 'github' && type !== 'none') return strictRefuse(`${where}: unsupported tracker type '${String(type)}'`);
	if (type === 'none') return strictRefuse(`${where}: the tracker is disabled (type none)`);
	// Any owner or repo the repo's own entry names is a target and must be valid
	// and complete: a half-named or empty one is refused, never papered over by
	// the origin remote.
	if (allowEntryTarget && (e['owner'] !== undefined || e['repo'] !== undefined)) return strictTarget(e['owner'], e['repo'], where);
	if (type === 'github') return strictOrigin(repoPath, where);
	return null;
}
