// Isolated retained fixture, not an installed daemon. It always exits itself.
import { DaemonDataLease } from '../../../out/installer/daemon-data-lease.js';
import { resolveInstallationLocation } from '../../../out/installer/location.js';
const [home, mode] = process.argv.slice(2);
const location = resolveInstallationLocation('fixture', { home });
if (mode === 'probe') {
  try {
    const lease = DaemonDataLease.acquire(location);
    await lease.releaseAfterResources(async () => {});
    process.stdout.write('acquired\n');
  } catch (error) {
    if (error.code !== 'busy') throw error;
    process.stdout.write('busy\n');
  }
} else {
  // Drop the caller reference and force GC: native finalization must not release
  // a lease before application store/worker disposal has been proved.
  DaemonDataLease.acquire(location);
  if (typeof globalThis.gc !== 'function') throw new Error('Expected explicit fixture GC support');
  for (let i = 0; i < 3; i++) { globalThis.gc(); await new Promise(resolve => setImmediate(resolve)); }
  process.stdout.write('ready\n');
  process.stdin.once('data', () => process.exit(0));
  process.stdin.once('end', () => process.exit(0));
}
