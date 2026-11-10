/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { closeGraphStore, getGraphStore, SCHEMA_VERSION, setGraphStorePath } from '../../db/graph/store.js';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { readSupervisorHello, replyToSupervisorHello } from '../../shared/daemon-supervisor-protocol.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import { rpc } from '../../shared/ipc-client.js';
import type { DaemonStatus, DaemonUpdateOutcome } from '../../shared/types.js';
import { readInstalledCommit } from '../installed-commit.js';
import { readPublicInstalledCommit, readPublicUpdateOutcome } from '../managed-update-ipc.js';
import { COMPATIBILITY_RECEIPT, COMPATIBILITY_STEP } from '../release-compatibility.js';
import { DaemonSupervisor, spawnSupervisedDaemon, SupervisorPublicShutdown } from '../supervisor.js';
import { SupervisorRunFiles } from '../supervisor-run-files.js';

const mac = { skip: process.platform !== 'darwin', timeout: 60_000 };

async function until<T>(read: () => Promise<T | undefined>, milliseconds = 12_000): Promise<T> {
	const deadline = performance.now() + milliseconds;
	do {
		const result = await read();
		if (result !== undefined) return result;
		await delay(75);
	} while (performance.now() < deadline);
	throw new Error('timed out waiting for the managed daemon fixture');
}

async function bootProbation(t: TestContext, threaded: boolean) {
	const home = await realpath(await mkdtemp('/tmp/insrc-ipc-'));
	const root = join(home, '.insrc');
	await mkdir(join(root, 'lance'), { recursive: true });
	await writeFile(join(root, 'config.json'), JSON.stringify({ daemon: { threads: { enabled: threaded } } }));
	// The normal boot cleans this legacy store. During probation it must remain.
	const bootEffect = join(root, 'duckdb.db');
	await writeFile(bootEffect, 'do not touch before commit');
	const graph = join(root, 'graph.lmdb');
	setGraphStorePath(graph);
	await getGraphStore();
	await closeGraphStore();
	const data = await readFile(graph);
	const owner = await readDarwinIncarnation(process.pid);
	const gate = new InstallationMutationGate(root);
	const predecessor = { priorRelease: 'prior', candidateRelease: 'candidate', priorCommit: 'old-head', wasRunning: true };
	const old = await gate.reserve({ kind: 'update', owner, predecessor });
	await gate.publishOutcome(old, 'committed', 'unrelated update');
	await gate.release(old);
	const update = await gate.reserve({ kind: 'update', owner, predecessor });
	const profile = {
		version: 1, graphSchema: SCHEMA_VERSION, startup: 'rollback-compatible',
		formats: { lance: '1', repoAndIndexQueue: '1', config: '1', workflowAndSession: '1' },
	};
	await gate.recordIntent(update, COMPATIBILITY_STEP,
		JSON.stringify({ prior: { ...profile, releaseId: 'prior' }, candidate: { ...profile, releaseId: 'candidate' } }));
	await gate.recordReceipt(update, COMPATIBILITY_STEP, COMPATIBILITY_RECEIPT);
	await gate.recordIntent(update, 'predecessor-stop', 'fixture predecessor already stopped');
	await gate.recordReceipt(update, 'predecessor-stop', 'fixture exit verified');
	const paths = { pidFile: join(root, 'daemon.pid'), socketFile: join(root, 'daemon.sock'), guardPath: join(root, 'daemon.run-files.guard') };
	const call = <T = unknown>(method: string) => rpc<T>(method, {}, () => createConnection(paths.socketFile), { timeoutMs: 4_000 });
	const daemonRoot = fileURLToPath(new URL('../../../', import.meta.url));
	const entry = fileURLToPath(new URL('../index.ts', import.meta.url));
	const admission = new SupervisorPublicShutdown(gate, owner);
	let kill: (() => boolean) | undefined;
	let ended: Promise<void> | undefined;
	const supervisor = new DaemonSupervisor({
		installation: gate,
		runFiles: new SupervisorRunFiles(paths, { ...owner, commandLine: owner.executable }, owner.uid),
		daemon: {
			runtime: process.execPath, cwd: daemonRoot, entry,
			env: {
				...process.env, HOME: home, INSRC_DAEMON_ROOT: daemonRoot, INSRC_MODE: 'mcp',
				INSRC_PROBATION_UPDATE: update.id, INSRC_PROBATION_RELEASE: 'candidate',
				NODE_OPTIONS: `--import ${import.meta.resolve('tsx/esm')}`,
			},
		},
		verifyReady: async () => { await call('daemon.status'); },
		reconcileExit: generation => admission.reconciled(generation),
		allowInitialStart: async () => true,
		publicArm: generation => admission.admit(generation),
		spawnChild(config, generation, events) {
			let finish!: () => void;
			ended = new Promise(resolve => { finish = resolve; });
			const child = spawnSupervisedDaemon(config, generation, {
				...events,
				exit(code, signal) { events.exit(code, signal); finish(); },
				spawnFailed() { events.spawnFailed(); finish(); },
			});
			kill = () => child.kill();
			return child;
		},
	});
	t.after(async () => {
		kill?.();
		await ended;
		await rm(home, { recursive: true, force: true });
	});
	const started = await supervisor.controller({ id: 'start', v: 1, op: 'start', generation: null, updateId: update.id }, owner);
	assert.ok(started.ok && started.generation !== null);
	await until(async () => {
		const status = await supervisor.controller({ id: 'status', v: 1, op: 'status', generation: started.generation }, owner);
		if (status.ok && status.state === 'exited') throw new Error('candidate exited during startup');
		return status.ok && status.state === 'running' ? true : undefined;
	});
	return { call, gate, update, bootEffect, graph, data, commit: readInstalledCommit(daemonRoot) };
}

