/**
 * Story E20261023a27df028:S001 / t6 — the reasoning effort in the VS Code plugin:
 * the manifest declares the three effort settings exactly as the catalog does, and
 * the 'insrc: Set model tier' picker offers an effort step for a CLI tier.
 *
 * Run: npx tsx --test vscode-plugin/src/models/__tests__/tier-effort.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CONFIG_CATALOG } from '../../../../src/config/config-catalog.js';
import { runSetModelTier, type QuickPickItemLike, type SetModelTierDeps } from '../model-tier-picker.js';

const HERE = dirname(fileURLToPath(import.meta.url));

interface Item extends QuickPickItemLike { readonly kind?: string; readonly value?: string }

/** A scripted picker run: picks by value in order; returns the writes and every list shown. */
async function run(values: Map<string, unknown>, picks: readonly string[]) {
  const writes: { segments: string[]; value: unknown }[] = [];
  const shown: Item[][] = [];
  let i = 0;
  const deps: SetModelTierDeps = {
    listModels: async (provider) => ({ provider, available: true, models: [{ id: 'gpt-6.1-sol' }, { id: 'qwen3.6:27b' }] }),
    catalog: async () => ({ values }),
    writeKeyPath: async (segments, value) => { writes.push({ segments: [...segments], value }); return { ok: true }; },
    pick: async (items) => {
      shown.push(items as Item[]);
      const want = picks[i++];
      return (want === undefined ? undefined : (items as Item[]).find((x) => x.value === want)) as never;
    },
    notify: () => {},
  };
  await runSetModelTier(deps);
  return { writes, shown };
}

test("VS Code manifest declares insrc.models.tiers.<tier>.effort matching the catalog, and the tier picker offers an effort step for CLI runners and writes ['models','tiers',tier,'effort'] (from the plugin's bundled catalog, whatever the daemon's)", async () => {
  const manifest = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'package.json'), 'utf8')) as {
    contributes: { configuration: { properties?: Record<string, unknown> } | { properties?: Record<string, unknown> }[] };
  };
  const sections = Array.isArray(manifest.contributes.configuration) ? manifest.contributes.configuration : [manifest.contributes.configuration];
  const props = Object.assign({}, ...sections.map((s) => s.properties ?? {})) as Record<string, { type?: string; default?: unknown; enum?: unknown; scope?: string }>;
  for (const tier of ['core', 'mid', 'cheap']) {
    const row = CONFIG_CATALOG.find((o) => o.path === `models.tiers.${tier}.effort`)!;
    const decl = props[`insrc.models.tiers.${tier}.effort`];
    assert.ok(decl, `insrc.models.tiers.${tier}.effort is declared`);
    assert.deepEqual([decl.type, decl.default, decl.enum, decl.scope], ['string', row.default, row.enumValues, 'machine']);
  }

  // A CLI tier: the model is unchanged (no model write), the effort step offers the CLI default + five values
  // with the saved one marked, and the pick is written. The daemon's snapshot has no effort row at all.
  const values = new Map<string, unknown>([['models.tiers.core.runner', 'cli-codex'], ['models.tiers.core.model', 'gpt-6.1-sol'], ['models.tiers.core.effort', 'medium']]);
  const cli = await run(values, ['core', 'cli-codex', 'gpt-6.1-sol', 'high']);
  const effortStep = cli.shown[3]!;
  assert.deepEqual(effortStep.map((x) => x.label), ['CLI default', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(effortStep.find((x) => x.value === 'medium')?.description, '(current)');
  assert.deepEqual(cli.writes, [{ segments: ['models', 'tiers', 'core', 'effort'], value: 'high' }]);

  // Choosing the CLI default writes ''; choosing the current effort writes nothing.
  assert.deepEqual((await run(values, ['core', 'cli-codex', 'gpt-6.1-sol', ''])).writes, [{ segments: ['models', 'tiers', 'core', 'effort'], value: '' }]);
  assert.deepEqual((await run(values, ['core', 'cli-codex', 'gpt-6.1-sol', 'medium'])).writes, []);

  // An Ollama tier gets no effort step: the model write is the last thing that happens.
  const local = await run(new Map([['models.tiers.cheap.runner', 'ollama'], ['models.tiers.cheap.model', 'qwen3.6:27b']]), ['cheap', 'ollama', 'gpt-6.1-sol']);
  assert.equal(local.shown.length, 3, 'tier, provider, model — no effort step');
  assert.deepEqual(local.writes, [{ segments: ['models', 'tiers', 'cheap', 'model'], value: 'gpt-6.1-sol' }]);
});
