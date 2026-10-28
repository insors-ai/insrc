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
 * GitHub declares {claim, issue-create, signoff-request}. A signoff request is a
 * pull request from a branch that holds the committed artifacts; its state is read
 * from the pull request's review decision and merge state.
 */

import { getLogger } from '../../shared/logger.js';
import { resolveStrictTrackerTarget } from '../config/github.js';
import { GhCommandError } from './github.js';
import { createRegistryTable, workflowToolDeps } from './registry-table.js';
import type { RegistryTable } from './registry-table.js';
import { isToolDenied } from './tool-denied.js';
import type { Reference } from '../artifact-core/types.js';
import {
	missingCapabilities,
	type Capability,
	type CreatedIssue,
	type IssueOps,
	type IssueRef,
	type IssueSpec,
	type PortResult,
	type SignoffRequestRef,
	type SignoffRequestSpec,
	type TrackerPort,
} from './port.js';

const log = getLogger('tracker-github-adapter');

/** Where an adapter's tool calls run and which table they go through; the defaults are the process directory and the registry. */
export interface GithubTrackerOptions {
	readonly repoPath?: string | undefined;
	readonly table?: RegistryTable | undefined;
}

const CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['claim', 'issue-create', 'signoff-request']);

function failure(err: unknown): { readonly ok: false; readonly kind: 'missing-tool' | 'missing-signin' | 'unreachable' | 'rejected'; readonly reason: string } {
	if (err instanceof GhCommandError) return { ok: false, kind: err.kind, reason: err.reason };
	return { ok: false, kind: 'rejected', reason: err instanceof Error ? err.message : String(err) };
}

/** Run `fn` and turn its failure into a failed result. A denial is the one exception: it is thrown, never a result, so no caller treats it as a gh failure. */
async function attempt<T>(fn: () => Promise<T>): Promise<PortResult<T>> {
	try {
		return { ok: true, value: await fn() };
	} catch (err) {
		if (isToolDenied(err)) throw err;
		return failure(err);
	}
}

function createIssueOps(owner: string, repo: string, tableOf: () => RegistryTable): IssueOps {
	return {
		create: (spec: IssueSpec) => attempt((): Promise<CreatedIssue> => tableOf().ghCreateIssueTyped(owner, repo, spec.title, spec.body, spec.labels, spec.issueType)),
		linkSubIssue: (parent: IssueRef, childId: number) => attempt(() => tableOf().ghLinkSubIssue(owner, repo, parent, childId)),
		resolveIssueId: (ref: IssueRef) => attempt(() => tableOf().ghGetIssueId(owner, repo, ref)),
		close: (issue: IssueRef) => attempt(() => tableOf().ghCloseIssue(owner, repo, issue)),
		comment: (issue: IssueRef, body: string) => attempt(() => tableOf().ghComment(owner, repo, issue, body)),
		readBody: (issue: IssueRef) => attempt(() => tableOf().ghGetIssueBody(owner, repo, issue)),
		writeBody: (issue: IssueRef, body: string) => attempt(() => tableOf().ghEditIssueBody(owner, repo, issue, body)),
		ensureLabel: (name: string) => tableOf().ghCreateLabel(owner, repo, name),
		ensureMilestone: (title: string) => tableOf().ghEnsureMilestone(owner, repo, title),
		attachMilestone: (issue: IssueRef, title: string) => attempt(() => tableOf().ghAttachMilestone(owner, repo, issue, title)),
	};
}

