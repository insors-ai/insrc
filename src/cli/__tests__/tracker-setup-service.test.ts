/**
 * Story E20261016315d510c:S003 / t6 — terminal tracker setup through the daemon.
 *
 * A real IpcServer connection handler serves the real repo.trackerConfig.ensure
 * handler on a temp socket; fake daemons (silent, early-closing) are plain net
 * servers. git runs for real in a temp repo; gh is faked (not authenticated).
 * The deadline tests bound only the config call: none of them claims a total
 * setup time, and the remaining-steps assertions are separate from the timing ones.
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

import { trackerSetup, TRACKER_CONFIG_TIMEOUT_MS } from '../services/workflow.js';
import type { TrackerSetupDeps } from '../services/workflow.js';
import { makeServices } from '../services/index.js';
import { IpcServer, directDispatch } from '../../daemon/server.js';
import { createRepoSettingsHandlers } from '../../daemon/repo-settings.js';
import { _setTrackerExecForTests } from '../../workflow/tracker/__tests__/_legacy-table.js';
import { githubConfigPath } from '../../workflow/config/github.js';
import { runTrackerSetup } from '../../workflow/tracker/setup.js';
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

/** The real handlers behind a real connection handler on a temp socket; counts ensure calls. */
async function daemon(env: Env): Promise<{ connect: () => Socket; close: () => Promise<void> }> {
	const handlers = createRepoSettingsHandlers({ registeredRepos: async () => [env.repo], configPath: githubConfigPath });
	const ensure = handlers['repo.trackerConfig.ensure']!;
	const ipc = new IpcServer(directDispatch({ 'repo.trackerConfig.ensure': async (p) => { env.ensureCalls++; return await ensure(p); } }));
	const path = join(env.dir, 'd.sock');
	const server = createServer((s: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
	await new Promise<void>(r => server.listen(path, () => r()));
	return { connect: () => createConnection(path), close: () => new Promise<void>(r => server.close(() => r())) };
}

/** A daemon that accepts the connection and then misbehaves. */
async function fakeDaemon(env: Env, mode: 'silent' | 'early-close'): Promise<{ connect: () => Socket; connections: Socket[]; closed: () => number; close: () => Promise<void> }> {
	const connections: Socket[] = [];
	let closed = 0;
	const server: Server = createServer((s: Socket) => {
		connections.push(s);
		s.on('close', () => { closed++; });
		s.on('error', () => undefined);
		s.resume(); // read, so the client's close is seen as an end and the socket closes
		if (mode === 'early-close') s.once('data', () => s.destroy());
	});
	const path = join(env.dir, `${mode}.sock`);
	await new Promise<void>(r => server.listen(path, () => r()));
	return {
		connect: () => createConnection(path), connections, closed: () => closed,
		close: async () => { for (const c of connections) c.destroy(); await new Promise<void>(r => server.close(() => r())); },
	};
}

const stepOf = (r: TrackerSetupReport, key: string) => r.steps.find(s => s.key === key);

/**
 * Runs trackerSetup and measures the config call alone: from the start of the call to the moment the
 * remaining steps are about to run (the run seam), which is after the plan and the daemon call and before
 * any other step.
 */
async function timedConfig(repo: string, deps: TrackerSetupDeps): Promise<{ report: TrackerSetupReport; configMs: number }> {
	const started = Date.now();
	let configMs = -1;
	const report = await trackerSetup(repo, {}, {
		...deps,
		run: async (r, o) => { configMs = Date.now() - started; return await runTrackerSetup(r, o); },
	});
	return { report, configMs };
}

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

		// Already complete: reported already, and the daemon is not called.
		const second = await trackerSetup(env.repo, {}, { connect: d.connect });
		assert.equal(stepOf(second, 'config')?.status, 'already');
		assert.equal(stepOf(second, 'config')?.detail, `${env.cfg} already targets acme/widgets`);
		assert.equal(env.ensureCalls, 1, 'no daemon call when nothing needs writing');

		// A daemon business error becomes a failed step carrying its message.
		rmSync(env.cfg);
		const handlers = createRepoSettingsHandlers({ registeredRepos: async () => [], configPath: githubConfigPath });
		const refusing = new IpcServer(directDispatch({ 'repo.trackerConfig.ensure': handlers['repo.trackerConfig.ensure']! }));
		const refusePath = join(env.dir, 'refuse.sock');
		const refuseServer = createServer((s: Socket) => { (refusing as unknown as { handleConnection(s: Socket): void }).handleConnection(s); });
		await new Promise<void>(r => refuseServer.listen(refusePath, () => r()));
		try {
			const refused = await trackerSetup(env.repo, {}, { connect: () => createConnection(refusePath) });
			assert.equal(stepOf(refused, 'config')?.status, 'failed');
			assert.match(stepOf(refused, 'config')?.detail ?? '', /not a registered repo path/);
		} finally { await new Promise<void>(r => refuseServer.close(() => r())); }
		assert.throws(() => readFileSync(env.cfg), /ENOENT/, 'a refused write leaves no file');

		// No daemon: the step fails saying the daemon owns the file, and nothing is written by this process.
		const none = await trackerSetup(env.repo, {}, { connect: () => createConnection(join(env.dir, 'absent.sock')) });
		assert.equal(stepOf(none, 'config')?.status, 'failed');
		assert.match(stepOf(none, 'config')?.detail ?? '', /daemon owns that file and must be running/);
		assert.throws(() => readFileSync(env.cfg), /ENOENT/);
	} finally { await d.close(); env.cleanup(); }
});

