/**
 * The replacement table (Story s10, tool-registry epic): every github.ts gh wrapper over the tool registry.
 *
 * Each row has the signature and the result of the wrapper it replaces and is built over `callTool`, so the call
 * runs through the executor (approval, schema check, hooks). Failures follow one rule (tool-denied.ts):
 *  - a gh failure (missing-tool, missing-signin, unreachable, command timed-out, rejected) throws the old GhCommandError, or,
 *    for a best-effort wrapper, gives its old false, null, [] or undefined;
 *  - a denial is thrown as ToolDenied and is never swallowed;
 *  - a conversion failure or a schema mismatch throws a rejected GhCommandError, even in a best-effort row.
 *
 * The rows are async, so the tracker port that uses them is async. The old wrappers in github.ts are untouched until
 * Story s9 removes them; the pure helpers below that github.ts keeps private (the task search query) are copied here and
 * go away with theirs.
 */

import type { Static } from '@sinclair/typebox';

import { callTool } from '../../daemon/tools/call-tool.js';
import type { TypedTool, TypedToolResult } from '../../daemon/tools/call-tool.js';
import { ghPrCreateTool, ghPrListTool, ghPrViewTool } from '../../daemon/tools/builtins/gh/pr.js';
import { gitLogTool } from '../../daemon/tools/builtins/git/log.js';
import { gitLsFilesTool } from '../../daemon/tools/builtins/git/ls-files.js';
import { gitRemoteTool } from '../../daemon/tools/builtins/git/remote.js';
import { gitStatusTool } from '../../daemon/tools/builtins/git/status.js';
import { ghProjectManageTool } from '../../daemon/tools/builtins/gh/manage.js';
import { ghProjectItemAddTool, ghProjectListTool } from '../../daemon/tools/builtins/gh/project.js';
import { ghIssueCloseTool, ghIssueCommentTool, ghIssueCreateTool, ghIssueEditTool, ghIssueListTool, ghIssueViewTool } from '../../daemon/tools/builtins/gh/issue.js';
import { ghLabelTool } from '../../daemon/tools/builtins/gh/resources.js';
import { ghTrackerTool } from '../../daemon/tools/builtins/gh/tracker.js';
import type { ToolDeps, ToolFailure } from '../../daemon/tools/types.js';
import { epicMembershipLabel } from './conventions.js';
import { getLogger } from '../../shared/logger.js';
import { GhCommandError, parseGithubRemoteUrl } from './github.js';
import type { CreatedIssue, PageRequest, TaskPage, TaskQueryFilters, TrackerTask } from './github.js';
import type { IssueRef, SignoffRequestRef, SignoffRequestSpec, TrackerComment } from './port.js';
import { titleMatchesToken } from './port.js';
import { buildRef, parseIssueRef } from './refs.js';
import { bestEffortMaySwallow, errorOfFailure, isToolDenied } from './tool-denied.js';

const log = getLogger('tracker-registry-table');

/** The tool deps of a workflow call: the caller is 'workflow', so hooks and logs see who asked. */
export function workflowToolDeps(repoPath: string, overrides: Partial<ToolDeps> = {}): ToolDeps {
	return { sessionId: 'workflow', repoPath, send: () => {}, requestId: 0, caller: 'workflow', ...overrides };
}

export type Call<D> = { readonly ok: true; readonly data: D } | { readonly ok: false; readonly toolId: string; readonly failure: ToolFailure };

async function run<T extends TypedTool>(tool: T, input: Static<T['inputSchema']>, deps: ToolDeps): Promise<Call<Static<T['outputSchema']>>> {
	const r: TypedToolResult<Static<T['outputSchema']>> = await callTool(tool, input, deps);
	return r.success ? { ok: true, data: r.data } : { ok: false, toolId: tool.id, failure: r.error };
}

/** The data of a call, or the error the failure becomes (ToolDenied or the old GhCommandError). */
export function must<D>(c: Call<D>): D {
	if (c.ok) return c.data;
	throw errorOfFailure(c.toolId, c.failure);
}

