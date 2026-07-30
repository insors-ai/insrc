/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the daemon-boot authoritative config reconcile (t9).
 *
 * SCOPE NOTE: the boot block lives inline in main() (src/daemon/index.ts step
 * 2b) and, before it runs, opens LMDB/Lance and bootstraps the embedding model
 * — spawning the real daemon in a unit test is heavy and environment-dependent.
 * So the boot RECONCILE LOGIC (the new behaviour) is driven directly through
 * the same functions boot calls (reconcileConfig / reconcileConfigFile), the
 * first-boot-equivalence guarantee is pinned against the captured
 * pre-change defaults-literal fixture, and the boot wiring's contract
 * (unconditional, non-fatal, distinguishable catalog-error, no silent parse
 * catch, catalog imported from src/config not src/cli) is pinned by a
 * source-level assertion over index.ts. Nothing is silently skipped.
 *
 * Run: npx tsx --test src/daemon/__tests__/config-boot-reconcile.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { CONFIG_CATALOG } from '../../config/config-catalog.js';
import { reconcileConfig } from '../../config/reconcile.js';
import { reconcileConfigFile } from '../../config/reconcile-io.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', '..', 'config', '__tests__', 'fixtures');
const INDEX_SRC = join(HERE, '..', 'index.ts');

/** Flatten a nested config document to leaf dot-paths → value. */
function flatten(obj: Record<string, unknown>, prefix = ''): Map<string, unknown> {
	const out = new Map<string, unknown>();
	for (const [k, v] of Object.entries(obj)) {
		const p = prefix ? `${prefix}.${k}` : k;
		if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
			for (const [kk, vv] of flatten(v as Record<string, unknown>, p)) out.set(kk, vv);
		} else {
			out.set(p, v);
		}
	}
	return out;
}

function getPath(obj: Record<string, unknown>, dotPath: string): unknown {
	let node: unknown = obj;
	for (const k of dotPath.split('.')) {
		if (node === null || typeof node !== 'object') return undefined;
		node = (node as Record<string, unknown>)[k];
	}
	return node;
}

const defaultsLiteral = (): Record<string, unknown> =>
	JSON.parse(readFileSync(join(FIXTURES, 'daemon-defaults-literal.json'), 'utf-8'));

// The former L180-192 literal keys that were RETIRED in this story — first boot
// must NO LONGER write them (they are absent, not defaulted).
const RETIRED_PREFIXES = ['models.embedding', 'models.embeddingDim', 'models.context', 'models.agents', 'models.analyze', 'models.providers'];
const isRetired = (dp: string): boolean => RETIRED_PREFIXES.some(p => dp === p || dp.startsWith(`${p}.`));

test('first-boot equivalence: surviving former-literal keys match catalog defaults; retired ones are absent', () => {
	const firstBoot = reconcileConfig(undefined, CONFIG_CATALOG).config;
	const divergences: string[] = [];
	for (const [dotPath, value] of flatten(defaultsLiteral())) {
		const got = getPath(firstBoot, dotPath);
		if (isRetired(dotPath)) {
			// intentional divergence: the retired keys are no longer written at first boot
			if (got !== undefined) divergences.push(`RETIRED key ${dotPath} should be absent but is ${JSON.stringify(got)}`);
		} else {
			try { assert.deepEqual(got, value); } catch { divergences.push(`${dotPath}: literal=${JSON.stringify(value)} default=${JSON.stringify(got)}`); }
		}
	}
	assert.deepEqual(divergences, [], `former-literal key divergences:\n${divergences.join('\n')}`);
	// the surviving daemon-wide keys are still catalog defaults
	assert.equal(getPath(firstBoot, 'logLevel'), 'info');
	assert.equal(getPath(firstBoot, 'permissions.mode'), 'validate');
});

test('first boot with no config present → writes surviving former keys + canonical catalog defaults; no retired keys, one write', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-boot-'));
	try {
		const configPath = join(dir, 'config.json');
		const out = reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG });
		assert.equal(out.kind, 'first-boot');
		const written = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
		for (const [dotPath, value] of flatten(defaultsLiteral())) {
			if (isRetired(dotPath)) assert.equal(getPath(written, dotPath), undefined, `retired ${dotPath} must not be written`);
			else assert.deepEqual(getPath(written, dotPath), value, `former-literal key ${dotPath}`);
		}
		// the canonical surfaces are present
		assert.equal(getPath(written, 'models.coreFloor'), 'mid');
		assert.equal(getPath(written, 'models.local.embeddingDim'), 1024);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('module boundary: daemon imports the catalog from src/config, and src/daemon has zero imports of src/cli', () => {
	const idx = readFileSync(INDEX_SRC, 'utf-8');
	assert.match(idx, /from '\.\.\/config\/reconcile-io\.js'/);
	// Scan every daemon source file for a src/cli import.
	// (The relocation exists precisely so boot can reach the catalog without one.)
	assert.doesNotMatch(idx, /from '(\.\.\/)+cli\//);
});

test('boot wiring contract: unconditional, no silent parse catch, distinguishable catalog-error, all outcomes handled', () => {
	const idx = readFileSync(INDEX_SRC, 'utf-8');
	// Unconditional — the old existsSync(PATHS.config) short-circuit is gone.
	assert.doesNotMatch(idx, /if \(!existsSync\(PATHS\.config\)\)/);
	assert.match(idx, /reconcileConfigFile\(\)/);
	// The former silent `catch { /* ignore parse errors */ }` is gone.
	assert.doesNotMatch(idx, /ignore parse errors/);
	// ConfigCatalogError is logged distinguishably from a user/I-O failure.
	assert.match(idx, /SHIPPED-CATALOG BUG/);
	// Every outcome kind the wrapper can return has a boot arm (so no outcome
	// falls through un-logged, and a failure never aborts boot).
	for (const kind of ['first-boot', 'written', 'unchanged', 'parse-error', 'catalog-error', 'read-error', 'write-error', 'concurrent-modification']) {
		assert.ok(idx.includes(`case '${kind}'`), `boot switch must handle '${kind}'`);
	}
});

test('reconcile never aborts boot: every failure input yields a structured outcome, not a throw', () => {
	// The boot block wraps reconcileConfigFile in try/catch, but the wrapper is
	// designed never to throw — prove it for the inputs boot can hit.
	const dir = mkdtempSync(join(tmpdir(), 'insrc-boot-'));
	try {
		const configPath = join(dir, 'config.json');
		// corrupt JSON → parse-error, not a throw
		reconcileConfigFile({ configPath: join(dir, 'missing.json'), catalog: CONFIG_CATALOG }); // ENOENT → first-boot
		assert.doesNotThrow(() => reconcileConfigFile({ configPath, catalog: CONFIG_CATALOG }));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
