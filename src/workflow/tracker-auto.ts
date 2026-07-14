/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Approve-time GitHub tracker integration.
 *
 * When `insrc workflow approve` succeeds on an HLD or LLD artifact,
 * the CLI calls into this module to create the corresponding GitHub
 * issue directly (via `gh`) and patches the artifact's meta with the
 * resulting ref. Idempotent: an artifact whose meta already carries
 * `epicRef` / `storyRef` is skipped without touching GitHub.
 *
 * Design shape:
 *   - `autoPushEpicOnHld(hldJsonPath)` reads the HLD meta + its parent
 *     Define (for the Epic problem + Story titles), creates labels,
 *     creates the Epic issue, and writes `meta.epicRef` back into the
 *     HLD JSON.
 *   - `autoPushStoryOnLld(lldJsonPath)` reads the LLD meta + parent
 *     HLD (for the Epic ref) + parent Define (for the Story detail),
 *     creates the Story issue with an `**Epic:** #N` back-ref, edits
 *     the Epic body to replace the placeholder task-list line for
 *     this Story with a `#N —` prefix, and writes `meta.storyRef`
 *     back into the LLD JSON.
 *
 * Fail-open: gh unavailable, github config missing, or gh API errors
 * do NOT undo the approve. The CLI surfaces a short warning and the
 * user can push manually later via the batch `tracker.push` workflow.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { getLogger } from '../shared/logger.js';
import { readDefineArtifact } from './gates.js';
import { hldArtifactPaths, writeAtomic } from './storage.js';
import { GithubConfigError, resolveGithubConfig, type ResolvedGithubConfig } from './config/github.js';
import type { DefineArtifact, DefineStory } from './artifacts/define.js';

const log = getLogger('workflow:tracker-auto');

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

export type AutoPushResult =
	| { readonly status: 'created';        readonly epicRef?: string; readonly storyRef?: string; readonly labelsCreated?: readonly string[] }
	| { readonly status: 'already-exists'; readonly epicRef?: string; readonly storyRef?: string }
	| { readonly status: 'skipped';        readonly reason: string }
	| { readonly status: 'failed';         readonly reason: string };

// ---------------------------------------------------------------------------
// gh helpers (thin wrappers around execFileSync)
// ---------------------------------------------------------------------------

function ghAvailable(): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
	try {
		execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
		return { ok: true };
	} catch {
		return { ok: false, reason: 'gh CLI not available or not authenticated (run `gh auth login`)' };
	}
}

function ghCreateLabelIdempotent(owner: string, repo: string, name: string): boolean {
	try {
		execFileSync('gh', ['label', 'create', name, '--repo', `${owner}/${repo}`, '--force'], { stdio: 'ignore' });
		return true;
	} catch (err) {
		log.warn({ label: name, err: (err as Error).message }, 'failed to create label');
		return false;
	}
}

function ghCreateIssue(
	owner: string,
	repo: string,
	title: string,
	body: string,
	labels: readonly string[],
): string {
	const url = execFileSync(
		'gh',
		[
			'issue', 'create',
			'--repo', `${owner}/${repo}`,
			'--title', title,
			'--body', body,
			'--label', labels.join(','),
		],
		{ encoding: 'utf8' },
	).trim();
	const m = /\/(\d+)$/.exec(url);
	if (m === null) {
		throw new Error(`gh issue create returned an unrecognized URL: '${url}'`);
	}
	return `${owner}/${repo}#${m[1]!}`;
}

function ghGetIssueBody(owner: string, repo: string, ref: string): string {
	const num = extractIssueNumber(ref);
	return execFileSync(
		'gh',
		['issue', 'view', num, '--repo', `${owner}/${repo}`, '--json', 'body', '-q', '.body'],
		{ encoding: 'utf8' },
	);
}

function ghEditIssueBody(owner: string, repo: string, ref: string, body: string): void {
	const num = extractIssueNumber(ref);
	execFileSync(
		'gh',
		['issue', 'edit', num, '--repo', `${owner}/${repo}`, '--body', body],
		{ stdio: 'ignore' },
	);
}

