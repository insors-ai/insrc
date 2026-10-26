/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic ce99b72065d03b1b, Story s6 · t3 — the native-settings key map is built from the
 * extension's own manifest (contributes.configuration), not from a bundled settings catalog.
 *
 * Run: npx tsx --test vscode-plugin/src/config/__tests__/key-map.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildConfigKeyMap, isPluginLocalKey, MERGED_KEY_MAP, type ManifestConfiguration } from '../key-map.js';

const FIXTURE: ManifestConfiguration = [
  { title: 'Daemon', properties: {
    'insrc.logLevel': { type: 'string', default: 'info', enum: ['debug', 'info', 'warn'], markdownDescription: 'log level' },
    'insrc.analyze.timeoutMs': { type: 'number', default: 1000, description: 'timeout' },
    'insrc.watcher.enabled': { type: 'boolean', default: true },
  } },
  { title: 'Models', properties: {
    'insrc.models.tiers.core.runner': { type: 'string', default: '', markdownDescription: "The core tier's model family (runner)." },
    'insrc.models.tiers.core.effort': { type: 'string', default: '' },
    'insrc.models.tasks.review': { type: 'string', default: 'core', enum: ['cheap', 'mid', 'core'] },
    'insrc.chat.enabled': { type: 'boolean', default: false },
  } },
];

test('key-map.test.ts: buildConfigKeyMap over a manifest fixture takes type / enum / default from the manifest, maps tier keys as plain strings, skips plugin-local keys, and key-map.ts does not import the settings catalog', () => {
  const map = buildConfigKeyMap(FIXTURE);
  assert.deepEqual(map.entries.map((e) => e.nativeKey), ['insrc.logLevel', 'insrc.analyze.timeoutMs', 'insrc.watcher.enabled', 'insrc.models.tiers.core.runner', 'insrc.models.tiers.core.effort']);
  assert.deepEqual(map.byNativeKey('insrc.logLevel')?.option, { path: 'logLevel', type: 'enum', default: 'info', desc: 'log level', enumValues: ['debug', 'info', 'warn'], group: 'Daemon' });
  assert.deepEqual(map.byPath('analyze.timeoutMs')?.option, { path: 'analyze.timeoutMs', type: 'number', default: 1000, desc: 'timeout', group: 'Daemon' });
  assert.equal(map.byPath('watcher.enabled')?.option.type, 'boolean');
  // Tier keys: plain strings with no enum — their valid values are the daemon's.
  const runner = map.byNativeKey('insrc.models.tiers.core.runner')?.option;
  assert.deepEqual([runner?.type, runner?.default, runner?.enumValues], ['string', '', undefined]);
  // Plugin-local keys are not catalog rows.
  assert.equal(map.byNativeKey('insrc.chat.enabled'), undefined);
  assert.equal(map.byNativeKey('insrc.models.tasks.review'), undefined);
  assert.equal(isPluginLocalKey('insrc.chat.enabled'), true);
  assert.equal(isPluginLocalKey('insrc.models.tasks.context.assemble'), true);
  assert.equal(isPluginLocalKey('insrc.models.tiers.core.model'), false);

  // The real manifest: the per-role keys still come from the taxonomy entries, each once.
  const roles = MERGED_KEY_MAP.entries.filter((e) => e.path.startsWith('models.tasks.'));
  assert.ok(roles.length > 0 && roles.every((e) => e.source === 'raw'), 'per-role entries come from buildPerRoleKeyMap');
  assert.equal(new Set(MERGED_KEY_MAP.entries.map((e) => e.nativeKey)).size, MERGED_KEY_MAP.entries.length, 'no key is mapped twice');

  // No import at all from the settings catalog module.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'key-map.ts'), 'utf8');
  assert.doesNotMatch(src, /config-catalog/);
  assert.doesNotMatch(src, /\bCONFIG_CATALOG\b/);
});
