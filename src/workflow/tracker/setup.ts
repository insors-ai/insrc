/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tracker-setup engine — the one-shot bootstrap behind `insrc tracker
 * setup`. It walks the (learned-by-doing) checklist that gets a GitHub
 * repo ready for the Epic/Story/Task push, performing every automatable
 * step and returning structured guidance for the steps a machine can't
 * complete (interactive auth grants + UI-only Projects views).
 *
 * Design:
 *  - Every step is idempotent (check-then-act) and NON-FATAL: a failure
 *    or a manual gate on one step still lets the rest run where their
 *    own prerequisites are met.
 *  - Steps whose prerequisite isn't met (e.g. issue types without the
 *    `admin:org` scope) return `status:'manual'` carrying the exact
 *    `action` command the user must run.
 *  - The Projects VIEWS step is UI-only and therefore ALWAYS manual — it
 *    ships the click-list in `detail`. It is only emitted when a Project
 *    is in scope (`includeProject`).
 *  - ALL gh/git calls route through `./github.js`, whose `_exec` seam is
 *    swappable via `_setTrackerExecForTests`, so this whole engine unit-
 *    tests against a fake `gh`.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { githubConfigPath, loadGithubConfigFile, type GithubConfigFile } from '../config/github.js';
import { STATUS_LABELS } from './conventions.js';
import {
	ghAddProjectItem,
	ghAddProjectSingleSelectField,
	ghAuthOk,
	ghCreateLabel,
	ghCreateOrgIssueType,
	ghCreateProject,
	ghFindProjectByTitle,
	ghListOrgIssueTypes,
	ghListRepoIssueUrls,
	ghTokenScopes,
	gitOriginOwnerRepo,
} from './github.js';

const log = getLogger('tracker-setup');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrackerSetupStatus = 'done' | 'already' | 'manual' | 'skipped' | 'failed';

export interface TrackerSetupStep {
	readonly key:    string;
	readonly title:  string;
	readonly status: TrackerSetupStatus;
	readonly detail: string;
	/** Exact command / URL for a manual step. Omitted otherwise. */
	readonly action?: string;
}

export interface TrackerSetupReport {
	readonly steps: readonly TrackerSetupStep[];
	readonly manualRemaining: number;
}

