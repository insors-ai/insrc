/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tracker artifact types — Phase F.
 *
 * The tracker workflows (`tracker.push`, `tracker.sync`,
 * `tracker.post`) are coarse handoffs: the LLM does the actual `gh`
 * calls and returns a structured summary. The artifact captures
 * that summary + the verification verdict for audit.
 *
 * Unlike define / design artifacts, tracker artifacts do NOT live
 * inside the repo — they belong to the run log at
 * `~/.insrc/workflow-runs/<slug>/tracker-<workflow>-<runId>.md`.
 * The user-facing side effect is mutation of the target artifact's
 * `meta.tracker` field, which the finalizer handles separately.
 */

import type { ArtifactMetaBase, WorkflowName } from '../types.js';

// ---------------------------------------------------------------------------
// LLM return shape — push
// ---------------------------------------------------------------------------

export interface TrackerPushRefs {
	readonly epicRef:       string;                                    // `owner/repo#N`
	readonly storyRefs:     Readonly<Record<string, string>>;          // storyId → ref
	readonly milestoneRef?: string;                                    // optional; only when useMilestones=true
	readonly labelsCreated: readonly string[];
}

export interface TrackerSyncRefs {
	readonly storyStatus: Readonly<Record<string, 'open' | 'in-progress' | 'blocked' | 'closed'>>;
	readonly epicStatus:  'open' | 'in-progress' | 'blocked' | 'closed';
	readonly syncedAt:    string;
}

export interface TrackerPostRefs {
	readonly targetKind:    'hld' | 'lld' | 'amendment';
	readonly targetIssue:   string;                                    // issue ref
	readonly commentId:     string;
	readonly commentUrl?:   string;
}

// ---------------------------------------------------------------------------
// Checklist result
// ---------------------------------------------------------------------------

export interface TrackerChecklistResult {
	readonly items: readonly {
		readonly itemId:  string;
		readonly verdict: 'passed' | 'failed';
		readonly notes?:  string;
	}[];
	readonly failedCount: number;
}

// ---------------------------------------------------------------------------
// Run report
// ---------------------------------------------------------------------------

export interface TrackerRunBody {
	readonly workflow:      'tracker.push' | 'tracker.sync' | 'tracker.post';
	readonly epicSlug:      string;
	readonly ghOwner:       string;
	readonly ghRepo:        string;
	readonly refs:          TrackerPushRefs | TrackerSyncRefs | TrackerPostRefs;
	readonly checklist:     TrackerChecklistResult;
	readonly notes?:        string;
}

export interface TrackerArtifact {
	readonly meta: ArtifactMetaBase & { readonly epicSlug: string };
	readonly body: TrackerRunBody;
	readonly citations: readonly [];
}

export const TRACKER_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export function renderTrackerMarkdown(a: TrackerArtifact): string {
	const { body } = a;
	const lines: string[] = [];
	lines.push(`# Tracker run: ${body.workflow}`);
	lines.push('');
	lines.push(`**Epic:** \`${body.epicSlug}\``);
	lines.push(`**Target:** \`${body.ghOwner}/${body.ghRepo}\``);
	lines.push(`**Run:** \`${a.meta.runId}\` at ${a.meta.createdAt}`);
	lines.push('');
	if (body.workflow === 'tracker.push') {
		const refs = body.refs as TrackerPushRefs;
		lines.push('## Refs');
		lines.push('');
		lines.push(`- **Epic issue:** \`${refs.epicRef}\``);
		for (const [storyId, ref] of Object.entries(refs.storyRefs)) {
			lines.push(`- **${storyId}:** \`${ref}\``);
		}
		if (refs.milestoneRef !== undefined) {
			lines.push(`- **Milestone:** \`${refs.milestoneRef}\``);
		}
		if (refs.labelsCreated.length > 0) {
			lines.push('');
			lines.push(`**Labels created:** ${refs.labelsCreated.map(l => `\`${l}\``).join(', ')}`);
		}
	} else if (body.workflow === 'tracker.sync') {
		const refs = body.refs as TrackerSyncRefs;
		lines.push('## Status');
		lines.push('');
		lines.push(`**Epic:** ${refs.epicStatus}`);
		for (const [storyId, status] of Object.entries(refs.storyStatus)) {
			lines.push(`- **${storyId}:** ${status}`);
		}
		lines.push('');
		lines.push(`**Synced at:** ${refs.syncedAt}`);
	} else {
		const refs = body.refs as TrackerPostRefs;
		lines.push('## Comment posted');
		lines.push('');
		lines.push(`- **On:** \`${refs.targetIssue}\` (${refs.targetKind})`);
		lines.push(`- **Comment id:** \`${refs.commentId}\``);
		if (refs.commentUrl !== undefined) {
			lines.push(`- **URL:** ${refs.commentUrl}`);
		}
	}
	lines.push('');
	lines.push('## Checklist');
	lines.push('');
	if (body.checklist.failedCount === 0) {
		lines.push(`All ${body.checklist.items.length} items passed.`);
	} else {
		lines.push(`${body.checklist.failedCount} of ${body.checklist.items.length} items FAILED.`);
		lines.push('');
		for (const it of body.checklist.items.filter(i => i.verdict === 'failed')) {
			lines.push(`- **${it.itemId}:** ${it.notes ?? ''}`);
		}
	}
	if (body.notes !== undefined && body.notes.length > 0) {
		lines.push('');
		lines.push('## Notes');
		lines.push('');
		lines.push(body.notes);
	}
	return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

export function isTrackerPushRefs(v: unknown): v is TrackerPushRefs {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['epicRef'] !== 'string') return false;
	if (typeof r['storyRefs'] !== 'object' || r['storyRefs'] === null) return false;
	if (!Array.isArray(r['labelsCreated'])) return false;
	return true;
}

export function isTrackerSyncRefs(v: unknown): v is TrackerSyncRefs {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['storyStatus'] !== 'object' || r['storyStatus'] === null) return false;
	if (typeof r['epicStatus']  !== 'string') return false;
	if (typeof r['syncedAt']    !== 'string') return false;
	return true;
}

export function isTrackerPostRefs(v: unknown): v is TrackerPostRefs {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['targetKind']  !== 'string') return false;
	if (typeof r['targetIssue'] !== 'string') return false;
	if (typeof r['commentId']   !== 'string') return false;
	return true;
}

export function isTrackerChecklistResult(v: unknown): v is TrackerChecklistResult {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (!Array.isArray(r['items'])) return false;
	if (typeof r['failedCount'] !== 'number') return false;
	return true;
}

// Kept as a silence for the WorkflowName import — surfaced for
// callers that want the discriminator string.
export type TrackerWorkflowName = Extract<WorkflowName, 'tracker.push' | 'tracker.sync' | 'tracker.post'>;
