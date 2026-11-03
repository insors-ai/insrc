import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { acquireOwnership } from '../ownership.js';
import { validateRuntime } from '../configuration.js';
import { MemoryError } from '../errors.js';
import type { QueueFrame } from '../queue/types.js';
import type { OperationReceipt } from '../types.js';
import { canonical } from '../store/plan.js';
import { nativeTest } from './fixtures/node22.js';
import { finalCommand, framePlan, integrationFixture } from './fixtures/store-integration.js';
import { options } from './fixtures/options.js';
import { fingerprint, openNative, packageRoot } from './fixtures/store-native.js';
import { scope } from './fixtures/store-rows.js';

interface Observed { accepted: QueueFrame; acceptedReceipt: OperationReceipt; forget: QueueFrame | null; receipt: OperationReceipt | null; stages: string[]; liveOwnerConflict: true; }
const peer = fileURLToPath(new URL('./fixtures/store-crash-peer.ts', import.meta.url));
async function crash(root: string, mode: string, target: string, delayMs = 0): Promise<Observed> {
  const env = { ...process.env }; delete env['NODE_TEST_CONTEXT'];
  const child = fork(peer, [root, mode], { cwd: packageRoot, execPath: process.execPath, execArgv: ['--import', 'tsx'], env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  return new Promise((resolve, reject) => {
    let accepted: QueueFrame | undefined, acceptedReceipt: OperationReceipt | undefined, forget: QueueFrame | null = null, receipt: OperationReceipt | null = null;
    let stderr = '', reached = false, liveOwnerConflict = false, failure: unknown;
    const stages: string[] = []; let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => { failure = Error('Store crash boundary timed out: ' + mode + ': ' + stderr); child.kill('SIGKILL'); }, 45_000);
    child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4096); });
    child.on('message', value => {
      const message = value as { type: string; stage?: string; frame?: QueueFrame; receipt?: OperationReceipt };
      if (message.type === 'accepted') { accepted = message.frame; acceptedReceipt = message.receipt; }
      if (message.type === 'accepted-forget') forget = message.frame ?? null;
      if (message.type !== 'boundary') return;
      stages.push(message.stage!);
      if (message.receipt) receipt = message.receipt;
      if (message.stage !== target || reached) return;
      reached = true;
      // Assert live ownership before killing, with no direct native DB access in
      // the parent until the process has exited and its OS guard can be acquired.
      void (async () => {
        try {
          let unexpected;
          try { unexpected = await acquireOwnership(options(root)); }
          catch (error) { if (error instanceof MemoryError && error.code === 'OWNERSHIP_CONFLICT') liveOwnerConflict = true; else throw error; }
          if (unexpected) { await unexpected.close(); throw Error('Live store owner was reacquired.'); }
          killTimer = setTimeout(() => child.kill('SIGKILL'), delayMs);
        } catch (error) { failure = error; child.kill('SIGKILL'); }
      })();
    });
    child.once('error', error => { clearTimeout(timeout); clearTimeout(killTimer); reject(error); });
    child.once('exit', (_code, signal) => {
      clearTimeout(timeout); clearTimeout(killTimer);
      if (failure) reject(failure);
      else if (reached && signal === 'SIGKILL' && accepted && acceptedReceipt?.state === 'accepted' && acceptedReceipt.operationId === accepted.operationId && liveOwnerConflict) resolve({ accepted, acceptedReceipt, forget, receipt, stages, liveOwnerConflict: true });
      else reject(Error('Missing observed SIGKILL/acceptance/ownership boundary: ' + mode + ': ' + stderr));
    });
  });
}
nativeTest(import.meta.url, 'production-store-queue-process-crash-replay-and-forget-qualification', async context => {
  validateRuntime(); const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-store-crashes-')));
  const scenarios: Record<string, unknown>[] = [];
  try {
    const filesystem = await statfs(root);
    if (process.platform === 'darwin') assert.equal(filesystem.type, 26);
    else { assert.equal(filesystem.type, 0xef53); assert.equal(execFileSync('findmnt', ['-no', 'FSTYPE', '-T', root], { encoding: 'utf8' }).trim(), 'ext4'); }
    const binary = await fingerprint();
    const modes = [
      { mode: 'accepted', target: 'accepted', delay: 0 }, { mode: 'before-write', target: 'before-write', delay: 0 },
      ...[0, 2, 10, 50].map(delay => ({ mode: 'race', target: 'race', delay })),
      { mode: 'before-reply', target: 'before-reply', delay: 0 }, { mode: 'before-ack', target: 'before-ack', delay: 0 },
      { mode: 'after-ack', target: 'after-ack', delay: 0 }, { mode: 'after-recycle', target: 'after-recycle', delay: 0 },
      ...['project', 'session', 'conversation'].map(kind => ({ mode: 'forget-' + kind, target: 'forget-committed', delay: 0 })),
      { mode: 'reader-delete', target: 'reader-forget-committed', delay: 0 },
    ];
    for (let i = 0; i < modes.length; i++) {
      const scenario = modes[i]!, directory = await realpath(await mkdtemp(join(root, 'case-' + i + '-')));
      const observed = await crash(directory, scenario.mode, scenario.target, scenario.delay);
      const f = await integrationFixture({}, directory);
      try {
        const initial = await f.store.readRoot(), rows = await f.rows();
        const db = await openNative(directory); let version: number;
        try { version = await db.table.version(); } finally { db.close(); }
        assert.equal(initial.queueId, initial.generation === '0' ? null : observed.accepted.queueId);
        assert.equal(rows.filter(row => row.rowKind === 'receipt').length, Number(initial.generation));
        assert.equal(version, 2 + Number(initial.generation));
        if (scenario.mode.startsWith('forget-')) {
          assert.equal(initial.generation, '1'); assert.ok(observed.forget);
          assert.equal(rows.filter(row => ['current', 'revision', 'source', 'evidence'].includes(row.rowKind)).length, 0);
          const protection = await f.store.validateFrameEligibility(observed.accepted); assert.equal(protection.eligible, false);
          assert.equal(protection.rejectedByTombstoneIds.length, 1);
          f.clock(300); const receipt = await f.store.commit(framePlan(observed.accepted, '0', 100, 'operation'));
          assert.equal(receipt.state, 'failed'); assert.equal(receipt.errorCode, 'POLICY_DENIED');
          assert.equal((await f.rows()).filter(row => ['current', 'source', 'revision', 'evidence'].includes(row.rowKind)).length, 0);
          await f.queue.markResolved(observed.accepted.operationId, receipt.generation!); await f.queue.markResolved(observed.forget!.operationId, '1');
          await f.queue.recycleResolvedSegments(); await f.reopen();
          assert.equal((await f.store.validateFrameEligibility(observed.accepted)).eligible, false);
          assert.equal((await f.admission.append(finalCommand('accepted-operation'))).errorCode, 'POLICY_DENIED');
        } else if (scenario.mode === 'reader-delete') {
          assert.equal(initial.generation, '2'); assert.ok(observed.forget);
          assert.equal((await f.store.current(scope, await f.store.snapshot(scope))).length, 0);
          assert.equal(rows.filter(row => row.rowKind === 'current').length, 1, 'logical protection survives while physical purge remains S9');
          await f.queue.markResolved(observed.forget!.operationId, '2'); await f.queue.recycleResolvedSegments();
        } else {
          assert.ok(initial.generation === '0' || initial.generation === '1');
          if (['accepted', 'before-write'].includes(scenario.mode)) assert.equal(initial.generation, '0');
          if (['before-reply', 'before-ack', 'after-ack', 'after-recycle'].includes(scenario.mode)) assert.equal(initial.generation, '1');
          if (initial.generation === '0') assert.equal(rows.length, 1, 'no partial event');
          else {
            for (const kind of ['current', 'revision', 'source', 'evidence']) assert.equal(rows.filter(row => row.rowKind === kind).length, 1, kind);
            const proof = rows.find(row => row.rowKind === 'receipt')!;
            if (proof.rowKind !== 'receipt') throw Error('proof');
            assert.equal(proof.payload.operationId, observed.accepted.operationId); assert.equal(proof.payload.payloadHash, observed.accepted.payloadHash);
            assert.equal(proof.payload.affectedRevisions.length, 1); assert.equal(proof.payload.queueTerminal, true);
          }
          const receipt = await f.store.commit(framePlan(observed.accepted, '0', 100, 'operation'));
          assert.equal(receipt.state, 'committed'); assert.equal(receipt.generation, '1');
          if (observed.receipt?.state === 'committed') assert.equal(canonical(receipt), canonical(observed.receipt));
          assert.equal((await f.store.readRoot()).generation, '1');
          if (f.queue.index.has(observed.accepted.operationId)) await f.queue.markResolved(observed.accepted.operationId, '1');
          await f.queue.recycleResolvedSegments(); assert.equal(f.queue.index.size, 0);
          assert.equal(canonical(await f.admission.append(finalCommand('accepted-operation'))), canonical(receipt));
          const complete = canonical(await f.rows());
          assert.equal(canonical(await f.store.commit(framePlan(observed.accepted, '0', 100, 'operation'))), canonical(receipt));
          assert.equal(canonical(await f.rows()), complete, 'replayed receipt never republishes effects');
        }
        scenarios.push({ mode: scenario.mode, delayMs: scenario.delay, signal: 'SIGKILL', observedStages: observed.stages, liveOwnerConflict: observed.liveOwnerConflict, acceptedReceipt: observed.acceptedReceipt, acceptedOperation: observed.accepted.operationId, acceptedSequence: observed.accepted.sequence, acceptedPayloadHash: observed.accepted.payloadHash, recoveredGeneration: initial.generation, recoveredVersion: version, recoveredRows: rows.length, finalGeneration: (await f.store.readRoot()).generation, pendingEvents: f.queue.stats().pendingEvents });
      } finally { await f.close(); }
    }
    assert.equal(scenarios.length, 14);
    const report = { kind: 'production-store-real-queue-process-crashes', node: process.versions.node, abi: process.versions.modules, platform: process.platform, arch: process.arch, release: release(), filesystemType: filesystem.type, ...binary, scenarios,
      limitations: ['Actual parent-observed process SIGKILL, not host power-loss/fsync qualification.', 'Race delays do not identify an exact internal Rust stage.', 'Direct owner/store/queue harness; production MemoryFactory wiring remains gated until t13.', 'Trusted final payload fixtures do not substitute for t11 admission transforms or S7/S8 host lifecycle adapters.'] };
    context.diagnostic(JSON.stringify({ platform: report.platform, node: report.node, scenarios: scenarios.length }));
    const output = process.env['INSRC_MEMORY_STORE_INTEGRATION_EVIDENCE']; if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  } finally { await rm(root, { recursive: true, force: true }); }
}, 240_000);
