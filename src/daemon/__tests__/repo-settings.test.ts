/**
 * Story E20261016315d510c:S003 / t5 — repo.settings.get, repo.settings.set and
 * repo.trackerConfig.ensure. The handlers run over temp files and fakes; the
 * socket test serves them through the same connection handling the daemon uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRepoSettingsHandlers, mapSignin } from '../repo-settings.js';
import type { RepoSettingsDeps, RepoSettingsPayload, SettingsResult } from '../repo-settings.js';
import { IpcServer, directDispatch } from '../server.js';
import { rpc } from '../../shared/ipc-client.js';
import { _setTrackerExecForTests } from '../../workflow/tracker/github.js';
import type { PortResult } from '../../workflow/tracker/port.js';
import type { PolicyResult, TeamPolicy } from '../../workflow/team/types.js';

const REPO = '/work/repo';

const POLICY: TeamPolicy = {
	teamMode: true, signoffStages: ['DEF', 'HLD'], claimsEnforced: true, administrators: ['ada'],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] },
	forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-10-17T00:00:00.000Z', firstCommit: 'abc', firstCommitTime: 't', anchorKnown: true },
};

interface Fixture {
	readonly dir: string;
	readonly path: string;
	readonly whoCalls: string[];
	readonly handlers: ReturnType<typeof createRepoSettingsHandlers>;
	call(method: string, params: unknown): Promise<any>;
	cleanup(): void;
}

function fixture(over: Partial<RepoSettingsDeps> & { repos?: string[]; file?: string; who?: () => PortResult<string> } = {}): Fixture {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-repo-settings-'));
	const path = join(dir, 'github.json');
	if (over.file !== undefined) writeFileSync(path, over.file);
	const whoCalls: string[] = [];
	const handlers = createRepoSettingsHandlers({
		registeredRepos: async () => over.repos ?? [REPO],
		configPath: () => path,
		readPolicy: over.readPolicy ?? ((): PolicyResult<TeamPolicy | 'none'> => ({ ok: true, value: 'none' })),
		makeTracker: over.makeTracker ?? ((owner, repo) => ({
			whoAmI: () => { whoCalls.push(`${owner}/${repo}`); return (over.who ?? (() => ({ ok: true, value: 'octocat' })))(); },
		})),
		...(over.writeKeys !== undefined ? { writeKeys: over.writeKeys } : {}),
	});
	return {
		dir, path, whoCalls, handlers,
		call: async (method, params) => await handlers[method]!(params),
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const ENTRY = (extra: Record<string, unknown> = {}): string =>
	JSON.stringify({ default: { type: 'github', ghHost: 'default.example', owner: 'dflt', repo: 'dflt' }, repos: { [REPO]: { type: 'github', owner: 'acme', repo: 'widgets', ...extra } } });

const payloadOf = (r: SettingsResult): RepoSettingsPayload => { assert.ok(r.ok, JSON.stringify(r)); return r.payload; };

test('buildRepoSettings values, resolved target and policy rows', async () => {
	const f = fixture({ file: ENTRY({ ghHost: 'ghe.example' }), readPolicy: () => ({ ok: true, value: POLICY }) });
	try {
		const p = payloadOf(await f.call('repo.settings.get', { repo: REPO }));
		assert.equal(p.repo, REPO);
		// Only the repo's own keys; the default entry's ghHost, owner and repo are not shown as values.
		assert.deepEqual(p.values, { type: 'github', owner: 'acme', repo: 'widgets', ghHost: 'ghe.example' });
		assert.deepEqual(p.resolved, { type: 'github', owner: 'acme', repo: 'widgets', source: 'per-repo-config' });
		assert.deepEqual(p.signin, { state: 'signed-in', login: 'octocat' });
		assert.deepEqual(p.policy, {
			ok: true, mode: 'team',
			values: {
				teamMode: true, signoffStages: ['DEF', 'HLD'], claimsEnforced: true, administrators: ['ada'],
				claimUnits: POLICY.claimUnits, forceTaskIssues: true,
			},
			source: { ref: 'origin/main', fetchedAt: '2026-10-17T00:00:00.000Z' },
		});
	} finally { f.cleanup(); }

	const none = fixture({ file: ENTRY(), readPolicy: () => ({ ok: true, value: 'none' }) });
	try { assert.deepEqual(payloadOf(await none.call('repo.settings.get', { repo: REPO })).policy, { ok: true, mode: 'none' }); } finally { none.cleanup(); }

	const bad = fixture({ file: ENTRY(), readPolicy: () => ({ ok: false, reason: 'no default branch known' }) });
	try { assert.deepEqual(payloadOf(await bad.call('repo.settings.get', { repo: REPO })).policy, { ok: false, reason: 'no default branch known' }); } finally { bad.cleanup(); }

	// A policy that cannot be read, even by throwing, does not fail the call.
	const boom = fixture({ file: ENTRY(), readPolicy: () => { throw new Error('git exploded'); } });
	try {
		const p = payloadOf(await boom.call('repo.settings.get', { repo: REPO }));
		assert.deepEqual(p.policy, { ok: false, reason: 'git exploded' });
	} finally { boom.cleanup(); }

	// A repo with type none is disabled, with no gh call; github enabled but no target says why.
	const off = fixture({ file: JSON.stringify({ repos: { [REPO]: { type: 'none' } } }) });
	try {
		const p = payloadOf(await off.call('repo.settings.get', { repo: REPO }));
		assert.deepEqual(p.resolved, { type: 'none', source: 'per-repo-config' });
		assert.equal(p.signin.state, 'disabled');
		assert.equal(off.whoCalls.length, 0);
	} finally { off.cleanup(); }
});

test('sign-in mapping for every whoAmI outcome', () => {
	assert.deepEqual(mapSignin(() => ({ ok: true, value: 'octocat' })), { state: 'signed-in', login: 'octocat' });
	assert.equal(mapSignin(() => ({ ok: true, value: '' })).state, 'missing-signin');
	for (const kind of ['missing-tool', 'missing-signin', 'unreachable', 'rejected'] as const) {
		assert.deepEqual(mapSignin(() => ({ ok: false, kind, reason: `r-${kind}` })), { state: kind, reason: `r-${kind}` });
	}
	assert.deepEqual(mapSignin(() => { throw new Error('spawn failed'); }), { state: 'rejected', reason: 'spawn failed' });
});

test('repo identity uses the exact registered path', async () => {
	const base = mkdtempSync(join(tmpdir(), 'insrc-repo-identity-'));
	try {
		const real = join(base, 'real');
		const link = join(base, 'link');
		mkdirSync(real);
		symlinkSync(real, link);
		const cfg = join(base, 'github.json');
		const make = (repos: string[]) => createRepoSettingsHandlers({
			registeredRepos: async () => repos, configPath: () => cfg,
			readPolicy: () => ({ ok: true, value: 'none' }), makeTracker: () => ({ whoAmI: () => ({ ok: true, value: 'u' }) }),
		});

		// The symlink path is not itself registered: refused on get, set and ensure, and nothing is written.
		const onlyReal = make([real]);
		for (const [method, params] of [
			['repo.settings.get', { repo: link }],
			['repo.settings.set', { repo: link, key: 'ghHost', value: 'x' }],
			['repo.trackerConfig.ensure', { repo: link, owner: 'o', name: 'r' }],
			['repo.settings.get', { repo: real + '/' }],
			['repo.settings.get', { repo: 5 }],
			['repo.settings.get', null],
		] as const) {
			const r = await onlyReal[method]!(params) as { ok: boolean; error?: { code: string } };
			assert.equal(r.ok, false);
			assert.equal(r.error?.code, 'repo-not-registered', `${method} ${JSON.stringify(params)}`);
		}
		assert.throws(() => readFileSync(cfg), /ENOENT/);

		// Both registered: separate entries.
		const both = make([real, link]);
		await both['repo.settings.set']!({ repo: real, key: 'ghHost', value: 'one.example' });
		await both['repo.settings.set']!({ repo: link, key: 'ghHost', value: 'two.example' });
		const stored = JSON.parse(readFileSync(cfg, 'utf8')) as { repos: Record<string, { ghHost: string }> };
		assert.equal(stored.repos[real]?.ghHost, 'one.example');
		assert.equal(stored.repos[link]?.ghHost, 'two.example');
	} finally { rmSync(base, { recursive: true, force: true }); }
});

test('get returns what set wrote and shows an outside write', async () => {
	const f = fixture();
	try {
		const set = payloadOf(await f.call('repo.settings.set', { repo: REPO, key: 'ghHost', value: 'ghe.example' }));
		assert.equal(set.values['ghHost'], 'ghe.example');
		assert.equal(payloadOf(await f.call('repo.settings.get', { repo: REPO })).values['ghHost'], 'ghe.example');

		await f.call('repo.settings.set', { repo: REPO, key: 'branchPattern', value: 'feature/{type}/{id}-{slug}' });
		const afterTwo = payloadOf(await f.call('repo.settings.get', { repo: REPO }));
		assert.deepEqual(afterTwo.values, { ghHost: 'ghe.example', branchPattern: 'feature/{type}/{id}-{slug}' });

		// A write made outside the daemon shows on the next get.
		writeFileSync(f.path, JSON.stringify({ repos: { [REPO]: { ghHost: 'edited.example', owner: 'by', repo: 'hand', type: 'github' } } }));
		const outside = payloadOf(await f.call('repo.settings.get', { repo: REPO }));
		assert.equal(outside.values['ghHost'], 'edited.example');
		assert.deepEqual(outside.resolved, { type: 'github', owner: 'by', repo: 'hand', source: 'per-repo-config' });

		// null clears a key and the default entry and other repos survive.
		writeFileSync(f.path, JSON.stringify({ default: { type: 'none' }, repos: { [REPO]: { ghHost: 'h', owner: 'o', repo: 'r' }, '/other': { owner: 'x' } } }));
		await f.call('repo.settings.set', { repo: REPO, key: 'ghHost', value: null });
		const kept = JSON.parse(readFileSync(f.path, 'utf8')) as Record<string, any>;
		assert.deepEqual(kept['repos'][REPO], { owner: 'o', repo: 'r' });
		assert.deepEqual(kept['repos']['/other'], { owner: 'x' });
		assert.deepEqual(kept['default'], { type: 'none' });
	} finally { f.cleanup(); }
});

test('set refuses read-only, unknown, invalid and unregistered inputs and writes nothing', async () => {
	const f = fixture({ file: ENTRY() });
	try {
		const before = readFileSync(f.path, 'utf8');
		const cases: Array<[unknown, string]> = [
			[{ repo: REPO, key: 'signin', value: 'x' }, 'read-only-key'],
			[{ repo: REPO, key: 'target', value: 'x' }, 'read-only-key'],
			[{ repo: REPO, key: 'teamMode', value: true }, 'read-only-key'],
			[{ repo: REPO, key: 'claimUnits', value: 'x' }, 'read-only-key'],
			[{ repo: REPO, key: 'nope', value: 'x' }, 'unknown-key'],
			[{ repo: REPO, key: 5, value: 'x' }, 'unknown-key'],
			[{ repo: REPO, key: 'type', value: 'gitlab' }, 'invalid-value'],
			[{ repo: REPO, key: 'owner', value: 'bad owner' }, 'invalid-value'],
			[{ repo: REPO, key: 'owner', value: 'acme\n' }, 'invalid-value'],
			[{ repo: REPO, key: 'owner', value: 'acme\r' }, 'invalid-value'],
			[{ repo: REPO, key: 'repo', value: 'widgets\n' }, 'invalid-value'],
			[{ repo: REPO, key: 'repo', value: '..' }, 'invalid-value'],
			[{ repo: REPO, key: 'ghHost', value: 'a\nb' }, 'invalid-value'],
			[{ repo: REPO, key: 'ghPath', value: true }, 'invalid-value'],
			[{ repo: REPO, key: 'branchPattern', value: '{user}/x' }, 'invalid-value'],
			[{ repo: REPO, key: 'branchPattern', value: '/x' }, 'invalid-value'],
			[{ repo: '/not/registered', key: 'ghHost', value: 'h' }, 'repo-not-registered'],
		];
		for (const [params, code] of cases) {
			const r = await f.call('repo.settings.set', params);
			assert.equal(r.ok, false, JSON.stringify(params));
			assert.equal(r.error.code, code, JSON.stringify(params));
			assert.ok(r.error.message.length > 0);
		}
		assert.equal(readFileSync(f.path, 'utf8'), before, 'nothing was written');
		assert.equal(f.whoCalls.length, 0, 'a refused set never reaches the tracker');

		// ensure refuses an unregistered repo and invalid names, and writes nothing.
		for (const params of [
			{ repo: '/not/registered', owner: 'o', name: 'r' },
			{ repo: REPO, owner: 'bad owner', name: 'r' },
			{ repo: REPO, owner: 'o', name: 'a/b' },
			{ repo: REPO, owner: 5, name: 'r' },
			{ repo: REPO, owner: 'acme\n', name: 'r' },
			{ repo: REPO, owner: 'acme', name: 'widgets\n' },
		]) {
			const r = await f.call('repo.trackerConfig.ensure', params);
			assert.equal(r.ok, false);
			assert.ok(['repo-not-registered', 'invalid-value'].includes(r.error.code));
		}
		assert.equal(readFileSync(f.path, 'utf8'), before);
	} finally { f.cleanup(); }
});

test('only the signed-in-user read runs through s1\'s adapter', async () => {
	const ran: string[] = [];
	const dir = mkdtempSync(join(tmpdir(), 'insrc-repo-gh-'));
	const path = join(dir, 'github.json');
	_setTrackerExecForTests((cmd, args) => {
		ran.push([cmd, ...args].join(' '));
		return cmd === 'gh' ? 'octocat\n' : '';
	});
	try {
		const handlers = createRepoSettingsHandlers({
			registeredRepos: async () => [REPO], configPath: () => path, readPolicy: () => ({ ok: true, value: 'none' }),
		});
		writeFileSync(path, ENTRY());
		const p = payloadOf(await handlers['repo.settings.get']!({ repo: REPO }) as SettingsResult);
		assert.deepEqual(p.signin, { state: 'signed-in', login: 'octocat' });
		const gh = ran.filter(c => c.startsWith('gh '));
		assert.equal(gh.length, 1, ran.join(' | '));
		assert.match(gh[0]!, /^gh api user/);
		assert.ok(!gh.some(c => /issue|label|milestone|--method|-X|edit|create/.test(c)), 'no change call');

		// Type none: no gh command at all.
		ran.length = 0;
		writeFileSync(path, JSON.stringify({ repos: { [REPO]: { type: 'none' } } }));
		await handlers['repo.settings.get']!({ repo: REPO });
		assert.equal(ran.filter(c => c.startsWith('gh ')).length, 0);

		// A set of a local value reads sign-in once more but changes no tracker state.
		ran.length = 0;
		writeFileSync(path, ENTRY());
		await handlers['repo.settings.set']!({ repo: REPO, key: 'ghHost', value: 'h.example' });
		const afterSet = ran.filter(c => c.startsWith('gh '));
		assert.equal(afterSet.length, 1);
		assert.match(afterSet[0]!, /^gh api user/);
	} finally { _setTrackerExecForTests(); rmSync(dir, { recursive: true, force: true }); }
});

test('malformed files return github-json-unreadable and keep their bytes', async () => {
	const files: Array<[string, string]> = [
		['null own entry with a complete default', JSON.stringify({ default: { type: 'github', owner: 'd', repo: 'd' }, repos: { [REPO]: null } })],
		['null default', '{"default":null}'],
		['null repos', '{"repos":null}'],
		['primitive top level', '3'],
		['invalid JSON', '{nope'],
	];
	for (const [label, content] of files) {
		const f = fixture({ file: content });
		try {
			const get = await f.call('repo.settings.get', { repo: REPO });
			assert.equal(get.ok, false, label);
			assert.equal(get.error.code, 'github-json-unreadable', label);
			const set = await f.call('repo.settings.set', { repo: REPO, key: 'ghHost', value: 'h' });
			assert.equal(set.error.code, 'github-json-unreadable', label);
			const ensure = await f.call('repo.trackerConfig.ensure', { repo: REPO, owner: 'o', name: 'r' });
			assert.equal(ensure.error.code, 'github-json-unreadable', label);
			assert.equal(readFileSync(f.path, 'utf8'), content, `${label}: bytes untouched`);
			assert.equal(f.whoCalls.length, 0, `${label}: no tracker call`);
		} finally { f.cleanup(); }
	}

	// A file that cannot be written reports write-failed with the operating-system message.
	if (typeof process.getuid === 'function' && process.getuid() !== 0) {
		const f = fixture({ file: ENTRY() });
		try {
			chmodSync(f.dir, 0o500);
			const r = await f.call('repo.settings.set', { repo: REPO, key: 'ghHost', value: 'h' });
			assert.equal(r.ok, false);
			assert.equal(r.error.code, 'write-failed');
			assert.match(r.error.message, /EACCES/);
		} finally { chmodSync(f.dir, 0o700); f.cleanup(); }
	}
});

test('get reads once, never writes, and resolves from the git remote when there is no own target', async () => {
	// One read: the file is rewritten after the read (inside the sign-in and policy steps) and the payload still describes the version read.
	let f!: Fixture;
	const rewrite = (): void => writeFileSync(f.path, JSON.stringify({ repos: { [REPO]: { ghHost: 'second.example' } } }));
	f = fixture({
		file: ENTRY({ ghHost: 'first.example' }),
		makeTracker: () => ({ whoAmI: () => { rewrite(); return { ok: true, value: 'u' }; } }),
	});
	try {
		const p = payloadOf(await f.call('repo.settings.get', { repo: REPO }));
		assert.equal(p.values['ghHost'], 'first.example');
		assert.deepEqual(p.resolved, { type: 'github', owner: 'acme', repo: 'widgets', source: 'per-repo-config' });
	} finally { f.cleanup(); }

	// Never writes: bytes and mtime are unchanged, and no temp file appears.
	const g = fixture({ file: ENTRY() });
	try {
		const before = readFileSync(g.path, 'utf8');
		const mtime = statSync(g.path).mtimeMs;
		await g.call('repo.settings.get', { repo: REPO });
		await g.call('repo.settings.get', { repo: REPO });
		assert.equal(readFileSync(g.path, 'utf8'), before);
		assert.equal(statSync(g.path).mtimeMs, mtime);
	} finally { g.cleanup(); }

	// No own target: the target is the git remote; the default entry's owner and repo are never reported.
	const repoDir = mkdtempSync(join(tmpdir(), 'insrc-repo-remote-'));
	try {
		execFileSync('git', ['init', '-q', repoDir]);
		execFileSync('git', ['-C', repoDir, 'remote', 'add', 'origin', 'https://github.com/acme/widgets.git']);
		const h = fixture({
			repos: [repoDir],
			file: JSON.stringify({ default: { type: 'github', owner: 'dflt', repo: 'dflt' } }),
		});
		try {
			const p = payloadOf(await h.call('repo.settings.get', { repo: repoDir }));
			assert.deepEqual(p.resolved, { type: 'github', owner: 'acme', repo: 'widgets', source: 'git-remote' });
			assert.deepEqual(p.values, {});
			assert.deepEqual(h.whoCalls, ['acme/widgets']);
		} finally { h.cleanup(); }

		// Enabled but no target resolvable: the reason is shown and sign-in is still read once (it does not depend on the target).
		const noRemote = mkdtempSync(join(tmpdir(), 'insrc-repo-noremote-'));
		try {
			execFileSync('git', ['init', '-q', noRemote]);
			const k = fixture({ repos: [noRemote], file: JSON.stringify({ repos: { [noRemote]: { type: 'github' } } }) });
			try {
				const p = payloadOf(await k.call('repo.settings.get', { repo: noRemote }));
				assert.equal(p.resolved.type, 'github');
				assert.ok((p.resolved.error ?? '').length > 0);
				assert.deepEqual(p.signin, { state: 'signed-in', login: 'octocat' });
				assert.equal(k.whoCalls.length, 1);
			} finally { k.cleanup(); }
		} finally { rmSync(noRemote, { recursive: true, force: true }); }
	} finally { rmSync(repoDir, { recursive: true, force: true }); }
});

test('ensure writes the five keys once and concurrent sets both land', async () => {
	let writes = 0;
	const dir = mkdtempSync(join(tmpdir(), 'insrc-repo-ensure-'));
	const path = join(dir, 'github.json');
	try {
		const { writeRepoEntryKeys } = await import('../../workflow/config/github-store.js');
		const handlers = createRepoSettingsHandlers({
			registeredRepos: async () => [REPO], configPath: () => path,
			readPolicy: () => ({ ok: true, value: 'none' }),
			makeTracker: () => ({ whoAmI: () => ({ ok: true, value: 'u' }) }),
			writeKeys: async (r, patch, cfg) => { writes++; return await writeRepoEntryKeys(r, patch, cfg); },
		});

		assert.deepEqual(await handlers['repo.trackerConfig.ensure']!({ repo: REPO, owner: 'acme', name: 'widgets' }), { ok: true, changed: true });
		assert.equal(writes, 1, 'one write for the five keys');
		const stored = JSON.parse(readFileSync(path, 'utf8')) as { repos: Record<string, unknown> };
		assert.deepEqual(stored.repos[REPO], { type: 'github', owner: 'acme', repo: 'widgets', pushTasks: true, commitArtifacts: true });

		// Already complete: nothing changes.
		const mtime = statSync(path).mtimeMs;
		assert.deepEqual(await handlers['repo.trackerConfig.ensure']!({ repo: REPO, owner: 'acme', name: 'widgets' }), { ok: true, changed: false });
		assert.equal(statSync(path).mtimeMs, mtime);

		// Two clients set different keys at the same time through the daemon socket: both land.
		const ipc = new IpcServer(directDispatch(handlers));
		const sockDir = mkdtempSync(join(tmpdir(), 'insrc-repo-sock-'));
		const sock = join(sockDir, 'd.sock');
		const server = createServer((s: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
		await new Promise<void>(r => server.listen(sock, () => r()));
		try {
			const call = (method: string, params: unknown) => rpc<any>(method, params, () => createConnection(sock));
			const [a, b, c] = await Promise.all([
				call('repo.settings.set', { repo: REPO, key: 'ghHost', value: 'a.example' }),
				call('repo.settings.set', { repo: REPO, key: 'ghPath', value: '/opt/gh' }),
				call('repo.settings.set', { repo: REPO, key: 'branchPattern', value: '{id}-{slug}' }),
			]);
			assert.ok(a.ok && b.ok && c.ok, JSON.stringify([a, b, c]));
			const final = await call('repo.settings.get', { repo: REPO });
			assert.deepEqual(final.payload.values, {
				type: 'github', owner: 'acme', repo: 'widgets', ghHost: 'a.example', ghPath: '/opt/gh', branchPattern: '{id}-{slug}',
			});
			const again = JSON.parse(readFileSync(path, 'utf8')) as { repos: Record<string, Record<string, unknown>> };
			assert.equal(again.repos[REPO]?.['pushTasks'], true, 'keys the settings do not touch are kept');
		} finally { await new Promise<void>(r => server.close(() => r())); rmSync(sockDir, { recursive: true, force: true }); }
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
