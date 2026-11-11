/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { InstallationMutationGate } from '../../shared/installation-mutation-gate.js';
import type { MutationReservation, UpdatePredecessor } from '../../shared/installation-mutation-gate.js';
import { launchctl } from '../../shared/managed-daemon-installation.js';
import type { ManagedInstallation } from '../../shared/managed-daemon-installation.js';
import { discoverLegacyLaunch, fenceLegacyLauncher, restoreLegacyLauncher } from '../legacy-cutover-admission.js';
import { matchesInstalledDaemonArguments } from '../legacy-launch-job.js';

const options = { skip: process.platform !== 'darwin' || (process.getuid?.() ?? 0) === 0, timeout: 120_000 };

async function fixtureOwner(helper: string) {
	for (let attempt = 0;; attempt++) {
		try { return await readDarwinIncarnation(process.pid, helper); }
		catch (error) {
			if (attempt >= 2 || (error as { killed?: boolean }).killed !== true) throw error;
			await delay(250);
		}
	}
}

async function fixture(t: TestContext) {
	const scratch = await realpath(await mkdtemp('/tmp/insrc-cutover-'));
	t.after(() => rm(scratch, { recursive: true, force: true }));
	const stateRoot = join(scratch, 'state');
	const oldRoot = join(stateRoot, 'daemon');
	const candidateRoot = join(scratch, 'candidate');
	await mkdir(join(oldRoot, 'out/daemon'), { recursive: true });
	await mkdir(candidateRoot);
	const helper = join(scratch, 'darwin-lifecycle');
	execFileSync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
		fileURLToPath(new URL('../../native/darwin-lifecycle/identity.c', import.meta.url)), '-o', helper]);
	const runtime = await realpath(process.execPath);
	const installation = (releaseRoot: string, releaseId: string, enabled: boolean): ManagedInstallation => ({
		version: 1, stateRoot, releaseRoot, releaseId, enabled, runtime, pathEnv: '/usr/bin:/bin',
	});
	const prior = installation(oldRoot, 'prior', false);
	const candidate = installation(candidateRoot, 'candidate', true);
	const gate = new InstallationMutationGate(stateRoot, helper);
	const owner = await fixtureOwner(helper);
	const predecessor = { priorRelease: prior.releaseId, candidateRelease: candidate.releaseId, priorCommit: 'old', wasRunning: false };
	return { scratch, oldRoot, stateRoot, helper, runtime, prior, candidate, gate, owner, predecessor };
}

async function finish(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	child.kill();
	await once(child, 'exit');
}

async function registerJob(f: Awaited<ReturnType<typeof fixture>>, suffix: string, args: string[], run: boolean) {
	const label = `ai.insrc.test.${basename(f.scratch)}.${suffix}`;
	const path = join(f.scratch, `${suffix}.plist`);
	const text = (value: string) => `<string>${value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</string>`;
	await writeFile(path, `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key>${text(label)}
<key>ProgramArguments</key><array>${args.map(text).join('')}</array>
<key>WorkingDirectory</key>${text(f.oldRoot)}
<key>RunAtLoad</key>${run ? '<true/>' : '<false/>'}
<key>KeepAlive</key><false/>
</dict></plist>\n`, { mode: 0o600 });
	const domain = `gui/${f.owner.uid}`;
	await launchctl(['bootstrap', domain, path]);
	return { label, path, remove: () => launchctl(['bootout', `${domain}/${label}`]) };
}

