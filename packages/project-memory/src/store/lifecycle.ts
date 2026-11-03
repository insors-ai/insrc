import { MemoryError } from '../errors.js';
import type { DirectoryOwnership } from '../ownership.js';
import type { OwnedWork } from '../runtime.js';
import { OwnedLanceStore, storeCleanupUnverified } from './lance-store.js';

/** The queue precedes this participant: proofs stay alive through its drain/close. */
export class StoreOwnedWork implements OwnedWork {
  readonly #store: OwnedLanceStore;
  constructor(store: OwnedLanceStore) { this.#store = store; }
  stopAdmission(): void { this.#store.stopAdmission(); }
  pending(): number { return this.#store.pendingOwnedWork(); }
  drain(): Promise<void> { return this.#store.drainOwnedWork(); }
  close(): Promise<void> { return this.#store.close(); }
}

/** Explicit startup rollback in dependency order, including partially started
 * queue resources. No failed participant prevents later cleanup attempts. */
export async function rollbackStartup(owner: DirectoryOwnership, participants: readonly OwnedWork[], original: unknown): Promise<never> {
  let verified = !storeCleanupUnverified(original);
  for (const work of participants) try { work.stopAdmission(); } catch { verified = false; }
  for (const work of participants) {
    try { await work.drain(); } catch { verified = false; }
    try { await work.close(); } catch { verified = false; }
  }
  if (verified) try { await owner.close(); } catch { verified = false; }
  if (!verified) throw new MemoryError('STORE_UNAVAILABLE', 'Memory startup cleanup could not be verified.');
  if (original instanceof MemoryError) throw original;
  throw new MemoryError('NOT_READY', 'Memory could not be initialized.');
}
