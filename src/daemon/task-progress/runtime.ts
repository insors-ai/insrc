import { join } from 'node:path';
import type { ProgressKind } from '../../shared/task-progress.js';
import { ProgressAccess } from './access.js';
import { createProgressAuthority, ProgressCoordinator } from './coordinator.js';
import type { DetailValidator } from './record.js';
import { ProgressStore } from './store.js';

export async function openProgressRuntime<D extends { readonly kind: ProgressKind }>(
  daemonRoot: string,
  projects: () => Promise<ReadonlySet<string>>,
  validateDetails: DetailValidator<D>,
): Promise<{ access: ProgressAccess<D>; coordinator: ProgressCoordinator<D> }> {
  const store = await ProgressStore.open(join(daemonRoot, 'task-progress'), validateDetails);
  const authority = createProgressAuthority();
  const coordinator = new ProgressCoordinator(store, authority.inspect);
  return { access: new ProgressAccess(store, coordinator, authority.mint, projects), coordinator };
}
