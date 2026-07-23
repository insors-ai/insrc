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
import { existsSync } from 'node:fs';

import { buildRef, parseIssueRef } from './refs.js';
import { epicMembershipLabel } from './conventions.js';

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

export interface CommitArtifactsResult {
	readonly committed: boolean;
	readonly pushed:    boolean;
	readonly reason?:   string;   // why nothing was committed / pushed
}

/** Stage the given (already-written) artifact files, commit, and push. Makes
 *  the workflow artifacts portable: after an approval, the canonical JSON +
 *  rendered MD are checked into the repo so anyone who pulls can proceed to the
 *  next stage — the local machine is no longer the only holder.
 *
 *  Best-effort and non-fatal to the surrounding approval:
 *   - a no-op when `repoPath` isn't a git work tree, when no path exists, or
 *     when nothing is staged (already committed);
 *   - a push failure (offline / no upstream / rejected) still leaves the
 *     artifacts committed LOCALLY — reported via `pushed:false` + `reason`.
 *  Routes through the injectable exec so unit tests stub it like the gh calls. */
export function commitAndPushArtifacts(repoPath: string, paths: readonly string[], message: string): CommitArtifactsResult {
	try { silent('git', ['-C', repoPath, 'rev-parse', '--is-inside-work-tree']); }
	catch { return { committed: false, pushed: false, reason: 'not a git work tree' }; }

	const present = paths.filter(p => existsSync(p));
	if (present.length === 0) return { committed: false, pushed: false, reason: 'no artifact files on disk' };

	try { silent('git', ['-C', repoPath, 'add', '--', ...present]); }
	catch (err) { return { committed: false, pushed: false, reason: `git add failed: ${(err as Error).message}` }; }

	// `git diff --cached --quiet` exits 0 when nothing is staged, non-zero when
	// there ARE staged changes → the throw is the "there is something to commit" signal.
	let staged = false;
	try { silent('git', ['-C', repoPath, 'diff', '--cached', '--quiet']); }
	catch { staged = true; }
	if (!staged) return { committed: false, pushed: false, reason: 'nothing to commit (already up to date)' };

	try { silent('git', ['-C', repoPath, 'commit', '-m', message]); }
	catch (err) { return { committed: false, pushed: false, reason: `git commit failed: ${(err as Error).message}` }; }

	try { silent('git', ['-C', repoPath, 'push']); return { committed: true, pushed: true }; }
	catch (err) { return { committed: true, pushed: false, reason: `committed locally; push failed: ${(err as Error).message}` }; }
}

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

export interface CreatedIssue {
	readonly ref:   string;    // owner/repo#N
	readonly id:    number;    // REST database id (needed for sub-issue linking)
	readonly typed: boolean;   // whether the native issue type was applied
}

/** Create an issue via the REST API (so the numeric database `id` comes
 *  back for sub-issue linking) with an optional native issue TYPE. When
 *  a type is given but rejected (org without issue types enabled), retries
 *  once WITHOUT the type so the issue is still created — fail-open. */
export function ghCreateIssueTyped(
	owner: string, repo: string, title: string, body: string,
	labels: readonly string[], issueType?: string,
): CreatedIssue {
	const base = ['api', '-X', 'POST', `repos/${owner}/${repo}/issues`, '-f', `title=${title}`, '-f', `body=${body}`];
	for (const l of labels) base.push('-f', `labels[]=${l}`);
	const parse = (raw: string): { number: number; id: number } => {
		const j = JSON.parse(raw) as { number?: number; id?: number };
		if (typeof j.number !== 'number' || typeof j.id !== 'number') {
			throw new Error(`gh api issue create returned unexpected JSON: '${raw.slice(0, 120)}'`);
		}
		return { number: j.number, id: j.id };
	};
	if (typeof issueType === 'string' && issueType.length > 0) {
		try {
			const r = parse(out('gh', [...base, '-f', `type=${issueType}`]));
			return { ref: buildRef(owner, repo, r.number), id: r.id, typed: true };
		} catch { /* org may not have issue types — fall through untyped */ }
	}
	const r = parse(out('gh', base));
	return { ref: buildRef(owner, repo, r.number), id: r.id, typed: false };
}

