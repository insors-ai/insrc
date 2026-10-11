/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Delivery read model — test fixtures (E1 / S001 / t3).
 *
 * Two layers:
 *   - REAL_STORE: store files copied by value from the 2026-10-07 artifact
 *     store, trimmed to the identity fields the LLD's edge cases rely on
 *     (standalone, epicCreatedAt, parentRef, storyId, body task ids). The
 *     loader tests write these values to a temporary store; nothing here
 *     reads the live .insrc/artifacts directory.
 *   - Builders: recordFromFile lifts one store file through the loader's own
 *     liftStoreFile (AMD flat, every other kind meta/body); the
 *     per-kind helpers fabricate records for the graph tests, in the style
 *     of pending.test.ts's pendingLld.
 */

import { liftStoreFile } from '../load.js';
import type { ArtifactRecord, ArtifactRecordSet, DeliveryArtifactKind, RecordLoadFailure } from '../types.js';

/** One artifact store file's parsed JSON. */
export type RawStoreFile = Readonly<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Real-shape store files (2026-10-07)
// ---------------------------------------------------------------------------

/**
 * Keyed by file name. Notable shapes:
 *   - dfc0371b: a standalone story whose LLD says 'S001' and PLAN 's001'; the
 *     LLD has no epicCreatedAt, and its BUILD says standalone false.
 *   - ISSUE-0855311b: parentRef is its own slug (corrects nothing); its BUILD's
 *     only task id is the story id 'S001'.
 *   - ISSUE-2d9e9e69: parentRef names another work item by slug.
 *   - ISSUE-57446545 / ISSUE-095906ba: parentRef carries a storyId, by slug
 *     and by bare hash respectively.
 *   - LLD-d88062a6: standalone, no ISSUE head, no epicCreatedAt.
 *   - AMD-761a43a6-1: the flat amendment shape (no meta/body).
 */
