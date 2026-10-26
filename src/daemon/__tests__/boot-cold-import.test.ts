/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cold daemon import through both settings-catalog chains (Epic
 * ce99b72065d03b1b, Story s3 · t2).
 *
 * The catalog is built at module load from the shipped JSON import, so every
 * daemon module must import whatever INSRC_MODEL_CATALOG_DIR holds — a valid,
 * missing, malformed or structurally invalid definitions file: the validated
 * file and the registry are first read in main(). The daemon entry then refuses
 * an invalid file with ModelCatalogValidationError before the reconcile (no
 * config.json), and reconciles a valid alternate file's defaults (not the
 * shipped import's).
 *
 * Each case runs in a child process in a temp home; the daemon log goes to
 * stderr (INSRC_MODE=mcp).
 *
 * Run: npx tsx --test src/daemon/__tests__/boot-cold-import.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { REPO_ROOT, childEnv, rpc, sockOf } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { MODEL_CATALOG_DIR } from '../model-catalog.js';

const CATALOG = 'cloud-model-catalog.json';
const TSX = fileURLToPath(import.meta.resolve('tsx/esm'));
const shipped = (): Record<string, any> => JSON.parse(readFileSync(join(MODEL_CATALOG_DIR, CATALOG), 'utf8')) as Record<string, any>;

type DirCase = { label: string; dir: (tmp: string) => string; reason: RegExp | undefined };
const CASES: DirCase[] = [
	{ label: 'valid', reason: undefined, dir: tmp => { writeFileSync(join(tmp, CATALOG), JSON.stringify(shipped())); return tmp; } },
	{ label: 'missing', reason: /file not found/, dir: tmp => join(tmp, 'no-such-dir') },
	{ label: 'malformed', reason: /malformed JSON/, dir: tmp => { writeFileSync(join(tmp, CATALOG), '{ "version": 1, '); return tmp; } },
	{ label: 'structurally invalid', reason: /\(cli-codex\): tierDefaults\.mid\.model 'nope' is not a model or alias of cli-codex/, dir: tmp => {
		const f = shipped(); f['families'].find((x: { id: string }) => x.id === 'cli-codex').tierDefaults.mid.model = 'nope';
		writeFileSync(join(tmp, CATALOG), JSON.stringify(f)); return tmp;
	} },
];

const CHAINS = [
	// index.ts → reconcile-io.ts → reconcile.ts → config-catalog.ts
	'src/config/reconcile-io.ts',
	// handler-runtime.ts → admin-handlers.ts → settings-catalog.ts → config-catalog.ts
	'src/daemon/handler-runtime.ts',
	'src/daemon/admin-handlers.ts',
	'src/config/settings-catalog.ts',
];

test('boot-cold-import.test.ts: both catalog chains import with a valid, missing, malformed and structurally invalid INSRC_MODEL_CATALOG_DIR', { timeout: 300_000 }, () => {
	for (const c of CASES) {
		const home = mkdtempSync(join(tmpdir(), 'cold-import-'));
		const tmp = mkdtempSync(join(tmpdir(), 'cold-import-assets-'));
		try {
			const dir = c.dir(tmp);
			const imports = CHAINS.map(m => `await import(${JSON.stringify(pathToFileURL(join(REPO_ROOT, m)).href)});`).join(' ');
			// After the imports, main()'s first read decides: the validator refuses an invalid file.
			const probe = `${imports} const { validateModelCatalog } = await import(${JSON.stringify(pathToFileURL(join(REPO_ROOT, 'src/daemon/model-catalog.ts')).href)});
				try { validateModelCatalog(); process.stdout.write('VALID'); } catch (e) { process.stdout.write('REFUSED ' + e.name + ': ' + e.message); }
				process.exit(0);`;
			const r = spawnSync(process.execPath, ['--import', TSX, '--input-type=module', '-e', probe], {
				cwd: REPO_ROOT, env: { ...childEnv(home), INSRC_MODE: 'mcp', INSRC_MODEL_CATALOG_DIR: dir }, encoding: 'utf8', timeout: 120_000,
			});
			assert.equal(r.status, 0, `${c.label}: every module imports; stderr: ${r.stderr.slice(-2000)}`);
			if (c.reason === undefined) {
				assert.equal(r.stdout, 'VALID', c.label);
			} else {
				assert.match(r.stdout, /^REFUSED ModelCatalogValidationError: /, c.label);
				assert.match(r.stdout, c.reason, c.label);
			}
			assert.equal(existsSync(join(home, '.insrc', 'config.json')), false, `${c.label}: importing writes no config.json`);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(tmp, { recursive: true, force: true });
		}
	}
});

