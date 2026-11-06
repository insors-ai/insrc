/** Explicit hardware study, outside the default regression glob. No models. */
import assert from 'node:assert/strict';
import { appendFile, readdir, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpus, totalmem, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { MemoryError } from '../../errors.js';
import { IngressBudget, digest } from '../../queue/codec.js';
import type { QueueFrame } from '../../queue/types.js';
import { logicalId, makeRow, namespaceKey, STORE_LIMITS } from '../../store/codec.js';
import { canonical, sourceOccurrenceId } from '../../store/plan.js';
import type { CommitPlan, CurrentPayload, StoreRow } from '../../store/types.js';
import { finalCommand, forgetPlan, framePlan, integrationFixture } from './store-integration.js';
import { fingerprint, openNative } from './store-native.js';
import { profile, scope } from './store-rows.js';

const output = process.argv[2]; if (!output) throw Error('Pass an absolute resource report path.');
const limits = { maxEventBytes: 16 * 1024 * 1024, segmentBytes: 16 * 1024 * 1024, maxPendingBytes: 64 * 1024 * 1024, modelTimeoutMs: 1000 };
const f = await integrationFixture({}, undefined, limits);
let generation = '0', now = 100, serial = 0, currentCount = 0;
const peaks = { rss: 0, heapUsed: 0, heapTotal: 0, external: 0, residentOutsideV8HeapEstimate: 0 };
function sample() { const m = process.memoryUsage(); for (const key of ['rss', 'heapUsed', 'heapTotal', 'external'] as const) peaks[key] = Math.max(peaks[key], m[key]); peaks.residentOutsideV8HeapEstimate = Math.max(peaks.residentOutsideV8HeapEstimate, Math.max(0, m.rss - m.heapTotal)); }
sample(); const sampler = setInterval(sample, 25);
const stages: Record<string, unknown>[] = [], boundaries: Record<string, unknown>[] = [];
const progress = async (value: Record<string, unknown>) => { sample(); await appendFile(output + '.progress.jsonl', JSON.stringify({ at: new Date().toISOString(), ...value, rss: process.memoryUsage().rss }) + '\n'); };
const summary = (values: number[]) => { const ordered = [...values].sort((a, b) => a - b); return { samples: values, p50: ordered[Math.ceil(ordered.length * 0.5) - 1] ?? null, p95: ordered[Math.ceil(ordered.length * 0.95) - 1] ?? null }; };
async function commit(plan: CommitPlan) {
  const started = performance.now(), receipt = await f.store.commit(plan); generation = receipt.generation!;
  await f.queue.markResolved(plan.operationId, generation); return performance.now() - started;
}
async function event(kind: 'capture' | 'correct' | 'forget' = 'capture', input = {} as any) {
  f.clock(++now); return f.append(finalCommand('resource-' + serial++, { kind, input }));
}
function batch(frame: QueueFrame, count: number, start: number): CommitPlan {
  const first = framePlan(frame, generation, now, 'resource-' + start), rows = [...first.rows], expected = { ...first.expectedRevisions };
  for (let i = 1; i < count; i++) {
    const next = framePlan(frame, generation, now, 'resource-' + (start + i));
    rows.push(...next.rows.filter(row => row.rowKind !== 'source')); Object.assign(expected, next.expectedRevisions);
  }
  return { ...first, rows, expectedRevisions: expected };
}
async function fill(target: number) {
  while (currentCount < target) {
    const count = Math.min(1000, target - currentCount), frame = await event(), started = performance.now();
    await commit(batch(frame, count, currentCount)); currentCount += count;
    await f.queue.recycleResolvedSegments(); await progress({ stage: 'corpus-commit', currentCount, effectRows: 1 + 3 * count, ms: performance.now() - started, generation });
  }
}
async function disk(path: string): Promise<number> { let n = 0; for (const entry of await readdir(path, { withFileTypes: true })) n += entry.isDirectory() ? await disk(join(path, entry.name)) : (await stat(join(path, entry.name))).size; return n; }
async function accounting() {
  const db = await openNative(f.root);
  try {
    const rows = await db.table.query().select(new Map([['rowKind', 'rowKind'], ['bytes', 'octet_length(payload)']])).toArray();
    const counts: Record<string, number> = {}, payloadBytes: Record<string, number> = {};
    for (const row of rows) { const kind = String(row.rowKind); counts[kind] = (counts[kind] ?? 0) + 1; payloadBytes[kind] = (payloadBytes[kind] ?? 0) + Number(row.bytes); }
    return { counts, payloadBytes, logicalDiskBytes: await disk(f.root), allocatedDiskKiB: Number(execFileSync('du', ['-sk', f.root], { encoding: 'utf8' }).split(/\s/)[0]) };
  } finally { db.close(); }
}
async function measure(label: string) {
  const opens: number[] = [], reads: { ms: number; resultCount: number | null; error: string | null }[] = [], commits: number[] = [];
  await progress({ stage: 'measure-start', label, currentCount });
  for (let i = 0; i < 5; i++) opens.push((await f.reopen()).storeOpenMs);
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    try { const result = await f.store.current(scope, await f.store.snapshot(scope)); assert.equal(result.length, currentCount); reads.push({ ms: performance.now() - started, resultCount: result.length, error: null }); }
    catch (error) { if (!(error instanceof MemoryError) || !['CONTEXT_OVERFLOW', 'DEADLINE_EXCEEDED'].includes(error.code)) throw error; reads.push({ ms: performance.now() - started, resultCount: null, error: error.code }); }
  }
  const before = currentCount;
  for (let i = 0; i < 5; i++) { const frame = await event(); commits.push(await commit(batch(frame, 1, currentCount++))); }
  await f.queue.recycleResolvedSegments();
  stages.push({ label, initialCurrentRows: before, finalCurrentRows: currentCount, storeOpenMs: summary(opens), currentMs: summary(reads.map(r => r.ms)), currentOutcomes: reads, commitIncludingQueueAckMs: summary(commits), accounting: await accounting(), memory: process.memoryUsage() });
  await progress({ stage: 'measure-complete', label, generation });
}
let report: Record<string, unknown> = {};
try {
  await measure('empty'); await fill(1000); await measure('1k'); await fill(10000); await measure('10k');
  // Material history uses the production correction guard, with complete source,
  // evidence and predecessor snapshots; no SDK fixture seeding bypasses commits.
  const native = await openNative(f.root); let previous: CurrentPayload;
  try { const rows = await native.table.query().where("rowKind = 'current'").limit(1).toArray(); previous = JSON.parse(rows[0]!.payload).payload ?? JSON.parse(rows[0]!.payload); }
  finally { native.close(); }
  // Pick the exact known first key rather than relying on native row ordering.
  const firstId = logicalId('memory', namespaceKey(scope, 'epoch-1'), 'resource-0');
  const lookup = await openNative(f.root); try { previous = JSON.parse((await lookup.table.query().where("rowKind = 'current' AND entityId = '" + firstId + "'").limit(1).toArray())[0]!.payload); } finally { lookup.close(); }
  for (let i = 0; i < 1000; i++) {
    const frame = await event('correct'), base = framePlan(frame, generation, now, 'resource-0');
    const current = base.rows.find(row => row.rowKind === 'current')!; if (current.rowKind !== 'current') throw Error('current');
    const next = { ...current.payload, createdAt: previous.createdAt };
    const rows = base.rows.map(row => row.rowKind === 'current' ? makeRow('current', scope, frame.scopeEpoch, next, profile, [1, 0], String(BigInt(generation) + 1n)) : row.rowKind === 'revision' ? makeRow('revision', scope, frame.scopeEpoch, { ...row.payload, predecessorRevisionId: previous.revisionId, mutationReason: { code: 'correct', explanation: 'History resource fixture.' }, snapshot: next }, profile) : row);
    await commit({ ...base, rows, expectedRevisions: { [firstId]: previous.revisionId } }); previous = next;
    if (i % 100 === 99) { await f.queue.recycleResolvedSegments(); await progress({ stage: 'history', revisionsAdded: i + 1, generation }); }
  }
  for (let i = 0; i < 1000; i++) {
    const target = { kind: 'memory' as const, memoryId: logicalId('memory', namespaceKey(scope, 'epoch-1'), 'resource-' + i) }, frame = await event('forget', { target });
    await commit(forgetPlan(frame, generation, now, target));
    if (i % 100 === 99) { await f.queue.recycleResolvedSegments(); await progress({ stage: 'tombstones', count: i + 1, generation }); }
  }
  stages.push({ label: '10k-plus-1k-history-1k-tombstones', accounting: await accounting(), memory: process.memoryUsage() });
  const leases = []; for (let i = 0; i < 16; i++) leases.push(await f.store.snapshot(scope));
  await assert.rejects(f.store.snapshot(scope), (e: unknown) => e instanceof MemoryError && e.code === 'BACKPRESSURE');
  assert.equal(f.store.pendingReadLeases(), 16); for (const lease of leases) await f.store.releaseSnapshot(lease); assert.equal(f.store.pendingReadLeases(), 0);
  boundaries.push({ name: '16 leases and explicit 17th refusal', passed: true });
  const budget = new IngressBudget(limits, STORE_LIMITS.maxBytes), reservation = budget.reserve(); reservation.charge(STORE_LIMITS.maxBytes);
  assert.throws(() => reservation.charge(1), (e: unknown) => e instanceof MemoryError && e.code === 'BACKPRESSURE'); reservation.release(); assert.equal(budget.bytes, 0);
  boundaries.push({ name: '64MiB logical copy quota exact edge and one-byte overflow/refund', passed: true, nativeWriteClaim: false });
  const frame = await f.append(finalCommand('boundary-4096', { scope: { ...scope, branch: 'boundary' }, text: 'A'.repeat(4096) })), base = framePlan(frame, generation, now, 'boundary');
  const template = base.rows.find(row => row.rowKind === 'source')!; if (template.rowKind !== 'source') throw Error('source');
  const ns = namespaceKey(frame.command.scope, frame.scopeEpoch), sources: StoreRow[] = [];
  for (let i = 0; i < 4096; i++) sources.push(makeRow('source', frame.command.scope, frame.scopeEpoch, { ...template.payload, sourceId: sourceOccurrenceId(ns, frame, template.payload.contentHash, i, i + 1), span: { unit: 'utf8-byte', start: i, end: i + 1 }, location: { kind: 'admitted-excerpt', text: 'A' } }, profile));
  const oldGeneration = generation;
  await assert.rejects(f.store.commit({ ...base, rows: sources, expectedRevisions: {} }), (e: unknown) => e instanceof MemoryError && e.code === 'INVALID_REQUEST');
  assert.equal((await f.store.readRoot()).generation, oldGeneration);
  const boundaryMs = await commit({ ...base, rows: sources.slice(0, 4093), expectedRevisions: {} });
  boundaries.push({ name: '4096 effect rows refused including generated reservations; 4096 total physical rows committed', passed: true, acceptedEffectRows: 4093, generatedRows: 3, ms: boundaryMs });
  const samplePlan = framePlan(frame, generation, now, 'byte-overflow'), row = samplePlan.rows.find(row => row.rowKind === 'current')!;
  if (row.rowKind !== 'current') throw Error('row'); const beforeHuge = generation;
  await assert.rejects(f.store.commit({ ...samplePlan, rows: [{ ...row, payload: { ...row.payload, text: 'x'.repeat(STORE_LIMITS.maxBytes) } }] }), (e: unknown) => e instanceof MemoryError && ['INVALID_REQUEST', 'BACKPRESSURE'].includes(e.code));
  assert.equal((await f.store.readRoot()).generation, beforeHuge);
  boundaries.push({ name: '64MiB oversized canonical row refuses before native mutation', passed: true });
  report = { complete: true, node: process.versions.node, abi: process.versions.modules, platform: process.platform, arch: process.arch, release: release(), filesystemType: (await statfs(f.root)).type,
    hardware: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() }, ...(await fingerprint()), profile, limits, privateLimits: STORE_LIMITS, stages, boundaries, peaks, maxRSSKiB: process.resourceUsage().maxRSS, finalAccounting: await accounting(),
    limitations: ['Five samples use nearest-rank p50/p95; not statistical production SLOs.', 'Connection-cold opens share a warm process/SDK; corpus generated only through real guarded commits and queue ACK.', 'RSS includes native allocations, code, stacks and V8; rss-minus-heapTotal is a native-and-other estimate, not isolated allocator accounting. The 25ms sampler can miss short peaks; OS maxRSS is also reported.', 'Metadata accounting opens extra test-only native readers; setup/measurement overhead contributes to process high-water marks.', '10k complete read overflow or deadline is reported explicitly, never silently truncated.', 'Logical 64MiB quota checks do not claim a successful 64MiB native batch.', 'No provider calls, runtime configuration changes, host power-loss proof or physical cleanup.'] };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n'); await progress({ stage: 'complete', generation });
} catch (error) {
  await writeFile(output, JSON.stringify({ complete: false, stages, boundaries, peaks, error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) }, null, 2) + '\n'); throw error;
} finally { clearInterval(sampler); await f.close(); }
