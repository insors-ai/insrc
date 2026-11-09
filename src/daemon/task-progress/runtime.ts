import { join } from 'node:path';
import type { ProgressKind } from '../../shared/task-progress.js';
import { getLogger } from '../../shared/logger.js';
import { ProgressAccess } from './access.js';
import { createProgressAuthority, OWNER_RENEWAL_MS, ProgressCoordinator } from './coordinator.js';
import type { DetailValidator } from './record.js';
import { ProgressStore } from './store.js';
import { FallbackScheduler } from './fallback.js';

const log = getLogger('task-progress');

export async function openProgressRuntime<D extends { readonly kind: ProgressKind }>(
  daemonRoot: string,
  projects: () => Promise<ReadonlySet<string>>,
  validateDetails: DetailValidator<D>,
): Promise<{ access: ProgressAccess<D>; coordinator: ProgressCoordinator<D>; close(): Promise<void> }> {
  const store = await ProgressStore.open(join(daemonRoot, 'task-progress'), validateDetails);
  const authority = createProgressAuthority();
  const coordinator = new ProgressCoordinator(store, authority.inspect);
  const fallback = new FallbackScheduler<D>({
    read: task => coordinator.read(task),
    isTerminal: task => coordinator.isTerminal(task),
    hasLiveOwner: task => coordinator.hasLiveOwner(task),
    disposition: (task, prior, current) => coordinator.disposition(task, prior, current),
    refresh: (task, signal) => coordinator.refreshForFallback(task, signal),
  });
  await coordinator.sweep();
  // Check the per-owner 30-second deadlines independently of the slower disk sweep.
  const ownerHeartbeat = setInterval(() => { void coordinator.probeOwnerActivity(); }, 1000);
  ownerHeartbeat.unref();
  let sweeping: Promise<void> | undefined;
  const timer = setInterval(() => {
    sweeping ??= coordinator.sweep().then(() => fallback.sweep())
      .catch(() => { log.warn('progress retention sweep failed'); })
      .finally(() => { sweeping = undefined; });
  }, OWNER_RENEWAL_MS);
  timer.unref();
  return {
    access: new ProgressAccess(store, coordinator, authority.mint, projects, fallback),
    coordinator,
    async close() {
      clearInterval(ownerHeartbeat);
      clearInterval(timer);
      await sweeping;
      coordinator.stopOwnerProbes();
      await store.settle();
    },
  };
}
