/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import {
	darwinLaunchLabel, matchesDarwinPeer, observeDarwinExit, readDarwinIncarnation,
	readDarwinPeerCredentials, verifyDarwinLaunchJob,
} from '../darwin-lifecycle.js';

const darwin = process.platform === 'darwin';
let scratch: string;
let helper: string;
before(() => {
	if (!darwin) return;
	scratch = mkdtempSync('/tmp/insrc-observe-');
	helper = join(scratch, 'observer');
	execFileSync(process.env['CC'] || 'cc', ['-std=c11', '-Wall', '-Wextra', '-Werror',
		fileURLToPath(new URL('../../native/darwin-lifecycle/identity.c', import.meta.url)), '-o', helper]);
});
after(() => {
	if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
});

const uid = process.getuid?.() ?? 501;
const job = {
	uid, label: darwinLaunchLabel('/private/state', uid || 501), descriptor: '/private/state/supervisor.plist',
	program: '/pinned/node', args: ['/pinned/node', '/pinned/out/supervisor.js', '/private/state'],
};
const domain = `gui/${job.uid}`;
const service = `${domain}/${job.label}`;
const domainOutput = `${domain} = {\n\ttype = login\n}\n`;
const serviceOutput = [
	`${service} = {`, '\ttype = LaunchAgent', `\tpath = ${job.descriptor}`, `\tprogram = ${job.program}`,
	`\tdomain = ${domain} [31]`, '\tstate = running', '\tpid = 123', '\targuments = {',
	...job.args.map(arg => `\t\t${arg}`), '\t}', '}',
].join('\n');
const readJob = (output = serviceOutput, domainText = domainOutput) => async (target: string) => {
	assert.ok(target === domain || target === service);
	return target === domain ? domainText : output;
};
const identity = { pid: 123, uid: 501, startedAt: '20:50', executable: '/pinned/node' };

test('Compares peer identity and scopes job labels by installation root', () => {
	assert.ok(matchesDarwinPeer(identity, identity, identity));
	assert.equal(matchesDarwinPeer({ ...identity, uid: 502 }, identity, identity), false);
	assert.equal(matchesDarwinPeer(identity, { ...identity, startedAt: '20:51' }, identity), false);
	assert.notEqual(darwinLaunchLabel('/private/other', 501), darwinLaunchLabel('/private/state', 501));
});

test('Validates idle job evidence and refuses the wrong domain or relative program', async () => {
	if (!darwin) {
		await assert.rejects(verifyDarwinLaunchJob(job, readJob()), /require macOS/);
		return;
	}
	await assert.rejects(verifyDarwinLaunchJob(job, readJob(), job.uid + 1), /wrong per-user/);
	await assert.rejects(verifyDarwinLaunchJob(job, readJob(serviceOutput, domainOutput.replace('login', 'system'))), /domain unavailable/);
	await assert.rejects(verifyDarwinLaunchJob({ ...job, program: 'node' }, readJob()), /invalid pinned/);
	await assert.rejects(verifyDarwinLaunchJob(job, readJob(serviceOutput.replace('\tpid = 123', '\tpid = 0'))), /invalid process id/);
	const idle = serviceOutput.replace('state = running\n\tpid = 123', 'state = not running');
	assert.deepEqual(await verifyDarwinLaunchJob(job, readJob(idle)), { target: service, pid: null });
});

test('Rejects a foreign peer PID or executable', () => {
	assert.equal(matchesDarwinPeer({ ...identity, pid: 124 }, identity, identity), false);
	assert.equal(matchesDarwinPeer(identity, { ...identity, executable: '/foreign/node' }, identity), false);
});

test('Rejects a reused PID with a different start incarnation', () => {
	assert.equal(matchesDarwinPeer(identity, { ...identity, startedAt: '20:51' }, identity), false);
});

