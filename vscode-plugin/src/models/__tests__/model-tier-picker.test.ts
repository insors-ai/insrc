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

import { runSetModelTier, currentTier, tierStatus, type QuickPickItemLike, type SetModelTierDeps, type Tier } from '../model-tier-picker.js';
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
    check: async () => { throw new Error('check not scripted'); },
    approve: async () => { throw new Error('approve not scripted'); },
    reject: async () => { throw new Error('reject not scripted'); },
    input: async () => undefined,
    pickMany: async () => undefined,
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
  // Model step: the family's models with aliases and the user-approved mark, then a typed id (CLI family) and Refresh.
  assert.deepEqual(r.shown[2]!.map((x) => [x.label, x.description]), [['c-big', 'alias cb'], ['c-new', '(user-approved)'], ['Enter another model id…', 'checked by the daemon before it can be used'], ['$(refresh) Refresh', undefined]]);
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
  assert.deepEqual(r.shown[2]!.map((x) => [x.label, x.description]), [['loc:1', undefined], ['loc:2', '(not installed)'], ['$(refresh) Refresh', undefined]], 'Ollama: no typed-id entry');
  assert.equal(r.shown.length, 3, 'tier, family, model — no effort step');
  assert.deepEqual(r.writes, [{ segments: ['models', 'tiers', 'core'], value: { runner: 'ollama', model: 'loc:2', effort: '' } }]);

  // An unset tier shows the definitions' default (default family, its tierDefault) as current.
  r = await run({ picks: ['core', 'cli-codex', 'x-b'] });
  assert.equal(r.shown[1]!.find((x) => x.value === 'cli-codex')?.description, 'cli-codex (current)');
  assert.equal(r.shown[2]!.find((x) => x.value === 'x-a')?.description, '(current)');

  // The current tier is the one the daemon resolves (ISSUE-07dfdf71974a7c45; src/config/analyze.ts tierSetting
  // + parseTiering, then the registry's dropped effort).
  const cur = (shown: Array<{ value?: string | undefined; description?: string | undefined }> | undefined) => shown?.find((x) => x.description?.endsWith('(current)'))?.value;
  // Effort leaf alone: the default tier at that effort.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', 'turbo'], raw: { models: { tiers: { core: { effort: 'turbo' } } } } });
  assert.deepEqual([cur(r.shown[1]), cur(r.shown[2]), cur(r.shown[3])], ['cli-codex', 'x-a', 'turbo'], 'the configured effort, not the default lo');
  // Model alone: the daemon ignores the tier, so the default family's default with its effort.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', 'lo'], raw: { models: { tiers: { core: { model: 'x-b' } } } } });
  assert.deepEqual([cur(r.shown[1]), cur(r.shown[2]), cur(r.shown[3])], ['cli-codex', 'x-a', 'lo'], 'a model alone is ignored');
  // Runner alone: ignored too.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', 'lo'], raw: { models: { tiers: { core: { runner: 'cli-claude' } } } } });
  assert.deepEqual([cur(r.shown[1]), cur(r.shown[2]), cur(r.shown[3])], ['cli-codex', 'x-a', 'lo'], 'a runner alone is ignored');
  // Model '' leaves the tier unset (its effort leaf still applies to the default).
  r = await run({ picks: ['core', 'cli-codex', 'x-a', 'turbo'], raw: { models: { tiers: { core: { runner: 'cli-claude', model: '', effort: 'turbo' } } } } });
  assert.deepEqual([cur(r.shown[1]), cur(r.shown[2]), cur(r.shown[3])], ['cli-codex', 'x-a', 'turbo'], "model '' is the default tier at the effort leaf");
  // An unknown runner is ignored the same way.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', 'turbo'], raw: { models: { tiers: { core: { runner: 'cli-nope', model: 'c-big', effort: 'turbo' } } } } });
  assert.deepEqual([cur(r.shown[1]), cur(r.shown[2]), cur(r.shown[3])], ['cli-codex', 'x-a', 'turbo'], 'an unknown runner is the default tier at the effort leaf');
  // Runner + model with no effort: that tier with NO effort, never the default's.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', ''], raw: { models: { tiers: { core: { runner: 'cli-codex', model: 'x-a' } } } } });
  assert.deepEqual([cur(r.shown[2]), cur(r.shown[3])], ['x-a', ''], 'no effort, not the default lo');
  assert.deepEqual(r.writes, [], 'the CLI default re-picked is unchanged');
  // An explicit '' is kept.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', ''], raw: TIER('cli-codex', 'x-a', '') });
  assert.equal(cur(r.shown[3]), '');
  // An alias is the canonical model.
  r = await run({ picks: ['core', 'cli-codex', 'x-b', 'lo'], raw: TIER('cli-codex', 'xb', 'lo') });
  assert.equal(r.shown[2]!.find((x) => x.value === 'x-b')?.description, 'alias xb (current)');
  // A stored effort the model does not accept is dropped by the daemon: shown as the CLI default.
  r = await run({ picks: ['core', 'cli-codex', 'x-b', ''], raw: TIER('cli-codex', 'x-b', 'turbo') });
  assert.deepEqual([cur(r.shown[2]), cur(r.shown[3])], ['x-b', ''], 'the unaccepted turbo is shown as none');
  // An unset tier: the default family's tier default and its effort.
  r = await run({ picks: ['core', 'cli-codex', 'x-a', 'lo'], raw: {} });
  assert.deepEqual([cur(r.shown[1]), cur(r.shown[2]), cur(r.shown[3])], ['cli-codex', 'x-a', 'lo']);

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
  const shipped = JSON.parse(readFileSync(join(HERE, '..', '..', '..', '..', 'src', 'assets', 'models', 'cloud-model-catalog.json'), 'utf8')) as { families: Array<{ id: string; models: Array<{ id: string; aliases?: string[] }> }> };
  // Every shipped family id, including the Ollama-hosted one (Epic b220bb61, Story s4).
  assert.ok(shipped.families.length >= 5, 'the shipped families are read');
  for (const f of shipped.families) assert.doesNotMatch(code, new RegExp(`['"\`]${f.id}['"\`]`), `no runner literal '${f.id}'`);
  for (const f of shipped.families) for (const m of f.models) for (const name of [m.id, ...(m.aliases ?? [])]) {
    assert.ok(!code.includes(`'${name}'`) && !code.includes(`"${name}"`), `no model literal '${name}'`);
  }
  assert.doesNotMatch(src, /from\s+'[^']*src\/config\//, 'imports nothing from src/config');
  assert.doesNotMatch(src, /CONFIG_CATALOG|PROVIDERS|providers\.listModels/);
});

