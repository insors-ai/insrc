import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CodeReviewOperationRegistry, codeReviewOperationIdleMs, CODE_REVIEW_TERMINAL_GRACE_MS } from '../../../code-review-operations.js';
import { LocalStepStateStore, installStepStateStore } from '../../../threads/step-state.js';
import { canonicalIdentityJson, identityDigest } from '../../../../shared/review-input-identity.js';
import type { CodeReviewControlParams, CodeReviewControlResult, CodeReviewStreamResult } from '../../../../shared/review-stream.js';
import type { CodeReviewProgress } from '../../../../workflow/code-review/runner.js';
import type { CodeReviewSubject, ReviewTimingPlan } from '../../../../workflow/code-review/types.js';
import { handleCodeReviewStep } from '../handler.js';
import type { CodeReviewStepDeps } from '../handler.js';
import { loadState, _clearCodeReviewStateStoreForTests } from '../state-store.js';
import type { CodeReviewStepOutput } from '../types.js';

const target = { repo: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 'S001' };
const header = { schemaVersion: 1 as const, repoPath: target.repo, epicHash: target.epicHash, storyId: target.storyId, author: 'controller' as const, sourceDigest: '0'.repeat(64), contractDigest: '1'.repeat(64), buildDigest: '2'.repeat(64), testsDigest: '3'.repeat(64) };
const fingerprint = { ...header, digest: identityDigest(canonicalIdentityJson(header)) };
const subject: CodeReviewSubject = { repoPath: target.repo, epicHash: target.epicHash, storyId: target.storyId, changedFiles: ['src/a.ts'], approvedLld: null, approvedPlan: null, buildRecord: null, testRecord: null };
const FRESH = { ok: true as const, isProcessing: false, inFlight: false, pendingCodeIndexJobs: 0, staleFiles: [] as string[] };
function result(mode: 'full' | 'degraded'): CodeReviewStreamResult {
 return { runId: 'cr-1', artifact: { meta: { workflow: 'code-review', schemaVersion: 1, createdAt: '2026-10-27T00:00:00Z', elapsedMs: 1, repoIndexedAt: null, runId: 'cr-1', epicHash: target.epicHash, storyId: target.storyId, repoPath: target.repo, reviewedBy: 'daemon', reviewInputSchemaVersion: 1, reviewInputFingerprint: fingerprint }, body: { kind: 'code-review', subject: { changedFiles: ['src/a.ts'] }, epicHash: target.epicHash, storyId: target.storyId, groundingMode: mode, verdict: mode === 'full' ? 'pass' : 'warn', counts: { high: 0, med: 0, low: 0 }, dimensions: (['adherence', 'conventions', 'coverage', 'quality'] as const).map(dimension => ({ dimension, findings: [] })) } } };
}
async function harness() {
 let now = 1_000, executions = 0, writes = 0, subjects = 0, fresh = FRESH, controlError: Error | undefined;
 let finish!: () => void, progress!: (frame: CodeReviewProgress) => void, ownerSignal!: AbortSignal;
 const store = new LocalStepStateStore(() => now); installStepStateStore(store); await _clearCodeReviewStateStoreForTests();
 const registry = new CodeReviewOperationRegistry({ now: () => now, setTimer: () => 1, clearTimer: () => {} });
 const controls: CodeReviewControlParams[] = [];
 let overrideReply: unknown;
 const deps: CodeReviewStepDeps = {
  resolveSubject: async () => { subjects++; return { ok: true, subject }; },
  fetchFreshness: async () => fresh,
  fetchGrounding: async () => ({ ok: true, grounding: { symbols: [{ entityId: 's1', file: 'src/a.ts', kind: 'function', name: 'a', signature: 'a()', callers: [], callees: [], testsReaching: [] }] } }),
  assembleDiffGrounding: async () => { throw new Error('Daemon-owned review must assemble its own diff'); },
  runReview: async () => { throw new Error('Controller must not stamp daemon results'); }, write: () => { throw new Error('No controller writes'); },
  now: () => now, sleep: async () => {}, freshnessTimeoutMs: () => 1, readBuildAuthor: () => 'controller', operations: registry,
  waitLimits: () => ({ ceilingMs: 1, idleMs: 1 }), // legacy ceiling must not truncate owned route
  reviewControl: async (p, opts): Promise<CodeReviewControlResult> => {
   assert.equal(opts.timeoutMs, 200_000); controls.push(p);
   if (controlError !== undefined) throw controlError;
   if (overrideReply !== undefined) return overrideReply as CodeReviewControlResult;
   const handle = p.operation === 'start' ? registry.start({ fingerprint, startedAt: now, execute: async (signal, emit) => {
    executions++; ownerSignal = signal; progress = emit;
    await new Promise<void>((resolve, reject) => { finish = resolve; signal.addEventListener('abort', () => reject(signal.reason), { once: true }); });
    writes++; return result(p.groundingMode ?? 'full');
   } }) : p.reviewHandle;
   return p.operation === 'cancel' ? registry.cancel(handle, target, { waitMs: 0 }) : registry.wait(handle, target, { waitMs: 0 });
  },
 };
 const call = async (input: unknown): Promise<CodeReviewStepOutput> => JSON.parse((await handleCodeReviewStep(input, deps)).content[0]!.text) as CodeReviewStepOutput;
 const start = () => call({ phase: 'start', ...target });
 return { deps, store, registry, call, start, controls, setNow: (n: number) => { now = n; }, setStale: () => { fresh = { ...FRESH, staleFiles: ['src/a.ts'] }; }, setReply: (r: unknown) => { overrideReply = r; }, setError: (e?: Error) => { controlError = e; }, finish: () => finish(), progress: (frame: CodeReviewProgress) => progress(frame), signal: () => ownerSignal, counts: () => ({ executions, writes, subjects }), close: async () => { await registry.close(); await _clearCodeReviewStateStoreForTests(); } };
}
const timing = (startedAt: number, count = 30): ReviewTimingPlan => ({ startedAt, chunkCount: count, budgetMs: count * 600_000, deadlineAt: startedAt + count * 600_000, dimensions: [{ dimension: 'quality', primaryChunkCount: count, primaryChunkIds: Array.from({ length: count }, (_, i) => `quality:c${i}`), budgetMs: count * 600_000 }] });

