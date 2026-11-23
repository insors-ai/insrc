// Retained fixture only. Crash points self-exit; never targets a daemon/process ID.
import { ControllerStore } from '../../../out/installer/controller-store.js';
import { resolveInstallationLocation } from '../../../out/installer/location.js';
const [home, mode, point] = process.argv.slice(2);
const store = ControllerStore.acquire(resolveInstallationLocation('fixture', { home }));
if (mode === 'crash') {
  const current = store.inspect();
  if (current.kind !== 'present') throw new Error('Expected enrolled fixture');
  const next = structuredClone(current.snapshot); next.revision++;
  next.installation.activeReleaseId = 'new';
  store.commit(next, current.snapshot.revision, p => { if (p === point) process.exit(0); });
  throw new Error('Crash checkpoint not reached');
}
process.stdout.write('ready\n');
process.stdin.once('data', () => { store.assertHeld(); process.exit(0); });
