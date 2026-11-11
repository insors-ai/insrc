/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import type { Server, Socket } from 'node:net';
import { constants } from 'node:os';
import { join } from 'node:path';
import { setImmediate as nextTurn, setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import type { TestContext } from 'node:test';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import type { DarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { encodeSupervisorFrame, readSupervisorHello, readSupervisorReply, SupervisorFrameReader, verifySupervisorHelloReply } from '../../shared/daemon-supervisor-protocol.js';
import type { SupervisorReply, SupervisorRequest } from '../../shared/daemon-supervisor-protocol.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import type { MutationReservation } from '../../shared/installation-mutation-gate.js';
import { DaemonSupervisor, spawnSupervisedDaemon } from '../supervisor.js';
import type { ChildEvents, ManagedChild, SupervisorClock, SupervisorOptions } from '../supervisor.js';
import { listenForSupervisorControllers } from '../supervisor-socket.js';

let scratch: string;
let helper: string;
const darwin = process.platform === 'darwin' && (process.getuid?.() ?? 0) !== 0;
const owner = { uid: 501, pid: 123, startedAt: '1:0', executable: '/bin/test' };
const predecessor = { priorRelease: '/prior', candidateRelease: '/candidate', priorCommit: 'old', wasRunning: true };
before(() => {
	scratch = realpathSync(mkdtempSync('/tmp/insrc-sup-'));
	if (!darwin) return;
	helper = join(scratch, 'observer');
	execFileSync(process.env['CC'] || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
		fileURLToPath(new URL('../../native/darwin-lifecycle/identity.c', import.meta.url)), '-o', helper]);
});
after(() => { if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true }); });

let correlation = 0;
function request(op: SupervisorRequest['op'], generation: string | null, other: Partial<SupervisorRequest> = {}): SupervisorRequest {
	return { v: 1, id: String(++correlation), op, generation, ...other };
}
function success(reply: SupervisorReply): Extract<SupervisorReply, { ok: true }> {
	assert.equal(reply.ok, true, JSON.stringify(reply));
	return reply as Extract<SupervisorReply, { ok: true }>;
}
function error(reply: SupervisorReply, code: string): void {
	assert.equal(reply.ok, false, JSON.stringify(reply));
	if (!reply.ok) assert.equal(reply.error, code);
}

class ManualClock implements SupervisorClock {
	private current = 0;
	private readonly timers = new Map<() => void, number>();
	now(): number { return this.current; }
	schedule(run: () => void, wait: number): () => void {
		this.timers.set(run, this.current + wait);
		return () => { this.timers.delete(run); };
	}
	advance(ms: number): void {
		this.current += ms;
		for (const [run, time] of this.timers) {
			if (time <= this.current) { this.timers.delete(run); run(); }
		}
	}
}
class FakeChild implements ManagedChild {
	readonly pid = 10;
	readonly sent: (SupervisorRequest | SupervisorReply)[] = [];
	kills = 0;
	constructor(readonly events: ChildEvents) {}
	send(frame: SupervisorRequest | SupervisorReply): void { this.sent.push(frame); }
	kill(): boolean { this.kills++; return true; }
	closeChannel(): void {}
}
function fake(overrides: Partial<SupervisorOptions> = {}) {
	const clock = new ManualClock();
	const children: FakeChild[] = [];
	const reservation: MutationReservation = { id: 'reserve', kind: 'restart', owner, entries: [] };
	const install = {
		read: async () => ({ version: 1 as const, root: scratch, active: reservation, outcome: null }),
		admit: async () => reservation,
	};
	const supervisor = new DaemonSupervisor({
		installation: install,
		daemon: { runtime: process.execPath, entry: process.execPath, cwd: scratch, env: {} },
		clock, startupMs: 50, shutdownMs: 20, reapMs: 5,
		spawnChild: (_config, _generation, events) => {
			const child = new FakeChild(events);
			children.push(child);
			return child;
		},
		verifyReady: async () => {}, reconcileExit: async () => {},
		allowInitialStart: async () => true, publicArm: async () => {},
		...overrides,
	});
	return { supervisor, clock, children, call: (op: SupervisorRequest['op'], id: string | null, other?: Partial<SupervisorRequest>) =>
		supervisor.controller(request(op, id, other), owner) };
}
async function ready(child: FakeChild, id: string): Promise<void> {
	child.events.frame(request('ready', id));
	await nextTurn();
}

