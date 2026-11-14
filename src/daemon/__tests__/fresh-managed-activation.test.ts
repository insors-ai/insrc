/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ManagedDaemonControl, openManagedSupervisorLink } from '../../cli/services/managed-daemon-control.js';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import type { FreshActivation } from '../../shared/installation-mutation-gate.js';
import { inspectManagedJob, installFreshSelectorMember, installationPaths, readInstallationSelector, removeManagedJob } from '../../shared/managed-daemon-installation.js';
import { activateFreshManagedDaemon } from '../fresh-managed-activation.js';
import { captureManagedReleasePin } from '../managed-release-staging.js';

const exec = promisify(execFile);
const darwin = process.platform === 'darwin' && (process.getuid?.() ?? 0) > 0;
const platform = { skip: !darwin, timeout: 40_000 };
const loader = import.meta.resolve('tsx/esm/api');
const reference = (path: string) => JSON.stringify(new URL(path, import.meta.url).href);

async function connectFixture(installation: Parameters<typeof openManagedSupervisorLink>[0]) {
	for (let attempt = 0;; attempt++) {
		try { return await openManagedSupervisorLink(installation); }
		catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (attempt >= 59 || !['ENOENT', 'ECONNREFUSED', 'supervisor-unavailable'].includes(code ?? '')) throw error;
			await delay(50);
		}
	}
}

async function fixture(t: TestContext, startChild: boolean, failChild = false) {
	const scratch = await realpath(await mkdtemp('/tmp/insrc-fa-'));
	const stateRoot = join(scratch, '.insrc');
	const releaseRoot = join(scratch, 'release');
	const paths = installationPaths(stateRoot);
	const exitTrigger = join(scratch, 'exit-child');
	for (const dir of [stateRoot, 'out/daemon', 'out/bin', 'node_modules', 'packages/project-memory/dist']) {
		await mkdir(dir === stateRoot ? dir : join(releaseRoot, dir), { recursive: true });
	}
	const git = (...args: string[]) => execFileSync('git', ['-C', releaseRoot, ...args], { encoding: 'utf8' }).trim();
	git('init', '-q');
	git('config', 'user.name', 'insrc tests');
	git('config', 'user.email', 'tests@example.invalid');
	await writeFile(join(releaseRoot, '.gitignore'), 'out/\nnode_modules/\ndist/\n');
	await writeFile(join(releaseRoot, 'package.json'), '{"type":"module"}');
	await writeFile(join(releaseRoot, 'package-lock.json'), '{}');
	git('add', '.');
	git('commit', '-qm', 'fixture');
	const runtime = await realpath(process.execPath);
	const installation = { version: 1 as const, stateRoot, releaseRoot, releaseId: git('rev-parse', 'HEAD'), runtime,
		pathEnv: process.env['PATH'] ?? '/usr/bin:/bin', enabled: true };
	await writeFile(join(releaseRoot, 'out/bin/insrc-daemon-supervisor.js'), `
import { register } from ${JSON.stringify(loader)};
import { readFile } from 'node:fs/promises';
register();
const { DaemonSupervisor } = await import(${reference('../supervisor.ts')});
const { listenForSupervisorControllers } = await import(${reference('../supervisor-socket.ts')});
const { InstallationMutationGate } = await import(${reference('../../shared/installation-mutation-gate.ts')});
const supervisor = new DaemonSupervisor({
  installation: new InstallationMutationGate(${JSON.stringify(stateRoot)}),
  daemon: { runtime: process.execPath, entry: ${JSON.stringify(join(releaseRoot, 'out/daemon/index.js'))},
    cwd: ${JSON.stringify(releaseRoot)}, env: process.env },
  allowInitialStart: async () => true,
  verifyReady: async () => {}, reconcileExit: async () => {}, publicArm: async () => {},
});
const selected = JSON.parse(await readFile(${JSON.stringify(paths.manifest)}, 'utf8'));
await listenForSupervisorControllers(${JSON.stringify(paths.socket)}, {
  installationRoot: ${JSON.stringify(stateRoot)}, releaseId: selected.releaseId,
}, supervisor);
`);
	await writeFile(join(releaseRoot, 'out/daemon/index.js'), failChild ? 'process.exit(42);' : `
import { register } from ${JSON.stringify(loader)};
import { existsSync } from 'node:fs';
register();
const { ManagedDaemonLifecycle } = await import(${reference('../managed-daemon-lifecycle.ts')});
const child = ManagedDaemonLifecycle.open();
child.setShutdownHandler(async () => { await child.watchdog(); process.exit(0); });
await child.ready();
setInterval(() => { if (existsSync(${JSON.stringify(exitTrigger)})) process.exit(0); }, 25);
`);
	const { fingerprint } = await captureManagedReleasePin(releaseRoot, runtime);
	const activation: FreshActivation = { installation, startChild, fingerprint };
	const gate = new InstallationMutationGate(stateRoot);
	t.after(async () => {
		const job = await inspectManagedJob(installation);
		if (job !== undefined) {
			const control = new ManagedDaemonControl(installation);
			const link = await connectFixture(installation);
			try {
				const status = await link.call({ op: 'status', generation: null });
				if (status.ok && status.state === 'running') await control.run('stop', 2_000);
			} finally { link.close(); }
			await removeManagedJob(installation, async () => {});
		}
		await rm(scratch, { recursive: true, force: true });
	});
	return { scratch, paths, activation, installation, gate, exitTrigger };
}

