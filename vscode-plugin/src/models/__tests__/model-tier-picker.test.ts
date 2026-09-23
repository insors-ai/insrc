/**
 * Story E20260923ba132c18:S003 / t4 — runSetModelTier picker-flow tests.
 *
 * Every k7 branch of the VS-Code-free picker is exercised over injected fakes (a
 * fake listModels + a stub catalog + a scripted pick + a recording writeKeyPath +
 * a notify spy) so no live vscode/daemon is needed — the S007 inject-the-dependency
 * idiom. Plus a source-scan guarding the module is VS-Code-free.
 *
 * Run: npx tsx --test vscode-plugin/src/models/__tests__/model-tier-picker.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  runSetModelTier,
  type ModelInfo,
  type ModelListResult,
  type ModelProvider,
  type QuickPickItemLike,
  type SetModelTierDeps,
} from '../model-tier-picker.js';
import type { ConfigWriteResult } from '../../config/types.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** A pick responder: given the presented items, return the chosen one (or undefined = cancel). */
type Responder = (items: readonly ItemLike[]) => ItemLike | undefined;
/** The concrete item shape the flow builds (QuickPickItemLike + our private kind/value). */
interface ItemLike extends QuickPickItemLike {
  readonly kind?: string;
  readonly value?: string;
}

interface HarnessOpts {
  values?: Map<string, unknown>;
  catalogThrows?: boolean;
  /** Per-call list result (1-based callNo), or 'throw' to reject. */
  listModels?: (provider: ModelProvider, callNo: number) => ModelListResult | 'throw';
  write?: (segments: readonly string[], value: unknown) => ConfigWriteResult;
  picks: Responder[];
}

function harness(opts: HarnessOpts) {
  const listCalls: ModelProvider[] = [];
  const writes: { segments: string[]; value: unknown }[] = [];
  const notifications: string[] = [];
  const pickItemsSeen: ItemLike[][] = [];
  let pickIdx = 0;

  const deps: SetModelTierDeps = {
    listModels: async (provider) => {
      listCalls.push(provider);
      const r = opts.listModels ? opts.listModels(provider, listCalls.length) : { provider, available: true, models: [] };
      if (r === 'throw') throw new Error('socket refused');
      return r;
    },
    catalog: async () => {
      if (opts.catalogThrows) throw new Error('daemon unreachable');
      return { values: opts.values ?? new Map<string, unknown>() };
    },
    writeKeyPath: async (segments, value) => {
      writes.push({ segments: [...segments], value });
      return opts.write ? opts.write(segments, value) : { ok: true };
    },
    pick: async (items, _o) => {
      pickItemsSeen.push(items as ItemLike[]);
      const responder = opts.picks[pickIdx++];
      return (responder ? responder(items as ItemLike[]) : undefined) as never;
    },
    notify: (m) => notifications.push(m),
  };
  return { deps, listCalls, writes, notifications, pickItemsSeen };
}

// Responder helpers ---------------------------------------------------------
const byValue = (v: string): Responder => (items) => items.find((i) => i.value === v);
const byKind = (k: string): Responder => (items) => items.find((i) => i.kind === k);
const cancel: Responder = () => undefined;

const OPUS: ModelInfo = { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5' };
const SONNET: ModelInfo = { id: 'claude-sonnet-5' };

// ── happy path (ac1) ───────────────────────────────────────────────

test('happy path: default core provider -> lists cli-claude models, picking one writes models.tiers.core.model once', async () => {
  const h = harness({
    // core.runner defaults to cli-claude (no override); core.model default '' (unset).
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS, SONNET] }),
    picks: [byValue('core'), byValue('cli-claude'), byValue('claude-opus-5-5')],
  });
  await runSetModelTier(h.deps);
  assert.deepEqual(h.listCalls, ['cli-claude'], 'listed exactly the tier provider');
  assert.equal(h.writes.length, 1, 'exactly one write (the model; runner unchanged)');
  assert.deepEqual(h.writes[0], { segments: ['models', 'tiers', 'core', 'model'], value: 'claude-opus-5-5' });
});

