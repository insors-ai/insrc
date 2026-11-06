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
import type { DocRelationsStatus, RepoCompleteness, UnattributedUnwritableCount } from '../shared/types.js';
import { docRelationsStatusFor } from '../indexer/doc-relations-read.js';

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

/** A repository's document-relations status (Epic c2ba6fa6 s10), or undefined when it cannot be read. */
export async function docRelationsFor(repoPath: string): Promise<DocRelationsStatus | undefined> {
	try {
		return await docRelationsStatusFor(repoPath);
	} catch (err) {
		log.debug({ repo: repoPath, err: (err as Error).message }, 'document-relations status read failed; field left out');
		return undefined;
	}
}

/**
 * Each row with its completeness and its document-relations status beside it
 * (the latter never part of completeness); serial, one read of each per row.
 */
export async function withCompleteness<T extends object>(rows: readonly T[], pathOf: (row: T) => string): Promise<(T & { completeness?: RepoCompleteness; docRelations?: DocRelationsStatus })[]> {
	const out: (T & { completeness?: RepoCompleteness; docRelations?: DocRelationsStatus })[] = [];
	for (const row of rows) {
		const completeness = await completenessFor(pathOf(row));
		const docRelations = await docRelationsFor(pathOf(row));
		out.push({ ...row, ...(completeness !== undefined ? { completeness } : {}), ...(docRelations !== undefined ? { docRelations } : {}) });
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
