import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { darwinProcessIdentity, linuxProcessStart, processIdentityState, readProcessIdentity, requireProcessIdentity, sameProcess, signalVerifiedProcess } from '../daemon-process.js';

const identity = { pid: 123, startedAt: 'boot:10', commandLine: 'node /installed/out/daemon/index.js' };

test('process start parsers preserve OS markers and distinguish zombies and malformed observations', () => {
	const suffix = ['S', ...Array<string>(18).fill('0'), '12345'].join(' ');
	assert.deepEqual(linuxProcessStart(`123 (a process ) name) ${suffix}`), { startedAt: '12345', zombie: false });
	assert.equal(linuxProcessStart(`123 (name) ${suffix.replace(/^S/, 'Z')}`).zombie, true);
	assert.throws(() => linuxProcessStart('not a process stat'), /unreadable/);
	assert.throws(() => linuxProcessStart('1 (name) S 2'), /start marker/);
	assert.deepEqual(darwinProcessIdentity(12, 'Sat Oct 24 16:10:00 2026 S node /a path/daemon/index.js'), { pid: 12, startedAt: 'darwin:Sat Oct 24 16:10:00 2026', commandLine: 'node /a path/daemon/index.js' });
	assert.equal(darwinProcessIdentity(12, 'Sat Oct 24 16:10:00 2026 Z <defunct>'), undefined);
	assert.throws(() => darwinProcessIdentity(12, '12 node'), /start marker/);
});

test('identity comparison and signalling refuse PID reuse, changed commands and unreadable probes', () => {
	const signalled: number[] = [], kill = (pid: number): void => { signalled.push(pid); };
	assert.equal(processIdentityState(identity, () => identity), 'same');
	assert.equal(processIdentityState(identity, () => undefined), 'gone');
	for (const replacement of [{ ...identity, startedAt: 'boot:11' }, { ...identity, commandLine: 'unrelated' }, { ...identity, pid: 124 }]) {
		assert.equal(sameProcess(identity, replacement), false);
		assert.equal(processIdentityState(identity, () => replacement), 'replaced');
		assert.equal(signalVerifiedProcess(identity, 'SIGKILL', () => replacement, kill), false);
	}
	assert.equal(signalVerifiedProcess(identity, 'SIGKILL', () => undefined, kill), false);
	assert.throws(() => signalVerifiedProcess(identity, 'SIGKILL', () => { throw new Error('identity unreadable'); }, kill), /unreadable/);
	assert.deepEqual(signalled, []);
	assert.equal(signalVerifiedProcess(identity, 'SIGKILL', () => identity, kill), true);
	assert.deepEqual(signalled, [123]);
	assert.equal(signalVerifiedProcess(identity, 'SIGKILL', () => identity, () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }), false);
	assert.throws(() => signalVerifiedProcess(identity, 'SIGKILL', () => identity, () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); }), /denied/);
	assert.throws(() => requireProcessIdentity(123, () => undefined), /exited/);
	assert.throws(() => readProcessIdentity(0), /invalid/);
});

test('real disposable child identity stays stable and becomes gone after verified termination', { skip: process.platform === 'win32', timeout: 5000 }, async () => {
	const child = spawn(process.execPath, ['-e', "process.stdout.write('ready'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'pipe', 'ignore'] });
	try {
		await once(child.stdout!, 'data');
		const captured = requireProcessIdentity(child.pid!);
		assert.equal(captured.pid, child.pid);
		assert.equal(processIdentityState(captured), 'same');
		const exited = once(child, 'exit');
		assert.equal(signalVerifiedProcess(captured, 'SIGKILL'), true);
		await exited;
		assert.equal(readProcessIdentity(captured.pid), undefined);
	} finally { child.kill('SIGKILL'); }
});