test('dropdown-only (k4): the model items are exactly the daemon list (+ Refresh), no free-text entry', async () => {
  const h = harness({
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS, SONNET] }),
    picks: [byValue('core'), byValue('cli-claude'), byValue('claude-sonnet-5')],
  });
  await runSetModelTier(h.deps);
  const modelStep = h.pickItemsSeen[2]!;
  const modelItems = modelStep.filter((i) => i.kind === 'model');
  assert.deepEqual(modelItems.map((i) => i.value), ['claude-opus-5-5', 'claude-sonnet-5']);
  assert.ok(modelStep.some((i) => i.kind === 'refresh'), 'a Refresh item is present');
  assert.ok(!modelStep.some((i) => i.kind === undefined), 'every item is a typed kind (no free-text)');
});

// ── empty / unavailable (ac2/k7) ───────────────────────────────────

test('available:false -> no-models + Refresh, NO write (saved model untouched)', async () => {
  const h = harness({
    values: new Map([['models.tiers.core.model', 'claude-sonnet-5']]),
    listModels: (p) => ({ provider: p, available: false, models: [] }),
    picks: [byValue('core'), byValue('cli-claude'), byKind('no-models')],
  });
  await runSetModelTier(h.deps);
  const emptyStep = h.pickItemsSeen[2]!;
  assert.ok(emptyStep.some((i) => i.kind === 'no-models'), 'a no-models notice');
  assert.ok(emptyStep.some((i) => i.kind === 'refresh'), 'a Refresh item');
  assert.equal(h.writes.length, 0, 'nothing written — the saved model is untouched');
});

test('Refresh re-invokes listModels then a model can be picked + written', async () => {
  let call = 0;
  const h = harness({
    values: new Map(),
    listModels: (p) => {
      call += 1;
      return call === 1 ? { provider: p, available: false, models: [] } : { provider: p, available: true, models: [OPUS] };
    },
    picks: [byValue('core'), byValue('cli-claude'), byKind('refresh'), byValue('claude-opus-5-5')],
  });
  await runSetModelTier(h.deps);
  assert.equal(h.listCalls.length, 2, 'Refresh triggered a second listModels');
  assert.deepEqual(h.writes[0], { segments: ['models', 'tiers', 'core', 'model'], value: 'claude-opus-5-5' });
});

test('available:true + models:[] -> same no-models + Refresh, no write', async () => {
  const h = harness({
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [] }),
    picks: [byValue('core'), byValue('cli-claude'), byKind('no-models')],
  });
  await runSetModelTier(h.deps);
  assert.ok(h.pickItemsSeen[2]!.some((i) => i.kind === 'no-models'), 'empty list presents as no-models');
  assert.equal(h.writes.length, 0);
});

// ── current model presentation (ac3/k7) ────────────────────────────

test('saved model PRESENT in the list -> marked (current), not duplicated; re-picking it is an idempotent no-op', async () => {
  const h = harness({
    values: new Map([['models.tiers.core.model', 'claude-sonnet-5']]),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS, SONNET] }),
    picks: [byValue('core'), byValue('cli-claude'), byValue('claude-sonnet-5')],
  });
  await runSetModelTier(h.deps);
  const modelStep = h.pickItemsSeen[2]!;
  assert.ok(!modelStep.some((i) => i.kind === 'current-not-in-catalog'), 'no not-in-catalog entry when the model is listed');
  const current = modelStep.find((i) => i.value === 'claude-sonnet-5')!;
  assert.equal(current.description, '(current)', 'the saved model is marked current');
  assert.equal(h.writes.length, 0, 're-picking the saved model writes nothing (idempotent)');
});

test('saved model ABSENT from the list -> a non-selectable (current, not in catalog) entry; picking a real model writes the new id', async () => {
  const h = harness({
    values: new Map([['models.tiers.core.model', 'ghost-model-9']]),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS] }),
    picks: [byValue('core'), byValue('cli-claude'), byValue('claude-opus-5-5')],
  });
  await runSetModelTier(h.deps);
  const modelStep = h.pickItemsSeen[2]!;
  const notInCatalog = modelStep.find((i) => i.kind === 'current-not-in-catalog')!;
  assert.ok(notInCatalog !== undefined, 'a current-not-in-catalog entry is shown');
  assert.match(notInCatalog.label, /ghost-model-9/, 'it shows the saved id');
  assert.deepEqual(h.writes[0], { segments: ['models', 'tiers', 'core', 'model'], value: 'claude-opus-5-5' });
});

