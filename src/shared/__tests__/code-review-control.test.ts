import assert from 'node:assert/strict';
import { createConnection, createServer, type Socket } from 'node:net';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonicalIdentityJson, identityDigest } from '../review-input-identity.js';
import { codeReviewControlResult, codeReviewRequestParams, ReviewStreamError } from '../review-stream.js';
import type { CodeReviewControlParams, CodeReviewControlResult, ReviewStreamOpts } from '../review-stream.js';
import { codeReviewControl, codeReviewStream } from '../../mcp/daemon-stream.js';
import type { ReviewStreamDeps } from '../../mcp/daemon-stream.js';
import { createInDaemonClient } from '../../daemon/steps/daemon-client.js';
import type { StreamHandler } from '../../daemon/server.js';
import { CodeReviewOperationRegistry } from '../../daemon/code-review-operations.js';

const target = { repo: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001' }, handle = 'opaque-handle', daemonEpoch = 'daemon-epoch';
const header = { schemaVersion: 1 as const, repoPath: target.repo, epicHash: target.epicHash, storyId: target.storyId, author: 'controller' as const, sourceDigest: '0'.repeat(64), contractDigest: '1'.repeat(64), buildDigest: '2'.repeat(64), testsDigest: '3'.repeat(64) };
const fingerprint = { ...header, digest: identityDigest(canonicalIdentityJson(header)) };
const final = { runId: 'cr-1', artifact: { meta: { workflow: 'code-review', schemaVersion: 1, createdAt: '2026-10-27T00:00:00Z', elapsedMs: 1, repoIndexedAt: null, runId: 'cr-1', epicHash: target.epicHash, storyId: target.storyId, repoPath: target.repo, reviewedBy: 'daemon', reviewInputSchemaVersion: 1, reviewInputFingerprint: fingerprint }, body: { kind: 'code-review', subject: { changedFiles: ['src/a.ts'] }, epicHash: target.epicHash, storyId: target.storyId, groundingMode: 'degraded', verdict: 'warn', counts: { high: 0, med: 0, low: 0 }, dimensions: ['adherence', 'conventions', 'coverage', 'quality'].map(dimension => ({ dimension, findings: [] })) } } };
const pending = { status: 'pending', reviewHandle: handle, daemonEpoch, progress: [{ phase: 'grounding' }] };
const done = { status: 'done', reviewHandle: handle, daemonEpoch, result: final };
const opts = { timeoutMs: 1000 };
const protocol = (err: unknown): boolean => err instanceof ReviewStreamError && err.failure === 'protocol';

async function harness(kind: 'socket' | 'in-daemon', handler: StreamHandler, timers: ReviewStreamDeps = {}) {
 if (kind === 'in-daemon') {
  const client = createInDaemonClient({}, { 'codeReview.run': handler }, timers);
  return { control: (p: CodeReviewControlParams, o = opts) => client.codeReviewControl(p, o), legacy: () => client.codeReviewStream(target, opts), close: async () => {} };
 }
 const path = join(tmpdir(), `insrc-control-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.sock`), sockets = new Set<Socket>();
 const server = createServer(socket => {
  sockets.add(socket); const controller = new AbortController(); let buffer = '';
  socket.on('error', () => {}); socket.on('close', () => { sockets.delete(socket); controller.abort(); });
  socket.on('data', chunk => {
   buffer += chunk.toString(); const lines = buffer.split('\n'); buffer = lines.pop() ?? '';
   for (const line of lines.filter(Boolean)) {
    const req = JSON.parse(line) as { id: number; params: unknown };
    void handler(req.params, frame => { if (!socket.destroyed) socket.write(JSON.stringify({ ...frame, id: req.id }) + '\n'); }, controller.signal).catch(err => { if (!socket.destroyed) socket.write(JSON.stringify({ id: req.id, stream: 'error', data: { error: String(err) } }) + '\n'); });
   }
  });
 });
 await new Promise<void>(resolve => server.listen(path, resolve));
 const deps = { ...timers, connect: () => createConnection(path) };
 return { control: (p: CodeReviewControlParams, o = opts) => codeReviewControl(p, o, deps), legacy: () => codeReviewStream(target, opts, deps), close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); try { rmSync(path); } catch {} } };
}

test('DIFF-WAIT-TRANSPORT: shared serializer and both actual transports preserve start/status/cancel and discriminate every reply', async () => {
 for (const kind of ['socket', 'in-daemon'] as const) {
  let reply: unknown = pending; const seen: unknown[] = [];
  const h = await harness(kind, async (params, send) => { seen.push(params); send({ id: 0, stream: 'done', data: reply }); });
  try {
   const start: CodeReviewControlParams = { ...target, operation: 'start', client: 'claude', groundingMode: 'degraded', fallbackReason: { kind: 'declined' } };
   const p = await h.control(start); assert.equal(p.status, 'pending'); assert.ok(!('artifact' in p) && !('result' in p)); assert.deepEqual(seen[0], codeReviewRequestParams(start));
   const status: CodeReviewControlParams = { ...target, operation: 'status', reviewHandle: handle };
   reply = done; const completed = await h.control(status); assert.equal(completed.status, 'done'); if (completed.status === 'done') assert.equal(completed.result.runId, 'cr-1'); assert.deepEqual(seen[1], status);
   reply = { status: 'failed', reviewHandle: handle, daemonEpoch, error: 'review stopped', reason: 'review-deadline' }; assert.equal((await h.control(status)).status, 'failed');
   const cancel: CodeReviewControlParams = { ...target, operation: 'cancel', reviewHandle: handle };
   reply = { status: 'cancelled', reviewHandle: handle, daemonEpoch }; assert.equal((await h.control(cancel)).status, 'cancelled'); assert.deepEqual(seen[3], cancel);
   const before = seen.length;
   await assert.rejects(h.control({ ...target, operation: 'status', reviewHandle: handle, groundingMode: 'degraded' } as never), protocol);
   await assert.rejects(h.control({ ...target, operation: 'start', reviewHandle: handle } as never), protocol);
   await assert.rejects(h.control(target as never), protocol);
   await assert.rejects(h.control({ ...target, operation: 'start', repo: 42 } as never), protocol); assert.equal(seen.length, before);
  } finally { await h.close(); }
 }
});