test('Monotonic deadline, repeated requests and grace versus forced outcome', async () => {
	const f = fake();
	const first = success(await f.call('start', null)).generation!;
	await ready(f.children[0]!, first);
	assert.equal(success(await f.call('status', first)).state, 'running');
	assert.equal(success(await f.call('start', null)).generation, first);
	assert.equal(f.children.length, 1);

	await f.call('stop', first, { deadlineMs: 10 });
	f.clock.advance(4);
	await f.call('stop', first, { deadlineMs: 100 });
	await f.call('stop', first, { deadlineMs: 1 });
	assert.equal(f.children[0]!.sent.filter(x => 'op' in x && x.op === 'drain').length, 1);
	f.clock.advance(5);
	assert.equal(f.children[0]!.kills, 0);
	f.clock.advance(1);
	assert.equal(f.children[0]!.kills, 1);
	f.children[0]!.events.exit(null, constants.signals.SIGKILL);
	await nextTurn();
	assert.equal(success(await f.call('stop', first)).exit?.kind, 'forced');

	const second = success(await f.call('start', first)).generation!;
	await ready(f.children[1]!, second);
	await f.call('stop', second);
	f.children[1]!.events.exit(0, null);
	await nextTurn();
	f.clock.advance(40);
	assert.equal(f.children[1]!.kills, 0);
	assert.equal(success(await f.call('stop', second)).exit?.kind, 'graceful');
});

test('Supervisor classifies idle stop, unavailable runtime, and confirmed failed exit', async () => {
	const f = fake();
	error(await f.call('stop', 'unknown'), 'not-running');
	const bad = fake({ daemon: { runtime: '/missing-insrc-runtime', entry: process.execPath, cwd: scratch, env: {} } });
	error(await bad.call('start', null), 'runtime-unavailable');
	assert.equal(bad.children.length, 0);

	const id = success(await f.call('start', null)).generation!;
	f.children[0]!.events.exit(23, null);
	await nextTurn();
	const failed = await f.call('stop', id);
	error(failed, 'daemon-exit-failed');
	assert.deepEqual(failed.exit, { kind: 'failed', code: 23, signal: null });
});

test('Late ready cannot beat startup timeout or allow replacement before confirmed reap', async () => {
	let finishCheck!: () => void;
	let finishCleanup!: () => void;
	const f = fake({
		verifyReady: () => new Promise(resolve => { finishCheck = resolve; }),
		reconcileExit: () => new Promise(resolve => { finishCleanup = resolve; }),
	});
	const id = success(await f.call('start', null)).generation!;
	f.children[0]!.events.frame(request('ready', id));
	f.clock.advance(50);
	finishCheck();
	await nextTurn();
	assert.equal(f.children[0]!.kills, 1);
	error(await f.call('start', id), 'busy');
	f.clock.advance(5);
	error(await f.call('status', id), 'exit-unconfirmed');
	error(await f.call('start', id), 'exit-unconfirmed');
	f.children[0]!.events.exit(null, constants.signals.SIGKILL);
	error(await f.call('start', id), 'exit-unconfirmed');
	finishCleanup();
	await nextTurn();
	assert.equal(success(await f.call('status', id)).exit?.kind, 'forced');
	assert.notEqual(success(await f.call('start', id)).generation, id);
});

async function controllerSocket(t: TestContext, path: string, release: { installationRoot: string; releaseId: string }, me: DarwinIncarnation) {
	const socket = createConnection(path);
	t.after(() => socket.destroy());
	await once(socket, 'connect');
	const reader = new SupervisorFrameReader();
	const frames: unknown[] = [];
	socket.on('data', (data: Buffer) => reader.push(data, value => frames.push(value)));
	async function exchange(frame: Parameters<typeof encodeSupervisorFrame>[0]): Promise<unknown> {
		socket.write(encodeSupervisorFrame(frame));
		return poll(() => frames.shift());
	}
	const hello = readSupervisorHello({ hello: 1, id: 'hello', supportedVersions: [1] });
	const identity = { ...me, commandLine: me.executable };
	assert.equal(verifySupervisorHelloReply(await exchange(hello), hello, release, identity, identity), 1);
	return async (req: SupervisorRequest) => readSupervisorReply(await exchange(req), req);
}

