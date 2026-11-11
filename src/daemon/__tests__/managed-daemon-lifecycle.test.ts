/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import type { TestContext } from 'node:test';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import type { SupervisorReply, SupervisorRequest } from '../../shared/daemon-supervisor-protocol.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import type { InstallationJournal, MutationReservation } from '../../shared/installation-mutation-gate.js';
import { DaemonSupervisor, spawnSupervisedDaemon, SupervisorPublicShutdown } from '../supervisor.js';
import type { ChildEvents, ManagedChild } from '../supervisor.js';
import { SupervisorRunFiles } from '../supervisor-run-files.js';

let scratch: string;
let helper: string;
const uid = process.getuid?.() ?? 0;
const darwin = process.platform === 'darwin' && uid > 0;
const integration = { skip: !darwin, timeout: 20_000 };
const predecessor = { priorRelease: '/prior', candidateRelease: '/candidate', priorCommit: 'old', wasRunning: true };
before(() => {
	scratch = realpathSync(mkdtempSync('/tmp/insrc-md-'));
	if (!darwin) return;
	helper = join(scratch, 'observer');
	execFileSync(process.env['CC'] || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
		fileURLToPath(new URL('../../native/darwin-lifecycle/identity.c', import.meta.url)), '-o', helper]);
});
after(() => { if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true }); });

let id = 0;
const request = (op: SupervisorRequest['op'], generation: string | null, extra: Partial<SupervisorRequest> = {}): SupervisorRequest =>
	({ v: 1, id: String(++id), op, generation, ...extra });
function ok(reply: SupervisorReply): Extract<SupervisorReply, { ok: true }> {
	assert.equal(reply.ok, true, JSON.stringify(reply));
	return reply as Extract<SupervisorReply, { ok: true }>;
}

async function poll<T>(check: () => T | undefined | Promise<T | undefined>): Promise<T> {
	for (let i = 0; i < 500; i++) {
		const result = await check();
		if (result !== undefined) return result;
		await delay(10);
	}
	throw new Error('timed out waiting for managed fixture');
}

test('Managed watchdog arm has reserved capacity during a controller request burst', async () => {
	const owner = { uid: 501, pid: 10, startedAt: '1:1', executable: process.execPath };
	const reservation: MutationReservation = { id: 'r', owner, kind: 'restart', entries: [] };
	const snapshot: InstallationJournal = { version: 1, root: scratch, active: reservation, outcome: null };
	let delayed: Promise<InstallationJournal> | undefined;
	let release!: (snapshot: InstallationJournal) => void;
	let childEvents!: ChildEvents;
	const childReplies: (SupervisorRequest | SupervisorReply)[] = [];
	const supervisor = new DaemonSupervisor({
		installation: { read: () => delayed ?? Promise.resolve(snapshot), admit: async () => reservation },
		daemon: { runtime: process.execPath, entry: process.execPath, cwd: scratch, env: {} },
		verifyReady: async () => {}, reconcileExit: async () => {}, allowInitialStart: async () => true, publicArm: async () => {},
		spawnChild: (_config, _generation, events) => {
			childEvents = events;
			return { pid: 10, send: frame => childReplies.push(frame), closeChannel() {}, kill: () => true };
		},
	});
	const generation = ok(await supervisor.controller(request('start', null), owner)).generation!;
	childEvents.frame(request('ready', generation));
	await poll(() => childReplies.length === 1 || undefined);
	delayed = new Promise(resolve => { release = resolve; });
	const burst = Array.from({ length: 32 }, () => supervisor.controller(request('stop', generation), owner));
	const arm = request('arm', generation, { armSource: 'signal' });
	try {
		childEvents.frame(arm);
		const reply = await poll(() => childReplies.find(frame => frame.id === arm.id));
		assert.ok('ok' in reply && reply.ok && reply.state === 'draining');
	} finally {
		release(snapshot);
		await Promise.all(burst);
		childEvents.exit(0, null);
	}
});

type Mode = 'normal' | 'hung-before' | 'hung-close' | 'held-client';

