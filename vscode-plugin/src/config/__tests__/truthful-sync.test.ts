/**
 * Story E20260922401ae5fb:S003 / t4 — truthful-sync tests: the auto-revert-on-
 * reject (ac1/k5), the reconcile via pullFromDaemon (ac2/k5), and the first-class
 * Refresh command (ac3/k6). All over the VS-Code-free engine + injected fakes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createConfigSyncEngine } from '../sync-engine.js';
import type {
  ChangedKey,
  ConfigCatalogSnapshot,
  ConfigGateway,
  ConfigKeyEntry,
  ConfigKeyMap,
  ConfigWriteResult,
  Notifier,
  SettingsStore,
} from '../types.js';
import type { ConfigOption } from '../../../../src/config/config-catalog.js';

// ── fixtures ──────────────────────────────────────────────────────────────────

function opt(path: string, over: Partial<ConfigOption> = {}): ConfigOption {
  return { path, type: 'string', default: `${path}-default`, desc: path, group: 'G', ...over };
}
function globalEntry(path: string, over: Partial<ConfigOption> = {}): ConfigKeyEntry {
  const option = opt(path, over);
  return { nativeKey: 'insrc.' + path, path, option };
}
function keyMapOf(entries: readonly ConfigKeyEntry[]): ConfigKeyMap {
  const byNative = new Map(entries.map((e) => [e.nativeKey, e]));
  const byPath = new Map(entries.map((e) => [e.path, e]));
  return { entries, byNativeKey: (k) => byNative.get(k), byPath: (p) => byPath.get(p) };
}

class FakeSettings implements SettingsStore {
  values = new Map<string, unknown>();
  writes: Array<{ key: string; value: unknown }> = [];
  failKeys = new Set<string>();
  read(k: string) { return this.values.get(k); }
  async write(k: string, v: unknown) {
    if (this.failKeys.has(k)) throw new Error('host update failed');
    this.writes.push({ key: k, value: v });
    this.values.set(k, v);
  }
  snapshot() { return new Map(this.values); }
}
class FakeNotifier implements Notifier {
  errors: string[] = [];
  error(m: string) { this.errors.push(m); }
}
interface GwOpts {
  catalogValues?: Record<string, unknown>;
  catalogReject?: Error;
  write?: (key: string, value: unknown) => Promise<ConfigWriteResult>;
}
class FakeGateway implements ConfigGateway {
  writeCalls: Array<{ key: string; value: unknown }> = [];
  writeKeyPathCalls: Array<{ segments: readonly string[]; value: unknown }> = [];
  constructor(private readonly o: GwOpts = {}) {}
  async catalog(): Promise<ConfigCatalogSnapshot> {
    if (this.o.catalogReject) throw this.o.catalogReject;
    return { values: new Map(Object.entries(this.o.catalogValues ?? {})) };
  }
  async writeKey(key: string, value: unknown): Promise<ConfigWriteResult> {
    this.writeCalls.push({ key, value });
    if (this.o.write) return this.o.write(key, value);
    return { ok: true };
  }
  async writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult> {
    this.writeKeyPathCalls.push({ segments, value });
    return { ok: true };
  }
  async rawConfig(): Promise<Record<string, unknown>> { return {}; }
}

/** Pull once so lastSyncedSnapshot holds the daemon value, then return the engine + fakes. */
async function primed(entry: ConfigKeyEntry, daemonValue: unknown) {
  const settings = new FakeSettings();
  const notifier = new FakeNotifier();
  const gateway = new FakeGateway({ catalogValues: { [entry.path]: daemonValue } });
  const engine = createConfigSyncEngine({ gateway, settings, notifier, keyMap: keyMapOf([entry]) });
  await engine.pullFromDaemon();
  settings.writes.length = 0; // clear the pull's own writes
  return { engine, settings, notifier, gateway };
}

// ── ac1: auto-revert on reject ──────────────────────────────────────────────────

