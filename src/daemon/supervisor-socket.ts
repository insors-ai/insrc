/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { lstat } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { dirname, isAbsolute } from 'node:path';
import { readDarwinIncarnation, readDarwinPeerCredentials } from '../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../shared/darwin-lifecycle.js';
import {
	encodeSupervisorFrame, readSupervisorHello, readSupervisorRequest, replyToSupervisorHello,
	SupervisorFrameReader, SUPERVISOR_VERSION,
} from '../shared/daemon-supervisor-protocol.js';
import type { SupervisorRelease, SupervisorReply } from '../shared/daemon-supervisor-protocol.js';
import type { DaemonSupervisor } from './supervisor.js';

const HANDSHAKE_MS = 2_000;
const MAX_CONTROLLERS = 32;

async function controllerIdentity(socket: Socket, uid: number, helper?: string): Promise<DarwinIncarnation> {
	// Node exposes the Unix descriptor on the live Pipe handle. Fail closed if it is unavailable.
	const fd = (socket as Socket & { _handle?: { fd?: number } })._handle?.fd;
	if (fd === undefined) throw new Error('controller socket has no Unix descriptor');
	const credentials = await readDarwinPeerCredentials(fd, helper);
	if (credentials.uid !== uid) throw new Error('foreign controller UID');
	const identity = await readDarwinIncarnation(credentials.pid, helper);
	if (identity.uid !== credentials.uid) throw new Error('controller incarnation changed');
	return identity;
}

/** Bind only inside a private directory. A pre-existing path is never unlinked to obtain admission. */
export async function listenForSupervisorControllers(
	path: string,
	release: SupervisorRelease,
	supervisor: Pick<DaemonSupervisor, 'controller'>,
	helper?: string,
): Promise<Server> {
	const uid = process.getuid?.();
	if (process.platform !== 'darwin' || uid === undefined || uid <= 0 || !isAbsolute(path)) {
		throw new Error('supervisor control requires an absolute socket in a macOS user installation');
	}
	const parent = await lstat(dirname(path));
	if (!parent.isDirectory() || parent.uid !== uid || (parent.mode & 0o077) !== 0) {
		throw new Error('supervisor control directory must be private and owned');
	}
	const server = createServer({ pauseOnConnect: true }, socket => {
		socket.on('error', () => socket.destroy());
		const timer = setTimeout(() => socket.destroy(), HANDSHAKE_MS);
		socket.once('close', () => clearTimeout(timer));
		void controllerIdentity(socket, uid, helper).then(owner => {
			if (socket.destroyed) return;
			serveConnection(socket, release, supervisor, owner, timer);
			socket.resume();
		}).catch(() => socket.destroy());
	});
	server.maxConnections = MAX_CONTROLLERS;
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(path, () => { server.removeListener('error', reject); resolve(); });
	});
	return server;
}

function serveConnection(
	socket: Socket,
	release: SupervisorRelease,
	supervisor: Pick<DaemonSupervisor, 'controller'>,
	owner: DarwinIncarnation,
	timer: ReturnType<typeof setTimeout>,
): void {
	const frames = new SupervisorFrameReader();
	let version: number | null = null;
	let handling = false;
	const send = (reply: SupervisorReply): void => {
		if (socket.destroyed || socket.writableNeedDrain) { socket.destroy(); return; }
		socket.write(encodeSupervisorFrame(reply));
	};
	socket.on('data', (chunk: Buffer) => {
		try {
			frames.push(chunk, frame => {
				if (socket.destroyed || socket.writableEnded) return;
				if (version === null) {
					const reply = replyToSupervisorHello(readSupervisorHello(frame), release, [SUPERVISOR_VERSION]);
					if (reply.selectedVersion === null) { socket.end(encodeSupervisorFrame(reply)); return; }
					version = reply.selectedVersion;
					clearTimeout(timer);
					socket.write(encodeSupervisorFrame(reply));
					return;
				}
				const request = readSupervisorRequest(frame, { role: 'controller', version });
				if (handling) {
					send({ v: request.v, id: request.id, generation: request.generation, ok: false, error: 'busy' });
					return;
				}
				handling = true;
				void supervisor.controller(request, owner).then(send).catch(() => socket.destroy()).finally(() => { handling = false; });
			});
		} catch { socket.destroy(); }
	});
	socket.once('close', () => frames.discardPartial());
}
