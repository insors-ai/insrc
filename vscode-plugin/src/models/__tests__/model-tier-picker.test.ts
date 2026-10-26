/**
 * The 'insrc: Set model tier' picker on the daemon's model definitions (Epic
 * ce99b72065d03b1b, Story s6). Fake seams; the fake definitions answer names
 * nothing in the shipped file, so every option the picker shows comes from it.
 *
 * Run: npx tsx --test vscode-plugin/src/models/__tests__/model-tier-picker.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runSetModelTier, type QuickPickItemLike, type SetModelTierDeps } from '../model-tier-picker.js';
import type { ModelDefinitions } from '../definitions.js';
import type { ConfigWriteResult } from '../../config/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DEFS: ModelDefinitions = {
  version: 1,
  defaultFamily: 'cli-codex',
  families: [
    { id: 'cli-claude', cliKind: 'claude', displayName: 'FakeC', tierDefaults: { core: { model: 'c-big' }, mid: { model: 'c-big' }, cheap: { model: 'c-big' } },
      models: [{ id: 'c-big', aliases: ['cb'], efforts: ['deep', 'deeper'], source: 'shipped' }, { id: 'c-new', aliases: [], efforts: [], source: 'user-approved' }] },
    { id: 'cli-codex', cliKind: 'codex', displayName: 'FakeX', tierDefaults: { core: { model: 'x-a', effort: 'lo' }, mid: { model: 'x-a' }, cheap: { model: 'x-b' } },
      models: [{ id: 'x-a', aliases: [], efforts: ['lo', 'turbo'], source: 'shipped' }, { id: 'x-b', aliases: ['xb'], efforts: ['lo'], source: 'shipped' }] },
    { id: 'ollama', displayName: 'FakeLocal', toolLoopModel: 'loc:1',
      models: [{ id: 'loc:1', aliases: [], efforts: [], source: 'shipped', installed: true }, { id: 'loc:2', aliases: [], efforts: [], source: 'shipped', installed: false }] },
  ],
};

interface Item extends QuickPickItemLike { readonly kind?: string; readonly value?: string }

/**
 * A scripted run: each pick is a value (or a label for value-less rows) chosen in order;
 * returns the writes, every list shown, the messages and the restarts.
 */
export async function run(opts: {
  picks: readonly string[];
  raw?: Record<string, unknown>;
  defs?: () => Promise<ModelDefinitions>;
  write?: (segments: readonly string[], value: unknown) => Promise<ConfigWriteResult>;
  restart?: () => Promise<boolean>;
  actions?: readonly (string | undefined)[];
  extra?: Partial<SetModelTierDeps>;
}) {
  const writes: Array<{ segments: string[]; value: unknown }> = [];
  const shown: Item[][] = [];
  const messages: string[] = [];
  let restarts = 0;
  let i = 0;
  const actions = [...(opts.actions ?? [])];
  const deps: SetModelTierDeps = {
    definitions: opts.defs ?? (async () => DEFS),
    rawConfig: async () => opts.raw ?? {},
    writeKeyPath: async (segments, value) => {
      writes.push({ segments: [...segments], value });
      return opts.write ? opts.write(segments, value) : { ok: true };
    },
    restartDaemon: async () => { restarts++; return opts.restart ? opts.restart() : true; },
    pick: async (items) => {
      shown.push(items as Item[]);
      const want = opts.picks[i++];
      return (want === undefined ? undefined : (items as Item[]).find((x) => x.value === want || (x.value === undefined && x.label === want))) as never;
    },
    notify: async (message) => { messages.push(message); return actions.shift(); },
    ...opts.extra,
  };
  await runSetModelTier(deps);
  return { writes, shown, messages, restarts: () => restarts };
}

const TIER = (runner: string, model: string, effort = '') => ({ models: { tiers: { core: { runner, model, effort } } } });

