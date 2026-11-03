/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic ce99b72065d03b1b, Story s6 · t4 — the native-settings sync engine over the REAL key map
 * (built from the extension's package.json): a tier edit in VS Code Settings is checked against
 * the daemon's model definitions (a fake answer whose names match nothing shipped) and written as
 * the whole tier; an invalid edit is reverted; restartRequired is offered once per batch.
 *
 * Run: npx tsx --test vscode-plugin/src/config/__tests__/manifest-key-map-engine.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MERGED_KEY_MAP } from '../key-map.js';
import { createConfigSyncEngine } from '../sync-engine.js';
import type { ConfigWriteResult, SettingsStore } from '../types.js';
import type { ModelDefinitions } from '../../models/definitions.js';

const DEFS: ModelDefinitions = {
  version: 1,
  defaultFamily: 'cli-codex',
  families: [
    { id: 'cli-claude', cliKind: 'claude', displayName: 'FakeC', tierDefaults: { core: { model: 'c-big' }, mid: { model: 'c-big' }, cheap: { model: 'c-big' } },
      models: [{ id: 'c-big', aliases: ['cb'], efforts: ['deep'], source: 'shipped' }] },
    { id: 'cli-codex', cliKind: 'codex', displayName: 'FakeX', tierDefaults: { core: { model: 'x-a', effort: 'lo' }, mid: { model: 'x-a' }, cheap: { model: 'x-b' } },
      models: [{ id: 'x-a', aliases: [], efforts: ['lo', 'turbo'], source: 'shipped' }, { id: 'x-b', aliases: ['xb'], efforts: ['lo'], source: 'shipped' }] },
    { id: 'ollama', displayName: 'FakeLocal', toolLoopModel: 'loc:1', models: [{ id: 'loc:1', aliases: [], efforts: [], source: 'shipped', installed: true }] },
  ],
};

/** An engine over the real key map with a fake daemon and an in-memory settings store. */
function harness(opts: { results?: ConfigWriteResult[]; definitions?: () => Promise<ModelDefinitions> } = {}) {
  const daemon = new Map<string, unknown>([
    ['models.tiers.core.runner', 'cli-codex'], ['models.tiers.core.model', 'x-a'], ['models.tiers.core.effort', 'lo'],
    ['logLevel', 'info'],
  ]);
  const native = new Map<string, unknown>();
  const writes: Array<[string | readonly string[], unknown]> = [];
  const errors: string[] = [];
  const restarts: Array<readonly string[]> = [];
  const results = [...(opts.results ?? [])];
  const answer = (): ConfigWriteResult => results.shift() ?? { ok: true };
  const settings: SettingsStore = {
    read: (key) => native.get(key),
    write: async (key, value) => { native.set(key, value); },
    snapshot: () => new Map(native),
  };
  const engine = createConfigSyncEngine({
    gateway: {
      catalog: async () => ({ values: new Map(daemon) }),
      writeKey: async (key, value) => { writes.push([key, value]); return answer(); },
      writeKeyPath: async (segments, value) => { writes.push([[...segments], value]); return answer(); },
      rawConfig: async () => ({}),
    },
    settings,
    notifier: { error: (m) => { errors.push(m); } },
    keyMap: MERGED_KEY_MAP,
    definitions: opts.definitions ?? (async () => DEFS),
    onRestartRequired: (keys) => { restarts.push(keys); },
  });
  /** Simulate a Settings edit: the native value changes, then the change event fires. */
  const edit = async (pairs: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(pairs)) native.set(k, v);
    await engine.applyChanges(Object.entries(pairs).map(([key, value]) => ({ key, value })));
  };
  return { engine, native, writes, errors, restarts, edit };
}

const K = (field: string, tier = 'core') => `insrc.models.tiers.${tier}.${field}`;