test('silent and early-closing daemon fail the config step within the deadline', async () => {
	const DEADLINE = 300;
	const env = setup();
	try {
		// Silent daemon: the config call ends at the deadline, not before and not long after.
		const silent = await fakeDaemon(env, 'silent');
		try {
			const { report, configMs } = await timedConfig(env.repo, { connect: silent.connect, timeoutMs: DEADLINE });
			const config = stepOf(report, 'config');
			assert.equal(config?.status, 'failed');
			assert.match(config?.detail ?? '', /daemon owns that file and must be running/);
			assert.match(config?.detail ?? '', /timeout/);
			assert.ok(configMs >= DEADLINE - 50 && configMs < DEADLINE + 3000, `config call took ${configMs} ms`);
			await new Promise<void>(r => setTimeout(r, 50));
			assert.equal(silent.closed(), 1, 'the socket was released');
		} finally { await silent.close(); }

		// Early-closing daemon: fails at the close, far inside a deadline that would otherwise allow 10 s.
		const early = await fakeDaemon(env, 'early-close');
		try {
			const { report, configMs } = await timedConfig(env.repo, { connect: early.connect, timeoutMs: 10_000 });
			const config = stepOf(report, 'config');
			assert.equal(config?.status, 'failed');
			assert.match(config?.detail ?? '', /closed/);
			assert.match(config?.detail ?? '', /daemon owns that file/);
			assert.ok(configMs < 3000, `config call took ${configMs} ms`);
			assert.equal(early.closed(), 1);
		} finally { await early.close(); }

		// No daemon: fails at once, again far inside the deadline.
		const { report, configMs } = await timedConfig(env.repo, { connect: () => createConnection(join(env.dir, 'absent.sock')), timeoutMs: 10_000 });
		assert.equal(stepOf(report, 'config')?.status, 'failed');
		assert.match(stepOf(report, 'config')?.detail ?? '', /daemon owns that file and must be running/);
		assert.ok(configMs < 3000, `config call took ${configMs} ms`);

		assert.equal(TRACKER_CONFIG_TIMEOUT_MS, 15000);
	} finally { env.cleanup(); }
});

