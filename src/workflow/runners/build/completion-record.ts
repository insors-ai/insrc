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

import { storyWorkflowFiles } from './own-files.js';
import { persistBuildRecord, type BuildRecord } from './standalone-record.js';
import { resolveStoryRangeBase } from './range-base.js';
import { inheritedStoryStandalone } from '../../storage.js';
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
		// S001/t4 — the placement, INHERITED from the work item's definition artifact.
		//
		// Previously this wrote no `standalone` key at all, for a reason that was
		// sound at the time: the hook runs on EVERY build approval, plan-driven and
		// standalone alike, so it could not know which route it was serving, and
		// writing `false` flipped a standalone record at completion time — relocating
		// its BUILD.md from docs/standalone/ to docs/epics/ and orphaning the
		// original. That constraint is what S001/t1's definition-artifact accessor
		// removes: the route is now READABLE from the work item itself.
		//
		// The prohibition still stands and is the reason for the `=== true` guard:
		// only an explicit TRUE is written, never a false. An unreadable definition
		// artifact therefore still omits the key, so mergeWithPrior keeps carrying a
		// prior true forward and the old relocation bug cannot return.
		// ISSUE-0855311b — widened from the head alone to the head OR the Story's
		// LLD: a triage-routed Small story has no definition head at all.
		const standaloneFlag = inheritedStoryStandalone(repoPath, ref.epicHash, ref.storyId);
		const base: BuildRecord = {
			meta: {
				workflow: 'build', epicHash: ref.epicHash, storyId: ref.storyId, createdAt: now, updatedAt: now,
				...(standaloneFlag === true ? { standalone: true } : {}),
			},
			body: { tasks: [] },
		};
		// EXCLUDE the workflow's own files for this Story (the build record's json and
		// md, the test record's, and the build-start file), from the one list the
		// validate writer also uses: at completion time they are typically the only
		// dirty paths, so without this the record reports that the Story changed its
		// own ledger entries.
		const exclude = storyWorkflowFiles(repoPath, base);
		// Same resolver the validate writer uses, so the two can never disagree
		// about this Story's base. See range-base.ts for the precedence and for why
		// an unresolvable base yields empty rather than a substituted range.
		const rangeBase = resolveStoryRangeBase(repoPath, ref.epicHash, ref.storyId);
		const ctx = {
			author: 'insrc-build', timestamp: now, exclude,
			...(rangeBase !== undefined ? { base: rangeBase } : {}),
		};
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