async function runFreshInstaller(t: TestContext, startChild: boolean) {
	const f = await fixture(t, startChild);
	const { installation, scratch } = f;
	const origin = join(scratch, 'origin');
	await mkdir(origin);
	await mkdir(join(origin, 'scripts'));
	await mkdir(join(origin, 'src/assets/models'), { recursive: true });
	await copyFile(fileURLToPath(new URL('../../assets/models/cloud-model-catalog.json', import.meta.url)),
		join(origin, 'src/assets/models/cloud-model-catalog.json'));
	await copyFile(fileURLToPath(new URL('../../../scripts/daemon-ctl.sh', import.meta.url)), join(origin, 'scripts/daemon-ctl.sh'));
	const manifest = { name: 'insrc-fresh-fixture', version: '1.0.0', type: 'module', scripts: { build: 'node build.mjs' } };
	await writeFile(join(origin, 'package.json'), JSON.stringify(manifest));
	await writeFile(join(origin, 'package-lock.json'), JSON.stringify({ ...manifest, lockfileVersion: 3,
		packages: { '': { name: manifest.name, version: manifest.version } } }));
	await writeFile(join(origin, '.gitignore'), 'out/\nnode_modules/\ndist/\n');
	const controller = `import { register } from ${JSON.stringify(loader)};\nregister();\nawait import(${reference('../../bin/insrc-daemon-control.ts')});\n`;
	const supervisor = await readFile(join(installation.releaseRoot, 'out/bin/insrc-daemon-supervisor.js'), 'utf8');
	const daemon = await readFile(join(installation.releaseRoot, 'out/daemon/index.js'), 'utf8');
	await writeFile(join(origin, 'build.mjs'), `
import { mkdir, writeFile } from 'node:fs/promises';
for (const dir of ['out/bin', 'out/daemon', 'node_modules', 'packages/project-memory/dist']) await mkdir(dir, { recursive: true });
await writeFile('out/bin/insrc-daemon-control.js', ${JSON.stringify(controller)});
await writeFile('out/bin/insrc-daemon-supervisor.js', ${JSON.stringify(supervisor)});
await writeFile('out/daemon/index.js', ${JSON.stringify(daemon)});
`);
	const git = (...args: string[]) => execFileSync('git', ['-C', origin, ...args], { encoding: 'utf8' }).trim();
	git('init', '-q', '-b', 'v2');
	git('add', '.');
	git('-c', 'user.name=insrc tests', '-c', 'user.email=tests@example.invalid', 'commit', '-qm', 'fixture release');
	installation.releaseId = git('rev-parse', 'HEAD');
	await rm(installation.releaseRoot, { recursive: true });
	const env = { ...process.env, HOME: scratch, INSRC_DAEMON_ROOT: installation.releaseRoot,
		PATH: `${dirname(installation.runtime)}:${installation.pathEnv}` };
	const installer = fileURLToPath(new URL('../../../scripts/insrc-daemon-install.sh', import.meta.url));
	await exec('/bin/bash', [installer, '--target', installation.releaseRoot, '--repo', origin, '--branch', 'v2', '-y',
		'--embedder', 'onnx', ...(startChild ? [] : ['--no-start'])], { env, timeout: 75_000 });
	const status = async () => {
		const link = await connectFixture(installation);
		try { return await link.call({ op: 'status', generation: null }); }
		finally { link.close(); }
	};
	const command = (action: string) => exec('/bin/bash', [join(installation.releaseRoot, 'scripts/daemon-ctl.sh'), action], { env, timeout: 75_000 });
	return { status, command };
}

