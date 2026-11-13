/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { once } from 'node:events';
import { lstat } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { installationPaths } from '../shared/managed-daemon-installation.js';
import { matchesDarwinPeer, readDarwinIncarnation, readDarwinPeerCredentials } from '../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import type { InstallationMutationGate } from '../shared/installation-mutation-gate.js';

const TIMEOUT_MS = 2_000;
const MAX_MESSAGE_BYTES = 512;

export function restoredLegacyDrainPath(stateRoot: string): string {
	return join(installationPaths(stateRoot).directory, 'legacy-drain.sock');
}

async function socketPeer(socket: Socket, helper?: string) {
	const fd = (socket as Socket & { _handle?: { fd?: number } })._handle?.fd;
	if (fd === undefined) throw new Error('private legacy drain has no Unix descriptor');
	const credentials = await readDarwinPeerCredentials(fd, helper);
	return { credentials, observed: await readDarwinIncarnation(credentials.pid, helper) };
}

function readRequest(socket: Socket): Promise<string> {
	return new Promise((resolve, reject) => {
		let bytes = Buffer.alloc(0);
		socket.once('close', () => reject(new Error('private legacy drain closed')));
		socket.on('data', (chunk: Buffer) => {
			if (bytes.length + chunk.length > MAX_MESSAGE_BYTES) return socket.destroy();
			bytes = Buffer.concat([bytes, chunk]);
			const newline = bytes.indexOf(10);
			if (newline < 0) return;
			socket.pause();
			if (newline !== bytes.length - 1) return socket.destroy();
			resolve(bytes.subarray(0, newline).toString('utf8'));
		});
		socket.resume();
	});
}

/** Accept the exact update controller at its outstanding legacy drain intent. */
export async function listenForLegacyDrain(
	path: string, stateRoot: string, target: DarwinIncarnation, gate: Pick<InstallationMutationGate, 'read'>,
	drain: () => void | Promise<void>, helper?: string,
): Promise<Server> {
	const parent = await lstat(dirname(path));
	if (!parent.isDirectory() || parent.uid !== target.uid || (parent.mode & 0o077) !== 0) {
		throw new Error('private legacy drain requires an owned private directory');
	}
	let admitted = false;
	const server = createServer({ pauseOnConnect: true }, socket => {
		socket.on('error', () => socket.destroy());
		const timer = setTimeout(() => socket.destroy(), TIMEOUT_MS);
		socket.once('close', () => clearTimeout(timer));
		void (async () => {
			const { credentials, observed } = await socketPeer(socket, helper);
			if (credentials.uid !== target.uid) throw new Error('private legacy drain requires the installation user');
			const raw = await readRequest(socket);
			const { active, outcome } = await gate.read();
			if (active === null || outcome?.id === active.id || !matchesDarwinPeer(credentials, observed, active.owner)
				|| raw !== JSON.stringify({ version: 1, op: active.kind === 'stop' ? 'stop' : 'drain', id: active.id })) {
				throw new Error('private legacy drain has no matching lifecycle controller');
			}
			const step = active.entries.at(-1);
			const launch = active.kind === 'update' ? active.predecessor.launch : undefined;
			const stopTarget = active.kind === 'stop' && step?.step === 'restored-public-stop'
				? (JSON.parse(step.intent) as { target?: DarwinIncarnation }).target : undefined;
			const exactStop = stopTarget !== undefined && matchesDarwinPeer(target, target, stopTarget);
			const exactUpdate = active.kind === 'update' && active.predecessor.pins?.prior.stateRoot === stateRoot
				&& step?.step === 'predecessor-stop' && launch !== undefined && launch.kind !== 'stopped'
				&& matchesDarwinPeer(target, target, launch.process);
			if (admitted || socket.destroyed || step?.receipt !== undefined || (!exactStop && !exactUpdate)) {
				throw new Error('private legacy drain has no outstanding intent for this incarnation');
			}
			admitted = true;
			socket.end('accepted\n');
			await drain();
		})().catch(() => socket.destroy());
	});
	server.maxConnections = 8;
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(path, () => { server.removeListener('error', reject); resolve(); });
	});
	return server;
}

/** Caller attaches the exact-exit observer before sending a private drain. */
export async function requestLegacyDrain(path: string, target: DarwinIncarnation, id: string, helper?: string,
	op: 'drain' | 'stop' = 'drain',
): Promise<void> {
	const socket = createConnection(path);
	socket.on('error', () => socket.destroy());
	const timer = setTimeout(() => socket.destroy(), TIMEOUT_MS);
	try {
		await once(socket, 'connect', { signal: AbortSignal.timeout(TIMEOUT_MS) });
		const { credentials, observed } = await socketPeer(socket, helper);
		if (!matchesDarwinPeer(credentials, observed, target)) throw new Error('private legacy adapter peer changed');
		const reply = readRequest(socket);
		socket.write(JSON.stringify({ version: 1, op, id }) + '\n');
		if (await reply !== 'accepted') throw new Error('private legacy adapter refused drain');
	} finally { clearTimeout(timer); socket.destroy(); }
}
