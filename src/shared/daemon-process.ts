/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Diagnostic observation only: never a capability authorizing process termination. */
export interface ProcessIdentity {
	readonly pid: number;
	readonly startedAt: string;
	readonly commandLine: string;
}

export type ProcessIdentityReader = (pid: number) => ProcessIdentity | undefined;

/** Parse the Linux start tick without splitting a process name containing spaces or parentheses. */
export function linuxProcessStart(stat: string): { startedAt: string; zombie: boolean } {
	const end = stat.lastIndexOf(')');
	if (end < 0) throw new Error('unreadable Linux process stat');
	const fields = stat.slice(end + 1).trim().split(/\s+/);
	const ticks = fields[19]; // field 22; the first field after the command is field 3.
	if (ticks === undefined || !/^\d+$/.test(ticks)) throw new Error('unreadable Linux process start marker');
	return { startedAt: ticks, zombie: fields[0] === 'Z' || fields[0] === 'X' };
}

export function sameProcess(a: ProcessIdentity, b: ProcessIdentity): boolean {
	return a.pid === b.pid && a.startedAt === b.startedAt && a.commandLine === b.commandLine;
}

export function darwinProcessIdentity(pid: number, output: string): ProcessIdentity | undefined {
	const match = /^(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(\S+)\s+(.+)$/.exec(output.trim());
	if (match === null) throw new Error(`cannot verify process ${pid} start marker`);
	if (match[2]!.startsWith('Z')) return undefined;
	return { pid, startedAt: `darwin:${match[1]!.replace(/\s+/g, ' ')}`, commandLine: match[3]! };
}

/** Undefined means positively absent/exited; an unreadable identity throws and never permits a kill. */
export function readProcessIdentity(pid: number): ProcessIdentity | undefined {
	if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('invalid process id');
	if (process.platform === 'linux') {
		try {
			const first = linuxProcessStart(readFileSync(`/proc/${pid}/stat`, 'utf8'));
			if (first.zombie) return undefined;
			const boot = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
			const commandLine = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ');
			const last = linuxProcessStart(readFileSync(`/proc/${pid}/stat`, 'utf8'));
			if (last.zombie) return undefined;
			if (boot === '' || commandLine === '' || first.startedAt !== last.startedAt) throw new Error(`process ${pid} changed during identity capture`);
			return { pid, startedAt: `linux:${boot}:${first.startedAt}`, commandLine };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				// A missing boot-id/cmdline is not evidence that a still-present PID exited.
				try { readFileSync(`/proc/${pid}/stat`, 'utf8'); }
				catch (probe) { if ((probe as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw probe; }
			}
			throw error;
		}
	}
	if (process.platform === 'darwin') {
		// Read start, state and command in one ps observation. No PID-only fallback.
		try {
			return darwinProcessIdentity(pid, execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'lstart=,stat=,command='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }));
		} catch (error) {
			try { process.kill(pid, 0); }
			catch (probe) { if ((probe as NodeJS.ErrnoException).code === 'ESRCH') return undefined; }
			throw error;
		}
	}
	throw new Error(`process identity is unsupported on ${process.platform}; refusing PID-only signalling`);
}

export function requireProcessIdentity(pid: number, read: ProcessIdentityReader = readProcessIdentity): ProcessIdentity {
	const identity = read(pid);
	if (identity === undefined) throw new Error(`process ${pid} has exited`);
	return identity;
}

export function processIdentityState(target: ProcessIdentity, read: ProcessIdentityReader = readProcessIdentity): 'same' | 'gone' | 'replaced' {
	const current = read(target.pid);
	return current === undefined ? 'gone' : sameProcess(target, current) ? 'same' : 'replaced';
}

