import { isAbsolute, resolve } from 'node:path';
import { rpc } from '../client.js';
import type { DaemonStatus } from '../../shared/types.js';

export interface BackupResult {
	readonly targetDir:  string;
	readonly lmdbBytes:  number;
	readonly lanceBytes: number;
	readonly elapsedMs:  number;
}

export interface CompactResult {
	readonly beforeBytes: number;
	readonly afterBytes:  number;
	readonly savedBytes:  number;
	readonly elapsedMs:   number;
}


export function getStatus(): Promise<DaemonStatus> { return rpc<DaemonStatus>('daemon.status'); }

/** Snapshot LMDB + Lance into `path` (resolved against cwd). */
export function backup(path: string): Promise<BackupResult> {
	const target = isAbsolute(path) ? path : resolve(process.cwd(), path);
	return rpc<BackupResult>('daemon.backup', { path: target });
}

/** Reclaim freed LMDB pages. Daemon must be idle. */
export function compact(): Promise<CompactResult> {
	return rpc<CompactResult>('daemon.compact');
}