test('manifest-key-map-engine.test.ts: native tier edits over the real merged key map are validated against the definitions and written whole; invalid edits revert; restartRequired calls onRestartRequired once', async () => {
  // The real key map maps the tier keys as plain strings (no built-in list) and not the plugin-local keys.
  for (const field of ['runner', 'model', 'effort']) {
    const option = MERGED_KEY_MAP.byNativeKey(K(field))?.option;
    assert.deepEqual([option?.type, option?.enumValues], ['string', undefined], field);
  }
  assert.equal(MERGED_KEY_MAP.byNativeKey('insrc.chat.enabled'), undefined);

  // A served model (by alias): ONE whole-tier write, canonical id, native keys mirror it.
  let h = harness({ results: [{ ok: true, restartRequired: true }] });
  await h.engine.pullFromDaemon();
  assert.deepEqual([h.native.get(K('runner')), h.native.get(K('model')), h.native.get(K('effort'))], ['cli-codex', 'x-a', 'lo']);
  await h.edit({ [K('model')]: 'xb' });
  assert.deepEqual(h.writes, [[['models', 'tiers', 'core'], { runner: 'cli-codex', model: 'x-b', effort: 'lo' }]]);
  assert.equal(h.native.get(K('model')), 'x-b', 'the alias is shown as the canonical id');
  assert.deepEqual(h.restarts, [[K('model')]], 'restartRequired offered once for the batch');
  assert.deepEqual(h.errors, []);
  // The mirror's own echo writes nothing more.
  await h.engine.applyChanges([{ key: K('model'), value: 'x-b' }]);
  assert.equal(h.writes.length, 1);

  // A runner-only change: the new family's default model; an effort it does not take is dropped.
  h = harness();
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: 'cli-claude' });
  assert.deepEqual(h.writes, [[['models', 'tiers', 'core'], { runner: 'cli-claude', model: 'c-big', effort: '' }]]);
  assert.deepEqual([h.native.get(K('model')), h.native.get(K('effort'))], ['c-big', '']);

  // A runner-only change takes the new family's default even when the new family also serves the old model's name.
  const shared: ModelDefinitions = { ...DEFS, families: DEFS.families.map((f) => f.id !== 'cli-claude' ? f : { ...f, models: [...f.models, { id: 'x-a', aliases: [], efforts: ['deep'], source: 'shipped' as const }] }) };
  h = harness({ definitions: async () => shared });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: 'cli-claude' });
  assert.deepEqual(h.writes, [[['models', 'tiers', 'core'], { runner: 'cli-claude', model: 'c-big', effort: '' }]], 'the family default, not the same-named model');

  // A model-only change that leaves an effort the new model does not take is refused, not silently changed.
  h = harness();
  await h.engine.pullFromDaemon();
  await h.edit({ [K('effort')]: 'turbo' });
  h.writes.length = 0; h.errors.length = 0;
  await h.edit({ [K('model')]: 'x-b' });
  assert.deepEqual(h.writes, []);
  assert.match(h.errors.join('\n'), /effort 'turbo' is not accepted by x-b \(accepted: lo\) — change or clear the effort/);
  assert.equal(h.native.get(K('model')), 'x-a', 'reverted');

  // Two fields of one tier in one batch make one write.
  h = harness();
  await h.engine.pullFromDaemon();
  await h.edit({ [K('model')]: 'x-a', [K('effort')]: 'turbo' });
  assert.deepEqual(h.writes, [[['models', 'tiers', 'core'], { runner: 'cli-codex', model: 'x-a', effort: 'turbo' }]]);

  // Invalid edits write nothing and revert the changed key with the reason.
  const invalid: Array<[Record<string, unknown>, RegExp]> = [
    [{ [K('model')]: 'x-new' }, /'x-new' is not a model the daemon lists for FakeX — run 'insrc: Set model tier' to check and approve it/],
    [{ [K('model')]: 'c-big' }, /'c-big' is not a model the daemon lists for FakeX/],
    [{ [K('effort')]: 'deep' }, /effort 'deep' is not accepted by x-a \(accepted: lo, turbo\)/],
    [{ [K('runner')]: 'cli-nope' }, /'cli-nope' is not a model family the daemon serves \(cli-claude, cli-codex, ollama\)/],
    [{ [K('runner')]: 'ollama', [K('model')]: 'loc:9' }, /'loc:9' is not a listed FakeLocal model; only listed FakeLocal models can be used \(loc:1\)/],
  ];
  for (const [pairs, message] of invalid) {
    h = harness();
    await h.engine.pullFromDaemon();
    await h.edit(pairs);
    assert.deepEqual(h.writes, [], JSON.stringify(pairs));
    assert.match(h.errors.join('\n'), message);
    assert.deepEqual([h.native.get(K('runner')), h.native.get(K('model')), h.native.get(K('effort'))], ['cli-codex', 'x-a', 'lo'], 'reverted');
  }

  // definitions() failing: the classified message, the edit reverted, nothing written.
  for (const [err, message] of [
    [new Error('daemon is not running — start it with: insrc daemon start'), /could not check the core tier — the daemon is not running — change not applied/],
    [new Error('unknown method: models.definitions'), /update the daemon/],
    [Object.assign(new Error('closed'), { code: 'disconnected' }), /the daemon closed the connection/],
    [new Error('invalid response from daemon'), /could not check the core tier — invalid response from daemon — change not applied/],
  ] as const) {
    h = harness({ definitions: async () => { throw err; } });
    await h.engine.pullFromDaemon();
    await h.edit({ [K('model')]: 'x-b' });
    assert.deepEqual(h.writes, []);
    assert.match(h.errors.join('\n'), message);
    if (!/unknown method/.test(err.message)) assert.doesNotMatch(h.errors.join('\n'), /update the daemon/, 'only an unknown method says to update');
    assert.equal(h.native.get(K('model')), 'x-a');
  }

  // A refusal carries the daemon's detail and reverts.
  h = harness({ results: [{ ok: false, reason: 'rejected-model', detail: "models.tiers.core: model 'x-b' is rejected in cli-codex" }] });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('model')]: 'x-b' });
  assert.match(h.errors.join('\n'), /daemon rejected the core tier — rejected-model — models\.tiers\.core: model 'x-b' is rejected in cli-codex/);
  assert.equal(h.native.get(K('model')), 'x-a');

  // A non-tier key still writes its own path; its restartRequired joins the batch's single offer.
  h = harness({ results: [{ ok: true, restartRequired: true }, { ok: true, restartRequired: true }] });
  await h.engine.pullFromDaemon();
  await h.edit({ 'insrc.logLevel': 'debug', [K('effort')]: 'turbo' });
  assert.deepEqual(h.writes, [['logLevel', 'debug'], [['models', 'tiers', 'core'], { runner: 'cli-codex', model: 'x-a', effort: 'turbo' }]]);
  assert.deepEqual(h.restarts, [['insrc.logLevel', K('effort')]]);

  // Emptying all three fields clears the tier (the definitions' default applies).
  h = harness();
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: '', [K('model')]: '', [K('effort')]: '' });
  assert.deepEqual(h.writes, [[['models', 'tiers', 'core'], null]]);
});

