/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc2 list-models dispatch tests (Epic ba132c185fe45860, S002), re-sourced from
 * the models.definitions projection (Epic ce99b72065d03b1b, s2 · t2).
 *
 * Every branch of listModels runs over injected deps: the real per-thread
 * registry built from a TEMP definitions dir and store, and a fake Ollama lister,
 * so no live daemon/ollama is needed. Plus: agreement with models.definitions for
 * every family, source scans (no cloud REST, no curated accessor left), the
 * handler-map entry, and the real shipped asset through the default deps.
 *
 * Run: npx tsx --test src/daemon/__tests__/list-models.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  listModels,
  type ListModelsDeps,
  type ModelInfo,
  type ModelListResult,
  type ListModelsError,
} from '../list-models.js';
import { _setModelCatalogDirForTests, validateModelCatalog } from '../model-catalog.js';
import { getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests } from '../model-registry.js';
import { modelDefinitions } from '../model-definitions.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..');

function fixture(): Record<string, unknown> {
  return {
    version: 1,
    defaultFamily: 'cli-claude',
    families: [
      {
        id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
        models: [{ id: 'claude-opus-5-5', aliases: ['opus'], displayName: 'Opus 5.5', efforts: ['low'] }, { id: 'claude-sonnet-5', efforts: ['low'] }],
        tierDefaults: { core: { model: 'opus' }, mid: { model: 'claude-sonnet-5' }, cheap: { model: 'claude-sonnet-5' } },
        summariserModel: 'claude-sonnet-5',
      },
      {
        id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
        models: [{ id: 'gpt-a', displayName: 'GPT A', efforts: ['low'] }],
        tierDefaults: { core: { model: 'gpt-a' }, mid: { model: 'gpt-a' }, cheap: { model: 'gpt-a' } },
        summariserModel: 'gpt-a',
      },
      {
        id: 'ollama', displayName: 'Ollama',
        models: [
          { id: 'qwen:1b', displayName: 'Qwen 1B', efforts: [], inputLimit: { unit: 'tokens', max: 8192 } },
          { id: 'qwen3.6:27b', efforts: [], inputLimit: { unit: 'tokens', max: 32768 } },
        ],
        toolLoopModel: 'qwen:1b',
      },
      { id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
      { id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
    ],
  };
}

const tmpDirs: string[] = [];
function tmp(): string { const d = mkdtempSync(join(tmpdir(), 'list-models-')); tmpDirs.push(d); return d; }

/** Point the registry at the fixture and a store with one approved and one rejected Codex model. */
function useFixture(): void {
  const assets = tmp();
  writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(fixture()));
  const store = join(tmp(), 'approved-models.json');
  writeFileSync(store, JSON.stringify({ version: 1, profiles: [
    { family: 'cli-codex', modelId: 'gpt-new', status: 'approved', efforts: ['low'], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '0.164.0' },
    { family: 'cli-codex', modelId: 'gpt-gone', status: 'rejected', efforts: [], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '0.164.0' },
  ] }));
  _setModelCatalogDirForTests(assets);
  _setApprovedModelsPathForTests(store);
}

/** Deps over the fixture registry; ollamaCalls counts lister invocations. */
function fakeDeps(ollamaList: () => Promise<readonly ModelInfo[]> = async () => []): { deps: ListModelsDeps; ollamaCalls: () => number } {
  let calls = 0;
  const deps: ListModelsDeps = {
    ollamaList: async () => { calls++; return ollamaList(); },
    registry: getModelRegistry,
    catalogVersion: () => validateModelCatalog().version,
  };
  return { deps, ollamaCalls: () => calls };
}

function asResult(v: ModelListResult | ListModelsError): ModelListResult {
  assert.ok(!('error' in v), `expected a ModelListResult, got an error: ${JSON.stringify(v)}`);
  return v;
}

afterEach(() => {
  _setModelCatalogDirForTests(undefined);
  _setApprovedModelsPathForTests(undefined);
  _resetModelRegistryForTests();
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test('list-models.test.ts: CLI families from the projection without calling the lister; ollama installed-and-listed only; available:false + [] on a rejecting lister; invalid params unchanged', async () => {
  useFixture();
  const { deps, ollamaCalls } = fakeDeps(async () => [{ id: 'qwen:1b' }, { id: 'llama3:8b' }]);

  const claude = asResult(await listModels({ provider: 'cli-claude' }, deps));
  assert.deepEqual(claude, { provider: 'cli-claude', available: true, models: [{ id: 'claude-opus-5-5', displayName: 'Opus 5.5' }, { id: 'claude-sonnet-5' }] });
  const codex = asResult(await listModels({ provider: 'cli-codex' }, deps));
  assert.deepEqual(codex.models, [{ id: 'gpt-a', displayName: 'GPT A' }, { id: 'gpt-new' }], 'shipped then user-approved; the rejected id is absent');
  assert.equal(ollamaCalls(), 0, 'a CLI family never calls the ollama lister');

  const ollama = asResult(await listModels({ provider: 'ollama' }, deps));
  assert.deepEqual(ollama, { provider: 'ollama', available: true, models: [{ id: 'qwen:1b', displayName: 'Qwen 1B' }] });
  assert.equal(ollamaCalls(), 1);

  for (const message of ['fetch failed', 'ollama model list timed out after 4000ms', 'ollama model list returned a malformed response (no models array)']) {
    const down = fakeDeps(async () => { throw new Error(message); });
    assert.deepEqual(await listModels({ provider: 'ollama' }, down.deps), { provider: 'ollama', available: false, models: [] }, message);
  }

  const none = fakeDeps(async () => [{ id: 'llama3:8b' }]);
  assert.deepEqual(await listModels({ provider: 'ollama' }, none.deps), { provider: 'ollama', available: true, models: [] }, 'reachable but none of the listed models installed');

  for (const bad of [{ provider: 'gpt' }, {}, null, 'ollama', { provider: 42 }]) {
    const probe = fakeDeps();
    const v = await listModels(bad, probe.deps);
    assert.deepEqual(v, { error: `invalid-params: provider must be one of 'ollama' | 'cli-claude' | 'cli-codex' | 'cli-vibe' | 'ollama-claude'`, recoverable: false }, JSON.stringify(bad));
    assert.equal(probe.ollamaCalls(), 0);
  }
});

test('list-models.test.ts: for every family listModels agrees with models.definitions, and an installed unlisted Ollama model appears in neither', async () => {
  useFixture();
  const lister = async (): Promise<readonly ModelInfo[]> => [{ id: 'qwen3.6:27b' }, { id: 'llama3:8b' }];
  const { deps } = fakeDeps(lister);
  const definitions = await modelDefinitions(deps);
  for (const family of definitions.families) {
    const listed = asResult(await listModels({ provider: family.id }, deps));
    const expected = family.models
      .filter(m => family.id !== 'ollama' || m.installed === true)
      .map(m => (m.displayName !== undefined ? { id: m.id, displayName: m.displayName } : { id: m.id }));
    assert.deepEqual(listed.models, expected, family.id);
    assert.ok(expected.length > 0, `${family.id}: the agreement is checked on a non-empty list`);
  }
  const ollamaDefs = definitions.families.find(f => f.id === 'ollama')!;
  assert.ok(!ollamaDefs.models.some(m => m.id === 'llama3:8b'));
  assert.ok(!asResult(await listModels({ provider: 'ollama' }, deps)).models.some(m => m.id === 'llama3:8b'));
});

test('list-models.test.ts: no file under src imports getCuratedCatalog, CuratedCatalog or CatalogModel', () => {
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|mts|tsx)$/.test(name)) continue;
      if (/\b(getCuratedCatalog|CuratedCatalog|CatalogModel)\b/.test(readFileSync(p, 'utf8'))) offenders.push(relative(SRC, p));
    }
  };
  walk(SRC);
  // This file names the symbols only inside its own test title and regex.
  assert.deepEqual(offenders.filter(f => f !== join('daemon', '__tests__', 'list-models.test.ts')), []);
});

