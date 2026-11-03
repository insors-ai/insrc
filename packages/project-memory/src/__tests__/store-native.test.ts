import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { acquireOwnership } from '../ownership.js';
import { validateRuntime } from '../configuration.js';
import { encodeRow, makeRow, rootRow, ROOT_ROW_ID } from '../store/codec.js';
import { embeddingProfile } from '../store/embedding-profile.js';
import { snapshotJson } from '../queue/codec.js';
import { nativeTest } from './fixtures/node22.js';
import { options } from './fixtures/options.js';
import { currentPayload, epoch, profile, scope, storeId } from './fixtures/store-rows.js';
import { baseline, decodedNative, effects, fingerprint, openNative, packageRoot } from './fixtures/store-native.js';

const peer = fileURLToPath(new URL('./fixtures/store-native-peer.ts', import.meta.url));
async function crash(root: string, mode: 'before' | 'after' | 'race', delayMs = 0) {
  const env = { ...process.env }; delete env['NODE_TEST_CONTEXT'];
  const child = fork(peer, [root, mode], { cwd: packageRoot, execPath: process.execPath, execArgv: ['--import', 'tsx'], env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  return new Promise<{ baseline: number; after: number | null }>((resolve, reject) => {
    let baselineVersion: number | null = null, afterVersion: number | null = null, observed = false, stderr = '';
    let raceTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(Error('Native crash boundary timed out: ' + mode + ': ' + stderr)); }, 45_000);
    child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4096); });
    child.on('message', value => {
      const m = value as { type: string; version: number };
      if (m.type === 'baseline') baselineVersion = m.version;
      if (mode === 'race' && m.type === 'race') { observed = true; raceTimer = setTimeout(() => child.kill('SIGKILL'), delayMs); }
      if (mode !== 'race' && m.type === mode) { observed = true; if (mode === 'after') afterVersion = m.version; child.kill('SIGKILL'); }
    });
    child.once('error', error => { clearTimeout(timeout); clearTimeout(raceTimer); reject(error); });
    child.once('exit', (_code, signal) => {
      clearTimeout(timeout); clearTimeout(raceTimer);
      if (observed && signal === 'SIGKILL' && baselineVersion !== null) resolve({ baseline: baselineVersion, after: afterVersion });
      else reject(Error('No observed native SIGKILL boundary: ' + mode + ': ' + stderr));
    });
  });
}
nativeTest(import.meta.url, 'native-store-primitives-process-crash-and-runtime-qualification', async context => {
  validateRuntime();
  const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-native-primitives-')));
  const scenarios: Record<string, unknown>[] = [];
  try {
    const fs = await statfs(root);
    if (process.platform === 'darwin') assert.equal(fs.type, 26);
    else { assert.equal(fs.type, 0xef53); assert.equal(execFileSync('findmnt', ['-no', 'FSTYPE', '-T', root], { encoding: 'utf8' }).trim(), 'ext4'); }
    const binary = await fingerprint(); assert.equal(binary.versions['@lancedb/lancedb'], '0.40.0'); assert.equal(binary.versions['apache-arrow'], '18.1.0');
    const normalRoot = join(root, 'normal'); const owner = await acquireOwnership(options(normalRoot));
    try {
      let db = await openNative(normalRoot, true);
      try {
        const before = await baseline(db.table), expected = effects();
        const reader = await db.connection.openTable('records');
        try {
          await reader.checkout(before);
          await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute(expected.map(row => encodeRow(row, profile)));
          assert.equal(await db.table.version(), before + 1);
          assert.equal((await reader.query().toArray()).length, 1);
          const rows = (await db.table.query().toArray()).map(row => decodedNative(row));
          assert.equal(rows.length, expected.length);
          for (const row of expected) assert.equal(snapshotJson(rows.find(r => r.rowId === row.rowId), 65_536).text, snapshotJson(row, 65_536).text);
          assert.equal(rows.find(r => r.rowKind === 'receipt')?.embedding, null);
          const hit = await db.table.vectorSearch([1, 0]).where("rowKind = 'current'").limit(1).toArray(); assert.equal(hit.length, 1); assert.equal(hit[0]?.rowKind, 'current');
          await reader.checkoutLatest(); assert.equal((await reader.query().toArray()).length, expected.length);
        } finally { reader.close(); }
        db.close(); db = await openNative(normalRoot);
        assert.equal(await db.table.version(), before + 1); assert.equal((await db.table.query().toArray()).length, expected.length);
      } finally { db.close(); }
    } finally { await owner.close(); }
    for (const dimension of [1024, 8192]) {
      const directory = join(root, 'dimension-' + dimension), configured = embeddingProfile(profile.model, dimension);
      const guard = await acquireOwnership(options(directory));
      try {
        const db = await openNative(directory, true, configured);
        try {
          const vector = Array.from({ length: dimension }, (_, i) => i === 0 ? 1 : 0);
          const batch = [rootRow(storeId, configured, 99), makeRow('current', scope, epoch, currentPayload(), configured, vector, '0')];
          await db.table.mergeInsert('rowId').whenMatchedUpdateAll().whenNotMatchedInsertAll().useLsm(false).execute(batch.map(row => encodeRow(row, configured)));
          const rows = (await db.table.query().toArray()).map(row => decodedNative(row, configured));
          assert.equal(rows.find(row => row.rowKind === 'current')?.embedding?.length, dimension);
          assert.equal(rows.find(row => row.rowKind === 'control')?.embedding, null);
          assert.equal((await db.table.vectorSearch(vector).where("rowKind = 'current'").limit(1).toArray()).length, 1);
        } finally { db.close(); }
      } finally { await guard.close(); }
    }
    for (const scenario of [{ mode: 'before' as const, delay: 0 }, { mode: 'after' as const, delay: 0 }, ...[0, 2, 5, 10, 20, 50].map(delay => ({ mode: 'race' as const, delay }))]) {
      const directory = join(root, 'crash-' + scenarios.length);
      const observed = await crash(directory, scenario.mode, scenario.delay);
      const guard = await acquireOwnership(options(directory));
      try {
        const db = await openNative(directory);
        try {
          const rows = (await db.table.query().toArray()).map(row => decodedNative(row)), expected = effects(32);
          const control = rows.find(row => row.rowId === ROOT_ROW_ID)!;
          assert.equal(control.rowKind, 'control');
          const generation = control.generation;
          assert.ok(generation === '0' || generation === '1');
          assert.equal(rows.length, generation === '0' ? 1 : expected.length, 'no mixed partial event');
          if (generation === '1') for (const row of expected) assert.equal(snapshotJson(rows.find(r => r.rowId === row.rowId), 65_536).text, snapshotJson(row, 65_536).text);
          const version = await db.table.version(); assert.equal(version, observed.baseline + (generation === '1' ? 1 : 0));
          if (scenario.mode === 'before') assert.equal(generation, '0');
          if (scenario.mode === 'after') { assert.equal(generation, '1'); assert.equal(observed.after, version); }
          scenarios.push({ mode: scenario.mode, delayMs: scenario.delay, signal: 'SIGKILL', baselineVersion: observed.baseline, observedAfterVersion: observed.after, recoveredVersion: version, generation, rows: rows.length });
        } finally { db.close(); }
      } finally { await guard.close(); }
    }
    assert.equal(scenarios.length, 8);
    const report = { kind: 'native-sdk-primitives', node: process.versions.node, abi: process.versions.modules, platform: process.platform, arch: process.arch, release: release(), filesystemType: fs.type, ...binary, embeddingDimensions: [2, 1024, 8192], normalExitMixedSchemaAndPinnedReads: true, scenarios,
      limitations: ['Process-crash qualification, not host power-loss/fsync proof.', 'Race delays do not identify an exact internal Rust write stage.', 'No production store/writer or real queue integration is qualified here; t10 remains required.'] };
    context.diagnostic(JSON.stringify({ platform: report.platform, node: report.node, scenarios: scenarios.length }));
    const output = process.env['INSRC_MEMORY_STORE_PRIMITIVE_EVIDENCE']; if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 180_000);
