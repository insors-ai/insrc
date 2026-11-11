/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import type { TestContext } from 'node:test';
import { DaemonSupervisor, spawnSupervisedDaemon, SupervisorPublicShutdown } from '../../../daemon/supervisor.js';
import type { ManagedChild } from '../../../daemon/supervisor.js';
import { listenForSupervisorControllers } from '../../../daemon/supervisor-socket.js';
import { readDarwinIncarnation } from '../../../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../../../shared/installation-mutation-gate.js';
import { installationPaths, readManagedInstallation, stageManagedInstallation, supervisorJob } from '../../../shared/managed-daemon-installation.js';
import type { ManagedInstallation } from '../../../shared/managed-daemon-installation.js';
import { ManagedDaemonControl, openManagedSupervisorLink } from '../managed-daemon-control.js';
import { restart } from '../maintenance.js';

const exec = promisify(execFile);
const darwin = process.platform === 'darwin' && (process.getuid?.() ?? 0) > 0;
const integration = { skip: !darwin, timeout: 25_000 };
const loader = import.meta.resolve('tsx');
const modulePath = (path: string) => JSON.stringify(new URL(path, import.meta.url).href);
const predecessor = { priorRelease: 'prior', candidateRelease: 'candidate', priorCommit: 'old', wasRunning: true };
let scratch: string;
let helper: string;

before(() => {
	if (!darwin) return;
	scratch = realpathSync(mkdtempSync('/tmp/insrc-t7-'));
	helper = join(scratch, 'observer');
	execFileSync(process.env['CC'] || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
		fileURLToPath(new URL('../../../native/darwin-lifecycle/identity.c', import.meta.url)), '-o', helper]);
});
after(() => { if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true }); });

function rootFixture(releaseId = 'fixture'): ManagedInstallation {
	const stateRoot = mkdtempSync(join(scratch, 'root-'));
	const releaseRoot = mkdtempSync(join(scratch, 'release-'));
	const installation = { version: 1 as const, stateRoot, releaseRoot, releaseId, runtime: realpathSync(process.execPath),
		pathEnv: process.env['PATH'] ?? '/usr/bin:/bin', enabled: true };
	const paths = installationPaths(stateRoot);
	mkdirSync(paths.directory, { mode: 0o700 });
	writeFileSync(paths.manifest, JSON.stringify(installation), { mode: 0o600 });
	return installation;
}

async function setup(t: TestContext, releaseId?: string, advertisedRoot?: string) {
	const installation = rootFixture(releaseId);
	const root = installation.stateRoot;
	const paths = installationPaths(root);
	const gate = new InstallationMutationGate(root, helper);
	const me = await readDarwinIncarnation(process.pid, helper);
	const publicShutdown = new SupervisorPublicShutdown(gate, me);
	const source = join(root, 'child.mjs');
	const trigger = join(root, 'raw-shutdown');
	const verdict = join(root, 'raw-result');
	writeFileSync(source, `
import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { ManagedDaemonLifecycle } from ${modulePath('../../../daemon/managed-daemon-lifecycle.ts')};
const managed = ManagedDaemonLifecycle.open();
managed.setShutdownHandler(async reason => {
  const watchdog = await managed.watchdog();
  if (watchdog.pid !== process.ppid) process.exit(2);
  writeFileSync(${JSON.stringify(join(root, 'drain'))}, reason);
  process.exit(0);
});
setInterval(async () => {
  if (!existsSync(${JSON.stringify(trigger)})) return;
  unlinkSync(${JSON.stringify(trigger)});
  try { await managed.publicShutdown('raw daemon.shutdown'); writeFileSync(${JSON.stringify(verdict)}, 'admitted'); }
  catch (error) { writeFileSync(${JSON.stringify(verdict)}, error.code); }
}, 10);
await managed.ready();
`);
	const children = new Set<ManagedChild>();
	const requests: { op: string; generation: string | null; reservation?: string }[] = [];
	const supervisor = new DaemonSupervisor({
		installation: gate, daemon: { runtime: process.execPath, entry: source, cwd: root,
			env: { ...process.env, NODE_OPTIONS: '--import ' + loader } },
		verifyReady: async () => {}, reconcileExit: generation => publicShutdown.reconciled(generation),
		allowInitialStart: async () => true, publicArm: generation => publicShutdown.admit(generation),
		spawnChild(config, generation, events) {
			const child = spawnSupervisedDaemon(config, generation, {
				...events, exit(code, signal) { children.delete(child); events.exit(code, signal); },
			});
			children.add(child);
			return child;
		},
	});
	const server = await listenForSupervisorControllers(paths.socket, {
		installationRoot: advertisedRoot ?? root, releaseId: installation.releaseId,
	}, {
		async controller(req, owner) {
			if (req.op === 'start' || req.op === 'stop') {
				const reservation = (await gate.read()).active?.id;
				requests.push({ op: req.op, generation: req.generation, ...(reservation !== undefined ? { reservation } : {}) });
			}
			return supervisor.controller(req, owner);
		},
	}, helper);
	const sockets = new Set<import('node:net').Socket>();
	server.on('connection', s => { sockets.add(s); s.once('close', () => sockets.delete(s)); });
	t.after(async () => {
		for (const child of children) child.kill();
		for (const socket of sockets) socket.destroy();
		await new Promise<void>(resolve => server.close(() => resolve()));
	});
	const target = { target: 'verified fixture job', pid: process.pid };
	const open = () => openManagedSupervisorLink(installation, { helper, inspect: async () => target, verify: async () => target });
	const control = new ManagedDaemonControl(installation, { gate, owner: async () => me, open, ensure: check => check() });
	return { root, installation, gate, me, control, open, requests, trigger, verdict, server, sockets };
}

