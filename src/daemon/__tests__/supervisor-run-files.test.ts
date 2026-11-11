/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import type { TestContext } from 'node:test';
import { acquireRunFileGuard, borrowRunFileGuard } from '../../shared/daemon-run-files.js';
import { readSupervisorRequest } from '../../shared/daemon-supervisor-protocol.js';
import type { SupervisorReply, SupervisorRequest } from '../../shared/daemon-supervisor-protocol.js';
import type { MutationReservation } from '../../shared/installation-mutation-gate.js';
import { DaemonRunFileOwnership } from '../run-file-ownership.js';
import { DaemonSupervisor, spawnSupervisedDaemon } from '../supervisor.js';
import type { ManagedChild, SupervisorClock } from '../supervisor.js';
import { SupervisorRunFiles } from '../supervisor-run-files.js';

let scratch: string;
const uid = process.getuid?.() ?? 0;
const owner = { pid: process.pid, startedAt: 'fixture', commandLine: process.execPath };
before(() => { scratch = realpathSync(mkdtempSync('/tmp/insrc-rf-')); });
after(() => { if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true }); });

function fixture() {
	const root = mkdtempSync(join(scratch, 'root-'));
	const paths = { guardPath: join(root, 'run.guard'), pidFile: join(root, 'daemon.pid'), socketFile: join(root, 'daemon.sock') };
	return { root, paths, files: new SupervisorRunFiles(paths, owner, uid) };
}

async function socket(path: string): Promise<Server> {
	const server = createServer();
	server.listen(path);
	await once(server, 'listening');
	return server;
}

