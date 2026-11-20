/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's per-repository settings file, `~/.insrc/repo-config.json`: where it lives, its shape and a
 * lenient loader. GitHub is only one repo type, so nothing here is GitHub-specific; the tracker's resolution
 * of a repo's GitHub target is in `github.ts`, which reads the file through this module. The strict reader and
 * the verified writer are in `repo-config-store.ts`.
 *
 * Config file shape:
 * ```json
 * {
 *   "default": { "owner": "myorg", "repo": "myrepo", "epicLabel": "insrc:epic" },
 *   "repos":   { "/abs/path/to/repo": { "owner": "...", "repo": "..." } }
 * }
 * ```
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PATHS } from '../../shared/paths.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Adapter type. `'github'` uses the `gh` CLI; `'none'` disables all
 *  tracker integration (approve-time auto-push AND manual
 *  `tracker.*` MCP workflows). The default when no matching entry
 *  is found (including when `~/.insrc/repo-config.json` is absent) is
 *  `'none'` — the tracker is opt-in. Set `"type": "github"` with an
 *  owner + repo (or rely on the entry-level owner/repo for
 *  back-compat) to enable. */
export type TrackerAdapter = 'github' | 'none';

export interface RepoConfigEntry {
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
	/** Where the `gh` program lives. Stored and shown only; the gh runner does not read it yet. */
	readonly ghPath?:       string;
	/** The host `gh` signs in to (default github.com). Stored and shown only; the gh runner does not read it yet. */
	readonly ghHost?:       string;
	/** Branch naming pattern. Stored and shown only; consumed later by the handoff story (s6). */
	readonly branchPattern?: string;
	/** The build gate's typecheck command line for this project, split on spaces. Used with `testCommand`; absent means the project type's default. */
	readonly typecheckCommand?: string;
	/** The build gate's test command line for this project; each test file is appended. Used with `typecheckCommand`. */
	readonly testCommand?: string;
	/** How the gate reads a run of these commands: 'exit-code' (default) or 'tap'. Applies only when both commands are set. */
	readonly resultFormat?: string;
	/** Whether the daemon installed the git hooks that refresh the tracker status for git run outside it (default false). Set by repo.gitHooks.install and uninstall. */
	readonly gitHooks?: boolean;
}

export interface RepoConfigFile {
	readonly default?: RepoConfigEntry;
	readonly repos?:   Readonly<Record<string, RepoConfigEntry>>;
}

// ---------------------------------------------------------------------------
// Config path
// ---------------------------------------------------------------------------

/** Resolves the config file location. Honors `INSRC_REPO_CONFIG`
 *  when set — used by tests to keep readers away from the user's
 *  real `~/.insrc/repo-config.json`. */
export function repoConfigPath(): string {
	const override = process.env['INSRC_REPO_CONFIG'];
	if (typeof override === 'string' && override.length > 0) return override;
	return join(PATHS.insrc, 'repo-config.json');
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export function loadRepoConfigFile(configPath: string = repoConfigPath()): RepoConfigFile {
	if (!existsSync(configPath)) return {};
	try {
		const raw = readFileSync(configPath, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed !== 'object' || parsed === null) return {};
		return parsed as RepoConfigFile;
	} catch {
		return {};
	}
}
