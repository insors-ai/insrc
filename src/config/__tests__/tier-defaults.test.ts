/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016ab934d09:S001 — the built-in tier defaults and the places that repeat them.
 *
 * The cheap tier defaults to the Claude CLI's haiku, a Codex install names the GPT-6 models, the
 * background summariser follows the cheap tier (and pins its model for a CLI), and the two copies
 * of the installer agree. Plain string checks on the installer: no shell is run.
 *
 * Run: npx tsx --test src/config/__tests__/tier-defaults.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleConfig, DEFAULT_TIERS, parseTiering } from '../analyze.js';
import { CONFIG_CATALOG } from '../config-catalog.js';
import { buildSummariserProvider } from '../../analyze/context/shaper-provider.js';
import { CliProvider } from '../../agent/providers/cli-provider.js';
import { OllamaProvider } from '../../agent/providers/ollama.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const SHAPER = { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 20480 };
const DEPTH  = { XS: 2, S: 3, M: 4, L: 5, XL: 6 };
const defaultOf = (path: string): unknown => CONFIG_CATALOG.find(o => o.path === path)?.default;
/** The model a CliProvider was constructed with (private, read for the assertion). */
const pinnedModel = (p: unknown): string | undefined => (p as { defaultModel?: string }).defaultModel;

test('src/config/__tests__/tier-defaults.test.ts: the config catalog\'s cheap and mid tier defaults equal DEFAULT_TIERS', () => {
  assert.deepEqual(DEFAULT_TIERS.cheap, { runner: 'cli-claude', model: 'haiku' });
  for (const tier of ['mid', 'cheap'] as const) {
    assert.equal(defaultOf(`models.tiers.${tier}.runner`), DEFAULT_TIERS[tier].runner, `${tier} runner`);
    assert.equal(defaultOf(`models.tiers.${tier}.model`), DEFAULT_TIERS[tier].model, `${tier} model`);
  }
});

test('src/config/__tests__/tier-defaults.test.ts: the summariser follows the cheap tier and pins its model for a CLI, so the built-in default runs the Claude CLI on haiku', () => {
  const cfg = assembleConfig({}, SHAPER, DEPTH);
  assert.equal(cfg.summariserProvider, 'cli-claude');
  assert.equal(cfg.summariserModel, 'haiku');
  const provider = buildSummariserProvider(cfg);
  assert.ok(provider instanceof CliProvider, 'the default summariser is a CLI provider');
  assert.equal(pinnedModel(provider), 'haiku', 'the model is pinned, not the CLI default');
  // A cheap tier on ollama keeps the summariser local, as before.
  const local = assembleConfig({ tiers: { core: DEFAULT_TIERS.core, mid: DEFAULT_TIERS.mid, cheap: { runner: 'ollama', model: 'qwen3.6:27b' } } }, SHAPER, DEPTH);
  assert.ok(buildSummariserProvider(local) instanceof OllamaProvider);
});

test('src/config/__tests__/tier-defaults.test.ts: the installer\'s claude choice writes cheap cli-claude haiku and its codex choice writes gpt-6-astra, gpt-6.1-sol and gpt-6-luna', () => {
  const script = read('scripts/insrc-daemon-install.sh');
  const claude = script.slice(script.indexOf('else\n\tok "CLI: claude'), script.indexOf('fi\n\nif [ "$RESOLVED_EMBEDDER"'));
  assert.match(claude, /"cheap": \{ "runner": "cli-claude", "model": "haiku" \}/);
  assert.match(claude, /"core":  \{ "runner": "cli-claude", "model": "opus" \}/);
  const codex = script.slice(script.indexOf('if [ "$CLI_CHOICE" = "codex" ]'), script.indexOf('else\n\tok "CLI: claude'));
  assert.match(codex, /"core":  \{ "runner": "cli-codex", "model": "gpt-6-astra" \}/);
  assert.match(codex, /"mid":   \{ "runner": "cli-codex", "model": "gpt-6\.1-sol" \}/);
  assert.match(codex, /"cheap": \{ "runner": "cli-codex", "model": "gpt-6-luna" \}/);
  assert.equal(script.includes('gpt-5.5'), false, 'no stale Codex model is left in the installer');
});

test('src/config/__tests__/tier-defaults.test.ts: the plugin\'s copy of the installer is identical to the script', () => {
  assert.equal(read('vscode-plugin/assets/insrc-daemon-install.sh'), read('scripts/insrc-daemon-install.sh'));
});

test("a global tier dropped for an empty or invalid model keeps its configured effort on the DEFAULT_TIERS fallback (assembleConfig's shaperEffort / summariserEffort)", () => {
  // The catalog default for core.model is '', which drops the core tier.
  const tiering = parseTiering({ tiers: { core: { runner: 'cli-codex', model: '', effort: 'high' }, cheap: { runner: 'bogus', model: 'x', effort: 'low' } } });
  assert.equal(tiering.tiers, undefined, 'both tiers are dropped as before');
  const cfg = assembleConfig(tiering, SHAPER, DEPTH);
  assert.deepEqual(cfg.tiering.tiers?.core, { ...DEFAULT_TIERS.core, effort: 'high' });
  assert.deepEqual(cfg.tiering.tiers?.cheap, { ...DEFAULT_TIERS.cheap, effort: 'low' });
  assert.equal(cfg.shaperEffort, 'high');
  assert.equal(cfg.summariserEffort, 'low');
  assert.equal(cfg.shaperProviderExplicit, false, 'a fallback is still not explicit');
  assert.equal(cfg.shaperModelExplicit, false);
  // A kept tier carries its own effort; no effort configured gives none.
  const kept = assembleConfig(parseTiering({ tiers: { cheap: { runner: 'ollama', model: 'qwen3.6:27b', effort: 'medium' } } }), SHAPER, DEPTH);
  assert.equal(kept.summariserEffort, 'medium');
  assert.equal(kept.shaperEffort, undefined);
  assert.equal('shaperEffort' in assembleConfig({}, SHAPER, DEPTH), false);
});