export interface TrackerSetupOptions {
	/** Also create a Projects v2 board (needs the `project` scope). */
	readonly includeProject?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The interactive device-flow refresh that grants both gated scopes.
 *  Returned as the `action` on every scope-blocked step. */
const SCOPE_REFRESH = 'gh auth refresh -h github.com -s admin:org,project,read:project';

/** Fixed tracker labels every repo needs (the per-epic `epic:<slug>`
 *  membership label is created at push time, not at setup). */
const SETUP_LABELS: readonly string[] = ['insrc:epic', 'insrc:story', 'insrc:task', ...STATUS_LABELS];

/** Org issue types the workflow relies on. Task/Bug/Feature pre-exist on
 *  most orgs; Epic + Story are the ones we create. Colors are from the
 *  fixed GitHub issue-type palette. */
const SETUP_ISSUE_TYPES: readonly { readonly name: string; readonly color: string; readonly description: string }[] = [
	{ name: 'Epic',  color: 'purple', description: 'insrc workflow Epic — a define/HLD-scoped body of work' },
	{ name: 'Story', color: 'blue',   description: 'insrc workflow Story — a user-valued slice of an Epic' },
];

/** Cap on how many existing issues we seed a fresh Project board with. */
const PROJECT_ITEM_CAP = 200;

type OwnerRepo = { readonly owner: string; readonly repo: string };

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/** Run the tracker-setup checklist for a repo. Non-fatal + idempotent;
 *  see the module header. `manualRemaining` counts the steps the user
 *  still has to complete by hand. */
export function runTrackerSetup(repoPath: string, opts: TrackerSetupOptions = {}): TrackerSetupReport {
	const includeProject = opts.includeProject === true;
	const steps: TrackerSetupStep[] = [];

	// 1. gh CLI present + authenticated.
	const auth = ghAuthOk();
	steps.push(auth.ok
		? { key: 'gh-auth', title: 'gh CLI authenticated', status: 'already', detail: 'gh is installed and authenticated' }
		: { key: 'gh-auth', title: 'gh CLI authenticated', status: 'manual', detail: auth.reason, action: 'gh auth login' });

	// 2. OAuth scopes (admin:org for issue types, project for the board).
	let hasAdminOrg = false;
	let hasProject = false;
	if (!auth.ok) {
		steps.push({ key: 'oauth-scopes', title: 'OAuth scopes (admin:org, project)', status: 'skipped', detail: 'requires gh auth (see above)' });
	} else {
		const sc = ghTokenScopes();
		if (!sc.ok) {
			steps.push({ key: 'oauth-scopes', title: 'OAuth scopes (admin:org, project)', status: 'manual', detail: sc.reason, action: SCOPE_REFRESH });
		} else {
			hasAdminOrg = sc.scopes.includes('admin:org');
			hasProject = sc.scopes.includes('project');
			const missing = [...(hasAdminOrg ? [] : ['admin:org']), ...(hasProject ? [] : ['project'])];
			steps.push(missing.length === 0
				? { key: 'oauth-scopes', title: 'OAuth scopes (admin:org, project)', status: 'already', detail: `scopes present: ${sc.scopes.join(', ') || '(none reported)'}` }
				: { key: 'oauth-scopes', title: 'OAuth scopes (admin:org, project)', status: 'manual', detail: `missing scope(s): ${missing.join(', ')}`, action: SCOPE_REFRESH });
		}
	}

	// owner/repo, needed by config + every gh target step.
	const remote = gitOriginOwnerRepo(repoPath);

	// 3. ~/.insrc/github.json config (no gh needed — always runs).
	steps.push(ensureConfig(repoPath, remote));

	// 4. Labels.
	steps.push(ensureLabels(auth.ok, remote));

	// 5. Org issue types (Epic + Story).
	steps.push(ensureIssueTypes(auth.ok, hasAdminOrg, remote));

	// 6. Project (optional, behind --project).
	steps.push(ensureProject(includeProject, auth.ok, hasProject, remote));

	// 7. Project views — UI-only, ALWAYS manual; only when a Project is in scope.
	if (includeProject) steps.push(projectViews(remote));

	const manualRemaining = steps.filter(s => s.status === 'manual').length;
	return { steps, manualRemaining };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const CONFIG_KEY = 'config';
const CONFIG_TITLE = '~/.insrc/github.json config';

/** Ensure the repo has a complete `type:'github'` entry (owner/repo +
 *  pushTasks + commitArtifacts). Writes/merges it when absent or
 *  incomplete. Automatable — no gh required. */
function ensureConfig(repoPath: string, remote: OwnerRepo | null): TrackerSetupStep {
	if (remote === null) {
		return { key: CONFIG_KEY, title: CONFIG_TITLE, status: 'failed', detail: 'could not determine owner/repo from `git remote get-url origin` — add a GitHub origin remote' };
	}
	const path = githubConfigPath();
	const file = loadGithubConfigFile(path);
	const entry = file.repos?.[repoPath] ?? file.default;
	const complete = entry !== undefined
		&& entry.type === 'github'
		&& typeof entry.owner === 'string' && entry.owner.length > 0
		&& typeof entry.repo === 'string' && entry.repo.length > 0
		&& entry.pushTasks === true
		&& entry.commitArtifacts === true;
	if (complete) {
		return { key: CONFIG_KEY, title: CONFIG_TITLE, status: 'already', detail: `${path} already targets ${entry!.owner}/${entry!.repo}` };
	}
	const next: GithubConfigFile = {
		...file,
		repos: {
			...file.repos,
			[repoPath]: { type: 'github', owner: remote.owner, repo: remote.repo, pushTasks: true, commitArtifacts: true },
		},
	};
	try {
		if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
	} catch (err) {
		return { key: CONFIG_KEY, title: CONFIG_TITLE, status: 'failed', detail: `could not write ${path}: ${(err as Error).message}` };
	}
	log.info({ path, owner: remote.owner, repo: remote.repo }, 'tracker setup: wrote github config');
	return { key: CONFIG_KEY, title: CONFIG_TITLE, status: 'done', detail: `wrote ${path} for ${remote.owner}/${remote.repo} (pushTasks + commitArtifacts on)` };
}

const LABELS_KEY = 'labels';
const LABELS_TITLE = 'Tracker labels';

/** Idempotently upsert the fixed tracker labels (`ghCreateLabel` uses
 *  `--force`). Needs gh auth. */
function ensureLabels(authOk: boolean, remote: OwnerRepo | null): TrackerSetupStep {
	if (!authOk) return { key: LABELS_KEY, title: LABELS_TITLE, status: 'skipped', detail: 'requires gh auth (see above)' };
	if (remote === null) return { key: LABELS_KEY, title: LABELS_TITLE, status: 'failed', detail: 'no owner/repo (git remote origin missing)' };
	const failed: string[] = [];
	for (const label of SETUP_LABELS) {
		if (!ghCreateLabel(remote.owner, remote.repo, label)) failed.push(label);
	}
	if (failed.length > 0) {
		return { key: LABELS_KEY, title: LABELS_TITLE, status: 'failed', detail: `failed to create: ${failed.join(', ')}` };
	}
	return { key: LABELS_KEY, title: LABELS_TITLE, status: 'done', detail: `ensured ${SETUP_LABELS.length} labels: ${SETUP_LABELS.join(', ')}` };
}

const TYPES_KEY = 'issue-types';
const TYPES_TITLE = 'Org issue types (Epic, Story)';

/** Ensure the Epic + Story org issue types exist. Gated on `admin:org`
 *  → manual (with the refresh command) when the scope is missing.
 *  Existing types are read via GraphQL, so re-runs are `already`. */
function ensureIssueTypes(authOk: boolean, hasAdminOrg: boolean, remote: OwnerRepo | null): TrackerSetupStep {
	if (!authOk) return { key: TYPES_KEY, title: TYPES_TITLE, status: 'skipped', detail: 'requires gh auth (see above)' };
	if (remote === null) return { key: TYPES_KEY, title: TYPES_TITLE, status: 'failed', detail: 'no owner/repo (git remote origin missing)' };
	if (!hasAdminOrg) {
		return { key: TYPES_KEY, title: TYPES_TITLE, status: 'manual', detail: 'creating org issue types needs the `admin:org` scope', action: SCOPE_REFRESH };
	}
	const org = remote.owner;
	const existing = ghListOrgIssueTypes(org);
	const created: string[] = [];
	const already: string[] = [];
	const failed: string[] = [];
	for (const t of SETUP_ISSUE_TYPES) {
		if (existing.includes(t.name)) { already.push(t.name); continue; }
		if (ghCreateOrgIssueType(org, t.name, t.color, t.description)) created.push(t.name);
		else failed.push(t.name);
	}
	if (failed.length > 0) {
		return { key: TYPES_KEY, title: TYPES_TITLE, status: 'failed', detail: `created ${created.join(', ') || 'none'}; failed ${failed.join(', ')} — is '${org}' an organization (personal accounts have no org issue types)?` };
	}
	if (created.length === 0) {
		return { key: TYPES_KEY, title: TYPES_TITLE, status: 'already', detail: `issue types already present: ${already.join(', ')}` };
	}
	return { key: TYPES_KEY, title: TYPES_TITLE, status: 'done', detail: `created: ${created.join(', ')}${already.length > 0 ? `; already present: ${already.join(', ')}` : ''}` };
}

const PROJECT_KEY = 'project';
const PROJECT_TITLE = 'GitHub Project board';

/** Create the Projects v2 board, add its `Size` field, and seed it with
 *  the existing issues. Optional (behind --project) and gated on the
 *  `project` scope → manual when missing. */
function ensureProject(includeProject: boolean, authOk: boolean, hasProject: boolean, remote: OwnerRepo | null): TrackerSetupStep {
	if (!includeProject) return { key: PROJECT_KEY, title: PROJECT_TITLE, status: 'skipped', detail: 'pass --project to create a Projects v2 board' };
	if (!authOk) return { key: PROJECT_KEY, title: PROJECT_TITLE, status: 'skipped', detail: 'requires gh auth (see above)' };
	if (remote === null) return { key: PROJECT_KEY, title: PROJECT_TITLE, status: 'failed', detail: 'no owner/repo (git remote origin missing)' };
	if (!hasProject) {
		return { key: PROJECT_KEY, title: PROJECT_TITLE, status: 'manual', detail: 'creating a Project needs the `project` scope', action: SCOPE_REFRESH };
	}
	const org = remote.owner;
	const title = `insrc — ${remote.repo}`;
	// Idempotent: reuse an open board with this title rather than spawning a
	// duplicate on every run. Only create when none exists.
	const existing = ghFindProjectByTitle(org, title);
	const proj = existing ?? ghCreateProject(org, title);
	if (proj === null) {
		return { key: PROJECT_KEY, title: PROJECT_TITLE, status: 'failed', detail: `\`gh project create\` failed for owner '${org}'` };
	}
	const fieldOk = ghAddProjectSingleSelectField(org, proj.number, 'Size', ['XS', 'S', 'M', 'L', 'XL']);
	const urls = ghListRepoIssueUrls(remote.owner, remote.repo, PROJECT_ITEM_CAP);
	const capped = urls.length >= PROJECT_ITEM_CAP;
	let added = 0;
	for (const url of urls) {
		if (ghAddProjectItem(org, proj.number, url)) added += 1;
	}
	const notes = [
		`${existing !== null ? 'reused' : 'created'} board #${proj.number}${proj.url.length > 0 ? ` (${proj.url})` : ''}`,
		fieldOk ? 'Size field ensured' : 'Size field FAILED',
		`${added}/${urls.length} issues added${capped ? ` (capped at ${PROJECT_ITEM_CAP})` : ''}`,
	];
	const step: TrackerSetupStep = { key: PROJECT_KEY, title: PROJECT_TITLE, status: existing !== null ? 'already' : 'done', detail: notes.join('; ') };
	return proj.url.length > 0 ? { ...step, action: proj.url } : step;
}

const VIEWS_KEY = 'project-views';
const VIEWS_TITLE = 'Project views (manual)';

/** Projects views are UI-only — always manual. Returns the click-list. */
function projectViews(remote: OwnerRepo | null): TrackerSetupStep {
	const detail = [
		'Projects views are UI-only — add these to the board:',
		'• Epics — Table view, filter `type:Epic`',
		'• Stories — Board view, filter `type:Story`, group by Parent issue',
		'• Tasks — Table view, filter `type:Task`, group by Parent issue',
		'• Tree — Table view, enable the "Show sub-issues" toggle',
	].join('\n');
	const step: TrackerSetupStep = { key: VIEWS_KEY, title: VIEWS_TITLE, status: 'manual', detail };
	return remote !== null ? { ...step, action: `https://github.com/orgs/${remote.owner}/projects` } : step;
}