test('applyChanges on an INVALID value reports the reason AND reverts the setting to the last-synced value', async () => {
  const entry = globalEntry('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' });
  const { engine, settings, notifier, gateway } = await primed(entry, 'debug');
  await engine.applyChanges([{ key: 'insrc.logLevel', value: 'nonsense' }]);
  assert.equal(gateway.writeCalls.length, 0); // never written to the daemon
  assert.match(notifier.errors[0]!, /change not applied/);
  assert.deepEqual(settings.writes, [{ key: 'insrc.logLevel', value: 'debug' }]); // reverted to last-synced
});

test('applyChanges on a daemon {ok:false} reports the reason AND reverts, without advancing the snapshot', async () => {
  const entry = globalEntry('ollama.host');
  // Drive a fresh engine primed to the daemon value, with a rejecting write.
  const s = new FakeSettings();
  const n = new FakeNotifier();
  const g2 = new FakeGateway({ catalogValues: { 'ollama.host': 'http://daemon:1' }, write: async () => ({ ok: false, reason: 'invalid path' }) });
  const e = createConfigSyncEngine({ gateway: g2, settings: s, notifier: n, keyMap: keyMapOf([entry]) });
  await e.pullFromDaemon();
  s.writes.length = 0;
  await e.applyChanges([{ key: 'insrc.ollama.host', value: 'http://bad:2' }]);
  assert.match(n.errors[0]!, /daemon rejected/);
  assert.deepEqual(s.writes, [{ key: 'insrc.ollama.host', value: 'http://daemon:1' }]); // reverted
});

test('applyChanges on a daemon-unreachable write (rpc reject) reverts and never throws', async () => {
  const entry = globalEntry('ollama.host');
  const s = new FakeSettings();
  const n = new FakeNotifier();
  const g = new FakeGateway({ catalogValues: { 'ollama.host': 'http://daemon:1' }, write: async () => { throw new Error('daemon is not running'); } });
  const e = createConfigSyncEngine({ gateway: g, settings: s, notifier: n, keyMap: keyMapOf([entry]) });
  await e.pullFromDaemon();
  s.writes.length = 0;
  await e.applyChanges([{ key: 'insrc.ollama.host', value: 'http://bad:2' }]); // must not throw
  assert.match(n.errors[0]!, /could not save/);
  assert.deepEqual(s.writes, [{ key: 'insrc.ollama.host', value: 'http://daemon:1' }]); // reverted
});

test('the revert is a loop-suppressed idempotent no-op: re-applying the reverted value writes nothing', async () => {
  const entry = globalEntry('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' });
  const { engine, gateway } = await primed(entry, 'debug');
  await engine.applyChanges([{ key: 'insrc.logLevel', value: 'nonsense' }]); // invalid → revert to 'debug'
  // The revert write echoes back the good value; re-applying it is a no-op.
  await engine.applyChanges([{ key: 'insrc.logLevel', value: 'debug' }]);
  assert.equal(gateway.writeCalls.length, 0);
});

test('a rejected key with NO last-synced value reverts to option.default and pre-sets the snapshot (no unintended write)', async () => {
  const entry = globalEntry('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' });
  const s = new FakeSettings();
  const n = new FakeNotifier();
  const g = new FakeGateway(); // no pull ⇒ lastSyncedSnapshot empty
  const e = createConfigSyncEngine({ gateway: g, settings: s, notifier: n, keyMap: keyMapOf([entry]) });
  await e.applyChanges([{ key: 'insrc.logLevel', value: 'nonsense' }]); // invalid, no last-known
  assert.deepEqual(s.writes, [{ key: 'insrc.logLevel', value: 'info' }]); // reverted to default
  // The default is now the snapshot ⇒ re-applying 'info' is a no-op (no daemon write).
  await e.applyChanges([{ key: 'insrc.logLevel', value: 'info' }]);
  assert.equal(g.writeCalls.length, 0);
});

test("the revert's own settings.write failure is swallowed (applyChanges never throws)", async () => {
  const entry = globalEntry('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' });
  const { engine, settings, notifier } = await primed(entry, 'debug');
  settings.failKeys.add('insrc.logLevel'); // the revert write will throw
  await engine.applyChanges([{ key: 'insrc.logLevel', value: 'nonsense' }]); // must not throw
  assert.match(notifier.errors[0]!, /change not applied/); // the toast still fired
});

