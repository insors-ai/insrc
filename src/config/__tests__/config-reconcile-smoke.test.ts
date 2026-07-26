/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end smoke validation on the captured fixture (t13).
 *
 * Exercises the two least-evidenced user-visible paths — the boot reconcile
 * and the update reconcile — as an end-to-end CONVERGENCE CHAIN, using the
 * exact functions the daemon boot (reconcileConfigFile) and maintenance.update
 * (runUpdateReconcile) call, against a temp INSRC home. No INSRC_LIVE_TESTS
 * gate is needed (neither Ollama nor CliProvider is touched).
 *
 * SCOPE NOTE: this drives the reconcile LOGIC end-to-end, not a spawned daemon
 * process — a real daemon boot additionally opens LMDB/Lance and bootstraps the
 * embedding model, which is out of scope for a fast, env-independent smoke. The
 * "daemon serves IPC" property is the daemon's own pre-existing boot path; what
 * this proves is that the reconcile it runs is convergent and namespace-safe.
 *
 * Run: npx tsx --test src/config/__tests__/config-reconcile-smoke.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { CONFIG_CATALOG, type ConfigOption } from '../config-catalog.js';
import { reconcileConfigFile } from '../reconcile-io.js';
import { runUpdateReconcile } from '../../cli/services/maintenance.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');
const readFixture = (name: string): Record<string, unknown> =>
	JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'));

function namespaces(doc: Record<string, unknown>): { roleTiers: unknown; byRepo: unknown; agents: unknown } {
	const models = doc['models'] as Record<string, unknown>;
	const analyze = models['analyze'] as Record<string, unknown>;
	return { roleTiers: analyze['roleTiers'], byRepo: analyze['byRepo'], agents: models['agents'] };
}

test('boot against a legacy config: normalized, all three dynamic namespaces byte-identical to the baseline', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-smoke-'));
	try {
		const configPath = join(dir, 'config.json');
		writeFileSync(configPath, JSON.stringify(readFixture('legacy-config.json'), null, 2));

		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG });
		assert.equal(out.kind, 'written');

		const after = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		const base = namespaces(readFixture('legacy-config.baseline.json'));
		assert.deepEqual(namespaces(after), base);
		// normalized: the type-invalid embeddingDim repaired, new catalog keys filled
		assert.equal((after['models'] as Record<string, unknown>)['embeddingDim'], 1024);
		assert.equal(((after['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>)['coreFloor'], 'mid');

		// Second boot against the now-normalized file → zero writes, mtime unchanged (convergence).
		const mtimeBefore = statSync(configPath).mtimeMs;
		const out2 = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG });
		assert.equal(out2.kind, 'unchanged');
		assert.equal(statSync(configPath).mtimeMs, mtimeBefore);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('first boot against an empty home → written values match the captured pre-change defaults literal', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-smoke-'));
	try {
		const configPath = join(dir, 'config.json');
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG });
		assert.equal(out.kind, 'first-boot');

		const written = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		const literal = readFixture('daemon-defaults-literal.json');
		// Every key the former literal covered is unchanged.
		assert.equal(written['logLevel'], literal['logLevel']);
		const wm = written['models'] as Record<string, unknown>;
		const lm = literal['models'] as Record<string, unknown>;
		assert.equal(wm['local'], lm['local']);
		assert.deepEqual(wm['tiers'], lm['tiers']);
		assert.deepEqual(wm['context'], lm['context']);
		assert.deepEqual(written['permissions'], literal['permissions']);
		assert.deepEqual(written['routing'], literal['routing']);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('update chain: a newly-catalogued key is added, a type-invalid key repaired, dynamic namespaces unchanged; repeat writes nothing', async () => {
	// A "freshly built" daemon root whose catalog GAINED a key relative to what
	// is on disk (models.analyze.coreFloor) and repairs the type-invalid one.
	const rows: readonly ConfigOption[] = [
		{ path: 'logLevel', type: 'enum', default: 'info', desc: '' },
		{ path: 'models.embeddingDim', type: 'number', default: 1024, desc: '' },
		{ path: 'models.analyze.coreFloor', type: 'enum', default: 'mid', desc: '' },
	];
	const root = mkdtempSync(join(tmpdir(), 'insrc-smoke-root-'));
	mkdirSync(join(root, 'out', 'config'), { recursive: true });
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	writeFileSync(join(root, 'out', 'config', 'config-catalog.js'), `export const CONFIG_CATALOG = ${JSON.stringify(rows)};\n`);

	const cfgDir = mkdtempSync(join(tmpdir(), 'insrc-smoke-cfg-'));
	const configPath = join(cfgDir, 'config.json');
	writeFileSync(configPath, JSON.stringify(readFixture('legacy-config.json'), null, 2));

	try {
		const s1 = await runUpdateReconcile(root, () => {}, configPath);
		assert.ok(s1.filled >= 1);        // coreFloor added
		assert.ok(s1.repaired >= 1);      // embeddingDim repaired

		const after = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		assert.equal(((after['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>)['coreFloor'], 'mid');
		assert.equal((after['models'] as Record<string, unknown>)['embeddingDim'], 1024);
		// dynamic namespaces unchanged vs baseline
		assert.deepEqual(namespaces(after), namespaces(readFixture('legacy-config.baseline.json')));

		// Repeat run → nothing to do.
		const s2 = await runUpdateReconcile(root, () => {}, configPath);
		assert.equal(s2.changed, false);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(cfgDir, { recursive: true, force: true });
	}
});
