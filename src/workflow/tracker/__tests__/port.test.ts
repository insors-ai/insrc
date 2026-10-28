/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the tracker port types, the capability check and the strict
 * target resolver.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/port.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { missingCapabilities, type Capability, type CreatedIssue, type IssueOps, type IssueRef, type PortResult, type TrackerPort } from '../port.js';
import { resolveStrictTrackerTarget } from '../../config/github.js';
import { loadTracker } from '../github-adapter.js';
import { _setTrackerExecForTests } from './_legacy-table.js';

afterEach(() => { _setTrackerExecForTests(); delete process.env['INSRC_GITHUB_CONFIG']; });

const set = (...c: Capability[]): ReadonlySet<Capability> => new Set(c);

async function withConfigAsync<T>(content: string | object, fn: (configPath: string, dir: string) => T | Promise<T>): Promise<T> {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-strict-'));
	try {
		const p = join(dir, 'github.json');
		writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
		return await fn(p, dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function withConfig<T>(content: string | object, fn: (configPath: string, dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-strict-'));
	try {
		const p = join(dir, 'github.json');
		writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
		return fn(p, dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function refusal(r: PortResult<unknown>): string {
	assert.equal(r.ok, false);
	if (r.ok) throw new Error('unreachable');
	assert.equal(r.kind, 'rejected');
	return r.reason;
}

test('missingCapabilities names every capability the tracker does not declare', async () => {
	assert.deepEqual(missingCapabilities(set('claim', 'issue-create'), set('claim', 'issue-create')), []);
	assert.deepEqual(missingCapabilities(set('claim', 'issue-create'), set('claim', 'signoff-request', 'completion')), ['signoff-request', 'completion']);
	assert.deepEqual(missingCapabilities(set(), set('claim', 'issue-create', 'signoff-request', 'completion')), ['claim', 'issue-create', 'signoff-request', 'completion']);
	assert.deepEqual(missingCapabilities(set('claim'), set()), []);
});

test('strict resolver refuses malformed or unsupported configuration', async () => {
	const repo = '/r';
	assert.match(refusal(resolveStrictTrackerTarget(repo, '/does/not/exist.json')), /does not exist/);
	assert.match(refusal(withConfig('{ not json', p => resolveStrictTrackerTarget(repo, p))), /not valid JSON/);
	assert.match(refusal(withConfig('[]', p => resolveStrictTrackerTarget(repo, p))), /JSON object/);
	assert.match(refusal(withConfig('"x"', p => resolveStrictTrackerTarget(repo, p))), /JSON object/);
	assert.match(refusal(withConfig({ repos: { [repo]: 'github' } }, p => resolveStrictTrackerTarget(repo, p))), /must be a JSON object/);
	assert.match(refusal(withConfig({ repos: { [repo]: { type: 'gitlab', owner: 'a', repo: 'b' } } }, p => resolveStrictTrackerTarget(repo, p))), /unsupported tracker type 'gitlab'/);
	assert.match(refusal(withConfig({ repos: { [repo]: { type: 'none' } } }, p => resolveStrictTrackerTarget(repo, p))), /type none/);
	assert.match(refusal(withConfig({ repos: { [repo]: { owner: 'bad owner', repo: 'b' } } }, p => resolveStrictTrackerTarget(repo, p))), /invalid GitHub owner/);
	assert.match(refusal(withConfig({ repos: { [repo]: { owner: 'a', repo: 'b/c' } } }, p => resolveStrictTrackerTarget(repo, p))), /invalid GitHub repo/);
	assert.match(refusal(withConfig({ repos: { [repo]: { owner: 5, repo: 'b' } } }, p => resolveStrictTrackerTarget(repo, p))), /invalid GitHub owner/);
	// A malformed own target is refused even where the origin remote would resolve.
	const withOrigin = mkdtempSync(join(tmpdir(), 'insrc-badown-'));
	try {
		execFileSync('git', ['init'], { cwd: withOrigin, stdio: 'ignore' });
		execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/fine.git'], { cwd: withOrigin, stdio: 'ignore' });
		for (const entry of [{ type: 'github', owner: 'bad owner' }, { type: 'github', owner: '', repo: 'b/c' }, { type: 'github', repo: 'only-repo' }, { type: 'github', owner: 'only-owner' }]) {
			assert.match(refusal(withConfig({ repos: { [withOrigin]: entry } }, p => resolveStrictTrackerTarget(withOrigin, p))), /invalid GitHub (owner|repo)/, JSON.stringify(entry));
		}
	} finally {
		rmSync(withOrigin, { recursive: true, force: true });
	}
	assert.match(refusal(withConfig({ default: { type: 'none' } }, p => resolveStrictTrackerTarget(repo, p))), /type none/);
	assert.match(refusal(withConfig({}, p => resolveStrictTrackerTarget(repo, p))), /no tracker is configured/);
	// type github with no target and no origin remote
	const noRemote = mkdtempSync(join(tmpdir(), 'insrc-noremote-'));
	try {
		execFileSync('git', ['init'], { cwd: noRemote, stdio: 'ignore' });
		assert.match(refusal(withConfig({ repos: { [noRemote]: { type: 'github' } } }, p => resolveStrictTrackerTarget(noRemote, p))), /origin remote/);
	} finally {
		rmSync(noRemote, { recursive: true, force: true });
	}
});

test('strict resolver accepts an own entry without a type and falls back to the origin remote for type github', async () => {
	const own = withConfig({ repos: { '/r': { owner: 'acme', repo: 'demo.app' } } }, p => resolveStrictTrackerTarget('/r', p));
	assert.deepEqual(own, { ok: true, value: { owner: 'acme', repo: 'demo.app' } });

	const repo = mkdtempSync(join(tmpdir(), 'insrc-origin-'));
	try {
		execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
		execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/from-remote.git'], { cwd: repo, stdio: 'ignore' });
		const viaOwn = withConfig({ repos: { [repo]: { type: 'github' } } }, p => resolveStrictTrackerTarget(repo, p));
		assert.deepEqual(viaOwn, { ok: true, value: { owner: 'acme', repo: 'from-remote' } });
		const viaDefault = withConfig({ default: { type: 'github' } }, p => resolveStrictTrackerTarget(repo, p));
		assert.deepEqual(viaDefault, { ok: true, value: { owner: 'acme', repo: 'from-remote' } });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test("strict resolver never takes a target from the default entry's owner and repo", async () => {
	// A default with owner/repo but no type enables nothing.
	assert.match(refusal(withConfig({ default: { owner: 'global', repo: 'dump' } }, p => resolveStrictTrackerTarget('/r', p))), /no tracker is configured/);
	// A github default supplies enablement only: the target is the origin remote, never its owner/repo.
	const repo = mkdtempSync(join(tmpdir(), 'insrc-default-'));
	try {
		execFileSync('git', ['init'], { cwd: repo, stdio: 'ignore' });
		execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:real/own.git'], { cwd: repo, stdio: 'ignore' });
		const r = withConfig({ default: { type: 'github', owner: 'global', repo: 'dump' } }, p => resolveStrictTrackerTarget(repo, p));
		assert.deepEqual(r, { ok: true, value: { owner: 'real', repo: 'own' } });
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

/** tsc excludes __tests__, so the signature fixture is typechecked here, with the project's compiler options. */
function typeErrors(file: string): string[] {
	const cfgPath = join(process.cwd(), 'tsconfig.json');
	const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, process.cwd());
	const program = ts.createProgram([file], { ...parsed.options, noEmit: true });
	return ts.getPreEmitDiagnostics(program)
		.filter(d => d.file?.fileName === file)
		.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

test('TrackerPort type exposes issueOps with the AMD-8 signatures', async () => {
	const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'issue-ops-signatures.ts');
	assert.deepEqual(typeErrors(fixture), []);
	// A fixture that breaks a signature (string child id) must be reported, so the check bites.
	const broken = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'issue-ops-signatures-broken.ts');
	assert.ok(typeErrors(broken).length > 0, 'the broken fixture should fail to typecheck');
});

test('the signature fixture compiles with resolveIssueId and its broken twin does not', async () => {
	const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
	assert.match(readFileSync(join(dir, 'issue-ops-signatures.ts'), 'utf8'), /resolveIssueId:/, 'the fixture declares resolveIssueId');
	assert.deepEqual(typeErrors(join(dir, 'issue-ops-signatures.ts')), []);
	assert.ok(typeErrors(join(dir, 'issue-ops-signatures-broken.ts')).some(e => /resolveIssueId|PortResult<string>|number/.test(e)), 'a resolveIssueId that does not return a number is reported');
});

// ---------------------------------------------------------------------------
// loadTracker
// ---------------------------------------------------------------------------

/** Run `fn` with a github.json that targets acme/demo for repo '/r' and a fake gh. */
async function withLoader<T>(exec: (args: readonly string[]) => string, fn: (calls: string[][]) => T | Promise<T>): Promise<T> {
	return await withConfigAsync({ repos: { '/r': { owner: 'acme', repo: 'demo' } } }, async configPath => {
		process.env['INSRC_GITHUB_CONFIG'] = configPath;
		const calls: string[][] = [];
		_setTrackerExecForTests((_cmd, args) => { calls.push([...args]); return exec(args); });
		return fn(calls);
	});
}

function execError(props: Record<string, unknown>): Error {
	return Object.assign(new Error('Command failed'), props);
}

test('loadTracker succeeds when every needed capability is declared', async () => {
	await withLoader(() => 'subhagho\n', async calls => {
		const r = await loadTracker('/r', set('claim', 'issue-create'));
		assert.equal(r.ok, true);
		if (r.ok) {
			assert.equal(r.value.kind, 'github');
			assert.deepEqual([...r.value.capabilities].sort(), ['claim', 'issue-create', 'signoff-request']);
		}
		assert.deepEqual(calls[0], ['api', 'user', '-q', '.login']);
	});
});

test('loadTracker with an empty needed set validates configuration and sign-in', async () => {
	process.env['INSRC_GITHUB_CONFIG'] = '/does/not/exist.json';   // never read the real ~/.insrc/github.json
	assert.match(refusal(await loadTracker('/r', set())), /does not exist/);
	await withLoader(() => { throw execError({ stderr: 'To get started with GitHub CLI, please run:  gh auth login' }); }, async () => {
		const r = await loadTracker('/r', set());
		assert.equal(r.ok, false);
		if (!r.ok) assert.equal(r.kind, 'missing-signin');
	});
	await withLoader(() => 'subhagho', async () => assert.equal((await loadTracker('/r', set())).ok, true));
});

test('loadTracker refuses a needed completion capability naming it, and accepts signoff-request', async () => {
	await withLoader(() => 'subhagho', async calls => {
		const reason = refusal(await loadTracker('/r', set('claim', 'signoff-request', 'completion')));
		assert.match(reason, /capability: completion/);
		assert.doesNotMatch(reason, /signoff-request/);
		assert.equal(calls.length, 0, 'no gh command runs for a capability refusal');
	});
});

test('loadTracker names gh as the missing tool', async () => {
	await withLoader(() => { throw execError({ code: 'ENOENT' }); }, async () => {
		const r = await loadTracker('/r', set('claim'));
		assert.equal(r.ok, false);
		if (!r.ok) {
			assert.equal(r.kind, 'missing-tool');
			assert.match(r.reason, /gh CLI is not installed/);
		}
	});
});

test('loadTracker names the missing sign-in', async () => {
	await withLoader(() => { throw execError({ stderr: 'You are not logged in to any GitHub hosts. Run gh auth login' }); }, async () => {
		const r = await loadTracker('/r', set('claim'));
		assert.equal(r.ok, false);
		if (!r.ok) {
			assert.equal(r.kind, 'missing-signin');
			assert.match(r.reason, /gh auth login/);
		}
	});
});
