/**
 * The git reads and writes of workflow code, over the tool registry (Story s9, tool-registry epic).
 *
 * Each helper calls a typed git tool through `callTool` with the caller 'workflow' and gives back the plain value the
 * code it replaces used (a sha, a boolean, a path list, undefined for 'not found'). Failures follow the rule of the
 * replacement table (tracker/registry-table.ts):
 *  - a denial (declined, timed-out, no-client, cancelled) is thrown as ToolDenied and is never turned into a value;
 *  - every other failure is thrown as GitCallFailed carrying the tool, the failure kind and the message, so the site
 *    keeps the fallback it has today (`orFallback` below, for the kinds a fallback may cover);
 *  - a schema mismatch or a failed conversion is a GitCallFailed too and `orFallback` never covers it, so a wrong
 *    payload is not passed on.
 * The helpers make one call each and await it; no helper catches a ToolDenied.
 */

import type { Static } from '@sinclair/typebox';

import { gitCatFileTool } from '../daemon/tools/builtins/git/cat-file.js';
import { gitConfigTool } from '../daemon/tools/builtins/git/config.js';
import { gitFetchRefsTool } from '../daemon/tools/builtins/git/fetch-refs.js';
import { gitForEachRefTool } from '../daemon/tools/builtins/git/for-each-ref.js';
import { gitLsFilesTool } from '../daemon/tools/builtins/git/ls-files.js';
import { gitLsRemoteTool } from '../daemon/tools/builtins/git/ls-remote.js';
import { gitPathHistoryTool } from '../daemon/tools/builtins/git/path-history.js';
import { gitRemoteTool } from '../daemon/tools/builtins/git/remote.js';
import { gitRevListTool } from '../daemon/tools/builtins/git/rev-list.js';
import { gitRevParseTool } from '../daemon/tools/builtins/git/rev-parse.js';
import { gitStatusTool } from '../daemon/tools/builtins/git/status.js';
import type { GitLsRemoteData, GitStatusData } from '../daemon/tools/builtins/git/schemas.js';
import type { TypedTool } from '../daemon/tools/call-tool.js';
import type { CommonApprovalMode, ToolFailureKind } from '../daemon/tools/types.js';
import { run, workflowToolDeps } from './tracker/registry-table.js';
import { ToolDenied } from './tracker/tool-denied.js';

/** What a site sets for one call. */
export interface GitCallOptions {
	/** Cancels the call: the executor stops the process and the call is denied with the reason 'cancelled'. */
	readonly signal?: AbortSignal | undefined;
	/** The most the call may take; past it the call fails with the kind 'timed-out' (never a denial). */
	readonly timeoutMs?: number | undefined;
	/** The edits mode of the call, for a tool of the common approval class. */
	readonly approvalMode?: CommonApprovalMode | undefined;
}

/** A git tool call that failed for a reason other than a denial. */
export class GitCallFailed extends Error {
	readonly toolId: string;
	readonly kind: Exclude<ToolFailureKind, 'denied'>;
	constructor(toolId: string, kind: Exclude<ToolFailureKind, 'denied'>, message: string) {
		super(message);
		this.name = 'GitCallFailed';
		this.toolId = toolId;
		this.kind = kind;
	}
}

/** The failure kinds a site's fallback may cover: not a wrong payload (schema-mismatch) and not a failed conversion. */
export const fallbackMayCover = (e: GitCallFailed): boolean => e.kind !== 'schema-mismatch' && e.kind !== 'conversion-failed';

/**
 * The value of a call, or `fallback` when it failed with a GitCallFailed a fallback may cover. A ToolDenied, a schema
 * mismatch, a failed conversion and any other error are thrown.
 */
export async function orFallback<T, F>(call: Promise<T>, fallback: F): Promise<T | F> {
	try { return await call; }
	catch (err) {
		if (err instanceof GitCallFailed && fallbackMayCover(err)) return fallback;
		throw err;
	}
}

type InputOf<T extends TypedTool> = Omit<Static<T['inputSchema']>, 'cwd'>;

/** The one call every helper makes: the tool over `callTool` with the caller 'workflow', the data or the thrown error. */
export async function gitCall<T extends TypedTool>(tool: T, input: InputOf<T>, cwd: string, opts: GitCallOptions = {}): Promise<Static<T['outputSchema']>> {
	const timer = opts.timeoutMs !== undefined ? AbortSignal.timeout(opts.timeoutMs) : undefined;
	const signals = [opts.signal, timer].filter((s): s is AbortSignal => s !== undefined);
	const signal = signals.length === 0 ? undefined : signals.length === 1 ? signals[0] : AbortSignal.any(signals);
	const deps = workflowToolDeps(cwd, { signal, ...(opts.approvalMode !== undefined ? { approvalMode: opts.approvalMode } : {}) });
	const call = await run(tool, { ...input, cwd } as Static<T['inputSchema']>, deps);
	if (call.ok) return call.data;
	// A stopped call is told in two ways: the executor denies a call whose signal was already aborted ('denied'), and a
	// tool that was stopped while it ran fails with the text 'cancelled'. Both are the signal at work: ours (the time
	// limit) is a time-out, the caller's is a cancellation.
	const stopped = call.failure.kind === 'denied' ? call.failure.denial === 'cancelled' : /\bcancelled\b/.test(call.failure.message);
	if (stopped && timer?.aborted === true && opts.signal?.aborted !== true) throw new GitCallFailed(tool.id, 'timed-out', `${tool.id} did not finish within ${opts.timeoutMs} ms`);
	if (stopped && opts.signal?.aborted === true) throw new ToolDenied(tool.id, 'cancelled');
	if (call.failure.kind === 'denied') throw new ToolDenied(tool.id, call.failure.denial ?? 'declined');
	throw new GitCallFailed(tool.id, call.failure.kind, call.failure.message);
}

