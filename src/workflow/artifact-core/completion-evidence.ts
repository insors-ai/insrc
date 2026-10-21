/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The default CompletionEvidence (sc4, owned by s3): what the records say about a Task's build and a Story's code review.
 * It only reads. The Task side reads the latest build round on the Task's own log; the BUILD record's per-task results are read
 * only for a Task that has no head (a Story planned before s7, until s9 gives it Task heads).
 */

import { existsSync, readFileSync } from 'node:fs';

import { ArtifactIds } from '../artifact-ids.js';
import { enforceCodeReviewGate } from '../code-review/gate.js';
import { History } from './history.js';
import { createFileSidecarStore } from './sidecar-store.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId } from '../storage.js';
import type { CodeReviewEvidence, CompletionEvidence } from './lifecycle.js';

export interface CompletionEvidenceOptions {
	/** The override reason the approval carries; it wins over one stored on the records. */
	readonly overrideReview?: string | undefined;
	/** Overrides the `codeReview.enforce` flag, as for the gate itself. */
	readonly enforce?: boolean | undefined;
}

function readJson(path: string): Record<string, unknown> | undefined {
	try {
		if (!existsSync(path)) return undefined;
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
	} catch { return undefined; }
}

const asRecord = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined);

/** meta.reviewOverride.reason of a record, when it is a non-empty string. */
function storedOverride(head: Record<string, unknown> | undefined): string | undefined {
	const reason = asRecord(asRecord(head?.['meta'])?.['reviewOverride'])?.['reason'];
	return typeof reason === 'string' && reason.trim().length > 0 ? reason : undefined;
}

/** A build round carries the `build-round` marker of the Task set on its outcome data. */
const isRound = (data: unknown): boolean => asRecord(data)?.['kind'] === 'build-round';

export function createCompletionEvidence(repoPath: string, options: CompletionEvidenceOptions = {}): CompletionEvidence {
	return {
		async taskBuildPassed(taskId: string): Promise<boolean> {
			const key = ArtifactIds.parse(taskId);
			if (key?.kind !== 'TASK' || key.story === undefined || key.task === undefined) return false;
			if (existsSync(artifactJsonPath(repoPath, taskId))) {
				const rounds = (await new History(createFileSidecarStore(repoPath)).log(taskId)).filter(e => isRound(e.outcome?.data));
				return rounds.at(-1)?.outcome?.result === 'pass';
			}
			const build = readJson(artifactJsonPath(repoPath, buildArtifactId(key.epicHash, key.story)));
			const tasks = asRecord(build?.['body'])?.['tasks'];
			if (!Array.isArray(tasks)) return false;
			const task = tasks.map(asRecord).find(t => t?.['id'] === key.task || t?.['id'] === taskId);
			return task?.['passed'] === true;
		},

		async storyCodeReview(epicHash: string, storyId: string): Promise<CodeReviewEvidence> {
			const explicit = options.overrideReview !== undefined && options.overrideReview.trim().length > 0 ? options.overrideReview : undefined;
			const stored = storedOverride(readJson(artifactJsonPath(repoPath, codeReviewArtifactId(epicHash, storyId))))
				?? storedOverride(readJson(artifactJsonPath(repoPath, buildArtifactId(epicHash, storyId))));
			const reason = explicit ?? stored;
			const result = enforceCodeReviewGate(repoPath, epicHash, storyId, {
				...(reason !== undefined ? { overrideReview: reason } : {}),
				...(options.enforce !== undefined ? { enforce: options.enforce } : {}),
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
	};
}
