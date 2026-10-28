/**
 * A registry table backed by the old sync gh wrappers and the exec seam (Story s10, test support only).
 * Tests that fake gh through `_setTrackerExecForTests` and exercise the code that CONSUMES the tracker (not the
 * registry rows themselves, which registry-table.test.ts covers against a stand-in gh) install it with `_setTrackerExecForTests`
 * from this file. It goes away with the old wrappers (Story s9).
 */

import { _setRegistryTableFactoryForTests } from '../registry-table.js';
import type { RegistryTable } from '../registry-table.js';
import * as gh from '../github.js';
import { GhCommandError, ghPostCommentReturningId, runGh } from '../github.js';
import { parseIssueRef } from '../refs.js';
import type { IssueRef, PortResult, SignoffRequestRef, SignoffRequestSpec } from '../port.js';
import { execFileSync } from 'node:child_process';
import { getLogger } from '../../../shared/logger.js';

const log = getLogger('legacy-table');

function failure(err: unknown): { readonly ok: false; readonly kind: 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected'; readonly reason: string } {
	if (err instanceof GhCommandError) return { ok: false, kind: err.kind, reason: err.reason };
	return { ok: false, kind: 'rejected', reason: err instanceof Error ? err.message : String(err) };
}

function attempt<T>(fn: () => T): PortResult<T> {
	try {
		return { ok: true, value: fn() };
	} catch (err) {
		return failure(err);
	}
}