test('model-tier-picker.test.ts: unknown model — check results shown; approve writes nothing; the tier is written only after a successful restart; reject writes nothing; runs:false offers no approve', async () => {
  const checks: unknown[] = [];
  const approves: unknown[] = [];
  const rejects: unknown[] = [];
  const result = { checkId: 'c1', runs: true, inputLimit: { unit: 'tokens', max: 64000 },
    efforts: [{ effort: 'lo', verdict: 'accepted' as const, evidence: 'lo listed' }, { effort: 'turbo', verdict: 'rejected' as const, evidence: 'turbo not listed' }, { effort: 'max', verdict: 'recognised-unconfirmed' as const, evidence: 'max is a name the CLI knows' }] };
  let inputs: string[] = [];
  const seams = (overrides: Partial<SetModelTierDeps> = {}): Partial<SetModelTierDeps> => ({
    input: async (o) => { const next = inputs.shift(); return next === '<default>' ? o.value : next; },
    check: async (p) => { checks.push(p); return result; },
    approve: async (p) => { approves.push(p); return { ok: true, restartRequired: true }; },
    reject: async (p) => { rejects.push(p); return { ok: true, restartRequired: true }; },
    pickMany: async (items) => items.filter((x) => (x as Item).value === 'lo' || (x as Item).value === 'max'),
    ...overrides,
  });
  const reset = () => { checks.length = 0; approves.length = 0; rejects.length = 0; };

  // Check: the family's effort names are claimed; each level's verdict and evidence is shown, then the decision.
  inputs = ['x-new', '<default>'];
  const restartResults = [false, true];
  let r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…', 'Approve x-new…'], extra: seams(), actions: ['Restart daemon and save', 'Restart daemon and save'], restart: async () => restartResults.shift()! });
  assert.deepEqual(checks, [{ family: 'cli-codex', modelId: 'x-new', claimedEfforts: ['lo', 'turbo'] }]);
  const verdicts = r.shown[3]!;
  assert.deepEqual(verdicts.filter((x) => x.kind === 'verdict').map((x) => [x.label, x.detail]), [['lo — accepted', 'lo listed'], ['turbo — rejected', 'turbo not listed'], ['max — recognised — unconfirmed', 'max is a name the CLI knows']]);
  assert.deepEqual(verdicts.filter((x) => x.kind !== 'verdict').map((x) => x.label), ['Approve x-new…', 'Reject x-new']);
  // Approve: the chosen non-rejected levels; nothing saved; a failed restart saves nothing and never re-approves; the next restart saves.
  assert.deepEqual(approves, [{ checkId: 'c1', efforts: ['lo', 'max'] }]);
  assert.equal(r.restarts(), 2);
  assert.deepEqual(r.writes, [{ segments: ['models', 'tiers', 'core'], value: { runner: 'cli-codex', model: 'x-new', effort: 'lo' } }]);
  assert.match(r.messages.join('\n'), /approval of x-new is recorded, but the daemon did not restart — the core tier was not saved/);
  assert.equal(approves.length, 1, 'never approved twice');

  // Only the non-rejected levels are offered for approval.
  reset(); inputs = ['x-new', '<default>'];
  let offered: string[] = [];
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…', 'Approve x-new…'], extra: seams({ pickMany: async (items) => { offered = items.map((x) => (x as Item).value ?? ''); return undefined; } }) });
  assert.deepEqual(offered, ['lo', 'max']);
  assert.deepEqual(approves, [], 'cancelling the level choice approves nothing');

  // Approved but the user does not restart now: nothing saved.
  reset(); inputs = ['x-new', '<default>'];
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…', 'Approve x-new…'], extra: seams(), actions: [undefined] });
  assert.equal(approves.length, 1);
  assert.deepEqual(r.writes, []);
  assert.equal(r.restarts(), 0);

  // Reject: recorded, nothing saved.
  reset(); inputs = ['x-new', '<default>'];
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…', 'Reject x-new'], extra: seams() });
  assert.deepEqual(rejects, [{ checkId: 'c1' }]);
  assert.deepEqual(r.writes, []);

  // runs:false offers no approve; { error } shows the refusal, and an id now served is offered as a pick.
  reset(); inputs = ['x-new', '<default>'];
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…'], extra: seams({ check: async () => ({ ...result, runs: false, error: 'the codex CLI refused the model' }) }) });
  assert.deepEqual(r.shown[3]!.filter((x) => x.kind !== 'verdict').map((x) => x.label), ['Reject x-new']);
  assert.deepEqual(approves, [], 'nothing approvable');
  reset(); inputs = ['x-new', '<default>'];
  const served: ModelDefinitions = { ...DEFS, families: DEFS.families.map((f) => f.id !== 'cli-codex' ? f : { ...f, models: [...f.models, { id: 'x-new', aliases: [], efforts: ['lo'], source: 'user-approved' as const }] }) };
  let defsCalls = 0;
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…'], defs: async () => (defsCalls++ === 0 ? DEFS : served), extra: seams({ check: async () => ({ error: 'x-new is already a model or alias of cli-codex' }) }), actions: ['Save x-new'] });
  assert.deepEqual(r.writes, [{ segments: ['models', 'tiers', 'core'], value: { runner: 'cli-codex', model: 'x-new', effort: '' } }]);

  // A typed alias of a listed model saves as a normal pick, without a check.
  reset(); inputs = ['xb'];
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…', 'lo'], extra: seams() });
  assert.deepEqual(checks, []);
  assert.deepEqual(r.writes, [{ segments: ['models', 'tiers', 'core'], value: { runner: 'cli-codex', model: 'x-b', effort: 'lo' } }]);

  // unknown-check offers a fresh check; a disconnected check offers to check again; a disconnected approve reports an unknown outcome.
  reset(); inputs = ['x-new', '<default>'];
  const approveAnswers: Array<() => Promise<DecisionResultLike>> = [async () => ({ ok: false, reason: 'unknown-check', detail: 'no pending check c1' })];
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…', 'Approve x-new…', 'Reject x-new'], extra: seams({ approve: async (p) => { approves.push(p); return approveAnswers.shift()!(); } }), actions: ['Check again'] });
  assert.equal(checks.length, 2, 'checked again after unknown-check');
  assert.deepEqual(rejects, [{ checkId: 'c1' }]);
  reset(); inputs = ['x-new', '<default>'];
  const checkAnswers: Array<() => Promise<typeof result>> = [async () => { throw Object.assign(new Error('closed'), { code: 'disconnected' }); }, async () => result];
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…'], extra: seams({ check: async (p) => { checks.push(p); return checkAnswers.shift()!(); } }), actions: ['Check again'] });
  assert.equal(checks.length, 2);
  assert.match(r.messages[0]!, /the check of x-new was interrupted/);
  reset(); inputs = ['x-new', '<default>'];
  r = await run({ picks: ['core', 'cli-codex', 'Enter another model id…', 'Approve x-new…'], extra: seams({ approve: async () => { throw Object.assign(new Error('closed'), { code: 'disconnected' }); } }) });
  assert.match(r.messages.at(-1)!, /the outcome is unknown/);
  assert.deepEqual(r.writes, []);
});