/** Link an existing issue (`childId` = its REST database id) as a
 *  sub-issue of `parentRef`. Throws on API error (the caller wraps this
 *  in a best-effort guard since sub-issues may be disabled). */
export function ghLinkSubIssue(owner: string, repo: string, parentRef: string, childId: number): void {
	silent('gh', ['api', '-X', 'POST', `repos/${owner}/${repo}/issues/${parseIssueRef(parentRef).number}/sub_issues`, '-F', `sub_issue_id=${childId}`]);
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

// ---------------------------------------------------------------------------
// gh — tracker setup (scopes / issue types / projects)
//
// These back the one-shot `insrc tracker setup` bootstrap. All go
// through the same `_exec` seam so `_setTrackerExecForTests` stubs them
// alongside the push/sync calls.
// ---------------------------------------------------------------------------

/** Read the OAuth scopes the current `gh` token carries, from the
 *  `X-Oauth-Scopes` response header of `gh api -i /user`. Returns the
 *  parsed scope list (possibly empty when the header is absent/blank —
 *  e.g. a fine-grained token), or `ok:false` when the call fails. */
export function ghTokenScopes(): { readonly ok: true; readonly scopes: readonly string[] } | { readonly ok: false; readonly reason: string } {
	let raw: string;
	try { raw = out('gh', ['api', '-i', '/user']); }
	catch { return { ok: false, reason: 'could not read token scopes (`gh api -i /user` failed)' }; }
	for (const line of raw.split(/\r?\n/)) {
		const m = /^x-oauth-scopes:\s*(.*)$/i.exec(line.trim());
		if (m !== null) {
			return { ok: true, scopes: m[1]!.split(',').map(s => s.trim()).filter(s => s.length > 0) };
		}
	}
	// Header not emitted → treat as an empty scope set (setup will guide a refresh).
	return { ok: true, scopes: [] };
}

/** Names of the native issue types defined on an org, via GraphQL
 *  `organization.issueTypes`. Returns [] on any error (org without the
 *  feature, personal account, API hiccup) — the caller then attempts a
 *  create and reports on that result. */
export function ghListOrgIssueTypes(org: string): readonly string[] {
	const query = 'query($owner:String!){organization(login:$owner){issueTypes(first:25){nodes{name}}}}';
	let raw: string;
	try { raw = out('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${org}`]); }
	catch { return []; }
	try {
		const j = JSON.parse(raw) as { data?: { organization?: { issueTypes?: { nodes?: Array<{ name?: string }> } } } };
		return (j.data?.organization?.issueTypes?.nodes ?? []).map(n => n.name ?? '').filter(n => n.length > 0);
	} catch { return []; }
}

/** Create an org issue type. Returns false on error (needs `admin:org`;
 *  the caller gates on the scope first).
 *
 *  NOTE: `is_enabled` MUST be passed with `-F` (typed boolean). Using
 *  `-f` sends the string "true" and the API 422s. */
export function ghCreateOrgIssueType(org: string, name: string, color: string, description: string): boolean {
	try {
		silent('gh', ['api', '-X', 'POST', `/orgs/${org}/issue-types`,
			'-f', `name=${name}`, '-F', 'is_enabled=true', '-f', `color=${color}`, '-f', `description=${description}`]);
		return true;
	} catch { return false; }
}

/** Create a Projects v2 board. Returns its number + url, or null on
 *  error (needs the `project` scope; the caller gates on it). */
export function ghCreateProject(org: string, title: string): { readonly number: number; readonly url: string } | null {
	let raw: string;
	try { raw = out('gh', ['project', 'create', '--owner', org, '--title', title, '--format', 'json']); }
	catch { return null; }
	try {
		const j = JSON.parse(raw) as { number?: number; url?: string };
		if (typeof j.number !== 'number') return null;
		return { number: j.number, url: j.url ?? '' };
	} catch { return null; }
}

/** Find an existing Projects v2 board by exact title. Returns its number
 *  + url, or null if none matches (or on error). Lets setup reuse a board
 *  instead of creating a duplicate on every `--project` run. */
export function ghFindProjectByTitle(org: string, title: string): { readonly number: number; readonly url: string } | null {
	let raw: string;
	try { raw = out('gh', ['project', 'list', '--owner', org, '--format', 'json', '--limit', '200']); }
	catch { return null; }
	try {
		const j = JSON.parse(raw) as { projects?: Array<{ number?: number; title?: string; url?: string; closed?: boolean }> };
		const match = (j.projects ?? []).find(p => p.title === title && typeof p.number === 'number' && p.closed !== true);
		if (match === undefined || typeof match.number !== 'number') return null;
		return { number: match.number, url: match.url ?? '' };
	} catch { return null; }
}

/** Add a single-select field (e.g. `Size` with `XS,S,M,L,XL`) to a
 *  Projects v2 board. Best-effort → false on error. */
export function ghAddProjectSingleSelectField(org: string, projectNumber: number, name: string, options: readonly string[]): boolean {
	try {
		silent('gh', ['project', 'field-create', String(projectNumber), '--owner', org,
			'--name', name, '--data-type', 'SINGLE_SELECT', '--single-select-options', options.join(',')]);
		return true;
	} catch { return false; }
}

/** List the web URLs of a repo's issues (any state), capped at `limit`.
 *  Used to seed a fresh Project board with the existing issues. */
export function ghListRepoIssueUrls(owner: string, repo: string, limit: number): readonly string[] {
	let raw: string;
	try { raw = out('gh', ['issue', 'list', '--repo', `${owner}/${repo}`, '--state', 'all', '--limit', String(limit), '--json', 'url', '-q', '.[].url']); }
	catch { return []; }
	return raw.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
}

/** Add one issue (by web URL) to a Projects v2 board. Best-effort →
 *  false on error (the caller counts how many landed). */
export function ghAddProjectItem(org: string, projectNumber: number, issueUrl: string): boolean {
	try {
		silent('gh', ['project', 'item-add', String(projectNumber), '--owner', org, '--url', issueUrl]);
		return true;
	} catch { return false; }
}

// ---------------------------------------------------------------------------
// gh — task query / list (read-side)
//
// A read-side projection of GitHub issues into tracker "tasks", backing the
// `owner/state/epic/story` query + "my open tasks" list. Built against the
// GraphQL `search` connection (not `gh issue list`) so pagination is real,
// opaque-cursor pagination — `pageInfo.hasNextPage`/`endCursor` + `issueCount`
// let callers step every page deterministically instead of a `--limit` cap
// that silently truncates. See `.insrc/artifacts/LLD-7d951871d9566b3c-S001`
// (winning alternative a3). All calls go through the same `_exec` seam.
// ---------------------------------------------------------------------------

/** Read-side projection of a GitHub issue into a tracker task. */
export interface TrackerTask {
	readonly number:    number;
	readonly title:     string;
	readonly state:     'open' | 'closed';
	readonly author:    string;
	readonly assignees: readonly string[];
	readonly labels:    readonly string[];
	readonly milestone?: string;
	readonly epic?:     string;   // from an `epic:<slug>` label, prefix stripped
	readonly story?:    string;   // from a `story:<id>` label, prefix stripped
	readonly url:       string;
}

/** The four supported query filters, all optional. */
export interface TaskQueryFilters {
	readonly owner?: string;                        // GitHub assignee login
	readonly state?: 'open' | 'closed' | 'all';     // default 'open'
	readonly epic?:  string;                         // epic slug or full `epic:` label
	readonly story?: string;                         // story id or full `story:` label
}

/** Cursor-based page request over GitHub results. */
export interface PageRequest {
	readonly cursor?: string;   // opaque endCursor from a prior page
	readonly size?:   number;   // defaults to DEFAULT_PAGE_SIZE
}

/** First-class paginated return — carries `hasNextPage`/`endCursor` so a flat
 *  array can never silently truncate the result set. */
export interface TaskPage {
	readonly tasks:    readonly TrackerTask[];
	readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor?: string };
	readonly total?:   number;
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE     = 100;   // GitHub's `first:` ceiling on a connection

const SEARCH_GQL =
	'query($q:String!,$first:Int!,$after:String){' +
	'search(query:$q,type:ISSUE,first:$first,after:$after){' +
	'issueCount pageInfo{hasNextPage endCursor} ' +
	'nodes{... on Issue{number title state url ' +
	'author{login} assignees(first:20){nodes{login}} ' +
	'labels(first:50){nodes{name}} milestone{title}}}}}';

/** Login of the currently-authenticated `gh` user, from `gh api user`.
 *  This is the authoritative current-user source (not any config value). */
export function ghCurrentLogin(): string {
	const login = out('gh', ['api', 'user', '-q', '.login']);
	if (login.length === 0) throw new Error('gh api user returned no login (is `gh` authenticated?)');
	return login;
}

/** Normalise an epic filter to its membership label. A value already carrying
 *  the `epic:` prefix is passed through; a bare slug is mapped via the same
 *  `epicMembershipLabel` used when the issue was created. */
function epicFilterLabel(epic: string): string {
	return epic.startsWith('epic:') ? epic : epicMembershipLabel(epic);
}

/** Normalise a story filter to its `story:<id>` label. */
function storyFilterLabel(story: string): string {
	return story.includes(':') ? story : `story:${story}`;
}

/** Build the GitHub search query string from repo + filters. */
function buildTaskSearchQuery(owner: string, repo: string, filters: TaskQueryFilters): string {
	const q: string[] = [`repo:${owner}/${repo}`, 'is:issue'];
	switch (filters.state ?? 'open') {
		case 'open':   q.push('is:open'); break;
		case 'closed': q.push('is:closed'); break;
		case 'all':    break;   // no state qualifier
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

/** Strip a `prefix` off the first matching label, else undefined. */
function labelValue(labels: readonly string[], prefix: string): string | undefined {
	const hit = labels.find(l => l.startsWith(prefix));
	return hit === undefined ? undefined : hit.slice(prefix.length);
}

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

/** Query tracker tasks (GitHub issues) in `owner/repo` by owner/state/epic/story,
 *  one cursor page at a time. `page.cursor` omitted → first page. */
export function queryTasks(owner: string, repo: string, filters: TaskQueryFilters, page?: PageRequest): TaskPage {
	const size = Math.min(Math.max(1, page?.size ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
	const q    = buildTaskSearchQuery(owner, repo, filters);
	const args = ['api', 'graphql', '-f', `query=${SEARCH_GQL}`, '-f', `q=${q}`, '-F', `first=${size}`];
	// A nullable `$after` variable simply defaults to null (first page) when
	// omitted — passing an empty string would be rejected as an invalid cursor.
	if (page?.cursor) args.push('-f', `after=${page.cursor}`);

	const raw    = out('gh', args);
	const parsed = JSON.parse(raw) as { data?: { search?: {
		issueCount?: number;
		pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
		nodes?: SearchNode[];
	} } };
	const search = parsed.data?.search;
	if (search === undefined) throw new Error(`gh api graphql search returned unexpected JSON: '${raw.slice(0, 120)}'`);

	const tasks   = (search.nodes ?? []).map(toTrackerTask);
	const cursor  = search.pageInfo?.endCursor;
	return {
		tasks,
		pageInfo: {
			hasNextPage: search.pageInfo?.hasNextPage ?? false,
			...(cursor ? { endCursor: cursor } : {}),
		},
		...(typeof search.issueCount === 'number' ? { total: search.issueCount } : {}),
	};
}

/** The current user's open tasks — `assignee:<me> is:open`, where `<me>` is
 *  resolved from `gh api user` (not any config value). */
export function listMyOpenTasks(owner: string, repo: string, page?: PageRequest): TaskPage {
	return queryTasks(owner, repo, { owner: ghCurrentLogin(), state: 'open' }, page);
}