test('read-only: the injected deps expose only read methods (no config-write path reachable)', async () => {
  useFixture();
  const { deps } = fakeDeps(async () => [{ id: 'qwen:1b' }]);
  await listModels({ provider: 'ollama' }, deps);
  await listModels({ provider: 'cli-claude' }, deps);
  assert.deepEqual(Object.keys(deps).sort(), ['catalogVersion', 'ollamaList', 'registry']);
});

test('source-scan: list-models.ts imports no cloud-REST / provider-SDK path (k1/ac4)', () => {
  const src = readFileSync(join(HERE, '..', 'list-models.ts'), 'utf8');
  const imports = [...src.matchAll(/^import[^;]*?from\s+'([^']+)'/gms)].map(m => m[1]!);
  for (const spec of imports) {
    assert.doesNotMatch(spec, /@anthropic|openai|undici|node:http|node:https|axios/i, `forbidden import: ${spec}`);
  }
  const runtime = [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map(m => m[1]!);
  assert.deepEqual(runtime, ['./model-definitions.js'], 'its only runtime dependency is the models.definitions projection');
});

test("handler map: 'providers.listModels' is a real handler delegating to listModels, not offlineRpc (lc1)", () => {
  const idx = readFileSync(join(HERE, '..', 'handler-runtime.ts'), 'utf8');
  const entries = [...idx.matchAll(/'providers\.listModels':\s*([^\n,]+)/g)].map(m => m[1]!.trim());
  assert.equal(entries.length, 1, 'exactly one providers.listModels entry (no dead duplicate) — lc1');
  assert.match(entries[0]!, /listModels\(params\)/, 'delegates to the sc2 listModels dispatch');
  assert.doesNotMatch(entries[0]!, /offlineRpc/, 'no longer the offline stub');
});

test('integration: listModels(cli-claude) with the default deps lists the shipped Claude models', async () => {
  // The shipped asset, with an empty approved-model store (not the user's own), so the answer is deterministic.
  _setApprovedModelsPathForTests(join(tmp(), 'approved-models.json'));
  const r = asResult(await listModels({ provider: 'cli-claude' }));   // default deps; a CLI family never reaches the real ollama lister
  assert.equal(r.available, true);
  assert.deepEqual(r.models.map(m => m.id), validateModelCatalog().families.find(f => f.id === 'cli-claude')!.models.map(m => m.id));
});

test("list-models.test.ts: providers.listModels admits exactly the registry's family ids with the unchanged invalid-params error", async () => {
  useFixture();
  const { deps } = fakeDeps(async () => [{ id: 'qwen:1b' }]);
  const ids = getModelRegistry().families().map(f => f.id);
  assert.deepEqual([...ids].sort(), ['cli-claude', 'cli-codex', 'cli-vibe', 'ollama', 'ollama-claude']);
  for (const id of ids) {
    const r = await listModels({ provider: id }, deps);
    assert.ok(!('error' in r), id);
    assert.equal((r as ModelListResult).provider, id);
  }
  for (const bad of ['cli-gemini', 'Ollama', 'claude', 'codex', '']) {
    assert.deepEqual(await listModels({ provider: bad }, deps), { error: `invalid-params: provider must be one of 'ollama' | 'cli-claude' | 'cli-codex' | 'cli-vibe' | 'ollama-claude'`, recoverable: false }, bad);
  }

  // The same text when the definitions file lists the families in another order.
  _resetModelRegistryForTests();
  const reordered = fixture();
  reordered['defaultFamily'] = 'cli-codex';
  reordered['families'] = [...(reordered['families'] as unknown[])].reverse();
  const assets = tmp();
  writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(reordered));
  _setModelCatalogDirForTests(assets);
  assert.deepEqual(getModelRegistry().families().map(f => f.id), ['cli-vibe', 'ollama-claude', 'ollama', 'cli-codex', 'cli-claude']);
  assert.deepEqual(await listModels({ provider: 'cli-gemini' }, fakeDeps().deps), { error: `invalid-params: provider must be one of 'ollama' | 'cli-claude' | 'cli-codex' | 'cli-vibe' | 'ollama-claude'`, recoverable: false });
});
