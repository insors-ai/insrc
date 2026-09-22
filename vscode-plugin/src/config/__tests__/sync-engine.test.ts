/**
 * Story E20260922401ae5fb:S001 / t6 — ConfigSyncEngine unit suite.
 *
 * Drives the VS-Code-free createConfigSyncEngine over injected fakes (a fake
 * SettingsStore / ConfigGateway / Notifier + a fixture ConfigKeyMap) — no VS
 * Code, no daemon. Proves the six sc8 subjects: pull maps values + defaults +
 * snapshot, catalog-reject is a no-op, valid write-once, invalid-value rejection,
 * {ok:false}/reject handling, and the idempotent no-op.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

// ── fixtures ────────────────────────────────────────────────────────────────

function opt(path: string, over: Partial<ConfigOption> = {}): ConfigOption {
  return { path, type: 'string', default: `${path}-default`, desc: path, group: 'G', ...over };
}

/** A small fixture ConfigKeyMap over a handful of options. */
function fixtureKeyMap(options: readonly ConfigOption[]): ConfigKeyMap {
  const entries: ConfigKeyEntry[] = options.map((option) => ({
    nativeKey: 'insrc.' + option.path,
    path: option.path,
    option,
  }));
  const byNative = new Map(entries.map((e) => [e.nativeKey, e]));
  const byPath = new Map(entries.map((e) => [e.path, e]));
  return {
    entries,
    byNativeKey: (k) => byNative.get(k),
    byPath: (p) => byPath.get(p),
  };
}

class FakeSettingsStore implements SettingsStore {
  public readonly values = new Map<string, unknown>();
  public readonly writes: Array<{ key: string; value: unknown }> = [];
  read(key: string): unknown { return this.values.get(key); }
  async write(key: string, value: unknown): Promise<void> {
    this.writes.push({ key, value });
    this.values.set(key, value);
  }
  snapshot(): ReadonlyMap<string, unknown> { return new Map(this.values); }
}

class FakeNotifier implements Notifier {
  public readonly errors: string[] = [];
  error(message: string): void { this.errors.push(message); }
}

interface FakeGatewayOpts {
  catalogValues?: Record<string, unknown>;
  catalogReject?: Error;
  write?: (key: string, value: unknown) => Promise<ConfigWriteResult>;
}

class FakeGateway implements ConfigGateway {
  public readonly writeCalls: Array<{ key: string; value: unknown }> = [];
  constructor(private readonly opts: FakeGatewayOpts = {}) {}
  async catalog(): Promise<ConfigCatalogSnapshot> {
    if (this.opts.catalogReject) throw this.opts.catalogReject;
    return { values: new Map(Object.entries(this.opts.catalogValues ?? {})) };
  }
  async writeKey(key: string, value: unknown): Promise<ConfigWriteResult> {
    this.writeCalls.push({ key, value });
    if (this.opts.write) return this.opts.write(key, value);
    return { ok: true };
  }
}

// ── pullFromDaemon ────────────────────────────────────────────────────────────

test('pullFromDaemon writes each catalog value, and the ConfigOption.default for an omitted path', async () => {
  const options = [opt('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' }), opt('ollama.host')];
  const settings = new FakeSettingsStore();
  const gateway = new FakeGateway({ catalogValues: { logLevel: 'debug' } }); // ollama.host omitted
  const engine = createConfigSyncEngine({ gateway, settings, notifier: new FakeNotifier(), keyMap: fixtureKeyMap(options) });

  await engine.pullFromDaemon();

  assert.equal(settings.values.get('insrc.logLevel'), 'debug'); // daemon value
  assert.equal(settings.values.get('insrc.ollama.host'), 'ollama.host-default'); // default for omitted
});

test('pullFromDaemon on a catalog() rejection writes nothing and notifies without throwing', async () => {
  const settings = new FakeSettingsStore();
  const notifier = new FakeNotifier();
  const gateway = new FakeGateway({ catalogReject: new Error('daemon is not running') });
  const engine = createConfigSyncEngine({ gateway, settings, notifier, keyMap: fixtureKeyMap([opt('logLevel')]) });

  await engine.pullFromDaemon(); // must not throw

  assert.equal(settings.writes.length, 0);
  assert.equal(notifier.errors.length, 1);
  assert.match(notifier.errors[0]!, /daemon is not running/);
});

test('pullFromDaemon captures the last-synced snapshot so a re-apply of the same value is a no-op', async () => {
  const settings = new FakeSettingsStore();
  const gateway = new FakeGateway({ catalogValues: { logLevel: 'debug' } });
  const engine = createConfigSyncEngine({
    gateway, settings, notifier: new FakeNotifier(),
    keyMap: fixtureKeyMap([opt('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' })]),
  });

  await engine.pullFromDaemon();
  // Re-applying the just-synced value must not write (snapshot captured).
  await engine.applyChanges([{ key: 'insrc.logLevel', value: 'debug' }]);
  assert.equal(gateway.writeCalls.length, 0);
});

