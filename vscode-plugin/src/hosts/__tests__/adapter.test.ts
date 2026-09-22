/**
 * Story E20260921ad0d45c9:S003 / t2 — sc5 detection + adapter wire/unwire +
 * registry, over injected HostEnv + fake fs (off VS Code).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHostAdapter, createHostRegistry, type HostAdapterDeps } from '../adapter.js';
import { SERVER_KEY } from '../mcp-writer.js';
import { STEERING_MARKER_START } from '../steering-writer.js';
import type { HostSpec } from '../types.js';
import { fakeFs, fakeEnv, type FakeFs } from './fakes.js';

const MCP = '/home/u/host/mcp.json';
const STEER = '/home/u/host/rules.md';
const LAUNCH = '/home/u/.insrc/daemon/out/bin/insrc-mcp.js';

function byExtSpec(id = 'test.ext'): HostSpec {
  return {
    descriptor: { id, displayName: 'Ext Host', detection: { kind: 'by-extension-id', extensionId: id } },
    detect: (env) => env.getExtension(id),
    resolveConfig: () => ({ mcpConfigPath: MCP, steeringPath: STEER }),
  };
}

function byEnvSpec(): HostSpec {
  return {
    descriptor: { id: 'cursor', displayName: 'Cursor', detection: { kind: 'by-editor-env', appName: 'Cursor' } },
    detect: (env) => env.appName === 'Cursor',
    resolveConfig: () => ({ mcpConfigPath: MCP, steeringPath: STEER }),
  };
}

function deps(fs: FakeFs, over: Partial<HostAdapterDeps> = {}): HostAdapterDeps {
  return {
    env: fakeEnv({ extensions: ['test.ext'] }),
    fs,
    launchTarget: () => LAUNCH,
    steeringBody: () => 'insrc guidance',
    ...over,
  };
}

test('detectPresent: by-extension-id → getExtension; by-editor-env → appName/uriScheme; never throws (indeterminate → false)', async () => {
  const fs = fakeFs();

  const ext = createHostAdapter(byExtSpec(), deps(fs, { env: fakeEnv({ extensions: ['test.ext'] }) }));
  assert.equal(await ext.detectPresent(), true);
  const extAbsent = createHostAdapter(byExtSpec(), deps(fs, { env: fakeEnv({ extensions: [] }) }));
  assert.equal(await extAbsent.detectPresent(), false);

  const cursor = createHostAdapter(byEnvSpec(), deps(fs, { env: fakeEnv({ appName: 'Cursor' }) }));
  assert.equal(await cursor.detectPresent(), true);
  const notCursor = createHostAdapter(byEnvSpec(), deps(fs, { env: fakeEnv({ appName: 'Visual Studio Code' }) }));
  assert.equal(await notCursor.detectPresent(), false);

  // a throwing detect predicate resolves false, never throws.
  const boom: HostSpec = { ...byExtSpec(), detect: () => { throw new Error('probe blew up'); } };
  const guarded = createHostAdapter(boom, deps(fs));
  assert.equal(await guarded.detectPresent(), false);
});

test('wire writes BOTH the mcpServers.insrc entry + the steering block; skips the mcp entry (steering only) when the launch target is absent', async () => {
  const fs = fakeFs();
  const a = createHostAdapter(byExtSpec(), deps(fs));
  await a.wire();
  assert.deepEqual(JSON.parse(fs.files.get(MCP)!).mcpServers[SERVER_KEY], { command: 'node', args: [LAUNCH] });
  assert.match(fs.files.get(STEER)!, new RegExp(STEERING_MARKER_START.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')));

  // launch target absent → steering written, NO mcp entry (no broken `node undefined`).
  const fs2 = fakeFs();
  const a2 = createHostAdapter(byExtSpec(), deps(fs2, { launchTarget: () => undefined }));
  await a2.wire();
  assert.equal(fs2.files.has(MCP), false, 'no mcp config written when launch target absent');
  assert.match(fs2.files.get(STEER)!, /insrc guidance/, 'steering still written');
});

test('unwire removes exactly the insrc key + the marker block, restoring prior content (reversible)', async () => {
  const fs = fakeFs({ [MCP]: JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 2), [STEER]: '# notes\n' });
  const a = createHostAdapter(byExtSpec(), deps(fs));
  await a.wire();
  await a.unwire();

  const parsed = JSON.parse(fs.files.get(MCP)!);
  assert.equal(SERVER_KEY in parsed.mcpServers, false, 'insrc key removed');
  assert.deepEqual(parsed.mcpServers.other, { command: 'x' }, 'other server preserved');
  assert.equal(fs.files.get(STEER), '# notes\n', 'steering restored to pre-insrc content');
});

test('wire-then-unwire when insrc CREATED the files leaves an empty mcpServers + empty steering (documented reversibility edge, matches the JetBrains reference)', async () => {
  // No prior config for this host — insrc creates both files during wire().
  const fs = fakeFs();
  const a = createHostAdapter(byExtSpec(), deps(fs));
  await a.wire();
  await a.unwire();

  // The insrc entry/key + marker block are gone (the insrc region IS reversed)…
  const parsed = JSON.parse(fs.files.get(MCP)!);
  assert.equal(SERVER_KEY in parsed.mcpServers, false, 'insrc key removed');
  assert.deepEqual(parsed.mcpServers, {}, 'an insrc-created mcpServers is left empty (valid + harmless, not pruned)');
  assert.equal(fs.files.get(STEER), '', 'an insrc-created steering file is left empty (not deleted — deleting a user file would be the worse hazard)');
});

test('AiHostRegistry.detectPresent returns only present adapters and omits a throwing one; adapters() returns the full set', async () => {
  const fs = fakeFs();
  const present = byExtSpec('present.ext');
  const absent = byExtSpec('absent.ext');
  const throwing: HostSpec = { ...byExtSpec('boom.ext'), detect: () => { throw new Error('nope'); } };

  const registry = createHostRegistry([present, absent, throwing], deps(fs, { env: fakeEnv({ extensions: ['present.ext'] }) }));

  assert.equal(registry.adapters().length, 3, 'adapters() is the full pluggable set');
  const detected = await registry.detectPresent();
  assert.deepEqual(detected.map((a) => a.descriptor.id), ['present.ext'], 'only the present, non-throwing host');
});

test('createHostAdapter builds an adapter from a data-only HostSpec (ac3): a new HostSpec plugs in with no existing-adapter change', async () => {
  const fs = fakeFs();
  // A brand-new host defined purely as data — no factory/adapter edit.
  const newHost: HostSpec = {
    descriptor: { id: 'new.host', displayName: 'New Host', detection: { kind: 'by-extension-id', extensionId: 'new.host' } },
    detect: (env) => env.getExtension('new.host'),
    resolveConfig: () => ({ mcpConfigPath: '/home/u/new/mcp.json', steeringPath: '/home/u/new/rules.md' }),
  };
  const registry = createHostRegistry([byExtSpec(), newHost], deps(fs, { env: fakeEnv({ extensions: ['new.host'] }) }));
  const detected = await registry.detectPresent();
  assert.deepEqual(detected.map((a) => a.descriptor.id), ['new.host']);
  await detected[0]!.wire();
  assert.ok(fs.files.has('/home/u/new/mcp.json'), 'the new host wired via the same shared factory');
});