function extractIssueNumber(ref: string): string {
	const idx = ref.indexOf('#');
	if (idx < 0) throw new Error(`invalid issue ref: '${ref}' (expected owner/repo#N)`);
	return ref.slice(idx + 1);
}

// ---------------------------------------------------------------------------
// Public entry: HLD → Epic issue
// ---------------------------------------------------------------------------

export function autoPushEpicOnHld(hldJsonPath: string): AutoPushResult {
	const hld = readJson(hldJsonPath);
	const meta = hld.meta;

	if (typeof meta.epicRef === 'string' && meta.epicRef.length > 0) {
		return { status: 'already-exists', epicRef: meta.epicRef };
	}
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'HLD meta is missing epicHash / epicSlug / repoPath' };
	}

	let cfg: ResolvedGithubConfig;
	try {
		cfg = resolveGithubConfig(meta.repoPath);
	} catch (err) {
		if (err instanceof GithubConfigError) {
			return { status: 'skipped', reason: err.message };
		}
		throw err;
	}
	if (cfg.type === 'none') {
		return { status: 'skipped', reason: `tracker disabled via config (type: none, source: ${cfg.source})` };
	}

	const avail = ghAvailable();
	if (!avail.ok) return { status: 'skipped', reason: avail.reason };

	let define: DefineArtifact;
	try {
		define = readDefineArtifact(meta.repoPath, meta.epicHash);
	} catch (err) {
		return { status: 'failed', reason: `cannot read parent Define: ${(err as Error).message}` };
	}

	// Create labels idempotently.
	const labels: readonly string[] = [
		cfg.epicLabel,
		cfg.storyLabel,
		`epic:${meta.epicSlug}`,
		'insrc:in-progress',
		'insrc:blocked',
	];
	const created: string[] = [];
	for (const label of labels) {
		if (ghCreateLabelIdempotent(cfg.owner, cfg.repo, label)) created.push(label);
	}

	// Build + create the Epic issue.
	const title = `Epic: ${firstSentence(define.body.problem)}`;
	const body  = renderEpicBody(define, meta.epicHash, meta.epicSlug);
	let epicRef: string;
	try {
		epicRef = ghCreateIssue(cfg.owner, cfg.repo, title, body, [cfg.epicLabel, `epic:${meta.epicSlug}`]);
	} catch (err) {
		return { status: 'failed', reason: `gh issue create failed: ${(err as Error).message}` };
	}

	patchArtifactMeta(hldJsonPath, { epicRef, epicPushedAt: new Date().toISOString() });
	return { status: 'created', epicRef, labelsCreated: created };
}

// ---------------------------------------------------------------------------
// Public entry: LLD → Story issue + Epic body update
// ---------------------------------------------------------------------------

