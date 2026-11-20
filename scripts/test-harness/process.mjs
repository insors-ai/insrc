import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { harnessError, participantContext } from './context.mjs';

/** A fixture retains its handle; a marker survives abrupt fixture death. */
export function registerChild(child, context = participantContext()) {
	const actors = join(context.workspace, 'actors');
	mkdirSync(actors, { recursive: true, mode: 0o700 });
	const marker = join(actors, `${randomUUID()}.json`);
	writeFileSync(marker, JSON.stringify({ runId: context.runId, kind: 'child', pid: child.pid ?? null }), { flag: 'wx', mode: 0o600 });
	child.once('close', () => { unlinkSync(marker); });
	return child;
}

export function actorsClosed(run) {
	try { return readdirSync(join(run.workspace, 'actors')).length === 0; }
	catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

export function processScope(run) {
	const children = new Set();
	let stopped = false;
	let notifyStop;
	const stopEvent = new Promise(resolve => { notifyStop = resolve; });
	function cancel(child, signal) {
		if (child.exitCode !== null || child.signalCode !== null) return;
		try {
			// This group was created by this retained ChildProcess, never discovered.
			if (process.platform === 'win32') child.kill(signal);
			else process.kill(-child.pid, signal);
		} catch (error) { if (error.code !== 'ESRCH') throw error; }
	}
	async function start(command, args, { cwd = run.root, env = run.environment(), budgetMs = run.budgets.fileMs, stdout, stderr } = {}) {
		if (stopped) throw harnessError('interrupted', 'Harness admission stopped.');
		run.assertOwner();
		const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', stdout ?? 'inherit', stderr ?? 'inherit'] });
		registerChild(child, run);
		const entry = { child, ended: undefined };
		children.add(entry);
		let timedOut = false, launchError;
		const timer = setTimeout(() => { timedOut = true; cancel(child, 'SIGTERM'); }, budgetMs);
		let killTimer;
		const scheduleKill = () => { killTimer ??= setTimeout(() => cancel(child, 'SIGKILL'), run.budgets.cleanupMs); };
		const timeoutKill = setTimeout(scheduleKill, budgetMs);
		entry.ended = new Promise(accept => {
			child.once('error', error => { launchError = error.message; });
			child.once('close', (code, signal) => {
				clearTimeout(timer); clearTimeout(timeoutKill); clearTimeout(killTimer);
				children.delete(entry);
				accept({ code, signal, timedOut, ...(launchError ? { launchError } : {}) });
			});
		});
		// Never wait indefinitely for a child whose pipes/descendants do not close.
		let ceiling;
		const result = await Promise.race([entry.ended, stopEvent.then(() => ({ code: null, signal: null, interrupted: true })), new Promise(accept => { ceiling = setTimeout(() => accept({ code: null, signal: null, timedOut: true, unconfirmed: true }), budgetMs + 2 * run.budgets.cleanupMs); })]);
		clearTimeout(ceiling);
		clearTimeout(timer); clearTimeout(timeoutKill); clearTimeout(killTimer);
		return result;
	}
	async function drain() {
		stopped = true;
		for (const { child } of children) cancel(child, 'SIGTERM');
		let timer;
		await Promise.race([Promise.all([...children].map(entry => entry.ended)), new Promise(resolve => { timer = setTimeout(resolve, run.budgets.cleanupMs); })]);
		clearTimeout(timer);
		for (const { child } of children) cancel(child, 'SIGKILL');
		await Promise.race([Promise.all([...children].map(entry => entry.ended)), new Promise(resolve => { timer = setTimeout(resolve, run.budgets.cleanupMs); })]);
		clearTimeout(timer);
		const closed = children.size === 0 && actorsClosed(run);
		if (!closed) {
			// Do not wait forever on inherited pipes. The lease remains blocked;
			// detaching these observers does not assert descendant disposal.
			for (const { child } of children) { child.unref(); child.stdout?.destroy(); child.stderr?.destroy(); }
		}
		return closed;
	}
	return { start, drain, stop: () => { stopped = true; notifyStop(); for (const { child } of children) cancel(child, 'SIGTERM'); }, get stopped() { return stopped; } };
}

export async function withRun(run, work) {
	const scope = processScope(run);
	let interrupted = false;
	const interrupt = () => { interrupted = true; scope.stop(); };
	process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
	const deadline = setTimeout(interrupt, run.budgets.runMs);
	let result, error;
	try { result = await work(scope); } catch (cause) { error = cause; }
	finally {
		clearTimeout(deadline);
		try {
			run.transition('draining');
			const closed = await scope.drain();
			run.release({ confirmedClosed: closed });
		} catch (cause) { error ??= cause; }
		process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
	}
	if (error) throw error;
	if (interrupted) throw harnessError('interrupted', 'Interrupted/deadline: validation is incomplete.');
	return result;
}