test('pull publishes the snapshot for EVERY key so an echoed re-apply of the pulled values writes nothing (MED-1: activation echo suppression)', async () => {
  // Two keys whose daemon values differ from the manifest/option defaults — the
  // activation write of these would fire onDidChangeConfiguration and, without a
  // pre-published snapshot, echo straight back to the daemon.
  const options = [
    opt('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' }),
    opt('analyzer.useLocal', { type: 'boolean', default: false }),
  ];
  const settings = new FakeSettingsStore();
  const gateway = new FakeGateway({ catalogValues: { logLevel: 'debug', 'analyzer.useLocal': true } });
  const engine = createConfigSyncEngine({ gateway, settings, notifier: new FakeNotifier(), keyMap: fixtureKeyMap(options) });

  await engine.pullFromDaemon();
  // Simulate VS Code echoing our own pull writes back through the change listener.
  await engine.applyChanges([
    { key: 'insrc.logLevel', value: 'debug' },
    { key: 'insrc.analyzer.useLocal', value: true },
  ]);

  assert.equal(gateway.writeCalls.length, 0, 'the activation echo must not write the daemon back');
});

// ── applyChanges ──────────────────────────────────────────────────────────────

test('applyChanges on a valid change maps native key -> path and writes exactly once', async () => {
  const settings = new FakeSettingsStore();
  const gateway = new FakeGateway();
  const engine = createConfigSyncEngine({ gateway, settings, notifier: new FakeNotifier(), keyMap: fixtureKeyMap([opt('ollama.host')]) });

  await engine.applyChanges([{ key: 'insrc.ollama.host', value: 'http://x:1' }]);

  assert.deepEqual(gateway.writeCalls, [{ key: 'ollama.host', value: 'http://x:1' }]);
});

test('applyChanges rejects an invalid enum value without calling writeKey and reports a reason', async () => {
  const notifier = new FakeNotifier();
  const gateway = new FakeGateway();
  const engine = createConfigSyncEngine({
    gateway, settings: new FakeSettingsStore(), notifier,
    keyMap: fixtureKeyMap([opt('logLevel', { type: 'enum', enumValues: ['info', 'debug'], default: 'info' })]),
  });

  await engine.applyChanges([{ key: 'insrc.logLevel', value: 'nope' }]);

  assert.equal(gateway.writeCalls.length, 0);
  assert.equal(notifier.errors.length, 1);
  assert.match(notifier.errors[0]!, /must be one of: info, debug/);
});

test('applyChanges rejects a wrong-typed number without writing', async () => {
  const notifier = new FakeNotifier();
  const gateway = new FakeGateway();
  const engine = createConfigSyncEngine({
    gateway, settings: new FakeSettingsStore(), notifier,
    keyMap: fixtureKeyMap([opt('codeReview.freshnessTimeoutMs', { type: 'number', default: 120000 })]),
  });

  await engine.applyChanges([{ key: 'insrc.codeReview.freshnessTimeoutMs', value: 'lots' }]);

  assert.equal(gateway.writeCalls.length, 0);
  assert.match(notifier.errors[0]!, /must be a number/);
});

test('applyChanges on a daemon {ok:false} reports a rejected write and does not advance the snapshot', async () => {
  const notifier = new FakeNotifier();
  const gateway = new FakeGateway({ write: async () => ({ ok: false, reason: 'invalid path' }) });
  const engine = createConfigSyncEngine({ gateway, settings: new FakeSettingsStore(), notifier, keyMap: fixtureKeyMap([opt('ollama.host')]) });

  await engine.applyChanges([{ key: 'insrc.ollama.host', value: 'http://x:1' }]);
  assert.match(notifier.errors[0]!, /daemon rejected/);

  // Snapshot not advanced: re-applying the same value writes AGAIN (not a no-op).
  await engine.applyChanges([{ key: 'insrc.ollama.host', value: 'http://x:1' }]);
  assert.equal(gateway.writeCalls.length, 2);
});

test('applyChanges on a writeKey rejection reports a rejected write without throwing', async () => {
  const notifier = new FakeNotifier();
  const gateway = new FakeGateway({ write: async () => { throw new Error('daemon is not running'); } });
  const engine = createConfigSyncEngine({ gateway, settings: new FakeSettingsStore(), notifier, keyMap: fixtureKeyMap([opt('ollama.host')]) });

  await engine.applyChanges([{ key: 'insrc.ollama.host', value: 'http://x:1' }]); // must not throw

  assert.equal(notifier.errors.length, 1);
  assert.match(notifier.errors[0]!, /could not save/);
});

test('applyChanges ignores an unknown native key (drift-safe) — no write, no notify', async () => {
  const notifier = new FakeNotifier();
  const gateway = new FakeGateway();
  const engine = createConfigSyncEngine({ gateway, settings: new FakeSettingsStore(), notifier, keyMap: fixtureKeyMap([opt('ollama.host')]) });

  await engine.applyChanges([{ key: 'insrc.unknown.key', value: 'x' } as ChangedKey]);

  assert.equal(gateway.writeCalls.length, 0);
  assert.equal(notifier.errors.length, 0);
});

test('applyChanges advances the snapshot on a successful write so an immediate re-apply is a no-op', async () => {
  const gateway = new FakeGateway();
  const engine = createConfigSyncEngine({ gateway, settings: new FakeSettingsStore(), notifier: new FakeNotifier(), keyMap: fixtureKeyMap([opt('ollama.host')]) });

  await engine.applyChanges([{ key: 'insrc.ollama.host', value: 'http://x:1' }]);
  await engine.applyChanges([{ key: 'insrc.ollama.host', value: 'http://x:1' }]); // same value again
  assert.equal(gateway.writeCalls.length, 1); // idempotent no-op on the second
});