/** DEFS plus a family that runs its CLI on Ollama (Epic b220bb61, Story s4): no tierDefaults,
 *  a cloud model with efforts and an alias, a local one without. */
const HOSTED: ModelDefinitions = {
  ...DEFS,
  families: [...DEFS.families, {
    id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'FakeH',
    models: [
      { id: 'hc:cloud', aliases: ['hc'], efforts: ['low', 'max'], source: 'shipped', hosting: 'cloud' },
      { id: 'hl:7b', aliases: [], efforts: [], source: 'shipped', hosting: 'local' },
    ],
  }],
};
const hosted = async () => HOSTED;
const tierOf = (h: ReturnType<typeof harness>) => [h.native.get(K('runner')), h.native.get(K('model')), h.native.get(K('effort'))];

test("manifest-key-map-engine.test.ts: an undeclared model for the host family is refused with 'only listed models can be used' and reverted; a vendor or host-less family keeps 'check and approve it'; a daemon refusal reverts", async () => {
  let h = harness({ definitions: hosted });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: 'ollama-claude', [K('model')]: 'gone:cloud' });
  assert.deepEqual(h.writes, []);
  assert.match(h.errors.join('\n'), /'gone:cloud' is not a listed FakeH model; only listed FakeH models can be used \(hc:cloud, hl:7b\) — core tier not changed/);
  assert.doesNotMatch(h.errors.join('\n'), /check and approve/);
  assert.deepEqual(tierOf(h), ['cli-codex', 'x-a', 'lo'], 'every changed key reverted');

  // A vendor CLI family keeps the check-and-approve message.
  h = harness({ definitions: hosted });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('model')]: 'x-new' });
  assert.match(h.errors.join('\n'), /'x-new' is not a model the daemon lists for FakeX — run 'insrc: Set model tier' to check and approve it/);

  // An older daemon answers without host: the same family is a vendor CLI family again.
  const old: ModelDefinitions = { ...HOSTED, families: HOSTED.families.map((f) => {
    if (f.host === undefined) return f;
    const { host: _host, ...rest } = f;
    return rest;
  }) };
  h = harness({ definitions: async () => old });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: 'ollama-claude', [K('model')]: 'gone:cloud' });
  assert.deepEqual(h.writes, []);
  assert.match(h.errors.join('\n'), /'gone:cloud' is not a model the daemon lists for FakeH — run 'insrc: Set model tier' to check and approve it/);

  // The daemon's own refusal of a host-family write reverts every changed key with its reason.
  h = harness({ definitions: hosted, results: [{ ok: false, reason: 'model-not-supported', detail: 'models.tiers.core: hc:cloud is not supported' }] });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: 'ollama-claude', [K('model')]: 'hc:cloud', [K('effort')]: '' });
  assert.equal(h.writes.length, 1, 'the plugin accepts it and asks the daemon');
  assert.match(h.errors.join('\n'), /daemon rejected the core tier — model-not-supported — models\.tiers\.core: hc:cloud is not supported/);
  assert.deepEqual(tierOf(h), ['cli-codex', 'x-a', 'lo']);
});

