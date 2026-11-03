import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fingerprint } from '../../../packages/project-memory/src/__tests__/fixtures/store-native.js';

const evidence = new URL('../../../docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d/S003/evidence/', import.meta.url);
async function json(path: string) { return JSON.parse(await readFile(new URL(path, evidence), 'utf8')); }

test('store-macos-apfs-linux-ext4-production-evidence-matches-current-source', async () => {
  const manifest = await json('t10-platforms.json');
  const mac = await json(manifest.macPath), linux = await json(manifest.linuxPath), ci = await json(manifest.ciRecordPath);
  assert.equal(ci.status, 'completed'); assert.equal(ci.conclusion, 'success');
  assert.equal(ci.headSha, manifest.candidateCommit); assert.equal(ci.databaseId, manifest.ciRunId); assert.equal(ci.url, manifest.ciRunUrl);
  const current = await fingerprint();
  assert.deepEqual(mac.source, current.source); assert.deepEqual(linux.source, current.source);
  for (const [report, platform, fs] of [[mac, 'darwin', 26], [linux, 'linux', 0xef53]] as const) {
    assert.equal(report.kind, 'production-store-real-queue-process-crashes');
    assert.equal(report.platform, platform); assert.equal(report.filesystemType, fs);
    assert.match(report.node, /^22\./); assert.equal(report.abi, '127');
    assert.equal(report.versions['@lancedb/lancedb'], '0.40.0'); assert.equal(report.versions['apache-arrow'], '18.1.0');
    assert.equal(report.nativePackage, '@lancedb/lancedb-' + platform + '-' + report.arch + (platform === 'linux' ? '-gnu' : ''));
    assert.match(report.nativeSha256, /^[a-f0-9]{64}$/);
    assert.equal(report.scenarios.length, 14);
    assert.deepEqual(report.scenarios.map((s: { mode: string; delayMs: number }) => [s.mode, s.delayMs]), [
      ['accepted', 0], ['before-write', 0], ...[0, 2, 10, 50].map(delay => ['race', delay]),
      ['before-reply', 0], ['before-ack', 0], ['after-ack', 0], ['after-recycle', 0],
      ['forget-project', 0], ['forget-session', 0], ['forget-conversation', 0], ['reader-delete', 0],
    ]);
    for (const scenario of report.scenarios) {
      assert.equal(scenario.signal, 'SIGKILL'); assert.equal(scenario.liveOwnerConflict, true);
      assert.equal(scenario.acceptedReceipt.state, 'accepted'); assert.equal(scenario.acceptedReceipt.operationId, scenario.acceptedOperation);
      assert.match(scenario.acceptedPayloadHash, /^[a-f0-9]{64}$/); assert.ok(scenario.observedStages.length > 0);
      assert.equal(scenario.pendingEvents, 0);
      assert.equal(scenario.recoveredVersion, 2 + Number(scenario.recoveredGeneration));
      if (scenario.mode === 'reader-delete') { assert.equal(scenario.recoveredGeneration, '2'); assert.equal(scenario.finalGeneration, '2'); }
      else if (scenario.mode.startsWith('forget-')) { assert.equal(scenario.recoveredGeneration, '1'); assert.equal(scenario.finalGeneration, '2'); }
      else {
        assert.ok(['0', '1'].includes(scenario.recoveredGeneration)); assert.equal(scenario.finalGeneration, '1');
        if (['accepted', 'before-write'].includes(scenario.mode)) { assert.equal(scenario.recoveredGeneration, '0'); assert.equal(scenario.recoveredRows, 1); }
        if (['before-reply', 'before-ack', 'after-ack', 'after-recycle'].includes(scenario.mode)) assert.equal(scenario.recoveredGeneration, '1');
      }
    }
  }
});
