/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc2 list-models dispatch tests (Epic ba132c185fe45860, S002 / t4).
 *
 * Every branch of listModels is exercised over injected deps (a fake ollama
 * lister + a stub CuratedCatalog) so no live daemon/ollama is needed — mirroring
 * the S001 inject-the-dependency approach. Plus: the real-getCuratedCatalog cloud
 * path (post validateModelCatalog), a source-scan guarding no-cloud-REST, and a
 * source-scan of the daemon handler-map entry confirming it is revived (not
 * offlineRpc).
 *
 * Run: npx tsx --test src/daemon/__tests__/list-models.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  listModels,
  type ListModelsDeps,
  type ModelInfo,
  type ModelListResult,
  type ListModelsError,
} from '../list-models.js';
import type { CuratedCatalog, CloudProvider } from '../model-catalog.js';
import { validateModelCatalog, getCuratedCatalog } from '../model-catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A stub CuratedCatalog with known per-provider arrays. */
function stubCatalog(map: Partial<Record<CloudProvider, readonly ModelInfo[]>>): CuratedCatalog {
  return {
    modelsFor(provider: CloudProvider) {
      return map[provider] ?? [];
    },
  };
}

/** A ListModelsDeps whose ollamaList / catalog are driven per-test; ollamaCalls
 *  counts invocations so a cloud request can assert the lister is never called. */
function fakeDeps(opts: {
  ollamaList?: () => Promise<readonly ModelInfo[]>;
  catalog?: CuratedCatalog;
}): { deps: ListModelsDeps; ollamaCalls: () => number } {
  let calls = 0;
  const deps: ListModelsDeps = {
    ollamaList: async () => {
      calls++;
      if (opts.ollamaList) return opts.ollamaList();
      return [];
    },
    catalog: () => opts.catalog ?? stubCatalog({}),
  };
  return { deps, ollamaCalls: () => calls };
}

function asResult(v: ModelListResult | ListModelsError): ModelListResult {
  assert.ok(!('error' in v), `expected a ModelListResult, got an error: ${JSON.stringify(v)}`);
  return v;
}

// ── cloud branch ────────────────────────────────────────────────

test("listModels('cli-claude') -> curated list mapped from CatalogModel, available:true", async () => {
  const catalog = stubCatalog({ 'cli-claude': [{ id: 'claude-opus-5-5', displayName: 'Opus 5.5' }, { id: 'claude-sonnet-5' }] });
  const { deps } = fakeDeps({ catalog });
  const r = asResult(await listModels({ provider: 'cli-claude' }, deps));
  assert.equal(r.provider, 'cli-claude');
  assert.equal(r.available, true);
  assert.deepEqual(r.models, [{ id: 'claude-opus-5-5', displayName: 'Opus 5.5' }, { id: 'claude-sonnet-5' }]);
});

test("listModels('cli-codex') -> the cli-codex curated list, available:true", async () => {
  const catalog = stubCatalog({ 'cli-codex': [{ id: 'gpt-5-codex' }] });
  const { deps } = fakeDeps({ catalog });
  const r = asResult(await listModels({ provider: 'cli-codex' }, deps));
  assert.deepEqual(r.models, [{ id: 'gpt-5-codex' }]);
  assert.equal(r.available, true);
});

test('cloud branch: an empty curated array stays available:true + []', async () => {
  const { deps } = fakeDeps({ catalog: stubCatalog({ 'cli-claude': [] }) });
  const r = asResult(await listModels({ provider: 'cli-claude' }, deps));
  assert.equal(r.available, true);
  assert.deepEqual(r.models, []);
});

test('ac4: the ollama lister is NEVER called for a cloud provider (no HTTP path)', async () => {
  const { deps, ollamaCalls } = fakeDeps({ catalog: stubCatalog({ 'cli-claude': [{ id: 'x' }] }) });
  await listModels({ provider: 'cli-claude' }, deps);
  assert.equal(ollamaCalls(), 0, 'cloud must not touch the ollama lister');
});

// ── ollama branch ──────────────────────────────────────────────

test("listModels('ollama') success -> available:true + mapped models", async () => {
  const { deps } = fakeDeps({ ollamaList: async () => [{ id: 'llama3' }, { id: 'qwen3' }] });
  const r = asResult(await listModels({ provider: 'ollama' }, deps));
  assert.equal(r.provider, 'ollama');
  assert.equal(r.available, true);
  assert.deepEqual(r.models, [{ id: 'llama3' }, { id: 'qwen3' }]);
});

test("listModels('ollama') with a REJECTING lister (unreachable) -> available:false + []", async () => {
  const { deps } = fakeDeps({ ollamaList: async () => { throw new Error('fetch failed'); } });
  const r = asResult(await listModels({ provider: 'ollama' }, deps));
  assert.equal(r.available, false);
  assert.deepEqual(r.models, []);
});

