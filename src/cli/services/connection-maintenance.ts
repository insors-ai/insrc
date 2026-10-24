/** Explicit maintenance action; never called by ordinary connection RPCs or startup. */
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rpc } from '../client.js';
import { PATHS } from '../../shared/paths.js';
import { stopDaemon } from './daemon.js';
import { processObservation } from '../../daemon/db/management-owner-lease.js';
import { writeProtected } from '../../daemon/db/management-files.js';
import type { StoppedDaemonEvidence } from '../../daemon/db/management-state.js';
export interface MaintenanceControl {
	readonly registered: (root: string) => Promise<boolean>;
	readonly pid: () => Promise<number>;
	readonly identity: (pid: number) => string | undefined;
	readonly command: (pid: number) => string;
	readonly alive: (pid: number) => boolean;
	readonly stop: () => Promise<unknown>;
	readonly run: (root: string, proof: StoppedDaemonEvidence) => Promise<void>;
}
export async function runConnectionMaintenance(root: string, control: MaintenanceControl): Promise<void> {
	const canonical = await realpath(root);
	if (canonical !== root || !await control.registered(root))
		throw new Error('Maintenance requires a registered canonical repository.');
	const pid = await control.pid(), identity = control.identity(pid);
	if (!Number.isSafeInteger(pid) || pid <= 0 || !identity || !control.alive(pid) || !/(?:^|\/)daemon\/index\.(?:js|ts)(?:\s|$)/.test(control.command(pid)))
		throw new Error('Maintenance requires a verified daemon process.');
	await control.stop();
	if (control.alive(pid))
		throw new Error('Maintenance requires the previous daemon to exit.');
	await control.run(root, { source: 'safe-stop-control', pid, processIdentity: identity, stoppedAt: new Date().toISOString() });
}
export async function adoptConnections(root: string): Promise<void> {
	await runConnectionMaintenance(root, {
		registered: async (candidate) => (await rpc<{
			path: string;
		}[]>('repo.list')).some(repo => repo.path === candidate),
		pid: async () => Number((await readFile(PATHS.pidFile, 'utf8')).trim()),
		identity: processObservation.identity, alive: processObservation.alive,
		command: pid => execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim(), stop: stopDaemon,
		run: async (canonical, proof) => {
			const directory = await mkdtemp(join(tmpdir(), 'insrc-connection-maintenance-'));
			try {
				const path = join(directory, 'stop.json');
				await writeProtected(path, JSON.stringify(proof), true);
				const entry = fileURLToPath(new URL('../../bin/insrc-connection-maintenance.js', import.meta.url));
				await promisify(execFile)(process.execPath, [entry, canonical, path], { env: { ...process.env, INSRC_LOG_LEVEL: 'silent' }, timeout: 120000, maxBuffer: 65536 });
			}
			finally {
				await rm(directory, { recursive: true, force: true });
			}
		},
	});
}