test('Predecessor variants and backward decoding', options, async t => {
	const f = await fixture(t);
	const baseline = { ...f.candidate, enabled: false };
	const entry = join(f.oldRoot, 'out/daemon/index.js');
	const deps = { helper: f.helper };
	assert.deepEqual(await discoverLegacyLaunch(f.prior, baseline, deps), { launch: { kind: 'stopped' }, wasRunning: false });
	await writeFile(entry, `
const { createServer } = require('node:net');
const { writeFileSync } = require('node:fs');
writeFileSync(${JSON.stringify(join(f.stateRoot, 'daemon.pid'))}, String(process.pid), { mode: 0o600 });
createServer(socket => socket.on('error', () => {})).listen(${JSON.stringify(join(f.stateRoot, 'daemon.sock'))}, () => console.log('ready'));
`);
	const child = spawn(f.runtime, [entry], { cwd: f.oldRoot, stdio: ['ignore', 'pipe', 'inherit'] });
	try {
		await once(child.stdout, 'data');
		const direct = await discoverLegacyLaunch(f.prior, baseline, deps);
		assert.equal(direct.launch?.kind, 'direct');
		assert.ok(direct.launch?.kind === 'direct' && direct.launch.process.pid === child.pid);
		assert.deepEqual(direct.launch.argv, [f.runtime, entry]);
		assert.ok(matchesInstalledDaemonArguments([f.runtime, '--import', 'tsx/esm', entry], f.runtime, entry));
		assert.equal(matchesInstalledDaemonArguments([f.runtime, '--import', 'unknown', entry], f.runtime, entry), false);
		const job = {
			uid: f.owner.uid, label: 'com.insors.insrc.recovery', descriptor: join(f.scratch, 'saved.plist'),
			program: f.runtime, args: [f.runtime, '--import', 'tsx/esm', entry],
		};
		const legacy = { job, descriptorHash: 'a'.repeat(64), runAtLoad: true, entry, baseline };
		const pins = { prior: f.prior, candidate: f.candidate };
		const cases: UpdatePredecessor[] = [
			{ ...f.predecessor, pins: { ...pins, prior: { ...f.prior, enabled: true } } },
			{ ...f.predecessor, pins, wasRunning: true, legacy },
			{ ...f.predecessor, pins, ...direct },
			{ ...f.predecessor, pins, ...direct, launch: { ...direct.launch, kind: 'job' }, legacy },
			{ ...f.predecessor, pins, launch: { kind: 'stopped' } },
			{ ...f.predecessor, pins, launch: { kind: 'stopped' }, legacy: { ...legacy, runAtLoad: false } },
		];
		for (const predecessor of cases) {
			const reservation = await f.gate.reserve({ kind: 'update', owner: f.owner, predecessor });
			const reread = (await f.gate.read()).active;
			assert.ok(reread?.kind === 'update');
			assert.deepEqual(reread.predecessor, predecessor);
			await f.gate.cancelUnstartedUpdate(reservation);
		}
		await assert.rejects(f.gate.reserve({
			kind: 'update', owner: f.owner,
			predecessor: { ...f.predecessor, pins, ...direct, launch: { ...direct.launch, kind: 'job' } },
		}), /invalid installation/);
	} finally { await finish(child); }
	for (const name of ['daemon.pid', 'daemon.sock']) await rm(join(f.stateRoot, name), { force: true });
	const passive = await registerJob(f, 'passive', [f.runtime, entry], false);
	try {
		const route = await discoverLegacyLaunch(f.prior, baseline, { ...deps, labels: [passive.label] });
		assert.equal(route.launch?.kind, 'stopped');
		assert.equal(route.legacy?.job.descriptor, passive.path);
		assert.equal(route.legacy?.job.workingDirectory, f.oldRoot);
		await assert.rejects(discoverLegacyLaunch(f.prior, baseline, deps), /foreign launch job/);
		const descriptor = await readFile(passive.path, 'utf8');
		await writeFile(passive.path, descriptor.replace(f.oldRoot + '</string>', '/private/tmp</string>'));
		await assert.rejects(discoverLegacyLaunch(f.prior, baseline, { ...deps, labels: [passive.label] }), /changing restart policy or descriptor/);
	} finally { await passive.remove(); }
	await mkdir(join(f.oldRoot, 'node_modules'));
	await symlink(fileURLToPath(new URL('../../../node_modules/tsx', import.meta.url)), join(f.oldRoot, 'node_modules/tsx'));
	const recovery = await registerJob(f, 'recovery', [f.runtime, '--import', 'tsx/esm', entry], true);
	try {
		let route;
		for (let attempt = 0; attempt < 50 && route === undefined; attempt++) {
			try {
				const observed = await discoverLegacyLaunch(f.prior, baseline, { ...deps, labels: [recovery.label] });
				if (observed.launch?.kind === 'job') route = observed;
			} catch (error) {
				if (attempt === 49) throw error;
			}
			if (route === undefined) await delay(50);
		}
		assert.ok(route?.launch?.kind === 'job');
		assert.deepEqual(route.launch.argv, [f.runtime, '--import', 'tsx/esm', entry]);
		assert.equal(route.legacy?.job.descriptor, recovery.path);
		assert.equal(route.legacy?.job.workingDirectory, f.oldRoot);
	} finally { await recovery.remove(); }
});