test('picking the (current, not in catalog) entry is a no-op (non-selectable), no write', async () => {
  const h = harness({
    values: new Map([['models.tiers.core.model', 'ghost-model-9']]),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS] }),
    picks: [byValue('core'), byValue('cli-claude'), byKind('current-not-in-catalog')],
  });
  await runSetModelTier(h.deps);
  assert.equal(h.writes.length, 0, 'the non-selectable current entry writes nothing');
});

// ── provider switch (ac4) ──────────────────────────────────────────

test('provider changed mid-flow -> model cleared, listModels re-queried for the NEW provider, runner + model both written', async () => {
  const h = harness({
    // core.runner defaults to cli-claude; saved model claude-sonnet-5.
    values: new Map([['models.tiers.core.model', 'claude-sonnet-5']]),
    listModels: (p) => ({ provider: p, available: true, models: [{ id: 'llama3' }] }),
    picks: [byValue('core'), byValue('ollama'), byValue('llama3')],
  });
  await runSetModelTier(h.deps);
  assert.deepEqual(h.listCalls, ['ollama'], 'listed the NEW provider, not the old runner');
  // The old saved model must NOT be a current marker under the new provider.
  const modelStep = h.pickItemsSeen[2]!;
  assert.ok(!modelStep.some((i) => i.kind === 'current-not-in-catalog'), 'the cleared model is not carried into the new provider');
  assert.equal(h.writes.length, 2, 'both the runner and the model are written on a switch');
  assert.deepEqual(h.writes[0], { segments: ['models', 'tiers', 'core', 'runner'], value: 'ollama' }, 'runner first');
  assert.deepEqual(h.writes[1], { segments: ['models', 'tiers', 'core', 'model'], value: 'llama3' }, 'then model');
});

test('a tier runner outside the enum -> unrecognised notify + provider-selection offered; the bad value never reaches listModels', async () => {
  const h = harness({
    values: new Map([['models.tiers.core.runner', 'gpt-4-legacy']]),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS] }),
    picks: [byValue('core'), byValue('cli-claude'), byValue('claude-opus-5-5')],
  });
  await runSetModelTier(h.deps);
  assert.ok(h.notifications.some((m) => /unrecognised/i.test(m)), 'the unrecognised provider is surfaced');
  assert.deepEqual(h.listCalls, ['cli-claude'], 'the out-of-enum value was never passed to sc2');
  // Because currentProvider was undefined, the chosen provider is a "change" -> runner is written too.
  assert.ok(h.writes.some((w) => w.segments.join('.') === 'models.tiers.core.runner' && w.value === 'cli-claude'));
});

// ── error paths (never-throw) ──────────────────────────────────────

test('listModels rejection (daemon unreachable) -> notify, treated as empty, no write, no throw', async () => {
  const h = harness({
    values: new Map(),
    listModels: () => 'throw',
    picks: [byValue('core'), byValue('cli-claude'), byKind('no-models')],
  });
  await assert.doesNotReject(() => runSetModelTier(h.deps));
  assert.ok(h.notifications.some((m) => /couldn't reach the daemon/i.test(m)), 'the socket failure is surfaced');
  assert.equal(h.writes.length, 0, 'nothing written on a list failure');
});

test('catalog() rejection -> notify + clean abort (no list, no write, no throw)', async () => {
  const h = harness({ catalogThrows: true, picks: [byValue('core')] });
  await assert.doesNotReject(() => runSetModelTier(h.deps));
  assert.ok(h.notifications.some((m) => /couldn't read the current configuration/i.test(m)));
  assert.equal(h.listCalls.length, 0, 'no list attempted');
  assert.equal(h.writes.length, 0, 'no write attempted');
});

test('writeKeyPath refusal ({ok:false, reason}) -> the reason is surfaced, no throw', async () => {
  const h = harness({
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS] }),
    write: () => ({ ok: false, reason: 'invalid path' }),
    picks: [byValue('core'), byValue('cli-claude'), byValue('claude-opus-5-5')],
  });
  await assert.doesNotReject(() => runSetModelTier(h.deps));
  assert.ok(h.notifications.some((m) => /invalid path/.test(m)), 'the refusal reason is surfaced');
});

test('writeKeyPath REJECTION (daemon down at write time) -> notify, no throw (never-throw guard, HIGH)', async () => {
  const h = harness({
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS] }),
    write: () => {
      throw new Error('socket refused mid-write');
    },
    picks: [byValue('core'), byValue('cli-claude'), byValue('claude-opus-5-5')],
  });
  await assert.doesNotReject(() => runSetModelTier(h.deps), 'a rejecting write must not escape the command');
  assert.ok(h.notifications.some((m) => /couldn't save the core tier/i.test(m)), 'the write failure is surfaced');
});