// ---------------------------------------------------------------------------
// the helpers
// ---------------------------------------------------------------------------

type RevParseInput = InputOf<typeof gitRevParseTool>;

/** The lines `git rev-parse` printed for one query (a rev, or a repository fact such as gitDir or isShallow). */
export async function revParseValues(cwd: string, query: RevParseInput, opts?: GitCallOptions): Promise<string[]> {
	return (await gitCall(gitRevParseTool, query, cwd, opts)).values;
}

/** The object name `rev` resolves to (or, with `short`, its abbreviation). Throws GitCallFailed when it does not resolve. */
export async function revParse(cwd: string, rev: string, flags: { short?: boolean; verify?: boolean; abbrevRef?: boolean } = {}, opts?: GitCallOptions): Promise<string> {
	const first = (await revParseValues(cwd, { rev, ...flags }, opts))[0];
	if (first === undefined) throw new GitCallFailed('git_rev_parse', 'rejected', `git printed nothing for ${rev}`);
	return first;
}

/** Whether `rev` (for instance `<sha>^{commit}` or `HEAD:path`) names an object. */
export async function catFileExists(cwd: string, rev: string, opts?: GitCallOptions): Promise<boolean> {
	const data = await gitCall(gitCatFileTool, { rev, exists: true }, cwd, opts);
	if (!('exists' in data)) throw new GitCallFailed('git_cat_file', 'schema-mismatch', 'git_cat_file answered an existence question with another form');
	return data.exists;
}

/** The text of the blob `<rev>:<path>`, or undefined when it does not exist. */
export async function catFileText(cwd: string, rev: string, path: string, opts?: GitCallOptions): Promise<string | undefined> {
	const data = await gitCall(gitCatFileTool, { rev, path }, cwd, opts);
	if (!('objects' in data)) throw new GitCallFailed('git_cat_file', 'schema-mismatch', 'git_cat_file answered a read with another form');
	const object = data.objects[0];
	return object !== undefined && object.exists ? object.content ?? '' : undefined;
}

/** The files `git ls-files` lists: tracked (`cached`), untracked and not ignored (`others`), limited to `paths`. */
export async function lsFiles(cwd: string, flags: { cached?: boolean; others?: boolean; paths?: readonly string[]; maxBytes?: number } = {}, opts?: GitCallOptions): Promise<string[]> {
	const { paths, ...rest } = flags;
	return (await gitCall(gitLsFilesTool, { ...rest, ...(paths !== undefined ? { paths: [...paths] } : {}) }, cwd, opts)).files;
}

/** The commits that touched a path, in the forms git_path_history gives. */
export async function pathHistory(cwd: string, query: InputOf<typeof gitPathHistoryTool>, opts?: GitCallOptions): Promise<Array<{ sha: string; committerTime: string; subject?: string | undefined }>> {
	return (await gitCall(gitPathHistoryTool, query, cwd, opts)).commits;
}

/** One config value, or undefined when the key is not set. */
export async function configGet(cwd: string, key: string, opts?: GitCallOptions): Promise<string | undefined> {
	const data = await gitCall(gitConfigTool, { key }, cwd, opts);
	return data.found ? data.value ?? '' : undefined;
}

/** The refs of a remote. */
export async function lsRemote(cwd: string, query: InputOf<typeof gitLsRemoteTool>, opts?: GitCallOptions): Promise<GitLsRemoteData> {
	return gitCall(gitLsRemoteTool, query, cwd, opts);
}

/** Fetch explicit `src:dst` pairs; the refs it updated. */
export async function fetchRefs(cwd: string, query: InputOf<typeof gitFetchRefsTool>, opts?: GitCallOptions): Promise<Array<{ ref: string; old: string; new: string }>> {
	return (await gitCall(gitFetchRefsTool, query, cwd, opts)).updated;
}

/** The refs `git for-each-ref` lists, each as the requested fields. */
export async function forEachRef(cwd: string, query: InputOf<typeof gitForEachRefTool>, opts?: GitCallOptions): Promise<Array<Record<string, string>>> {
	return (await gitCall(gitForEachRefTool, query, cwd, opts)).refs;
}

/** The fetch URL of a remote, or undefined when the repository has no such remote. */
export async function remoteUrl(cwd: string, remote: string, opts?: GitCallOptions): Promise<string | undefined> {
	const data = await gitCall(gitRemoteTool, { op: 'list' }, cwd, opts);
	return data.remotes?.find(r => r.name === remote)?.fetchUrl;
}

/** The status of the work tree, limited to `paths`; with `untrackedFiles` 'all' every untracked file is listed. */
export async function statusPaths(cwd: string, flags: { paths?: readonly string[]; untrackedFiles?: 'all' } = {}, opts?: GitCallOptions): Promise<GitStatusData> {
	const { paths, ...rest } = flags;
	return gitCall(gitStatusTool, { ...rest, ...(paths !== undefined ? { paths: [...paths] } : {}) }, cwd, opts);
}

/** The root commits (no parent) reachable from `rev`. */
export async function rootCommits(cwd: string, rev: string, opts?: GitCallOptions): Promise<string[]> {
	const data = await gitCall(gitRevListTool, { rev, maxParents: 0 }, cwd, opts);
	if (!('commits' in data)) throw new GitCallFailed('git_rev_list', 'schema-mismatch', 'git_rev_list answered a listing with a count');
	return data.commits;
}