test("listModels('ollama') with a lister that rejects on timeout -> available:false + []", async () => {
  const { deps } = fakeDeps({ ollamaList: async () => { throw new Error('ollama model list timed out after 4000ms'); } });
  const r = asResult(await listModels({ provider: 'ollama' }, deps));
  assert.equal(r.available, false);
  assert.deepEqual(r.models, []);
});

test("listModels('ollama') with a lister that rejects on malformed -> available:false + []", async () => {
  const { deps } = fakeDeps({ ollamaList: async () => { throw new Error('malformed response'); } });
  const r = asResult(await listModels({ provider: 'ollama' }, deps));
  assert.equal(r.available, false);
  assert.deepEqual(r.models, []);
});

test("listModels('ollama') reachable-but-zero -> available:true + [] (distinct from failure)", async () => {
  const { deps } = fakeDeps({ ollamaList: async () => [] });
  const r = asResult(await listModels({ provider: 'ollama' }, deps));
  assert.equal(r.available, true);
  assert.deepEqual(r.models, []);
});

// ── invalid provider + read-only ───────────────────────────────────

test('unknown/missing provider -> invalid-params error result, no throw, no mutation', async () => {
  for (const bad of [{ provider: 'gpt' }, {}, null, 'ollama', { provider: 42 }]) {
    const { deps, ollamaCalls } = fakeDeps({});
    const v = await listModels(bad, deps);
    assert.ok('error' in v, `expected invalid-params for ${JSON.stringify(bad)}`);
    assert.match(v.error, /invalid-params/);
    assert.equal(v.recoverable, false);
    assert.equal(ollamaCalls(), 0, 'invalid provider must not touch the lister');
  }
});

test('read-only: the injected deps expose only read methods (no config-write path reachable)', async () => {
  // The dispatch only calls deps.catalog().modelsFor and deps.ollamaList — both reads.
  const { deps } = fakeDeps({ ollamaList: async () => [{ id: 'a' }], catalog: stubCatalog({ 'cli-claude': [{ id: 'b' }] }) });
  await listModels({ provider: 'ollama' }, deps);
  await listModels({ provider: 'cli-claude' }, deps);
  // No mutation surface exists on ListModelsDeps; this test documents + guards that.
  assert.deepEqual(Object.keys(deps).sort(), ['catalog', 'ollamaList']);
});

// ── no-cloud-REST source scan (k1/ac4) ────────────────────────────

test('source-scan: list-models.ts imports no cloud-REST / provider-SDK path (k1/ac4)', () => {
  const src = readFileSync(join(HERE, '..', 'list-models.ts'), 'utf8');
  const imports = [...src.matchAll(/^import[^\n]*from\s+'([^']+)'/gm)].map(m => m[1]!);
  for (const spec of imports) {
    assert.doesNotMatch(spec, /@anthropic|openai|undici|node:http|node:https|axios/i, `forbidden import: ${spec}`);
  }
  // The only runtime dependencies are the ollama provider + the sc1 catalog.
  assert.ok(imports.some(s => s.includes('model-catalog')), 'reads the curated catalog (sc1)');
  assert.ok(imports.some(s => s.includes('providers/ollama')), 'lists ollama via the vetted provider');
});

// ── handler-map wiring (t3): revived, not offlineRpc (lc1) ───────────────

test("handler map: 'providers.listModels' is a real handler delegating to listModels, not offlineRpc (lc1)", () => {
  const idx = readFileSync(join(HERE, '..', 'index.ts'), 'utf8');
  const entries = [...idx.matchAll(/'providers\.listModels':\s*([^\n,]+)/g)].map(m => m[1]!.trim());
  assert.equal(entries.length, 1, 'exactly one providers.listModels entry (no dead duplicate) — lc1');
  assert.match(entries[0]!, /listModels\(params\)/, 'delegates to the sc2 listModels dispatch');
  assert.doesNotMatch(entries[0]!, /offlineRpc/, 'no longer the offline stub');
});

// ── integration: the real getCuratedCatalog cloud path (post-boot) ─────────

test('integration: listModels(cloud) sources from the REAL getCuratedCatalog after validateModelCatalog', async () => {
  await validateModelCatalog();   // no override -> the shipped catalog
  const expected = getCuratedCatalog().modelsFor('cli-claude').map(m => m.id);
  const r = asResult(await listModels({ provider: 'cli-claude' }));   // default deps = real getCuratedCatalog + real ollama lister (not reached for cloud)
  assert.equal(r.available, true);
  assert.deepEqual(r.models.map(m => m.id), expected);
  assert.ok(r.models.length > 0, 'the shipped catalog has cli-claude models');
});
