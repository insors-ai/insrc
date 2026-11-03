/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s4 over a real daemon (Epic ce99b72065d03b1b, t6): models.check /
 * models.approve / models.reject through the socket, and what a decision does
 * after a restart.
 *
 * The daemon runs in a temp home with its log on stderr (INSRC_MODE=mcp) and a
 * PATH holding only a fake `codex` and the system directories, so no real CLI
 * is reached: `claude` is absent on purpose (an unreachable CLI). config.json is
 * seeded with tiers naming the not-yet-approved model gpt-new, and three repos
 * whose `tasks` move one peripheral role to core, mid and cheap.
 *
 *   daemon 1  the core tier falls back (unlisted); checks; approve / reject
 *   daemon 2  gpt-new is user-approved, gpt-bad rejected; config.write
 *   daemon 3  the tier config.write saved resolves (effort dropped)
 *
 * Run: npx tsx --test src/daemon/__tests__/models-daemon-s4.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, childEnv, rpc, sockOf } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { MODEL_CATALOG_DIR } from '../model-catalog.js';

const TSX = fileURLToPath(import.meta.resolve('tsx/esm'));
const ROLE = 'design.decompose';   // peripheral
const REPO = { core: '/w/s4-core', mid: '/w/s4-mid', cheap: '/w/s4-cheap' } as const;

const FAKE_CODEX = `#!${process.execPath}
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.env.FAKE_CLI_CONFIG, 'utf8'));
const args = process.argv.slice(2);
let stdin = '';
process.stdin.on('data', d => { stdin += d; });
process.stdin.on('end', () => {
	fs.appendFileSync(cfg.log, JSON.stringify({ args, stdin }) + '\\n');
	let out = { exit: 0, stdout: '' };
	if (args[0] === '--version') out.stdout = 'codex-cli 9.9.9\\n';
	else if (args[0] === 'debug') out.stdout = JSON.stringify(cfg.models);
	else if (args[0] === 'exec') {
		const m = args[args.indexOf('-m') + 1];
		out = m === 'gpt-gone'
			? { exit: 1, stdout: JSON.stringify({ type: 'turn.failed', error: { message: 'model_not_found: gpt-gone' } }) + '\\n' }
			: { exit: 0, stdout: [{ type: 'thread.started' }, { type: 'turn.completed' }].map(e => JSON.stringify(e)).join('\\n') + '\\n' };
	}
	process.stdout.write(out.stdout);
	process.exitCode = out.exit;
});
`;

const LEVELS = (...e: string[]): Array<{ effort: string; description: string }> => e.map(effort => ({ effort, description: '' }));
const MODELS = { models: [
	{ slug: 'gpt-new', supported_reasoning_levels: LEVELS('low', 'medium', 'high') },
	{ slug: 'gpt-bad', supported_reasoning_levels: LEVELS('low') },
] };

