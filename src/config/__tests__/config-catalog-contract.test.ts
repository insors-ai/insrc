/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contract tests (t6): the module-boundary + catalog-integrity properties no
 * runtime data test can observe.
 *
 * NOTE (contract-subject ownership): this file owns SIX of the seven LLD
 * contract-level subjects (module boundary, single definition site, re-export
 * identity, real-catalog self-consistency, real-catalog idempotence, switch
 * exhaustiveness). The SEVENTH — `MaintenanceResult.configReconcile` being
 * optional and additive — is owned by t11 (its compile-time contract fixture
 * at src/cli/services/type-contracts/maintenance-result.ts) and must NOT be
 * duplicated here, so every LLD contract subject has exactly one owner.
 *
 * Run: npx tsx --test src/config/__tests__/config-catalog-contract.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { CONFIG_CATALOG as FROM_CONFIG } from '../config-catalog.js';
import { CONFIG_CATALOG as FROM_CLI } from '../../cli/config-catalog.js';
import { ConfigCatalogError, reconcileConfig } from '../reconcile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(HERE, '..');           // src/config
const CLI_DIR = resolve(HERE, '..', '..', 'cli'); // src/cli

/** Recursively collect .ts/.tsx source files under a dir, skipping __tests__. */
function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			if (name === '__tests__') continue;
			out.push(...sourceFiles(full));
		} else if ((name.endsWith('.ts') || name.endsWith('.tsx')) && !name.endsWith('.d.ts')) {
			out.push(full);
		}
	}
	return out;
}

/** Static import/export-from specifiers (literal only). */
function importSpecifiers(src: string): string[] {
	const specs: string[] = [];
	for (const m of src.matchAll(/(?:import|export)\b[^'";]*?from\s*['"]([^'"]+)['"]/g)) specs.push(m[1]!);
	for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]!);
	return specs;
}

test('src/config/** contains no import of src/cli (static scan of resolved specifiers)', () => {
	const offenders: string[] = [];
	for (const file of sourceFiles(CONFIG_DIR)) {
		for (const spec of importSpecifiers(readFileSync(file, 'utf-8'))) {
			if (!spec.startsWith('.')) continue;
			const resolved = resolve(dirname(file), spec);
			if (resolved.includes(`${resolve(CLI_DIR)}/`) || resolved === resolve(CLI_DIR)) {
				offenders.push(`${file} → ${spec}`);
			}
		}
	}
	assert.deepEqual(offenders, [], `src/config must not import src/cli:\n${offenders.join('\n')}`);
});

test('src/config/config-catalog.ts is the single definition site of CONFIG_CATALOG and ConfigOption', () => {
	const defSrc = readFileSync(join(CONFIG_DIR, 'config-catalog.ts'), 'utf-8');
	assert.match(defSrc, /export const CONFIG_CATALOG/);
	assert.match(defSrc, /export interface ConfigOption/);

	const shimSrc = readFileSync(join(CLI_DIR, 'config-catalog.ts'), 'utf-8');
	// The shim declares NOTHING — only re-exports.
	assert.doesNotMatch(shimSrc, /export const CONFIG_CATALOG\s*[:=]/);
	assert.doesNotMatch(shimSrc, /export interface ConfigOption/);
	assert.match(shimSrc, /export\s*\{\s*CONFIG_CATALOG\s*\}\s*from\s*['"]\.\.\/config\/config-catalog\.js['"]/);
});

test('the src/cli re-export is reference-identical to the src/config definition (no duplicate literal)', () => {
	assert.equal(FROM_CLI, FROM_CONFIG);
});

test('the real CONFIG_CATALOG has 41 rows', () => {
	assert.equal(FROM_CONFIG.length, 41);
});

test('real CONFIG_CATALOG self-consistency: every row in-domain, every default satisfies its predicate', () => {
	// reconcileConfig({}, CONFIG_CATALOG) throws ConfigCatalogError iff a row
	// has an out-of-domain type or a default that fails its own predicate.
	assert.doesNotThrow(() => reconcileConfig({}, FROM_CONFIG));
	// And no row is out of the discriminant domain, checked directly.
	const DOMAIN = new Set(['string', 'number', 'boolean', 'enum']);
	for (const row of FROM_CONFIG) assert.ok(DOMAIN.has(row.type), `row ${row.path} type ${row.type} out of domain`);
});

test('reconcileConfig({}, CONFIG_CATALOG) is idempotent on the real catalog — second pass changed === false', () => {
	const once = reconcileConfig({}, FROM_CONFIG);
	const twice = reconcileConfig(once.config, FROM_CONFIG);
	assert.equal(twice.changed, false);
});

test('ConfigCatalogError is the class thrown for catalog-integrity failures (not a bare Error)', () => {
	// Sanity anchor for the self-consistency guarantee above: the real catalog
	// never produces this, but a broken row does — and it is this exact class.
	assert.throws(
		() => reconcileConfig({}, [{ path: 'x', type: 'nope' as never, default: '', desc: '' }]),
		ConfigCatalogError,
	);
});
