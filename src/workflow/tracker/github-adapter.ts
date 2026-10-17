/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * GitHub adapter for the tracker port (sc1).
 *
 * `createGithubTracker(owner, repo)` is the lenient factory (no policy, no strict
 * configuration) for fail-open callers; `loadTracker` builds the same adapter
 * after the strict checks and is for team features only.
 *
 * GitHub declares {claim, issue-create}. The signoff methods return `rejected`
 * without running gh until a later story adds those capabilities.
 */

import { getLogger } from '../../shared/logger.js';
import { resolveStrictTrackerTarget } from '../config/github.js';
import {
	GhCommandError,
	ghAttachMilestone,
	ghCloseIssue,
	ghComment,
	ghCreateIssueTyped,
	ghCreateLabel,
	ghCurrentLogin,
	ghEditIssueBody,
	ghEnsureMilestone,
	ghFindIssueByLabelsStrict,
	ghGetIssueBody,
	ghLinkSubIssue,
	runGh,
} from './github.js';
import { parseIssueRef } from './refs.js';
import {
	missingCapabilities,
	type Capability,
	type CreatedIssue,
	type IssueOps,
	type IssueRef,
	type IssueSpec,
	type PortResult,
	type TrackerPort,
} from './port.js';

const log = getLogger('tracker-github-adapter');

const CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['claim', 'issue-create']);

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

function unsupported<T>(what: string): PortResult<T> {
	return { ok: false, kind: 'rejected', reason: `the github tracker does not support ${what}` };
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

function createIssueOps(owner: string, repo: string): IssueOps {
	return {
		create: (spec: IssueSpec) => attempt((): CreatedIssue => ghCreateIssueTyped(owner, repo, spec.title, spec.body, spec.labels, spec.issueType)),
		linkSubIssue: (parent: IssueRef, childId: number) => attempt(() => ghLinkSubIssue(owner, repo, parent, childId)),
		close: (issue: IssueRef) => attempt(() => ghCloseIssue(owner, repo, issue)),
		comment: (issue: IssueRef, body: string) => attempt(() => ghComment(owner, repo, issue, body)),
		readBody: (issue: IssueRef) => attempt(() => ghGetIssueBody(owner, repo, issue)),
		writeBody: (issue: IssueRef, body: string) => attempt(() => ghEditIssueBody(owner, repo, issue, body)),
		ensureLabel: (name: string) => ghCreateLabel(owner, repo, name),
		ensureMilestone: (title: string) => ghEnsureMilestone(owner, repo, title),
		attachMilestone: (issue: IssueRef, title: string) => attempt(() => ghAttachMilestone(owner, repo, issue, title)),
	};
}

/** The GitHub adapter bound to one owner and repo. */
export function createGithubTracker(owner: string, repo: string): TrackerPort {
	const issueOps = createIssueOps(owner, repo);
	return {
		kind: 'github',
		capabilities: CAPABILITIES,
		issueOps,

		whoAmI: () => {
			try {
				return { ok: true, value: ghCurrentLogin() };
			} catch (err) {
				// ghCurrentLogin throws a plain Error for an empty login: not signed in.
				if (!(err instanceof GhCommandError) && err instanceof Error && /returned no login/.test(err.message)) {
					return { ok: false, kind: 'missing-signin', reason: 'gh is not signed in (run `gh auth login`)' };
				}
				return failure(err);
			}
		},

		readAssignee,
		setAssignee,

		createIssue: (spec: IssueSpec) => {
			const created = issueOps.create(spec);
			if (!created.ok) return created;
			if (spec.parent !== undefined) {
				// A failed parent link never fails the create (as in tracker-auto today).
				const linked = issueOps.linkSubIssue(spec.parent, created.value.id);
				if (!linked.ok) log.warn({ ref: created.value.ref, parent: spec.parent, reason: linked.reason }, 'sub-issue link failed; issue kept');
			}
			return { ok: true, value: created.value.ref };
		},

		findIssue: (labels: string[]) => attempt(() => ghFindIssueByLabelsStrict(owner, repo, labels) ?? null),

		openSignoffRequest: () => unsupported('signoff requests'),
		readSignoffState: () => unsupported('reading signoff state'),
	};
}

/** Strict loader for team features: the strict target resolver, a capability
 *  check and a gh sign-in check. No reduced mode: either every needed capability
 *  is available or the load fails. Lenient callers use {@link createGithubTracker}. */
export function loadTracker(repo: string, needed: ReadonlySet<Capability>): PortResult<TrackerPort> {
	const target = resolveStrictTrackerTarget(repo);
	if (!target.ok) return target;
	const tracker = createGithubTracker(target.value.owner, target.value.repo);
	const missing = missingCapabilities(tracker.capabilities, needed);
	if (missing.length > 0) {
		return { ok: false, kind: 'rejected', reason: `the github tracker does not declare the needed capabilit${missing.length === 1 ? 'y' : 'ies'}: ${missing.join(', ')}` };
	}
	const who = tracker.whoAmI();
	if (!who.ok) return who;
	return { ok: true, value: tracker };
}
