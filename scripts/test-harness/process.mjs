import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, mkdirSync, openSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { harnessError, participantContext } from './context.mjs';

/** A fixture retains its handle; a marker survives abrupt fixture death. */
export function registerChild(child, context = participantContext()) {
	const actors = join(context.workspace, 'actors');
	mkdirSync(actors, { recursive: true, mode: 0o700 });
	const marker = join(actors, `${randomUUID()}.json`);
	writeFileSync(marker, JSON.stringify({ runId: context.runId, kind: 'child', pid: child.pid ?? null }), { flag: 'wx', mode: 0o600 });
	child.once('close', () => { try { unlinkSync(marker); } catch { /* A surviving marker prevents confirmed release. */ } });
	return child;
}

export function actorsClosed(run) {
	try { return readdirSync(join(run.workspace, 'actors')).length === 0; }
	catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

export function processScope(run) {
	const children = new Set();
	const sent = new WeakMap();
	const cancellationErrors = [];
	const evidenceErrors = [];
	let stopped = false;
	let notifyStop;
	const stopEvent = new Promise(resolve => { notifyStop = resolve; });
	function cancel(child, signal) {
		if (child.exitCode !== null || child.signalCode !== null) return;
		const signals = sent.get(child) ?? new Set();
		if (signals.has(signal)) return;
		signals.add(signal); sent.set(child, signals);
		try {
			// This group was created by this retained ChildProcess, never discovered.
			if (process.platform === 'win32') child.kill(signal);
			else process.kill(-child.pid, signal);
		} catch (error) { if (error.code !== 'ESRCH') cancellationErrors.push({ signal, code: error.code }); }
	}
	async function start(command, args, { cwd = run.root, env = run.environment(), budgetMs = run.budgets.fileMs, stdout, stderr, logPath } = {}) {
		if (stopped) throw harnessError('interrupted', 'Harness admission stopped.');
		run.assertOwner();
		const childId = randomUUID();
		const log = logPath ?? join(run.workspace, `child-${childId}.log`);
		const fd = stdout === undefined && stderr === undefined ? openSync(log, 'wx', 0o600) : undefined;
		const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', stdout ?? fd, stderr ?? fd] });
		registerChild(child, run);
		const entry = { child, childId, ended: undefined };
		children.add(entry);
		let timedOut = false, launchError;
		let timer;
		const timeout = new Promise(accept => { timer = setTimeout(() => { timedOut = true; cancel(child, 'SIGTERM'); accept({ code: null, signal: null, timedOut: true }); }, budgetMs); });
		entry.ended = new Promise(accept => {
			child.once('error', error => { launchError = error.message; });
			child.once('close', (code, signal) => {
				clearTimeout(timer);
				if (fd !== undefined) closeSync(fd);
				try { appendFileSync(join(run.workspace, 'child-results.jsonl'), JSON.stringify({ childId, log, code, signal, timedOut, launchError: launchError ?? null, closedAt: new Date().toISOString() }) + '\n'); }
				catch (error) { evidenceErrors.push(error.code); }
				children.delete(entry);
				accept({ code, signal, timedOut, ...(launchError ? { launchError } : {}) });
			});
		});
		// Deadline returns immediately; the owning finally drains within one ceiling.
		const result = await Promise.race([entry.ended, timeout, stopEvent.then(() => ({ code: null, signal: null, interrupted: true }))]);
		clearTimeout(timer);
		return { childId, log, closeJournal: join(run.workspace, 'child-results.jsonl'), ...result };
	}
	async function drain() {
		stopped = true;
		for (const { child } of children) cancel(child, 'SIGTERM');
		let timer;
		await Promise.race([Promise.all([...children].map(entry => entry.ended)), new Promise(resolve => { timer = setTimeout(resolve, run.budgets.cleanupMs / 2); })]);
		clearTimeout(timer);
		for (const { child } of children) cancel(child, 'SIGKILL');
		await Promise.race([Promise.all([...children].map(entry => entry.ended)), new Promise(resolve => { timer = setTimeout(resolve, run.budgets.cleanupMs / 2); })]);
		clearTimeout(timer);
		const closed = children.size === 0 && actorsClosed(run) && cancellationErrors.length === 0 && evidenceErrors.length === 0;
		if (!closed) {
			// Do not wait forever on inherited pipes. The lease remains blocked;
			// detaching these observers does not assert descendant disposal.
			for (const { child } of children) { child.unref(); child.stdout?.destroy(); child.stderr?.destroy(); }
		}
		return closed;
	}
	return { start, drain, stop: () => { if (stopped) return; stopped = true; notifyStop(); for (const { child } of children) cancel(child, 'SIGTERM'); }, get stopped() { return stopped; }, get cancellationErrors() { return [...cancellationErrors]; }, get evidenceErrors() { return [...evidenceErrors]; } };
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
			writeFileSync(join(run.workspace, 'cleanup.json'), JSON.stringify({ confirmedClosed: closed, interrupted, cancellationErrors: scope.cancellationErrors, evidenceErrors: scope.evidenceErrors, childCloseJournal: 'child-results.jsonl' }) + '\n');
			run.release({ confirmedClosed: closed });
		} catch (cause) { error ??= cause; }
		process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
	}
	if (error && (!interrupted || error.code === 'harness-cleanup-unconfirmed')) throw error;
	if (interrupted) throw harnessError('interrupted', 'Interrupted/deadline: validation is incomplete.');
	return result;
}
