// Isolated retained fixture, not an installed daemon. It always exits itself.
import { createInterface } from 'node:readline';
import { DaemonDataLease } from '../../../out/installer/daemon-data-lease.js';
import { resolveInstallationLocation } from '../../../out/installer/location.js';
const [home, mode] = process.argv.slice(2);
const location = resolveInstallationLocation('fixture', { home });
if (mode === 'probe') {
  try {
    const lease = DaemonDataLease.acquire(location);
    await lease.closeResources(async () => {});
    lease.assertHeld(); // Resource closure never claims native/exit completion.
    process.stdout.write('acquired\n');
  } catch (error) {
    if (error.code !== 'busy') throw error;
    process.stdout.write('busy\n');
  }
} else if (mode === 'hold') {
  DaemonDataLease.acquire(location);
  if (typeof globalThis.gc !== 'function') throw new Error('Expected explicit fixture GC support');
  for (let i = 0; i < 3; i++) { globalThis.gc(); await new Promise(resolve => setImmediate(resolve)); }
  process.stdout.write('ready\n');
  for await (const line of createInterface({ input: process.stdin })) {
    if (line !== 'exit') throw new Error('Unexpected fixture command');
    process.exit(0);
  }
} else {
  const lease = DaemonDataLease.acquire(location);
  let closeStore, closeWorker, closing;
  const store = new Promise(resolve => { closeStore = resolve; });
  const worker = new Promise(resolve => { closeWorker = resolve; });
  let calls = 0;
  process.stdout.write('ready\n');
  for await (const line of createInterface({ input: process.stdin })) {
    if (line === 'drain') {
      closing = lease.closeResources(async () => { calls++; await store; await worker; });
      process.stdout.write('draining\n');
    } else if (line === 'coalesce') {
      const again = lease.closeResources(async () => { throw new Error('Second close callback must not run'); });
      if (again !== closing) throw new Error('Concurrent close must coalesce');
      process.stdout.write('coalesced\n');
    } else if (line === 'store') {
      closeStore(); process.stdout.write('store-closed\n');
    } else if (line === 'worker') {
      closeWorker(); await closing;
      if (calls !== 1) throw new Error('Close barrier repeated');
      lease.assertHeld(); process.stdout.write('resources-closed-lease-held\n');
    } else if (line === 'fail') {
      try { await lease.closeResources(async () => { throw new Error('Native store closure unknown'); }); throw new Error('Expected uncertainty'); }
      catch (error) { if (error.code !== 'data-lease-release-uncertain') throw error; }
      lease.assertHeld(); process.stdout.write('uncertain-lease-held\n');
    } else if (line === 'retry') {
      await lease.closeResources(async () => {}); lease.assertHeld();
      process.stdout.write('resources-closed-lease-held\n');
    } else if (line === 'exit') process.exit(0);
    else throw new Error('Unexpected fixture command');
  }
}