test('manifest-key-map-engine.test.ts: a runner-only switch to the host family writes its first declared model as the whole tier and mirrors the native keys; an alias is written canonically; an effort the model does not take is refused', async () => {
  // Runner only: the family's first declared model (no tierDefaults); the old effort 'lo' it does not take is dropped.
  let h = harness({ definitions: hosted });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: 'ollama-claude' });
  assert.deepEqual(h.writes, [[['models', 'tiers', 'core'], { runner: 'ollama-claude', model: 'hc:cloud', effort: '' }]]);
  assert.deepEqual(tierOf(h), ['ollama-claude', 'hc:cloud', ''], 'mirrored into the native keys');
  assert.deepEqual(h.errors, []);

  // A declared model by alias, with an effort it takes: the canonical id.
  h = harness({ definitions: hosted });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: 'ollama-claude', [K('model')]: 'hc', [K('effort')]: 'max' });
  assert.deepEqual(h.writes, [[['models', 'tiers', 'core'], { runner: 'ollama-claude', model: 'hc:cloud', effort: 'max' }]]);
  assert.equal(h.native.get(K('model')), 'hc:cloud');

  // An effort the declared model does not take is refused and reverted.
  h = harness({ definitions: hosted });
  await h.engine.pullFromDaemon();
  await h.edit({ [K('runner')]: 'ollama-claude', [K('model')]: 'hl:7b', [K('effort')]: 'max' });
  assert.deepEqual(h.writes, []);
  assert.match(h.errors.join('\n'), /effort 'max' is not accepted by hl:7b \(it takes none\)/);
  assert.deepEqual(tierOf(h), ['cli-codex', 'x-a', 'lo']);
});