function fixtureSource(root: string, mode: Mode, threaded: boolean): string {
	const module = (path: string) => JSON.stringify(new URL(path, import.meta.url).href);
	return `
import { writeFileSync } from 'node:fs';
import { ManagedDaemonLifecycle } from ${module('../managed-daemon-lifecycle.ts')};
import { DaemonRunFileOwnership } from ${module('../run-file-ownership.ts')};
import { directDispatch, IpcServer } from ${module('../server.ts')};
import { sharedAdminHandlers } from ${module('../admin-handlers.ts')};
import { createShutdown } from ${module('../shutdown.ts')};
import { ThreadServices, SHUTDOWN_OP } from ${module('../threads/main-services.ts')};
import { HubClient } from ${module('../threads/channel.ts')};
const root = ${JSON.stringify(root)};
const mode = ${JSON.stringify(mode)};
const paths = { pidFile: root + '/daemon.pid', socketFile: root + '/daemon.sock', guardPath: root + '/run.guard' };
const lifecycle = ManagedDaemonLifecycle.open();
const files = new DaemonRunFileOwnership(paths);
const startup = await lifecycle.borrow(files, paths.guardPath);
const publicShutdown = reason => lifecycle.publicShutdown(reason);
let dispatch = publicShutdown;
let connection;
if (${threaded}) {
	const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
	services.onShutdown(publicShutdown);
	connection = services.connectWorker();
	const hub = new HubClient(connection.workerData.hubPort);
	dispatch = reason => hub.request(SHUTDOWN_OP, reason);
}
const handlers = {
	...sharedAdminHandlers(dispatch),
	'test.block': async () => { writeFileSync(root + '/blocked', 'before-reply'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); },
};
const server = new IpcServer(directDispatch(handlers), Date.now, paths.socketFile, files);
files.writePid();
await server.listen();
await startup.returnGrant();
let closing;
const kill = () => process.kill(process.pid, 'SIGKILL');
const shutdown = createShutdown({
	log: { info() {}, warn() {} },
	armWatchdog: () => lifecycle.watchdog(),
	parentOwnsDeadline: true,
	stopBackgroundWork() {
		writeFileSync(root + '/armed', 'watchdog acknowledged');
		closing = lifecycle.withRunFiles(files, paths.guardPath, () => server.close());
		void closing.catch(kill);
	},
	queueDone: Promise.resolve(),
	closeStores: async () => {
		if (mode !== 'held-client') {
			await server.flushPendingWrites(500);
			server.disconnectClients();
		}
		await closing;
		if (mode === 'hung-close') {
			writeFileSync(root + '/blocked', 'native-close');
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
		}
		connection?.disconnect();
	},
	end: { clearPid() {}, exit: code => process.exit(code), killSelf: kill, lastLinePath: root + '/shutdown.log', storeHealth: () => ({state:'ok'}) },
});
lifecycle.setShutdownHandler(shutdown);
process.on('SIGTERM', () => lifecycle.signal('SIGTERM', kill));
await lifecycle.ready();
`;
}

async function setup(t: TestContext, mode: Mode = 'normal', threaded = false) {
	const root = mkdtempSync(join(scratch, 'root-'));
	const gate = new InstallationMutationGate(root, helper);
	const owner = await readDarwinIncarnation(process.pid, helper);
	const paths = { pidFile: join(root, 'daemon.pid'), socketFile: join(root, 'daemon.sock'), guardPath: join(root, 'run.guard') };
	const entry = join(root, 'child.mjs');
	writeFileSync(entry, fixtureSource(root, mode, threaded));
	const children = new Set<ManagedChild>();
	const admission = new SupervisorPublicShutdown(gate, owner);
	const runFiles = new SupervisorRunFiles(paths, { ...owner, commandLine: owner.executable }, owner.uid);
	const supervisor = new DaemonSupervisor({
		installation: gate, runFiles,
		daemon: { runtime: process.execPath, entry, cwd: root, env: { ...process.env, NODE_OPTIONS: '--import ' + import.meta.resolve('tsx') } },
		verifyReady: async () => {}, reconcileExit: generation => admission.reconciled(generation),
		allowInitialStart: async () => true, publicArm: generation => admission.admit(generation),
		shutdownMs: mode === 'normal' ? 3000 : 650,
		spawnChild(config, generation, events) {
			const child = spawnSupervisedDaemon(config, generation, {
				...events,
				exit(code, signal) { children.delete(child); events.exit(code, signal); },
			});
			children.add(child);
			return child;
		},
	});
	t.after(() => { for (const child of children) child.kill(); });
	const call = (op: SupervisorRequest['op'], generation: string | null, extra?: Partial<SupervisorRequest>) =>
		supervisor.controller(request(op, generation, extra), owner);
	const state = (generation: string, wanted: string) => poll(async () => {
		const reply = await call('status', generation);
		return reply.ok && reply.state === wanted ? reply : undefined;
	});
	const start = async (prior: string | null = null) => {
		const reservation = await gate.reserve({ kind: 'start', owner });
		const generation = ok(await call('start', prior)).generation!;
		await state(generation, 'running');
		await gate.release(reservation);
		return generation;
	};
	const stop = async (generation: string) => {
		const reservation = await gate.reserve({ kind: 'stop', owner });
		ok(await call('stop', generation));
		const result = await state(generation, 'exited');
		await gate.release(reservation);
		return result;
	};
	return { paths, root, gate, owner, call, state, start, stop };
}