test('Fresh install and verified ordinary restart', { ...platform, timeout: 120_000 }, async t => {
	const f = await runFreshInstaller(t, true);
	const before = await f.status();
	assert.ok(before.ok && before.state === 'running');
	await f.command('restart');
	const after = await f.status();
	assert.ok(after.ok && after.state === 'running' && after.generation !== before.generation);
});

test('Fresh --no-start and later supervisor start', { ...platform, timeout: 120_000 }, async t => {
	const f = await runFreshInstaller(t, false);
	const before = await f.status();
	assert.ok(before.ok && before.state === 'idle' && before.generation === null);
	await f.command('start');
	const after = await f.status();
	assert.ok(after.ok && after.state === 'running' && after.generation !== null);
});

test('Explicit fresh activation start intent and owned partial publication', platform, async t => {
	const { activation, gate, installation, paths } = await fixture(t, false);
	const active = await gate.reserve({ kind: 'start', owner: await readDarwinIncarnation(process.pid), activation });
	assert.ok((await gate.read()).active?.kind === 'start');
	assert.deepEqual((await gate.admit(active)).kind, 'start');
	await gate.recordIntent(active, 'activation-descriptor', installation.releaseId);
	await installFreshSelectorMember(installation, 'descriptor', active.id, async () => { await gate.admit(active); });
	await installFreshSelectorMember(installation, 'descriptor', active.id, async () => { await gate.admit(active); });
	assert.match(await readFile(paths.descriptor, 'utf8'), /Launch|<key>ProgramArguments/);
	assert.equal(await readInstallationSelector(installation.stateRoot), undefined);
	await writeFile(paths.manifest, 'foreign', { mode: 0o600 });
	await assert.rejects(installFreshSelectorMember(installation, 'manifest', active.id, async () => { await gate.admit(active); }), /different installation/);
	assert.equal(await readFile(paths.manifest, 'utf8'), 'foreign');
});