test('Hold application RPCs and indexing until matching durable success across threaded and non-threaded status paths', mac, async t => {
	for (const threaded of [false, true]) {
		await t.test(threaded ? 'threaded' : 'single-threaded', async sub => {
			const f = await bootProbation(sub, threaded);
			const status = await f.call<DaemonStatus>('daemon.status');
			assert.equal(status.installedCommit, 'old-head');
			assert.equal(status.queueDepth, 0);
			assert.equal(await f.call('daemon.updateOutcome'), null);
			await assert.rejects(f.call('repo.list'), /unknown method/);
			assert.deepEqual(await readFile(f.graph), f.data);
			assert.equal(await readFile(f.bootEffect, 'utf8'), 'do not touch before commit');
			await f.gate.publishOutcome(f.update, 'committed', 'candidate ready');
			await f.gate.release(f.update);
			await until(async () => {
				try { return await f.call('repo.list'); } catch { return undefined; }
			});
			assert.equal(existsSync(f.bootEffect), false);
		});
	}
});

test('Threaded and non-threaded status publish the same committed release for the matching outcome', mac, async t => {
	for (const threaded of [false, true]) {
		await t.test(threaded ? 'threaded' : 'single-threaded', async sub => {
			const f = await bootProbation(sub, threaded);
			await f.gate.publishOutcome(f.update, 'committed', 'candidate ready');
			await f.gate.release(f.update);
			const status = await until(async () => {
				const result = await f.call<DaemonStatus>('daemon.status');
				return result.features?.includes('analyze-request') ? result : undefined;
			});
			assert.ok(f.commit.length > 0);
			assert.equal(status.installedCommit, f.commit);
			assert.equal(status.threads?.some(thread => thread.role === 'admin') ?? false, threaded);
			const outcome = await f.call<DaemonUpdateOutcome>('daemon.updateOutcome');
			assert.equal(outcome.updateId, f.update.id);
			assert.equal(outcome.state, 'succeeded');
			assert.ok(Number.isFinite(Date.parse(outcome.finishedAt)));
		});
	}
});

test('Unreadable managed journal withholds the provisional commit and terminal outcome', async () => {
	const gate = { async read(): Promise<never> { throw new Error('journal damaged'); } };
	assert.equal(await readPublicInstalledCommit(gate, undefined, () => 'candidate'), '');
	assert.equal(await readPublicUpdateOutcome(gate), null);
});

test('Daemon-initiated update survives supervisor unload and writes one terminal result across a protocol version change', mac, async t => {
	const root = await realpath(await mkdtemp('/tmp/insrc-ipc-change-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const peer = async (name: string, versions: number[]) => {
		const server = createServer(socket => {
			let request = '';
			socket.on('data', chunk => {
				request += chunk;
				if (!request.includes('\n')) return;
				const reply = replyToSupervisorHello(readSupervisorHello(JSON.parse(request)), { installationRoot: root, releaseId: name }, versions);
				socket.end(JSON.stringify(reply) + '\n');
			});
		});
		server.listen(join(root, name));
		await once(server, 'listening');
		t.after(() => { if (server.listening) server.close(); });
		return server;
	};
	const old = await peer('old.sock', [1]);
	const fixture = fileURLToPath(new URL('./fixtures/managed-update-ipc-detached.ts', import.meta.url));
	const daemon = fork(fixture, ['daemon', root], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
	const exited = once(daemon, 'exit');
	t.after(async () => { if (daemon.exitCode === null && daemon.signalCode === null) daemon.kill(); await exited; });
	assert.equal(await Promise.race([once(daemon, 'message').then(([value]) => value), exited]), 'ready');
	const ack = await rpc<{ launched: boolean; updateId: string }>(
		'daemon.update', {}, () => createConnection(join(root, 'daemon.sock')), { timeoutMs: 4_000 },
	);
	assert.equal(ack.launched, true);
	const gate = new InstallationMutationGate(root);
	await until(async () => existsSync(join(root, 'handoff')) ? true : undefined);
	assert.equal(await readPublicUpdateOutcome(gate), null);
	await new Promise<void>((resolve, reject) => old.close(error => error ? reject(error) : resolve()));
	daemon.kill('SIGKILL');
	await exited;
	await peer('restored.sock', [1]);
	await peer('candidate.sock', [2]);
	const outcome = await until(async () => await readPublicUpdateOutcome(gate) ?? undefined);
	assert.equal(outcome.updateId, ack.updateId);
	assert.equal(outcome.state, 'failed');
	assert.match(outcome.error ?? '', /no common protocol version/);
	await until(async () => (await gate.read()).active === null ? true : undefined);
	assert.deepEqual(await readPublicUpdateOutcome(gate), outcome);
});
