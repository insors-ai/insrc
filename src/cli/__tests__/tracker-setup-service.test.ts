/**
 * Terminal tracker setup through the daemon (Story E20261016315d510c:S003 / t6, moved to the daemon method tracker.setup by Story s10).
 *
 * A real IpcServer connection handler serves the real tracker.setup handler (with the real repo.trackerConfig.ensure behind it) on a temp
 * socket; an early-closing daemon is a plain net server. git runs for real in a temp repo; gh is faked (not authenticated). The terminal
 * service is one daemon call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { trackerSetup } from '../services/workflow.js';
import { makeServices } from '../services/index.js';
import { IpcServer, directDispatch } from '../../daemon/server.js';
import { createRepoSettingsHandlers } from '../../daemon/repo-settings.js';
import { _setTrackerExecForTests } from '../../workflow/tracker/__tests__/_legacy-table.js';
import { githubConfigPath } from '../../workflow/config/github.js';
import { handleTrackerSetup } from '../../daemon/tracker-setup-handlers.js';
import type { TrackerSetupReport } from '../../workflow/tracker/setup.js';

const ALL_KEYS = ['gh-auth', 'oauth-scopes', 'config', 'labels', 'issue-types', 'project'];
const COMPLETE = { type: 'github', owner: 'acme', repo: 'widgets', pushTasks: true, commitArtifacts: true };

interface Env {
	readonly dir: string;
	readonly repo: string;
	readonly cfg: string;
	ensureCalls: number;
	cleanup(): void;
}

/** A temp repo with an acme/widgets origin, a github.json path in a temp dir, and a fake gh that is not signed in. */
function setup(): Env {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-tracker-svc-'));
	const repo = join(dir, 'repo');
	mkdirSync(repo);
	execFileSync('git', ['init', '-q', repo]);
	execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', 'https://github.com/acme/widgets.git']);
	const cfg = join(dir, 'github.json');
	const prev = process.env['INSRC_GITHUB_CONFIG'];
	process.env['INSRC_GITHUB_CONFIG'] = cfg;
	_setTrackerExecForTests((cmd, args, opts) => {
		if (cmd === 'git') return execFileSync(cmd, [...args], { ...opts, encoding: 'utf8' }) as string;
		if (args.join(' ') === 'auth status') throw new Error('gh not authenticated');
		return '';
	});
	const env: Env = {
		dir, repo, cfg, ensureCalls: 0,
		cleanup: () => {
			_setTrackerExecForTests();
			if (prev === undefined) delete process.env['INSRC_GITHUB_CONFIG']; else process.env['INSRC_GITHUB_CONFIG'] = prev;
			rmSync(dir, { recursive: true, force: true });
		},
	};
	return env;
}