test('Fresh controller activation reconciles partial selector and bootstrap', { ...platform, timeout: 100_000 }, async t => {
	for (const interruption of ['descriptor', 'manifest-link', 'bootstrap', 'recorded-readiness']) {
		const startChild = interruption === 'bootstrap' || interruption === 'recorded-readiness';
		const { activation, gate, installation, scratch, exitTrigger } = await fixture(t, startChild);
		const helper = join(scratch, 'interrupt.mjs');
		await writeFile(helper, `
import { InstallationMutationGate } from ${reference('../../shared/installation-mutation-gate.ts')};
import { readDarwinIncarnation } from ${reference('../../shared/darwin-lifecycle.ts')};
import { link, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { accepted, openManagedSupervisorLink } from ${reference('../../cli/services/managed-daemon-control.ts')};
import { ensureManagedJob, inspectManagedJob, installFreshSelectorMember, installationPaths } from ${reference('../../shared/managed-daemon-installation.ts')};
const activation = ${JSON.stringify(activation)};
const interruption = ${JSON.stringify(interruption)};
const installation = activation.installation;
const gate = new InstallationMutationGate(installation.stateRoot);
const active = await gate.reserve({ kind: 'start', owner: await readDarwinIncarnation(process.pid), activation });
const admit = async () => { await gate.admit(active); };
for (const member of ['descriptor', 'manifest']) {
  await gate.recordIntent(active, 'activation-' + member, installation.releaseId);
  if (interruption === 'manifest-link' && member === 'manifest') {
    const manifest = installationPaths(installation.stateRoot).manifest;
    const staged = manifest + '.activate-' + active.id;
    await writeFile(staged, JSON.stringify(installation) + '\\n', { mode: 0o600 });
    await link(staged, manifest);
    break;
  }
  await installFreshSelectorMember(installation, member, active.id, admit);
  if (interruption === 'descriptor') break;
  await gate.recordReceipt(active, 'activation-' + member, member);
}
if (activation.startChild) {
  await gate.recordIntent(active, 'activation-job', installation.releaseId);
  await ensureManagedJob(installation, admit, { intent: async () => {}, receipt: async () => {} });
}
if (interruption === 'recorded-readiness') {
  const job = await inspectManagedJob(installation);
  await gate.recordReceipt(active, 'activation-job', JSON.stringify({ target: job.target, incarnation: await readDarwinIncarnation(job.pid) }));
  await gate.recordIntent(active, 'activation-state', installation.releaseId);
  let link;
  for (let i = 0; i < 60 && !link; i++) {
    try { link = await openManagedSupervisorLink(installation); }
    catch (error) { if (i === 59 || !['ENOENT', 'ECONNREFUSED', 'supervisor-unavailable'].includes(error.code)) throw error; await delay(50); }
  }
  let state = accepted(await link.call({ op: 'start', generation: null }));
  for (let i = 0; i < 60 && state.state === 'starting'; i++) {
    await delay(50);
    state = accepted(await link.call({ op: 'status', generation: state.generation }));
  }
  if (state.state !== 'running') throw new Error('fixture did not reach readiness');
  await gate.recordReceipt(active, 'activation-state', JSON.stringify(state));
  link.close();
}
`);
		await exec(installation.runtime, ['--import', import.meta.resolve('tsx'), helper], { timeout: 12_000 });
		if (interruption === 'recorded-readiness') {
			await writeFile(exitTrigger, '');
			const link = await connectFixture(installation);
			try {
				for (let i = 0; i < 60; i++) {
					const status = await link.call({ op: 'status', generation: null });
					if (status.ok && status.state === 'exited') break;
					if (i === 59) assert.fail('fixture did not exit');
					await delay(50);
				}
			} finally { link.close(); }
			await assert.rejects(activateFreshManagedDaemon(activation), /exited before activation settled/);
			assert.equal((await gate.read()).active, null);
			assert.equal(await inspectManagedJob(installation), undefined);
			assert.equal(await readInstallationSelector(installation.stateRoot), undefined);
			continue;
		}
		await activateFreshManagedDaemon(activation);
		assert.equal((await gate.read()).active, null);
		assert.deepEqual(await readInstallationSelector(installation.stateRoot), installation);
		const link = await connectFixture(installation);
		try {
			const status = await link.call({ op: 'status', generation: null });
			assert.ok(status.ok);
			assert.equal(status.state, startChild ? 'running' : 'idle');
		} finally { link.close(); }
	}
	const failed = await fixture(t, true, true);
	await assert.rejects(activateFreshManagedDaemon(failed.activation), /exited before readiness/);
	assert.equal((await failed.gate.read()).active, null);
	assert.equal(await inspectManagedJob(failed.installation), undefined);
	assert.equal(await readInstallationSelector(failed.installation.stateRoot), undefined);
});
