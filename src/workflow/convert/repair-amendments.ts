/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repair of flat amendment records on a repository of any schema version. The full conversion does nothing at schema version 2,
 * so an amendment written flat after the conversion stays unreadable; this converts such a record to a head and then gives every
 * amendment head that lacks a lifecycle or carries legacy fields its lifecycle, with the approval time and approver it already has.
 *
 * It lives in its own module because apply.ts builds its rule list from amendments.ts when it loads: amendments.ts importing
 * apply.ts would read `amendmentRule` before it is initialised.
 */

import { join } from 'node:path';

import { ARTIFACTS_DIR, writeAtomic } from '../storage.js';
import { convertAll } from './amendments.js';
import { migrateHeads } from './apply.js';
import { readRawHeads } from './raw-heads.js';
import type { ConversionDeps, ConversionProblem } from './types.js';

export interface FlatAmendmentRepair {
	/** Ids of the flat amendments written as heads in this call. */
	readonly converted: string[];
	/** The flat amendments that could not be converted; they are left as they are. */
	readonly problems: ConversionProblem[];
}

export async function repairFlatAmendments(repo: string, deps: ConversionDeps): Promise<FlatAmendmentRepair> {
	const { converted, problems } = convertAll(readRawHeads(repo).heads);
	for (const { id, head } of converted) writeAtomic(join(repo, ARTIFACTS_DIR, `${id}.json`), JSON.stringify(head, null, 2) + '\n');
	// every amendment head, not only the ones converted just now: a head converted by an earlier call that stopped before the
	// migration is found by what it lacks
	const amendments = new Set(readRawHeads(repo).heads.filter(h => h.artifactId.startsWith('AMD-')).map(h => h.artifactId));
	await migrateHeads(repo, deps, undefined, amendments);
	return { converted: converted.map(c => c.id), problems };
}
