/**
 * commitAndPushArtifactsViaRegistry (Story s10), against real temporary repositories and the old function as the reference.
 * Run: npx tsx --test-force-exit src/workflow/tracker/__tests__/commit-and-push-registry.test.ts
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { registerGitTools } from '../../../daemon/tools/builtins/git/index.js';
import { _setApprovalGateForTests } from '../../../daemon/tools/executor.js';
import { _resetRegistryForTests } from '../../../daemon/tools/registry.js';
import type { ApprovalGate } from '../../../daemon/tools/types.js';
import { commitAndPushArtifactsViaRegistry } from '../commit-and-push-registry.js';
import { commitAndPushArtifacts } from '../github.js';
import { workflowToolDeps } from '../registry-table.js';
import { ToolDenied } from '../tool-denied.js';

const dirs: string[] = [];
const approveAll: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'approve' }; } };
const declining = (...ids: string[]): ApprovalGate => ({ async ask(r) { return { requestId: r.requestId, decision: ids.includes(r.toolId) ? 'decline' : 'approve' }; } });
beforeEach(() => { _resetRegistryForTests(); registerGitTools(); _setApprovalGateForTests(() => approveAll); });
afterEach(() => { _setApprovalGateForTests(undefined); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const git = (cwd: string, ...args: string[]): string => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const mk = (): string => { const d = mkdtempSync(join(tmpdir(), 'insrc-cap-')); dirs.push(d); return d; };
const deps = (repo: string, mode: 'manual' | 'auto' = 'manual') => workflowToolDeps(repo, { approvalMode: mode });

/** A work tree on main with one commit and a bare origin that main tracks. */
function fixture(opts: { origin?: boolean } = {}): { work: string; origin: string } {
	const origin = mk(); const work = mk();
	execFileSync('git', ['init', '-q', '--bare', origin]);
	execFileSync('git', ['init', '-q', '-b', 'main', work]);
	git(work, 'config', 'user.email', 't@example.com'); git(work, 'config', 'user.name', 't'); git(work, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(work, 'seed.txt'), 'seed\n');
	git(work, 'add', 'seed.txt'); git(work, 'commit', '-q', '-m', 'seed');
	if (opts.origin !== false) { git(work, 'remote', 'add', 'origin', origin); git(work, 'push', '-q', '-u', 'origin', 'main'); }
	return { work, origin };
}
const write = (work: string, name: string, text = `${name}\n`): string => { const p = join(work, name); writeFileSync(p, text); return p; };
const subject = (cwd: string): string => git(cwd, 'log', '-1', '--format=%s');
const refs = (bare: string): string => git(bare, 'for-each-ref', '--format=%(refname)');

