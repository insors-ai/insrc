/**
 * Story E20261030c5c764585f6714f7:S001 / t2 — the Model Tiers panel core.
 * renderModelTiers + createModelTiersWriteHandler over injected fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderModelTiers, createModelTiersWriteHandler, type ModelTiersWriteHandlerDeps, type ModelTiersWrite } from '../model-tiers.js';
import type { ModelDefinitions } from '../../models/definitions.js';
import type { ConfigWriteResult } from '../../config/types.js';

const DEFS: ModelDefinitions = {
  version: 1,
  defaultFamily: 'cli-claude',
  families: [
    {
      id: 'cli-claude', cliKind: 'claude', displayName: 'Claude Code',
      tierDefaults: { core: { model: 'c-big' }, mid: { model: 'c-big' }, cheap: { model: 'c-big' } },
      models: [{ id: 'c-big', aliases: [], efforts: ['high', 'max'], source: 'shipped' }],
    },
    {
      id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama',
      models: [{ id: 'glm-5.3', aliases: [], efforts: [], source: 'shipped', hosting: 'cloud' }],
    },
  ],
};

// ---- renderModelTiers -------------------------------------------------------

test('renderModelTiers: one labelled card per tier (core/mid/cheap), not a flat field list', async () => {
  const render = renderModelTiers({ modelDefinitions: async () => DEFS, rawConfig: async () => ({}) });
  const html = await render();
  assert.match(html, /<div class="tier">[^]*<b>core<\/b>/);
  assert.match(html, /<b>mid<\/b>/);
  assert.match(html, /<b>cheap<\/b>/);
  assert.equal((html.match(/<div class="tier">/g) ?? []).length, 3, 'exactly one card per tier, not a 9-field flat list');
  // Each card carries its own runner/model/effort selects, scoped by data-tier.
  assert.match(html, /<select data-tier="core" data-field="runner">/);
  assert.match(html, /<select data-tier="mid" data-field="model">/);
  assert.match(html, /<select data-tier="cheap" data-field="effort"/);
});

test('renderModelTiers: a tier resolved to the host-set family shows its cloud/local hosting badge; an unresolved model is flagged not-supported inline', async () => {
  const raw = { models: { tiers: { core: { runner: 'ollama-claude', model: 'glm-5.3' } } } };
  const html = await renderModelTiers({ modelDefinitions: async () => DEFS, rawConfig: async () => raw })();
  assert.match(html, /<span class="hosting-chip cloud">cloud<\/span>/, 'the resolved model\'s hosting badge is rendered');

  const gone = { models: { tiers: { core: { runner: 'ollama-claude', model: 'gone' } } } };
  const html2 = await renderModelTiers({ modelDefinitions: async () => DEFS, rawConfig: async () => gone })();
  assert.match(html2, /<div class="note err">[^]*gone[^]*is not supported by this runner/);
});

test('renderModelTiers: the panel-foot Core-floor <select> is bound to the current insrc.models.coreFloor value', async () => {
  const html = await renderModelTiers({ modelDefinitions: async () => DEFS, rawConfig: async () => ({ models: { coreFloor: 'cheap' } }) })();
  assert.match(html, /<select data-field="coreFloor">[^]*<option value="cheap" selected>/);

  // Unset -> the daemon's documented default ('mid'), not an unbound/empty select.
  const unset = await renderModelTiers({ modelDefinitions: async () => DEFS, rawConfig: async () => ({}) })();
  assert.match(unset, /<select data-field="coreFloor">[^]*<option value="mid" selected>/);
});

// ---- createModelTiersWriteHandler ------------------------------------------

function fakeDeps(over: { writeResult?: ConfigWriteResult; reject?: boolean } = {}): { deps: ModelTiersWriteHandlerDeps; calls: { segments: readonly string[]; value: unknown }[]; refreshes: () => number; warnings: string[] } {
  const calls: { segments: readonly string[]; value: unknown }[] = [];
  const warnings: string[] = [];
  let refreshes = 0;
  const deps: ModelTiersWriteHandlerDeps = {
    writeKeyPath: async (segments, value) => {
      calls.push({ segments, value });
      if (over.reject === true) throw new Error('daemon unreachable');
      return over.writeResult ?? { ok: true };
    },
    logger: { warn: (m) => warnings.push(m) },
    refresh: () => { refreshes += 1; },
  };
  return { deps, calls, refreshes: () => refreshes, warnings };
}

test("createModelTiersWriteHandler: a {kind:'tierField'} write maps to ['models','tiers',tier,field]; a {kind:'coreFloor'} write maps to ['models','coreFloor']", async () => {
  const { deps, calls } = fakeDeps();
  const handler = createModelTiersWriteHandler(deps);
  handler({ kind: 'tierField', tier: 'cheap', field: 'model', value: 'glm-5.3' });
  await Promise.resolve();
  assert.deepEqual(calls[0], { segments: ['models', 'tiers', 'cheap', 'model'], value: 'glm-5.3' });

  handler({ kind: 'coreFloor', value: 'core' });
  await Promise.resolve();
  assert.deepEqual(calls[1], { segments: ['models', 'coreFloor'], value: 'core' });
});

test('createModelTiersWriteHandler: refresh() runs on an accepted write and on a refused write, never on a rejected one', async () => {
  const ok = fakeDeps({ writeResult: { ok: true } });
  createModelTiersWriteHandler(ok.deps)({ kind: 'coreFloor', value: 'mid' });
  await Promise.resolve();
  assert.equal(ok.refreshes(), 1, 'an accepted write refreshes');

  const refused = fakeDeps({ writeResult: { ok: false, reason: 'invalid' } });
  createModelTiersWriteHandler(refused.deps)({ kind: 'coreFloor', value: 'mid' });
  await Promise.resolve();
  assert.equal(refused.refreshes(), 1, 'a refused (resolved) write still refreshes');

  const rejected = fakeDeps({ reject: true });
  createModelTiersWriteHandler(rejected.deps)({ kind: 'coreFloor', value: 'mid' });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(rejected.refreshes(), 0, 'a rejected write does not refresh');
  assert.match(rejected.warnings[0] ?? '', /the model-tiers write failed/);
});

test("createModelTiersWriteHandler: refresh wired exactly as extension.ts does (refresh: () => panelHost.openModelTiers()) invokes openModelTiers after a resolved write", async () => {
  let opens = 0;
  const panelHost = { openModelTiers: () => { opens += 1; } };
  const handler = createModelTiersWriteHandler({
    writeKeyPath: async () => ({ ok: true }),
    logger: { warn: () => {} },
    refresh: () => panelHost.openModelTiers(),
  });
  handler({ kind: 'coreFloor', value: 'mid' });
  await Promise.resolve();
  assert.equal(opens, 1, "the extension.ts-style refresh callback re-opens (re-renders) the Model Tiers panel after a resolved write");
});