test('Verifies recovery job registration against the pinned descriptor and argv', async () => {
	if (!darwin) {
		await assert.rejects(verifyDarwinLaunchJob(job, readJob()), /require macOS/);
		return;
	}
	assert.deepEqual(await verifyDarwinLaunchJob(job, readJob()), { target: service, pid: 123 });
	await assert.rejects(verifyDarwinLaunchJob(job, readJob(serviceOutput.replace(job.descriptor, '/foreign/recovery.plist'))),
		/does not match pinned descriptor/);
	await assert.rejects(verifyDarwinLaunchJob(job, readJob(serviceOutput.replace(job.args[1]!, '/foreign/index.js'))),
		/does not match pinned descriptor/);
});

async function liveFixture(): Promise<{ child: ChildProcess; ended: Promise<unknown> }> {
	const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'], {
		stdio: ['ignore', 'pipe', 'ignore'],
	});
	const ended = once(child, 'exit');
	try {
		await Promise.race([
			once(child.stdout, 'data'),
			ended.then(() => { throw new Error('test child exited before readiness'); }),
		]);
		return { child, ended };
	} catch (error) {
		child.kill();
		throw error;
	}
}

test('Observes exact exit of a disposable child with the read-only Darwin helper', async () => {
	if (!darwin) {
		await assert.rejects(readDarwinIncarnation(process.pid), /require macOS/);
		return;
	}
	const fixture = await liveFixture();
	try {
		const target = await readDarwinIncarnation(fixture.child.pid!, helper);
		assert.equal(target.executable, realpathSync(process.execPath));
		const observation = await observeDarwinExit(target, 3_000, helper);
		try {
			fixture.child.kill();
			assert.equal(await observation.exited, true);
		} finally { await observation.close(); }
	} finally {
		fixture.child.kill();
		await fixture.ended;
	}
});

test('Legacy exit observation rejects PID reuse, owner mismatch and timeout without invoking the Mach broker', async () => {
	if (!darwin) {
		await assert.rejects(observeDarwinExit(identity, 10), /require macOS/);
		return;
	}
	const fixture = await liveFixture();
	try {
		const target = await readDarwinIncarnation(fixture.child.pid!, helper);
		await assert.rejects(observeDarwinExit({ ...target, startedAt: '0:0' }, 200, helper), /did not verify/);
		await assert.rejects(observeDarwinExit({ ...target, uid: target.uid + 1 }, 200, helper), /did not verify/);
		const observation = await observeDarwinExit(target, 100, helper);
		assert.equal(await observation.exited, false);
		await observation.close();
		assert.equal(fixture.child.exitCode, null);
		assert.equal(fixture.child.signalCode, null);
	} finally {
		fixture.child.kill();
		await fixture.ended;
	}
});

test('Uses separate labels for test roots and rejects a foreign registered root', async () => {
	assert.notEqual(darwinLaunchLabel('/private/a', 501), darwinLaunchLabel('/private/b', 501));
	assert.notEqual(darwinLaunchLabel('/private/a', 501), darwinLaunchLabel('/private/a', 502));
	if (darwin) await assert.rejects(verifyDarwinLaunchJob(job, readJob(serviceOutput.replace('/private/state\n', '/foreign/state\n'))),
		/does not match pinned descriptor/);
});

test('Reads credentials from the connected socket and rejects mismatched PID or UID', async () => {
	if (!darwin) {
		await assert.rejects(readDarwinPeerCredentials(0), /require macOS/);
		return;
	}
	const socketPath = join(scratch, 'sock');
	const server = createServer();
	server.listen(socketPath);
	await once(server, 'listening');
	const accepted = once(server, 'connection') as Promise<[Socket]>;
	const client = createConnection(socketPath);
	let peer: Socket | undefined;
	try {
		[peer] = await accepted;
		const fd = (peer as Socket & { _handle: { fd: number } })._handle.fd;
		const credentials = await readDarwinPeerCredentials(fd, helper);
		const incarnation = await readDarwinIncarnation(process.pid, helper);
		assert.ok(matchesDarwinPeer(credentials, incarnation, incarnation));
		assert.equal(matchesDarwinPeer(credentials, incarnation, { ...incarnation, pid: incarnation.pid + 1 }), false);
		assert.equal(matchesDarwinPeer(credentials, incarnation, { ...incarnation, uid: incarnation.uid + 1 }), false);
	} finally {
		client.destroy();
		peer?.destroy();
		await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
	}
});
