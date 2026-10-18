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
import { artifactJsonPath, inheritedStoryStandalone, planArtifactId } from '../storage.js';
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

/**
 * The Story's Task ids from its plan artifact, in plan order. No plan file means no Tasks; a plan
 * that exists but cannot be read is an error, never "no Tasks" (that would skip the Task claims).
 */
function taskIdsOf(repoPath: string, epicHash: string, storyId: string): { ok: true; ids: string[] } | { ok: false; reason: string } {
	const path = artifactJsonPath(repoPath, planArtifactId(epicHash, storyId));
	if (!existsSync(path)) return { ok: true, ids: [] };
	try {
		const tasks = (JSON.parse(readFileSync(path, 'utf8')) as { body?: { tasks?: Array<{ id?: unknown; order?: unknown }> } }).body?.tasks;
		if (tasks === undefined) return { ok: true, ids: [] };
		if (!Array.isArray(tasks)) return { ok: false, reason: `the plan of Story ${storyId} has a malformed task list` };
		return { ok: true, ids: [...tasks].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)).map(t => t.id).filter((id): id is string => typeof id === 'string') };
	} catch (err) {
		return { ok: false, reason: `the plan of Story ${storyId} cannot be read: ${err instanceof Error ? err.message : String(err)}` };
	}
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
		// Standalone-ness is what the BUILD record will inherit from its upstream (the record may not exist yet)
		const standalone = meta?.standalone === true || inheritedStoryStandalone(repoPath, epicHash, storyId as string) === true;
		const tasks = standalone ? { ok: true as const, ids: [] as string[] } : taskIdsOf(repoPath, epicHash, storyId as string);
		if (!tasks.ok) {
			// Cannot tell which Tasks the Story has: refuse where claims are enforced, so a Task claim is never skipped
			const enforced = claimsEnforcedFor(repoPath);
			if (enforced === 'no') return undefined;
			return { outcome: { kind: 'refused', reason: enforced === 'yes' ? tasks.reason : enforced }, subject: undefined };
		}
		if (tasks.ids.length === 0) return check(repoPath, story, undefined);
		for (const taskId of tasks.ids) {
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