test('DIFF-WAIT-TRANSPORT: pending artifacts, malformed/foreign finals and unknown variants are refused by socket and in-daemon helpers', async () => {
 const bad = [
  { ...pending, artifact: {} }, { ...pending, result: final }, { ...pending, daemonEpoch: '' }, { ...pending, status: 'unknown' },
  { ...done, result: {} }, { ...done, result: { ...final, artifact: { ...final.artifact, meta: { ...final.artifact.meta, schemaVersion: 99 } } } }, { ...done, reviewHandle: 'foreign-handle' },
  { ...done, result: { ...final, artifact: { ...final.artifact, meta: { ...final.artifact.meta, reviewedBy: 'controller' } } } },
  { ...done, result: { ...final, artifact: { ...final.artifact, meta: { ...final.artifact.meta, reviewInputFingerprint: { digest: fingerprint.digest } } } } },
  { ...done, result: { ...final, artifact: { ...final.artifact, body: { ...final.artifact.body, counts: { high: 1, med: 0, low: 0 } } } } },
  { ...done, result: { ...final, artifact: { ...final.artifact, body: { ...final.artifact.body, dimensions: [] } } } },
  { status: 'cancelled', reviewHandle: handle, daemonEpoch, result: final },
 ];
 for (const kind of ['socket', 'in-daemon'] as const) {
  let reply: unknown; const h = await harness(kind, async (_params, send) => send({ id: 0, stream: 'done', data: reply }));
  try { for (const value of bad) { reply = value; await assert.rejects(h.control({ ...target, operation: 'status', reviewHandle: handle }), protocol); } }
  finally { await h.close(); }
 }
});

test('DIFF-WAIT-COMPAT: legacy streams remain final-only and retain their existing final result shape', async () => {
 for (const kind of ['socket', 'in-daemon'] as const) {
  let reply: unknown = final;
  const h = await harness(kind, async (params, send) => { assert.ok(!('operation' in (params as object))); send({ id: 0, stream: 'done', data: reply }); });
  try { assert.deepEqual(await h.legacy(), final); reply = pending; await assert.rejects(h.legacy(), protocol); }
  finally { await h.close(); }
 }
});

test('DIFF-TIME-OUTER: both transport waiters cap at 200 seconds without killing the daemon owner, and preserve long derived budgets', async () => {
 const count = 5000, timing = { startedAt: 1000, chunkCount: count, budgetMs: count * 600_000, deadlineAt: 1000 + count * 600_000, dimensions: [{ dimension: 'quality', primaryChunkCount: count, primaryChunkIds: Array.from({ length: count }, (_, i) => `quality:c${i}`), budgetMs: count * 600_000 }] };
 const decoded = codeReviewControlResult({ ...pending, timing }, { ...target, operation: 'start' }); assert.ok(decoded.status === 'pending' && decoded.timing!.budgetMs === 3_000_000_000);
 for (const kind of ['socket', 'in-daemon'] as const) {
  const owner = new CodeReviewOperationRegistry(); let finish!: () => void, started!: () => void, signal: AbortSignal | undefined, reviewHandle = '', timer: (() => void) | undefined, timerMs = 0;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const h = await harness(kind, async (params, send, waiterSignal) => {
   const p = params as CodeReviewControlParams;
   if (p.operation === 'start') reviewHandle = owner.start({ fingerprint, startedAt: Date.now(), execute: async s => { signal = s; started(); await new Promise<void>(resolve => { finish = resolve; }); return final as never; } });
   const response = await owner.wait(reviewHandle, target, { signal: waiterSignal }); send({ id: 0, stream: 'done', data: response });
  }, { setTimer: (fn, ms) => { timer = fn; timerMs = ms; return 1; }, clearTimer: () => { timer = undefined; } });
  try {
   const waiting = h.control({ ...target, operation: 'start', groundingMode: 'degraded' }, { timeoutMs: 999_999_999 }); const rejected = assert.rejects(waiting, err => err instanceof ReviewStreamError && err.failure === 'timeout');
   await ready; assert.equal(timerMs, 200_000); timer!(); await rejected; assert.equal(signal!.aborted, false);
   finish(); const result = await owner.wait(reviewHandle, target, { waitMs: 1000 }); assert.equal(result.status, 'done');
  } finally { finish?.(); await h.close(); await owner.close(); }
 }
});