type DecisionResultLike = { ok: true; restartRequired?: boolean } | { ok: false; reason: string; detail: string };

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

test("model-tier-picker.test.ts: the host family is offered next to today's; its models carry cloud/local marks, no 'Enter another model id', efforts only where the model has them, one whole-tier write", async () => {
  let r = await run({ picks: ['core', 'ollama-claude', 'hc:cloud', 'max'], raw: TIER('cli-codex', 'x-a', 'lo'), defs: hosted });
  assert.deepEqual(r.shown[1]!.map((x) => [x.label, x.description]), [['FakeC', 'cli-claude'], ['FakeX', 'cli-codex (current)'], ['FakeLocal', 'ollama'], ['FakeH', 'ollama-claude']]);
  assert.deepEqual(r.shown[2]!.map((x) => [x.label, x.description]), [['hc:cloud', 'alias hc cloud'], ['hl:7b', 'local'], ['$(refresh) Refresh', undefined]], 'only declared models, marked; no typed-id entry');
  assert.deepEqual(r.shown[3]!.map((x) => x.label), ['CLI default', 'low', 'max']);
  assert.deepEqual(r.writes, [{ segments: ['models', 'tiers', 'core'], value: { runner: 'ollama-claude', model: 'hc:cloud', effort: 'max' } }]);

  // A model with no efforts skips the effort step and writes the CLI default.
  r = await run({ picks: ['core', 'ollama-claude', 'hl:7b'], raw: TIER('cli-codex', 'x-a', 'lo'), defs: hosted });
  assert.equal(r.shown.length, 3, 'tier, family, model — no effort step');
  assert.deepEqual(r.writes, [{ segments: ['models', 'tiers', 'core'], value: { runner: 'ollama-claude', model: 'hl:7b', effort: '' } }]);
  // Vendor and plain Ollama models carry no hosting mark.
  r = await run({ picks: ['core', 'cli-claude'], raw: TIER('cli-codex', 'x-a', 'lo'), defs: hosted });
  assert.deepEqual(r.shown[2]!.map((x) => x.description), ['alias cb', '(user-approved)', 'checked by the daemon before it can be used', undefined]);
  r = await run({ picks: ['core', 'ollama'], raw: TIER('cli-codex', 'x-a', 'lo'), defs: hosted });
  assert.deepEqual(r.shown[2]!.map((x) => x.description), [undefined, '(not installed)', undefined]);
});

