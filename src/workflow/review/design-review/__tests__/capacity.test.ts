import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import { designFixture } from './fixtures.js';
import { impactFixture } from './impact-fixtures.js';
import { assertDesignDispatchCapacity, designDispatchCapacity, serializeDesignCheckpoint } from '../capacity.js';
import { saveDesignCheckpoint, loadDesignCheckpoint } from '../checkpoint.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { DESIGN_LIMITS } from '../contracts.js';
import { consolidateDesignReview } from '../results.js';
import type { DesignChunkResult } from '../contracts.js';

function maximalResult(result: DesignChunkResult): DesignChunkResult {
 const r = structuredClone(result); r.status = 'incomplete'; r.limitations = [];
 while (Buffer.byteLength(JSON.stringify(r)) + DESIGN_LIMITS.text + 3 < DESIGN_LIMITS.resultBytes) r.limitations.push('x'.repeat(DESIGN_LIMITS.text));
 r.limitations.push('x'.repeat(DESIGN_LIMITS.resultBytes - Buffer.byteLength(JSON.stringify(r)) - (r.limitations.length ? 3 : 2)));
 assert.equal(Buffer.byteLength(JSON.stringify(r)), DESIGN_LIMITS.resultBytes);
 return r;
}

test('real checkpoint ceiling reserves maximum byte-valid feedback through consolidation and restart', async t => {
 const f = impactFixture(t); f.checkpoint.attempts = [f.baseline];
 f.baseline.completedChunks = f.baseline.completedChunks.map(maximalResult);
 f.baseline.status = 'incomplete';
 f.baseline.report = consolidateDesignReview('review-1',1,f.prepared.subject,f.baseline.baseline.contentIdentity,f.plan,f.baseline.completedChunks);
 // Historical baseline strings are deliberately synthetic capacity fixtures, never hosted evidence.
 const current = structuredClone(f.baseline); current.number = 5; current.status = 'pending';
 current.completedChunks = []; delete current.report;
 const history = Array.from({length:4},(_,i) => { const a = structuredClone(f.checkpoint.attempts[0]!); a.number=i+1; a.report!.attempt=i+1; return a; });
 f.checkpoint.attempts = [...history,current];
 let remaining = DESIGN_LIMITS.checkpointBytes - designDispatchCapacity(f.checkpoint);
 for (const old of history) for (const field of ['canonical','document'] as const) {
  const n = Math.min(remaining, DESIGN_LIMITS.subjectBytes - old.baseline.reviewedContent[field].length);
  if (n > 0) { old.baseline.reviewedContent[field] += 'x'.repeat(n); remaining -= n; }
 }
 assert.equal(remaining,0);
 assert.equal(designDispatchCapacity(f.checkpoint),DESIGN_LIMITS.checkpointBytes);
 assertDesignDispatchCapacity(f.checkpoint);
 const over = structuredClone(f.checkpoint); over.attempts[0]!.baseline.reviewedContent.document += 'x';
 assert.equal(designDispatchCapacity(over),DESIGN_LIMITS.checkpointBytes+1);
 assert.throws(() => assertDesignDispatchCapacity(over),{code:'checkpoint_capacity'});
 await saveDesignCheckpoint(f.repo,f.checkpoint);
 // Simulate the response acceptance/consolidation boundary using the actual maximum valid results.
 current.completedChunks = f.baseline.completedChunks;
 current.report = consolidateDesignReview('review-1',5,f.prepared.subject,current.baseline.contentIdentity,f.plan,current.completedChunks);
 current.status = 'incomplete';
 await saveDesignCheckpoint(f.repo,f.checkpoint);
 const restored = (await loadDesignCheckpoint(f.repo,'review-1'))!.attempts[4]!;
 assert.equal(restored.report!.limitations.length,f.baseline.report.limitations.length);
 assert.deepEqual(restored.completedChunks,current.completedChunks);
});

test('encoded dispatch reservation accepts exact bound and refuses one byte below without expanding the ceiling', async t => {
 const f = impactFixture(t); f.checkpoint.attempts = [f.baseline];
 const bound = designDispatchCapacity(f.checkpoint);
 assert.ok(bound < DESIGN_LIMITS.checkpointBytes);
 assertDesignDispatchCapacity(f.checkpoint, bound);
 assert.throws(() => assertDesignDispatchCapacity(f.checkpoint, bound - 1), { code: 'checkpoint_capacity' });
 assert.throws(() => assertDesignDispatchCapacity(f.checkpoint, DESIGN_LIMITS.checkpointBytes + 1));
 await saveDesignCheckpoint(f.repo, f.checkpoint);
 assert.equal(serializeDesignCheckpoint((await loadDesignCheckpoint(f.repo, 'review-1'))!), serializeDesignCheckpoint(f.checkpoint));
 const larger = structuredClone(f.checkpoint); larger.attempts[0]!.completedChunks[0]!.limitations.push('Unicode \u0000 é');
 assert.ok(designDispatchCapacity(larger) > bound);
});
test('capacity refusal is durable before provider construction and does not spend retries', async t => {
 const f = designFixture(t); let calls = 0;
 const c = new DesignReviewCoordinator({ capacity: cp => assertDesignDispatchCapacity(cp, 1), provider: () => { calls++; throw Error('Must not construct provider'); } });
 await c.start({ phase: 'start', repo: f.repo, reviewId: 'review-1', attempt: 1, artifactPath: f.json });
 let view = await c.progress(f.repo, 'review-1', 1);
 for (let i = 0; i < 100 && ['pending','running'].includes(view.status); i++) { await pause(5); view = await c.progress(f.repo,'review-1',1); }
 assert.equal(view.status, 'failed'); assert.equal(calls, 0);
 const stored = (await loadDesignCheckpoint(f.repo,'review-1'))!;
 assert.equal(stored.attempts[0]!.failure!.code, 'checkpoint_capacity');
 assert.equal(stored.attempts[0]!.unit, undefined);
 const restarted = new DesignReviewCoordinator();
 assert.equal((await restarted.progress(f.repo,'review-1',1)).status, 'failed');
});