test('provider switch: runner write OK then model write REFUSES -> the partial state is surfaced (MED)', async () => {
  const h = harness({
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [{ id: 'llama3' }] }),
    // cheap default runner is ollama; picking cli-claude is a switch. Runner ok, model refuses.
    write: (segments) => (segments.includes('model') ? { ok: false, reason: 'bad model' } : { ok: true }),
    picks: [byValue('cheap'), byValue('cli-claude'), byValue('llama3')],
  });
  await runSetModelTier(h.deps);
  assert.equal(h.writes.length, 2, 'runner then model both attempted');
  assert.ok(
    h.notifications.some((m) => /provider was changed/i.test(m) && /not set/i.test(m)),
    'the half-applied tier is made visible',
  );
});

test('an unconfigured default model (no override) that is not in the list is NOT flagged current-not-in-catalog (LOW)', async () => {
  const h = harness({
    // mid.model default is 'sonnet' (a built-in alias), NOT an override; the daemon
    // returns full ids that do not include it.
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS, SONNET] }),
    picks: [byValue('mid'), byValue('cli-claude'), byValue('claude-opus-5-5')],
  });
  await runSetModelTier(h.deps);
  const modelStep = h.pickItemsSeen[2]!;
  assert.ok(!modelStep.some((i) => i.kind === 'current-not-in-catalog'), 'a built-in default is not shown as a stale/foreign value');
});

test('a runner-write refusal on a provider switch aborts before the model write', async () => {
  const h = harness({
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [{ id: 'llama3' }] }),
    write: (segments) => (segments.includes('runner') ? { ok: false, reason: 'nope' } : { ok: true }),
    picks: [byValue('cheap'), byValue('cli-claude'), byValue('llama3')], // cheap default runner is ollama -> cli-claude is a switch
  });
  await runSetModelTier(h.deps);
  assert.equal(h.writes.length, 1, 'only the runner write was attempted; the model write did not run');
  assert.equal(h.writes[0]!.segments.includes('runner'), true);
  assert.ok(h.notifications.some((m) => /nope/.test(m)));
});

// ── cancel (clean no-op) ───────────────────────────────────────────

test('cancel at the tier step -> clean no-op (no catalog read, no list, no write)', async () => {
  const h = harness({ picks: [cancel] });
  await runSetModelTier(h.deps);
  assert.equal(h.listCalls.length, 0);
  assert.equal(h.writes.length, 0);
});

test('cancel at the provider step -> no list, no write', async () => {
  const h = harness({ values: new Map(), picks: [byValue('core'), cancel] });
  await runSetModelTier(h.deps);
  assert.equal(h.listCalls.length, 0);
  assert.equal(h.writes.length, 0);
});

test('cancel at the model step -> no write', async () => {
  const h = harness({
    values: new Map(),
    listModels: (p) => ({ provider: p, available: true, models: [OPUS] }),
    picks: [byValue('core'), byValue('cli-claude'), cancel],
  });
  await runSetModelTier(h.deps);
  assert.equal(h.writes.length, 0);
});

// ── source guard (k5) ──────────────────────────────────────────────

test('source-scan: model-tier-picker.ts imports no vscode and no cloud/HTTP client', () => {
  const src = readFileSync(join(HERE, '..', 'model-tier-picker.ts'), 'utf8');
  const imports = [...src.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
  assert.ok(!imports.some((s) => s === 'vscode'), 'the picker module must not import vscode');
  assert.ok(!imports.some((s) => /undici|^https?:/.test(s)), 'no cloud/HTTP client import (k1)');
  // The daemon is reached ONLY through injected seams — the module imports nothing
  // from the daemon layer (src/daemon/*) or the shared ipc-client; its only
  // cross-boundary import is the pure CONFIG_CATALOG data + the plugin config types.
  assert.ok(!imports.some((s) => /daemon|ipc-client/.test(s)), 'no daemon/ipc-client import — sc2 is injected in extension.ts');
});
