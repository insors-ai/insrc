import assert from 'node:assert/strict';
import { acquireOwnership } from '../../ownership.js';
import { OwnedLanceStore } from '../../store/lance-store.js';
import { options } from './options.js';
import { profile } from './store-rows.js';
import { planFixture } from './store-plans.js';
import { openNative } from './store-native.js';

const root = process.argv[2]!;
const owner = await acquireOwnership(options(root));
const store = await OwnedLanceStore.open(owner, profile, { now: () => 100, async point(point) {
  if (point !== 'after-write') return;
  // Explicit corruption injection, not a claim that the qualified native merge
  // itself partially publishes. A second test-only SDK mutation removes proof.
  const db = await openNative(root);
  try { await db.table.delete("rowKind = 'receipt'"); } finally { db.close(); }
  throw Error('reply unavailable');
} });
await assert.rejects(store.commit(planFixture().plan), (error: { code?: string }) => error.code === 'STORE_UNAVAILABLE');
await assert.rejects(store.close(), (error: { code?: string }) => error.code === 'STORE_UNAVAILABLE');
assert.ok(store.pendingWrites() > 0); await owner.assertOwned();
process.channel?.ref(); process.send?.({ type: 'owner-held' });