/** The log records on stderr (pino-pretty), ANSI stripped. */
function records(stderr: string): string[] {
	// eslint-disable-next-line no-control-regex
	return stderr.replace(/\u001b\[[0-9;]*m/g, '').split(/\n(?=\[\d{2}:\d{2}:\d{2}\])/);
}

interface Running { readonly sock: string; readonly stderr: () => string; stop(): Promise<void> }

async function start(home: string, env: Record<string, string>): Promise<Running> {
	const child = spawn(process.execPath, ['--import', TSX, join(REPO_ROOT, 'src', 'daemon', 'index.ts')], {
		cwd: REPO_ROOT, env: { ...childEnv(home), INSRC_MODE: 'mcp', ...env }, stdio: ['ignore', 'ignore', 'pipe'],
	});
	let stderr = '';
	child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
	const exited = new Promise<void>(r => child.once('exit', () => r()));
	const sock = sockOf(home);
	const deadline = Date.now() + 60_000;
	for (;;) {
		if (existsSync(sock)) { try { await rpc(sock, 'daemon.status'); break; } catch { /* not ready */ } }
		if (child.exitCode !== null) throw new Error(`the daemon exited during start: ${stderr.slice(-2000)}`);
		if (Date.now() > deadline) { child.kill('SIGKILL'); throw new Error(`the daemon did not start: ${stderr.slice(-2000)}`); }
		await new Promise(r => setTimeout(r, 200));
	}
	return {
		sock,
		stderr: () => stderr,
		stop: async () => {
			if (child.exitCode !== null) return;
			try { await rpc(sock, 'daemon.shutdown'); } catch { /* going */ }
			const killer = setTimeout(() => child.kill('SIGKILL'), 15_000);
			await exited;
			clearTimeout(killer);
		},
	};
}

type Defs = { families: Array<{ id: string; rejectedModels?: string[] | undefined; models: Array<{ id: string; efforts: string[]; source: string }> }> };
const codexOf = (d: Defs) => d.families.find(f => f.id === 'cli-codex')!;
const resolve = (sock: string, repo: string) => rpc(sock, 'models.resolveRole', { role: ROLE, repoPath: repo }) as Promise<Record<string, unknown>>;

test('models-daemon-s4.test.ts: check, approve and reject through a real daemon; after restarts the approved model is served with its approved efforts, the rejected one refused, and an unreachable CLI cannot be approved', { timeout: 300_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-models-s4-'));
	const work = mkdtempSync(join(tmpdir(), 'insrc-models-s4-work-'));
	try {
		// A definitions copy: the shipped file, which does not list gpt-new / gpt-bad / gpt-gone.
		const assets = join(work, 'assets');
		mkdirSync(assets);
		const shipped = readFileSync(join(MODEL_CATALOG_DIR, 'cloud-model-catalog.json'), 'utf8');
		writeFileSync(join(assets, 'cloud-model-catalog.json'), shipped);
		for (const id of ['gpt-new', 'gpt-bad', 'gpt-gone', 'claude-x']) assert.ok(!shipped.includes(`"${id}"`), id);

		// The fake codex alone on PATH, with node's directory for its shebang and the system directories.
		const bin = join(work, 'bin');
		mkdirSync(bin);
		writeFileSync(join(bin, 'codex'), FAKE_CODEX);
		chmodSync(join(bin, 'codex'), 0o755);
		const cfgFile = join(work, 'fake.json');
		const callLog = join(work, 'calls.jsonl');
		writeFileSync(cfgFile, JSON.stringify({ log: callLog, models: MODELS }));
		const env = { INSRC_MODEL_CATALOG_DIR: assets, FAKE_CLI_CONFIG: cfgFile, PATH: [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(':') };

		const store = join(home, '.insrc', 'approved-models.json');
		const configFile = join(home, '.insrc', 'config.json');
		mkdirSync(join(home, '.insrc'), { recursive: true });
		writeFileSync(configFile, JSON.stringify({ models: {
			tiers: {
				core: { runner: 'cli-codex', model: 'gpt-new', effort: 'high' },
				mid:  { runner: 'cli-codex', model: 'gpt-new', effort: 'low' },
			},
			byRepo: {
				[REPO.core]:  { tasks: { [ROLE]: 'core' } },
				[REPO.mid]:   { tasks: { [ROLE]: 'mid' } },
				[REPO.cheap]: { tasks: { [ROLE]: 'cheap' } },
			},
		} }));

		// ── daemon 1: before any decision ──
		let daemon = await start(home, env);
		try {
			// Not usable before approval: the core tier runs its default (decision A).
			const before = await resolve(daemon.sock, REPO.core);
			assert.equal(before['family'], 'cli-codex');
			assert.notEqual(before['model'], 'gpt-new');
			assert.deepEqual(before['fallback'], { reason: 'unlisted-model', requested: 'gpt-new' });
			assert.ok(!codexOf(await rpc(daemon.sock, 'models.definitions') as Defs).models.some(m => m.id === 'gpt-new'));

			// models.check returns per-effort evidence and writes nothing.
			const configBytes = readFileSync(configFile, 'utf8');
			const checked = await rpc(daemon.sock, 'models.check', { family: 'cli-codex', modelId: 'gpt-new', claimedEfforts: ['high', 'low', 'ultra'] }) as {
				checkId: string; runs: boolean; efforts: Array<{ effort: string; verdict: string; evidence: string }>;
			};
			assert.equal(checked.runs, true, JSON.stringify(checked));
			assert.deepEqual(checked.efforts.map(e => [e.effort, e.verdict]), [['high', 'accepted'], ['low', 'accepted'], ['ultra', 'rejected']]);
			for (const e of checked.efforts) assert.match(e.evidence, /`codex debug models` lists gpt-new with levels: low, medium, high/);
			assert.equal(existsSync(store), false);
			assert.equal(readFileSync(configFile, 'utf8'), configBytes);
			assert.ok(readFileSync(callLog, 'utf8').includes('"exec"'), 'the fake codex ran the model');

			// Approve only one of the passing levels.
			assert.deepEqual(await rpc(daemon.sock, 'models.approve', { checkId: checked.checkId, efforts: ['high'] }), { ok: true, restartRequired: true });
			const stored = JSON.parse(readFileSync(store, 'utf8')) as { profiles: Array<Record<string, unknown>> };
			assert.deepEqual([stored.profiles[0]!['modelId'], stored.profiles[0]!['status'], stored.profiles[0]!['efforts']], ['gpt-new', 'approved', ['high']]);

			// Reject another checked model.
			const bad = await rpc(daemon.sock, 'models.check', { family: 'cli-codex', modelId: 'gpt-bad', claimedEfforts: [] }) as { checkId: string; runs: boolean };
			assert.equal(bad.runs, true);
			assert.deepEqual(await rpc(daemon.sock, 'models.reject', { checkId: bad.checkId }), { ok: true, restartRequired: true });

			// A model the CLI refuses, and a CLI that cannot be reached, cannot be approved.
			const gone = await rpc(daemon.sock, 'models.check', { family: 'cli-codex', modelId: 'gpt-gone', claimedEfforts: [] }) as { checkId: string; runs: boolean; error: string };
			assert.equal(gone.error, 'the codex CLI refused the model: model_not_found: gpt-gone');
			assert.deepEqual(await rpc(daemon.sock, 'models.approve', { checkId: gone.checkId, efforts: [] }), { ok: false, reason: 'model-did-not-run', detail: gone.error });
			const absent = await rpc(daemon.sock, 'models.check', { family: 'cli-claude', modelId: 'claude-x', claimedEfforts: ['high'] }) as { checkId: string; runs: boolean; error: string };
			assert.equal(absent.runs, false);
			assert.match(absent.error, /^the claude CLI could not be reached: .*ENOENT/);
			assert.equal((await rpc(daemon.sock, 'models.approve', { checkId: absent.checkId, efforts: [] }) as { reason: string }).reason, 'model-did-not-run');

			// Decisions apply at the next restart: this daemon still falls back.
			assert.deepEqual((await resolve(daemon.sock, REPO.core))['fallback'], { reason: 'unlisted-model', requested: 'gpt-new' });
		} finally {
			await daemon.stop();
		}

		// ── daemon 2: the decisions are in force ──
		daemon = await start(home, env);
		try {
			const codex = codexOf(await rpc(daemon.sock, 'models.definitions') as Defs);
			const approved = codex.models.find(m => m.id === 'gpt-new');
			assert.deepEqual([approved?.source, approved?.efforts], ['user-approved', ['high']]);
			assert.ok(codex.rejectedModels?.includes('gpt-bad'), JSON.stringify(codex.rejectedModels));
			assert.ok(!codex.models.some(m => m.id === 'gpt-bad'));

			// The seeded core tier now runs gpt-new at its approved level.
			const core = await resolve(daemon.sock, REPO.core);
			assert.deepEqual([core['family'], core['model'], core['effort'], core['fallback']], ['cli-codex', 'gpt-new', 'high', undefined]);

			// The rejected model is refused by config.write; the approved one is accepted.
			const refused = await rpc(daemon.sock, 'config.write', { path: 'models.tiers.cheap', value: { runner: 'cli-codex', model: 'gpt-bad', effort: '' } });
			assert.deepEqual(refused, { ok: false, reason: 'rejected-model', detail: "models.tiers.cheap: model 'gpt-bad' is rejected in cli-codex" });
			assert.deepEqual(await rpc(daemon.sock, 'config.write', { path: 'models.tiers.cheap', value: { runner: 'cli-codex', model: 'gpt-new', effort: 'low' } }), { ok: true, restartRequired: true });
		} finally {
			await daemon.stop();
		}

		// ── daemon 3: the saved tier is in force; unapproved levels are dropped ──
		daemon = await start(home, env);
		try {
			for (const [tier, repo] of [['mid', REPO.mid], ['cheap', REPO.cheap]] as const) {
				const r = await resolve(daemon.sock, repo);
				assert.deepEqual([r['tier'], r['family'], r['model'], r['effort'], r['fallback']], [tier, 'cli-codex', 'gpt-new', undefined, undefined], tier);
				assert.ok(records(daemon.stderr()).some(x => x.includes(`models.tiers.${tier}: model gpt-new does not accept effort 'low'`)), `${tier}: ${daemon.stderr().slice(-3000)}`);
			}
			const core = await resolve(daemon.sock, REPO.core);
			assert.deepEqual([core['model'], core['effort']], ['gpt-new', 'high']);
		} finally {
			await daemon.stop();
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
		rmSync(work, { recursive: true, force: true });
	}
});