export function autoPushStoryOnLld(lldJsonPath: string): AutoPushResult {
	const lld = readJson(lldJsonPath);
	const meta = lld.meta;

	if (typeof meta.storyRef === 'string' && meta.storyRef.length > 0) {
		return { status: 'already-exists', storyRef: meta.storyRef };
	}
	if (typeof meta.epicHash !== 'string' || typeof meta.epicSlug !== 'string' || typeof meta.storyId !== 'string' || typeof meta.repoPath !== 'string') {
		return { status: 'skipped', reason: 'LLD meta is missing epicHash / epicSlug / storyId / repoPath' };
	}

	let cfg: ResolvedGithubConfig;
	try {
		cfg = resolveGithubConfig(meta.repoPath);
	} catch (err) {
		if (err instanceof GithubConfigError) {
			return { status: 'skipped', reason: err.message };
		}
		throw err;
	}
	if (cfg.type === 'none') {
		return { status: 'skipped', reason: `tracker disabled via config (type: none, source: ${cfg.source})` };
	}

	const avail = ghAvailable();
	if (!avail.ok) return { status: 'skipped', reason: avail.reason };

	// Read parent HLD for the Epic ref.
	const hldPaths = hldArtifactPaths(meta.repoPath, meta.epicHash);
	let hld: { meta: MetaShape };
	try {
		hld = readJson(hldPaths.json);
	} catch (err) {
		return { status: 'failed', reason: `cannot read parent HLD at ${hldPaths.json}: ${(err as Error).message}` };
	}
	const epicRef = hld.meta.epicRef;
	if (typeof epicRef !== 'string' || epicRef.length === 0) {
		return { status: 'skipped', reason: `parent HLD has no epicRef; approve the HLD (with tracker) first` };
	}

	// Read Define for the Story details.
	let define: DefineArtifact;
	try {
		define = readDefineArtifact(meta.repoPath, meta.epicHash);
	} catch (err) {
		return { status: 'failed', reason: `cannot read parent Define: ${(err as Error).message}` };
	}
	const story = define.body.stories.find(s => s.id === meta.storyId);
	if (story === undefined) {
		return { status: 'failed', reason: `Story '${meta.storyId}' not present in Define body` };
	}

	// Create the Story issue.
	const title = `${meta.storyId}: ${story.title}`;
	const body  = renderStoryBody(epicRef, story, meta.epicHash);
	let storyRef: string;
	try {
		storyRef = ghCreateIssue(cfg.owner, cfg.repo, title, body, [cfg.storyLabel, `epic:${meta.epicSlug}`]);
	} catch (err) {
		return { status: 'failed', reason: `gh issue create failed: ${(err as Error).message}` };
	}

	// Edit the Epic body's task list to insert the Story ref. Best-
	// effort: a failure here does not block the Story creation.
	try {
		const currentBody = ghGetIssueBody(cfg.owner, cfg.repo, epicRef);
		const updated = updateEpicTaskList(currentBody, meta.storyId, storyRef, story.title);
		if (updated !== currentBody) {
			ghEditIssueBody(cfg.owner, cfg.repo, epicRef, updated);
		}
	} catch (err) {
		log.warn(
			{ epicRef, storyRef, err: (err as Error).message },
			'failed to update Epic body task list; Story issue still created',
		);
	}

	patchArtifactMeta(lldJsonPath, { storyRef, storyPushedAt: new Date().toISOString() });
	return { status: 'created', storyRef };
}

// ---------------------------------------------------------------------------
// Body renderers
// ---------------------------------------------------------------------------

/** Renders the initial Epic issue body — problem, non-goals,
 *  constraints, and a `## Stories` task-list with placeholder entries
 *  that later Story pushes replace in-place. */
export function renderEpicBody(define: DefineArtifact, epicHash: string, epicSlug: string): string {
	const body = define.body;
	const lines: string[] = [];
	lines.push('## Problem');
	lines.push('');
	lines.push(body.problem);
	lines.push('');
	if (body.nonGoals.length > 0) {
		lines.push('## Non-goals');
		lines.push('');
		for (const ng of body.nonGoals) lines.push(`- **${ng.text}** — ${ng.rationale}`);
		lines.push('');
	}
	if (body.constraints.length > 0) {
		lines.push('## Constraints');
		lines.push('');
		for (const c of body.constraints) lines.push(`- **${c.id}** (${c.type}): ${c.text}`);
		lines.push('');
	}
	lines.push('## Stories');
	lines.push('');
	for (const s of body.stories) {
		const size = s.sizeEstimate !== undefined ? ` (${s.sizeEstimate})` : '';
		lines.push(`- [ ] ${s.id}: ${s.title}${size}`);
	}
	lines.push('');
	lines.push('## Design references');
	lines.push('');
	lines.push(`- HLD: \`docs/designs/HLD-${epicHash}.md\``);
	lines.push(`- Define: \`docs/defines/DEF-${epicHash}.md\``);
	lines.push('');
	lines.push(`_epic slug: ${epicSlug}_`);
	return lines.join('\n');
}

