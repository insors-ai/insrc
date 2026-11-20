import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { childLine, fixtureOwnerScript, ownChild, runUntilAbort, stopOwnedChildren, waitFor } from './_proc.js';
import { createRun } from '../../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../../scripts/test-harness/process.mjs';

test('Failed fixture readiness reclaims socket and child before the next case', async () => {
	const root = mkdtempSync('/tmp/insrc-fixture-'), socket = join(root, 'fixture.sock');
	const children: ChildProcess[] = [];
	try {
		const failed = spawn(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(socket)});`], { stdio: ['ignore', 'pipe', 'pipe'] });
		children.push(failed); ownChild(failed);
		assert.equal(await waitFor(() => existsSync(socket)), true);
		await assert.rejects(childLine(failed, 50), /readiness deadline/);
		await stopOwnedChildren(children);
		assert.notEqual(failed.signalCode, null);
		rmSync(socket, { force: true });
		const next = spawn(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(socket)},()=>process.stdout.write('ready\\n'));`], { stdio: ['ignore', 'pipe', 'pipe'] });
		children.push(next); ownChild(next);
		assert.match(await childLine(next), /ready/);
	} finally { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); }
});

test('Ready handshake precedes behavioral cancellation deadline', async () => {
	const children: ChildProcess[] = [];
	let ready = false;
	const began = performance.now();
	try {
		const outcome = await runUntilAbort(signal => {
			const child = spawn(process.execPath, ['-e', "setTimeout(()=>process.stdout.write('ready\\n'),200);setInterval(()=>{},1000)"], { stdio: ['ignore', 'pipe', 'pipe'] });
			children.push(child); ownChild(child);
			void childLine(child).then(() => { ready = true; }, () => {});
			return new Promise<string | null>(resolve => {
				const abort = () => { child.kill('SIGTERM'); };
				signal.addEventListener('abort', abort, { once: true });
				child.once('close', (_code, endedBy) => { signal.removeEventListener('abort', abort); resolve(endedBy); });
			});
		}, () => ready, 75);
		assert.equal(outcome.result, 'SIGTERM');
		assert.ok(outcome.elapsedMs >= 70 && outcome.elapsedMs < 1000);
		assert.ok(performance.now() - began >= 270, 'startup delay precedes the short behavioral clock');
	} finally { await stopOwnedChildren(children); }
});

test('Detached fixture acknowledgments are drained before checkout release', async () => {
	const root = mkdtempSync('/tmp/insrc-fixture-drain-'), run = createRun(root);
	try {
		await withRun(run, async scope => {
			const standIn = `${fixtureOwnerScript(run.workspace)};process.stdout.write('ready');setTimeout(()=>process.exit(0),200);`;
			const launcher = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(standIn)}],{detached:true,stdio:['ignore','pipe','ignore']});c.stdout.once('data',()=>{c.stdout.destroy();c.unref()});`;
			assert.equal((await scope.start(run.runtime.executable, ['-e', launcher])).code, 0);
		});
		assert.equal(existsSync(run.active), false, 'owner waits for detached acknowledgment before releasing');
	} finally { rmSync(root, { recursive: true, force: true }); }
});

test('Unconfirmed cleanup retains handles and readiness failure cannot wait forever', { timeout: 10000 }, async () => {
	const child = ownChild(new ChildProcess()), children = [child];
	child.kill = () => { throw new Error('controlled disposal refusal'); };
	await assert.rejects(stopOwnedChildren(children), /Owned fixture cleanup failed/);
	assert.equal(children[0], child, 'an unconfirmed retained handle remains available');
	child.kill = () => false; // An unspawned control must never signal an OS process.
	child.emit('error', new Error('controlled launch failure'));
	await stopOwnedChildren(children);
	assert.equal(children.length, 0);
	const started = performance.now();
	await assert.rejects(runUntilAbort(() => new Promise<never>(() => {}), () => false, 75), /cleanup remains unconfirmed/);
	assert.ok(performance.now() - started < 8000, 'readiness and cleanup have separate bounded waits');
});
