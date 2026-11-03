import { acquireOwnership } from '../../ownership.js';
import { OwnedLanceStore, storeCleanupUnverified } from '../../store/lance-store.js';
import { options } from './options.js';
import { profile } from './store-rows.js';

async function run() {
  process.channel?.ref();
  const owner = await acquireOwnership(options(process.argv[2]!));
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
