/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { constants } from 'node:fs';
import { open, readdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

export type LegacyDrain = 'graceful' | 'broker-denied' | 'unknown';
const MAX_TAIL = 128 * 1024;
const MAX_LOGS = 32;

/** Trust only explicit terminal messages from the target PID in the observed request window. */
export function classifyLegacyDrain(lines: readonly string[], pid: number, requestedAt: number, exitedAt: number): LegacyDrain {
	let graceful = false;
	let denied = false;
	for (const line of lines) {
		let event: Record<string, unknown>;
		try {
			const parsed: unknown = JSON.parse(line);
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
			event = parsed as Record<string, unknown>;
		} catch { continue; }
		const time = typeof event['time'] === 'number' ? event['time'] : Date.parse(String(event['time']));
		if (event['pid'] !== pid || !Number.isFinite(time) || time < requestedAt || time > exitedAt) continue;
		if (event['module'] === 'shutdown-watchdog' && event['stage'] === 'watchdog capture'
			&& event['reason'] === 'broker capture failed: process capability broker refused: denied (errno 1)') denied = true;
		// The daemon writes bye after successfully draining the queue, closing the stores and clearing the owned files.
		if (event['module'] === 'daemon' && event['msg'] === 'bye') graceful = true;
	}
	if (graceful === denied) return 'unknown';
	return graceful ? 'graceful' : 'broker-denied';
}

interface LogCursor { readonly file: string; readonly inode: bigint; readonly device: bigint; readonly size: bigint }

export async function captureLegacyDrainLogs(log: string): Promise<LogCursor[]> {
	const path = dirname(log);
	const entries = await readdir(path).catch(() => []);
	const files = entries.filter(name => name === basename(log) || /^daemon\.\d+\.log$/.test(name));
	const cursors: LogCursor[] = [];
	for (const name of files.slice(0, MAX_LOGS)) {
		const file = join(path, name);
		const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined);
		if (handle === undefined) continue;
		try {
			const stat = await handle.stat({ bigint: true });
			if (stat.isFile() && stat.uid === BigInt(process.getuid?.() ?? -1)) {
				cursors.push({ file, inode: stat.ino, device: stat.dev, size: stat.size });
			}
		} finally { await handle.close(); }
	}
	return cursors;
}

export async function readLegacyDrainLogs(cursors: readonly LogCursor[]): Promise<string[]> {
	const lines: string[] = [];
	for (const cursor of cursors) {
		const handle = await open(cursor.file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => undefined);
		if (handle === undefined) continue;
		try {
			const stat = await handle.stat({ bigint: true });
			if (stat.ino !== cursor.inode || stat.dev !== cursor.device || stat.size <= cursor.size) continue;
			const length = Number(stat.size - cursor.size);
			if (!Number.isSafeInteger(length) || length > MAX_TAIL || cursor.size > BigInt(Number.MAX_SAFE_INTEGER)) continue;
			const bytes = Buffer.alloc(length);
			const { bytesRead } = await handle.read(bytes, 0, length, Number(cursor.size));
			lines.push(...bytes.subarray(0, bytesRead).toString('utf8').split('\n'));
		} catch { /* Missing diagnostics leave the authenticated exit unclassified. */ }
		finally { await handle.close().catch(() => {}); }
	}
	return lines;
}
