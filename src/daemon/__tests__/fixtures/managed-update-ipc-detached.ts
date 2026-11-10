/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { readDarwinIncarnation } from '../../../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../../../shared/installation-mutation-gate.js';
import type { MutationReservation } from '../../../shared/installation-mutation-gate.js';
import type { ManagedUpdatePins } from '../../managed-update-handoff.js';
import { launchManagedUpdate, runAcknowledgedManagedUpdate } from '../../managed-update-launch.js';
import { settleManagedUpdate } from '../../managed-update-transaction.js';
import { directDispatch, IpcServer } from '../../server.js';

const root = process.argv[3]!;
const mode = process.argv[2];

async function version(name: string): Promise<number | null> {
	const socket = createConnection(join(root, name));
	socket.setEncoding('utf8');
	socket.setTimeout(2_000, () => socket.destroy(new Error('fixture hello timed out')));
	try {
		await once(socket, 'connect');
		socket.write(JSON.stringify({ hello: 1, id: name, supportedVersions: [1] }) + '\n');
		let reply = '';
		for await (const chunk of socket) {
			reply += chunk;
			if (reply.includes('\n')) return JSON.parse(reply).selectedVersion;
		}
		throw new Error('fixture hello disconnected');
	} finally { socket.destroy(); }
}

if (mode === 'daemon') {
	const server = new IpcServer(directDispatch({
		'daemon.update': async (_params, context) => {
			const entry = fileURLToPath(import.meta.url);
			return launchManagedUpdate(entry, ['helper', root], context!.awaitUpdateReply!);
		},
	}), Date.now, join(root, 'daemon.sock'));
	await server.listen();
	process.send?.('ready');
} else {
	const gate = new InstallationMutationGate(root);
	const owner = await readDarwinIncarnation(process.pid);
	await runAcknowledgedManagedUpdate(gate, async () => gate.reserve({
		kind: 'update', owner,
		predecessor: { priorRelease: 'old', candidateRelease: 'new', priorCommit: 'prior', wasRunning: true },
	}) as Promise<Extract<MutationReservation, { kind: 'update' }>>, {} as ManagedUpdatePins, async (_gate, update) => {
		await settleManagedUpdate(gate, update, {
			async stage() {
				if (await version('old.sock') !== 1) throw new Error('old supervisor version unavailable');
				await writeFile(join(root, 'handoff'), 'old peer negotiated');
				const deadline = performance.now() + 8_000;
				for (;;) {
					try {
						const selected = await version('candidate.sock');
						if (selected === null) throw new Error('candidate supervisor has no common protocol version');
						throw new Error('unexpected compatible fixture version');
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || performance.now() >= deadline) throw error;
					}
					await delay(50);
				}
			},
			async verifyCandidate() { throw new Error('fixture must reject the candidate'); },
			async rollback() {
				if (await version('restored.sock') !== 1) throw new Error('previous supervisor was not restored');
			},
		});
	});
}
