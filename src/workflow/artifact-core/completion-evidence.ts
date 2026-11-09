/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The default CompletionEvidence (sc4, owned by s3): what the records say about a Task's build and a Story's code review.
 * It only reads. The Task side reads the latest build round on the Task's own log: a Task with no head has no round, so its build has not passed.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { ArtifactIds } from '../artifact-ids.js';
import { enforceCodeReviewGate } from '../code-review/gate.js';
import { approvalOverrideReasonOf, approvalStateOf } from './approval-view.js';
import { History } from './history.js';
import { createFileSidecarStore } from './sidecar-store.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId, defineArtifactId, planArtifactId } from '../storage.js';
import type { CodeReviewEvidence, CompletionEvidence, StoryTasks } from './lifecycle.js';

export interface CompletionEvidenceOptions {
	/** The override reason the approval carries; it wins over one stored on the records. */
	readonly overrideReview?: string | undefined;
	/** Where a Task's build rounds are read from; the repository's own history files by default. */
	readonly history?: Pick<History, 'log'> | undefined;
}

function readJson(path: string): Record<string, unknown> | undefined {
	try {
		if (!existsSync(path)) return undefined;
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
	} catch { return undefined; }
}

const asRecord = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined);

/** The reason the record was approved over a blocking review (lifecycle.approval.override), when it carries one. */
function storedOverride(head: Record<string, unknown> | undefined): string | undefined {
	return approvalOverrideReasonOf(head?.['meta']);
}

/** A build round carries the `build-round` marker of the Task set on its outcome data. */
const isRound = (data: unknown): boolean => asRecord(data)?.['kind'] === 'build-round';

/** A TASK head's ids as a Story's TASKS head lists them (t1, t2, ...), written as artifact ids. */
const taskIdsOf = (epicHash: string, storyId: string, listed: unknown): string[] =>
	(Array.isArray(listed) ? listed : []).filter((t): t is string => typeof t === 'string').map(task => ArtifactIds.make({ kind: 'TASK', epicHash, story: storyId, task }));

/** The Story's TASK heads, found by their ids because a head names its Story in its id. */
function childTaskIds(repoPath: string, epicHash: string, storyId: string): string[] {
	const dir = dirname(artifactJsonPath(repoPath, buildArtifactId(epicHash, storyId)));
	if (!existsSync(dir)) return [];
	return readdirSync(dir).filter(n => n.endsWith('.json')).map(n => n.slice(0, -'.json'.length)).filter(id => {
		const key = ArtifactIds.parse(id);
		return key?.kind === 'TASK' && key.epicHash === epicHash && key.story === storyId;
	}).sort();
}

/** The current revision of a head, read as at least 1 as the plan reader does. */
function revisionOf(meta: unknown): number {
	const revision = asRecord(asRecord(asRecord(meta)?.['lifecycle'])?.['revision'])?.['number'];
	return Math.max(1, typeof revision === 'number' ? revision : 0);
}

export function createCompletionEvidence(repoPath: string, options: CompletionEvidenceOptions = {}): CompletionEvidence {
	return {
		async taskBuildPassed(taskId: string): Promise<boolean> {
			const key = ArtifactIds.parse(taskId);
			if (key?.kind !== 'TASK' || key.story === undefined || key.task === undefined) return false;
			// the Task's own head holds its rounds: a Task with no head has none, so its build has not passed
			if (!existsSync(artifactJsonPath(repoPath, taskId))) return false;
			const rounds = (await (options.history ?? new History(createFileSidecarStore(repoPath))).log(taskId)).filter(e => isRound(e.outcome?.data));
			return rounds.at(-1)?.outcome?.result === 'pass';
		},

		async storyCodeReview(epicHash: string, storyId: string): Promise<CodeReviewEvidence> {
			const explicit = options.overrideReview !== undefined && options.overrideReview.trim().length > 0 ? options.overrideReview : undefined;
			const stored = storedOverride(readJson(artifactJsonPath(repoPath, codeReviewArtifactId(epicHash, storyId))))
				?? storedOverride(readJson(artifactJsonPath(repoPath, buildArtifactId(epicHash, storyId))));
			const reason = explicit ?? stored;
			const result = enforceCodeReviewGate(repoPath, epicHash, storyId, {
				...(reason !== undefined ? { overrideReview: reason } : {}),
			});
			switch (result.status) {
				case 'no-review': return { kind: 'missing' };
				case 'pass': return { kind: 'clean' };
				case 'warn':
					// A warn that is a demoted block (enforcement off) is not a clean review: it needs an override to complete.
					if (result.advisory !== true) return { kind: 'clean' };
					return reason !== undefined ? { kind: 'overridden', overrideReason: reason } : { kind: 'blocked' };
				case 'overridden': return { kind: 'overridden', overrideReason: result.overrideReason };
				case 'blocked': return { kind: 'blocked' };
			}
		},

		async storyBuildApproved(epicHash: string, storyId: string): Promise<boolean> {
			return approvalStateOf(readJson(artifactJsonPath(repoPath, buildArtifactId(epicHash, storyId)))?.['meta']) === 'approved';
		},

		async storyApprovalOverride(epicHash: string, storyId: string): Promise<string | undefined> {
			return storedOverride(readJson(artifactJsonPath(repoPath, buildArtifactId(epicHash, storyId))));
		},

		async declaredStories(epicHash: string): Promise<readonly string[]> {
			const stories = asRecord(readJson(artifactJsonPath(repoPath, defineArtifactId(epicHash)))?.['body'])?.['stories'];
			return (Array.isArray(stories) ? stories : []).map(s => asRecord(s)?.['id']).filter((id): id is string => typeof id === 'string').map(id => `s${Number(/\d+/.exec(id)?.[0] ?? '0')}`);
		},

		async storyTasks(epicHash: string, storyId: string): Promise<StoryTasks> {
			const tasks = readJson(artifactJsonPath(repoPath, ArtifactIds.make({ kind: 'TASKS', epicHash, story: storyId })));
			const body = asRecord(tasks?.['body']);
			const listed = taskIdsOf(epicHash, storyId, body?.['taskIds']);
			const plan = readJson(artifactJsonPath(repoPath, planArtifactId(epicHash, storyId)));
			// The TASKS head is written last and names the plan revision it finished, so anything less can be a part-way set.
			if (approvalStateOf(plan?.['meta']) === 'approved') {
				return listed.length > 0 && body?.['planRevision'] === revisionOf(plan?.['meta']) ? { kind: 'listed', taskIds: listed } : { kind: 'not-created' };
			}
			if (listed.length > 0) return { kind: 'listed', taskIds: listed };
			const children = childTaskIds(repoPath, epicHash, storyId);
			return children.length > 0 ? { kind: 'listed', taskIds: children } : { kind: 'none-required' };
		},
	};
}
