/**
 * Hot-backup orchestrator (Phase 7.1 of
 * plans/storage-migration-lmdb-lance.md).
 *
 * Snapshots both substrates while the daemon is still serving:
 *
 *   LMDB  -- single-file copy via `root.backup()` (mdb_env_copy2). The
 *            backup runs under a snapshot read txn, so writers keep
 *            going and the copy reflects state at backup-start.
 *
 *   Lance -- recursive directory copy. Lance writes are versioned and
 *            commit a manifest last, so cp-while-open captures either
 *            the pre-write or post-write state per table; we never
 *            see a torn write. Worst case is that a write
 *            committing mid-backup lands in some tables but not
 *            others -- the next manifest read on restore will resolve
 *            to a coherent (older) version, so backup integrity is
 *            preserved.
 *
 * Output layout under `<targetDir>/`:
 *   graph.lmdb           single LMDB env file
 *   graph.lmdb-lock      LMDB lock file (created on first restore-side
 *                        open; copy is best-effort)
 *   lance/               full Lance store directory tree
 */

import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';

import { getLogger } from '../shared/logger.js';
import { backupGraphStore } from '../db/graph/store.js';
import { getLanceConnPath } from '../db/lance/conn.js';

const log = getLogger('backup');

export interface BackupResult {
	readonly targetDir:    string;
	readonly lmdbBytes:    number;
	readonly lanceBytes:   number;
	readonly elapsedMs:    number;
}

/**
 * Snapshot the LMDB env + Lance directory into `targetDir` while the
 * daemon stays running. Throws on any failure.
 *
 * The target directory is created if it doesn't exist. If it already
 * contains a previous backup, files are overwritten.
 */
export async function backupAll(targetDir: string): Promise<BackupResult> {
	const t0 = Date.now();
	if (!existsSync(targetDir)) {
		mkdirSync(targetDir, { recursive: true });
	}

	// 1. LMDB snapshot. lmdb-js's root.backup runs the copy under a
	//    snapshot read txn so concurrent writes don't tear the file.
	//    The underlying mdb_env_copy2 requires the target to not
	//    exist -- pre-clear it so re-runs over the same target dir
	//    overwrite idempotently. The matching lock-file (if any) is
	//    also removed; LMDB recreates it on first restore-side open.
	const lmdbTarget = join(targetDir, 'graph.lmdb');
	if (existsSync(lmdbTarget))            rmSync(lmdbTarget,            { force: true });
	const lmdbLock = `${lmdbTarget}-lock`;
	if (existsSync(lmdbLock))              rmSync(lmdbLock,              { force: true });
	await backupGraphStore(lmdbTarget, { compact: false });
	const lmdbBytes = existsSync(lmdbTarget) ? statSync(lmdbTarget).size : 0;
	log.info({ target: lmdbTarget, bytes: lmdbBytes }, 'lmdb snapshot done');

	// 2. Lance directory copy. The store is a tree of versioned data
	//    files + manifests; recursive copy is safe (see header
	//    comment for atomicity reasoning). Skip if the source dir
	//    doesn't exist (fresh-install daemon with nothing embedded
	//    yet) -- nothing to back up but the LMDB side still succeeds.
	const lanceSource = getLanceConnPath();
	const lanceTarget = join(targetDir, 'lance');
	let lanceBytes = 0;
	if (existsSync(lanceSource)) {
		await cp(lanceSource, lanceTarget, { recursive: true, force: true });
		lanceBytes = directorySize(lanceTarget);
		log.info({ target: lanceTarget, bytes: lanceBytes }, 'lance snapshot done');
	} else {
		log.info({ source: lanceSource }, 'lance source missing; skipping (fresh daemon)');
	}

	const elapsedMs = Date.now() - t0;
	log.info({ targetDir, lmdbBytes, lanceBytes, elapsedMs }, 'backup complete');
	return { targetDir, lmdbBytes, lanceBytes, elapsedMs };
}

/** Recursive directory size in bytes. */
function directorySize(dir: string): number {
	if (!existsSync(dir)) return 0;
	let total = 0;
	const stack: string[] = [dir];
	while (stack.length > 0) {
		const cur = stack.pop()!;
		const st = statSync(cur);
		if (st.isFile()) {
			total += st.size;
		} else if (st.isDirectory()) {
			for (const name of readdirSync(cur)) stack.push(join(cur, name));
		}
	}
	return total;
}
