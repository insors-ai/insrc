import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeTest } from './fixtures/node22.js';

nativeTest(import.meta.url, 'queue-resource-and-fsync-cost-measurement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'memory-study-check-'));
  try {
    const output = join(directory, 'report.json');
    execFileSync(process.execPath, [fileURLToPath(new URL('../../benchmarks/queue-cost.mjs', import.meta.url)), '--quick', '--output', output], { timeout: 45_000, stdio: 'pipe' });
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.mode, 'quick'); assert.match(report.hardware.node, /^22\./);
    assert.equal(report.profiles.length, 3);
    assert.equal(report.profiles[2].fixtureEvents, 16);
    for (const profile of report.profiles) {
      assert.equal(profile.samples, 2); assert.ok(profile.p50Ms >= 0 && profile.p95Ms >= profile.p50Ms);
      assert.equal(profile.counters.activeOwnedWork, 0);
      assert.equal(profile.physical.segmentBytes, profile.counters.durable.pendingBytes);
      assert.ok(profile.physical.controlBytes > 0);
      assert.equal(profile.processCold.pendingEvents, profile.counters.durable.pendingEvents);
      assert.ok(profile.processCold.recoveryMs >= 0);
    }
    assert.ok(report.qualifications.some((s: string) => s.includes('not ingestion latency')));
    assert.ok(report.qualifications.some((s: string) => s.includes('Semantic commit is unimplemented')));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