test("model-tier-picker.test.ts: an undeclared current model on the host family is 'not supported — the tier will not run'; a vendor family and a host-less answer keep today's items", async () => {
  let r = await run({ picks: ['core', 'ollama-claude'], raw: TIER('ollama-claude', 'gone:cloud'), defs: hosted });
  assert.deepEqual([r.shown[2]![0]!.label, r.shown[2]![0]!.description], ['(current, not supported — the tier will not run): gone:cloud', 'not supported by FakeH']);
  assert.ok(!r.shown[2]!.some((x) => x.kind === 'enter-id'), 'no typed-id entry');
  assert.deepEqual(r.writes, []);

  // A vendor CLI family keeps the 'runs the default' notice and the typed-id entry.
  r = await run({ picks: ['core', 'cli-claude'], raw: TIER('cli-claude', 'c-gone'), defs: hosted });
  assert.deepEqual([r.shown[2]![0]!.label, r.shown[2]![0]!.description], ['(current, not listed — runs the default): c-gone', 'not served by FakeC']);
  assert.ok(r.shown[2]!.some((x) => x.label === 'Enter another model id…'));

  // An older daemon answers without host or hosting: the family is a vendor CLI family again.
  const old: ModelDefinitions = { ...HOSTED, families: HOSTED.families.map((f) => {
    if (f.host === undefined) return f;
    const { host: _host, ...rest } = f;
    return { ...rest, models: rest.models.map(({ hosting: _hosting, ...m }) => m) };
  }) };
  r = await run({ picks: ['core', 'ollama-claude'], raw: TIER('ollama-claude', 'gone:cloud'), defs: async () => old });
  assert.deepEqual(r.shown[2]!.map((x) => [x.label, x.description]), [
    ['(current, not listed — runs the default): gone:cloud', 'not served by FakeH'],
    ['hc:cloud', 'alias hc'], ['hl:7b', undefined],
    ['Enter another model id…', 'checked by the daemon before it can be used'], ['$(refresh) Refresh', undefined],
  ]);
});

