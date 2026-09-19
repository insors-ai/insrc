/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the self-describing settings catalog (Story S001).
 *   - buildSettingsCatalog (the pure assembler) — the payload the config.catalog
 *     IPC returns; unit-tested off fixtures without a running daemon.
 *   - config.catalog handler READ-ONLY invariant — a source-scan of the thin
 *     wiring in src/daemon/index.ts (the handler lives inline in main(), so it
 *     is verified the same way config-catalog-contract.test.ts scans source).
 *
 * Run: npx tsx --test src/config/__tests__/settings-catalog.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { buildSettingsCatalog } from '../settings-catalog.js';
import { CONFIG_CATALOG } from '../config-catalog.js';
import { reasoningRoleTaxonomy } from '../role-taxonomy.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---- buildSettingsCatalog (t3) -------------------------------------------------

test('buildSettingsCatalog({}) returns all options + groups + roles + tierNames with values = {}', () => {
	const payload = buildSettingsCatalog({});
	// options are the enriched catalog verbatim
	assert.equal(payload.options.length, CONFIG_CATALOG.length);
	assert.equal(payload.options, CONFIG_CATALOG); // reference-identical (no copy)
	// groups are the distinct group labels in first-seen order
	const expectedGroups: string[] = [];
	for (const o of CONFIG_CATALOG) if (!expectedGroups.includes(o.group)) expectedGroups.push(o.group);
	assert.deepEqual(payload.groups, expectedGroups);
	// roles + tierNames are derived from the taxonomy, not hardcoded
	const taxonomy = reasoningRoleTaxonomy();
	assert.deepEqual(payload.roles, taxonomy.roles.map((r) => ({ id: r.id, defaultTier: r.defaultTier })));
	assert.deepEqual([...payload.tierNames].sort(), ['cheap', 'core', 'mid']);
	// no config ⇒ no current values
	assert.deepEqual(payload.values, {});
});

test('buildSettingsCatalog resolves current values from a config: set paths present, unset/absent omitted, non-catalog keys excluded', () => {
	const rawConfig = {
		logLevel: 'debug',                                  // a set catalog path (scalar)
		models: { tiers: { core: { runner: 'cli-codex' } } }, // a set nested catalog path
		// models.tiers.core.model is UNSET (absent leaf under a present intermediate)
		// models.shaper.* is entirely ABSENT (absent intermediate)
		models_tasks_placeholder: 'x',                      // not a catalog path shape
		'some.unknown.key': 'y',                            // a non-catalog dotted key
		models2: { tiers: {} },                             // decoy that shares no catalog path
	} as Record<string, unknown>;

	const { values } = buildSettingsCatalog(rawConfig);
	assert.equal(values['logLevel'], 'debug');
	assert.equal(values['models.tiers.core.runner'], 'cli-codex');
	// unset leaf under a present intermediate is omitted
	assert.equal('models.tiers.core.model' in values, false);
	// absent intermediate ⇒ omitted, no throw
	assert.equal('models.shaper.maxToolTurns' in values, false);
	// only catalog paths appear — no non-catalog keys leak in
	for (const key of Object.keys(values)) {
		assert.ok(CONFIG_CATALOG.some((o) => o.path === key), `values contains non-catalog key ${key}`);
	}
});

test('buildSettingsCatalog is total: a garbage/array-shaped rawConfig never throws', () => {
	assert.doesNotThrow(() => buildSettingsCatalog({ models: 'not-an-object' } as Record<string, unknown>));
	assert.doesNotThrow(() => buildSettingsCatalog({ models: { tiers: [] } } as Record<string, unknown>));
	const p = buildSettingsCatalog({ models: 'not-an-object' } as Record<string, unknown>);
	assert.equal('models.tiers.core.runner' in p.values, false); // scalar intermediate ⇒ omitted
});

// ---- config.catalog handler READ-ONLY invariant (t4) ---------------------------

test('config.catalog handler is read-only wiring: calls buildSettingsCatalog, never writes config or reloads', () => {
	const src = readFileSync(resolve(HERE, '..', '..', 'daemon', 'index.ts'), 'utf-8');
	// locate the config.catalog handler block up to the next handler entry
	const start = src.indexOf("'config.catalog':");
	assert.ok(start >= 0, "config.catalog handler is registered in src/daemon/index.ts");
	const block = src.slice(start, start + 600);
	assert.match(block, /buildSettingsCatalog\(/, 'handler delegates to buildSettingsCatalog');
	assert.match(block, /readFileSync\(PATHS\.config/, 'handler reads PATHS.config (parse-or-{})');
	// read-only: the handler body must not write config.json or reload sessions
	assert.doesNotMatch(block, /writeFileSync|setConfigAtPath|reloadChatConfig/, 'config.catalog must be read-only');
});