/** The GitHub adapter bound to one owner and repo. */
export function createGithubTracker(owner: string, repo: string, opts: GithubTrackerOptions = {}): TrackerPort {
	// resolved at each call, so the adapter built before a table factory is installed still uses it
	const tableOf = (): RegistryTable => opts.table ?? createRegistryTable(workflowToolDeps(opts.repoPath ?? process.cwd()));
	const issueOps = createIssueOps(owner, repo, tableOf);
	return {
		kind: 'github',
		capabilities: CAPABILITIES,
		issueOps,

		whoAmI: async () => {
			try {
				return { ok: true, value: await tableOf().ghCurrentLogin() };
			} catch (err) {
				if (isToolDenied(err)) throw err;
				// an empty login is a plain Error: not signed in
				if (!(err instanceof GhCommandError) && err instanceof Error && /returned no login/.test(err.message)) {
					return { ok: false, kind: 'missing-signin', reason: 'gh is not signed in (run `gh auth login`)' };
				}
				return failure(err);
			}
		},

		readAssignee: (issue: IssueRef) => attempt(() => tableOf().readAssignee(issue)),
		setAssignee: (issue: IssueRef, who: string | null) => attempt(() => tableOf().setAssignee(issue, who)),
		addAssignee: (issue: IssueRef, who: string) => attempt(() => tableOf().addAssignee(issue, who)),

		createIssue: async (spec: IssueSpec) => {
			const created = await issueOps.create(spec);
			if (!created.ok) return created;
			if (spec.parent !== undefined) {
				// A failed parent link never fails the create (as in tracker-auto today); a denial still stops the stage.
				const linked = await issueOps.linkSubIssue(spec.parent, created.value.id);
				if (!linked.ok) log.warn({ ref: created.value.ref, parent: spec.parent, reason: linked.reason }, 'sub-issue link failed; issue kept');
			}
			return { ok: true, value: created.value.ref };
		},

		findIssue: (labels: string[]) => attempt(async () => (await tableOf().ghFindIssueByLabelsStrict(owner, repo, labels)) ?? null),

		findIssues: (labels: string[]) => attempt(() => tableOf().ghListIssuesByLabelsStrict(owner, repo, labels)),

		findIssuesByTitleToken: (token: string) => attempt(() => tableOf().ghListIssuesByTitleTokenStrict(owner, repo, token)),

		listComments: (issue: IssueRef, since?: string) => attempt(() => tableOf().ghListIssueComments(owner, repo, issue, since)),

		postComment: (issue: IssueRef, body: string) => attempt(async () => ({ externalId: await tableOf().ghPostCommentReturningId(owner, repo, issue, body) })),

		// GitHub has no attachment API: the link goes in one comment that names the artifact. The marker line tells it from a person's comment (s8).
		attach: (issue: IssueRef, artifact: Reference, link: string) =>
			attempt(async () => ({ externalId: await tableOf().ghPostCommentReturningId(owner, repo, issue, `<!-- insrc:attach:${artifact.entityId} -->\nAttached ${artifact.type} \`${artifact.entityId}\`: ${link}`) })),

		openSignoffRequest: (spec: SignoffRequestSpec) => attempt(() => tableOf().openSignoffRequest(owner, repo, spec)),
		readSignoffState: (request: SignoffRequestRef, since?: string) => attempt(() => tableOf().readSignoffState(request, since)),
		readSignoffRequest: (request: SignoffRequestRef) => attempt(() => tableOf().readSignoffRequest(request)),
	};
}

/** Strict loader for team features: the strict target resolver, a capability
 *  check and a gh sign-in check. No reduced mode: either every needed capability
 *  is available or the load fails. Lenient callers use {@link createGithubTracker}. */
export async function loadTracker(repo: string, needed: ReadonlySet<Capability>, opts: Omit<GithubTrackerOptions, 'repoPath'> = {}): Promise<PortResult<TrackerPort>> {
	const target = resolveStrictTrackerTarget(repo);
	if (!target.ok) return target;
	const tracker = createGithubTracker(target.value.owner, target.value.repo, { repoPath: repo, ...opts });
	const missing = missingCapabilities(tracker.capabilities, needed);
	if (missing.length > 0) {
		return { ok: false, kind: 'rejected', reason: `the github tracker does not declare the needed capabilit${missing.length === 1 ? 'y' : 'ies'}: ${missing.join(', ')}` };
	}
	const who = await tracker.whoAmI();
	if (!who.ok) return who;
	return { ok: true, value: tracker };
}
