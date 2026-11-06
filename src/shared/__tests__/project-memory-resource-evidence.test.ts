import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fingerprint } from '../../../packages/project-memory/src/__tests__/fixtures/store-native.js';

const evidence = new URL('../../../docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/', import.meta.url);
test('project-memory-resource-study-has-current-source-complete-corpora-and-honest-bounds', async () => {
  const report = JSON.parse(await readFile(new URL('t16-resource.json', evidence), 'utf8'));
  assert.equal(report.complete, true); assert.equal(report.error, undefined);
  const currentSource = (await fingerprint()).source;
  const differences = [...new Set([...Object.keys(report.source), ...Object.keys(currentSource)])].filter(path => report.source[path] !== currentSource[path]).sort();
  const qualified = { ...report.source };
  if (differences.length) {
    // A corrected, unexecuted regression fixture does not invalidate measured
    // runtime/harness behavior. Preserve the original study record and require
    // exact old/new hashes for these test-only changes, not a blanket exception.
    const compatibility = JSON.parse(await readFile(new URL('t16-test-source-compatibility.json', evidence), 'utf8'));
    assert.deepEqual(compatibility.changes.map((entry: { path: string }) => entry.path).sort(), differences);
    for (const entry of compatibility.changes) {
      assert.match(entry.path, /^src\/__tests__\/[^/]+\.test\.ts$/);
      assert.match(entry.studiedSha256, /^[a-f0-9]{64}$/); assert.match(entry.qualifiedSha256, /^[a-f0-9]{64}$/);
      assert.equal(entry.studiedSha256, report.source[entry.path]); assert.equal(entry.qualifiedSha256, currentSource[entry.path]);
      assert.ok(entry.reason.length > 0); qualified[entry.path] = entry.qualifiedSha256;
    }
  }
  assert.deepEqual(qualified, currentSource, 'all runtime and executed study/harness source remains exact');
  assert.equal(report.versions['@lancedb/lancedb'], '0.40.0'); assert.equal(report.versions['apache-arrow'], '18.1.0');
  assert.match(report.node, /^22\./); assert.equal(report.abi, '127');
  assert.ok(['darwin', 'linux'].includes(report.platform)); assert.equal(report.filesystemType, report.platform === 'darwin' ? 26 : 0xef53);
  assert.match(report.nativeSha256, /^[a-f0-9]{64}$/);
  assert.ok(report.hardware.logicalCpus > 0); assert.ok(report.hardware.totalMemoryBytes > 0);
  assert.equal(report.profile.dimension, 2); assert.equal(report.profile.normalizationVersion, 'utf8-verbatim-f32-no-renorm-v1');
  for (const [index, label, count] of [[0, 'empty', 0], [1, '1k', 1000], [2, '10k', 10000]] as const) {
    const stage = report.stages[index]; assert.equal(stage.label, label); assert.equal(stage.initialCurrentRows, count); assert.equal(stage.finalCurrentRows, count + 5);
    for (const key of ['storeOpenMs', 'currentMs', 'commitIncludingQueueAckMs']) {
      const result = stage[key]; assert.equal(result.samples.length, 5);
      assert.ok(result.samples.every((value: number) => Number.isFinite(value) && value >= 0));
      const ordered = [...result.samples].sort((a, b) => a - b); assert.equal(result.p50, ordered[2]); assert.equal(result.p95, ordered[4]);
    }
    assert.equal(stage.currentOutcomes.length, 5);
    for (const outcome of stage.currentOutcomes) {
      if (count === 10000) { assert.equal(outcome.error, 'CONTEXT_OVERFLOW'); assert.equal(outcome.resultCount, null); }
      else if (outcome.error === null) assert.equal(outcome.resultCount, count);
      else { assert.equal(outcome.error, 'DEADLINE_EXCEEDED'); assert.equal(outcome.resultCount, null); }
    }
  }
  assert.equal(report.stages[3].label, '10k-plus-1k-history-1k-tombstones');
  assert.deepEqual(report.stages[3].accounting.counts, { control: 2, source: 1025, current: 10005, revision: 11005, evidence: 11005, receipt: 2025, tombstone: 1000 });
  assert.equal(report.boundaries.length, 4); assert.ok(report.boundaries.every((b: { passed: boolean }) => b.passed === true));
  assert.equal(report.boundaries[1].nativeWriteClaim, false);
  assert.equal(report.boundaries[2].acceptedEffectRows, 4093); assert.equal(report.boundaries[2].generatedRows, 3);
  assert.deepEqual(report.finalAccounting.counts, { control: 3, source: 5118, current: 10005, revision: 11005, evidence: 11005, receipt: 2026, tombstone: 1000 });
  for (const kind of ['receipt', 'control']) assert.ok(report.finalAccounting.payloadBytes[kind] > 0);
  assert.ok(report.finalAccounting.logicalDiskBytes > 0); assert.ok(report.finalAccounting.allocatedDiskKiB > 0);
  assert.ok(report.peaks.rss > 0 && report.peaks.heapUsed > 0 && report.peaks.heapTotal > 0); assert.ok(report.maxRSSKiB > 0);
  assert.ok(report.limitations.some((line: string) => line.includes('not isolated allocator')));
  assert.ok(report.limitations.some((line: string) => line.includes('not statistical production SLOs')));
  const progress = (await readFile(new URL('t16-resource.json.progress.jsonl', evidence), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  for (const kind of ['history', 'tombstones']) {
    const entries = progress.filter(row => row.stage === kind);
    assert.deepEqual(entries.map(row => row.revisionsAdded ?? row.count), Array.from({ length: 10 }, (_, i) => 100 * (i + 1)));
  }
  assert.equal(progress.at(-1)?.stage, 'complete'); assert.equal(progress.at(-1)?.generation, '2026');
});
