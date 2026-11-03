import { acquireOwnership } from '../../ownership.js';
import { OwnedLanceStore, storeCleanupUnverified } from '../../store/lance-store.js';
import { options } from './options.js';
import { profile } from './store-rows.js';
import { scope } from './store-rows.js';
import type { StoreOpenPoint } from '../../store/lance-store.js';
import { StoreOwnedWork, rollbackStartup } from '../../store/lifecycle.js';
import { FileQueue } from '../../queue/file-queue.js';
import { MemoryError } from '../../errors.js';

async function run() {
  process.channel?.ref();
  const owner = await acquireOwnership(options(process.argv[2]!));
  const mode = process.argv[3]!;
  if (mode.startsWith('lifecycle-')) {
    const calls: StoreOpenPoint[] = [];
    const store = await OwnedLanceStore.open(owner, profile, { point(p) {
      calls.push(p);
      if (p === 'read-close' && mode !== 'lifecycle-rollback') throw Error('injected reader close failure');
      if (p === 'read-open' && mode === 'lifecycle-orphan') throw Error('injected capture failure');
    } }, undefined, { async bind(projectId) { return { projectId, root: '/project', scopeEpoch: 'epoch-1' }; } });
    const owned = new StoreOwnedWork(store);
    if (mode !== 'lifecycle-rollback') {
      try { await store.snapshot(scope); } catch (error) { if (mode !== 'lifecycle-orphan' || !storeCleanupUnverified(error)) throw error; }
      try { await owned.close(); throw Error('Unexpected successful reader cleanup.'); }
      catch (error) { if (!storeCleanupUnverified(error)) throw error; }
    } else {
      const queue = new FileQueue(owner, owner.directory, options(owner.directory).limits, {}, store.receiptVerifier()); await queue.start();
      try {
        await rollbackStartup(owner, [{ stopAdmission() { queue.stopAdmission(); }, pending() { return queue.pending(); }, drain() { return queue.drain(); }, async close() { await queue.close(); throw Error('injected queue close refusal'); } }, owned], new MemoryError('NOT_READY', 'original'));
      } catch (error) { if (!(error instanceof MemoryError) || error.code !== 'STORE_UNAVAILABLE') throw error; }
    }
    await owner.assertOwned();
    await new Promise<void>((resolve, reject) => process.send!({ type: 'owner-held', calls, pending: owned.pending() }, error => error ? reject(error) : resolve()));
    await new Promise(() => {});
    return;
  }
  const startup = process.argv[3] === 'startup';
  try {
    const store = await OwnedLanceStore.open(owner, profile, { point(p) {
      if (p === 'close-table' || (startup && p === 'control')) throw Error('injected unverified cleanup');
    } });
    await store.close();
    throw Error('Cleanup unexpectedly verified.');
  } catch (error) {
    if (!storeCleanupUnverified(error)) throw error;
  }
  await owner.assertOwned();
  await new Promise<void>((resolve, reject) => process.send!({ type: 'owner-held' }, error => error ? reject(error) : resolve()));
  await new Promise(() => {}); // Only the parent may terminate this failed host.
}
void run().catch(error => { process.stderr.write(String(error)); process.exit(1); });