async function connected(t: TestContext, path: string): Promise<Socket> {
	const client = createConnection(path);
	t.after(() => client.destroy());
	await once(client, 'connect');
	return client;
}
function send(client: Socket, method: string): void {
	client.write(JSON.stringify({ id: 1, method, params: {} }) + '\n');
}
async function reply(client: Socket): Promise<{ result?: { ok: boolean }; error?: string }> {
	const bytes = await Promise.race([
		once(client, 'data').then(([value]) => value as Buffer),
		once(client, 'close').then(() => { throw new Error('shutdown socket closed before replying'); }),
	]);
	return JSON.parse(bytes.toString('utf8').split('\n')[0]!);
}
function signal(pidFile: string): void {
	const pid = Number(readFileSync(pidFile, 'utf8'));
	process.kill(pid, 'SIGTERM');
}

test('IPC and signal shutdown with no controller', integration, async t => {
	for (const threaded of [false, true]) {
		const daemon = await setup(t, 'normal', threaded);
		const first = await daemon.start();
		const client = await connected(t, daemon.paths.socketFile);
		const response = reply(client);
		send(client, 'daemon.shutdown');
		assert.equal((await response).result?.ok, true);
		assert.equal((await daemon.state(first, 'exited')).exit?.kind, 'graceful');
		assert.equal((await daemon.gate.read()).active, null);
		const second = await daemon.start(first);
		signal(daemon.paths.pidFile);
		assert.equal((await daemon.state(second, 'exited')).exit?.kind, 'graceful');
	}
});

test('Hung before shutdown reply and hung native close after watchdog readiness', integration, async t => {
	for (const mode of ['hung-before', 'hung-close'] as const) {
		const daemon = await setup(t, mode);
		const generation = await daemon.start();
		if (mode === 'hung-before') {
			const client = await connected(t, daemon.paths.socketFile);
			send(client, 'test.block');
			await poll(() => existsSync(join(daemon.root, 'blocked')) || undefined);
		}
		assert.equal((await daemon.stop(generation)).exit?.kind, 'forced');
		assert.ok(existsSync(join(daemon.root, 'blocked')));
		assert.equal(existsSync(join(daemon.root, 'armed')), mode === 'hung-close');
		assert.equal(existsSync(daemon.paths.guardPath), false);
	}
});

test('Hold a client connection open during managed server.close and confirm forced reap releases the supervisor guard and permits exactly one restart', integration, async t => {
	const daemon = await setup(t, 'held-client');
	const first = await daemon.start();
	await connected(t, daemon.paths.socketFile);
	const stopped = daemon.stop(first);
	await poll(() => existsSync(daemon.paths.guardPath) || undefined);
	assert.equal((await stopped).exit?.kind, 'forced');
	assert.equal(existsSync(daemon.paths.guardPath), false);
	const reservation = await daemon.gate.reserve({ kind: 'restart', owner: daemon.owner });
	const next = ok(await daemon.call('start', first)).generation!;
	assert.equal(ok(await daemon.call('start', first)).generation, next);
	await daemon.state(next, 'running');
	await daemon.call('stop', next);
	await daemon.state(next, 'exited');
	await daemon.gate.release(reservation);
});

test('Public RPC arm gets busy during update while an admitted drain and local signal preserve their watchdog path', integration, async t => {
	const daemon = await setup(t, 'normal', true);
	const first = await daemon.start();
	const update = await daemon.gate.reserve({ kind: 'update', owner: daemon.owner, predecessor });
	const client = await connected(t, daemon.paths.socketFile);
	const response = reply(client);
	send(client, 'daemon.shutdown');
	assert.match((await response).error ?? '', /refused arm: busy/);
	assert.equal(ok(await daemon.call('status', first)).state, 'running');
	ok(await daemon.call('stop', first, { updateId: update.id }));
	assert.equal((await daemon.state(first, 'exited')).exit?.kind, 'graceful');
	const next = ok(await daemon.call('start', first, { updateId: update.id })).generation!;
	await daemon.state(next, 'running');
	signal(daemon.paths.pidFile);
	assert.equal((await daemon.state(next, 'exited')).exit?.kind, 'graceful');
	await daemon.gate.publishOutcome(update, 'rolled-back', 'fixture stopped');
	await daemon.gate.release(update);
});
