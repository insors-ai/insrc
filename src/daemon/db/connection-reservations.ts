/** Daemon-owned ID reservation ports. No current session, configs, credentials or alias index. */
import { realpath } from 'node:fs/promises';
import { ManagementInputError } from '../../shared/connection-management-wire.js';
import { ConnectionUseError } from './lease-gate.js';
interface ReservationOwner {
 readonly ready: () => Promise<boolean>;
 readonly isRegistered: (canonicalRoot: string) => Promise<boolean>;
 readonly contains: (canonicalRoot: string, id: string) => boolean;
}
const owners = new Set<ReservationOwner>();
export function installConnectionReservations(value: ReservationOwner): () => void {
 const owner = Object.freeze({ ...value }); owners.add(owner); return () => { owners.delete(owner); };
}
/** Legacy exact-path targets stay readable, but new alias upserts cannot bypass an enrolled root. */
export async function assertSavedUpsertRoot(suppliedRoot: string): Promise<void> {
 const active: ReservationOwner[] = [];
 for (const owner of owners) if (await owner.ready()) active.push(owner);
 if (!active.length) return; // Feature-disabled saved compatibility includes non-existent legacy targets.
 let canonical: string;
 try { canonical = await realpath(suppliedRoot); } catch (error) {
  // An unresolved legacy target cannot resolve to an eligible canonical management root.
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return;
  throw new ManagementInputError();
 }
 if (canonical === suppliedRoot) return;
 for (const owner of active) if (await owner.isRegistered(canonical)) throw new ManagementInputError();
}
/** Call under the SAME exact-root mutation gate as publication. */
export async function assertSavedIdAvailable(root: string, id: string): Promise<void> {
 for (const owner of owners) if (await owner.ready() && owner.contains(root, id)) throw new ConnectionUseError('duplicate-id');
}
