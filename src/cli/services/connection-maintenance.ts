/** Offline maintenance consumes existing stop evidence; it never controls a daemon process. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectionManagementEnablement } from '../../daemon/db/management-enablement.js';
import { processObservation } from '../../daemon/db/management-owner-lease.js';
import { readProtected, writeProtected } from '../../daemon/db/management-files.js';
import type { StoppedDaemonEvidence } from '../../daemon/db/management-state.js';

export interface MaintenanceControl {
  readonly ready: () => Promise<boolean>;
  readonly proof: () => Promise<StoppedDaemonEvidence>;
  readonly alive: (pid: number) => boolean;
  readonly run: (root: string, proof: StoppedDaemonEvidence) => Promise<void>;
}
export async function runConnectionMaintenance(root: string, control: MaintenanceControl): Promise<void> {
  if (!await control.ready()) throw new Error('Connection maintenance requires verified build gates.');
  if (await realpath(root) !== root) throw new Error('Maintenance requires a canonical repository.');
  const proof = await control.proof();
  if (proof.source !== 'safe-stop-control' || !Number.isSafeInteger(proof.pid) || proof.pid <= 0
    || !/^[a-f0-9]{64}$/.test(proof.processIdentity) || !Number.isFinite(Date.parse(proof.stoppedAt))) {
    throw new Error('Maintenance requires verified stopped-daemon evidence.');
  }
  if (control.alive(proof.pid)) throw new Error('Maintenance requires the previous daemon to exit.');
  // The existing offline entry independently verifies absence, acquires the vault
  // guard and checks registry membership under exclusive store ownership.
  await control.run(root, proof);
}

/** proofPath names independently supplied protected evidence; no proof is invented here. */
export async function adoptConnections(root: string, proofPath: string): Promise<void> {
  await runConnectionMaintenance(root, {
    ready: async () => (await connectionManagementEnablement()).ready,
    proof: async () => JSON.parse((await readProtected(proofPath)).bytes.toString('utf8')) as StoppedDaemonEvidence,
    alive: processObservation.alive,
    run: async (canonical, proof) => {
      const directory = await mkdtemp(join(tmpdir(), 'insrc-connection-maintenance-'));
      try {
        const path = join(directory, 'stop.json');
        await writeProtected(path, JSON.stringify(proof), true);
        const entry = fileURLToPath(new URL('../../bin/insrc-connection-maintenance.js', import.meta.url));
        await promisify(execFile)(process.execPath, [entry, canonical, path], {
          env: { ...process.env, INSRC_LOG_LEVEL: 'silent' }, timeout: 120000, maxBuffer: 65536,
        });
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
  });
}