/** The real tracker.setup handler behind a real connection handler on a temp socket; counts ensure calls. `registered` is the repos the daemon knows. */
async function daemon(env: Env, registered: string[] = [env.repo]): Promise<{ connect: () => Socket; close: () => Promise<void> }> {
	const handlers = createRepoSettingsHandlers({ registeredRepos: async () => registered, configPath: githubConfigPath });
	const ensure = handlers['repo.trackerConfig.ensure']!;
	const counting = async (p: unknown) => { env.ensureCalls++; return await ensure(p); };
	const ipc = new IpcServer(directDispatch({ 'tracker.setup': async (p) => await handleTrackerSetup(p, counting) }));
	const path = join(env.dir, `d${registered.length}.sock`);
	const server = createServer((s: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
	await new Promise<void>(r => server.listen(path, () => r()));
	return { connect: () => createConnection(path), close: () => new Promise<void>(r => server.close(() => r())) };
}

/** A daemon that accepts the connection and then misbehaves. */
async function fakeDaemon(env: Env, mode: 'early-close'): Promise<{ connect: () => Socket; connections: Socket[]; closed: () => number; close: () => Promise<void> }> {
	const connections: Socket[] = [];
	let closed = 0;
	const server: Server = createServer((s: Socket) => {
		connections.push(s);
		s.on('close', () => { closed++; });
		s.on('error', () => undefined);
		s.resume();
		s.once('data', () => s.destroy());
	});
	const path = join(env.dir, `${mode}.sock`);
	await new Promise<void>(r => server.listen(path, () => r()));
	return {
		connect: () => createConnection(path), connections, closed: () => closed,
		close: async () => { for (const c of connections) c.destroy(); await new Promise<void>(r => server.close(() => r())); },
	};
}

const stepOf = (r: TrackerSetupReport, key: string) => r.steps.find(s => s.key === key);

test('config step done, already and failed through the terminal service', async () => {
	const env = setup();
	const d = await daemon(env);
	try {
		// A running daemon writes the entry; the step reports done with today's detail text.
		const first = await trackerSetup(env.repo, {}, { connect: d.connect });
		assert.equal(stepOf(first, 'config')?.status, 'done');
		assert.equal(stepOf(first, 'config')?.detail, `wrote ${env.cfg} for acme/widgets (pushTasks + commitArtifacts on)`);
		assert.equal(env.ensureCalls, 1);
		const stored = JSON.parse(readFileSync(env.cfg, 'utf8')) as { repos: Record<string, unknown> };
		assert.deepEqual(stored.repos[env.repo], COMPLETE);

		// Already complete: reported already, and the write is not asked for.
		const second = await trackerSetup(env.repo, {}, { connect: d.connect });
		assert.equal(stepOf(second, 'config')?.status, 'already');
		assert.equal(stepOf(second, 'config')?.detail, `${env.cfg} already targets acme/widgets`);
		assert.equal(env.ensureCalls, 1, 'no write when nothing needs writing');

		// A daemon business error (the repo is not registered with it) becomes a failed step carrying its message, and the other steps report.
		rmSync(env.cfg);
		const refusing = await daemon(env, []);
		try {
			const refused = await trackerSetup(env.repo, {}, { connect: refusing.connect });
			assert.equal(stepOf(refused, 'config')?.status, 'failed');
			assert.match(stepOf(refused, 'config')?.detail ?? '', /not a registered repo path/);
			assert.deepEqual(refused.steps.map(s => s.key), ALL_KEYS);
			assert.equal(stepOf(refused, 'gh-auth')?.status, 'manual');
			assert.equal(stepOf(refused, 'labels')?.status, 'skipped');
		} finally { await refusing.close(); }
		assert.throws(() => readFileSync(env.cfg), /ENOENT/, 'a refused write leaves no file');
	} finally { await d.close(); env.cleanup(); }
});

test('a daemon that is absent, closes early or does not know the method is a clear error and nothing runs in the terminal', async () => {
	const env = setup();
	try {
		await assert.rejects(trackerSetup(env.repo, {}, { connect: () => createConnection(join(env.dir, 'absent.sock')) }), /daemon is not running/);
		const early = await fakeDaemon(env, 'early-close');
		try {
			await assert.rejects(trackerSetup(env.repo, {}, { connect: early.connect }), /closed the connection before replying.*check the result before repeating it/);
			assert.equal(early.closed(), 1, 'the socket was released');
		} finally { await early.close(); }
		// an older daemon: the method is unknown
		const old = new IpcServer(directDispatch({}));
		const oldPath = join(env.dir, 'old.sock');
		const oldServer = createServer((s: Socket) => { (old as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
		await new Promise<void>(r => oldServer.listen(oldPath, () => r()));
		try {
			await assert.rejects(trackerSetup(env.repo, {}, { connect: () => createConnection(oldPath) }), /the daemon does not support tracker\.setup .*nothing was run or changed/);
		} finally { await new Promise<void>(r => oldServer.close(() => r())); }
		assert.throws(() => readFileSync(env.cfg), /ENOENT/, 'nothing was written by this process');
	} finally { env.cleanup(); }
});

test('malformed github.json fails the config step with no write requested', async () => {
	const env = setup();
	const d = await daemon(env);
	try {
		const files: Array<[string, string, RegExp]> = [
			['null own entry with a complete default', JSON.stringify({ default: COMPLETE, repos: { [env.repo]: null } }), /repos\[/],
			['null default', '{"default":null}', /"default"/],
			['non-object top level', '[]', /top level/],
			['invalid JSON', '{nope', /not valid JSON/],
		];
		for (const [label, content, re] of files) {
			writeFileSync(env.cfg, content);
			const report = await trackerSetup(env.repo, {}, { connect: d.connect });
			const config = stepOf(report, 'config');
			assert.equal(config?.status, 'failed', label);
			assert.match(config?.detail ?? '', re, label);
			assert.equal(readFileSync(env.cfg, 'utf8'), content, `${label}: file untouched`);
			assert.deepEqual(report.steps.map(s => s.key), ALL_KEYS, `${label}: every other step reported`);
		}
		assert.equal(env.ensureCalls, 0, 'the write was never requested');

		// A repo with no origin remote: the plan fails and the other steps still report.
		rmSync(env.cfg);
		const bare = join(env.dir, 'bare');
		mkdirSync(bare);
		execFileSync('git', ['init', '-q', bare]);
		const noOrigin = await trackerSetup(bare, {}, { connect: d.connect });
		assert.equal(stepOf(noOrigin, 'config')?.status, 'failed');
		assert.match(stepOf(noOrigin, 'config')?.detail ?? '', /could not determine owner\/repo/);
		assert.deepEqual(noOrigin.steps.map(s => s.key), ALL_KEYS);
	} finally { await d.close(); env.cleanup(); }
});

test('makeServices injects the daemon-calling wrapper, and the terminal service references no tracker setup code', async () => {
	assert.equal(makeServices().workflow.trackerSetup, trackerSetup);
	const root = fileURLToPath(new URL('../../', import.meta.url));
	const stripImports = (text: string): string => text.replace(/import\s[^;]*?from\s+['"][^'"]+['"];?/gs, '');
	const offenders: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, name.name);
			if (name.isDirectory()) { if (name.name !== '__tests__') walk(full); continue; }
			if (!/\.(ts|tsx)$/.test(name.name)) continue;
			const rel = relative(root, full);
			if (rel.startsWith('daemon/') || rel === join('workflow', 'tracker', 'setup.ts')) continue;
			if (/\b(runTrackerSetup|planTrackerConfig)\b/.test(stripImports(readFileSync(full, 'utf8')))) offenders.push(rel);
		}
	};
	walk(root);
	assert.deepEqual(offenders, [], 'production code outside the daemon references the setup engine');
	// the guard itself fails on a bare call
	assert.ok(/\brunTrackerSetup\b/.test(stripImports("import { runTrackerSetup } from './x.js';\nexport const y = () => runTrackerSetup('/r');")));
});
