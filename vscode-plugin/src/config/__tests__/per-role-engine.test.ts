/**
 * Story E20260922401ae5fb:S002 / t6 — per-role engine + gateway + seam tests.
 *
 * Drives the ONE createConfigSyncEngine over a per-role (source:'raw', segment)
 * entry against fakes, proving the segment write + raw read + validate/snapshot/
 * never-throw behaviours; plus a gateway test (writeKeyPath→config.write array
 * form, rawConfig→config.show) and seam source-scans.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createConfigSyncEngine } from '../sync-engine.js';
import { createDaemonConfigGateway } from '../gateway.js';
import type {
  ConfigCatalogSnapshot,
  ConfigGateway,
  ConfigKeyEntry,
  ConfigKeyMap,
  ConfigWriteResult,
  Notifier,
  SettingsStore,
} from '../types.js';
import type { ConfigOption } from '../../../../src/config/config-catalog.js';
import type { IpcClient, DaemonStatus } from '../../../../src/shared/ipc-client.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

/** One per-role entry (source:'raw', segments) over a synthetic enum option. */
function roleEntry(roleId: string, def = 'mid'): ConfigKeyEntry {
  const path = `models.tasks.${roleId}`;
  const option: ConfigOption = { path, type: 'enum', default: def, desc: path, enumValues: ['cheap', 'mid', 'core'], group: 'G' };
  return { nativeKey: `insrc.${path}`, path, option, segments: ['models', 'tasks', roleId], source: 'raw' };
}

function keyMapOf(entries: readonly ConfigKeyEntry[]): ConfigKeyMap {
  const byNative = new Map(entries.map((e) => [e.nativeKey, e]));
  const byPath = new Map(entries.map((e) => [e.path, e]));
  return { entries, byNativeKey: (k) => byNative.get(k), byPath: (p) => byPath.get(p) };
}

class FakeSettings implements SettingsStore {
  values = new Map<string, unknown>();
  read(k: string) { return this.values.get(k); }
  async write(k: string, v: unknown) { this.values.set(k, v); }
  snapshot() { return new Map(this.values); }
}
class FakeNotifier implements Notifier {
  errors: string[] = [];
  error(m: string) { this.errors.push(m); }
}
interface GwOpts {
  raw?: Record<string, unknown>;
  rawReject?: Error;
  write?: (segments: readonly string[], value: unknown) => Promise<ConfigWriteResult>;
}
class FakeGateway implements ConfigGateway {
  writeKeyCalls: Array<{ key: string; value: unknown }> = [];
  writeKeyPathCalls: Array<{ segments: readonly string[]; value: unknown }> = [];
  constructor(private readonly o: GwOpts = {}) {}
  async catalog(): Promise<ConfigCatalogSnapshot> { return { values: new Map() }; }
  async writeKey(key: string, value: unknown): Promise<ConfigWriteResult> { this.writeKeyCalls.push({ key, value }); return { ok: true }; }
  async writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult> {
    this.writeKeyPathCalls.push({ segments, value });
    if (this.o.write) return this.o.write(segments, value);
    return { ok: true };
  }
  async rawConfig(): Promise<Record<string, unknown>> {
    if (this.o.rawReject) throw this.o.rawReject;
    return this.o.raw ?? {};
  }
}

// ── applyChanges (per-role) ────────────────────────────────────────────────────

test('applyChanges on a valid per-role change calls writeKeyPath with the segment array exactly once, NOT writeKey', async () => {
  const gw = new FakeGateway();
  const engine = createConfigSyncEngine({ gateway: gw, settings: new FakeSettings(), notifier: new FakeNotifier(), keyMap: keyMapOf([roleEntry('context.assemble')]) });
  await engine.applyChanges([{ key: 'insrc.models.tasks.context.assemble', value: 'core' }]);
  assert.deepEqual(gw.writeKeyPathCalls, [{ segments: ['models', 'tasks', 'context.assemble'], value: 'core' }]);
  assert.equal(gw.writeKeyCalls.length, 0);
});

test('applyChanges rejects an invalid per-role tier without calling writeKeyPath, and reports a reason', async () => {
  const gw = new FakeGateway();
  const notifier = new FakeNotifier();
  const engine = createConfigSyncEngine({ gateway: gw, settings: new FakeSettings(), notifier, keyMap: keyMapOf([roleEntry('review')]) });
  await engine.applyChanges([{ key: 'insrc.models.tasks.review', value: 'ultra' }]);
  assert.equal(gw.writeKeyPathCalls.length, 0);
  assert.match(notifier.errors[0]!, /must be one of: cheap, mid, core/);
});

