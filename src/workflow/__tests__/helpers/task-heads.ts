/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TEST HELPER — the Task artifacts the approval of a plan makes. A Task's issue is recorded on its Task artifact, so a test that
 * ensures or resolves a Task's issue gives the Story the Task heads its plan rows became: row `rowIds[i]` becomes
 * `TASK-<epicHash>-<storyId>-t<i+1>`, a draft with a valid Task body that carries `planTaskId`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { artifactJsonPath } from '../../storage.js';
import { bindArtifact } from '../../tracker/binding.js';
import { draftMeta } from '../lifecycle-fixtures.js';

export function seedTaskHeads(repo: string, epicHash: string, storyId: string, rowIds: readonly string[] = ['t1'], createdAt = '2026-07-17T07:42:28.275Z'): string[] {
	const ids: string[] = [];
	rowIds.forEach((rowId, i) => {
		const id = `TASK-${epicHash}-${storyId}-t${i + 1}`;
		const path = artifactJsonPath(repo, id);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify({
			meta: { workflow: 'plan', epicHash, storyId, createdAt, epicCreatedAt: createdAt, ...draftMeta() },
			body: { title: `Task ${rowId}`, summary: `Does ${rowId}.`, size: 'S', order: i + 1, acceptanceChecks: ['it holds'], tests: [], planTaskId: rowId }, citations: [],
		}, null, 2) + '\n');
		ids.push(id);
	});
	return ids;
}

/** {@link seedTaskHeads} for one row, with its issue bound on the Task artifact (where a Task's issue is recorded). */
export function seedBoundTaskHead(repo: string, epicHash: string, storyId: string, rowId: string, issue: string, createdAt?: string): string {
	const [id] = seedTaskHeads(repo, epicHash, storyId, [rowId], createdAt);
	const bound = bindArtifact(repo, id!, issue);
	if (!bound.ok) throw new Error(`seedBoundTaskHead: ${bound.reason}`);
	return id!;
}