/** A well-formed `owner/repo#N`; parseIssueRef alone only checks the separators. */
const ISSUE_REF_RE = /^[^/#\s]+\/[^/#\s]+#[0-9]+(?![\s\S])/;   // (?![\s\S]) = end of input, never before a trailing newline

/** The assignee logins of an issue, read live. Throws a classified GhCommandError. */
function readAssignees(issue: IssueRef): { readonly owner: string; readonly repo: string; readonly number: string; readonly logins: string[] } {
	if (!ISSUE_REF_RE.test(issue)) throw new GhCommandError('rejected', `malformed issue reference '${issue}' (expected owner/repo#N)`);
	const { owner, repo, number } = parseIssueRef(issue);
	const raw = runGh(['issue', 'view', number, '--repo', `${owner}/${repo}`, '--json', 'assignees']);
	let parsed: { assignees?: Array<{ login?: string }> };
	try {
		parsed = JSON.parse(raw) as typeof parsed;
	} catch {
		throw new GhCommandError('rejected', `gh returned unexpected assignee JSON for ${issue}: '${raw.slice(0, 120)}'`);
	}
	const logins = (parsed.assignees ?? []).map(a => a.login ?? '').filter(l => l.length > 0);
	return { owner, repo, number, logins };
}

const sameLogin = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function readAssignee(issue: IssueRef): PortResult<string | null> {
	return attempt(() => {
		const { logins } = readAssignees(issue);
		if (logins.length > 1) throw new GhCommandError('rejected', `${issue} has more than one assignee (${logins.join(', ')})`);
		return logins[0] ?? null;
	});
}

/** Read, remove every other assignee, add the requested one (or clear all for
 *  null), re-read and compare. No step is retried: a failed or timed-out step is
 *  reported as it is (the resulting state is unknown) and the re-read is skipped. */
function setAssignee(issue: IssueRef, who: string | null): PortResult<void> {
	return attempt(() => {
		const current = readAssignees(issue);
		const repoArg = `${current.owner}/${current.repo}`;
		const others = current.logins.filter(l => who === null || !sameLogin(l, who));
		const hasWho = who !== null && current.logins.some(l => sameLogin(l, who));
		if (others.length > 0) runGh(['issue', 'edit', current.number, '--repo', repoArg, '--remove-assignee', others.join(',')], { discardOutput: true });
		if (who !== null && !hasWho) runGh(['issue', 'edit', current.number, '--repo', repoArg, '--add-assignee', who], { discardOutput: true });
		// The outcome is always verified by a fresh re-read (a read is not a change call).
		const after = readAssignees(issue).logins;
		const ok = who === null ? after.length === 0 : after.length === 1 && sameLogin(after[0]!, who);
		if (!ok) {
			throw new GhCommandError('rejected', `${issue} assignees are [${after.join(', ')}] after the update, expected ${who === null ? 'none' : who}`);
		}
	});
}

/** Add `who` to the assignees (nobody is removed), re-read, and return the assignees read back.
 *  A failed or timed-out step is reported as it is and not retried; a re-read that does not
 *  show `who` is reported as rejected. */
function addAssignee(issue: IssueRef, who: string): PortResult<string[]> {
	return attempt(() => {
		const current = readAssignees(issue);
		const repoArg = `${current.owner}/${current.repo}`;
		if (!current.logins.some(l => sameLogin(l, who))) {
			runGh(['issue', 'edit', current.number, '--repo', repoArg, '--add-assignee', who], { discardOutput: true });
		}
		const after = readAssignees(issue).logins;
		if (!after.some(l => sameLogin(l, who))) {
			throw new GhCommandError('rejected', `${issue} assignees are [${after.join(', ')}] after the add, expected ${who} among them`);
		}
		return after;
	});
}

const PULL_URL_RE = /https?:\/\/\S+\/pull\/([0-9]+)/;

/** The url of the open pull request from this branch, or undefined when there is none (or gh's answer is not the expected list). */
function openPullRequestOf(owner: string, repo: string, branch: string): string | undefined {
	const raw = runGh(['pr', 'list', '--repo', `${owner}/${repo}`, '--head', branch, '--state', 'open', '--json', 'url']);
	try {
		const list = JSON.parse(raw) as Array<{ url?: string | undefined }>;
		return Array.isArray(list) ? list.find(p => typeof p?.url === 'string' && PULL_URL_RE.test(p.url))?.url : undefined;
	} catch { return undefined; }
}

/**
 * Open the signoff request as a pull request from the branch that holds the committed artifacts, then link it from the stage's
 * issue with one comment. The pull request is the request: if the link comment fails the request still stands (its ref is kept on
 * every artifact), so the failure is logged and not returned, and a retry never has to open a second pull request.
 */
function openSignoffRequest(owner: string, repo: string, spec: SignoffRequestSpec): PortResult<SignoffRequestRef> {
	return attempt(() => {
		if (spec.branch.trim().length === 0) throw new GhCommandError('rejected', 'a signoff request needs the branch that holds the committed artifacts');
		if (!ISSUE_REF_RE.test(spec.issue)) throw new GhCommandError('rejected', `malformed issue reference '${spec.issue}' (expected owner/repo#N)`);
		// a branch that already has an open pull request (a repeat after a failed recording) reuses it: gh refuses a second one
		const existing = openPullRequestOf(owner, repo, spec.branch);
		const created = existing ?? runGh(['pr', 'create', '--repo', `${owner}/${repo}`, '--head', spec.branch, '--title', spec.title, '--body', spec.body]);
		const match = PULL_URL_RE.exec(created);
		if (match === null) throw new GhCommandError('rejected', `gh did not print the pull request url: '${created.slice(0, 120)}'`);
		const url = match[0];
		const ref = `${owner}/${repo}#${match[1]}`;
		try {
			ghPostCommentReturningId(owner, repo, spec.issue, `<!-- insrc:signoff-request:${ref} -->\nSignoff requested: ${url}`);
		} catch (err) {
			log.warn({ ref, issue: spec.issue, err: err instanceof Error ? err.message : String(err) }, 'the signoff request was opened but not linked from its issue');
		}
		return { ref, url };
	});
}

/** The pull request's number and repo of a signoff request reference, rejecting a malformed one. */
function parseRequestRef(request: SignoffRequestRef): { owner: string; repo: string; number: string } {
	if (!ISSUE_REF_RE.test(request.ref)) throw new GhCommandError('rejected', `malformed signoff request reference '${request.ref}' (expected owner/repo#N)`);
	return parseIssueRef(request.ref);
}

function parsePullRequestJson<T>(raw: string, ref: string): T {
	try {
		return JSON.parse(raw) as T;
	} catch {
		throw new GhCommandError('rejected', `gh returned unexpected pull request JSON for ${ref}: '${raw.slice(0, 120)}'`);
	}
}

interface PullReview { author?: { login?: string | undefined } | null | undefined; state?: string | undefined; submittedAt?: string | null | undefined }

/**
 * Whether a reviewer's latest decisive review (approved, changes requested or dismissed; a comment is neither) made after `since` asks
 * for changes. The times are compared as instants: GitHub stamps whole seconds and the local stamp may carry milliseconds, which
 * sort wrongly as text.
 */
function changesRequestedSince(reviews: readonly PullReview[], since: string): boolean {
	const sinceMs = Date.parse(since);
	if (Number.isNaN(sinceMs)) throw new GhCommandError('rejected', `the submission time '${since}' is not a time`);
	const latest = new Map<string, { review: PullReview; at: number }>();
	for (const r of reviews) {
		if (r.state !== 'APPROVED' && r.state !== 'CHANGES_REQUESTED' && r.state !== 'DISMISSED') continue;
		const at = typeof r.submittedAt === 'string' ? Date.parse(r.submittedAt) : Number.NaN;
		if (Number.isNaN(at) || at <= sinceMs) continue;
		const who = r.author?.login ?? '';
		const seen = latest.get(who);
		if (seen === undefined || seen.at <= at) latest.set(who, { review: r, at });
	}
	return [...latest.values()].some(v => v.review.state === 'CHANGES_REQUESTED');
}

/**
 * The state of a request from its pull request: merged is completed; a closed pull request that was not merged, or one with
 * changes requested, is changes-requested (the holder revises and submits again); anything else is open. With `since`, changes
 * requested means a reviewer's latest decisive review after it asks for them, since GitHub keeps the decision of an old push.
 */
function readSignoffState(request: SignoffRequestRef, since?: string): PortResult<'open' | 'changes-requested' | 'completed'> {
	return attempt(() => {
		const { owner, repo, number } = parseRequestRef(request);
		const fields = since === undefined ? 'state,mergedAt,reviewDecision' : 'state,mergedAt,reviews';
		const raw = runGh(['pr', 'view', number, '--repo', `${owner}/${repo}`, '--json', fields]);
		const parsed = parsePullRequestJson<{ state?: string | undefined; mergedAt?: string | null | undefined; reviewDecision?: string | null | undefined; reviews?: PullReview[] | undefined }>(raw, request.ref);
		if (parsed.state === 'MERGED' || (typeof parsed.mergedAt === 'string' && parsed.mergedAt.length > 0)) return 'completed';
		if (parsed.state === 'CLOSED') return 'changes-requested';
		const asked = since === undefined ? parsed.reviewDecision === 'CHANGES_REQUESTED' : changesRequestedSince(Array.isArray(parsed.reviews) ? parsed.reviews : [], since);
		return asked ? 'changes-requested' : 'open';
	});
}

/** The branch the request's pull request is from, and whether it is still open. */
function readSignoffRequest(request: SignoffRequestRef): PortResult<{ branch: string; open: boolean }> {
	return attempt(() => {
		const { owner, repo, number } = parseRequestRef(request);
		const raw = runGh(['pr', 'view', number, '--repo', `${owner}/${repo}`, '--json', 'headRefName,state']);
		const parsed = parsePullRequestJson<{ headRefName?: string | undefined; state?: string | undefined }>(raw, request.ref);
		if (typeof parsed.headRefName !== 'string' || parsed.headRefName.length === 0 || typeof parsed.state !== 'string') {
			throw new GhCommandError('rejected', `gh returned no branch or state for ${request.ref}: '${raw.slice(0, 120)}'`);
		}
		return { branch: parsed.headRefName, open: parsed.state === 'OPEN' };
	});
}


const unwrap = <T>(r: PortResult<T>): T => { if (!r.ok) throw new GhCommandError(r.kind, r.reason); return r.value; };

function legacyTable(): RegistryTable {
	const rows: Record<string, unknown> = {};
	for (const [name, fn] of Object.entries(gh)) {
		if (typeof fn === 'function' && /^(gh[A-Z]|gitOriginOwnerRepo$|queryTasks$|listMyOpenTasks$)/.test(name) && name !== 'ghCurrentLogin') {
			rows[name] = async (...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args);
		}
	}
	rows['ghCurrentLogin'] = async () => gh.ghCurrentLogin();
	rows['readAssignees'] = async (issue: IssueRef) => readAssignees(issue);
	rows['readAssignee'] = async (issue: IssueRef) => unwrap(readAssignee(issue));
	rows['setAssignee'] = async (issue: IssueRef, who: string | null) => unwrap(setAssignee(issue, who));
	rows['addAssignee'] = async (issue: IssueRef, who: string) => unwrap(addAssignee(issue, who));
	rows['openPullRequestOf'] = async (owner: string, repo: string, branch: string) => openPullRequestOf(owner, repo, branch);
	rows['openSignoffRequest'] = async (owner: string, repo: string, spec: SignoffRequestSpec) => unwrap(openSignoffRequest(owner, repo, spec));
	rows['readSignoffState'] = async (request: SignoffRequestRef, since?: string) => unwrap(readSignoffState(request, since));
	rows['readSignoffRequest'] = async (request: SignoffRequestRef) => unwrap(readSignoffRequest(request));
	const git = (repoPath: string, args: readonly string[]): string => execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	rows['gitIsTracked'] = async (repoPath: string, relPath: string) => { try { git(repoPath, ['ls-files', '--error-unmatch', '--', relPath]); return true; } catch { return false; } };
	rows['gitHasChanges'] = async (repoPath: string, relPath: string) => git(repoPath, ['status', '--porcelain', '--', relPath]).length > 0;
	rows['gitLastCommitOf'] = async (repoPath: string, relPath: string) => git(repoPath, ['log', '-1', '--format=%H', '--', relPath]);
	return rows as unknown as RegistryTable;
}

/** Like github.ts's seam, and the tracker adapter and setup/sync/bugfix defaults go through the same fake. */
export function _setTrackerExecForTests(fn?: gh.TrackerExec): void {
	gh._setTrackerExecForTests(fn);
	_setRegistryTableFactoryForTests(fn === undefined ? undefined : () => legacyTable());
}