// ── ac2: reconcile ──────────────────────────────────────────────────────────────

test('pullFromDaemon reconciles: it republishes the daemon value over a stale local value + re-captures the snapshot', async () => {
  const entry = globalEntry('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' });
  const settings = new FakeSettings();
  settings.values.set('insrc.logLevel', 'debug'); // a stale local value
  const gateway = new FakeGateway({ catalogValues: { logLevel: 'info' } }); // daemon now holds 'info'
  const engine = createConfigSyncEngine({ gateway, settings, notifier: new FakeNotifier(), keyMap: keyMapOf([entry]) });
  await engine.pullFromDaemon();
  assert.equal(settings.values.get('insrc.logLevel'), 'info'); // reconciled to daemon
  // Snapshot re-captured ⇒ re-applying 'info' is a no-op.
  await engine.applyChanges([{ key: 'insrc.logLevel', value: 'info' }]);
  assert.equal(gateway.writeCalls.length, 0);
});

test('a Refresh (pullFromDaemon) while the daemon is unreachable notifies, changes nothing, and does not throw', async () => {
  const entry = globalEntry('logLevel');
  const settings = new FakeSettings();
  settings.values.set('insrc.logLevel', 'debug');
  const notifier = new FakeNotifier();
  const gateway = new FakeGateway({ catalogReject: new Error('daemon is not running') });
  const engine = createConfigSyncEngine({ gateway, settings, notifier, keyMap: keyMapOf([entry]) });
  await engine.pullFromDaemon(); // the Refresh command body; must not throw
  assert.equal(settings.values.get('insrc.logLevel'), 'debug'); // unchanged (not blanked)
  assert.match(notifier.errors[0]!, /daemon is not running/);
});

// ── ac3: the Refresh command is first-class + palette-reachable ──────────────────

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(HERE, '..', '..', '..', 'package.json'), 'utf8')) as {
  contributes?: { commands?: Array<{ command: string; title: string; category?: string }>; configuration?: unknown };
};
const readSrc = (rel: string) => readFileSync(join(HERE, '..', '..', rel), 'utf8');

test('package.json contributes.commands includes insrc.settings.refresh alongside the 7 shipped commands', () => {
  const cmds = PKG.contributes?.commands ?? [];
  const refresh = cmds.find((c) => c.command === 'insrc.settings.refresh');
  assert.ok(refresh, 'insrc.settings.refresh not declared');
  assert.equal(refresh.title, 'Refresh insrc settings');
  assert.equal(refresh.category, 'insrc');
  assert.equal(cmds.length, 10); // 7 shipped + refresh + the 2 S004 panel commands
});

test('the InsrcCommandId union includes insrc.settings.refresh and extension.ts wires it to pullFromDaemon', () => {
  const registry = readSrc('surfaces/command-registry.ts');
  assert.match(registry, /'insrc\.settings\.refresh'/);
  const ext = readSrc('extension.ts');
  assert.match(ext, /commands\.register\(\s*\{\s*id:\s*'insrc\.settings\.refresh'/);
  assert.match(ext, /configSync\.pullFromDaemon\(\)/);
});

// ── deferral guard + seam ────────────────────────────────────────────────────────

test('insrc.advanced is NOT declared in S003 (escape-hatch deferred to a later story)', () => {
  const config = PKG.contributes?.configuration;
  const sections = Array.isArray(config) ? config : config ? [config] : [];
  for (const section of sections as Array<{ properties?: Record<string, unknown> }>) {
    for (const id of Object.keys(section.properties ?? {})) {
      assert.notEqual(id, 'insrc.advanced', 'insrc.advanced should be deferred, not declared in S003');
    }
  }
});

test('the config engine still imports no vscode and calls only config.catalog/config.write/config.show', () => {
  const engine = readSrc('config/sync-engine.ts');
  assert.doesNotMatch(engine, /from ['"]vscode['"]/);
  const gateway = readSrc('config/gateway.ts');
  const methods = [...new Set([...gateway.matchAll(/rpc<[^>]*>+\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]))].sort();
  assert.deepEqual(methods, ['config.catalog', 'config.show', 'config.write']);
});
