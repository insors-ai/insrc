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
} from './github.js';
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

		// Replaced by the real reads and writes in s1/t5.
		readAssignee: () => unsupported('reading assignees yet'),
		setAssignee: () => unsupported('setting assignees yet'),

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
