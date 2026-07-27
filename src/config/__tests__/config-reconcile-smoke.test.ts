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

/** The LIVE dynamic namespaces (roleTiers/byRepo) that must survive a reconcile. */
function liveNamespaces(doc: Record<string, unknown>): { roleTiers: unknown; byRepo: unknown } {
	const analyze = (doc['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>;
	return { roleTiers: analyze['roleTiers'], byRepo: analyze['byRepo'] };
}

test('boot against a legacy config: retired keys stripped, live namespaces byte-identical, then converges', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-smoke-'));
	try {
		const configPath = join(dir, 'config.json');
		writeFileSync(configPath, JSON.stringify(readFixture('legacy-config.json'), null, 2));

		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG });
		assert.equal(out.kind, 'written');

		const after = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		const models = after['models'] as Record<string, unknown>;
		// live namespaces survive byte-identical to the baseline
		assert.deepEqual(liveNamespaces(after), liveNamespaces(readFixture('legacy-config.baseline.json')));
		// every retired model key is gone (incl. the type-invalid embeddingDim + models.agents)
		for (const k of ['local', 'embedding', 'embeddingDim', 'tiers', 'context', 'agents']) {
			assert.equal(Object.prototype.hasOwnProperty.call(models, k), false, `models.${k} must be stripped`);
		}
		// canonical catalog defaults filled
		assert.equal((models['analyze'] as Record<string, unknown>)['coreFloor'], 'mid');

		// Second boot against the now-normalized file → zero writes, mtime unchanged (convergence).
		const mtimeBefore = statSync(configPath).mtimeMs;
		const out2 = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG });
		assert.equal(out2.kind, 'unchanged');
		assert.equal(statSync(configPath).mtimeMs, mtimeBefore);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('first boot against an empty home → surviving former-literal keys written, retired keys NOT written, canonical surfaces present', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-smoke-'));
	try {
		const configPath = join(dir, 'config.json');
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG });
		assert.equal(out.kind, 'first-boot');

		const written = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		const literal = readFixture('daemon-defaults-literal.json');
		// surviving daemon-wide keys unchanged from the former literal
		assert.equal(written['logLevel'], literal['logLevel']);
		assert.deepEqual(written['permissions'], literal['permissions']);
		assert.deepEqual(written['routing'], literal['routing']);
		// retired legacy model keys are NOT written at first boot
		const wm = written['models'] as Record<string, unknown>;
		for (const k of ['local', 'embedding', 'embeddingDim', 'tiers', 'context']) {
			assert.equal(Object.prototype.hasOwnProperty.call(wm, k), false, `models.${k} must not be written`);
		}
		// the canonical surfaces ARE present
		assert.equal((wm['analyze'] as Record<string, unknown>)['coreFloor'], 'mid');
		assert.equal((wm['providers'] as Record<string, Record<string, unknown>>)['local']!['embeddingDim'], 1024);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('update chain: newly-catalogued key added, type-invalid key repaired, retired keys pruned, live namespaces unchanged; repeat writes nothing', async () => {
	// A "freshly built" daemon-root catalog (all non-retired paths so it is
	// disjoint from RETIRED_PATHS): gains svc.port, repairs a type-invalid one.
	const rows: readonly ConfigOption[] = [
		{ path: 'logLevel', type: 'enum', default: 'info', desc: '' },
		{ path: 'svc.port', type: 'number', default: 8080, desc: '' },
		{ path: 'models.analyze.coreFloor', type: 'enum', default: 'mid', desc: '' },
	];
	const root = mkdtempSync(join(tmpdir(), 'insrc-smoke-root-'));
	mkdirSync(join(root, 'out', 'config'), { recursive: true });
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	writeFileSync(join(root, 'out', 'config', 'config-catalog.js'), `export const CONFIG_CATALOG = ${JSON.stringify(rows)};\n`);

	// On-disk config: a type-invalid svc.port, a retired models.tiers block, and a live roleTiers namespace.
	const cfgDir = mkdtempSync(join(tmpdir(), 'insrc-smoke-cfg-'));
	const configPath = join(cfgDir, 'config.json');
	writeFileSync(configPath, JSON.stringify({
		logLevel: 'info',
		svc: { port: 'not-a-number' },
		models: { tiers: { fast: 'x' }, analyze: { roleTiers: { a: 'core' } } },
	}, null, 2));

	try {
		const s1 = await runUpdateReconcile(root, () => {}, configPath);
		assert.ok(s1.filled >= 1);     // models.analyze.coreFloor added
		assert.ok(s1.repaired >= 1);   // svc.port repaired
		assert.ok(s1.pruned >= 1);     // models.tiers pruned

		const after = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		const models = after['models'] as Record<string, unknown>;
		assert.equal((models['analyze'] as Record<string, unknown>)['coreFloor'], 'mid');
		assert.equal((after['svc'] as Record<string, unknown>)['port'], 8080);
		assert.equal(Object.prototype.hasOwnProperty.call(models, 'tiers'), false);   // retired pruned
		assert.deepEqual((models['analyze'] as Record<string, unknown>)['roleTiers'], { a: 'core' }); // live survived

		// Repeat run → nothing to do.
		const s2 = await runUpdateReconcile(root, () => {}, configPath);
		assert.equal(s2.changed, false);
	} finally {
		rmSync(root, { recursive: true, force: true });
		rmSync(cfgDir, { recursive: true, force: true });
	}
});
