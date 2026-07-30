/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the maintenance.update post-build config reconcile (t12).
 *
 * SCOPE NOTE: update()'s git-fetch / npm-install / npm-build plumbing is
 * pre-existing, unchanged, and spawns real subprocesses against DAEMON_ROOT
 * (bound from process.env at module load) and the REAL PATHS.config — none of
 * which is cleanly isolable in-process without risking the developer's actual
 * daemon checkout and config. So the NEW reconcile step is driven through the
 * exported `runUpdateReconcile` / `summarizeReconcile` (the exact logic update()
 * runs, minus that unchanged plumbing) with a temp config-path seam and a temp
 * built-catalog fixture, and the sequencing/unconditional/no-new-flag
 * properties are pinned by a source-level assertion over update(). Nothing is
 * silently skipped.
 *
 * Run: npx tsx --test src/cli/services/__tests__/maintenance-reconcile.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { runUpdateReconcile, summarizeReconcile } from '../maintenance.js';
import type { ConfigOption } from '../../../config/config-catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAINTENANCE_SRC = join(HERE, '..', 'maintenance.ts');

/** A temp "daemon root" whose out/config/config-catalog.js is a freshly built
 *  ESM catalog module carrying `rows`. */
function makeRoot(rows: readonly ConfigOption[]): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-daemon-root-'));
	mkdirSync(join(dir, 'out', 'config'), { recursive: true });
	writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
	writeFileSync(join(dir, 'out', 'config', 'config-catalog.js'),
		`export const CONFIG_CATALOG = ${JSON.stringify(rows)};\n`);
	return dir;
}

function tempConfig(obj: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-upd-cfg-'));
	const path = join(dir, 'config.json');
	writeFileSync(path, JSON.stringify(obj, null, 2));
	return path;
}

function row(path: string, type: ConfigOption['type'], def: unknown): ConfigOption {
	return { path, type, default: def, desc: '' };
}

