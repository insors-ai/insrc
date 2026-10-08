/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The workflow's OWN files for a Story: the files the build flow itself writes
 * while a Story is built, which are its ledger and not the Story's work
 * (LLD-9b4a74dc-S001, task t5).
 *
 * A build record's change log is derived from the working tree when anything
 * in it is dirty, and these files usually ARE the only dirty paths when the
 * record is written. Left in, they would become the Story's whole change log.
 * The change log has two writers (the validate turn and the completion
 * record); each used to list these files by hand. They take the list from
 * here, so that a file added to it is left out by both.
 */

import { buildStartRelPath } from './range-base.js';
import { buildRecordPathsFor, type BuildRecord } from './standalone-record.js';
import { testRecordPaths } from './test-record.js';

/**
 * The paths to leave out of the change log of the Story `rec` belongs to: the
 * build record's json and md, the test record's json and md, and the Story's
 * build-start file. `rec` is the build record about to be written (its paths
 * are derived through the same merge the write uses).
 */
export function storyWorkflowFiles(repoPath: string, rec: BuildRecord): readonly string[] {
	const own = buildRecordPathsFor(repoPath, rec);
	const { epicHash, storyId } = rec.meta;
	const out: string[] = [own.json, own.md];
	try {
		const tests = testRecordPaths(repoPath, epicHash, storyId, { now: rec.meta.createdAt, standalone: rec.meta.standalone });
		out.push(tests.json, tests.md);
	} catch {
		// An identity the path scheme cannot place has no test record to leave out.
	}
	out.push(buildStartRelPath(epicHash, storyId));
	return out;
}
