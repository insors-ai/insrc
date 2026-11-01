/**
 * Story 64703b708590bd68/s1, task t2: the repo gate.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/repo-call-gate.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { gateRepoCall, requireRepoForCall } from '../repo-call-gate.js';

const dirs: string[] = [];
const mk = (): string => { const d = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-gate-'))); dirs.push(d); return d; };
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const repo = mk();
const other = mk();
const registered = new Set([repo]);
const snapshot = (d: string): string[] => readdirSync(d, { recursive: true }).map(String).sort();

test('repo-call-gate.test.ts: a missing, empty, relative, non-directory and unregistered repo are each refused with their code and nothing is touched', () => {
	const before = [snapshot(repo), snapshot(other)];
	const file = join(repo, 'a-file.txt'); writeFileSync(file, 'x');
	const cases: Array<[unknown, string]> = [
		[{ artifactPath: join(repo, 'a.json') }, 'repo-missing'],
		[{ repo: '', artifactPath: join(repo, 'a.json') }, 'repo-missing'],
		[{ repo: 5 }, 'repo-missing'],
		[{ repo: 'relative/repo' }, 'repo-not-absolute'],
		[{ repo: file }, 'repo-not-directory'],
		[{ repo: join(repo, 'does-not-exist') }, 'repo-not-directory'],
		[{ repo: other }, 'repo-not-registered'],
		[undefined, 'repo-missing'],
	];
	for (const [params, code] of cases) {
		const r = requireRepoForCall('workflow.approve', params, registered);
		assert.equal(r.ok, false, JSON.stringify(params));
		if (!r.ok) { assert.equal(r.code, code, JSON.stringify(params)); assert.match(r.message, /workflow\.approve/); }
	}
	// the other repo-param name of the table (repoPath) is checked the same way
	assert.equal((requireRepoForCall('team.claim', {}, registered) as { code: string }).code, 'repo-missing');
	assert.deepEqual([snapshot(repo).filter(f => f !== 'a-file.txt'), snapshot(other)], before, 'the gate touches nothing');
});

test('repo-call-gate.test.ts: a relative path is joined to the repo, and a path with .., an absolute path elsewhere and a symlink that leaves the repo are refused', () => {
	const ok = requireRepoForCall('workflow.approve', { repo, artifactPath: '.insrc/artifacts/X.json' }, registered);
	assert.equal(ok.ok, true);
	if (ok.ok) { assert.equal(ok.params['artifactPath'], join(repo, '.insrc', 'artifacts', 'X.json')); assert.equal(ok.repo, repo); }
	const abs = requireRepoForCall('workflow.approve', { repo, artifactPath: join(repo, 'docs', 'a.md') }, registered);
	assert.equal(abs.ok && abs.params['artifactPath'], join(repo, 'docs', 'a.md'));
	// a trailing slash on the repo is the same repository
	assert.equal(requireRepoForCall('workflow.approve', { repo: `${repo}/`, artifactPath: 'a.json' }, registered).ok, true);
	for (const bad of ['../outside.json', 'a/../../outside.json', join(other, 'x.json'), '/etc/passwd']) {
		const r = requireRepoForCall('workflow.approve', { repo, artifactPath: bad }, registered);
		assert.equal(r.ok, false, bad);
		if (!r.ok) assert.equal(r.code, 'path-outside-repo', bad);
	}
	// a symlink inside the repo that points outside it
	mkdirSync(join(other, 'real'), { recursive: true });
	symlinkSync(join(other, 'real'), join(repo, 'link'));
	const viaLink = requireRepoForCall('workflow.approve', { repo, artifactPath: 'link/x.json' }, registered);
	assert.equal(viaLink.ok, false);
	if (!viaLink.ok) assert.equal(viaLink.code, 'path-outside-repo');
	// an array of paths: one bad entry refuses the call
	const many = requireRepoForCall('artifact.feedback.append', { repo, artifactPath: ['ok.json', '../bad.json'] }, registered);
	assert.equal(many.ok, false);
});

test("repo-call-gate.test.ts: the gate never reads the daemon's INSRC_REPO or working directory, a run-token phase takes the recorded repo and a registry failure refuses", async () => {
	const savedEnv = process.env['INSRC_REPO']; const savedCwd = process.cwd();
	try {
		process.env['INSRC_REPO'] = repo; process.chdir(repo);
		// the daemon's own repo and cwd are a registered repository, yet a call without a repo is refused
		const none = requireRepoForCall('workflow.approve', { artifactPath: '.insrc/artifacts/X.json' }, registered);
		assert.equal(none.ok === false && none.code, 'repo-missing');
		assert.equal(existsSync(join(repo, '.insrc')), false, 'nothing was created in the cwd repository');
		// a relative path is joined to the named repo, not to the cwd
		process.chdir(other);
		const joined = requireRepoForCall('workflow.approve', { repo, artifactPath: 'a.json' }, registered);
		assert.equal(joined.ok && joined.params['artifactPath'], join(repo, 'a.json'));
	} finally {
		process.chdir(savedCwd);
		if (savedEnv === undefined) delete process.env['INSRC_REPO']; else process.env['INSRC_REPO'] = savedEnv;
	}
	// a run-token phase takes the recorded repo; a rule without the flag does not
	const later = requireRepoForCall('workflow-step.plan', { state: 'tok' }, registered, { runTokenRepo: repo });
	assert.equal(later.ok && later.repo, repo);
	assert.equal(requireRepoForCall('workflow-step.plan', { state: 'tok' }, registered).ok, false, 'a token that records no repo is refused');
	assert.equal(requireRepoForCall('workflow.approve', { artifactPath: 'a.json' }, registered, { runTokenRepo: repo }).ok, false, 'only a run-token phase may use the token');
	// the token's repo is still checked against the registry
	const unreg = requireRepoForCall('workflow-step.plan', { state: 'tok' }, registered, { runTokenRepo: other });
	assert.equal(unreg.ok === false && unreg.code, 'repo-not-registered');
	// a call whose own repo differs from the token's is checked on its own repo
	assert.equal(requireRepoForCall('workflow-step.plan', { state: 'tok', repo: other }, registered, { runTokenRepo: repo }).ok, false);
	// a registry that cannot be read refuses the call
	const failed = await gateRepoCall('workflow.approve', { repo }, async () => { throw new Error('registry offline'); });
	assert.equal(failed.ok === false && failed.code, 'repo-not-registered');
	assert.match(failed.ok ? '' : failed.message, /registry offline/);
	assert.equal((await gateRepoCall('workflow.approve', { repo }, async () => registered)).ok, true);
});