async function shellRestart(installation: ManagedInstallation): Promise<string> {
	const release = installation.releaseRoot;
	const bridge = join(release, 'out/bin/insrc-daemon-control.js');
	mkdirSync(join(release, 'out/bin'), { recursive: true });
	writeFileSync(join(release, 'package.json'), '{"type":"module"}');
	writeFileSync(bridge, `
import { ManagedDaemonControl, openManagedSupervisorLink } from ${modulePath('../managed-daemon-control.ts')};
import { InstallationMutationGate } from ${modulePath('../../../shared/installation-mutation-gate.ts')};
import { readDarwinIncarnation } from ${modulePath('../../../shared/darwin-lifecycle.ts')};
const installation = ${JSON.stringify(installation)};
const helper = ${JSON.stringify(helper)};
const target = { target: 'verified fixture job', pid: ${process.pid} };
const gate = new InstallationMutationGate(installation.stateRoot, helper);
const control = new ManagedDaemonControl(installation, {
  gate, owner: () => readDarwinIncarnation(process.pid, helper),
  open: () => openManagedSupervisorLink(installation, { helper, inspect: async () => target, verify: async () => target }),
  ensure: check => check(),
});
if (process.argv[2] !== 'restart') throw new Error('unexpected shell lifecycle operation: '+process.argv[2]);
await control.run('restart', 3000);
process.stdout.write('daemon restarted\\n');
`);
	const scriptPath = fileURLToPath(new URL('../../../../scripts/daemon-ctl.sh', import.meta.url));
	const script = readFileSync(scriptPath, 'utf8');
	const harness = join(installation.stateRoot, 'ctl.sh');
	writeFileSync(harness, script.replace('local manifest="$HOME/.insrc/managed-lifecycle/installation.json"',
		`local manifest=${JSON.stringify(installationPaths(installation.stateRoot).manifest)}`));
	const { stdout } = await exec('/bin/bash', [harness, 'restart', '--skip-sync', '--skip-install', '--skip-build'], {
		env: { ...process.env, INSRC_DAEMON_ROOT: release, INSRC_CTL_LOG_DIR: installation.stateRoot, NODE_OPTIONS: '--import ' + loader },
		timeout: 12_000,
	});
	return stdout;
}

function assertRestart(commands: { op: string; generation: string | null; reservation?: string }[]) {
	assert.deepEqual(commands.map(c => c.op), ['stop', 'start']);
	assert.ok(commands[0]?.generation);
	assert.equal(commands[0]!.generation, commands[1]!.generation);
	assert.ok(commands[0]?.reservation);
	assert.equal(commands[0]!.reservation, commands[1]!.reservation);
}

test('Normal CLI and shell restart', integration, async t => {
	const fixture = await setup(t);
	await fixture.control.run('start');
	fixture.requests.length = 0;
	const unavailable = () => { throw new Error('legacy lifecycle must not run'); };
	const result = await restart(() => {}, { startDaemon: unavailable, stopDaemon: unavailable, managed: async () => fixture.control });
	assert.equal(result.ok, true);
	assertRestart(fixture.requests);
	fixture.requests.length = 0;
	assert.match(await shellRestart(fixture.installation), /daemon restarted/);
	assertRestart(fixture.requests);
	await fixture.control.run('stop');
});

test('Supervisor loss, concurrent restart and stale files', integration, async t => {
	const fixture = await setup(t);
	await fixture.control.run('start');
	const pidPath = installationPaths(fixture.root).daemonPid;
	writeFileSync(pidPath, 'foreign');
	const lost = new ManagedDaemonControl(fixture.installation, {
		gate: fixture.gate, owner: async () => fixture.me, ensure: check => check(),
		open: async () => {
			const real = await fixture.open();
			return { close: () => real.close(), async call(request) {
				if (request.op === 'stop') {
					await assert.rejects(fixture.control.run('restart'), /reserved/);
					real.close();
					throw new Error('supervisor disappeared after stop intent');
				}
				return real.call(request);
			} };
		},
	});
	await assert.rejects(lost.run('restart'), /disappeared/);
	assert.match(await lost.recoveryStatus(), /uncommitted.*restart reservation/);
	await assert.rejects(fixture.control.run('start'), /reserved/);
	assert.equal(readFileSync(pidPath, 'utf8'), 'foreign');
});