test('DIFF-WAIT-RESUME: pending turns join one owner beyond300s, retain the same state/deadline and consume exactly one final review', async () => {
 const h = await harness();
 try {
  const first = await h.start(); assert.equal(first.next, 'review_pending'); if (first.next !== 'review_pending') return;
  h.progress({ phase: 'grounding', timing: timing(1000) });
  const joined = await h.start(); assert.ok(joined.next === 'review_pending'); assert.equal(joined.reviewHandle, first.reviewHandle); assert.equal(h.counts().executions, 1);
  h.setNow(401_000);
  const resumed = await h.call({ phase: 'start', state: first.state }); assert.ok(resumed.next === 'review_pending'); assert.equal(resumed.state, first.state); assert.equal(resumed.timing!.deadlineAt, 18_001_000);
  assert.equal(h.controls.at(-1)!.operation, 'status'); assert.equal(h.counts().subjects, 2, 'status never resolves a new subject');
  const rejected = await h.call({ phase: 'judgements', state: first.state, judgements: { judgements: [] } }); assert.ok(rejected.next === 'error' && rejected.error.code === 'bad-state');
  h.finish(); await Promise.resolve(); await Promise.resolve();
  const done = await h.call({ phase: 'start', state: first.state }); assert.ok(done.next === 'done', JSON.stringify(done)); assert.equal(done.reviewedBy, 'daemon');
  assert.deepEqual(h.counts(), { executions: 1, writes: 1, subjects: 2 });
  assert.ok((await h.call({ phase: 'start', state: first.state })).next === 'error');
 } finally { await h.close(); }
});

