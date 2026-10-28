/**
 * Story E20261016315d510c:S003 / t6 — planTrackerConfig and the configOutcome seam
 * of runTrackerSetup. Everything runs against temp files and a fake git/gh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setTrackerExecForTests } from './_legacy-table.js';
import { configAlreadyDetail, configWrittenDetail, planTrackerConfig, runTrackerSetup } from '../setup.js';

const REPO = '/fake/repo/path';

/** git reports an acme/demo origin (or none); gh is not authenticated, so the gh-based steps are skipped. */
function fakeExec(origin: boolean): void {
	_setTrackerExecForTests((cmd, args) => {
		const a = args.join(' ');
		if (cmd === 'git' && a.includes('remote get-url origin')) {
			if (!origin) throw new Error("error: No such remote 'origin'");
			return 'git@github.com:acme/demo.git';
		}
		if (cmd === 'gh' && a === 'auth status') throw new Error('gh not authenticated');
		return '';
	});
}

async function withDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-setup-plan-'));
	try { return await fn(dir); } finally { _setTrackerExecForTests(); rmSync(dir, { recursive: true, force: true }); }
}

const COMPLETE = { type: 'github', owner: 'acme', repo: 'demo', pushTasks: true, commitArtifacts: true };

test('planTrackerConfig already, needs-write and no-origin cases', async () => withDir(async dir => {
	fakeExec(true);
	const path = join(dir, 'github.json');

	// No file: needs-write with the owner and name from the origin remote.
	assert.deepEqual(await planTrackerConfig(REPO, path), { status: 'needs-write', owner: 'acme', name: 'demo' });

	// Own entry complete: already, with today's detail text.
	writeFileSync(path, JSON.stringify({ repos: { [REPO]: COMPLETE } }));
	assert.deepEqual(await planTrackerConfig(REPO, path), { status: 'already', detail: `${path} already targets acme/demo` });

	// A complete default counts when the repo has no entry of its own (as it always has).
	writeFileSync(path, JSON.stringify({ default: COMPLETE }));
	assert.equal((await planTrackerConfig(REPO, path)).status, 'already');

	// Incomplete: each missing piece needs a write.
	for (const entry of [
		{ ...COMPLETE, pushTasks: false },
		{ ...COMPLETE, commitArtifacts: undefined },
		{ ...COMPLETE, type: 'none' },
		{ ...COMPLETE, owner: '' },
		{ type: 'github' },
		{},
	]) {
		writeFileSync(path, JSON.stringify({ repos: { [REPO]: entry } }));
		assert.equal((await planTrackerConfig(REPO, path)).status, 'needs-write', JSON.stringify(entry));
	}
	// An incomplete own entry wins over a complete default.
	writeFileSync(path, JSON.stringify({ default: COMPLETE, repos: { [REPO]: { type: 'github' } } }));
	assert.equal((await planTrackerConfig(REPO, path)).status, 'needs-write');

	// No origin remote: failed with today's detail, even for a complete entry.
	fakeExec(false);
	assert.deepEqual(await planTrackerConfig(REPO, path), {
		status: 'failed',
		detail: 'could not determine owner/repo from `git remote get-url origin` — add a GitHub origin remote',
	});
	writeFileSync(path, JSON.stringify({ repos: { [REPO]: COMPLETE } }));
	assert.equal((await planTrackerConfig(REPO, path)).status, 'failed');

	assert.equal(configWrittenDetail('/p', 'o', 'n'), 'wrote /p for o/n (pushTasks + commitArtifacts on)');
	assert.equal(configAlreadyDetail('/p', 'o', 'n'), '/p already targets o/n');
}));

test('planTrackerConfig fails on malformed files without throwing, calling the daemon or writing', async () => withDir(async dir => {
	fakeExec(true);
	const path = join(dir, 'github.json');
	const bad: Array<[string, string, RegExp]> = [
		['null own entry with a complete default', JSON.stringify({ default: COMPLETE, repos: { [REPO]: null } }), /repos\["\/fake\/repo\/path"\]/],
		['null default', '{"default":null}', /"default"/],
		['array default', '{"default":[]}', /"default"/],
		['null repos', '{"repos":null}', /"repos"/],
		['array own entry', JSON.stringify({ repos: { [REPO]: [] } }), /repos\[/],
		['primitive own entry', JSON.stringify({ repos: { [REPO]: 4 } }), /repos\[/],
		['non-object top level', '5', /top level/],
		['null top level', 'null', /top level/],
		['invalid JSON', '{nope', /not valid JSON/],
	];
	for (const [label, content, re] of bad) {
		writeFileSync(path, content);
		let plan: ReturnType<typeof planTrackerConfig> | undefined;
		await assert.doesNotReject(async () => { plan = await planTrackerConfig(REPO, path); }, label);
		assert.equal(plan?.status, 'failed', label);
		assert.match((plan as { detail: string }).detail, re, label);
		assert.equal(readFileSync(path, 'utf8'), content, `${label}: file untouched`);
	}
	assert.deepEqual(readdirSync(dir), ['github.json'], 'no temp or extra file was written');
}));

test('runTrackerSetup reports a configOutcome verbatim and touches no file; existing behaviour without it', async () => withDir(async dir => {
	fakeExec(true);
	const path = join(dir, 'github.json');
	const prev = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = path;
	try {
		for (const outcome of [
			{ status: 'done', detail: 'wrote it' },
			{ status: 'already', detail: 'was there' },
			{ status: 'failed', detail: 'daemon owns the file' },
		] as const) {
			const report = await runTrackerSetup(REPO, { configOutcome: outcome });
			const config = report.steps.find(s => s.key === 'config');
			assert.deepEqual({ status: config?.status, detail: config?.detail }, outcome);
			assert.equal(existsSync(path), false, 'the file was neither read into existence nor written');
			// The other steps are unchanged: gh auth is not available, so the gh-based ones are skipped.
			assert.deepEqual(report.steps.map(s => s.key), ['gh-auth', 'oauth-scopes', 'config', 'labels', 'issue-types', 'project']);
		}

		// With a file present the seam still does not read or rewrite it.
		writeFileSync(path, '{broken');
		await runTrackerSetup(REPO, { configOutcome: { status: 'done', detail: 'x' } });
		assert.equal(readFileSync(path, 'utf8'), '{broken');
		rmSync(path);

		// Without the seam the config step behaves as before: it writes the entry in-process.
		const report = await runTrackerSetup(REPO);
		assert.equal(report.steps.find(s => s.key === 'config')?.status, 'done');
		const stored = JSON.parse(readFileSync(path, 'utf8')) as { repos: Record<string, unknown> };
		assert.deepEqual(stored.repos[REPO], COMPLETE);
		assert.equal((await runTrackerSetup(REPO)).steps.find(s => s.key === 'config')?.status, 'already');
	} finally {
		if (prev === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prev;
	}
}));
