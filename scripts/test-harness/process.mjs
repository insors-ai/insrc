import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { harnessError, participantContext, qualificationEnvironment } from './context.mjs';
const markers = new WeakMap();

/** A fixture retains its handle; a marker survives abrupt fixture death. */
export function registerChild(child, context = participantContext()) {
	const actors = join(context.workspace, 'actors');
	mkdirSync(actors, { recursive: true, mode: 0o700 });
	const marker = join(actors, `${randomUUID()}.json`);
	writeFileSync(marker, JSON.stringify({ runId: context.runId, kind: 'child', pid: child.pid ?? null }), { flag: 'wx', mode: 0o600 });
	markers.set(child, marker);
	child.once('close', () => { try { unlinkSync(marker); } catch { /* A surviving marker prevents confirmed release. */ } });
	return child;
}

export function actorsClosed(run) {
	try { return readdirSync(join(run.workspace, 'actors')).length === 0; }
	catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}

export function processScope(run, { includeForeignActors = true } = {}) {
	const children = new Set();
	const admitted = new Set();
	const requireClosure = run.environment().INSRC_BUILD_CONFIRM_CLOSURE === '1';
	const ownedMarkers = new Set();
	const sent = new WeakMap();
	// Once this retained group has been observed gone, never address its numeric
	// identity again. A closed leader alone does not release its descendants.
	const releasedGroups = new WeakSet();
	const cooperative = new WeakMap();
	const cancellationErrors = [];
	const evidenceErrors = [];
	let stopped = false;
	let notifyStop;
	const stopEvent = new Promise(resolve => { notifyStop = resolve; });
	function cancel(child, signal) {
		if (child.pid === undefined || releasedGroups.has(child)) return;
		const exited = child.exitCode !== null || child.signalCode !== null;
		if (process.platform === 'win32' && exited) return;
		const signals = sent.get(child) ?? new Set();
		if (signals.has(signal)) return;
		signals.add(signal); sent.set(child, signals);
		try {
			if (!exited && signal === 'SIGTERM' && cooperative.has(child)) { cooperative.get(child)(); return; }
			// This group was created by this retained ChildProcess, never discovered.
			if (process.platform === 'win32') child.kill(signal);
			else process.kill(-child.pid, signal);
		} catch (error) {
			if (error.code === 'ESRCH') releasedGroups.add(child);
			else cancellationErrors.push({ signal, code: error.code });
		}
	}
	function disposal(entry) {
		if (!entry.closed) return 'unknown';
		if (entry.child.pid === undefined) return 'not-started';
		if (process.platform === 'win32') return 'unknown';
		if (releasedGroups.has(entry.child)) return 'closed';
		try { process.kill(-entry.child.pid, 0); return 'held'; }
		catch (error) { if (error.code === 'ESRCH') { releasedGroups.add(entry.child); return 'closed'; } return 'unknown'; }
	}
	function confirmDisposals() {
		for (const entry of admitted) {
			if (entry.disposed) continue;
			const state = disposal(entry);
			if (!['closed', 'not-started'].includes(state)) continue;
			try {
				appendFileSync(join(run.workspace, 'child-disposals.jsonl'), JSON.stringify({ runId: run.runId, childId: entry.childId, state }) + '\n');
				entry.disposed = true;
			} catch (error) { evidenceErrors.push(error.code); }
		}
	}
	async function start(command, args, { cwd = run.root, env = run.environment(), budgetMs = run.budgets.fileMs, stdout, stderr, logPath, ownerChannel, outputLimitBytes } = {}) {
		if (stopped) throw harnessError('interrupted', 'Harness admission stopped.');
		env = qualificationEnvironment(env); // Includes custom/private-tool environments; reject before logging/spawn.
		if (outputLimitBytes !== undefined && (!Number.isSafeInteger(outputLimitBytes) || outputLimitBytes <= 0 || stdout !== undefined || stderr !== undefined)) throw harnessError('context-invalid', 'Bounded capture needs a positive byte limit and owned stdout/stderr.');
		run.assertOwner();
		const childId = randomUUID();
		const log = logPath ?? join(run.workspace, `child-${childId}.log`);
		const fd = stdout === undefined && stderr === undefined ? openSync(log, 'wx', 0o600) : undefined;
		const child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: [ownerChannel ? 'pipe' : 'ignore', outputLimitBytes ? 'pipe' : stdout ?? fd, outputLimitBytes ? 'pipe' : stderr ?? fd] });
		registerChild(child, run);
		ownedMarkers.add(markers.get(child));
		const entry = { child, childId, ended: undefined, closed: false, disposed: false };
		children.add(entry);
		if (requireClosure) {
			admitted.add(entry);
			try { appendFileSync(join(run.workspace, 'child-admissions.jsonl'), JSON.stringify({ runId: run.runId, childId }) + '\n'); }
			catch (error) { evidenceErrors.push(error.code); }
		}
		let disconnect;
		let timedOut = false, launchError;
		if (outputLimitBytes !== undefined) {
			let written = 0;
			const capture = chunk => {
				const remaining = Math.max(0, outputLimitBytes - written), take = Math.min(remaining, chunk.length);
				if (take) { try { writeSync(fd, chunk.subarray(0, take)); written += take; } catch (error) { evidenceErrors.push(error.code); cancel(child, 'SIGTERM'); } }
				if (take < chunk.length) { launchError = 'command-output-limit'; cancel(child, 'SIGTERM'); }
			};
			child.stdout.on('data', capture); child.stderr.on('data', capture);
		}
		let timer;
		const timeout = new Promise(accept => { timer = setTimeout(() => { timedOut = true; cancel(child, 'SIGTERM'); accept({ code: null, signal: null, timedOut: true }); }, budgetMs); });
		entry.ended = new Promise(accept => {
			child.once('error', error => { launchError = error.message; });
				child.once('exit', () => {
					// Dispose retained POSIX group members even when the command leader
					// exited first (including descendants holding inherited pipes).
					if (requireClosure && process.platform !== 'win32') cancel(child, 'SIGTERM');
				});
			child.once('close', (code, signal) => {
				entry.closed = true;
				try { disconnect?.(); } catch (error) { evidenceErrors.push(error.code ?? 'owner-channel-close'); }
				clearTimeout(timer);
				if (fd !== undefined) closeSync(fd);
				try { appendFileSync(join(run.workspace, 'child-results.jsonl'), JSON.stringify({ runId: run.runId, childId, log, code, signal, timedOut, launchError: launchError ?? null, closedAt: new Date().toISOString() }) + '\n'); }
				catch (error) { evidenceErrors.push(error.code); }
				children.delete(entry);
				if (requireClosure) confirmDisposals();
				accept({ code, signal, timedOut, ...(launchError ? { launchError } : {}) });
			});
		});
		if (ownerChannel) {
			child.stdin.on('error', () => { /* Peer closure is reconciled through the result/close evidence. */ });
			child.stdin.write(ownerChannel.initial);
			disconnect = ownerChannel.connect({ write: frame => { if (!child.stdin.destroyed) child.stdin.write(frame); }, end: () => child.stdin.end() });
				if (ownerChannel.cancel !== undefined) cooperative.set(child, () => {
					if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end(ownerChannel.cancel);
				});
		}
		// Deadline returns immediately; the owning finally drains within one ceiling.
		const result = await Promise.race([entry.ended, timeout, stopEvent.then(() => ({ code: null, signal: null, interrupted: true }))]);
		clearTimeout(timer);
		return { childId, log, closeJournal: join(run.workspace, 'child-results.jsonl'), ...result };
	}
	async function drain() {
		stopped = true;
		const markersClosed = () => includeForeignActors ? actorsClosed(run) : [...ownedMarkers].every(path => !existsSync(path));
		async function waitClosed(ms) {
			const end = performance.now() + ms;
			while ((children.size || !markersClosed() || (requireClosure && [...admitted].some(entry => !entry.disposed))) && performance.now() < end) {
				if (requireClosure) confirmDisposals();
				await new Promise(resolve => setTimeout(resolve, Math.min(10, Math.max(1, end - performance.now()))));
			}
		}
		for (const { child, disposed } of requireClosure ? admitted : children) if (!disposed) cancel(child, 'SIGTERM');
		await waitClosed(run.budgets.cleanupMs / 2);
		for (const { child, disposed } of requireClosure ? admitted : children) if (!disposed) cancel(child, 'SIGKILL');
		await waitClosed(run.budgets.cleanupMs / 2);
		if (requireClosure) confirmDisposals();
		const closed = children.size === 0 && markersClosed() && (!requireClosure || [...admitted].every(entry => entry.disposed)) && cancellationErrors.length === 0 && evidenceErrors.length === 0;
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
			writeFileSync(join(run.workspace, 'cleanup.json'), JSON.stringify({ confirmedClosed: closed, interrupted, cancellationErrors: scope.cancellationErrors, evidenceErrors: scope.evidenceErrors, childCloseJournal: 'child-results.jsonl', closureMode: run.environment().INSRC_BUILD_CONFIRM_CLOSURE === '1' ? 'owned-groups' : 'legacy' }) + '\n');
			run.release({ confirmedClosed: closed });
		} catch (cause) { error ??= cause; }
		process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
	}
	if (error && (!interrupted || error.code === 'harness-cleanup-unconfirmed')) throw error;
	if (interrupted) throw harnessError('interrupted', 'Interrupted/deadline: validation is incomplete.');
	return result;
}
