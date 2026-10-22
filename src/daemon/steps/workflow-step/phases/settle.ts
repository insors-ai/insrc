/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon operation `team.settle` (Story s7): read the open signoff requests of a unit now, record what the tracker says and run
 * any completion the signoff was holding. It is the on-demand way to settle a BUILD's request, which no stage start reads.
 */

import { lifecycleOfMeta } from '../../../../workflow/artifact-core/approval-view.js';
import { assertEpicHash } from '../../../../workflow/hash.js';
import { headsOfUnit, settleSignoff } from '../../../../workflow/team/signoff.js';
import { resolveRepoPath } from '../../resolve-repo.js';
import { handoffUnit } from './park.js';

export interface SettleInput { readonly repo?: string | undefined; readonly epicHash: string; readonly storyId?: string | undefined }

export interface SettledStatus { readonly artifactId: string; readonly from: string; readonly to: string }

export type SettleOutput =
	| { readonly next: 'settled'; readonly recorded: readonly SettledStatus[]; readonly statuses: Readonly<Record<string, string>>; readonly problems: readonly string[] }
	| { readonly next: 'error'; readonly error: { readonly code: string; readonly message: string; readonly retryable: boolean } };

const failure = (code: string, message: string): SettleOutput => ({ next: 'error', error: { code, message, retryable: false } });

/** The status of each stage artifact the unit holds, by id. */
function statusesOf(repo: string, input: SettleInput): Record<string, string> {
	const out: Record<string, string> = {};
	for (const head of headsOfUnit(repo, handoffUnit(repo, input.epicHash, input.storyId))) out[head.artifactId] = String(lifecycleOfMeta(head.meta)?.['status'] ?? 'unknown');
	return out;
}

export async function handleSettle(input: SettleInput): Promise<SettleOutput> {
	try {
		assertEpicHash(input.epicHash, 'team.settle: epicHash');
	} catch (err) {
		return failure('bad-input', err instanceof Error ? err.message : String(err));
	}
	const repoPath = await resolveRepoPath(input.repo);
	if (repoPath === undefined) return failure('bad-input', 'team.settle: no repo. Pass `repo` explicitly.');
	try {
		const unit = handoffUnit(repoPath, input.epicHash, input.storyId);
		const before = statusesOf(repoPath, input);
		const problems = await settleSignoff(repoPath, unit);
		const after = statusesOf(repoPath, input);
		const recorded = Object.keys(after).filter(id => before[id] !== after[id]).map(id => ({ artifactId: id, from: before[id] ?? 'none', to: after[id] ?? 'none' }));
		return { next: 'settled', recorded, statuses: after, problems };
	} catch (err) {
		return failure('settle-failed', err instanceof Error ? err.message : String(err));
	}
}
