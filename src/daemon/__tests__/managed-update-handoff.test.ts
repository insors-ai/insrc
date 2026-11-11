/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { ManagedSupervisorLink } from '../../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import type { MutationReservation } from '../../shared/installation-mutation-gate.js';
import { rpc } from '../../shared/ipc-client.js';
import type { ManagedInstallation } from '../../shared/managed-daemon-installation.js';
import { qualifyManagedUpdate, stageManagedUpdate } from '../managed-update-handoff.js';
import { launchManagedUpdate } from '../managed-update-launch.js';
import { readReleaseCompatibility } from '../release-compatibility.js';
import { directDispatch, IpcServer } from '../server.js';

const darwin = process.platform === 'darwin';
const options = { skip: !darwin, timeout: 15_000 };

async function rootFixture(t: TestContext) {
	const root = await realpath(await mkdtemp('/tmp/insrc-uh-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	return { root, gate: new InstallationMutationGate(root) };
}

async function handoffFixture(t: TestContext, failHello: boolean, wasRunning = true) {
	const { root, gate } = await rootFixture(t);
	const install = (releaseId: string): ManagedInstallation => ({
		version: 1, releaseId, releaseRoot: join(root, releaseId), stateRoot: root,
		enabled: true, runtime: process.execPath, pathEnv: '/usr/bin:/bin',
	});
	const prior = install('old');
	const candidate = install('new');
	const old = readReleaseCompatibility({
		version: 1, releaseId: 'old', graphSchema: 10, startup: 'rollback-compatible',
		formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' },
	});
	const next = { ...old, releaseId: 'new' };
	const pins = qualifyManagedUpdate(prior, candidate, old, next, [{ prior: old, candidate: next }]);
	const owner = await readDarwinIncarnation(process.pid);
	const generation = wasRunning ? 'old-generation' : null;
	const admitted = await gate.reserve({
		kind: 'update', owner,
		predecessor: { preparing: true, priorRelease: 'old', candidateRelease: 'unqualified', priorCommit: 'prior', wasRunning, generation },
	}) as Extract<MutationReservation, { kind: 'update' }>;
	const update = await gate.qualifyUpdate(admitted, {
		priorRelease: 'old', candidateRelease: 'new', priorCommit: 'prior', wasRunning, generation, pins: { prior, candidate },
	});
	assert.equal(update.id, admitted.id);
	const calls: string[] = [];
	const job = { target: 'gui/fixture/job', pid: 2468 };
	let selected = prior;
	const connect = async (installation: ManagedInstallation): Promise<ManagedSupervisorLink> => {
		const isCandidate = installation === candidate;
		calls.push(isCandidate ? 'candidate-hello' : 'predecessor-hello');
		if (isCandidate && failHello) throw new Error('candidate hello refused');
		return {
			close() {},
			async call({ op, generation, updateId }) {
				const result = { v: 1, id: 'reply', ok: true } as const;
				if (op === 'stop') {
					assert.equal(updateId, update.id);
					assert.equal(generation, 'old-generation');
					calls.push('predecessor-reaped');
					return { ...result, state: 'exited', generation, exit: { kind: 'graceful', code: 0, signal: null } };
				}
				if (op === 'start') {
					assert.equal(updateId, update.id);
					assert.equal(generation, null);
					const journal = await gate.read();
					assert.deepEqual(JSON.parse(journal.active!.entries.find(entry => entry.step === 'candidate-job')!.receipt!), job);
					assert.equal(journal.outcome, null);
					calls.push('candidate-child');
					return { ...result, state: 'running', generation: 'new-generation' };
				}
				return isCandidate || !wasRunning ? { ...result, state: 'idle', generation: null }
					: { ...result, state: 'running', generation: 'old-generation' };
			},
		};
	};
	const handoff = () => stageManagedUpdate(gate, update, pins, {
		connect,
		async remove(installation, check) {
			assert.equal(installation, prior);
			await check();
			calls.push('prior-job-removed');
			return { job: { target: 'gui/fixture/job', pid: 1234 }, startedAt: 'prior-start' };
		},
		async inspectStores() { calls.push('read-only-stores'); },
		async select(installation, check) {
			assert.equal((await gate.read()).active?.entries.at(-1)?.step, 'provisional-selector');
			await check();
			selected = installation;
			calls.push('selector');
		},
		async register(installation, check) {
			assert.equal(installation, selected);
			await check();
			calls.push('candidate-registered');
			return job;
		},
	});
	return { handoff, gate, calls, job };
}

test('Candidate job handoff records registration before child admission and keeps release selection provisional', options, async t => {
	const { handoff, gate, calls, job } = await handoffFixture(t, false);
	assert.deepEqual(await handoff(), { job, generation: 'new-generation' });
	assert.deepEqual(calls, [
		'predecessor-hello', 'predecessor-reaped', 'prior-job-removed', 'read-only-stores',
		'selector', 'candidate-registered', 'candidate-hello', 'candidate-child',
	]);
	const state = await gate.read();
	assert.equal(state.active?.kind, 'update');
	assert.equal(state.outcome, null);
	assert.deepEqual(JSON.parse(state.active!.entries.find(entry => entry.step === 'predecessor-stop')!.receipt!), {
		generation: 'old-generation', state: 'exited', exit: { kind: 'graceful', code: 0, signal: null },
	});
});

test('Running managed update IPC and stopped local managed update', options, async t => {
	const { handoff, calls, job } = await handoffFixture(t, false, false);
	assert.deepEqual(await handoff(), { job, generation: null });
	assert.deepEqual(calls, ['predecessor-hello', 'prior-job-removed', 'read-only-stores', 'selector', 'candidate-registered', 'candidate-hello']);
	await exerciseUpdateReply(t, ['written']);
});

test('A failed candidate hello yields an exact job receipt without admitting a daemon child', options, async t => {
	const { handoff, gate, calls, job } = await handoffFixture(t, true);
	await assert.rejects(handoff, /hello refused/);
	assert.equal(calls.includes('candidate-child'), false);
	const state = await gate.read();
	assert.equal(state.outcome, null);
	assert.deepEqual(state.active!.entries.at(-1), { step: 'candidate-job', intent: 'new', receipt: JSON.stringify(job) });
});

async function waitForFile(path: string): Promise<void> {
	const deadline = performance.now() + 4_000;
	while (!existsSync(path)) {
		assert.ok(performance.now() < deadline, `did not see ${path}`);
		await delay(25);
	}
}

async function exerciseUpdateReply(t: TestContext, deliveries: readonly string[]): Promise<void> {
	for (const delivery of deliveries) {
		const { root, gate } = await rootFixture(t);
		const socket = join(root, 'test.sock');
		const fixture = fileURLToPath(new URL('./fixtures/managed-update-launch-child.ts', import.meta.url));
		const admitted = join(root, 'admitted');
		const cancelled = join(root, 'cancelled');
		const reserved = Promise.withResolvers<void>();
		const sendReply = Promise.withResolvers<void>();
		const server = new IpcServer(directDispatch({
			'daemon.update': async (_params, context) => {
				assert.ok(context?.awaitUpdateReply);
				const result = await launchManagedUpdate(fixture, [root], context.awaitUpdateReply);
				reserved.resolve();
				await sendReply.promise;
				return result;
			},
		}), Date.now, socket);
		if (delivery === 'failed-write') {
			const transport = server as unknown as { writeLine: () => Promise<boolean> };
			transport.writeLine = async () => false;
		}
		await server.listen();
		t.after(async () => { sendReply.resolve(); await server.close(); });
		const connection = createConnection(socket);
		t.after(() => { connection.destroy(); });
		const reply = rpc<{ updateId: string }>('daemon.update', {}, () => connection, { timeoutMs: 8_000 });
		const observed = reply.catch(error => error as Error);
		await reserved.promise;
		const update = (await gate.read()).active;
		assert.equal(update?.kind, 'update');
		assert.equal(existsSync(admitted), false);
		if (delivery === 'written') {
			sendReply.resolve();
			assert.deepEqual(await observed, { launched: true, updateId: update!.id });
			await waitForFile(admitted);
		} else {
			if (delivery === 'disconnect') {
				connection.destroy();
				await observed;
			}
			sendReply.resolve();
			await waitForFile(cancelled);
			assert.equal((await gate.read()).active, null);
			assert.equal(existsSync(admitted), false);
			connection.destroy();
			await observed;
		}
	}
}

test('A lost or unwritten update acknowledgement keeps the detached helper behind its launch gate', options, t =>
	exerciseUpdateReply(t, ['disconnect', 'failed-write', 'written']));

test('Managed update acknowledges before slow preparation and survives client disconnect', { ...options, timeout: 70_000 }, async t => {
	const { root, gate } = await rootFixture(t);
	const socket = join(root, 'test.sock');
	const fixture = fileURLToPath(new URL('./fixtures/managed-update-launch-child.ts', import.meta.url));
	const server = new IpcServer(directDispatch({
		'daemon.status': async () => ({ pid: process.pid, state: 'running' }),
		'daemon.update': async (_params, context) => {
			assert.ok(context?.awaitUpdateReply);
			return launchManagedUpdate(fixture, [root, 'slow'], context.awaitUpdateReply);
		},
	}), Date.now, socket);
	await server.listen();
	t.after(async () => { await server.close(); });
	const connection = createConnection(socket);
	const reply = await rpc<{ launched: boolean; updateId: string }>('daemon.update', {}, () => connection, { timeoutMs: 20_000 });
	assert.equal(reply.launched, true);
	connection.destroy();
	await waitForFile(join(root, 'admitted'));
	await delay(21_000);
	const state = await gate.read();
	assert.equal(state.active?.id, reply.updateId);
	assert.equal(state.outcome, null);
	assert.deepEqual(await rpc('daemon.status', {}, () => createConnection(socket), { timeoutMs: 2_000 }), { pid: process.pid, state: 'running' });
	await writeFile(join(root, 'complete-preparation'), 'ready');
	const deadline = performance.now() + 8_000;
	for (;;) {
		const terminal = await gate.read();
		if (terminal.active === null) {
			assert.equal(terminal.outcome?.id, reply.updateId);
			assert.equal(terminal.outcome.decision, 'committed');
			break;
		}
		assert.ok(performance.now() < deadline, 'detached update did not publish a terminal outcome');
		await delay(50);
	}
});

test('Managed update helper waits for acknowledgement write before destructive work', options, t =>
	exerciseUpdateReply(t, ['written']));
