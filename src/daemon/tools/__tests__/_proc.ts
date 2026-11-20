/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Helpers for the process-lifecycle tests (not a test file). POSIX only. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeOwnedProcessDisposal } from '../../../shared/process-group.js';
import type { ProcessDisposal } from '../../../shared/process-group.js';
import type { StopTarget } from '../../../shared/daemon-process-client.js';
import { participantContext } from '../../../../scripts/test-harness/context.mjs';

const owned = new WeakMap<ChildProcess, { disposal: () => ProcessDisposal; marker: string | undefined }>();
/** Register retained fixture handles; an unconfirmed disposal retains its run marker. */
export function ownChild<T extends ChildProcess>(child: T): T {
	if (owned.has(child)) return child;
	const disposal = observeOwnedProcessDisposal(child);
	let marker: string | undefined;
	if (process.env['INSRC_TEST_RUN_ID']) {
		const context = participantContext();
		const actors = join(context.workspace, 'actors'); mkdirSync(actors, { recursive: true });
		marker = join(actors, `${randomUUID()}.fixture.json`);
		writeFileSync(marker, JSON.stringify({ runId: context.runId, kind: 'fixture', pid: child.pid ?? null }));
	}
	const state = { disposal, marker }; owned.set(child, state);
	child.once('close', () => { if (state.marker && disposal().state === 'confirmed') { try { unlinkSync(state.marker); state.marker = undefined; } catch { /* Preserve unconfirmed marker state for teardown. */ } } });
	return child;
}

export async function stopOwnedChildren(children: ChildProcess[]): Promise<void> {
	const failures: Error[] = [];
	for (const child of [...children]) {
		const state = owned.get(child);
		if (!state) { failures.push(new Error('Fixture child was not registered at spawn.')); continue; }
		try {
			if (state.disposal().state !== 'confirmed' && child.exitCode === null && child.signalCode === null) {
				if (child.pid === undefined || !Number.isInteger(child.pid) || child.pid <= 0) throw new Error('Fixture never acquired a process handle.');
				child.kill('SIGKILL');
			}
			if (!await waitFor(() => state.disposal().state === 'confirmed')) throw new Error('Fixture disposal remains unconfirmed.');
			if (state.marker) { unlinkSync(state.marker); state.marker = undefined; }
			children.splice(children.indexOf(child), 1);
		} catch (error) { failures.push(error as Error); }
	}
	if (failures.length) throw new AggregateError(failures, 'Owned fixture cleanup failed.');
}

export async function stopOwnedTargets(targets: StopTarget[]): Promise<void> {
	const failures: Error[] = [];
	for (const target of [...targets]) {
		try {
			await target.handle.terminate();
			const end = performance.now() + 3000;
			let exited = await target.handle.hasExited();
			while (!exited && performance.now() < end) { await tick(20); exited = await target.handle.hasExited(); }
			if (!exited) throw new Error('Captured fixture disposal remains unconfirmed.');
			await target.handle.close();
			targets.splice(targets.indexOf(target), 1);
		} catch (error) { failures.push(error as Error); }
	}
	if (failures.length) throw new AggregateError(failures, 'Captured fixture cleanup failed.');
}

export function childLine(child: ChildProcess, ms = 3000): Promise<string> {
	return new Promise((resolve, reject) => {
		let text = '';
		const finish = (error?: Error) => { clearTimeout(timer); child.stdout?.off('data', data); child.off('error', failed); child.off('exit', exited); error ? reject(error) : resolve(text); };
		const data = (value: Buffer) => { text += value.toString(); if (text.includes('\n') || text === 'ready') finish(); };
		const failed = (error: Error) => finish(error);
		const exited = () => finish(new Error('Fixture exited before readiness.'));
		const timer = setTimeout(() => finish(new Error('Fixture readiness deadline expired.')), ms);
		child.stdout?.on('data', data); child.once('error', failed); child.once('exit', exited);
	});
}

/** Start the behavioral abort clock only once the actual stand-in has started. */
export async function runUntilAbort<T>(start: (signal: AbortSignal) => Promise<T>, ready: () => boolean, delayMs: number): Promise<{ result: T; elapsedMs: number }> {
	const controller = new AbortController();
	let settled = false;
	const pending = start(controller.signal);
	void pending.then(() => { settled = true; }, () => { settled = true; });
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		if (!await waitFor(() => ready() || settled) || !ready()) throw new Error('Fixture did not reach readiness before command settlement.');
		const started = performance.now(); timer = setTimeout(() => controller.abort(), delayMs);
		return { result: await pending, elapsedMs: performance.now() - started };
	} finally {
		clearTimeout(timer); controller.abort();
		if (!await waitFor(() => settled)) throw new Error('Fixture command cleanup remains unconfirmed.');
		await pending.catch(() => {});
	}
}

/** Detached stand-ins self-report lifetime and end when their test worker dies. */
export function fixtureOwnerScript(workspace?: string): string {
	const directory = workspace ? join(workspace, 'actors') : process.env['INSRC_TEST_RUN_ID'] ? join(participantContext().workspace, 'actors') : undefined;
	return `(() => {
 const f = require('node:fs'), owner = ${process.pid}; let marker;
 if (process.ppid !== owner && ${JSON.stringify(directory) ?? 'undefined'}) {
  const directory = ${JSON.stringify(directory) ?? 'undefined'}; f.mkdirSync(directory, {recursive:true});
  marker = require('node:path').join(directory, require('node:crypto').randomUUID()+'.detached-fixture.json');
  f.writeFileSync(marker, JSON.stringify({kind:'detached-fixture',pid:process.pid}));
  process.on('exit', () => f.rmSync(marker,{force:true}));
 }
 setInterval(() => { try { process.kill(owner,0); } catch { process.exit(0); } },100);
})();`;
}

export function tmp(): string { return mkdtempSync(join(tmpdir(), 'insrc-proc-')); }
export function cleanup(dir: string): void { rmSync(dir, { recursive: true, force: true }); }

export function alive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}
export async function waitFor(fn: () => boolean, ms = 3000): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 20)); }
	return fn();
}
export function readPid(file: string): number {
	return Number(readFileSync(file, 'utf8').trim());
}
export const fileExists = existsSync;
export const tick = (ms = 100): Promise<void> => new Promise(r => setTimeout(r, ms));

/** sh script: a background descendant in the same process group that holds the output pipes open; its pid goes to pidFile. */
export const groupDescendant = (pidFile: string): string => `sleep 30 & echo \$! > '${pidFile}'; wait`;
/** sh script: a descendant that leaves the process group (setsid) and still holds the pipes; its pid goes to pidFile. */
export const escapedDescendant = (pidFile: string): string => `setsid sleep 30 & echo \$! > '${pidFile}'; wait`;