async function close(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('Guarded stale run files and replacement ownership', async () => {
	const { paths, files } = fixture();
	const orphan = acquireRunFileGuard(paths.guardPath, owner);
	await assert.rejects(files.prepare('g1'), /already exists/);
	assert.ok(existsSync(paths.guardPath));
	orphan.release();

	await files.prepare('g1');
	const token = await files.grant('g1');
	writeFileSync(paths.pidFile, '10');
	const original = await socket(paths.socketFile);
	try {
		files.releaseGrant('g1', token);
		await files.ready('g1', 10);
		await files.finishReady('g1');
	} finally { await close(original); }
	const replacement = await socket(paths.socketFile);
	try {
		await assert.rejects(files.reconcile('g1', 10), /foreign replacement/);
		assert.ok(existsSync(paths.pidFile));
		assert.ok(existsSync(paths.socketFile));
		assert.ok(existsSync(paths.guardPath));
	} finally { await close(replacement); }
});

test('Run-file mutation rejects a mismatched grant, channel or generation', async () => {
	const { paths } = fixture();
	const parent = acquireRunFileGuard(paths.guardPath, { ...owner, pid: process.ppid });
	try {
		let valid = true;
		const borrowed = borrowRunFileGuard(paths.guardPath, process.ppid, () => {
			if (!valid) throw new Error('grant revoked');
		});
		const ownership = new DaemonRunFileOwnership(paths);
		const outer = ownership.useBorrowedGuard(borrowed);
		ownership.writePid();
		valid = false;
		assert.throws(() => ownership.clearRunFiles(), /grant revoked/);
		assert.throws(() => borrowRunFileGuard(paths.guardPath, process.pid, () => {}), /does not belong/);
		const request = { v: 1, id: 'r', op: 'guard-release', generation: 'g1', leaseToken: 'borrowed' };
		assert.throws(() => readSupervisorRequest(request, { role: 'controller', version: 1 }), /channel/);
		assert.throws(() => readSupervisorRequest(request, { role: 'child', generation: 'g2', leaseToken: 'borrowed', drainId: null }),
			/stale generation/);
		assert.throws(() => readSupervisorRequest(request, { role: 'child', generation: 'g1', leaseToken: 'other', drainId: null }),
			/active grant/);
		valid = true;
		outer.release();
		assert.ok(existsSync(paths.guardPath));
	} finally { parent.release(); }
});

test('Partially published run files stay fenced while startup reap is unconfirmed', async () => {
	const { paths, files } = fixture();
	await files.prepare('g1');
	await files.grant('g1');
	writeFileSync(paths.pidFile, '10');
	files.fence('g1');
	await assert.rejects(files.prepare('g2'), /previous run-file generation/);
	assert.ok(existsSync(paths.guardPath));
	assert.ok(existsSync(paths.pidFile));
	await files.reconcile('g1', 10);
	assert.equal(existsSync(paths.pidFile), false);
	assert.equal(existsSync(paths.guardPath), false);
});

test('Repeated or stale lease release cannot change the physical run-file guard', async () => {
	const { paths, files } = fixture();
	await files.prepare('g1');
	const first = await files.grant('g1');
	assert.equal(await files.grant('g1'), first);
	files.releaseGrant('g1', first);
	const second = await files.grant('g1');
	assert.notEqual(second, first);
	assert.throws(() => files.releaseGrant('g1', first), /stale/);
	assert.throws(() => files.releaseGrant('g2', second), /generation/);
	assert.equal(files.token('g1'), second);
	assert.ok(existsSync(paths.guardPath));
	files.releaseGrant('g1', second);
	await files.reconcile('g1', 10);
});

test('Queued release before and after escalation preserves shutdown guard', async () => {
	for (const releaseBeforeFence of [true, false]) {
		const { paths, files } = fixture();
		await files.prepare('g1');
		const startup = await files.grant('g1');
		writeFileSync(paths.pidFile, '10');
		const endpoint = await socket(paths.socketFile);
		try {
			files.releaseGrant('g1', startup);
			await files.ready('g1', 10);
			await files.finishReady('g1');
			assert.equal(existsSync(paths.guardPath), false);
			const shutdown = await files.grant('g1');
			if (releaseBeforeFence) files.releaseGrant('g1', shutdown);
			files.fence('g1');
			assert.throws(() => files.releaseGrant('g1', shutdown), /stale/);
			assert.ok(existsSync(paths.guardPath));
			await close(endpoint);
			await files.reconcile('g1', 10);
			assert.equal(existsSync(paths.guardPath), false);
		} finally { if (endpoint.listening) await close(endpoint); }
	}
});

async function poll<T>(check: () => T | undefined | Promise<T | undefined>): Promise<T> {
	for (let tries = 0; tries < 250; tries++) {
		const result = await check();
		if (result !== undefined) return result;
		await delay(10);
	}
	throw new Error('supervisor test condition timed out');
}

class ManualClock implements SupervisorClock {
	private current = 0;
	private timers = new Map<() => void, number>();
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

async function forcedStartup(t: TestContext, publication: 'none' | 'pid' | 'both'): Promise<void> {
	const { root, paths, files } = fixture();
	const clock = new ManualClock();
	const executable = join(root, 'child.cjs');
	const marker = join(root, 'fixture-ready');
	writeFileSync(executable, `
		const fs = require('node:fs'), net = require('node:net');
		const mode = ${JSON.stringify(publication)};
		const channel = new net.Socket({ fd: 3, readable: true, writable: true });
		channel.on('end', () => {});
		const generation = process.env.INSRC_SUPERVISOR_GENERATION;
		channel.write(JSON.stringify({v:1, id:'grant', op:'guard-acquire', generation}) + '\\n');
		let pending = '';
		channel.on('data', chunk => {
			pending += chunk;
			if (!pending.includes('\\n')) return;
			const reply = JSON.parse(pending.split('\\n')[0]);
			if (typeof reply.leaseToken !== 'string') process.exit(1);
			if (mode !== 'none') fs.writeFileSync(${JSON.stringify(paths.pidFile)}, String(process.pid));
			const marked = () => fs.writeFileSync(${JSON.stringify(marker)}, 'ready for kill');
			if (mode === 'both') net.createServer().listen(${JSON.stringify(paths.socketFile)}, marked);
			else marked();
		});
		setInterval(() => {}, 1000);
	`);
	const actor = { ...owner, uid, executable: process.execPath };
	const reservation: MutationReservation = { id: 'r', kind: 'restart', owner: actor, entries: [] };
	const installation = {
		read: async () => ({ version: 1 as const, root, active: reservation, outcome: null }),
		admit: async () => reservation,
	};
	let child: ManagedChild | undefined;
	let reaped = false;
	const supervisor = new DaemonSupervisor({
		installation, daemon: { runtime: process.execPath, entry: executable, cwd: root, env: {} },
		runFiles: files, clock, startupMs: 50,
		verifyReady: async () => {}, reconcileExit: async () => {},
		allowInitialStart: async () => true, publicArm: async () => {},
		spawnChild(config, generation, events) {
			child = spawnSupervisedDaemon(config, generation, {
				...events,
				exit(code, signal) {
					reaped = true;
					assert.ok(existsSync(paths.guardPath), 'guard is held at exact reap');
					events.exit(code, signal);
				},
			});
			return child;
		},
	});
	t.after(() => { if (!reaped) child?.kill(); });
	const start = await supervisor.controller({ v: 1, id: 'start', op: 'start', generation: null }, actor);
	assert.ok(start.ok && start.generation !== null);
	await poll(() => existsSync(marker) || undefined);
	assert.equal(existsSync(paths.pidFile), publication !== 'none');
	assert.equal(existsSync(paths.socketFile), publication === 'both');
	clock.advance(50);
	const status = await poll(async (): Promise<SupervisorReply | undefined> => {
		const result = await supervisor.controller({ v: 1, id: 'status', op: 'status', generation: start.generation }, actor);
		return result.ok && result.state === 'exited' ? result : undefined;
	});
	assert.equal(status.exit?.kind, 'forced');
	assert.equal(reaped, true);
	for (const path of Object.values(paths)) assert.equal(existsSync(path), false);
}

test('Kill startup child before PID, after PID, and after socket publication before ready', { timeout: 15_000 }, async t => {
	for (const phase of ['none', 'pid', 'both'] as const) await forcedStartup(t, phase);
});
