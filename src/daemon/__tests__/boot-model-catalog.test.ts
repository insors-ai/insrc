/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon validates the model definitions file before it reconciles
 * settings, starts a worker or listens (Epic ce99b72065d03b1b, Story s1 · t4).
 * The real daemon entry runs in a fresh temp home, pointed at a TEMP copy of
 * the definitions asset through the test-only INSRC_MODEL_CATALOG_DIR
 * environment value. Its log goes to stderr (INSRC_MODE=mcp).
 *
 * Run: npx tsx --test src/daemon/__tests__/boot-model-catalog.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, childEnv, rpc, sockOf, startDaemon } from '../../mcp/__tests__/helpers/mcp-e2e.js';
import { MODEL_CATALOG_DIR } from '../model-catalog.js';

const CATALOG = 'cloud-model-catalog.json';

test('boot-model-catalog.test.ts: daemon entry in a temp home with INSRC_MODEL_CATALOG_DIR pointing at a corrupted copy exits non-zero with the error naming the entry, writes no config.json and never creates the socket', { timeout: 90_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-boot-catalog-'));
	const assets = mkdtempSync(join(tmpdir(), 'insrc-boot-catalog-assets-'));
	try {
		cpSync(join(MODEL_CATALOG_DIR, CATALOG), join(assets, CATALOG));
		const file = JSON.parse(readFileSync(join(assets, CATALOG), 'utf8')) as { families: Array<{ models: Array<{ inputLimit?: unknown }> }> };
		delete file.families[3]!.models[0]!.inputLimit;  // families[3] is ollama in the shipped asset
		writeFileSync(join(assets, CATALOG), JSON.stringify(file));

		const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx/esm')), join(REPO_ROOT, 'src', 'daemon', 'index.ts')], {
			cwd: REPO_ROOT, env: { ...childEnv(home), INSRC_MODE: 'mcp', INSRC_MODEL_CATALOG_DIR: assets }, stdio: ['ignore', 'ignore', 'pipe'],
		});
		let stderr = '';
		child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
		let sawSocket = false;
		const poll = setInterval(() => { if (existsSync(sockOf(home))) sawSocket = true; }, 25);
		const code = await new Promise<number | null>(resolve => {
			const kill = setTimeout(() => { child.kill('SIGKILL'); }, 60_000);
			child.once('exit', c => { clearTimeout(kill); resolve(c); });
		});
		clearInterval(poll);

		assert.notEqual(code, 0, `the daemon must exit non-zero; stderr: ${stderr.slice(-2000)}`);
		assert.notEqual(code, null, 'it exited on its own, not by the test kill');
		assert.match(stderr, /ModelCatalogValidationError/);
		assert.match(stderr, /families\[3\] \(ollama\): model 'qwen3\.6:27b' has no token inputLimit/);
		assert.equal(existsSync(join(home, '.insrc', 'config.json')), false, 'no config.json was reconciled');
		assert.equal(sawSocket || existsSync(sockOf(home)), false, 'the socket never opened');
	} finally {
		rmSync(home, { recursive: true, force: true });
		rmSync(assets, { recursive: true, force: true });
	}
});

test('boot-model-catalog.test.ts: with the shipped asset the daemon boots and listens', { timeout: 90_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-boot-catalog-ok-'));
	try {
		const daemon = await startDaemon(home);
		try {
			const status = await rpc(daemon.sock, 'daemon.status') as { repos: unknown[] };
			assert.ok(Array.isArray(status.repos));
			assert.ok(existsSync(join(home, '.insrc', 'config.json')), 'the reconcile ran after validation');
		} finally {
			await daemon.stop();
		}
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
