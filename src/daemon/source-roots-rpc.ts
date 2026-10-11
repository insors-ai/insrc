/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `repo.entitiesForSourceRoots` (Epic c2ba6fa6, Story s4): the read-only
 * request through which a review that runs OUTSIDE the daemon (the CLI's)
 * learns a repository's source roots. Only the daemon may open the store, so
 * that review cannot read the index itself.
 *
 * Returns the repository's `file` entities, which is all that
 * `resolveSourceRoots` reads. Nothing is capped: a root is found by counting
 * every indexed file.
 */

import { getDb } from '../db/client.js';
import { listEntitiesForRepo } from '../db/entities.js';
import type { Entity } from '../shared/types.js';

export const METHOD_ENTITIES_FOR_SOURCE_ROOTS = 'repo.entitiesForSourceRoots';

export type EntitiesForSourceRootsReply = Entity[] | { error: string };

export async function entitiesForSourceRoots(
	params: unknown,
	read: (repoPath: string) => Promise<readonly Entity[]> = async repoPath => listEntitiesForRepo(await getDb(), repoPath),
): Promise<EntitiesForSourceRootsReply> {
	const { repoPath } = (params ?? {}) as { repoPath?: unknown };
	if (typeof repoPath !== 'string' || repoPath.length === 0) {
		return { error: `${METHOD_ENTITIES_FOR_SOURCE_ROOTS}: repoPath (a non-empty string) is required` };
	}
	const entities = await read(repoPath);
	return entities.filter(e => e.kind === 'file');
}