/** Run the daemon entry in `home`; resolve once it listens (stopping it) or exits. */
async function runDaemon(home: string, dir: string): Promise<{ code: number | null; listened: boolean; stderr: string }> {
	const child = spawn(process.execPath, ['--import', TSX, join(REPO_ROOT, 'src', 'daemon', 'index.ts')], {
		cwd: REPO_ROOT, env: { ...childEnv(home), INSRC_MODE: 'mcp', INSRC_MODEL_CATALOG_DIR: dir }, stdio: ['ignore', 'ignore', 'pipe'],
	});
	let stderr = '';
	child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
	// 'close' fires after the process exited AND its stderr was drained, so no diagnostic is missed.
	let closed = false;
	const exited = new Promise<number | null>(resolve => child.once('close', code => { closed = true; resolve(code); }));
	const deadline = Date.now() + 60_000;
	for (;;) {
		if (closed || child.exitCode !== null) { const code = await exited; return { code, listened: false, stderr }; }
		if (existsSync(sockOf(home))) {
			try {
				await rpc(sockOf(home), 'daemon.status');
				try { await rpc(sockOf(home), 'daemon.shutdown'); } catch { /* going */ }
				const killer = setTimeout(() => child.kill('SIGKILL'), 15_000);
				const code = await exited;
				clearTimeout(killer);
				return { code, listened: true, stderr };
			} catch { /* not ready */ }
		}
		if (Date.now() > deadline) { child.kill('SIGKILL'); await exited; return { code: null, listened: false, stderr }; }
		await new Promise(r => setTimeout(r, 200));
	}
}

test('boot-cold-import.test.ts: registry first read in main(); invalid files refused with the named error before reconcile; a valid alternate file is what the reconcile fills', { timeout: 300_000 }, async () => {
	for (const c of CASES.filter(x => x.reason !== undefined)) {
		const home = mkdtempSync(join(tmpdir(), 'cold-boot-'));
		const tmp = mkdtempSync(join(tmpdir(), 'cold-boot-assets-'));
		try {
			const r = await runDaemon(home, c.dir(tmp));
			assert.equal(r.listened, false, `${c.label}: the daemon never listens`);
			assert.notEqual(r.code, 0, `${c.label}: exits non-zero; stderr: ${r.stderr.slice(-2000)}`);
			assert.notEqual(r.code, null, `${c.label}: exits on its own`);
			assert.match(r.stderr, /ModelCatalogValidationError/, c.label);
			assert.match(r.stderr, c.reason!, c.label);
			assert.equal(existsSync(join(home, '.insrc', 'config.json')), false, `${c.label}: refused before the reconcile`);
		} finally {
			rmSync(home, { recursive: true, force: true });
			rmSync(tmp, { recursive: true, force: true });
		}
	}

	// A valid alternate file whose defaults differ from the shipped import: the reconcile fills ITS values.
	const home = mkdtempSync(join(tmpdir(), 'cold-boot-alt-'));
	const tmp = mkdtempSync(join(tmpdir(), 'cold-boot-alt-assets-'));
	try {
		const alt = shipped();
		alt['defaultFamily'] = 'cli-codex';
		alt['families'].find((x: { id: string }) => x.id === 'cli-codex').tierDefaults.core = { model: 'gpt-6.1-sol', effort: 'ultra' };
		writeFileSync(join(tmp, CATALOG), JSON.stringify(alt));
		const r = await runDaemon(home, tmp);
		assert.equal(r.listened, true, `the daemon boots with a valid alternate file; stderr: ${r.stderr.slice(-2000)}`);
		const config = JSON.parse(readFileSync(join(home, '.insrc', 'config.json'), 'utf8')) as { models: { tiers: Record<string, unknown> } };
		assert.deepEqual(config.models.tiers['core'], { runner: 'cli-codex', model: 'gpt-6.1-sol', effort: 'ultra' });
		assert.deepEqual(config.models.tiers['cheap'], { runner: 'cli-codex', model: 'gpt-6-luna', effort: '' });
	} finally {
		rmSync(home, { recursive: true, force: true });
		rmSync(tmp, { recursive: true, force: true });
	}
});
