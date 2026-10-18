/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Which stage unit does approving this artifact change, and may the actor change it?
 * (sc4, action approve-local.) A Define or HLD belongs to the Epic, an LLD or plan to
 * its Story, and a BUILD record to the Tasks of its Story: a Story-wide BUILD is
 * authorized against every Task claim of the Story (or the Story when it has no Tasks)
 * and refused naming the first one held by someone else. Artifacts that are not a claim
 * unit (an issue, a spec, a record) are not guarded.
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

import type { UnitRef } from '../tracker/refs.js';
import { artifactJsonPath, planArtifactId } from '../storage.js';
import { parseBuildArtifactRef } from '../gates.js';
import { claimsEnforcedFor, teamGate, type RefusedOutcome } from './gate.js';

export interface ApprovalRefusal {
	readonly outcome: RefusedOutcome;
	/** What was refused, for the message: for example "task t2". */
	readonly subject: string | undefined;
}

interface Meta { workflow?: string; repoPath?: string; epicHash?: string; storyId?: string; standalone?: boolean }

const EPIC_WORKFLOWS: ReadonlySet<string> = new Set(['define', 'design.epic']);
const STORY_WORKFLOWS: ReadonlySet<string> = new Set(['design.story', 'plan']);

function readMeta(jsonPath: string): Meta | undefined {
	try {
		const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: Meta }).meta;
		return typeof meta === 'object' && meta !== null ? meta : undefined;
	} catch { return undefined; }
}

/** The Story's Task ids from its plan artifact, in plan order; empty when there is no plan or no Tasks. */
function taskIdsOf(repoPath: string, epicHash: string, storyId: string): string[] {
	try {
		const path = artifactJsonPath(repoPath, planArtifactId(epicHash, storyId));
		if (!existsSync(path)) return [];
		const tasks = (JSON.parse(readFileSync(path, 'utf8')) as { body?: { tasks?: Array<{ id?: unknown; order?: unknown }> } }).body?.tasks;
		return Array.isArray(tasks)
			? [...tasks].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)).map(t => t.id).filter((id): id is string => typeof id === 'string')
			: [];
	} catch { return []; }
}

/** The refusal for approving this artifact, or undefined when it may be approved (or is not guarded). Never throws. */
export function authorizeApproval(jsonPath: string, metaOverride?: Meta): ApprovalRefusal | undefined {
	try {
		const meta = metaOverride ?? readMeta(jsonPath);
		const isBuild = basename(jsonPath).startsWith('BUILD-') || meta?.workflow === 'build';
		const workflow = meta?.workflow;
		if (!isBuild && (workflow === undefined || !(EPIC_WORKFLOWS.has(workflow) || STORY_WORKFLOWS.has(workflow)))) return undefined;   // not a claim unit

		// Artifacts live at <repo>/.insrc/artifacts/<id>.json, so the repo can be recovered when the meta lacks it
		const repoPath = typeof meta?.repoPath === 'string' ? meta.repoPath : dirname(dirname(dirname(jsonPath)));
		// A BUILD record that does not exist yet has no meta: its epic and story are in its file name
		const fromName = isBuild ? parseBuildArtifactRef(jsonPath) : undefined;
		const epicHash = meta?.epicHash ?? fromName?.epicHash;
		const storyId = meta?.storyId ?? fromName?.storyId;
		if (typeof epicHash !== 'string' || (!EPIC_WORKFLOWS.has(workflow ?? '') && typeof storyId !== 'string')) {
			// The stage cannot be told: only a repo that enforces claims (or whose policy cannot be read) refuses
			const enforced = claimsEnforcedFor(repoPath);
			if (enforced === 'no') return undefined;
			return { outcome: { kind: 'refused', reason: enforced === 'yes' ? 'cannot tell which stage this approval is for (the artifact has no epic or story)' : enforced }, subject: undefined };
		}
		const epic: UnitRef = { unit: 'epic', repoPath, epicHash };
		if (!isBuild && EPIC_WORKFLOWS.has(workflow ?? '')) return check(repoPath, epic, undefined);
		const story: UnitRef = { unit: 'story', repoPath, epicHash, storyId: storyId as string };
		if (!isBuild) return check(repoPath, story, undefined);

		// BUILD: the Story's Tasks, or the Story itself when it has none (a standalone BUILD is such a Story)
		const taskIds = meta?.standalone === true ? [] : taskIdsOf(repoPath, epicHash, storyId as string);
		if (taskIds.length === 0) return check(repoPath, story, undefined);
		for (const taskId of taskIds) {
			const refusal = check(repoPath, { unit: 'task', repoPath, epicHash, storyId: storyId as string, taskId }, `task ${taskId}`);
			if (refusal !== undefined) return refusal;
		}
		return undefined;
	} catch (err) {
		return { outcome: { kind: 'refused', reason: `cannot authorize this approval: ${err instanceof Error ? err.message : String(err)}` }, subject: undefined };
	}
}

function check(repo: string, unit: UnitRef, subject: string | undefined): ApprovalRefusal | undefined {
	const o = teamGate(repo, unit, 'approve-local');
	return o.kind === 'allowed' ? undefined : { outcome: o, subject };
}