/** The data of a best-effort call: the fallback for a gh failure only; a denial, conversion failure or schema mismatch throws. */
export function soft<D, F>(c: Call<D>, fallback: F): D | F {
	if (c.ok) return c.data;
	if (bestEffortMaySwallow(c.failure)) return fallback;
	throw errorOfFailure(c.toolId, c.failure);
}

const repoArg = (owner: string, repo: string): string => `${owner}/${repo}`;
const issueNo = (ref: string): number => Number(parseIssueRef(ref).number);

/** The one family answer for `op`, which the tool's output schema already guarantees. */
function opData<K extends string>(data: unknown, op: K): Record<string, unknown> & { op: K } {
	const d = data as { op?: unknown };
	if (d?.op !== op) throw new GhCommandError('rejected', `the tool answered ${String(d?.op)} where ${op} was asked`);
	return data as Record<string, unknown> & { op: K };
}

/** A well-formed `owner/repo#N` with a positive number (parseIssueRef alone only checks the separators). */
const STRICT_ISSUE_REF_RE = /^[^/#\s]+\/[^/#\s]+#[1-9][0-9]*(?![\s\S])/;

/** True only for a gh rejection that names the issue type (an org without issue types enabled answers 422 about the type). */
function isIssueTypeRejection(err: unknown): boolean {
	return err instanceof GhCommandError
		&& err.kind === 'rejected'
		&& /\bissue[ _-]?types?\b/i.test(err.reason)
		&& /422|unprocessable|validation failed|not enabled|not supported|unsupported|unknown|invalid/i.test(err.reason);
}

// ---------------------------------------------------------------------------
// task search (copied from github.ts, which keeps its own until s9)
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE     = 100;

const epicFilterLabel  = (epic: string): string => (epic.startsWith('epic:') ? epic : epicMembershipLabel(epic));
const storyFilterLabel = (story: string): string => (story.includes(':') ? story : `story:${story}`);

function buildTaskSearchQuery(owner: string, repo: string, filters: TaskQueryFilters): string {
	const q: string[] = [`repo:${owner}/${repo}`, 'is:issue'];
	switch (filters.state ?? 'open') {
		case 'open':   q.push('is:open'); break;
		case 'closed': q.push('is:closed'); break;
		case 'all':    break;
	}
	if (filters.owner) q.push(`assignee:${filters.owner}`);
	if (filters.epic)  q.push(`label:"${epicFilterLabel(filters.epic)}"`);
	if (filters.story) q.push(`label:"${storyFilterLabel(filters.story)}"`);
	return q.join(' ');
}

interface SearchNode {
	number?: number; title?: string; state?: string; url?: string;
	author?: { login?: string } | null;
	assignees?: { nodes?: Array<{ login?: string }> };
	labels?: { nodes?: Array<{ name?: string }> };
	milestone?: { title?: string } | null;
}

const labelValue = (labels: readonly string[], prefix: string): string | undefined => {
	const hit = labels.find(l => l.startsWith(prefix));
	return hit === undefined ? undefined : hit.slice(prefix.length);
};

function toTrackerTask(n: SearchNode): TrackerTask {
	const labels = (n.labels?.nodes ?? []).map(l => l.name ?? '').filter(s => s.length > 0);
	const epic  = labelValue(labels, 'epic:');
	const story = labelValue(labels, 'story:');
	return {
		number:    n.number ?? 0,
		title:     n.title ?? '',
		state:     (n.state ?? 'OPEN').toLowerCase() === 'closed' ? 'closed' : 'open',
		author:    n.author?.login ?? '',
		assignees: (n.assignees?.nodes ?? []).map(a => a.login ?? '').filter(s => s.length > 0),
		labels,
		...(n.milestone?.title ? { milestone: n.milestone.title } : {}),
		...(epic  !== undefined ? { epic }  : {}),
		...(story !== undefined ? { story } : {}),
		url:       n.url ?? '',
	};
}

// ---------------------------------------------------------------------------
// signoff pull request helpers (copied from github-adapter.ts, which keeps its own until the adapter moves onto the table)
// ---------------------------------------------------------------------------

/** A well-formed `owner/repo#N`; parseIssueRef alone only checks the separators. */
const ISSUE_REF_RE = /^[^/#\s]+\/[^/#\s]+#[0-9]+(?![\s\S])/;
const PULL_URL_RE = /https?:\/\/\S+\/pull\/([0-9]+)/;

interface PullReview { author?: { login?: string | null | undefined } | null | undefined; state?: string | undefined; submittedAt?: string | null | undefined }

/** Whether a reviewer's latest decisive review made after `since` asks for changes (times compared as instants). */
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

const sameLogin = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function parseRequestRef(request: SignoffRequestRef): { owner: string; repo: string; number: string } {
	if (!ISSUE_REF_RE.test(request.ref)) throw new GhCommandError('rejected', `malformed signoff request reference '${request.ref}' (expected owner/repo#N)`);
	return parseIssueRef(request.ref);
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export function createRegistryTable(deps: ToolDeps) {
	/** Login of the currently-authenticated gh user: the authoritative current-user source (not any config value). */
	async function ghCurrentLogin(): Promise<string> {
		const d = opData(must(await run(ghTrackerTool, { op: 'current_login' }, deps)), 'current_login');
		return d['login'] as string;
	}

	async function queryTasks(owner: string, repo: string, filters: TaskQueryFilters, page?: PageRequest): Promise<TaskPage> {
		const size = Math.min(Math.max(1, page?.size ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
		const q    = buildTaskSearchQuery(owner, repo, filters);
		const d = opData(must(await run(ghTrackerTool, { op: 'tasks_query', q, first: size, ...(page?.cursor ? { after: page.cursor } : {}) }, deps)), 'tasks_query');
		const info = d['pageInfo'] as { hasNextPage: boolean; endCursor?: string };
		const tasks = (d['nodes'] as SearchNode[]).map(toTrackerTask);
		return {
			tasks,
			pageInfo: { hasNextPage: info.hasNextPage, ...(info.endCursor ? { endCursor: info.endCursor } : {}) },
			...(typeof d['issueCount'] === 'number' ? { total: d['issueCount'] } : {}),
		};
	}

	const table = {
		ghCurrentLogin,
		queryTasks,

		/** Best-effort: false when gh fails. */
		async ghCreateLabel(owner: string, repo: string, name: string): Promise<boolean> {
			const c = await run(ghLabelTool, { op: 'create', repo: repoArg(owner, repo), name, force: true }, deps);
			return soft(c, undefined) !== undefined;
		},

		/** Create an issue; returns its `owner/repo#N` ref. */
		async ghCreateIssue(owner: string, repo: string, title: string, body: string, labels: readonly string[]): Promise<string> {
			const { url } = must(await run(ghIssueCreateTool, { repo: repoArg(owner, repo), title, body, ...(labels.length > 0 ? { labels: [...labels] } : {}) }, deps));
			const m = /\/(\d+)\s*$/.exec(url.trim());
			if (m === null) throw new Error(`gh issue create returned an unrecognized URL: '${url.trim()}'`);
			return buildRef(owner, repo, m[1]!);
		},

		/** Create an issue with its REST id and an optional native type; a type the org rejects is retried once without it. */
		async ghCreateIssueTyped(owner: string, repo: string, title: string, body: string, labels: readonly string[], issueType?: string): Promise<CreatedIssue> {
			const base = { op: 'issue_create_typed' as const, owner, repo, title, body, ...(labels.length > 0 ? { labels: [...labels] } : {}) };
			const create = async (type?: string): Promise<{ number: number; id: number }> => {
				const d = opData(must(await run(ghTrackerTool, type !== undefined ? { ...base, type } : base, deps)), 'issue_create_typed');
				return { number: d['number'] as number, id: d['id'] as number };
			};
			if (typeof issueType === 'string' && issueType.length > 0) {
				try {
					const r = await create(issueType);
					return { ref: buildRef(owner, repo, r.number), id: r.id, typed: true };
				} catch (err) {
					// Untyped only when the type itself was rejected; a timeout, a denial or any other failure may have
					// committed the issue, so a second POST could duplicate it: rethrow.
					if (!isIssueTypeRejection(err)) throw err;
				}
			}
			const r = await create();
			return { ref: buildRef(owner, repo, r.number), id: r.id, typed: false };
		},

		async ghLinkSubIssue(owner: string, repo: string, parentRef: string, childId: number): Promise<void> {
			opData(must(await run(ghTrackerTool, { op: 'sub_issue_link', owner, repo, number: issueNo(parentRef), subIssueId: childId }, deps)), 'sub_issue_link');
		},

		/** The REST database id of an issue, read from its number. */
		async ghGetIssueId(owner: string, repo: string, ref: string): Promise<number> {
			if (!STRICT_ISSUE_REF_RE.test(ref)) throw new GhCommandError('rejected', `malformed issue reference '${ref}' (expected owner/repo#N with a positive number)`);
			const d = opData(must(await run(ghTrackerTool, { op: 'issue_id', owner, repo, number: issueNo(ref) }, deps)), 'issue_id');
			return d['id'] as number;
		},

		async ghGetIssueBody(owner: string, repo: string, ref: string): Promise<string> {
			const issue = must(await run(ghIssueViewTool, { repo: repoArg(owner, repo), number: issueNo(ref) }, deps));
			return (issue.body ?? '').trim();
		},

		async ghEditIssueBody(owner: string, repo: string, ref: string, body: string): Promise<void> {
			must(await run(ghIssueEditTool, { repo: repoArg(owner, repo), number: issueNo(ref), body }, deps));
		},

		async ghComment(owner: string, repo: string, ref: string, body: string): Promise<void> {
			must(await run(ghIssueCommentTool, { repo: repoArg(owner, repo), number: issueNo(ref), body }, deps));
		},

		/** Every comment of an issue in ascending time order across every page; with `since` only comments at or after it. */
		async ghListIssueComments(owner: string, repo: string, ref: string, since?: string): Promise<TrackerComment[]> {
			const d = opData(must(await run(ghTrackerTool, { op: 'comments_list', owner, repo, number: issueNo(ref), ...(since !== undefined ? { since } : {}) }, deps)), 'comments_list');
			const rows = d['comments'] as Array<{ id: string; author: string; text: string; at: string; url?: string }>;
			const comments: TrackerComment[] = rows.map(r => ({ externalId: r.id, author: r.author, text: r.text, at: r.at, ...(typeof r.url === 'string' ? { url: r.url } : {}) }));
			return comments.sort((a, b) => a.at.localeCompare(b.at) || a.externalId.localeCompare(b.externalId, undefined, { numeric: true }));
		},

		/** Post a comment and return the new comment's id. */
		async ghPostCommentReturningId(owner: string, repo: string, ref: string, body: string): Promise<string> {
			const d = opData(must(await run(ghTrackerTool, { op: 'comment_post', owner, repo, number: issueNo(ref), body }, deps)), 'comment_post');
			return d['id'] as string;
		},

		/** Close an issue; closing an already-closed issue is a no-op success. */
		async ghCloseIssue(owner: string, repo: string, ref: string): Promise<void> {
			must(await run(ghIssueCloseTool, { repo: repoArg(owner, repo), number: issueNo(ref) }, deps));
		},

		/** Current issue state (lower case) and its labels. */
		async ghGetIssueState(owner: string, repo: string, ref: string): Promise<{ state: string; labels: string[] }> {
			const issue = must(await run(ghIssueViewTool, { repo: repoArg(owner, repo), number: issueNo(ref) }, deps));
			return {
				state:  (issue.state ?? 'OPEN').toLowerCase(),
				labels: (issue.labels ?? []).map(l => l.name ?? '').filter(n => n.length > 0),
			};
		},

		/** The first issue (any state) carrying all the labels, or undefined; undefined too when gh fails (best effort). */
		async ghFindIssueByLabels(owner: string, repo: string, labels: readonly string[]): Promise<string | undefined> {
			const c = await run(ghIssueListTool, { repo: repoArg(owner, repo), state: 'all', limit: 1, labels: [...labels] }, deps);
			const found = soft(c, undefined)?.issues[0]?.number;
			return found === undefined ? undefined : buildRef(owner, repo, found);
		},

		/** Strict counterpart: a failed lookup throws. */
		async ghFindIssueByLabelsStrict(owner: string, repo: string, labels: readonly string[]): Promise<string | undefined> {
			const found = must(await run(ghIssueListTool, { repo: repoArg(owner, repo), state: 'all', limit: 1, labels: [...labels] }, deps)).issues[0]?.number;
			return found === undefined ? undefined : buildRef(owner, repo, found);
		},

		/** Every issue (any state) carrying all the labels, ascending by number, across every page; pull requests left out. */
		async ghListIssuesByLabelsStrict(owner: string, repo: string, labels: readonly string[]): Promise<string[]> {
			const d = opData(must(await run(ghTrackerTool, { op: 'issues_by_labels', owner, repo, labels: [...labels] }, deps)), 'issues_by_labels');
			return (d['numbers'] as number[]).slice().sort((x, y) => x - y).map(n => buildRef(owner, repo, String(n)));
		},

		/** Every issue whose title is the token or starts with it followed by ` — `, ascending by number. */
		async ghListIssuesByTitleTokenStrict(owner: string, repo: string, token: string): Promise<string[]> {
			const d = opData(must(await run(ghTrackerTool, { op: 'issues_titles', owner, repo }, deps)), 'issues_titles');
			const found = (d['issues'] as Array<{ number: number; title: string }>).filter(i => titleMatchesToken(i.title, token)).map(i => i.number);
			return found.sort((x, y) => x - y).map(n => buildRef(owner, repo, String(n)));
		},

		/** Ensure a milestone exists. Best effort: an existing milestone (422) or any other gh failure is not an error. */
		async ghEnsureMilestone(owner: string, repo: string, title: string): Promise<void> {
			soft(await run(ghTrackerTool, { op: 'milestone_create', owner, repo, title }, deps), undefined);
		},

		async ghAttachMilestone(owner: string, repo: string, ref: string, title: string): Promise<void> {
			must(await run(ghIssueEditTool, { repo: repoArg(owner, repo), number: issueNo(ref), milestone: title }, deps));
		},

		/** The scopes of the gh token (the X-Oauth-Scopes header); ok:false when gh fails. */
		async ghTokenScopes(): Promise<{ readonly ok: true; readonly scopes: readonly string[] } | { readonly ok: false; readonly reason: string }> {
			const c = await run(ghTrackerTool, { op: 'token_scopes' }, deps);
			const d = soft(c, undefined);
			if (d === undefined) return { ok: false, reason: 'could not read token scopes (`gh api -i /user` failed)' };
			return { ok: true, scopes: opData(d, 'token_scopes')['scopes'] as string[] };
		},

		/** Names of the native issue types of an org; [] when gh fails (org without the feature, personal account, API hiccup). */
		async ghListOrgIssueTypes(org: string): Promise<readonly string[]> {
			const d = soft(await run(ghTrackerTool, { op: 'org_issue_types_list', org }, deps), undefined);
			return d === undefined ? [] : opData(d, 'org_issue_types_list')['names'] as string[];
		},

		/** Create an org issue type; false when gh fails (needs admin:org). */
		async ghCreateOrgIssueType(org: string, name: string, color: string, description: string): Promise<boolean> {
			return soft(await run(ghTrackerTool, { op: 'org_issue_type_create', org, name, color, description }, deps), undefined) !== undefined;
		},

		/** Create a Projects v2 board: its number and url, or null when gh fails (needs the project scope). */
		async ghCreateProject(org: string, title: string): Promise<{ readonly number: number; readonly url: string } | null> {
			const d = soft(await run(ghTrackerTool, { op: 'project_create', owner: org, title }, deps), undefined);
			if (d === undefined) return null;
			const row = opData(d, 'project_create');
			return { number: row['number'] as number, url: row['url'] as string };
		},

		/** Find an open Projects v2 board by exact title: its number and url, or null (none, or gh failed). */
		async ghFindProjectByTitle(org: string, title: string): Promise<{ readonly number: number; readonly url: string } | null> {
			const d = soft(await run(ghProjectListTool, { owner: org, limit: 200 }, deps), undefined);
			const match = d?.projects.find(p => p.title === title && typeof p.number === 'number' && p.closed !== true);
			return match === undefined ? null : { number: match.number, url: match.url ?? '' };
		},

		/** Add a single-select field to a Projects v2 board; false when gh fails. */
		async ghAddProjectSingleSelectField(org: string, projectNumber: number, name: string, options: readonly string[]): Promise<boolean> {
			const c = await run(ghProjectManageTool, { op: 'field-create', number: projectNumber, owner: org, name, dataType: 'SINGLE_SELECT', singleSelectOptions: [...options] }, deps);
			return soft(c, undefined) !== undefined;
		},

		/** The web urls of a repo's issues (any state), capped at `limit` (at most 500, the tool's ceiling); [] when gh fails. */
		async ghListRepoIssueUrls(owner: string, repo: string, limit: number): Promise<readonly string[]> {
			const d = soft(await run(ghIssueListTool, { repo: repoArg(owner, repo), state: 'all', limit: Math.min(Math.max(1, Math.trunc(limit)), 500) }, deps), undefined);
			return (d?.issues ?? []).map(i => (i.url ?? '').trim()).filter(u => u.length > 0);
		},

		/** Add one issue (by web url) to a Projects v2 board; false when gh fails. */
		async ghAddProjectItem(org: string, projectNumber: number, issueUrl: string): Promise<boolean> {
			return soft(await run(ghProjectItemAddTool, { number: projectNumber, owner: org, url: issueUrl }, deps), undefined) !== undefined;
		},

		/**
		 * Whether gh is installed and signed in: the old ghAuthOk result, with its reason text. Read with gh_tracker current_login
		 * (`gh api user`), which answers only for a signed-in gh and needs no model call; gh_auth status is a text read that needs
		 * the conversion model, and its --json hosts form needs a newer gh than the one this daemon may run beside.
		 */
		async ghAuthOk(): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
			const d = soft(await run(ghTrackerTool, { op: 'current_login' }, deps), undefined);
			return d !== undefined ? { ok: true } : { ok: false, reason: 'gh CLI not available or not authenticated (run `gh auth login`)' };
		},

		/** The owner and repo of the `origin` remote of a work tree, or null (no origin, not a GitHub url, git failed). */
		async gitOriginOwnerRepo(repoPath: string): Promise<{ readonly owner: string; readonly repo: string } | null> {
			const d = soft(await run(gitRemoteTool, { cwd: repoPath, op: 'list' }, deps), undefined);
			const origin = (opData(d ?? { op: 'list', remotes: [] }, 'list')['remotes'] as Array<{ name: string; fetchUrl: string }> | undefined)?.find(r => r.name === 'origin');
			return origin === undefined ? null : parseGithubRemoteUrl(origin.fetchUrl);
		},

		// -- attach.ts: the tracked check of a file (git_ls_files, git_status, git_log) --------------------------------------

		/** Whether `relPath` is tracked: the literal path is among the index files git lists (an empty list is untracked). */
		async gitIsTracked(repoPath: string, relPath: string): Promise<boolean> {
			const d = must(await run(gitLsFilesTool, { cwd: repoPath, paths: [relPath], cached: true }, deps));
			return d.files.includes(relPath);
		},

		/** Whether `relPath` has staged, unstaged, conflicted or untracked changes (the old `git status --porcelain -- path`). */
		async gitHasChanges(repoPath: string, relPath: string): Promise<boolean> {
			const d = must(await run(gitStatusTool, { cwd: repoPath }, deps));
			const touches = (e: { path: string; origPath?: string | undefined }): boolean => e.path === relPath || e.origPath === relPath;
			return d.staged.some(touches) || d.unstaged.some(touches) || (d.conflicts as Array<{ path: string }>).some(c => c.path === relPath) || d.untracked.includes(relPath);
		},

		/** The sha of the last commit that touched `relPath`, or '' when none. */
		async gitLastCommitOf(repoPath: string, relPath: string): Promise<string> {
			const d = must(await run(gitLogTool, { cwd: repoPath, path: relPath, limit: 1 }, deps));
			return d.commits[0]?.sha ?? '';
		},

		// -- github-adapter.ts: the assignee and signoff pull request calls ---------------------------------------------------

		/** The assignee logins of an issue, read live. */
		async readAssignees(issue: IssueRef): Promise<{ readonly owner: string; readonly repo: string; readonly number: string; readonly logins: string[] }> {
			if (!ISSUE_REF_RE.test(issue)) throw new GhCommandError('rejected', `malformed issue reference '${issue}' (expected owner/repo#N)`);
			const { owner, repo, number } = parseIssueRef(issue);
			const row = must(await run(ghIssueViewTool, { repo: repoArg(owner, repo), number: Number(number) }, deps));
			const logins = (row.assignees ?? []).map(a => a.login ?? '').filter(l => l.length > 0);
			return { owner, repo, number, logins };
		},

		/** The one assignee, or null; more than one is refused. */
		async readAssignee(issue: IssueRef): Promise<string | null> {
			const { logins } = await table.readAssignees(issue);
			if (logins.length > 1) throw new GhCommandError('rejected', `${issue} has more than one assignee (${logins.join(', ')})`);
			return logins[0] ?? null;
		},

		/** Read, remove every other assignee, add the requested one (or clear all for null), re-read and compare. No step is retried. */
		async setAssignee(issue: IssueRef, who: string | null): Promise<void> {
			const current = await table.readAssignees(issue);
			const repository = repoArg(current.owner, current.repo);
			const others = current.logins.filter(l => who === null || !sameLogin(l, who));
			const hasWho = who !== null && current.logins.some(l => sameLogin(l, who));
			if (others.length > 0) must(await run(ghIssueEditTool, { repo: repository, number: Number(current.number), removeAssignees: others }, deps));
			if (who !== null && !hasWho) must(await run(ghIssueEditTool, { repo: repository, number: Number(current.number), addAssignees: [who] }, deps));
			const after = (await table.readAssignees(issue)).logins;
			const ok = who === null ? after.length === 0 : after.length === 1 && sameLogin(after[0]!, who);
			if (!ok) throw new GhCommandError('rejected', `${issue} assignees are [${after.join(', ')}] after the update, expected ${who === null ? 'none' : who}`);
		},

		/** Add `who` to the assignees (nobody is removed), re-read, and return the assignees read back. */
		async addAssignee(issue: IssueRef, who: string): Promise<string[]> {
			const current = await table.readAssignees(issue);
			if (!current.logins.some(l => sameLogin(l, who))) {
				must(await run(ghIssueEditTool, { repo: repoArg(current.owner, current.repo), number: Number(current.number), addAssignees: [who] }, deps));
			}
			const after = (await table.readAssignees(issue)).logins;
			if (!after.some(l => sameLogin(l, who))) throw new GhCommandError('rejected', `${issue} assignees are [${after.join(', ')}] after the add, expected ${who} among them`);
			return after;
		},

		/** The url of the open pull request from this branch, or undefined when there is none. */
		async openPullRequestOf(owner: string, repo: string, branch: string): Promise<string | undefined> {
			const d = must(await run(ghPrListTool, { repo: repoArg(owner, repo), head: branch, state: 'open' }, deps));
			return d.prs.map(p => p.url).find((u): u is string => typeof u === 'string' && PULL_URL_RE.test(u));
		},

		/**
		 * Open the signoff request as a pull request from the branch that holds the committed artifacts (an open one from the branch is
		 * reused), then link it from the stage's issue with one comment. The pull request is the request: a link comment that fails
		 * for a gh reason is logged and does not undo it; a DENIED link comment fails the stage (the pull request stays, so a retry reuses it).
		 */
		async openSignoffRequest(owner: string, repo: string, spec: SignoffRequestSpec): Promise<SignoffRequestRef> {
			if (spec.branch.trim().length === 0) throw new GhCommandError('rejected', 'a signoff request needs the branch that holds the committed artifacts');
			if (!ISSUE_REF_RE.test(spec.issue)) throw new GhCommandError('rejected', `malformed issue reference '${spec.issue}' (expected owner/repo#N)`);
			const existing = await table.openPullRequestOf(owner, repo, spec.branch);
			const created = existing ?? must(await run(ghPrCreateTool, { repo: repoArg(owner, repo), head: spec.branch, title: spec.title, body: spec.body }, deps)).url;
			const match = PULL_URL_RE.exec(created);
			if (match === null) throw new GhCommandError('rejected', `gh did not print the pull request url: '${created.slice(0, 120)}'`);
			const url = match[0];
			const ref = `${owner}/${repo}#${match[1]}`;
			try {
				await table.ghPostCommentReturningId(owner, repo, spec.issue, `<!-- insrc:signoff-request:${ref} -->\nSignoff requested: ${url}`);
			} catch (err) {
				if (isToolDenied(err)) throw err;
				log.warn({ ref, issue: spec.issue, err: err instanceof Error ? err.message : String(err) }, 'the signoff request was opened but not linked from its issue');
			}
			return { ref, url };
		},

		/** The state of a request from its pull request: merged is completed; closed unmerged or changes requested is changes-requested; else open. */
		async readSignoffState(request: SignoffRequestRef, since?: string): Promise<'open' | 'changes-requested' | 'completed'> {
			const { owner, repo, number } = parseRequestRef(request);
			const jsonFields = since === undefined ? ['state', 'mergedAt', 'reviewDecision'] as const : ['state', 'mergedAt', 'reviews'] as const;
			const row = must(await run(ghPrViewTool, { repo: repoArg(owner, repo), number: Number(number), jsonFields: [...jsonFields] }, deps));
			if (row.state === 'MERGED' || (typeof row.mergedAt === 'string' && row.mergedAt.length > 0)) return 'completed';
			if (row.state === 'CLOSED') return 'changes-requested';
			const asked = since === undefined ? row.reviewDecision === 'CHANGES_REQUESTED' : changesRequestedSince(Array.isArray(row.reviews) ? row.reviews as PullReview[] : [], since);
			return asked ? 'changes-requested' : 'open';
		},

		/** The branch the request's pull request is from, and whether it is still open. */
		async readSignoffRequest(request: SignoffRequestRef): Promise<{ branch: string; open: boolean }> {
			const { owner, repo, number } = parseRequestRef(request);
			const row = must(await run(ghPrViewTool, { repo: repoArg(owner, repo), number: Number(number), jsonFields: ['headRefName', 'state'] }, deps));
			if (typeof row.headRefName !== 'string' || row.headRefName.length === 0 || typeof row.state !== 'string') {
				throw new GhCommandError('rejected', `gh returned no branch or state for ${request.ref}: '${JSON.stringify(row).slice(0, 120)}'`);
			}
			return { branch: row.headRefName, open: row.state === 'OPEN' };
		},

		/** The current user's open tasks. */
		async listMyOpenTasks(owner: string, repo: string, page?: PageRequest): Promise<TaskPage> {
			return queryTasks(owner, repo, { owner: await ghCurrentLogin(), state: 'open' }, page);
		},
	};
	return table;
}

export type RegistryTable = ReturnType<typeof createRegistryTable>;
