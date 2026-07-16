/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tracker ref + meta helpers — pure, dependency-light (node:fs only).
 *
 * Kept free of artifact-type imports so the markdown renderers
 * (`artifacts/{hld,lld,define}.ts`) can import `trackerRefLine` without
 * an import cycle through `conventions.ts`.
 *
 * The canonical on-disk location for tracker refs is `meta.tracker`
 * (nested) — the chain report and the coarse-handoff runners already
 * read there; the deterministic auto-push now writes there too, so both
 * paths agree.
 */

import { readFileSync } from 'node:fs';

import { writeAtomic } from '../storage.js';

/** Nested tracker block stored on an artifact's `meta.tracker`. */
export interface TrackerMeta {
	readonly adapter?:       'github';
	readonly epicRef?:       string;                        // on HLD / Define
	readonly storyRef?:      string;                        // on LLD
	readonly storyRefs?:     Readonly<Record<string, string>>;  // aggregate on the Epic (batch push)
	readonly taskRefs?:      Readonly<Record<string, string>>;  // on the Plan: taskId → ref (sub-issues of the Story)
	readonly milestoneRef?:  string;
	readonly labelsCreated?: readonly string[];
	readonly epicStatus?:    string;
	readonly storyStatus?:   Readonly<Record<string, string>>;
	readonly pushedAt?:      string;
	readonly lastSyncedAt?:  string;
}

export interface ParsedRef {
	readonly owner:  string;
	readonly repo:   string;
	readonly number: string;
}

/** Parse an `owner/repo#N` ref. Throws on a malformed ref. */
export function parseIssueRef(ref: string): ParsedRef {
	const hash = ref.indexOf('#');
	if (hash < 0) throw new Error(`invalid issue ref: '${ref}' (expected owner/repo#N)`);
	const number = ref.slice(hash + 1);
	const slash  = ref.indexOf('/');
	if (slash < 0 || slash > hash) throw new Error(`invalid issue ref: '${ref}' (expected owner/repo#N)`);
	return { owner: ref.slice(0, slash), repo: ref.slice(slash + 1, hash), number };
}

export function buildRef(owner: string, repo: string, number: string | number): string {
	return `${owner}/${repo}#${number}`;
}

/** Just the issue number (`owner/repo#42` → `42`). */
export function issueNumber(ref: string): string {
	return parseIssueRef(ref).number;
}

export function issueUrl(ref: string): string {
	const { owner, repo, number } = parseIssueRef(ref);
	return `https://github.com/${owner}/${repo}/issues/${number}`;
}

/** The `**Tracker:** [owner/repo#N](url)` line embedded in a design
 *  doc's markdown once its issue exists. */
export function trackerRefLine(ref: string): string {
	const { owner, repo, number } = parseIssueRef(ref);
	return `**Tracker:** [${owner}/${repo}#${number}](https://github.com/${owner}/${repo}/issues/${number})`;
}

/** Read an artifact JSON's `meta.tracker` (or undefined). */
export function readTrackerMeta(jsonPath: string): TrackerMeta | undefined {
	try {
		const parsed = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: { tracker?: TrackerMeta } };
		return parsed.meta?.tracker;
	} catch {
		return undefined;
	}
}

/** Merge `patch` into an artifact JSON's `meta.tracker`, atomically.
 *  Returns the merged tracker block. */
export function patchTrackerMeta(jsonPath: string, patch: Readonly<Partial<TrackerMeta>>): TrackerMeta {
	const artifact = JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: Record<string, unknown> };
	if (typeof artifact.meta !== 'object' || artifact.meta === null) {
		throw new Error(`artifact at ${jsonPath} has no meta`);
	}
	const prior = (artifact.meta['tracker'] as TrackerMeta | undefined) ?? {};
	const next: TrackerMeta = { adapter: 'github', ...prior, ...patch };
	artifact.meta['tracker'] = next;
	writeAtomic(jsonPath, JSON.stringify(artifact, null, 2) + '\n');
	return next;
}
