import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeTest } from '../../../packages/project-memory/src/__tests__/fixtures/node22.js';
import { finalCommand, forgetPlan, framePlan, integrationFixture } from '../../../packages/project-memory/src/__tests__/fixtures/store-integration.js';
import { scope } from '../../../packages/project-memory/src/__tests__/fixtures/store-rows.js';
import { canonical } from '../../../packages/project-memory/src/store/plan.js';
import { digest } from '../../../packages/project-memory/src/queue/codec.js';
import { MemoryError } from '../../../packages/project-memory/src/errors.js';
import { fingerprint } from '../../../packages/project-memory/src/__tests__/fixtures/store-native.js';
import type { Watcher } from '../watcher.js';

nativeTest(import.meta.url, 'project-memory-survives-real-index-rebuild-and-isolated-reset-with-pending-queue', async context => {
  // Dynamic imports are intentional: the gate may start under Node 26; backend
  // native modules are loaded only in the supported Node 22 child.
  const graph = await import('../../db/graph/store.js'), lance = await import('../../db/lance/conn.js');
  const { IndexerService } = await import('../index.js'), { IndexQueue } = await import('../../daemon/queue.js');
  const { addRepo } = await import('../../db/repos.js'), entities = await import('../../db/entities.js');
  const vectors = await import('../../db/lance/entity-vec.js'), { loadLocalProviderConfig } = await import('../../config/local.js');
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'memory-index-isolation-'))), indexRoot = join(parent, 'index'), repo = join(parent, 'repo');
  await mkdir(indexRoot); await mkdir(repo);
  await graph.closeGraphStore(); await lance.closeLanceConn(); vectors._resetEntityVecCache();
  graph.setGraphStorePath(join(indexRoot, 'graph.lmdb')); lance.setLanceConnPath(join(indexRoot, 'lance'));
  const f = await integrationFixture();
  const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
  const index = () => new IndexerService(null, new IndexQueue(), watcher, undefined, 600_000);
  const register = () => addRepo(null, { path: repo, name: 'memory-isolation-fixture', addedAt: '2026-11-03T00:00:00Z', status: 'pending' });
  const reports: Record<string, unknown>[] = [];
  try {
    const a = await f.append(finalCommand('history')); await f.store.commit(framePlan(a, '0', 100, 'history')); await f.queue.markResolved(a.operationId, '1');
    const forgetting = await f.append(finalCommand('forget-history', { kind: 'forget', scope: { projectId: scope.projectId }, input: { target: { kind: 'session', sessionId: 'source-session' } } }));
    f.clock(200); await f.store.commit(forgetPlan(forgetting, '1', 200, { kind: 'session', sessionId: 'source-session' })); await f.queue.markResolved(forgetting.operationId, '2');
    f.register('codex', 'new-session');
    const active = await f.append(finalCommand('current', { sessionId: 'new-session' })); f.clock(300); await f.store.commit(framePlan(active, '2', 300, 'current')); await f.queue.markResolved(active.operationId, '3');
    const pending = await f.append(finalCommand('pending-old-lifecycle'));
    async function memoryOracle() {
      const segments: Record<string, string> = {};
      for (const name of (await readdir(join(f.root, 'queue/segments'))).sort()) if (name.endsWith('.jsonl')) segments[name] = digest((await readFile(join(f.root, 'queue/segments', name))).toString('base64'));
      const rows = (await f.rows()).sort((a, b) => a.rowId.localeCompare(b.rowId));
      const proofs = []; for (const frame of [a, forgetting, active]) proofs.push(await f.store.receiptVerifier().byOperation(frame.operationId, frame.command.scope));
      const frames = []; for await (const frame of f.queue.replay()) if (frame.operationId === pending.operationId) frames.push(frame);
      const result = { rows, generation: (await f.store.readRoot()).generation, proofs, frames, segments,
        status: await f.admission.operation({ scope, operationId: pending.operationId }), eligibility: await f.store.validateFrameEligibility(pending), current: await f.store.current(scope, await f.store.snapshot(scope)) };
      assert.equal(result.generation, '3'); assert.equal(result.status.state, 'accepted'); assert.equal(result.frames.length, 1); assert.equal(result.eligibility.eligible, false);
      assert.equal(result.current.length, 1); assert.ok(result.rows.some(row => row.rowKind === 'tombstone')); assert.ok(result.rows.filter(row => row.rowKind === 'revision').length >= 2);
      return canonical(result);
    }
    const before = await memoryOracle();
    await writeFile(join(repo, 'main.ts'), 'export function initial(): number { return 1; }\n'); await register();
    await index().processJob({ kind: 'full', repoPath: repo });
    let found = await entities.listEntitiesForRepo(null, repo); const initial = found.find(row => row.kind === 'function' && row.name === 'initial'); assert.ok(initial);
    await vectors.writeEntityEmbedding({ id: initial.id, embedding: Array(loadLocalProviderConfig().embeddingDim).fill(1), repo, kind: 'function', artifact: false });
    assert.ok((await vectors.listEntityVecIds()).includes(initial.id));
    await writeFile(join(repo, 'main.ts'), 'export function rebuilt(): number { return 2; }\n');
    await index().processJob({ kind: 'full', repoPath: repo });
    found = await entities.listEntitiesForRepo(null, repo); assert.ok(found.some(row => row.name === 'rebuilt')); assert.ok(!found.some(row => row.name === 'initial'));
    assert.ok(!(await vectors.listEntityVecIds()).includes(initial.id), 'real full rebuild deletes old native vector rows');
    await graph.closeGraphStore(); await lance.closeLanceConn(); vectors._resetEntityVecCache(); await f.reopen(); assert.equal(await memoryOracle(), before);
    assert.ok((await entities.listEntitiesForRepo(null, repo)).some(row => row.name === 'rebuilt'));
    reports.push({ operation: 'IndexerService full rebuild via deleteEntitiesForRepo', memoryAndPendingBytesUnchanged: true });
    // No production reset helper exists here. Remove ONLY these closed, isolated
    // test index stores, then register/rebuild them; never the daemon's index.
    await graph.closeGraphStore(); await lance.closeLanceConn(); vectors._resetEntityVecCache(); await rm(indexRoot, { recursive: true }); await mkdir(indexRoot);
    await register(); await index().processJob({ kind: 'full', repoPath: repo });
    const rebuilt = (await entities.listEntitiesForRepo(null, repo)).find(row => row.kind === 'function' && row.name === 'rebuilt'); assert.ok(rebuilt);
    await vectors.writeEntityEmbedding({ id: rebuilt.id, embedding: Array(loadLocalProviderConfig().embeddingDim).fill(1), repo, kind: 'function', artifact: false });
    assert.ok((await vectors.listEntityVecIds()).includes(rebuilt.id), 'cleanup preservation oracle has real graph and vector content');
    await f.reopen(); assert.equal(await memoryOracle(), before);
    reports.push({ operation: 'closed temporary graph/vector removal followed by registry and full rebuild', memoryAndPendingBytesUnchanged: true });
    const indexOracle = canonical({ entities: await entities.listEntitiesForRepo(null, repo), vectors: (await vectors.listEntityVecIds()).sort() });
    await f.store.preflightCleanupTarget(join(f.root, 'memory.lance'));
    await assert.rejects(f.store.preflightCleanupTarget(indexRoot), MemoryError);
    assert.equal(canonical({ entities: await entities.listEntitiesForRepo(null, repo), vectors: (await vectors.listEntityVecIds()).sort() }), indexOracle);
    await f.reopen(); assert.equal(await memoryOracle(), before);
    reports.push({ operation: 'non-destructive memory cleanup preflight only', indexAndQueueUnchanged: true, physicalCleanup: 'pending S9', hostOverlapGuard: 'pending S7' });
    context.diagnostic(JSON.stringify(reports));
    const output = process.env['INSRC_MEMORY_ISOLATION_EVIDENCE'];
    if (output) {
      const backendSource: Record<string, string> = {};
      for (const path of ['indexer/index.ts', 'db/entities.ts', 'db/graph/store.ts', 'db/lance/conn.ts', 'db/lance/entity-vec.ts', 'indexer/__tests__/project-memory-isolation.test.ts']) backendSource[path] = digest(await readFile(new URL('../../' + path, import.meta.url), 'utf8'));
      await writeFile(output, JSON.stringify({ node: process.versions.node, platform: process.platform, filesystemType: (await statfs(f.root)).type, ...(await fingerprint()), backendSource, profile: f.store.profile, reports, oracleSha256: digest(before), limitations: ['No public reset or physical cleanup implemented.', 'S7 cross-host overlap and S9 queued maintenance remain pending.', 'No embedding backend/provider is initialized; vector data is deterministic test input.'] }, null, 2) + '\n');
    }
  } finally { await graph.closeGraphStore(); await lance.closeLanceConn(); vectors._resetEntityVecCache(); await f.close(); await rm(parent, { recursive: true, force: true }); }
}, 120_000);