test('DIFF-WAIT-RESUME: lifecycle pin survives initial planning, over1h idle clients and LRU pressure then terminal grace expires without polling', async () => {
 const h = await harness();
 try {
  const first = await h.start(); assert.ok(first.next === 'review_pending');
  // The initial response has no timing. Real owner progress supplies the derived plan later.
  h.setNow(2000); h.progress({ phase: 'grounding', timing: timing(1000) });
  for (let i = 1; i <= 7; i++) { h.setNow(2000 + i * 600_000); h.progress({ phase: 'call', dimension: 'quality', detail: 'owner advancing' }); }
  for (let i = 0; i < 110; i++) await h.store.mint('code-review', { unrelated: i });
  assert.equal((await loadState(first.state)).kind, 'daemon-review-pending');
  const resumed = await h.call({ phase: 'start', state: first.state }); assert.ok(resumed.next === 'review_pending', JSON.stringify(resumed)); assert.equal(resumed.timing!.deadlineAt, 18_001_000);
  h.finish(); await Promise.resolve(); await Promise.resolve();
  const terminalAt = 4_202_000; h.setNow(terminalAt + CODE_REVIEW_TERMINAL_GRACE_MS + 1);
  await assert.rejects(loadState(first.state), /not found/);
  assert.equal(h.counts().executions, 1);
 } finally { await h.close(); }
});

test('DIFF-WAIT-COMPAT: freshness decline starts a degraded review while pending decline explicitly cancels owned work', async () => {
 const h = await harness();
 try {
  h.setStale(); const wait = await h.start(); assert.ok(wait.next === 'confirm_wait'); assert.equal(h.controls.length, 0);
  const pending = await h.call({ phase: 'start', state: wait.state, proceed: false }); assert.ok(pending.next === 'review_pending');
  assert.equal(h.controls[0]!.operation, 'start'); assert.ok(h.controls[0]!.operation === 'start' && h.controls[0]!.groundingMode === 'degraded');
  let cancelled = await h.call({ phase: 'start', state: pending.state, proceed: false });
  assert.equal(h.signal().aborted, true); assert.equal(h.controls.at(-1)!.operation, 'cancel');
  if (cancelled.next === 'review_pending') cancelled = await h.call({ phase: 'start', state: cancelled.state });
  assert.ok(cancelled.next === 'error' && cancelled.error.code === 'review-cancelled', JSON.stringify(cancelled)); assert.equal(h.counts().writes, 0);
  assert.equal(codeReviewOperationIdleMs({ codeReview: { daemonReviewIdleMs: 500_000, daemonReviewCeilingMs: 1 } }), 500_000);
 } finally { await h.close(); }
});

test('DIFF-WAIT-RESUME: transient waiter failures keep the same token; foreign target, daemon loss never claim a CR', async () => {
 const { ReviewStreamError } = await import('../../../../shared/review-stream.js');
 const h = await harness();
 try {
  const pending = await h.start(); assert.ok(pending.next === 'review_pending');
  h.setError(new ReviewStreamError('timeout', 'detached waiter'));
  const retry = await h.call({ phase: 'start', state: pending.state }); assert.ok(retry.next === 'review_pending' && retry.state === pending.state); assert.equal(h.signal().aborted, false);
  const foreign = await h.call({ phase: 'start', state: pending.state, repo: '/foreign' }); assert.ok(foreign.next === 'error' && foreign.error.code === 'review-target-mismatch');
  h.setError(new ReviewStreamError('aborted', 'client disconnected'));
  const detached = await h.call({ phase: 'start', state: pending.state }); assert.ok(detached.next === 'review_pending' && detached.state === pending.state); assert.equal(h.signal().aborted, false);
  h.setError(); await h.registry.close();
  const lost = await h.call({ phase: 'start', state: pending.state }); assert.ok(lost.next === 'error'); assert.equal(h.counts().writes, 0);
 } finally { await h.close(); }
});


test('DIFF-WAIT-RESUME: malformed final or a changed daemon epoch is rejected before consuming a pending result', async () => {
 for (const variant of ['malformed', 'epoch'] as const) {
  const h = await harness();
  try {
   const pending = await h.start(); assert.ok(pending.next === 'review_pending');
   h.setReply(variant === 'epoch' ? { status: 'pending', reviewHandle: pending.reviewHandle, daemonEpoch: 'new-epoch', progress: [] } : { status: 'done', reviewHandle: pending.reviewHandle, daemonEpoch: pending.daemonEpoch, result: {} });
   const refused = await h.call({ phase: 'start', state: pending.state }); assert.ok(refused.next === 'error'); assert.equal(h.counts().writes, 0);
  } finally { await h.close(); }
 }
});