test('Managed Darwin never invokes the Mach broker from either the controller or shutdown watchdog', integration, async t => {
	const fixture = await setup(t);
	await fixture.control.run('start');
	await fixture.control.run('restart');
	assert.equal(readFileSync(join(fixture.root, 'drain'), 'utf8'), 'supervisor drain');
	assertRestart(fixture.requests.slice(1));
	await fixture.control.run('stop');
});

test('Installed controller refuses a verified job belonging to another test root', integration, async t => {
	const other = rootFixture('other');
	const fixture = await setup(t, 'current', other.stateRoot);
	await assert.rejects(fixture.open(), /installation or peer does not match/);
	await assert.rejects(readManagedInstallation(other.stateRoot + '/.'), /canonical root|private/);
	assert.equal(fixture.requests.length, 0);

	const staged = { ...rootFixture('staged'), enabled: false };
	const stagedPaths = installationPaths(staged.stateRoot);
	rmSync(stagedPaths.manifest);
	mkdirSync(join(staged.releaseRoot, 'out/bin'), { recursive: true });
	const job = supervisorJob(staged);
	writeFileSync(job.args[1]!, '');
	await stageManagedInstallation(staged, async () => {});
	assert.equal(await readManagedInstallation(staged.stateRoot), undefined);
	const descriptor = readFileSync(stagedPaths.descriptor, 'utf8');
	assert.match(descriptor, /<key>KeepAlive<\/key><false\/>/);
	assert.ok(descriptor.includes(`<key>HOME</key><string>${dirname(staged.stateRoot)}</string>`));
	assert.equal(existsSync(stagedPaths.socket), false);
});

test('Kill the supervisor while it owns the guard and verify fail-closed operator recovery', integration, async t => {
	const installation = rootFixture();
	const paths = installationPaths(installation.stateRoot);
	const gate = new InstallationMutationGate(installation.stateRoot, helper);
	const owner = await readDarwinIncarnation(process.pid, helper);
	const code = `
import { InstallationMutationGate } from ${modulePath('../../../shared/installation-mutation-gate.ts')};
import { readDarwinIncarnation } from ${modulePath('../../../shared/darwin-lifecycle.ts')};
import { SupervisorRunFiles } from ${modulePath('../../../daemon/supervisor-run-files.ts')};
const root = ${JSON.stringify(installation.stateRoot)}, helper = ${JSON.stringify(helper)};
const owner = await readDarwinIncarnation(process.pid, helper);
const gate = new InstallationMutationGate(root, helper);
const reservation = await gate.reserve({kind:'restart',owner});
await gate.recordIntent(reservation,'start','startup acquired guard');
await new SupervisorRunFiles(${JSON.stringify({ guardPath: paths.runGuard, pidFile: paths.daemonPid, socketFile: paths.daemonSocket })},
  {...owner, commandLine:owner.executable}, owner.uid).prepare('owned-generation');
process.send('guard-held');
setInterval(() => {},1000);
`;
	const child = spawn(process.execPath, ['--import', loader, '--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
	const ended = once(child, 'exit');
	t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await ended; });
	const [notice] = await Promise.race([once(child, 'message'), ended]);
	assert.equal(notice, 'guard-held');
	child.kill('SIGKILL');
	await ended;
	const control = new ManagedDaemonControl(installation, { gate, owner: async () => owner });
	assert.match(await control.recoveryStatus(), /uncommitted.*restart reservation/);
	await assert.rejects(control.recoverStoppedLifecycle(), /evidence is unresolved|launch GUI domain/);
	assert.ok(existsSync(paths.runGuard));
	assert.equal((await gate.read()).active?.kind, 'restart');
});

test('Installed shell restart sends one stop and one start bound to the same predecessor', integration, async t => {
	const fixture = await setup(t);
	await fixture.control.run('start');
	fixture.requests.length = 0;
	await shellRestart(fixture.installation);
	assertRestart(fixture.requests);
	await fixture.control.run('stop');
});

test('Race competing start, stop, raw shutdown and update against both supervisor versions', integration, async t => {
	for (const release of ['previous-supervisor', 'candidate-supervisor']) {
		const fixture = await setup(t, release);
		await fixture.control.run('start');
		const update = await fixture.gate.reserve({ kind: 'update', owner: fixture.me, predecessor });
		writeFileSync(fixture.trigger, 'public shutdown');
		const competing = await Promise.allSettled([
			fixture.control.run('start'), fixture.control.run('stop'),
			fixture.gate.reserve({ kind: 'update', owner: fixture.me, predecessor }),
		]);
		assert.equal(competing.every(result => result.status === 'rejected' && /reserved/.test(String(result.reason))), true);
		for (let attempt = 0; !existsSync(fixture.verdict) && attempt < 200; attempt++) await delay(10);
		assert.equal(readFileSync(fixture.verdict, 'utf8'), 'busy');
		assert.equal((await fixture.gate.read()).active?.id, update.id);
		await fixture.gate.publishOutcome(update, 'rolled-back', 'retained current fixture child');
		await fixture.gate.release(update);
		await fixture.control.run('stop');
	}
});
