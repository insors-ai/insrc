/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The JetBrains ModelTiersModelTest's catalog fixture is exactly what the
 * settings catalog builder produces over the fixture's own definitions (Epic
 * ce99b72065d03b1b, Story s3 · t9), so the Kotlin test and the TS builder
 * cannot drift.
 *
 * Run: npx tsx --test src/config/__tests__/jetbrains-catalog-fixture.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildConfigCatalog } from '../config-catalog.js';
import { SHIPPED_DEFINITIONS } from '../model-defaults.js';
import type { ModelDefinitionsFile } from '../../daemon/model-catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FIXTURE = join(ROOT, 'jetbrains-plugin', 'src', 'test', 'resources', 'fixtures', 'model-tiers-catalog.json');

test('jetbrains-catalog-fixture.test.ts: the JetBrains catalog fixture equals buildConfigCatalog over its definitions', () => {
	const { definitions, options } = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { definitions: ModelDefinitionsFile; options: unknown[] };
	const tierRows = buildConfigCatalog(definitions).filter(o => o.path.startsWith('models.tiers.'));
	assert.deepEqual(options, JSON.parse(JSON.stringify(tierRows)));
	assert.equal(options.length, 9);
	// The fixture's defaults differ from the shipped ones, so the Kotlin test proves the values come from the catalog.
	assert.notEqual(definitions.defaultFamily, SHIPPED_DEFINITIONS.defaultFamily);
});