test('applyChanges on a per-role {ok:false}/reject reports a rejected write and does not advance the snapshot', async () => {
  const gw = new FakeGateway({ write: async () => ({ ok: false, reason: 'invalid path' }) });
  const notifier = new FakeNotifier();
  const engine = createConfigSyncEngine({ gateway: gw, settings: new FakeSettings(), notifier, keyMap: keyMapOf([roleEntry('review')]) });
  await engine.applyChanges([{ key: 'insrc.models.tasks.review', value: 'core' }]);
  assert.match(notifier.errors[0]!, /daemon rejected/);
  // Snapshot not advanced ⇒ a re-apply of the same value writes AGAIN.
  await engine.applyChanges([{ key: 'insrc.models.tasks.review', value: 'core' }]);
  assert.equal(gw.writeKeyPathCalls.length, 2);
});

// ── pullFromDaemon (per-role) ──────────────────────────────────────────────────

test('pullFromDaemon reads the current per-role override from rawConfig at the dotted key (defaultTier when absent)', async () => {
  const settings = new FakeSettings();
  const gw = new FakeGateway({ raw: { models: { tasks: { 'context.assemble': 'core' } } } });
  const engine = createConfigSyncEngine({
    gateway: gw, settings, notifier: new FakeNotifier(),
    keyMap: keyMapOf([roleEntry('context.assemble', 'mid'), roleEntry('review', 'core')]),
  });
  await engine.pullFromDaemon();
  assert.equal(settings.values.get('insrc.models.tasks.context.assemble'), 'core'); // daemon override
  assert.equal(settings.values.get('insrc.models.tasks.review'), 'core'); // absent → defaultTier
});

test('pullFromDaemon on a rawConfig() rejection writes no per-role keys and notifies without throwing', async () => {
  const settings = new FakeSettings();
  const notifier = new FakeNotifier();
  const gw = new FakeGateway({ rawReject: new Error('daemon is not running') });
  const engine = createConfigSyncEngine({ gateway: gw, settings, notifier, keyMap: keyMapOf([roleEntry('review')]) });
  await engine.pullFromDaemon(); // must not throw
  assert.equal(settings.values.size, 0);
  assert.match(notifier.errors[0]!, /daemon is not running/);
});

test('per-role idempotent no-op: re-applying the pulled value calls no writeKeyPath', async () => {
  const gw = new FakeGateway({ raw: { models: { tasks: { review: 'core' } } } });
  const engine = createConfigSyncEngine({ gateway: gw, settings: new FakeSettings(), notifier: new FakeNotifier(), keyMap: keyMapOf([roleEntry('review')]) });
  await engine.pullFromDaemon();
  await engine.applyChanges([{ key: 'insrc.models.tasks.review', value: 'core' }]);
  assert.equal(gw.writeKeyPathCalls.length, 0);
});

// ── gateway (config.write array form + config.show) ─────────────────────────────

test('the daemon gateway sends writeKeyPath as the config.write ARRAY form and rawConfig as config.show', async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  const fakeClient: IpcClient = {
    rpc: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === 'config.write') return { ok: true } as never;
      if (method === 'config.show') return { models: { tasks: { review: 'core' } } } as never;
      return undefined as never;
    },
    status: async () => ({} as DaemonStatus),
    reachability: async () => 'running',
  };
  const gw = createDaemonConfigGateway(fakeClient);
  await gw.writeKeyPath(['models', 'tasks', 'context.assemble'], 'core');
  const raw = await gw.rawConfig();

  const write = calls.find((c) => c.method === 'config.write');
  assert.deepEqual(write?.params, { path: ['models', 'tasks', 'context.assemble'], value: 'core' });
  assert.ok(calls.some((c) => c.method === 'config.show'));
  assert.deepEqual(raw, { models: { tasks: { review: 'core' } } });
});

// ── seam source-scans ───────────────────────────────────────────────────────────

const CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(CONFIG_DIR, rel), 'utf8');

test("the per-role key-map + engine + gateway modules import no 'vscode'", () => {
  for (const mod of ['key-map.ts', 'sync-engine.ts', 'gateway.ts', 'types.ts']) {
    assert.doesNotMatch(read(mod), /from ['"]vscode['"]/, `${mod} must not import 'vscode'`);
  }
});

test('the gateway references only config.catalog + config.show + config.write (no new IPC, no cloud/HTTP)', () => {
  const src = read('gateway.ts');
  const methods = [...src.matchAll(/rpc<[^>]*>+\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(methods)], ['config.catalog', 'config.show', 'config.write']);
  for (const mod of ['key-map.ts', 'sync-engine.ts', 'gateway.ts']) {
    assert.doesNotMatch(read(mod), /https?:\/\/|fetch\(|undici|node:http/, `${mod} must open no network path`);
  }
});
