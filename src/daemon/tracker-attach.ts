/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's side of attaching documents to a unit's issue (s6): the `tracker.attach` method, and the follow-on that a BUILD
 * approval fires to attach the Story's build, review and test records. Neither commits anything: a file git reports dirty or
 * untracked is reported with its reason and attached by a later call once it is committed.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { FollowOnOutcome, WorkflowApproveResult } from '../workflow/gates.js';
import { openTracker } from '../workflow/tracker-auto.js';
import { attachUnit } from '../workflow/tracker/attach-unit.js';
import type { AttachScope, AttachUnitResult } from '../workflow/tracker/attach-unit.js';
import type { UnitRef } from '../workflow/tracker/refs.js';
import { repoSchemaRefusal } from './repo-schema-guard.js';

export interface TrackerAttachParams {
	readonly repo?: string;
	readonly epicHash?: string;
	readonly unit?: 'epic' | 'story';
	readonly storyId?: string;
	readonly scope?: AttachScope;
}

/** `tracker.attach`: attach the unit's committed files to its issue; `{ error }` when nothing could be attempted. */
export async function handleTrackerAttach(params: unknown, repoEnv: string | undefined): Promise<AttachUnitResult> {
	const p = (params ?? {}) as TrackerAttachParams;
	const repoPath = p.repo !== undefined && p.repo.length > 0 ? p.repo : repoEnv;
	if (repoPath === undefined || repoPath.length === 0) return { error: 'repo is required (or set INSRC_REPO)' };
	const refusal = repoSchemaRefusal(repoPath);
	if (refusal !== undefined) return { error: refusal };
	if (typeof p.epicHash !== 'string' || p.epicHash.length === 0) return { error: 'epicHash is required' };
	const unit = p.unit ?? (p.storyId !== undefined ? 'story' : 'epic');
	if (unit === 'story' && (typeof p.storyId !== 'string' || p.storyId.length === 0)) return { error: 'storyId is required for a story unit' };
	const scope: AttachScope = p.scope ?? 'all';
	if (scope !== 'documents' && scope !== 'records' && scope !== 'all') return { error: `unknown scope ${String(scope)}` };
	const gate = await openTracker(repoPath);
	if ('skip' in gate) return { error: `no GitHub tracker to attach to: ${gate.skip.status === 'skipped' || gate.skip.status === 'failed' ? gate.skip.reason : gate.skip.status}` };
	const ref: UnitRef = { unit, repoPath, epicHash: p.epicHash, ...(p.storyId !== undefined ? { storyId: p.storyId } : {}) };
	return await attachUnit(ref, scope, gate.port);
}

/** The follow-on of a BUILD approval: attach the Story's build, review and test records that git reports clean. */
export async function followOnTrackerAttach(approved: WorkflowApproveResult['approved'], repoPath: string): Promise<FollowOnOutcome[]> {
	const out: FollowOnOutcome[] = [];
	for (const { path } of approved) {
		if (!basename(path).startsWith('BUILD-') || !path.endsWith('.json')) continue;
		let meta: { epicHash?: unknown; storyId?: unknown };
		try { meta = (JSON.parse(readFileSync(path, 'utf8')) as { meta?: typeof meta }).meta ?? {}; } catch { continue; }
		if (typeof meta.epicHash !== 'string' || typeof meta.storyId !== 'string') continue;
		const r = await handleTrackerAttach({ repo: repoPath, epicHash: meta.epicHash, unit: 'story', storyId: meta.storyId, scope: 'records' }, undefined);
		if ('error' in r) { out.push({ kind: 'tracker-attach', artifactPath: path, ok: false, note: r.error }); continue; }
		out.push({
			kind: 'tracker-attach', artifactPath: path, ok: r.failed.length === 0,
			...(r.failed.length > 0 ? { note: r.failed.map(f => `${f.target}: ${f.reason}`).join('; ') } : {}),
			attach: r,
		});
	}
	return out;
}