/** Renders a Story issue body, back-referencing the Epic. */
export function renderStoryBody(epicRef: string, story: DefineStory, epicHash: string): string {
	const num = extractIssueNumber(epicRef);
	const lines: string[] = [];
	lines.push(`**Epic:** #${num}`);
	lines.push('');
	lines.push('## User value');
	lines.push('');
	lines.push(story.userValue);
	lines.push('');
	if (story.acceptanceCriteria.length > 0) {
		lines.push('## Acceptance criteria');
		lines.push('');
		for (const ac of story.acceptanceCriteria) {
			lines.push(`- **${ac.id}:** Given ${ac.given}, when ${ac.when}, then ${ac.then}.`);
		}
		lines.push('');
	}
	lines.push('## Design references');
	lines.push('');
	lines.push(`- LLD: \`docs/designs/LLD-${epicHash}-${story.id}.md\``);
	if (story.sizeEstimate !== undefined) {
		lines.push('');
		lines.push(`Size: ${story.sizeEstimate}`);
	}
	return lines.join('\n');
}

/** In-place update of the Epic body's task-list line for one Story.
 *  Matches the placeholder `- [ ] {storyId}: {title}` (optionally
 *  followed by a size suffix) and replaces the prefix with
 *  `- [ ] #{issueNumber} — `.
 *
 *  The match is line-anchored + prefix-based to survive small title
 *  drift; if no matching line is found the body is returned
 *  unchanged and the caller logs a warning. */
export function updateEpicTaskList(currentBody: string, storyId: string, storyRef: string, storyTitle: string): string {
	const num = extractIssueNumber(storyRef);
	const lines = currentBody.split('\n');
	const placeholderPrefix = `- [ ] ${storyId}: ${storyTitle}`;
	const alreadyLinkedPrefix = `- [ ] #${num} — ${storyId}:`;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]!;
		if (line.startsWith(alreadyLinkedPrefix)) {
			// Already updated on a prior run; leave the body alone.
			return currentBody;
		}
		if (line.startsWith(placeholderPrefix)) {
			// Preserve any trailing size suffix.
			const suffix = line.slice(placeholderPrefix.length);
			lines[i] = `- [ ] #${num} — ${storyId}: ${storyTitle}${suffix}`;
			return lines.join('\n');
		}
	}
	// No matching placeholder — return unchanged; caller warns.
	return currentBody;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface MetaShape {
	readonly workflow?:     string;
	readonly runId?:        string;
	readonly repoPath?:     string;
	readonly epicHash?:     string;
	readonly epicSlug?:     string;
	readonly storyId?:      string;
	readonly epicRef?:      string;
	readonly storyRef?:     string;
	readonly epicPushedAt?: string;
	readonly storyPushedAt?: string;
	readonly [k: string]:   unknown;
}

function readJson(path: string): { readonly meta: MetaShape; readonly [k: string]: unknown } {
	const raw = readFileSync(path, 'utf8');
	const parsed = JSON.parse(raw) as { meta?: MetaShape };
	if (typeof parsed !== 'object' || parsed === null || typeof parsed.meta !== 'object' || parsed.meta === null) {
		throw new Error(`file at ${path} has no meta object`);
	}
	return parsed as { readonly meta: MetaShape };
}

function patchArtifactMeta(jsonPath: string, patch: Readonly<Record<string, unknown>>): void {
	const raw = readFileSync(jsonPath, 'utf8');
	const artifact = JSON.parse(raw) as { meta?: Record<string, unknown> };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`Artifact at ${jsonPath} has no meta`);
	}
	artifact.meta = { ...artifact.meta, ...patch };
	writeAtomic(jsonPath, JSON.stringify(artifact, null, 2) + '\n');
}

function firstSentence(s: string): string {
	const m = /^(.+?[.!?])\s/.exec(s);
	if (m !== null) return m[1]!;
	return s.length > 80 ? s.slice(0, 77) + '...' : s;
}
