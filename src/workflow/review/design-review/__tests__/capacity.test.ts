import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import { designFixture } from './fixtures.js';
import { impactFixture } from './impact-fixtures.js';
import { assertDesignDispatchCapacity, designDispatchCapacity, serializeDesignCheckpoint } from '../capacity.js';
import { saveDesignCheckpoint, loadDesignCheckpoint } from '../checkpoint.js';
import { DesignReviewCoordinator } from '../coordinator.js';
import { DESIGN_LIMITS } from '../contracts.js';

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
