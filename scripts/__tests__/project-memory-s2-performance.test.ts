import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const packageRoot = root + 'packages/project-memory/';
test('full-current-source-queue-resource-study-evidence', () => {
  const r = JSON.parse(readFileSync(root + 'docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S002/evidence/performance/queue-cost.json', 'utf8'));
  assert.equal(r.mode, 'full'); assert.equal(typeof r.hardware.cpu, 'string'); assert.match(r.hardware.node, /^22\./);
  const files = [...readdirSync(packageRoot + 'src').filter(n => n.endsWith('.ts')).map(n => 'src/' + n), ...readdirSync(packageRoot + 'src/queue').filter(n => n.endsWith('.ts')).map(n => 'src/queue/' + n), 'benchmarks/queue-cost.mjs'].sort();
  assert.deepEqual(Object.keys(r.source).sort(), files);
  for (const file of files) assert.equal(r.source[file], createHash('sha256').update(readFileSync(packageRoot + file)).digest('hex'), file + ' changed after measurement');
  const empty = r.profiles.filter((p: { name: string }) => p.name === 'empty');
  assert.deepEqual(empty.map((p: { commandBytes: number }) => p.commandBytes), [1024, 65536, 1048576]);
  assert.ok(empty.every((p: { samples: number }) => p.samples === 20));
  const backlog = r.profiles.find((p: { name: string }) => p.name === 'backlog-1k'); assert.equal(backlog.fixtureEvents, 1000);
  const cap = r.profiles.find((p: { name: string }) => p.name === 'metadata-cap'); assert.ok(cap.fixtureEvents > 16_000); assert.equal(cap.outcome, 'BACKPRESSURE'); assert.equal(cap.counters.durable.pendingEvents, cap.fixtureEvents);
  const edge = r.profiles.find((p: { name: string }) => p.name === '16MiB-safety'); assert.equal(edge.commandBytes, 16 * 1024 * 1024); assert.equal(edge.oversizeRejected, true); assert.equal(edge.counters.durable.pendingEvents, 1);
  for (const profile of r.profiles) { assert.equal(profile.physical.segmentBytes, profile.counters.durable.pendingBytes); assert.equal(profile.processCold.pendingEvents, profile.counters.durable.pendingEvents); assert.equal(profile.counters.activeOwnedWork, 0); }
  assert.ok(r.resources.observedMaxRss > 0); assert.ok(r.resources.observedMaxHeap > 0);
  assert.ok(r.qualifications.some((s: string) => s.includes('No production defaults')));
});
