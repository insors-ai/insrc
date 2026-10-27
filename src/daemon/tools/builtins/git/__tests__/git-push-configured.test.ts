/**
 * git_push configured (Story s10): a plain `git push`, so git's own configuration picks the remote, refspec and upstream.
 * Run: npx tsx --test-force-exit src/daemon/tools/builtins/git/__tests__/git-push-configured.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Value } from '@sinclair/typebox/value';

import { cleanup } from '../../../__tests__/_proc.js';
import { gitPushTool } from '../push.js';
import { toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

const T = 'git-push-configured.test.ts';
const dirs: string[] = [];
let standIn: StandIn | undefined;
afterEach(() => {
	standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined;
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const mk = (): string => { const d = mkdtempSync(join(tmpdir(), 'insrc-push-')); dirs.push(d); return d; };

/** A work tree on branch main with one commit and two bare remotes, origin and other. */
function fixture(): { work: string; origin: string; other: string } {
	const origin = mk(); const other = mk(); const work = mk();
	execFileSync('git', ['init', '-q', '--bare', origin]); execFileSync('git', ['init', '-q', '--bare', other]);
	execFileSync('git', ['init', '-q', '-b', 'main', work]);
	git(work, 'config', 'user.email', 't@example.com'); git(work, 'config', 'user.name', 't');
	git(work, 'remote', 'add', 'origin', origin); git(work, 'remote', 'add', 'other', other);
	git(work, 'commit', '-q', '--allow-empty', '-m', 'one');
	return { work, origin, other };
}
const refs = (bare: string): string => git(bare, 'for-each-ref', '--format=%(refname)');
const push = (work: string, input: Record<string, unknown>) => gitPushTool.execute({ cwd: work, ...input }, toolDeps(work));

test(`${T}: configured true runs plain git push with an alternate push remote, a differently named upstream and a missing upstream; combined inputs are rejected; existing calls are unchanged`, async () => {
	// an alternate push remote: remote.pushDefault wins, origin is untouched
	let f = fixture();
	git(f.work, 'config', 'remote.pushDefault', 'other');
	let r = await push(f.work, { configured: true });
	assert.equal(r.success, true, r.output);
	assert.equal(refs(f.other), 'refs/heads/main');
	assert.equal(refs(f.origin), '');
	assert.deepEqual((r.data as { remote: string; pushed: boolean }), { ...(r.data as object), remote: '(configured)', pushed: true });

	// a differently named upstream: the branch tracks origin's refs/heads/upstream-name and push.default=upstream
	f = fixture();
	git(f.work, 'config', 'branch.main.remote', 'origin'); git(f.work, 'config', 'branch.main.merge', 'refs/heads/upstream-name'); git(f.work, 'config', 'push.default', 'upstream');
	r = await push(f.work, { configured: true });
	assert.equal(r.success, true, r.output);
	assert.equal(refs(f.origin), 'refs/heads/upstream-name');

	// a missing upstream: git refuses and the failure is reported, not hidden
	f = fixture();
	git(f.work, 'config', 'push.default', 'simple');
	r = await push(f.work, { configured: true });
	assert.equal(r.success, false);
	assert.match(r.output, /no upstream|has no upstream|--set-upstream/i);
	assert.equal(refs(f.origin), '');

	// dry run and tags are the only other inputs honoured
	f = fixture();
	git(f.work, 'config', 'remote.pushDefault', 'other');
	r = await push(f.work, { configured: true, dryRun: true });
	assert.equal(r.success, true, r.output);
	assert.equal((r.data as { pushed: boolean }).pushed, false);
	assert.equal(refs(f.other), '');

	// combined with remote, ref, setUpstream or any force input: rejected, nothing runs
	standIn = installStandInGit('exit 0');
	for (const clash of [{ remote: 'origin' }, { ref: 'main' }, { setUpstream: true }, { force: true }, { forceRaw: true }, { forceToMain: true }, { force: false }, { forceRaw: false }, { forceToMain: false }, { setUpstream: false }]) {
		const bad = await push(f.work, { configured: true, ...clash });
		assert.equal(bad.success, false, JSON.stringify(clash));
		assert.match(bad.output, /configured cannot be combined with/);
	}
	assert.deepEqual(standIn.calls(), []);
	// a configured refspec that forces or deletes a ref is refused (configured is never destructive), and the remote is not touched
	standIn.restore(); cleanup(standIn.dir); standIn = undefined;
	for (const spec of ['+refs/heads/*:refs/heads/*', ':refs/heads/gone']) {
		const g = fixture();
		git(g.work, 'config', 'remote.pushDefault', 'other'); git(g.work, 'config', 'remote.other.push', spec);
		const refused = await push(g.work, { configured: true });
		assert.equal(refused.success, false, spec);
		assert.match(refused.output, /forces or deletes a ref/);
		assert.equal(refs(g.other), '');
	}
	// a mirror remote (forces and deletes) is refused too
	const m = fixture();
	git(m.work, 'config', 'remote.pushDefault', 'other'); git(m.work, 'config', 'remote.other.mirror', 'true');
	const mirrored = await push(m.work, { configured: true });
	assert.equal(mirrored.success, false);
	assert.match(mirrored.output, /mirrors refs/);
	assert.equal(refs(m.other), '');
	// the key set with no value at all is git's implicit true, and also refused
	const im = fixture();
	git(im.work, 'config', 'remote.pushDefault', 'other');
	appendFileSync(join(im.work, '.git', 'config'), '[remote "other"]\n\tmirror\n');
	const implicit = await push(im.work, { configured: true });
	assert.equal(implicit.success, false);
	assert.match(implicit.output, /mirrors refs/);
	// mirror = false is fine
	const nm = fixture();
	git(nm.work, 'config', 'remote.pushDefault', 'other'); git(nm.work, 'config', 'remote.other.mirror', 'false');
	assert.equal((await push(nm.work, { configured: true })).success, true);
	// an ordinary configured refspec is accepted
	const ok = fixture();
	git(ok.work, 'config', 'remote.pushDefault', 'other'); git(ok.work, 'config', 'remote.other.push', 'refs/heads/main:refs/heads/mirror');
	assert.equal((await push(ok.work, { configured: true })).success, true);
	assert.equal(refs(ok.other), 'refs/heads/mirror');
	standIn = installStandInGit('exit 0');
	// configured:false is the same as absent, and the tool is never destructive for configured
	assert.equal(gitPushTool.approval({ configured: true }), 'common');
	assert.equal(gitPushTool.approval({ configured: true, force: true }), 'destructive');

	// calls without configured are unchanged: explicit origin and the current branch
	standIn.restore(); cleanup(standIn.dir);
	standIn = installStandInGit('case "$*" in *push*) ;; *) echo main ;; esac\nexit 0');
	await push(f.work, {});
	await push(f.work, { remote: 'other', ref: 'feature' });
	await push(f.work, { configured: false });
	const pushes = standIn.calls().filter(c => c.includes('push') && !c.includes('rev-parse'));
	assert.deepEqual(pushes, ['push origin main', 'push other feature', 'push origin main']);

	// the input schema accepts the new boolean and nothing else changed
	assert.equal(Value.Check(gitPushTool.inputSchema, { configured: true }), true);
	assert.equal(Value.Check(gitPushTool.inputSchema, { configured: 'yes' }), false);
	assert.equal(Value.Check(gitPushTool.inputSchema, { surprise: 1 }), false);
});
