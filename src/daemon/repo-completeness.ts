/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t12 — the completeness the daemon's repo.list, repo.stats
 * and daemon.status replies carry beside each repository's unchanged status.
 * A read that fails leaves the field out (a consumer reads that as unknown);
 * it never fails the reply.
 */

import { completenessOf, readIndexState, readUnattributedUnwritable } from '../db/index-state.js';
import { getLogger } from '../shared/logger.js';
import type { RepoCompleteness, UnattributedUnwritableCount } from '../shared/types.js';

const log = getLogger('repo-completeness');

/** A repository's completeness, or undefined when its state cannot be read. */
export async function completenessFor(repoPath: string): Promise<RepoCompleteness | undefined> {
	try {
		return completenessOf(await readIndexState(repoPath));
	} catch (err) {
		log.debug({ repo: repoPath, err: (err as Error).message }, 'completeness read failed; field left out');
		return undefined;
	}
}

/** Each row with its completeness beside it; serial, one state read per row. */
export async function withCompleteness<T extends object>(rows: readonly T[], pathOf: (row: T) => string): Promise<(T & { completeness?: RepoCompleteness })[]> {
	const out: (T & { completeness?: RepoCompleteness })[] = [];
	for (const row of rows) {
		const completeness = await completenessFor(pathOf(row));
		out.push(completeness === undefined ? { ...row } : { ...row, completeness });
	}
	return out;
}

/** The daemon-wide unattributed count, or undefined when it cannot be read. */
export async function unattributedUnwritable(): Promise<UnattributedUnwritableCount | undefined> {
	try {
		return await readUnattributedUnwritable();
	} catch (err) {
		log.debug({ err: (err as Error).message }, 'unattributed unwritable read failed; field left out');
		return undefined;
	}
}
