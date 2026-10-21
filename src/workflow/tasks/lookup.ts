/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Which Task artifact a plan row became, read synchronously from the Task heads on disk. The tracker's unit bookkeeping is
 * synchronous and is keyed by the plan row id (t1, t2, ...); a Task's own id comes from the Tasks file's numbering, which can
 * differ after a re-plan, so a row is matched to its Task by the `planTaskId` the Task carries.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ARTIFACTS_DIR } from '../storage.js';

interface HeadShape {
	readonly meta?: { readonly lifecycle?: { readonly status?: unknown } } | undefined;
	readonly body?: { readonly planTaskId?: unknown } | undefined;
}

/**
 * The id of the live Task artifact (not withdrawn) of Story `storyId` that was made from plan row `rowId`, or undefined when the
 * Story has no Task for that row (it was planned before Tasks were artifacts, or its Task set is not created yet). Never throws:
 * an unreadable head is skipped.
 */
export function taskHeadIdOf(repoPath: string, epicHash: string, storyId: string, rowId: string): string | undefined {
	const dir = join(repoPath, ARTIFACTS_DIR);
	if (!existsSync(dir)) return undefined;
	const prefix = `TASK-${epicHash.toLowerCase()}-${storyId.toLowerCase()}-t`;
	const want = rowId.toLowerCase();
	let found: string | undefined;
	for (const name of readdirSync(dir)) {
		if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
		try {
			const head = JSON.parse(readFileSync(join(dir, name), 'utf8')) as HeadShape;
			if (head.meta?.lifecycle?.status === 'withdrawn') continue;
			if (typeof head.body?.planTaskId === 'string' && head.body.planTaskId.toLowerCase() === want) found = name.slice(0, -'.json'.length);
		} catch { /* an unreadable head is not a match */ }
	}
	return found;
}
