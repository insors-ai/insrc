/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Completion-side BUILD ledger hook.
 *
 * A plan-driven build writes its BUILD record at the validate phase
 * (src/mcp/build-step/phases/validate.ts), but a CONTROLLER-side build that
 * skips validate would otherwise complete with no BUILD ledger trace. This hook
 * — called from the approve path BEFORE the artifact is stamped — CREATE-or-MERGES
 * a `BUILD-<epicHash>-<storyId>` record from the current git changed set, reusing
 * the unchanged {@link persistBuildRecord} writer + {@link collectBuildChangeLog}
 * collector. `persistBuildRecord` is a read-merge-write UPSERT, so on a build that
 * already wrote its record this is idempotent (prior fields, incl. `approvedAt`,
 * are preserved). Every failure is swallowed — completion must never fail because
 * the ledger record could not be written.
 */

import { buildRecordPathsFor, persistBuildRecord, type BuildRecord } from './standalone-record.js';
import { collectBuildChangeLog } from './changed-files.js';
import { getLogger } from '../../../shared/logger.js';

/**
 * Ensure a BUILD ledger record exists for a completing story, mirroring the
 * validate-phase side-effect. No-ops (returns undefined) when the ref is not a
 * resolvable epic+story identity — never writes a `BUILD-undefined` path. Any
 * error (change-log or persist) is caught and swallowed; completion proceeds.
 */
export async function ensureBuildRecordOnCompletion(
	repoPath: string,
	ref: { readonly epicHash: string; readonly storyId: string },
	listChanged?: (repoPath: string) => Promise<readonly string[]>,
): Promise<{ readonly md: string; readonly json: string } | undefined> {
	if (ref.epicHash.length === 0 || ref.storyId.length === 0) return undefined;
	try {
		const now = new Date().toISOString();
		const base: BuildRecord = {
			meta: { workflow: 'build', standalone: false, epicHash: ref.epicHash, storyId: ref.storyId, createdAt: now, updatedAt: now },
			body: { tasks: [] },
		};
		// EXCLUDE the record's own json + md, for the same reason the validate writer
		// does: at completion time those two are typically the only dirty paths, so
		// without this the record reports that the Story changed its own ledger entry.
		const own = buildRecordPathsFor(repoPath, base);
		const ctx = { author: 'insrc-build', timestamp: now, exclude: [own.json, own.md] };
		const changeLog = listChanged !== undefined
			? await collectBuildChangeLog(repoPath, ctx, listChanged)
			: await collectBuildChangeLog(repoPath, ctx);
		const rec: BuildRecord = {
			...base,
			body: { ...base.body, ...(changeLog.length > 0 ? { changeLog } : {}) },
		};
		return persistBuildRecord(repoPath, rec);
	} catch (err) {
		getLogger('completion-record').warn(
			{ epicHash: ref.epicHash, storyId: ref.storyId, err: err instanceof Error ? err.message : String(err) },
			'ensureBuildRecordOnCompletion: BUILD ledger persist failed; completion proceeds',
		);
		return undefined;
	}
}
