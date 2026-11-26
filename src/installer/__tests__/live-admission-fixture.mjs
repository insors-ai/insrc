// Isolated actors only. Production wrapper/boot wiring belongs to later tasks.
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { managerFixture } from './_manager-fixture.ts';
import { openLiveAdmission, authorizeLiveAdmission, authorizeStoreAdmission } from '../../../out/installer/live-admission.js';
import { DaemonDataLease } from '../../../out/installer/daemon-data-lease.js';
const [role, home] = process.argv.slice(2);
const f = managerFixture(home), lines = createInterface({ input: process.stdin });
async function blocked(message) {
  await new Promise(resolve => process.stdout.write(message + '\n', resolve)); process.exit(0);
}
if (role === 'owner') {
  const abort = new AbortController(); let owner;
  f.state.observation = { state: 'absent', resourceOwnershipReleased: true,
    evidence: { kind: 'observed-exit', identity: f.state.observation.identity } };
  f.peers.lifecycle.activate = async (_candidate, admission, assertLiveOwner) => {
    owner = await openLiveAdmission(f.location, admission, assertLiveOwner, abort.signal);
    // This stdout is a retained private test pipe, never installer output/logs.
    process.stdout.write(JSON.stringify({ admission, reference: owner.reference }) + '\n');
    return new Promise(() => {});
  };
  void (async () => {
    for await (const command of lines) {
      if (command === 'exit') process.exit(0);
      if (command === 'cancel') { abort.abort(); await owner.close(); process.stdout.write('cancelled\n'); }
      else if (command === 'replace-admission') {
        const file = join(home, 'install/operations/operation/admission.json');
        const value = JSON.parse(readFileSync(file, 'utf8')); value.sessionId = 'replacement';
        writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); process.stdout.write('replaced\n');
      } else if (command === 'replace-revision') {
        const file = join(home, 'install/controller.json');
        const value = JSON.parse(readFileSync(file, 'utf8')); value.revision++;
        writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); process.stdout.write('replaced\n');
      } else throw new Error('Unexpected fixture owner command');
    }
    process.exit(0);
  })();
  await f.manager().execute({ protocolVersion: 1, operationId: 'operation', installationId: 'fixture', action: 'start' });
  throw new Error('Fixture owner must remain in its activation');
} else {
  const iterator = lines[Symbol.asyncIterator]();
  const first = await iterator.next(); if (first.done) throw new Error('Missing private actor configuration');
  const { admission, reference } = JSON.parse(first.value); let lease;
  process.stdout.write('waiting\n');
  for await (const command of { [Symbol.asyncIterator]: () => iterator }) {
    if (command === 'exit') process.exit(0);
    if (command === 'lease') {
      try {
        await authorizeLiveAdmission(f.location, admission, reference, 'lease');
        lease = DaemonDataLease.acquire(f.location); process.stdout.write('lease-held\n');
      } catch { await blocked('blocked-before-lease'); }
    } else if (command === 'stores') {
      try {
        await authorizeStoreAdmission(f.location, admission, reference, lease);
        writeFileSync(join(home, 'fixture-store-opened'), admission.sessionId, { mode: 0o600 });
        process.stdout.write('admitted\n');
      } catch {
        if (lease) await lease.closeResources(async () => {}).catch(() => {});
        await blocked('blocked-before-stores');
      }
    } else if (command === 'fake-stores' || command === 'foreign-stores') {
      try {
        const selected = command === 'foreign-stores' ? { ...f.location, installationId: 'foreign', daemonEndpoint: { ...f.location.daemonEndpoint, installationId: 'foreign' } } : f.location;
        await authorizeStoreAdmission(selected, admission, reference, command === 'fake-stores' ? {} : lease);
        throw new Error('Invalid resource capability was accepted');
      } catch (error) {
        if (!['admission-unavailable', 'data-lease-lost'].includes(error.code)) throw error;
        process.stdout.write('invalid-lease-rejected\n');
      }
    } else throw new Error('Unexpected fixture child command');
  }
  process.exit(0);
}
