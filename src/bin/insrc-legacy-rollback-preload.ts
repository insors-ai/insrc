/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { spawn } from 'node:child_process';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BroadcastChannel, isMainThread } from 'node:worker_threads';
import { installLegacyAdminGuard } from '../daemon/legacy-admin-guard.js';
import { listenForLegacyDrain, restoredLegacyDrainPath } from '../daemon/legacy-private-drain.js';
import { readDarwinIncarnation } from '../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../shared/installation-mutation-gate.js';

const context = process.env['INSRC_LEGACY_ROLLBACK_CONTEXT'];
if (context === undefined) throw new Error('missing guarded rollback launch context');
const owner = await lstat(context);
if (!owner.isFile() || owner.uid !== process.getuid?.() || owner.nlink !== 1 || (owner.mode & 0o077) !== 0 || owner.size > 4096) {
	throw new Error('invalid guarded rollback launch context');
}
const { archive, stateRoot, id } = JSON.parse(await readFile(context, 'utf8')) as {
	archive: string; stateRoot: string; id: string;
};
if (process.cwd() !== archive) throw new Error('guarded rollback launched outside its archive');
const incarnation = await readDarwinIncarnation(process.pid);
const journal = new InstallationMutationGate(stateRoot);
const channel = new BroadcastChannel('insrc-restored-daemon-' + id);
channel.unref();
let mainDrain: (() => unknown) | undefined;
let workerDrain: (() => unknown) | undefined;
let workerReady = false;
const handlerReceipt = (table: 'main' | 'worker', thread: number) =>
	writeFile(join(context + '.receipts', table + '-' + thread + '.json'), JSON.stringify({ table, thread, incarnation }),
		{ flag: 'wx', mode: 0o600 });
const controller = fileURLToPath(new URL('./insrc-daemon-control.js', import.meta.url));
async function requestPublicStop() {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [controller, 'stop-restored-legacy', String(process.pid)], {
			detached: true, stdio: 'ignore', env: process.env,
		});
		child.once('error', reject);
		child.once('exit', code => code === 0 ? resolve({ ok: true }) : reject(new Error('restored daemon shutdown admission refused')));
		child.unref();
	});
}
installLegacyAdminGuard({
	archive, requestPublicStop,
	attest: (table, thread) => {
		void handlerReceipt(table, thread).then(() => {
			if (table === 'worker') channel.postMessage('worker-ready');
		}).catch(() => process.exit(4));
	},
	registerMainDrain: drain => { mainDrain = drain; },
	registerWorkerDrain: drain => { workerDrain = drain; },
});
if (isMainThread) {
	channel.onmessage = ({ data }) => { if (data === 'worker-ready') workerReady = true; };
	const server = await listenForLegacyDrain(restoredLegacyDrainPath(stateRoot), stateRoot, incarnation, journal, async () => {
		if (mainDrain !== undefined) await mainDrain();
		else if (workerReady) channel.postMessage('drain');
		else throw new Error('guarded legacy main drain is not registered');
	});
	server.unref();
} else {
	channel.onmessage = ({ data }) => {
		if (data === 'drain' && workerDrain !== undefined) void Promise.resolve(workerDrain()).catch(() => {});
	};
}
