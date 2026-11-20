import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { alive, childLine, fixtureOwnerScript, ownChild, spawnFixture, runUntilAbort, stopOwnedChildren, waitFor } from './_proc.js';
import { createRun, recoverRun } from '../../../../scripts/test-harness/context.mjs';
import { withRun } from '../../../../scripts/test-harness/process.mjs';
import { observeOwnedProcessDisposal } from '../../../shared/process-group.js';

test('Failed fixture readiness reclaims socket and child before the next case', async () => {
	const root = mkdtempSync('/tmp/insrc-fixture-'), socket = join(root, 'fixture.sock');
	const children: ChildProcess[] = [];
	try {
		const failed = spawnFixture(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(socket)});`], { stdio: ['ignore', 'pipe', 'pipe'] });
		children.push(failed); ownChild(failed);
		assert.equal(await waitFor(() => existsSync(socket)), true);
		await assert.rejects(childLine(failed, 50), /readiness deadline/);
		await stopOwnedChildren(children);
		assert.notEqual(failed.signalCode, null);
		rmSync(socket, { force: true });
		const next = spawnFixture(process.execPath, ['-e', `require('node:net').createServer().listen(${JSON.stringify(socket)},()=>process.stdout.write('ready\\n'));`], { stdio: ['ignore', 'pipe', 'pipe'] });
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
			const child = spawnFixture(process.execPath, ['-e', "setTimeout(()=>process.stdout.write('ready\\n'),200);setInterval(()=>{},1000)"], { stdio: ['ignore', 'pipe', 'pipe'] });
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

test('Owned groups retain descendants with independent stdio until disposal', async () => {
	const root = mkdtempSync('/tmp/insrc-group-'), pidFile = join(root, 'descendant.pid'), children: ChildProcess[] = [];
	try {
		const descendant = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setTimeout(()=>process.exit(0),10000);`;
		const launcher = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'}).unref();const t=setInterval(()=>{if(require('node:fs').existsSync(${JSON.stringify(pidFile)})){process.stdout.write('ready');clearInterval(t);process.exit(0)}},5);`;
		const child = spawnFixture(process.execPath, ['-e', launcher], { stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
		const disposal = observeOwnedProcessDisposal(child);
		await childLine(child); await waitFor(() => child.exitCode !== null);
		const pid = Number(readFileSync(pidFile, 'utf8')); assert.equal(alive(pid), true);
		assert.equal(disposal().state, 'unknown');
		await stopOwnedChildren(children);
		assert.equal(disposal().state, 'confirmed'); assert.equal(await waitFor(() => !alive(pid)), true);
	} finally { await stopOwnedChildren(children); rmSync(root, { recursive: true, force: true }); }
});

test('An escaped descendant with independent stdio blocks release until its acknowledgment', async () => {
	const root = mkdtempSync('/tmp/insrc-escaped-'), run = createRun(root, { budgets: { cleanupMs: 100 } }), marker = join(run.workspace, 'actors/escaped.json');
	try {
		await assert.rejects(withRun(run, async scope => {
			const escaped = `const f=require('node:fs');f.writeFileSync(${JSON.stringify(marker)},'{}');process.stdout.write('ready');setTimeout(()=>{f.rmSync(${JSON.stringify(marker)});process.exit(0)},500);`;
			const launcher = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(escaped)}],{detached:true,stdio:['ignore','pipe','ignore']});c.stdout.once('data',()=>{c.stdout.destroy();c.unref()});`;
			assert.equal((await scope.start(run.runtime.executable, ['-e', launcher])).code, 0);
		}), { code: 'harness-cleanup-unconfirmed' });
		assert.equal(JSON.parse(readFileSync(join(run.active, 'run.json'), 'utf8')).phase, 'blocked');
		assert.equal(await waitFor(() => !existsSync(marker)), true);
		recoverRun(root, { runId: run.runId, confirmedActorsEnded: true });
	} finally { rmSync(root, { recursive: true, force: true }); }
});
