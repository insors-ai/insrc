/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectCodexProbeObservations, CODEX_PROBE_TELEMETRY_VERSION } from '../codex-investigation-probe.js';
import { installedInvestigationImages, assertInstalledImagesPinned } from '../native-investigation-installation.js';
import { investigationFileDigest } from '../investigation-session.js';
import type { ProcessGroupResult } from '../../../shared/process-group.js';

test('Codex observation parser pins launcher and real runtime; missing inventory remains unsupported', () => {
  const identity = { attemptId: randomUUID(), launchDigest: 'a'.repeat(64), effectiveDigest: 'b'.repeat(64), binaryVersion: CODEX_PROBE_TELEMETRY_VERSION };
  const result = (...events: unknown[]): ProcessGroupResult => ({ stdout: events.map(e => JSON.stringify(e)).join('\n'), stderr: '', exitCode: 0, timedOut: false, durationMs: 1 });
  for (const value of [result(), result({ type: 'thread.started' }, { type: 'turn.started' }),
    result({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify({ denied: ['shell', 'network'], tools: [] }) } }),
    result({ args: ['--sandbox', 'read-only', '--ignore-user-config'], effective: { tools: [] } })]) {
    const observations = collectCodexProbeObservations(value, identity);
    assert.ok(observations.every(o => o.verdict === 'unverifiable'));
    assert.ok(observations.every(o => o.attemptId === identity.attemptId && o.launchDigest === identity.launchDigest));
  }
  const broad = result({ type: 'item.started', item: { type: 'command_execution', command: 'unexpected' } });
  assert.ok(collectCodexProbeObservations(broad, identity).some(o => o.check === 'shell' && o.verdict === 'observed-allowed'));
  assert.ok(collectCodexProbeObservations(broad, { ...identity, binaryVersion: 'unknown' }).every(o => o.verdict === 'unverifiable'));
  assert.ok(collectCodexProbeObservations({ ...broad, stdout: '{partial' }, identity).every(o => o.verdict === 'unverifiable'));
  assert.ok(collectCodexProbeObservations({ ...broad, outputLimitExceeded: true }, identity).every(o => o.verdict === 'unverifiable'));
  const root = mkdtempSync(join(tmpdir(), 'codex-images-fixture-'));
  try {
    mkdirSync(join(root, 'bin'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@openai/codex' }));
    const binary = join(root, 'bin', 'codex.js'); writeFileSync(binary, `#!${process.execPath}\n// non-executed fixture\n`, { mode: 0o700 });
    const triple = process.platform === 'linux' ? `${process.arch === 'x64' ? 'x86_64' : 'aarch64'}-unknown-linux-musl` : `${process.arch === 'x64' ? 'x86_64' : 'aarch64'}-apple-darwin`;
    const vendor = join(root, 'vendor', triple, 'bin'); mkdirSync(vendor, { recursive: true });
    const actual = join(vendor, 'codex'); writeFileSync(actual, 'non-executed vendor image', { mode: 0o700 });
    const images = installedInvestigationImages('codex', binary, root);
    const pinned = { kind: 'codex' as const, adapterVersion: 'codex-scoped-v1', binaryVersion: 'nonqualifying-fixture',
      binary: { path: realpathSync(binary), digest: investigationFileDigest(binary) }, runtimeFiles: images.filter(p => p.path !== binary),
      profileDigest: 'a'.repeat(64), catalogDigest: 'b'.repeat(64), launchDigest: 'c'.repeat(64) };
    assertInstalledImagesPinned(pinned, images);
    assert.throws(() => assertInstalledImagesPinned({ ...pinned, runtimeFiles: [] }, images), /absent or stale/);
    writeFileSync(actual, 'changed vendor image');
    assert.throws(() => assertInstalledImagesPinned(pinned, installedInvestigationImages('codex', binary, root)), /absent or stale/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