async function poll<T>(check: () => T | undefined | Promise<T | undefined>): Promise<T> {
	for (let i = 0; i < 250; i++) {
		const value = await check();
		if (value !== undefined) return value;
		await delay(10);
	}
	throw new Error('timed out waiting for supervisor');
}

async function installedFixture(t: TestContext) {
	const root = mkdtempSync(join(scratch, 'fixture-'));
	const entry = join(root, 'child.cjs');
	writeFileSync(entry, `
		const { Socket } = require('node:net');
		const socket = new Socket({ fd: 3, readable: true, writable: true });
		const generation = process.env.INSRC_SUPERVISOR_GENERATION;
		socket.write(JSON.stringify({ v:1, id:'ready', op:'ready', generation }) + '\\n');
		let pending = '';
		socket.on('data', chunk => {
			pending += chunk;
			let newline;
			while ((newline = pending.indexOf('\\n')) >= 0) {
				const message = JSON.parse(pending.slice(0, newline));
				pending = pending.slice(newline + 1);
				if (message.op === 'drain') process.exit(0);
			}
		});
	`);
	const gate = new InstallationMutationGate(root, helper);
	const me = await readDarwinIncarnation(process.pid, helper);
	const children: ManagedChild[] = [];
	const supervisor = new DaemonSupervisor({
		installation: gate, daemon: { runtime: process.execPath, entry, cwd: root, env: {} },
		verifyReady: async () => {}, reconcileExit: async () => {},
		allowInitialStart: async () => true, publicArm: async () => {},
		spawnChild: (config, generation, events) => {
			const child = spawnSupervisedDaemon(config, generation, {
				...events,
				exit: (code, signal) => { children.splice(children.indexOf(child), 1); events.exit(code, signal); },
			});
			children.push(child);
			return child;
		},
	});
	const release = { installationRoot: root, releaseId: 'pinned' };
	const path = join(root, 'control.sock');
	const server: Server = await listenForSupervisorControllers(path, release, supervisor, helper);
	const sockets: Socket[] = [];
	server.on('connection', socket => sockets.push(socket));
	t.after(async () => {
		for (const child of children) child.kill();
		for (const socket of sockets) socket.destroy();
		await new Promise<void>(resolve => server.close(() => resolve()));
	});
	return { gate, me, connect: () => controllerSocket(t, path, release, me) };
}

async function awaitState(call: (req: SupervisorRequest) => Promise<SupervisorReply>, generation: string, state: string) {
	return poll(async () => {
		const reply = await call(request('status', generation));
		return reply.ok && reply.state === state ? reply : undefined;
	});
}

test('Delayed controller cannot stop the replacement generation', { skip: !darwin, timeout: 10_000 }, async t => {
	const { gate, me, connect } = await installedFixture(t);
	const reservation = await gate.reserve({ kind: 'restart', owner: me });
	const call = await connect();
	const stale = await connect();
	const id = success(await call(request('start', null))).generation!;
	await awaitState(call, id, 'running');
	await call(request('stop', id));
	await awaitState(call, id, 'exited');
	const replacement = success(await call(request('start', id))).generation!;
	await awaitState(call, replacement, 'running');
	error(await stale(request('stop', id)), 'ownership-conflict');
	assert.equal(success(await call(request('status', replacement))).state, 'running');
	await call(request('stop', replacement));
	await awaitState(call, replacement, 'exited');
	await gate.release(reservation);
});

test('Fresh supervisor first start requires durable predecessor evidence and an admitted owner', { skip: !darwin, timeout: 10_000 }, async t => {
	const { gate, me, connect } = await installedFixture(t);
	const call = await connect();
	error(await call(request('start', null)), 'busy');
	const update = await gate.reserve({ kind: 'update', owner: me, predecessor });
	const start = () => call(request('start', null, { updateId: update.id }));
	error(await start(), 'ownership-conflict');
	await gate.recordIntent(update, 'predecessor-stop', 'verified old generation');
	error(await start(), 'ownership-conflict');
	await gate.recordReceipt(update, 'predecessor-stop', 'old job removed and exact child exit confirmed');
	error(await call(request('start', null, { updateId: 'foreign' })), 'busy');
	const id = success(await start()).generation!;
	await awaitState(call, id, 'running');
	await call(request('stop', id, { updateId: update.id }));
	await awaitState(call, id, 'exited');
	await gate.publishOutcome(update, 'rolled-back', 'fixture stopped');
	await gate.release(update);
});
