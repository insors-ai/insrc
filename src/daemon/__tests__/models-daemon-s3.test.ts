/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s3 over a real daemon (Epic ce99b72065d03b1b, t10). The daemon entry
 * runs in a temp home with its log on stderr (INSRC_MODE=mcp):
 *  - per-repo tiers in config.json are removed at boot, one warning per repo and
 *    tier, and models.resolveRole over the socket returns the GLOBAL tier's model
 *    for a role the repo's tasks move to that tier;
 *  - a cold start with an alternate definitions file (INSRC_MODEL_CATALOG_DIR)
 *    that keeps the shipped local model but names another tool-loop model
 *    reconciles that coreModel, and the daemon's tool-loop choice uses it, not
 *    the value its settings cache held at module load.
 *
 * Run: npx tsx --test src/daemon/__tests__/models-daemon-s3.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, childEnv, rpc, sockOf } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { MODEL_CATALOG_DIR } from '../model-catalog.js';

const TSX = fileURLToPath(import.meta.resolve('tsx/esm'));
const REPO = '/w/s3-repo';
const ROLE = 'design.decompose';   // peripheral, default tier mid

/** The log records on stderr (pino-pretty: a header line, then one indented line per field), ANSI stripped. */
function records(stderr: string): string[] {
	// eslint-disable-next-line no-control-regex
	const plain = stderr.replace(/\u001b\[[0-9;]*m/g, '');
	return plain.split(/\n(?=\[\d{2}:\d{2}:\d{2}\])/);
}

interface Running { readonly sock: string; readonly stderr: () => string; stop(): Promise<void> }

/** Start the daemon entry in `home`; resolves once it answers daemon.status. */
async function start(home: string, env: Record<string, string> = {}): Promise<Running> {
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

test("models-daemon-s3.test.ts: a real daemon removes byRepo tiers at boot with warnings and models.resolveRole returns the global tier's model for a repo-chosen tier", { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-models-s3-'));
	try {
		mkdirSync(join(home, '.insrc'), { recursive: true });
		writeFileSync(join(home, '.insrc', 'config.json'), JSON.stringify({
			models: {
				tiers: {
					core:  { runner: 'cli-claude', model: 'opus', effort: '' },
					mid:   { runner: 'cli-claude', model: 'sonnet', effort: '' },
					cheap: { runner: 'cli-codex', model: 'gpt-6-luna', effort: '' },
				},
				byRepo: {
					[REPO]: {
						tasks: { [ROLE]: 'cheap' },
						coreFloor: 'core',
						tiers: { cheap: { runner: 'cli-claude', model: 'haiku' }, mid: { runner: 'ollama', model: 'qwen3.6:27b' } },
					},
				},
			},
		}));
		const daemon = await start(home);
		try {
			// The per-repo tiers are gone from config.json; tasks and coreFloor stay.
			const config = JSON.parse(readFileSync(join(home, '.insrc', 'config.json'), 'utf8')) as { models: { byRepo: Record<string, unknown> } };
			assert.deepEqual(config.models.byRepo[REPO], { tasks: { [ROLE]: 'cheap' }, coreFloor: 'core' });
			// One warning per removed repo tier, naming repo and tier.
			const warnings = records(daemon.stderr()).filter(r => r.includes('removed a per-repo model tier'));
			assert.equal(warnings.length, 2, daemon.stderr().slice(-3000));
			for (const tier of ['cheap', 'mid']) {
				assert.ok(warnings.some(r => r.includes(`tier: "${tier}"`) && r.includes(`repo: "${REPO}"`)), `${tier}: ${warnings.join('\n')}`);
			}

			// The repo's tasks move the role to cheap; the model is the GLOBAL cheap tier's.
			const r = await rpc(daemon.sock, 'models.resolveRole', { role: ROLE, repoPath: REPO }) as Record<string, unknown>;
			assert.deepEqual(r, { tier: 'cheap', family: 'cli-codex', model: 'gpt-6-luna', inputLimit: { unit: 'chars', max: 1_048_576 }, cli: { kind: 'codex' } });
			// Without the repo, the role keeps its default tier.
			const plain = await rpc(daemon.sock, 'models.resolveRole', { role: ROLE, repoPath: '/w/other' }) as Record<string, unknown>;
			assert.deepEqual([plain['tier'], plain['family'], plain['model']], ['mid', 'cli-claude', 'claude-sonnet-5']);
			// Bad params are refused over the socket too.
			const bad = await rpc(daemon.sock, 'models.resolveRole', { role: ROLE }) as Record<string, unknown>;
			assert.match(String(bad['error']), /^invalid-params/);
		} finally {
			await daemon.stop();
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});

test('models-daemon-s3.test.ts: a cold start with an alternate catalog changing toolLoopModel uses the reconciled coreModel', { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-models-s3-cold-'));
	const assets = mkdtempSync(join(tmpdir(), 'insrc-models-s3-assets-'));
	try {
		// The shipped file, with one more Ollama model named as the tool-loop model.
		const defs = JSON.parse(readFileSync(join(MODEL_CATALOG_DIR, 'cloud-model-catalog.json'), 'utf8')) as { families: Array<{ id: string; models: unknown[]; toolLoopModel?: string }> };
		const ollama = defs.families.find(f => f.id === 'ollama')!;
		const shippedLoop = ollama.toolLoopModel!;
		ollama.models.push({ id: 'qwen-alt:1b', efforts: [], inputLimit: { unit: 'tokens', max: 8192 } });
		ollama.toolLoopModel = 'qwen-alt:1b';
		writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(defs));

		// A fresh home: no config.json, so the module-load settings read holds the shipped default.
		const daemon = await start(home, { INSRC_MODEL_CATALOG_DIR: assets });
		try {
			const config = JSON.parse(readFileSync(join(home, '.insrc', 'config.json'), 'utf8')) as { models: { local: { coreModel: string } } };
			assert.equal(config.models.local.coreModel, 'qwen-alt:1b', 'the reconcile filled the alternate file\'s tool-loop model');
			const record = records(daemon.stderr()).find(r => r.includes('local tool-loop model'));
			assert.ok(record !== undefined, daemon.stderr().slice(-3000));
			assert.match(record, /model: "qwen-alt:1b"/);
			assert.match(record, /numCtx: 8192/);
			assert.ok(!record.includes(`model: "${shippedLoop}"`), 'not the shipped tool-loop model the module-load read held');
		} finally {
			await daemon.stop();
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
		rmSync(assets, { recursive: true, force: true });
	}
});
