// Development measurement tool; not shipped or used as a public persistence API.
import { mkdtemp, realpath, readdir, stat, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, release } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { performance } from 'node:perf_hooks';
import { acquireOwnership } from '../dist/ownership.js';
import { FileQueue } from '../dist/queue/file-queue.js';
import { QueueAdmission } from '../dist/queue/admission.js';
import { encodeFrame, snapshotCommand } from '../dist/queue/codec.js';
import { QUEUE_LIMITS } from '../dist/queue/types.js';
const exec = promisify(execFile), packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const mib = 1024 * 1024;
const limits = { maxEventBytes: 16 * mib, segmentBytes: 16 * mib, maxPendingBytes: 64 * mib, modelTimeoutMs: 1000 };
const policy = { async bind(projectId) { return { projectId, root: '/benchmark', scopeEpoch: 'epoch' }; }, async admit(_binding, value) { return value; } };
const options = root => ({ dataDirectory: root, limits, policy, logger: { write() {} }, models: { embeddingModel: 'unused', embeddingDimension: 1, async complete() { throw Error('No inference in queue study'); }, async embed() { throw Error('No inference in queue study'); } } });
async function owned(root) {
  const owner = await acquireOwnership(options(root));
  const queue = new FileQueue(owner, root, limits);
  try { await queue.start(); } catch (e) { await queue.close(); await owner.close(); throw e; }
  return { queue, admission: new QueueAdmission(queue, policy), async close() { await queue.close(); await owner.close(); } };
}
function command(id, bytes) {
  const value = { version: 1, scope: { projectId: 'benchmark' }, source: { producerId: 'study', eventId: id, sessionId: 'session', turnId: id, sourceVersion: '1' }, kind: 'capture', payload: { text: '' } };
  const base = snapshotCommand(value, limits.maxEventBytes).bytes;
  if (bytes < base) throw Error('Corpus size below envelope');
  value.payload.text = 'x'.repeat(bytes - base); return value;
}
const quantiles = values => { const sorted = [...values].sort((a, b) => a - b); return { samples: sorted.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] }; };
async function disk(root) {
  let segmentBytes = 0, controlBytes = 0;
  for (const name of await readdir(join(root, 'queue'))) {
    if (name === 'segments') { for (const file of await readdir(join(root, 'queue', name))) segmentBytes += (await stat(join(root, 'queue', name, file))).size; }
    else controlBytes += (await stat(join(root, 'queue', name))).size;
  }
  return { segmentBytes, controlBytes, totalQueueBytes: segmentBytes + controlBytes };
}
async function fingerprints() {
  const files = [...(await readdir(join(packageRoot, 'src'))).filter(n => n.endsWith('.ts')).map(n => 'src/' + n), ...(await readdir(join(packageRoot, 'src/queue'))).filter(n => n.endsWith('.ts')).map(n => 'src/queue/' + n), 'benchmarks/queue-cost.mjs'];
  const result = {};
  for (const file of files.sort()) result[file] = createHash('sha256').update(await readFile(join(packageRoot, file))).digest('hex');
  return result;
}
async function cold(root) {
  const { stdout } = await exec(process.execPath, [fileURLToPath(import.meta.url), '--cold', root], { cwd: packageRoot, maxBuffer: 1024 * 1024 });
  return JSON.parse(stdout);
}
async function fixture(root, count, bytes) {
  const state = await owned(root), first = state.queue.writer.current, segment = first.segments[0];
  const frames = []; let offset = segment.acceptedOffset, chunk = [], chunkBytes = 0;
  try {
    for (let i = 1; i <= count; i++) {
      const value = command('fixture-' + i, bytes), snapshot = snapshotCommand(value, limits.maxEventBytes);
      const line = encodeFrame({ formatVersion: 1, recordType: 'event', queueId: first.queueId, sequence: String(i), operationId: snapshot.operationId, command: snapshot.command, payloadHash: snapshot.payloadHash, admittedAtMs: Date.now(), scopeEpoch: 'epoch' }, limits.maxEventBytes);
      frames.push({ operationId: snapshot.operationId, sequence: String(i), offset, length: line.length, terminal: false }); offset += line.length; chunk.push(line); chunkBytes += line.length;
      if (chunk.length === 128 || i === count) { await state.queue.io.write('segments/' + segment.id + '.jsonl', Buffer.concat(chunk, chunkBytes), 'append', offset - chunkBytes); chunk = []; chunkBytes = 0; }
    }
    if (offset > limits.maxPendingBytes) throw Error('Fixture exceeds retained budget');
    await state.queue.writer.publish({ ...first, generation: '1', lastSequence: String(count), segments: [{ ...segment, acceptedOffset: offset, frames }] });
  } finally { await state.close(); }
}
async function main(quick) {
  const roots = [], profiles = [], sizes = quick ? [1024, 65536] : [1024, 65536, mib];
  const makeRoot = async () => { const root = await realpath(await mkdtemp(join(tmpdir(), 'memory-cost-'))); roots.push(root); return root; };
  const samples = quick ? 2 : 20;
  const before = process.memoryUsage(); let observedMaxRss = before.rss, observedMaxHeap = before.heapUsed;
  const observe = () => { const m = process.memoryUsage(); observedMaxRss = Math.max(observedMaxRss, m.rss); observedMaxHeap = Math.max(observedMaxHeap, m.heapUsed); return m; };
  try {
    for (const size of sizes) {
      const elapsed = []; let lastRoot, counters, bytes;
      for (let i = 0; i < samples; i++) {
        const root = await makeRoot(), state = await owned(root); lastRoot = root;
        try {
          const value = command('empty-' + i, size), start = performance.now();
          await state.admission.append(value); elapsed.push(performance.now() - start);
          counters = { durable: state.queue.stats(), activeOwnedWork: state.queue.pending() }; bytes = await disk(root); observe();
        } finally { await state.close(); }
      }
      profiles.push({ name: 'empty', commandBytes: size, ...quantiles(elapsed), counters, physical: bytes, processCold: await cold(lastRoot) });
    }
    const root = await makeRoot(), backlog = quick ? 16 : 1000;
    const buildStart = performance.now(); await fixture(root, backlog, 1024);
    const state = await owned(root), elapsed = [];
    try {
      for (let i = 0; i < samples; i++) { const value = command('backlog-' + i, 1024), start = performance.now(); await state.admission.append(value); elapsed.push(performance.now() - start); observe(); }
      profiles.push({ name: 'backlog-1k', fixtureEvents: backlog, commandBytes: 1024, ...quantiles(elapsed), counters: { durable: state.queue.stats(), activeOwnedWork: state.queue.pending() }, physical: await disk(root), fixtureBuildAndOpenMs: performance.now() - buildStart });
    } finally { await state.close(); }
    profiles.at(-1).processCold = await cold(root);
    if (!quick) {
      const capRoot = await makeRoot(), count = Math.floor((QUEUE_LIMITS.checkpointBytes - QUEUE_LIMITS.checkpointFixed - QUEUE_LIMITS.checkpointPerSegment) / QUEUE_LIMITS.checkpointPerFrame);
      const generationStart = performance.now(); await fixture(capRoot, count, 1024);
      const capped = await owned(capRoot), rejected = [];
      try {
        for (let i = 0; i < samples; i++) { const value = command('cap-' + i, 1024), start = performance.now(); try { await capped.admission.append(value); throw Error('Metadata cap accepted work'); } catch (e) { if (e.code !== 'BACKPRESSURE') throw e; rejected.push(performance.now() - start); } observe(); }
        profiles.push({ name: 'metadata-cap', fixtureEvents: count, outcome: 'BACKPRESSURE', ...quantiles(rejected), counters: { durable: capped.queue.stats(), activeOwnedWork: capped.queue.pending() }, physical: await disk(capRoot), fixtureBuildAndOpenMs: performance.now() - generationStart });
      } finally { await capped.close(); }
      profiles.at(-1).processCold = await cold(capRoot);
      const edgeRoot = await makeRoot(), edge = await owned(edgeRoot);
      try {
        const value = command('ceiling', limits.maxEventBytes), start = performance.now();
        await edge.admission.append(value); const acceptanceMs = performance.now() - start; observe();
        value.source = { ...value.source, eventId: 'overage' }; value.payload.text += 'x';
        let rejected = false; try { await edge.admission.append(value); } catch (e) { if (e.code !== 'INVALID_REQUEST') throw e; rejected = true; }
        if (!rejected) throw Error('Oversize input was accepted');
        profiles.push({ name: '16MiB-safety', commandBytes: limits.maxEventBytes, acceptanceMs, oversizeRejected: rejected, counters: { durable: edge.queue.stats(), activeOwnedWork: edge.queue.pending() }, physical: await disk(edgeRoot) });
      } finally { await edge.close(); }
      profiles.at(-1).processCold = await cold(edgeRoot);
    }
    return { mode: quick ? 'quick' : 'full', capturedAt: new Date().toISOString(), source: await fingerprints(), hardware: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryBytes: totalmem(), platform: process.platform, release: release(), arch: process.arch, node: process.versions.node, filesystem: process.platform === 'darwin' ? 'APFS (qualified native host)' : 'ext4 (qualified native host)' }, limits, profiles, resources: { before, after: process.memoryUsage(), observedMaxRss, observedMaxHeap }, qualifications: ['All measured acceptance paths include production data sync and checkpoint/backup/directory sync.', 'Backlog fixtures use test-only bulk journal/checkpoint construction followed by full production recovery; their build times are not ingestion latency.', 'Process-cold recovery starts a fresh Node process; OS filesystem cache remains warm.', 'Observed RSS/heap snapshots are lower bounds on peak use, not V8 allocation guarantees.', 'Metadata-cap latency is rejection latency, not acceptance.', 'Semantic commit is unimplemented. No production defaults, latency SLO, Lance atomicity or hardware power-loss claim.'] };
  } finally { for (const root of roots) await rm(root, { recursive: true, force: true }); }
}
if (process.argv[2] === '--cold') {
  const root = process.argv[3], start = performance.now(), state = await owned(root);
  const result = { recoveryMs: performance.now() - start, pendingEvents: state.queue.stats().pendingEvents, memory: process.memoryUsage(), physical: await disk(root) };
  await state.close(); process.stdout.write(JSON.stringify(result));
} else {
  const report = await main(process.argv.includes('--quick'));
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0) await writeFile(process.argv[outputIndex + 1], JSON.stringify(report, null, 2) + '\n');
  else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
