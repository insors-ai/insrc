/**
 * Story s9, task t3: the helpers of src/workflow/git-calls.ts.
 * Run: npx tsx --test-force-exit src/workflow/__tests__/git-calls.test.ts
 */

import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setApprovalGateForTests } from '../../daemon/tools/executor.js';
import { _resetToolHooksForTests, registerToolHook } from '../../daemon/tools/hooks.js';
import { _resetRegistryForTests } from '../../daemon/tools/registry.js';
import type { ApprovalGate } from '../../daemon/tools/types.js';
import {
	catFileExists, catFileText, configGet, fallbackMayCover, fetchRefs, forEachRef, GitCallFailed, lsFiles, lsRemote, orFallback,
	pathHistory, remoteUrl, revParse, revParseValues, rootCommits, statusPaths,
} from '../git-calls.js';
import { _setWorkflowToolDepsForTests } from '../tracker/registry-table.js';
import { ToolDenied } from '../tracker/tool-denied.js';

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let repo: string;
let remote: string;
let dirs: string[];
beforeEach(() => {
	_resetRegistryForTests();
	_resetToolHooksForTests();
	dirs = [];
	const mk = (prefix: string): string => { const d = mkdtempSync(join(tmpdir(), prefix)); dirs.push(d); return d; };
	remote = mk('insrc-gitcalls-remote-');
	git(remote, 'init', '-q', '--bare', '-b', 'main');
	repo = mk('insrc-gitcalls-');
	git(repo, 'init', '-q', '-b', 'main');
	git(repo, 'config', 'user.email', 't@example.com');
	git(repo, 'config', 'user.name', 'T');
	git(repo, 'config', 'commit.gpgsign', 'false');
	mkdirSync(join(repo, 'dir'));
	writeFileSync(join(repo, 'dir', 'a.txt'), 'one\n');
	git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'first');
	git(repo, 'remote', 'add', 'origin', remote);
	git(repo, 'push', '-q', 'origin', 'main');
});
afterEach(() => {
	_setApprovalGateForTests(undefined); _setWorkflowToolDepsForTests(); _resetToolHooksForTests();
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Every helper once, against the repository above; the tool each one calls. */
const helperCalls = (signal?: AbortSignal): Array<[string, string, () => Promise<unknown>]> => {
	const o = { signal };
	return [
		['git_rev_parse', 'revParse', () => revParse(repo, 'HEAD', {}, o)],
		['git_rev_parse', 'revParseValues', () => revParseValues(repo, { gitDir: true }, o)],
		['git_cat_file', 'catFileExists', () => catFileExists(repo, 'HEAD', o)],
		['git_cat_file', 'catFileText', () => catFileText(repo, 'HEAD', 'dir/a.txt', o)],
		['git_ls_files', 'lsFiles', () => lsFiles(repo, { cached: true }, o)],
		['git_path_history', 'pathHistory', () => pathHistory(repo, { path: 'dir/a.txt' }, o)],
		['git_config', 'configGet', () => configGet(repo, 'user.email', o)],
		['git_ls_remote', 'lsRemote', () => lsRemote(repo, { remote: 'origin', heads: true }, o)],
		['git_fetch_refs', 'fetchRefs', () => fetchRefs(repo, { remote: 'origin', refspecs: ['+refs/heads/main:refs/remotes/origin/main'] }, o)],
		['git_for_each_ref', 'forEachRef', () => forEachRef(repo, { pattern: ['refs/heads'] }, o)],
		['git_remote', 'remoteUrl', () => remoteUrl(repo, 'origin', o)],
		['git_status', 'statusPaths', () => statusPaths(repo, { paths: ['dir'], untrackedFiles: 'all' }, o)],
		['git_rev_list', 'rootCommits', () => rootCommits(repo, 'HEAD', o)],
	];
};

test("git-calls.test.ts: each helper calls its tool through callTool with the caller 'workflow', the site's signal and approval mode", async () => {
	const seen: Array<{ tool: string; caller: string | undefined }> = [];
	for (const tool of new Set(helperCalls().map(([t]) => t))) {
		registerToolHook({ id: `spy-${tool}`, toolId: tool, async run(ctx) { seen.push({ tool: ctx.toolId, caller: ctx.caller }); } });
	}
	const values = new Map<string, unknown>();
	for (const [, name, call] of helperCalls()) values.set(name, await call());

	assert.deepEqual([...new Set(seen.map(s => s.tool))].sort(), [...new Set(helperCalls().map(([t]) => t))].sort(), 'every helper reached its tool');
	assert.ok(seen.every(s => s.caller === 'workflow'), "the caller of every call is 'workflow'");
	// the plain values the old code used
	assert.equal(values.get('revParse'), git(repo, 'rev-parse', 'HEAD').trim());
	assert.equal(values.get('catFileExists'), true);
	assert.equal(values.get('catFileText'), 'one\n');
	assert.deepEqual(values.get('lsFiles'), ['dir/a.txt']);
	assert.equal(values.get('configGet'), 't@example.com');
	assert.equal(values.get('remoteUrl'), remote);
	assert.deepEqual(values.get('rootCommits'), [git(repo, 'rev-parse', 'HEAD').trim()]);

	// the site's signal: an aborted signal stops every helper with a cancelled denial before git runs
	const aborted = AbortSignal.abort();
	for (const [, name, call] of helperCalls(aborted)) {
		await assert.rejects(call(), (e: unknown) => e instanceof ToolDenied && e.reason === 'cancelled', `${name} honours the signal`);
	}

	// the site's approval mode: a call of the common class asks under 'manual' and not under 'auto'
	const asked: string[] = [];
	const approve: ApprovalGate = { async ask(r) { asked.push(r.requestId); return { requestId: r.requestId, decision: 'approve' }; } };
	_setApprovalGateForTests(() => approve);
	const into = (n: string) => ({ remote: 'origin', refspecs: [`refs/heads/main:refs/heads/${n}`] });
	await fetchRefs(repo, into('copy-auto'), { approvalMode: 'auto' });
	assert.equal(asked.length, 0, "'auto' does not ask");
	await fetchRefs(repo, into('copy-manual'), { approvalMode: 'manual' });
	assert.equal(asked.length, 1, "'manual' asks");
});

test('git-calls.test.ts: each failure kind maps to the site fallback or GitCallFailed and a denial with each reason is thrown as ToolDenied', async () => {
	// an ordinary failure: GitCallFailed with the kind, which a fallback may cover
	const unknownRev = await revParse(repo, 'no-such-rev', { verify: true }).catch((e: unknown) => e);
	assert.ok(unknownRev instanceof GitCallFailed, 'an unknown revision is a GitCallFailed');
	assert.equal((unknownRev as GitCallFailed).kind, 'rejected');
	assert.equal((unknownRev as GitCallFailed).toolId, 'git_rev_parse');
	assert.equal(await orFallback(revParse(repo, 'no-such-rev', { verify: true }), undefined), undefined, 'the fallback covers an ordinary failure');
	const notRepo = mkdtempSync(join(tmpdir(), 'insrc-gitcalls-none-')); dirs.push(notRepo);
	await assert.rejects(revParseValues(notRepo, { gitDir: true }), GitCallFailed);

	// not found is an answer, not a failure
	assert.equal(await catFileExists(repo, 'HEAD:missing.txt'), false);
	assert.equal(await catFileText(repo, 'HEAD', 'missing.txt'), undefined);
	assert.equal(await configGet(repo, 'no.such.key'), undefined);
	assert.equal(await remoteUrl(repo, 'nowhere'), undefined);

	// the site's time limit is a time-out failure, not a denial
	const slow = await lsFiles(repo, { cached: true }, { timeoutMs: 1 }).catch((e: unknown) => e);
	assert.ok(slow instanceof GitCallFailed && slow.kind === 'timed-out', `a spent time limit is GitCallFailed timed-out, got ${String(slow instanceof Error ? `${slow.name} ${slow.message}` : JSON.stringify(slow))}`);

	// a wrong payload or a failed conversion is never covered by a fallback; a denial is never swallowed
	for (const kind of ['schema-mismatch', 'conversion-failed'] as const) {
		const e = new GitCallFailed('git_x', kind, 'bad');
		assert.equal(fallbackMayCover(e), false);
		await assert.rejects(orFallback(Promise.reject(e), 'fallback'), (err: unknown) => err === e, `${kind} is thrown`);
	}
	for (const kind of ['missing-tool', 'missing-signin', 'unreachable', 'timed-out', 'rejected'] as const) {
		assert.equal(await orFallback(Promise.reject(new GitCallFailed('git_x', kind, 'x')), 'fallback'), 'fallback', `${kind} falls back`);
	}
	const denied = new ToolDenied('git_x', 'declined');
	await assert.rejects(orFallback(Promise.reject(denied), 'fallback'), (err: unknown) => err === denied, 'a ToolDenied is thrown through the fallback');

	// a denial with each reason is thrown as ToolDenied carrying that reason
	_setWorkflowToolDepsForTests({ approvalMode: 'manual' });
	const gates: Array<[string, ApprovalGate]> = [
		['declined', { async ask(r) { return { requestId: r.requestId, decision: 'decline' }; } }],
		['timed-out', { async ask() { return 'timed-out'; } }],
		['no-client', { async ask() { return 'no-client'; } }],
		['cancelled', { async ask() { return 'cancelled'; } }],
	];
	for (const [reason, gate] of gates) {
		_setApprovalGateForTests(() => gate);
		await assert.rejects(
			fetchRefs(repo, { remote: 'origin', refspecs: [`refs/heads/main:refs/heads/denied-${reason}`] }),
			(e: unknown) => e instanceof ToolDenied && e.reason === reason && e.toolId === 'git_fetch_refs',
			`${reason} is thrown as a ToolDenied`,
		);
		assert.equal(git(repo, 'branch', '--list', `denied-${reason}`).trim(), '', `nothing was fetched after ${reason}`);
	}
});