test('model-tier-picker.test.ts: reopening the picker after a save on the host family marks the saved family, model and effort as current', async () => {
  const saved = await run({ picks: ['core', 'ollama-claude', 'hc:cloud', 'max'], raw: TIER('cli-codex', 'x-a', 'lo'), defs: hosted });
  const written = saved.writes[0]!.value as { runner: string; model: string; effort: string };
  // Reopen over the saved tier: family, model (with its mark) and effort are current; re-picking them writes nothing.
  let r = await run({ picks: ['core', 'ollama-claude', 'hc:cloud', 'max'], raw: TIER(written.runner, written.model, written.effort), defs: hosted });
  assert.equal(r.shown[1]!.find((x) => x.value === 'ollama-claude')?.description, 'ollama-claude (current)');
  assert.equal(r.shown[2]!.find((x) => x.value === 'hc:cloud')?.description, 'alias hc cloud (current)');
  assert.equal(r.shown[3]!.find((x) => x.value === 'max')?.description, '(current)');
  assert.deepEqual(r.writes, []);
  assert.match(r.messages.at(-1)!, /core tier is unchanged \(hc:cloud \(ollama-claude, effort max\)\)/);

  // An effort the model does not take is shown as the CLI default the daemon uses.
  r = await run({ picks: ['core', 'ollama-claude', 'hl:7b'], raw: TIER('ollama-claude', 'hl:7b', 'max'), defs: hosted });
  assert.equal(r.shown[2]!.find((x) => x.value === 'hl:7b')?.description, 'local (current)');
  assert.deepEqual(r.writes, [], 'the CLI default the daemon already uses');
  assert.match(r.messages.at(-1)!, /core tier is unchanged \(hl:7b \(ollama-claude\)\)/);
});