test('the remaining setup steps still run after a failed config step', async () => {
	const env = setup();
	try {
		const branches: Array<[string, TrackerSetupDeps]> = [];
		branches.push(['no daemon', { connect: () => createConnection(join(env.dir, 'absent.sock')) }]);
		const silent = await fakeDaemon(env, 'silent');
		branches.push(['silent daemon', { connect: silent.connect, timeoutMs: 100 }]);
		const early = await fakeDaemon(env, 'early-close');
		branches.push(['early-closing daemon', { connect: early.connect, timeoutMs: 5000 }]);
		try {
			for (const [label, deps] of branches) {
				const report = await trackerSetup(env.repo, {}, deps);
				assert.equal(stepOf(report, 'config')?.status, 'failed', label);
				assert.deepEqual(report.steps.map(s => s.key), ALL_KEYS, `${label}: every other step reported`);
				assert.equal(stepOf(report, 'gh-auth')?.status, 'manual', label);
				assert.equal(stepOf(report, 'labels')?.status, 'skipped', label);
			}
			// A malformed file (plan failed) also lets the other steps report.
			writeFileSync(env.cfg, '{"default":null}');
			const malformed = await trackerSetup(env.repo, {});
			assert.equal(stepOf(malformed, 'config')?.status, 'failed');
			assert.deepEqual(malformed.steps.map(s => s.key), ALL_KEYS);
			rmSync(env.cfg);

			// A repo with no origin remote: the plan fails and the other steps still report.
			const bare = join(env.dir, 'bare');
			mkdirSync(bare);
			execFileSync('git', ['init', '-q', bare]);
			const noOrigin = await trackerSetup(bare, {});
			assert.equal(stepOf(noOrigin, 'config')?.status, 'failed');
			assert.match(stepOf(noOrigin, 'config')?.detail ?? '', /could not determine owner\/repo/);
			assert.deepEqual(noOrigin.steps.map(s => s.key), ALL_KEYS);

			// A daemon business error (the repo is not registered with it): failed, other steps still report.
			const handlers = createRepoSettingsHandlers({ registeredRepos: async () => [], configPath: githubConfigPath });
			const ipc = new IpcServer(directDispatch({ 'repo.trackerConfig.ensure': handlers['repo.trackerConfig.ensure']! }));
			const refusePath = join(env.dir, 'refuse.sock');
			const refuseServer = createServer((c: Socket) => { (ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(c); });
			await new Promise<void>(r => refuseServer.listen(refusePath, () => r()));
			try {
				const refused = await trackerSetup(env.repo, {}, { connect: () => createConnection(refusePath) });
				assert.equal(stepOf(refused, 'config')?.status, 'failed');
				assert.match(stepOf(refused, 'config')?.detail ?? '', /not a registered repo path/);
				assert.deepEqual(refused.steps.map(s => s.key), ALL_KEYS);
			} finally { await new Promise<void>(r => refuseServer.close(() => r())); }
		} finally { await silent.close(); await early.close(); }
	} finally { env.cleanup(); }
});

test('malformed github.json fails the config step with no daemon call', async () => {
	const env = setup();
	const d = await daemon(env);
	try {
		const files: Array<[string, string, RegExp]> = [
			['null own entry with a complete default', JSON.stringify({ default: COMPLETE, repos: { [env.repo]: null } }), /repos\[/],
			['null default', '{"default":null}', /"default"/],
			['non-object top level', '[]', /top level/],
			['invalid JSON', '{nope', /not valid JSON/],
		];
		let connects = 0;
		const counting = (): Socket => { connects++; return d.connect(); };
		for (const [label, content, re] of files) {
			writeFileSync(env.cfg, content);
			const report = await trackerSetup(env.repo, {}, { connect: counting });
			const config = stepOf(report, 'config');
			assert.equal(config?.status, 'failed', label);
			assert.match(config?.detail ?? '', re, label);
			assert.equal(readFileSync(env.cfg, 'utf8'), content, `${label}: file untouched`);
		}
		assert.equal(connects, 0, 'the daemon was never contacted');
		assert.equal(env.ensureCalls, 0);
	} finally { await d.close(); env.cleanup(); }
});

test('makeServices always injects the config seam', async () => {
	// The service exposed by makeServices is the asynchronous wrapper.
	assert.equal(makeServices().workflow.trackerSetup, trackerSetup);

	// In every branch the wrapper hands runTrackerSetup a configOutcome.
	const env = setup();
	const d = await daemon(env);
	try {
		const seen: Array<{ configOutcome?: unknown }> = [];
		const run: TrackerSetupDeps['run'] = (_repo, opts) => { seen.push(opts); return { steps: [], manualRemaining: 0 }; };

		await trackerSetup(env.repo, {}, { connect: d.connect, run });                               // needs-write → done
		await trackerSetup(env.repo, {}, { connect: d.connect, run });                               // already
		rmSync(env.cfg);
		await trackerSetup(env.repo, {}, { connect: () => createConnection(join(env.dir, 'absent.sock')), run }); // daemon down
		writeFileSync(env.cfg, '{nope');
		await trackerSetup(env.repo, {}, { connect: d.connect, run });                               // plan failed
		await trackerSetup(env.repo, { includeProject: true }, { plan: () => ({ status: 'failed', detail: 'x' }), run });
		assert.equal(seen.length, 5);
		for (const [i, opts] of seen.entries()) assert.ok(opts.configOutcome !== undefined, `branch ${i} passed no configOutcome`);
	} finally { await d.close(); env.cleanup(); }

	// Source search: outside the daemon, tests and the setup module itself, nothing may reference
	// runTrackerSetup except the terminal service, and there exactly one call exists and it passes configOutcome.
	const root = fileURLToPath(new URL('../../', import.meta.url));
	const stripImports = (text: string): string => text.replace(/import\s[^;]*?from\s+['"][^'"]+['"];?/gs, '');
	const offenders: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, name.name);
			if (name.isDirectory()) { if (name.name !== '__tests__') walk(full); continue; }
			if (!/\.(ts|tsx)$/.test(name.name)) continue;
			const rel = relative(root, full);
			if (rel.startsWith('daemon/') || rel === join('workflow', 'tracker', 'setup.ts') || rel === join('cli', 'services', 'workflow.ts')) continue;
			if (/\brunTrackerSetup\b/.test(stripImports(readFileSync(full, 'utf8')))) offenders.push(rel);
		}
	};
	walk(root);
	assert.deepEqual(offenders, [], 'production code outside the terminal service references runTrackerSetup');

	const service = stripImports(readFileSync(join(root, 'cli', 'services', 'workflow.ts'), 'utf8'));
	assert.equal(service.match(/\brunTrackerSetup\b/g)?.length, 1, 'the service references runTrackerSetup once (as the default run seam)');
	assert.equal(service.match(/\brun\(/g)?.length, 1, 'the service has one call of the run seam');
	assert.match(service, /return await run\(repoPath, \{ \.\.\.opts, configOutcome \}\);/);

	// The guard itself fails on a bare call.
	assert.ok(/\brunTrackerSetup\b/.test(stripImports("import { runTrackerSetup } from './x.js';\nexport const y = () => await runTrackerSetup('/r');")));
});
