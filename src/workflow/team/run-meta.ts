/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * What a run records about itself when it is created (sc4 handoff, Story s6): the acting user and the
 * upstream revisions it started from. A handoff needs both: the owner says whose run it is, and the
 * snapshot says whether a parked run's step outputs still match the artifacts the new owner has.
 */

import { existsSync, readFileSync } from 'node:fs';

import { getEffectiveHash } from '../amendments/effective.js';
import { readBaseHld } from '../gates.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, readRevision } from '../storage.js';
import { actingUser, claimsEnforcedFor } from './gate.js';

/** An upstream artifact and the revision a run read from it. */
export interface UpstreamRevision {
	readonly artifactId: string;
	readonly revision:   number;
}

/** The owner and upstream snapshot stored beside a run. */
export interface RunEntryMeta {
	readonly owner?:    string | undefined;
	readonly upstream?: readonly UpstreamRevision[] | undefined;
}

/** The revision of a stored artifact: 0 when it is missing, unreadable or has none. */
function revisionOf(repoPath: string, artifactId: string): number {
	try {
		const path = artifactJsonPath(repoPath, artifactId);
		return existsSync(path) ? readRevision(JSON.parse(readFileSync(path, 'utf8'))) : 0;
	} catch { return 0; }
}

/**
 * The artifacts a workflow reads, each with the revision in force now. design.epic reads the Define;
 * design.story the Define and the effective HLD; plan the Story LLD, the effective HLD and the Define. The
 * effective HLD is the base plus its approved amendments, so it is keyed by the effective hash: an approved
 * amendment changes the entry's id and the snapshots stop matching. A missing artifact (a standalone Story
 * has no Define or HLD) is listed with revision 0; this never throws.
 */
export function snapshotUpstream(repoPath: string, workflow: string, params: Record<string, unknown>): readonly UpstreamRevision[] {
	const epicHash = params['epicHash'];
	if (typeof epicHash !== 'string' || epicHash.length === 0) return [];
	const storyId = params['storyId'];
	const out: UpstreamRevision[] = [];
	const add = (artifactId: string): void => { out.push({ artifactId, revision: revisionOf(repoPath, artifactId) }); };

	const effectiveHld = (): void => {
		const base = hldArtifactId(epicHash);
		let id = base;
		try { id = `${base}@${getEffectiveHash(repoPath, epicHash, readBaseHld(repoPath, epicHash))}`; } catch { /* no HLD: the plain id with revision 0 */ }
		out.push({ artifactId: id, revision: revisionOf(repoPath, base) });
	};

	if (workflow === 'design.epic') add(defineArtifactId(epicHash));
	else if (workflow === 'design.story') { add(defineArtifactId(epicHash)); effectiveHld(); }
	else if (workflow === 'plan' && typeof storyId === 'string' && storyId.length > 0) {
		add(lldArtifactId(epicHash, storyId));
		effectiveHld();
		add(defineArtifactId(epicHash));
	}
	return out;
}

/**
 * The meta to store with a new run: the acting user and the upstream snapshot, only for a repo that enforces
 * claims (a repo without a team policy records neither and makes no tracker call).
 */
export async function runMetaFor(repoPath: string, workflow: string, params: Record<string, unknown>): Promise<RunEntryMeta | undefined> {
	if (await claimsEnforcedFor(repoPath) !== 'yes') return undefined;
	return { owner: await actingUser(repoPath), upstream: snapshotUpstream(repoPath, workflow, params) };
}