export const REAL_STORE: Readonly<Record<string, RawStoreFile>> = {
	'LLD-dfc0371b7200f5b5-S001.json': {
		meta: {
			createdAt: '2026-09-26T11:44:45.049Z',
			epicHash: 'dfc0371b7200f5b5',
			epicSlug: 'surface-bugfix-workflow-properly-so-first',
			storyId: 'S001',
			standalone: true,
			sizeClass: 'feature',
			approvedAt: '2026-09-26T11:50:04.854Z',
		},
		body: {},
	},
	'PLAN-dfc0371b7200f5b5-s001.json': {
		meta: {
			createdAt: '2026-09-26T11:54:35.996Z',
			epicCreatedAt: '2026-09-26T11:54:35.996Z',
			epicHash: 'dfc0371b7200f5b5',
			epicSlug: 'surface-bugfix-workflow-properly-so-first',
			storyId: 's001',
			approvedAt: '2026-09-26T11:54:57.632Z',
		},
		body: {
			tasks: [
				{
					id: 't1',
					title: 'Add optional additive followOn field to ApproveWorkflowTargetResult',
				},
				{
					id: 't2',
					title: 'Mount the bugfix seam in approveWorkflowTarget (deps-wire FIRST, then detect + call, guarded)',
				},
				{
					id: 't3',
					title: 'Author bugfix guide section + triage-routed front-door mentions',
				},
				{
					id: 't4',
					title: 'Add guide-enumeration + triage-regression tests',
				},
				{
					id: 't5',
					title: 'Rebuild + verify (tsc clean, asset copy, targeted sweep)',
				},
			],
		},
	},
	'BUILD-dfc0371b7200f5b5-S001.json': {
		meta: {
			createdAt: '2026-09-26T12:14:57.292Z',
			epicHash: 'dfc0371b7200f5b5',
			storyId: 'S001',
			standalone: false,
			sizeClass: 'feature',
			approvedAt: '2026-09-26T12:16:23.220Z',
		},
		body: {
			tasks: [
				{
					id: 't1',
					passed: true,
				},
				{
					id: 't2',
					passed: true,
				},
				{
					id: 't3',
					passed: true,
				},
				{
					id: 't4',
					passed: true,
				},
				{
					id: 't5',
					passed: true,
				},
			],
		},
	},
	'CR-dfc0371b7200f5b5-S001.json': {
		meta: {
			createdAt: '2026-09-26T12:14:19.375Z',
			epicHash: 'dfc0371b7200f5b5',
			storyId: 'S001',
		},
		body: {
			verdict: 'warn',
		},
	},
	'ISSUE-0855311b6b32eb72.json': {
		meta: {
			createdAt: '2026-10-04T09:33:18.527Z',
			issueHash: '0855311b6b32eb72',
			epicSlug: 'bug-build-record-triage-routed-small',
			standalone: true,
			magnitude: 'small',
			parentRef: {
				slug: 'bug-build-record-triage-routed-small',
			},
			approvedAt: '2026-10-04T12:10:45.255Z',
		},
		body: {
			title: 'File a small standalone story\'s BUILD record beside its design doc, not under docs/epics with a raw-hash folder name',
		},
	},
	'BUILD-0855311b6b32eb72-S001.json': {
		meta: {
			createdAt: '2026-10-04T12:11:09.893Z',
			epicHash: '0855311b6b32eb72',
			storyId: 'S001',
			standalone: true,
			sizeClass: 'trivial',
			approvedAt: '2026-10-04T12:42:57.596Z',
		},
		body: {
			tasks: [
				{
					id: 'S001',
					passed: false,
				},
			],
		},
	},
	'ISSUE-2d9e9e694a94116b.json': {
		meta: {
			createdAt: '2026-09-29T07:46:38.613Z',
			issueHash: '2d9e9e694a94116b',
			epicSlug: 'bug-insrc-vs-code-dev-chat',
			standalone: true,
			magnitude: 'sized',
			parentRef: {
				slug: 'vs-code-editor-dev-chat-ui',
			},
			approvedAt: '2026-09-29T07:51:55.487Z',
		},
		body: {
			title: 'Dev-chat Approve silently no-ops (claude): grant re-run sends a vague nudge, and working-dir denials aren\'t handled',
		},
	},
	'ISSUE-57446545909fe95c.json': {
		meta: {
			createdAt: '2026-10-03T16:23:58.780Z',
			issueHash: '57446545909fe95c',
			epicSlug: 'permission-hook-integration-test-ts-hangs',
			standalone: true,
			magnitude: 'small',
			parentRef: {
				slug: 'add-daemon-driven-code-review-stage',
				storyId: 's1',
			},
			approvedAt: '2026-10-03T16:24:04.464Z',
		},
		body: {
			title: 'Stop the permission-hook test hanging the run, and with it the flag that cancels live tests',
		},
	},
	'ISSUE-095906bac5bbacaf.json': {
		meta: {
			createdAt: '2026-09-30T14:03:33.897Z',
			issueHash: '095906bac5bbacaf',
			epicSlug: 'dev-chat-session-dropdown-history-clock',
			standalone: true,
			magnitude: 'small',
			parentRef: {
				slug: 'd5a433047dc3439f',
				storyId: 's1',
			},
			approvedAt: '2026-09-30T14:11:21.234Z',
		},
		body: {
			title: 'Dev-chat session dropdown shows only a bare down-arrow — the history glyph is blocked by the webview CSP',
		},
	},
	'LLD-d88062a6e63aa312-S001.json': {
		meta: {
			createdAt: '2026-08-04T19:09:56.031Z',
			epicHash: 'd88062a6e63aa312',
			epicSlug: 'make-code-review-work-any-subset',
			storyId: 'S001',
			standalone: true,
			sizeClass: 'feature',
			approvedAt: '2026-08-04T19:19:19.625Z',
		},
		body: {},
	},
	'BUILD-d88062a6e63aa312-S001.json': {
		meta: {
			createdAt: '2026-08-05T00:00:00.000Z',
			epicHash: 'd88062a6e63aa312',
			storyId: 'S001',
			standalone: false,
			approvedAt: '2026-08-04T19:35:51.413Z',
		},
		body: {
			tasks: [
				{
					id: 't1',
					passed: true,
				},
				{
					id: 't2',
					passed: true,
				},
				{
					id: 't3',
					passed: true,
				},
				{
					id: 't4',
					passed: true,
				},
				{
					id: 't5',
					passed: true,
				},
			],
		},
	},
	'BUILD-d5a433047dc3439f-S001.json': {
		meta: {
			createdAt: '2026-09-30T10:41:27.663Z',
			epicHash: 'd5a433047dc3439f',
			storyId: 'S001',
			standalone: true,
			sizeClass: 'trivial',
			approvedAt: '2026-09-30T10:47:58.400Z',
		},
		body: {
			tasks: [
				{
					id: 'S001',
					passed: true,
				},
			],
		},
	},
	'CR-d5a433047dc3439f-S001.json': {
		meta: {
			createdAt: '2026-09-30T10:47:53.871Z',
			epicHash: 'd5a433047dc3439f',
			storyId: 'S001',
		},
		body: {
			verdict: 'warn',
		},
	},
	'AMD-761a43a6fa645815-1.json': {
		id: 'AMD-761a43a6fa645815-1',
		epicHash: '761a43a6fa645815',
		epicSlug: 'add-daemon-driven-code-review-stage',
		amendment: {
			type: 'storyBoundary.addStory',
			storyId: 's9',
			internal: 'Private implementation of s9: Wait for a fresh index before grounding a Story\'s code review',
		},
		proposedBy: {
			workflow: 'define',
			runId: 'wf-1785904715589-yc1l3a',
			storyId: 's9',
			stepId: 'scope.assess',
		},
		proposedAt: '2026-08-05T04:47:34.061Z',
		status: 'approved',
		approvedAt: '2026-08-05T05:03:58.498Z',
		approvedBy: 'user:in-chat-approval',
	},
	'EXT-761a43a6fa645815-s9.json': {
		meta: {
			createdAt: '2026-08-05T04:47:34.063Z',
			epicHash: '761a43a6fa645815',
			epicSlug: 'add-daemon-driven-code-review-stage',
			storyId: 's9',
			approvedAt: '2026-08-05T05:02:06.605Z',
		},
		body: {
			addedStory: {
				id: 's9',
				title: 'Wait for a fresh index before grounding a Story\'s code review',
			},
			amendmentId: 'AMD-761a43a6fa645815-1',
		},
	},
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** Lift one store file into an ArtifactRecord exactly as the loader does; throws on a load failure. */
export function recordFromFile(fileName: string, raw: RawStoreFile): ArtifactRecord {
	const lifted = liftStoreFile(fileName, raw);
	if ('reason' in lifted) throw new Error(`fixtures: '${fileName}' does not lift: ${lifted.reason} (${lifted.detail})`);
	return lifted;
}

/** ArtifactRecords for the named REAL_STORE files (all of them when omitted), sorted by artifactId. */
export function realRecords(fileNames: readonly string[] = Object.keys(REAL_STORE)): ArtifactRecord[] {
	return fileNames.map(f => {
		const raw = REAL_STORE[f];
		if (raw === undefined) throw new Error(`fixtures: no REAL_STORE file '${f}'`);
		return recordFromFile(f, raw);
	}).sort((a, b) => a.artifactId.localeCompare(b.artifactId));
}

/** A record set over the given records and failures, sorted as the loader sorts them. */
export function recordSet(
	records: readonly ArtifactRecord[],
	failures: readonly RecordLoadFailure[] = [],
	repo = '/repo',
): ArtifactRecordSet {
	return {
		repo,
		readAt:   '2026-10-07T00:00:00.000Z',
		records:  [...records].sort((a, b) => a.artifactId.localeCompare(b.artifactId)),
		failures: [...failures].sort((a, b) => a.fileName.localeCompare(b.fileName)),
	};
}

// --- per-kind fabrication ----------------------------------------------------

export const CREATED = '2026-10-07T09:00:00.000Z';

type Meta = Readonly<Record<string, unknown>>;

function fileFor(kind: DeliveryArtifactKind, hash: string, storyId?: string): string {
	return storyId === undefined ? `${kind}-${hash}.json` : `${kind}-${hash}-${storyId}.json`;
}

function fabricate(kind: DeliveryArtifactKind, hash: string, storyId: string | undefined, meta: Meta, body: unknown): ArtifactRecord {
	const hashKey = kind === 'ISSUE' ? 'issueHash' : kind === 'SPEC' ? 'specHash' : 'epicHash';
	const fullMeta: Meta = {
		createdAt: CREATED,
		[hashKey]: hash,
		...(storyId !== undefined ? { storyId } : {}),
		...meta,
	};
	return recordFromFile(fileFor(kind, hash, storyId), { meta: fullMeta, body });
}

/** Extra body fields a fixture merges into the record's body (descriptive values, feedback). */
type Body = Readonly<Record<string, unknown>>;

/** A story entry of a Define: its id, or its id with extra fields (userValue, sizeEstimate). */
type StoryEntry = string | ({ readonly id: string } & Body);

/** An epic's Define with the given story ids (or entries), and any extra body fields (problem, summary, feedback). */
export function defRecord(hash: string, stories: readonly StoryEntry[], meta: Meta = {}, body: Body = {}): ArtifactRecord {
	return fabricate('DEF', hash, undefined, { epicCreatedAt: CREATED, ...meta },
		{ epic: { title: `Epic ${hash.slice(0, 8)}` }, stories: stories.map(s => (typeof s === 'string' ? { id: s, title: `Story ${s}` } : { title: `Story ${s.id}`, ...s })), ...body });
}

export function hldRecord(hash: string, meta: Meta = {}, body: Body = {}): ArtifactRecord {
	return fabricate('HLD', hash, undefined, { epicCreatedAt: CREATED, ...meta }, { ...body });
}

export function lldRecord(hash: string, storyId: string, meta: Meta = {}, body: Body = {}): ArtifactRecord {
	return fabricate('LLD', hash, storyId, meta, { ...body });
}

export function planRecord(hash: string, storyId: string, taskIds: readonly string[], meta: Meta = {}, body: Body = {}): ArtifactRecord {
	return fabricate('PLAN', hash, storyId, meta, { tasks: taskIds.map(id => ({ id, title: `Task ${id}` })), ...body });
}

export function buildRecord(hash: string, storyId: string, tasks: readonly { id: string; passed: boolean }[], meta: Meta = {}): ArtifactRecord {
	return fabricate('BUILD', hash, storyId, meta, { tasks });
}

export function crRecord(hash: string, storyId: string, verdict: 'pass' | 'warn' | 'block', meta: Meta = {}): ArtifactRecord {
	return fabricate('CR', hash, storyId, meta, { verdict });
}

/** An issue record; body adds its reproduction, root cause and fix intent. */
export function issueRecord(hash: string, parentRef: unknown, meta: Meta = {}, body: Body = {}): ArtifactRecord {
	return fabricate('ISSUE', hash, undefined, { standalone: true, magnitude: 'small', parentRef, ...meta }, { title: `Issue ${hash.slice(0, 8)}`, ...body });
}

export function specRecord(hash: string, meta: Meta = {}): ArtifactRecord {
	return fabricate('SPEC', hash, undefined, meta, { title: `Spec ${hash.slice(0, 8)}` });
}

/** An extension adding a story; added adds fields to the added story (userValue). */
export function extRecord(hash: string, storyId: string, meta: Meta = {}, added: Body = {}): ArtifactRecord {
	return fabricate('EXT', hash, storyId, meta, { addedStory: { id: storyId, title: `Story ${storyId}`, ...added } });
}

/** A flat AMD record (no meta/body), as the store writes amendments. */
export function amdRecord(hash: string, n: number, storyId: string, fields: Meta = {}): ArtifactRecord {
	const id = `AMD-${hash}-${n}`;
	return recordFromFile(`${id}.json`, {
		id, epicHash: hash, proposedAt: CREATED, status: 'pending',
		amendment: { type: 'storyBoundary.addStory', storyId },
		...fields,
	});
}
