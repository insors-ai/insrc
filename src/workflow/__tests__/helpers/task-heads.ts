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
	return rowIds.map((rowId, i) => writeTaskHead(repo, epicHash, storyId, rowId, i + 1, createdAt));
}

function writeTaskHead(repo: string, epicHash: string, storyId: string, rowId: string, number: number, createdAt: string): string {
	const id = `TASK-${epicHash}-${storyId}-t${number}`;
	const path = artifactJsonPath(repo, id);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify({
		meta: { workflow: 'plan', epicHash, storyId, createdAt, epicCreatedAt: createdAt, ...draftMeta() },
		body: { title: `Task ${rowId}`, summary: `Does ${rowId}.`, size: 'S', order: number, acceptanceChecks: ['it holds'], tests: [], planTaskId: rowId }, citations: [],
	}, null, 2) + '\n');
	return id;
}

/** {@link seedTaskHeads} for one row, with its issue bound on the Task artifact (where a Task's issue is recorded). */
export function seedBoundTaskHead(repo: string, epicHash: string, storyId: string, rowId: string, issue: string, createdAt = '2026-07-17T07:42:28.275Z', number = 1): string {
	const id = writeTaskHead(repo, epicHash, storyId, rowId, number, createdAt);
	const bound = bindArtifact(repo, id, issue);
	if (!bound.ok) throw new Error(`seedBoundTaskHead: ${bound.reason}`);
	return id;
}

/**
 * The EPIC head and the STORY heads of an Epic, as the conversion makes them (drafts with an empty body); a unit's issue is bound
 * on them. The Define must already be in the repository (its creation time anchors the heads).
 */
export function seedUnitHeads(repo: string, epicHash: string, storyIds: readonly string[] = ['s1'], createdAt = '2026-07-17T07:42:28.275Z'): void {
	const put = (id: string, meta: Record<string, unknown>, parent?: string): void => {
		const path = artifactJsonPath(repo, id);
		mkdirSync(dirname(path), { recursive: true });
		const base = draftMeta();
		const envelope = { ...(base['envelope'] as object), ...(parent !== undefined ? { parent: { entityId: parent, type: 'EPIC', relation: 'derived-from' } } : {}) };
		writeFileSync(path, JSON.stringify({ meta: { workflow: 'define', epicHash, createdAt, epicCreatedAt: createdAt, ...meta, ...base, envelope }, body: {}, citations: [] }, null, 2) + '\n');
	};
	put(`EPIC-${epicHash}`, {});
	for (const s of storyIds) put(`STORY-${epicHash}-${s}`, { storyId: s }, `EPIC-${epicHash}`);
}

/** {@link seedUnitHeads} with the Epic's issue (and each Story's) bound on its head. */
export function seedBoundUnits(repo: string, epicHash: string, epicIssue: string | undefined, storyIssues: Readonly<Record<string, string>> = {}, createdAt?: string): void {
	seedUnitHeads(repo, epicHash, Object.keys(storyIssues), createdAt);
	if (epicIssue !== undefined) bindOrThrow(repo, `EPIC-${epicHash}`, epicIssue);
	for (const [story, issue] of Object.entries(storyIssues)) bindOrThrow(repo, `STORY-${epicHash}-${story}`, issue);
}

function bindOrThrow(repo: string, id: string, issue: string): void {
	const bound = bindArtifact(repo, id, issue);
	if (!bound.ok) throw new Error(`bind ${id}: ${bound.reason}`);
}