test('success: fills a newly-catalogued key, reports counts + one detail line per key, preserves dynamic namespaces', async () => {
	const root = makeRoot([row('newKey', 'string', 'nv'), row('logLevel', 'enum', 'info')]);
	// models.tasks is a live dynamic namespace (NOT retired) → must survive.
	const configPath = tempConfig({ logLevel: 'info', models: { tasks: { a: 'core' } } });
	const logs: string[] = [];
	try {
		const summary = await runUpdateReconcile(root, l => logs.push(l), configPath);
		assert.equal(summary.changed, true);
		assert.equal(summary.filled, 1);
		assert.equal(summary.repaired, 0);
		assert.ok(logs.some(l => /1 filled, 0 repaired/.test(l)), 'summary line');
		assert.ok(logs.some(l => l.includes('newKey')), 'detail line names the catalog dot-path');
		const written = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		assert.equal(written['newKey'], 'nv');
		assert.deepEqual((written['models'] as Record<string, unknown>)['tasks'], { a: 'core' }); // dynamic survived
	} finally {
		rmSync(dirname(configPath), { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
});

test('no change → an explicit no-change onLog line (silence would fail)', async () => {
	const root = makeRoot([row('logLevel', 'enum', 'info')]);
	const configPath = tempConfig({ logLevel: 'info' });
	const logs: string[] = [];
	try {
		const summary = await runUpdateReconcile(root, l => logs.push(l), configPath);
		assert.equal(summary.changed, false);
		assert.ok(logs.some(l => /no changes needed/.test(l)));
	} finally {
		rmSync(dirname(configPath), { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
});

test('ancestor-collision repair → detail line names both the catalog path and the discarded scalar', async () => {
	// Use a non-retired path (svc.endpoint) so the collision is isolated from RETIRED_PATHS.
	const root = makeRoot([row('svc.endpoint', 'string', 'https://x')]);
	const configPath = tempConfig({ svc: 'oops-a-string' });
	const logs: string[] = [];
	try {
		const summary = await runUpdateReconcile(root, l => logs.push(l), configPath);
		assert.equal(summary.repaired, 1);
		assert.ok(logs.some(l => l.includes('svc.endpoint') && l.includes('oops-a-string')));
	} finally {
		rmSync(dirname(configPath), { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
});

test('shipped-catalog bug → distinguishable message + configReconcile.error, nothing written', async () => {
	const root = makeRoot([row('x.y', 'nope' as never, '')]);
	const configPath = tempConfig({ ok: true });
	const logs: string[] = [];
	try {
		const summary = await runUpdateReconcile(root, l => logs.push(l), configPath);
		assert.ok(summary.error && /shipped-catalog bug/i.test(summary.error));
		assert.ok(logs.some(l => /SHIPPED-CATALOG BUG/.test(l)));
		assert.equal(summary.changed, false);
	} finally {
		rmSync(dirname(configPath), { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
});

test('stale-catalog: built catalog not loadable → defers to daemon boot, reports the deferral, writes nothing', async () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-daemon-root-')); // NO out/config/config-catalog.js
	const configPath = tempConfig({ logLevel: 'info' });
	const before = readFileSync(configPath, 'utf-8');
	const logs: string[] = [];
	try {
		const summary = await runUpdateReconcile(root, l => logs.push(l), configPath);
		assert.ok(summary.error && /deferred to daemon boot/.test(summary.error));
		assert.ok(logs.some(l => /deferring to next daemon boot/.test(l)));
		assert.equal(readFileSync(configPath, 'utf-8'), before); // untouched — no confident no-change claimed
	} finally {
		rmSync(dirname(configPath), { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
});

test('runUpdateReconcile never throws — a read failure is captured into the summary (inner try/catch)', async () => {
	const root = makeRoot([row('logLevel', 'enum', 'info')]);
	const badDir = mkdtempSync(join(tmpdir(), 'insrc-upd-cfg-'));
	const configPath = join(badDir, 'config.json');
	mkdirSync(configPath); // config path is a directory → read-error inside reconcileConfigFile
	const logs: string[] = [];
	try {
		await assert.doesNotReject(async () => {
			const summary = await runUpdateReconcile(root, l => logs.push(l), configPath);
			assert.equal(summary.changed, false);
		});
	} finally {
		rmSync(badDir, { recursive: true, force: true });
		rmSync(root, { recursive: true, force: true });
	}
});

test('summarizeReconcile emits exactly one summary line + one detail line per filled/repaired/pruned key', () => {
	const logs: string[] = [];
	const summary = summarizeReconcile({
		kind: 'written',
		result: {
			config: {}, changed: true,
			carried: ['a'],
			filled: ['b.c', 'd'],
			repaired: [{ path: 'e.f', discarded: 'bad' }],
			pruned: ['models.analyze', 'models.providers'],
		},
	}, l => logs.push(l));
	assert.equal(summary.filled, 2);
	assert.equal(summary.repaired, 1);
	assert.equal(summary.pruned, 2);
	const summaryLines = logs.filter(l => /filled,/.test(l));
	assert.equal(summaryLines.length, 1);                       // exactly one summary line
	assert.ok(/2 filled, 1 repaired, 2 pruned/.test(summaryLines[0]!));
	assert.equal(logs.filter(l => /^\s*filled/.test(l)).length, 2);
	assert.equal(logs.filter(l => /^\s*repaired/.test(l)).length, 1);
	assert.equal(logs.filter(l => /^\s*pruned/.test(l)).length, 2);
	assert.ok(logs.some(l => l.includes('e.f') && l.includes('bad'))); // discarded value named
	assert.ok(logs.some(l => /^\s*pruned\s+models\.analyze/.test(l)));   // pruned path named
});

test('summarizeReconcile: a config with ONLY retired keys to prune reports pruned>0, changed, filled/repaired 0', () => {
	const logs: string[] = [];
	const summary = summarizeReconcile({
		kind: 'written',
		result: { config: {}, changed: true, carried: ['x'], filled: [], repaired: [], pruned: ['models.agents'] },
	}, l => logs.push(l));
	assert.equal(summary.changed, true);
	assert.equal(summary.filled, 0);
	assert.equal(summary.repaired, 0);
	assert.equal(summary.pruned, 1);
});

test('SOURCE contract: the reconcile is sequenced after build, is unconditional, and adds no UpdateOptions flag', () => {
	const src = readFileSync(MAINTENANCE_SRC, 'utf-8');
	const buildIdx = src.indexOf("steps.push('build')");
	const reconcileIdx = src.indexOf("steps.push('reconcile')");
	assert.ok(buildIdx > 0 && reconcileIdx > 0);
	assert.ok(reconcileIdx > buildIdx, 'reconcile must be sequenced after build');
	// The reconcile call is not guarded by any opt-in flag.
	assert.match(src, /const configReconcile = await runUpdateReconcile\(root, onLog\);/);
	// UpdateOptions gains no reconcile field.
	const updateOptions = src.slice(src.indexOf('interface UpdateOptions'), src.indexOf('interface MaintenanceResult'));
	assert.doesNotMatch(updateOptions, /reconcile/i);
});