test("model-tier-picker.test.ts: the family, model and effort steps offer exactly the fake answer's options and a pick writes the whole tier once; request failures are classified", async () => {
  // Family step: exactly the answer's families, the current one marked.
  let r = await run({ picks: ['core', 'cli-claude', 'c-big', 'deeper'], raw: TIER('cli-codex', 'x-a', 'lo') });
  assert.deepEqual(r.shown[1]!.map((x) => [x.label, x.description]), [['FakeC', 'cli-claude'], ['FakeX', 'cli-codex (current)'], ['FakeLocal', 'ollama']]);
  // Model step: the family's models with aliases and the user-approved mark, plus Refresh — no typed entry yet.
  assert.deepEqual(r.shown[2]!.map((x) => [x.label, x.description]), [['c-big', 'alias cb'], ['c-new', '(user-approved)'], ['$(refresh) Refresh', undefined]]);
  // Effort step: the CLI default then the model's own levels.
  assert.deepEqual(r.shown[3]!.map((x) => x.label), ['CLI default', 'deep', 'deeper']);
  // ONE whole-tier write.
  assert.deepEqual(r.writes, [{ segments: ['models', 'tiers', 'core'], value: { runner: 'cli-claude', model: 'c-big', effort: 'deeper' } }]);
  assert.match(r.messages.at(-1)!, /core tier set to c-big \(cli-claude, effort deeper\)/);

  // The current model and effort are marked; a model with no efforts skips the effort step.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', 'turbo'], raw: TIER('cli-codex', 'x-a', 'lo') });
  assert.equal(r.shown[2]!.find((x) => x.value === 'x-a')?.description, '(current)');
  assert.equal(r.shown[3]!.find((x) => x.value === 'lo')?.description, '(current)');
  r = await run({ picks: ['core', 'ollama', 'loc:2'], raw: TIER('cli-codex', 'x-a', 'lo') });
  assert.deepEqual(r.shown[2]!.map((x) => [x.label, x.description]), [['loc:1', undefined], ['loc:2', '(not installed)'], ['$(refresh) Refresh', undefined]]);
  assert.equal(r.shown.length, 3, 'tier, family, model — no effort step');
  assert.deepEqual(r.writes, [{ segments: ['models', 'tiers', 'core'], value: { runner: 'ollama', model: 'loc:2', effort: '' } }]);

  // An unset tier shows the definitions' default (default family, its tierDefault) as current.
  r = await run({ picks: ['core', 'cli-codex', 'x-b'] });
  assert.equal(r.shown[1]!.find((x) => x.value === 'cli-codex')?.description, 'cli-codex (current)');
  assert.equal(r.shown[2]!.find((x) => x.value === 'x-a')?.description, '(current)');

  // A configured model the family no longer lists is marked and not selectable.
  r = await run({ picks: ['core', 'cli-codex', '(current, not listed — runs the default): x-gone'], raw: TIER('cli-codex', 'x-gone') });
  assert.equal(r.shown[2]![0]!.kind, 'current-not-listed');
  assert.deepEqual(r.writes, [], 'choosing the notice writes nothing');

  // An unchanged choice writes nothing.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', 'lo'], raw: TIER('cli-codex', 'x-a', 'lo') });
  assert.deepEqual(r.writes, []);
  assert.match(r.messages.at(-1)!, /unchanged/);

  // A refusal shows reason and detail; restartRequired offers a restart, run on the action.
  r = await run({ picks: ['core', 'cli-codex', 'x-b', 'lo'], write: async () => ({ ok: false, reason: 'rejected-model', detail: "model 'x-b' is rejected in cli-codex" }) });
  assert.match(r.messages.at(-1)!, /the core tier was not saved: rejected-model — model 'x-b' is rejected in cli-codex/);
  r = await run({ picks: ['core', 'cli-codex', 'x-b', 'lo'], write: async () => ({ ok: true, restartRequired: true }), actions: ['Restart daemon'] });
  assert.match(r.messages[0]!, /restart the daemon to apply/);
  assert.equal(r.restarts(), 1);
  r = await run({ picks: ['core', 'cli-codex', 'x-b', 'lo'], write: async () => ({ ok: true, restartRequired: true }), actions: ['Restart daemon'], restart: async () => false });
  assert.match(r.messages.at(-1)!, /the daemon did not restart/);

  // Request failures: four distinct messages, nothing written.
  const failures: Array<[Error, RegExp]> = [
    [new Error('daemon is not running — start it with: insrc daemon start'), /the daemon is not running — start it to set model tiers/],
    [Object.assign(new Error('closed'), { code: 'disconnected' }), /the daemon closed the connection before answering — try again/],
    [new Error('unknown method: models.definitions'), /does not know this request \(unknown method: models\.definitions\) — update the daemon/],
    [new Error('invalid response from daemon'), /could not read the model definitions: invalid response from daemon/],
  ];
  for (const [err, message] of failures) {
    r = await run({ picks: ['core'], defs: async () => { throw err; } });
    assert.deepEqual(r.writes, []);
    assert.equal(r.messages.length, 1);
    assert.match(r.messages[0]!, message);
    if (!/unknown method/.test(err.message)) assert.doesNotMatch(r.messages[0]!, /update the daemon/);
  }
  // A dropped connection on the write: the outcome is unknown, not "not saved".
  r = await run({ picks: ['core', 'cli-codex', 'x-b', 'lo'], write: async () => { throw Object.assign(new Error('closed'), { code: 'disconnected' }); } });
  assert.match(r.messages.at(-1)!, /the outcome is unknown/);

  // Cancel at any step writes nothing.
  for (const picks of [[], ['core'], ['core', 'cli-codex'], ['core', 'cli-codex', 'x-a']]) {
    assert.deepEqual((await run({ picks })).writes, [], JSON.stringify(picks));
  }
});

test('model-tier-picker.test.ts: model-tier-picker.ts names no runner or model literal and imports nothing from src/config', () => {
  const src = readFileSync(join(HERE, '..', 'model-tier-picker.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /['"`](cli-claude|cli-codex|ollama)['"`]/, 'no runner literal');
  const shipped = JSON.parse(readFileSync(join(HERE, '..', '..', '..', '..', 'src', 'assets', 'models', 'cloud-model-catalog.json'), 'utf8')) as { families: Array<{ models: Array<{ id: string; aliases?: string[] }> }> };
  for (const f of shipped.families) for (const m of f.models) for (const name of [m.id, ...(m.aliases ?? [])]) {
    assert.ok(!code.includes(`'${name}'`) && !code.includes(`"${name}"`), `no model literal '${name}'`);
  }
  assert.doesNotMatch(src, /from\s+'[^']*src\/config\//, 'imports nothing from src/config');
  assert.doesNotMatch(src, /CONFIG_CATALOG|PROVIDERS|providers\.listModels/);
});
