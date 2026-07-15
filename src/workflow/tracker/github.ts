/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thin, injection-safe wrappers around the `gh` + `git` CLIs — the ONE
 * place the deterministic tracker path shells out. Every call uses
 * `execFileSync` with an argv array (no shell), so titles/bodies are
 * never interpolated into a command string.
 *
 * The exec function is swappable via `_setTrackerExecForTests` so unit
 * tests can drive the push/sync logic against a fake `gh` without a
 * network or a real repo.
 */

import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';

import { buildRef, parseIssueRef } from './refs.js';

export type TrackerExec = (cmd: string, args: readonly string[], opts?: ExecFileSyncOptions) => Buffer | string;

let _exec: TrackerExec = execFileSync as TrackerExec;

/** Test seam. Pass a fake `(cmd, args) => output`; call with no args
 *  (or the real `execFileSync`) to restore. */
export function _setTrackerExecForTests(fn?: TrackerExec): void {
	_exec = fn ?? (execFileSync as TrackerExec);
}

function out(cmd: string, args: readonly string[]): string {
	const r = _exec(cmd, args, { encoding: 'utf8' });
	return (typeof r === 'string' ? r : r.toString('utf8')).trim();
}

function silent(cmd: string, args: readonly string[]): void {
	_exec(cmd, args, { stdio: 'ignore' });
}

// ---------------------------------------------------------------------------
// git
// ---------------------------------------------------------------------------

/** Parse `git remote get-url origin` into a GitHub owner/repo. Returns
 *  null when there's no origin or it isn't a github URL. */
export function gitOriginOwnerRepo(repoPath: string): { readonly owner: string; readonly repo: string } | null {
	let url: string;
	try {
		url = out('git', ['-C', repoPath, 'remote', 'get-url', 'origin']);
	} catch {
		return null;
	}
	return parseGithubRemoteUrl(url);
}

/** Pure parser (SSH + HTTPS). Strips a trailing `.git` rather than
 *  banning dots, so dotted repo names (`owner/react.dev`) parse. */
export function parseGithubRemoteUrl(url: string): { readonly owner: string; readonly repo: string } | null {
	const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url.trim());
	if (m === null) return null;
	return { owner: m[1]!, repo: m[2]! };
}

// ---------------------------------------------------------------------------
// gh
// ---------------------------------------------------------------------------

export function ghAuthOk(): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
	try {
		silent('gh', ['auth', 'status']);
		return { ok: true };
	} catch {
		return { ok: false, reason: 'gh CLI not available or not authenticated (run `gh auth login`)' };
	}
}

/** Idempotent label create (`--force` upserts). Returns false on error
 *  (logged by the caller); label creation is best-effort. */
export function ghCreateLabel(owner: string, repo: string, name: string): boolean {
	try {
		silent('gh', ['label', 'create', name, '--repo', `${owner}/${repo}`, '--force']);
		return true;
	} catch {
		return false;
	}
}

/** Create an issue; returns its `owner/repo#N` ref. */
export function ghCreateIssue(owner: string, repo: string, title: string, body: string, labels: readonly string[]): string {
	const args = ['issue', 'create', '--repo', `${owner}/${repo}`, '--title', title, '--body', body];
	if (labels.length > 0) args.push('--label', labels.join(','));
	const url = out('gh', args);
	const m = /\/(\d+)\s*$/.exec(url);
	if (m === null) throw new Error(`gh issue create returned an unrecognized URL: '${url}'`);
	return buildRef(owner, repo, m[1]!);
}

export function ghGetIssueBody(owner: string, repo: string, ref: string): string {
	return out('gh', ['issue', 'view', parseIssueRef(ref).number, '--repo', `${owner}/${repo}`, '--json', 'body', '-q', '.body']);
}

export function ghEditIssueBody(owner: string, repo: string, ref: string, body: string): void {
	silent('gh', ['issue', 'edit', parseIssueRef(ref).number, '--repo', `${owner}/${repo}`, '--body', body]);
}

/** Post a comment on an issue. */
export function ghComment(owner: string, repo: string, ref: string, body: string): void {
	silent('gh', ['issue', 'comment', parseIssueRef(ref).number, '--repo', `${owner}/${repo}`, '--body', body]);
}

/** Current issue state + status labels — for sync. */
export function ghGetIssueState(owner: string, repo: string, ref: string): { state: string; labels: string[] } {
	const raw = out('gh', ['issue', 'view', parseIssueRef(ref).number, '--repo', `${owner}/${repo}`, '--json', 'state,labels']);
	const parsed = JSON.parse(raw) as { state?: string; labels?: Array<{ name?: string }> };
	return {
		state:  (parsed.state ?? 'OPEN').toLowerCase(),
		labels: (parsed.labels ?? []).map(l => l.name ?? '').filter(n => n.length > 0),
	};
}

/** Find an existing issue by the given labels (all must match). Returns
 *  its ref, or undefined. Used as a duplicate-create guard. */
export function ghFindIssueByLabels(owner: string, repo: string, labels: readonly string[]): string | undefined {
	const args = ['issue', 'list', '--repo', `${owner}/${repo}`, '--state', 'all', '--json', 'number', '-q', '.[0].number'];
	for (const l of labels) args.push('--label', l);
	let num: string;
	try { num = out('gh', args); } catch { return undefined; }
	return /^\d+$/.test(num) ? buildRef(owner, repo, num) : undefined;
}

/** Ensure a milestone exists (idempotent) then attach an issue to it.
 *  Best-effort: milestone plumbing failures don't block issue creation. */
export function ghEnsureMilestone(owner: string, repo: string, title: string): void {
	try {
		silent('gh', ['api', '-X', 'POST', `repos/${owner}/${repo}/milestones`, '-f', `title=${title}`]);
	} catch {
		// 422 = already exists; anything else is surfaced by the attach step.
	}
}

export function ghAttachMilestone(owner: string, repo: string, ref: string, title: string): void {
	silent('gh', ['issue', 'edit', parseIssueRef(ref).number, '--repo', `${owner}/${repo}`, '--milestone', title]);
}