describe('commit-and-push-registry.test.ts: same results and reasons as the old function for each case; denial at each phase throws ToolDenied; denied commit leaves the paths staged; mixed and all-missing paths; three push configurations', () => {
	it('commits and pushes: the same result as the old function, and the commit reaches the remote', async () => {
		const a = fixture(); const b = fixture();
		const old = commitAndPushArtifacts(a.work, [write(a.work, 'x.md')], 'add x');
		const got = await commitAndPushArtifactsViaRegistry(b.work, [write(b.work, 'x.md')], 'add x', deps(b.work));
		assert.deepEqual(got, old);
		assert.deepEqual(got, { committed: true, pushed: true });
		assert.equal(subject(b.work), 'add x');
		assert.equal(git(b.origin, 'log', '-1', '--format=%s', 'main'), 'add x');
	});

	it('not a work tree: the same result and reason', async () => {
		const d = mk();
		const old = commitAndPushArtifacts(d, [write(d, 'x.md')], 'm');
		assert.deepEqual(await commitAndPushArtifactsViaRegistry(d, [join(d, 'x.md')], 'm', deps(d)), old);
		assert.equal(old.reason, 'not a git work tree');
	});

	it('all-missing paths: no files on disk, and git_stage is never called; mixed paths stage and commit only the existing ones', async () => {
		const a = fixture(); const b = fixture();
		const missing = [join(b.work, 'nope.md'), join(b.work, 'nada.md')];
		assert.deepEqual(await commitAndPushArtifactsViaRegistry(b.work, missing, 'm', deps(b.work)), { committed: false, pushed: false, reason: 'no artifact files on disk' });
		assert.deepEqual(commitAndPushArtifacts(a.work, [join(a.work, 'nope.md')], 'm'), { committed: false, pushed: false, reason: 'no artifact files on disk' });
		// a gate that declines git_stage proves it is not asked: the all-missing result comes back, not a denial
		_setApprovalGateForTests(() => declining('git_stage'));
		assert.equal((await commitAndPushArtifactsViaRegistry(b.work, missing, 'm', deps(b.work))).reason, 'no artifact files on disk');
		_setApprovalGateForTests(() => approveAll);
		const present = write(b.work, 'here.md');
		const got = await commitAndPushArtifactsViaRegistry(b.work, [present, ...missing], 'mixed', deps(b.work));
		assert.deepEqual(got, { committed: true, pushed: true });
		assert.deepEqual(git(b.work, 'show', '--name-only', '--format=', 'HEAD').split('\n'), ['here.md']);
	});

	it('nothing staged: nothing to commit (already up to date), no commit and no push', async () => {
		const a = fixture(); const b = fixture();
		const old = commitAndPushArtifacts(a.work, [join(a.work, 'seed.txt')], 'again');
		const got = await commitAndPushArtifactsViaRegistry(b.work, [join(b.work, 'seed.txt')], 'again', deps(b.work));
		assert.deepEqual(got, old);
		assert.deepEqual(got, { committed: false, pushed: false, reason: 'nothing to commit (already up to date)' });
		assert.equal(subject(b.work), 'seed');
	});

	it('a git add failure (an ignored path) and a commit failure (a failing pre-commit hook) are reported with the old reason prefixes', async () => {
		const b = fixture();
		writeFileSync(join(b.work, '.gitignore'), 'ignored.md\n');
		const ig = write(b.work, 'ignored.md');
		const addFail = await commitAndPushArtifactsViaRegistry(b.work, [ig], 'm', deps(b.work));
		assert.equal(addFail.committed, false); assert.equal(addFail.pushed, false);
		assert.match(addFail.reason ?? '', /^git add failed: /);
		const oldAdd = commitAndPushArtifacts(fixture().work, [(() => { const f = fixture(); writeFileSync(join(f.work, '.gitignore'), 'ignored.md\n'); return write(f.work, 'ignored.md'); })()], 'm');
		assert.match(oldAdd.reason ?? '', /^git add failed: /);
		// a pre-commit hook that fails
		const c = fixture();
		mkdirSync(join(c.work, '.git', 'hooks'), { recursive: true });
		writeFileSync(join(c.work, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho no >&2\nexit 1\n'); chmodSync(join(c.work, '.git', 'hooks', 'pre-commit'), 0o755);
		const commitFail = await commitAndPushArtifactsViaRegistry(c.work, [write(c.work, 'y.md')], 'm', deps(c.work));
		assert.equal(commitFail.committed, false);
		assert.match(commitFail.reason ?? '', /^git commit failed: /);
		assert.equal(subject(c.work), 'seed', 'nothing was committed');
		assert.equal(git(c.work, 'diff', '--cached', '--name-only'), 'y.md', 'the add stays staged, as with the old function');
	});

	it('three push configurations behave as the old helper: an alternate push remote, a differently named upstream, and a missing upstream', async () => {
		// an alternate push remote
		let b = fixture(); const other = mk(); execFileSync('git', ['init', '-q', '--bare', other]);
		git(b.work, 'remote', 'add', 'other', other); git(b.work, 'config', 'remote.pushDefault', 'other');
		assert.deepEqual(await commitAndPushArtifactsViaRegistry(b.work, [write(b.work, 'a.md')], 'alt', deps(b.work)), { committed: true, pushed: true });
		assert.equal(refs(other), 'refs/heads/main');
		assert.equal(git(b.origin, 'log', '-1', '--format=%s', 'main'), 'seed', 'origin was not pushed to');
		// a differently named upstream
		b = fixture();
		git(b.work, 'config', 'branch.main.merge', 'refs/heads/upstream-name'); git(b.work, 'config', 'push.default', 'upstream');
		assert.deepEqual(await commitAndPushArtifactsViaRegistry(b.work, [write(b.work, 'a.md')], 'named', deps(b.work)), { committed: true, pushed: true });
		assert.equal(git(b.origin, 'log', '-1', '--format=%s', 'upstream-name'), 'named');
		// a missing upstream: committed locally, the push failure is reported (the old helper's result)
		const f = fixture(); const g = fixture();
		git(f.work, 'checkout', '-q', '-b', 'feature'); git(g.work, 'checkout', '-q', '-b', 'feature');
		const old = commitAndPushArtifacts(f.work, [write(f.work, 'a.md')], 'noup');
		const got = await commitAndPushArtifactsViaRegistry(g.work, [write(g.work, 'a.md')], 'noup', deps(g.work));
		assert.equal(got.committed, true); assert.equal(got.pushed, false);
		assert.match(got.reason ?? '', /^committed locally; push failed: /);
		assert.deepEqual({ ...got, reason: undefined }, { ...old, reason: undefined });
		// a repository with no remote at all
		const n = fixture({ origin: false });
		const noRemote = await commitAndPushArtifactsViaRegistry(n.work, [write(n.work, 'a.md')], 'm', deps(n.work));
		assert.equal(noRemote.committed, true); assert.equal(noRemote.pushed, false);
	});

	it('a denial at git_stage throws ToolDenied (phase stage, not committed, nothing staged) and nothing is staged', async () => {
		const b = fixture();
		_setApprovalGateForTests(() => declining('git_stage'));
		await assert.rejects(commitAndPushArtifactsViaRegistry(b.work, [write(b.work, 'x.md')], 'm', deps(b.work)), (e: unknown) =>
			e instanceof ToolDenied && e.toolId === 'git_stage' && e.reason === 'declined' && e.detail.phase === 'stage' && e.detail.committed === false && (e.detail.stagedPaths ?? []).length === 0);
		assert.equal(git(b.work, 'diff', '--cached', '--name-only'), '');
	});

	it('a denial at git_commit throws ToolDenied with the staged paths, and the paths really stay staged (the index is checked)', async () => {
		const b = fixture();
		const x = write(b.work, 'x.md');
		_setApprovalGateForTests(() => declining('git_commit'));
		await assert.rejects(commitAndPushArtifactsViaRegistry(b.work, [x], 'm', deps(b.work)), (e: unknown) =>
			e instanceof ToolDenied && e.toolId === 'git_commit' && e.detail.phase === 'commit' && e.detail.committed === false && e.detail.stagedPaths?.[0] === x);
		assert.equal(git(b.work, 'diff', '--cached', '--name-only'), 'x.md');
		assert.equal(subject(b.work), 'seed');
	});

	it('a denial at git_push throws ToolDenied with committed true; the commit exists locally and a repeat call finds nothing to commit', async () => {
		const b = fixture();
		const x = write(b.work, 'x.md');
		_setApprovalGateForTests(() => declining('git_push'));
		await assert.rejects(commitAndPushArtifactsViaRegistry(b.work, [x], 'pushme', deps(b.work)), (e: unknown) =>
			e instanceof ToolDenied && e.toolId === 'git_push' && e.detail.phase === 'push' && e.detail.committed === true && (e.detail.stagedPaths ?? []).length === 0);
		assert.equal(subject(b.work), 'pushme');
		assert.equal(git(b.origin, 'log', '-1', '--format=%s', 'main'), 'seed', 'not pushed');
		_setApprovalGateForTests(() => approveAll);
		assert.deepEqual(await commitAndPushArtifactsViaRegistry(b.work, [x], 'pushme', deps(b.work)), { committed: false, pushed: false, reason: 'nothing to commit (already up to date)' });
	});

	it('no client attached: a destructive-free sequence still asks in manual mode and is denied as no-client, thrown; the reads are never asked', async () => {
		const b = fixture();
		_setApprovalGateForTests(undefined);
		await assert.rejects(commitAndPushArtifactsViaRegistry(b.work, [write(b.work, 'x.md')], 'm', deps(b.work)), (e: unknown) => e instanceof ToolDenied && e.reason === 'no-client' && e.detail.phase === 'stage');
		const notRepo = mk();
		assert.equal((await commitAndPushArtifactsViaRegistry(notRepo, [write(notRepo, 'x.md')], 'm', deps(notRepo))).reason, 'not a git work tree');
	});
});