test('Old shell/helper concurrent with canonical launcher exchange and old child attempting to open stores', options, async t => {
	const f = await fixture(t);
	const entry = join(f.oldRoot, 'out/daemon/index.js');
	const graph = join(f.stateRoot, 'graph.lmdb');
	await writeFile(join(f.oldRoot, 'package.json'), '{"type":"module"}');
	await writeFile(entry, `
import { once } from 'node:events';
import { open } from ${JSON.stringify(import.meta.resolve('lmdb'))};
if (process.argv.includes('--wait')) {
  console.log('waiting to open graph');
  process.stdin.resume();
  await once(process.stdin, 'data');
}
const db = open({ path: ${JSON.stringify(graph)}, noSubdir: true });
db.putSync('verification', 'opened-store');
await db.close();
`);
	const update = await f.gate.reserve({
		kind: 'update', owner: f.owner,
		predecessor: { ...f.predecessor, pins: { prior: f.prior, candidate: f.candidate }, launch: { kind: 'stopped' } },
	}) as Extract<MutationReservation, { kind: 'update' }>;
	const shell = spawn('/bin/bash', ['-c', 'printf ready; read -r', join(f.oldRoot, 'scripts/daemon-ctl.sh')],
		{ cwd: f.oldRoot, stdio: ['pipe', 'pipe', 'inherit'] });
	try {
		await once(shell.stdout, 'data');
		await assert.rejects(fenceLegacyLauncher(f.gate, update, f.helper), /older launcher/);
		assert.match(await readFile(entry, 'utf8'), /opened-store/);
		assert.deepEqual((await f.gate.read()).active?.entries, []);
	} finally { await finish(shell); }
	const other = spawn('/bin/sleep', ['30'], { cwd: f.oldRoot, stdio: 'ignore' });
	try {
		await once(other, 'spawn');
		await assert.rejects(fenceLegacyLauncher(f.gate, update, f.helper), /older launcher/);
	} finally { await finish(other); }
	const pending = spawn(f.runtime, [entry, '--wait'], { cwd: f.oldRoot, stdio: ['pipe', 'pipe', 'inherit'] });
	try {
		await once(pending.stdout, 'data');
		await assert.rejects(fenceLegacyLauncher(f.gate, update, f.helper), /older launcher/);
		await assert.rejects(readFile(graph), { code: 'ENOENT' });
		assert.deepEqual((await f.gate.read()).active?.entries, []);
		// The pre-existing process must attempt the open itself. It can proceed on the
		// original installation because cutover was refused before any mutation.
		const exited = once(pending, 'exit');
		pending.stdin.end('open');
		assert.deepEqual(await exited, [0, null]);
		assert.ok((await readFile(graph)).length > 0);
	} finally { await finish(pending); }
	await rm(graph);
	const lostReceipt = {
		admit: f.gate.admit.bind(f.gate), recordIntent: f.gate.recordIntent.bind(f.gate),
		recordReceipt: async () => { throw new Error('interrupted after exchange'); },
	};
	await assert.rejects(fenceLegacyLauncher(lostReceipt, update, f.helper), /interrupted after exchange/);
	assert.throws(() => execFileSync(f.runtime, [entry], { stdio: 'ignore' }));
	await assert.rejects(readFile(graph), { code: 'ENOENT' });
	const displaced = await fenceLegacyLauncher(f.gate, update, f.helper);
	assert.match(await readFile(join(displaced, 'out/daemon/index.js'), 'utf8'), /opened-store/);
	assert.match(await readFile(join(f.oldRoot, 'scripts/daemon-ctl.sh'), 'utf8'), /migration is in progress/);
	assert.equal(await fenceLegacyLauncher(f.gate, update, f.helper), displaced);
	await restoreLegacyLauncher(f.gate, update, f.helper);
	await restoreLegacyLauncher(f.gate, update, f.helper);
	assert.match(await readFile(entry, 'utf8'), /opened-store/);
	execFileSync(f.runtime, [entry], { cwd: f.oldRoot, stdio: 'ignore' });
	assert.ok((await readFile(graph)).length > 0);
});