/** A config.json raw-config snapshot naming one tier's runner/model/effort (any tier, not just core). */
const rawTier = (tier: Tier, runner: string, model: string, effort = '') => ({ models: { tiers: { [tier]: { runner, model, effort } } } });

test('model-tier-picker.test.ts: currentTier remains exported with unchanged resolution behavior', () => {
  // Unset -> the default family's default for the tier, unchanged from the picker's own resolution.
  assert.deepEqual(currentTier(DEFS, {}, 'core'), { runner: 'cli-codex', model: 'x-a', effort: 'lo' });
  // A configured, resolvable runner+model is returned as configured.
  assert.deepEqual(currentTier(DEFS, rawTier('core', 'cli-claude', 'c-big', 'deep'), 'core'), { runner: 'cli-claude', model: 'c-big', effort: 'deep' });
  // An unknown runner falls back to the default family's default, exactly as an unset tier does.
  assert.deepEqual(currentTier(DEFS, { models: { tiers: { core: { runner: 'no-such-runner', model: 'x' } } } }, 'core'), { runner: 'cli-codex', model: 'x-a', effort: 'lo' });
});

test("model-tier-picker.test.ts: tierStatus classifies ok/not-supported/not-listed/floor-raised across a host-set family, an open vendor family, an unresolvable runner, and all three coreFloor values", () => {
  // A resolvable model on an open vendor family, at the floor: ok.
  assert.deepEqual(tierStatus(DEFS, rawTier('core', 'cli-claude', 'c-big'), 'core', 'core'), { kind: 'ok' });
  // Below coreFloor with an otherwise-fine model: floor-raised.
  assert.deepEqual(tierStatus(DEFS, rawTier('cheap', 'cli-claude', 'c-big'), 'cheap', 'mid'), { kind: 'floor-raised', to: 'mid' });
  // coreFloor at the lowest tier never raises anything.
  assert.deepEqual(tierStatus(DEFS, rawTier('cheap', 'cli-claude', 'c-big'), 'cheap', 'cheap'), { kind: 'ok' });
  // An open vendor family (host undefined) with a model it no longer lists: not-listed, independent of the floor.
  assert.deepEqual(tierStatus(DEFS, rawTier('core', 'cli-claude', 'c-gone'), 'core', 'core'), { kind: 'not-listed', model: 'c-gone' });
  // An unresolvable runner (unknown/stale) is also not-listed, reported directly rather than through currentTier's default-family fallback.
  assert.deepEqual(tierStatus(DEFS, rawTier('core', 'no-such-runner', 'x'), 'core', 'core'), { kind: 'not-listed', model: 'x' });
  // A host-set (closed-list) family with a model it no longer lists: not-supported.
  assert.deepEqual(tierStatus(HOSTED, rawTier('core', 'ollama-claude', 'gone:cloud'), 'core', 'core'), { kind: 'not-supported', model: 'gone:cloud' });
});

test("model-tier-picker.test.ts: tierStatus returns floor-raised for every tier ranked below coreFloor, and omits it when coreFloor is 'cheap'", () => {
  const ranks: Record<Tier, number> = { core: 0, mid: 1, cheap: 2 };
  for (const coreFloor of ['core', 'mid', 'cheap'] as const) {
    for (const tier of ['core', 'mid', 'cheap'] as const) {
      const status = tierStatus(DEFS, rawTier(tier, 'cli-claude', 'c-big'), tier, coreFloor);
      if (ranks[tier] > ranks[coreFloor]) {
        assert.deepEqual(status, { kind: 'floor-raised', to: coreFloor }, `${tier} below coreFloor=${coreFloor} is floor-raised`);
      } else {
        assert.deepEqual(status, { kind: 'ok' }, `${tier} at or above coreFloor=${coreFloor} is ok`);
      }
    }
  }
  // coreFloor='cheap' (the lowest tier) never raises anything, for any tier.
  for (const tier of ['core', 'mid', 'cheap'] as const) {
    assert.deepEqual(tierStatus(DEFS, rawTier(tier, 'cli-claude', 'c-big'), tier, 'cheap'), { kind: 'ok' });
  }
});
