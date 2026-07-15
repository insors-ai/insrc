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
	readonly useMilestones?: boolean;    // default false
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
		readonly useMilestones: boolean;
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
 *   1. `github.json` `repos.<repoPath>` entry
 *   2. `github.json` `default` entry
 *   3. Implicit default: `{ type: 'none' }`
 *
 *  The result is a discriminated union on `type`:
 *   - `{ type: 'github', owner, repo, ... }` — a real tracker target.
 *   - `{ type: 'none' }` — no tracker. This is the DEFAULT when no
 *     matching entry resolves (including when the config file is
 *     absent). Tracker operations short-circuit cleanly.
 *
 *  Enable `github` explicitly by either:
 *   - `{ type: "github", owner: "...", repo: "..." }` (recommended), OR
 *   - `{ owner: "...", repo: "..." }` (implicit github, back-compat), OR
 *   - `{ type: "github" }` alone — auto-detects owner/repo from
 *     `git remote get-url origin`. Throws `GithubConfigError` if the
 *     remote can't be parsed.
 *
 *  Throws `GithubConfigError` only when the matched entry explicitly
 *  asked for github but no owner/repo could be resolved. */
export function resolveGithubConfig(repoPath: string, configPath: string = githubConfigPath()): ResolvedGithubConfig {
	const file = loadGithubConfigFile(configPath);
	const perRepo = file.repos?.[repoPath];
	if (perRepo !== undefined) {
		const resolved = resolveEntry(perRepo, file.default, repoPath, 'per-repo-config');
		if (resolved !== null) return resolved;
	}
	if (file.default !== undefined) {
		const resolved = resolveEntry(file.default, undefined, repoPath, 'default-config');
		if (resolved !== null) return resolved;
	}
	// Implicit default: none. The user hasn't opted in.
	return { type: 'none', source: 'default-config' };
}

/** Resolve a single entry into a config value.
 *   - `type: 'none'` → none.
 *   - Entry has owner AND repo → github (type defaults to github when omitted).
 *   - Explicit `type: 'github'` with missing owner/repo → git-remote fallback,
 *     throwing `GithubConfigError` when that fails.
 *   - Empty / partial entries → null (caller falls through to the next tier). */
function resolveEntry(
	entry: GithubEntry,
	fallbackDefaults: GithubEntry | undefined,
	repoPath: string,
	source: ResolvedGithubConfigSource,
): ResolvedGithubConfig | null {
	if (entry.type === 'none') {
		return { type: 'none', source };
	}
	const hasOwner = typeof entry.owner === 'string' && entry.owner.length > 0;
	const hasRepo  = typeof entry.repo  === 'string' && entry.repo.length  > 0;
	if (hasOwner && hasRepo) {
		return {
			type:          'github',
			owner:         entry.owner!,
			repo:          entry.repo!,
			epicLabel:     entry.epicLabel  ?? fallbackDefaults?.epicLabel  ?? DEFAULT_EPIC_LABEL,
			storyLabel:    entry.storyLabel ?? fallbackDefaults?.storyLabel ?? DEFAULT_STORY_LABEL,
			useMilestones: entry.useMilestones ?? fallbackDefaults?.useMilestones ?? false,
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
			useMilestones: entry.useMilestones ?? fallbackDefaults?.useMilestones ?? false,
			source:        'git-remote',
		};
	}
	// Empty entry with no `type`, no owner, no repo — nothing to do; let the caller fall through.
	return null;
}
