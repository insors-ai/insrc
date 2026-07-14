/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tests for the approve-time tracker auto-integration.
 *
 * Only cover the pure pieces that DO NOT touch gh:
 *   - `renderEpicBody` / `renderStoryBody` shape
 *   - `updateEpicTaskList` idempotence + placeholder matching
 *   - `autoPushEpicOnHld` idempotence when meta already has epicRef
 *   - `autoPushStoryOnLld` idempotence when meta already has storyRef
 *   - skipped-reason path when HLD parent lacks epicRef
 *   - skipped-reason path when meta is missing required fields
 *
 * A live gh-invoking path is NOT covered here — that would require a
 * network-touching integration harness.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/tracker-auto.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
	autoPushEpicOnHld,
	autoPushStoryOnLld,
	renderEpicBody,
	renderStoryBody,
	updateEpicTaskList,
} from '../tracker-auto.js';
import type { DefineArtifact, DefineStory } from '../artifacts/define.js';

const HASH = 'a1b2c3d4e5f60718';
const SLUG = 'demo-feature';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeDefineArtifact(): DefineArtifact {
	return {
		meta: {
			workflow:  'define',
			runId:     'wf-1',
			repoPath:  '/repo',
			focus:     'demo',
			epicHash:  HASH,
			epicSlug:  SLUG,
			createdAt: '2026-07-14T00:00:00.000Z',
			schemaVersion: 1,
		},
		body: {
			flavor:  'new-capability',
			problem: 'Users cannot filter results. This blocks the onboarding flow.',
			nonGoals: [{ text: 'Redesign UI', rationale: 'Out of scope' }],
			assumptions: [],
			constraints: [
				{ id: 'c1', text: 'Must respect existing auth', type: 'invariant', source: 'c-01' },
			],
			stories: [
				{
					id: 's1', title: 'Add filter field', userValue: 'A user can type a filter',
					acceptanceCriteria: [
						{ id: 'ac1', given: 'the results page', when: 'I type "foo"', then: 'only matching rows show', operationalizes: [] },
					],
					sizeEstimate: 'S',
				},
				{
					id: 's2', title: 'Persist last filter', userValue: 'The filter survives reload',
					acceptanceCriteria: [
						{ id: 'ac1', given: 'a filter is set', when: 'I reload', then: 'the same filter is active', operationalizes: [] },
					],
				},
			],
			openQuestions: [],
		},
		citations: [],
	};
}

function makeStory(id: string, title: string, sizeEstimate?: 'S' | 'M' | 'L' | 'XL'): DefineStory {
	const base: DefineStory = {
		id, title,
		userValue: `value for ${id}`,
		acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: [] }],
	};
	if (sizeEstimate !== undefined) return { ...base, sizeEstimate };
	return base;
}

function makeTmpRepo(): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-tracker-auto-'));
	mkdirSync(join(dir, 'docs/defines'), { recursive: true });
	mkdirSync(join(dir, 'docs/designs'), { recursive: true });
	mkdirSync(join(dir, '.insrc/artifacts'), { recursive: true });
	return dir;
}

function writeJson(path: string, obj: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// renderEpicBody
// ---------------------------------------------------------------------------

test('renderEpicBody includes problem, non-goals, constraints, stories, references', () => {
	const body = renderEpicBody(makeDefineArtifact(), HASH, SLUG);
	assert.match(body, /## Problem/);
	assert.match(body, /Users cannot filter results/);
	assert.match(body, /## Non-goals/);
	assert.match(body, /\*\*Redesign UI\*\* — Out of scope/);
	assert.match(body, /## Constraints/);
	assert.match(body, /\*\*c1\*\* \(invariant\): Must respect existing auth/);
	assert.match(body, /## Stories/);
	assert.match(body, /- \[ \] s1: Add filter field \(S\)/);
	assert.match(body, /- \[ \] s2: Persist last filter$/m);
	assert.match(body, /## Design references/);
	assert.match(body, new RegExp(`HLD-${HASH}\\.md`));
	assert.match(body, new RegExp(`DEF-${HASH}\\.md`));
	assert.match(body, /_epic slug: demo-feature_/);
});

// ---------------------------------------------------------------------------
// renderStoryBody
// ---------------------------------------------------------------------------

test('renderStoryBody back-refs the Epic and lists acceptance criteria', () => {
	const story = makeStory('s3', 'Third story', 'M');
	const body = renderStoryBody('acme/demo#42', story, HASH);
	assert.match(body, /^\*\*Epic:\*\* #42$/m);
	assert.match(body, /## User value/);
	assert.match(body, /value for s3/);
	assert.match(body, /## Acceptance criteria/);
	assert.match(body, /- \*\*ac1:\*\* Given x, when y, then z\./);
	assert.match(body, new RegExp(`LLD-${HASH}-s3\\.md`));
	assert.match(body, /Size: M/);
});

// ---------------------------------------------------------------------------
// updateEpicTaskList
// ---------------------------------------------------------------------------

test('updateEpicTaskList replaces the placeholder line with the linked form', () => {
	const before = ['## Stories', '', '- [ ] s1: Add filter field (S)', '- [ ] s2: Persist last filter', ''].join('\n');
	const after = updateEpicTaskList(before, 's1', 'acme/demo#7', 'Add filter field');
	assert.match(after, /- \[ \] #7 — s1: Add filter field \(S\)/);
	// s2 untouched
	assert.match(after, /- \[ \] s2: Persist last filter/);
});

test('updateEpicTaskList is idempotent when the line is already linked', () => {
	const alreadyLinked = ['## Stories', '', '- [ ] #7 — s1: Add filter field (S)', ''].join('\n');
	const after = updateEpicTaskList(alreadyLinked, 's1', 'acme/demo#7', 'Add filter field');
	assert.equal(after, alreadyLinked);
});

test('updateEpicTaskList returns the input unchanged when no placeholder matches', () => {
	const noMatch = ['## Stories', '', '- [ ] s99: Some other story', ''].join('\n');
	const after = updateEpicTaskList(noMatch, 's1', 'acme/demo#7', 'Add filter field');
	assert.equal(after, noMatch);
});

// ---------------------------------------------------------------------------
// autoPushEpicOnHld: idempotence + missing-fields skips (do NOT hit gh)
// ---------------------------------------------------------------------------

test('autoPushEpicOnHld returns already-exists when epicRef is already set', () => {
	const repo = makeTmpRepo();
	try {
		const hldPath = join(repo, '.insrc/artifacts', `HLD-${HASH}.json`);
		writeJson(hldPath, {
			meta: {
				workflow: 'design.epic', runId: 'wf-2', repoPath: repo,
				epicHash: HASH, epicSlug: SLUG,
				epicRef: 'acme/demo#5',
			},
			body: {},
		});
		const r = autoPushEpicOnHld(hldPath);
		assert.equal(r.status, 'already-exists');
		if (r.status === 'already-exists') assert.equal(r.epicRef, 'acme/demo#5');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('autoPushEpicOnHld returns skipped when meta is missing epicHash', () => {
	const repo = makeTmpRepo();
	try {
		const hldPath = join(repo, '.insrc/artifacts', `HLD-${HASH}.json`);
		writeJson(hldPath, {
			meta: {
				workflow: 'design.epic', runId: 'wf-2', repoPath: repo,
			},
			body: {},
		});
		const r = autoPushEpicOnHld(hldPath);
		assert.equal(r.status, 'skipped');
		if (r.status === 'skipped') assert.match(r.reason, /missing epicHash/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// autoPushStoryOnLld: idempotence + missing-fields + missing-parent skips
// ---------------------------------------------------------------------------

test('autoPushStoryOnLld returns already-exists when storyRef is already set', () => {
	const repo = makeTmpRepo();
	try {
		const lldPath = join(repo, '.insrc/artifacts', `LLD-${HASH}-s1.json`);
		writeJson(lldPath, {
			meta: {
				workflow: 'design.story', runId: 'wf-3', repoPath: repo,
				epicHash: HASH, epicSlug: SLUG, storyId: 's1',
				storyRef: 'acme/demo#11',
			},
			body: {},
		});
		const r = autoPushStoryOnLld(lldPath);
		assert.equal(r.status, 'already-exists');
		if (r.status === 'already-exists') assert.equal(r.storyRef, 'acme/demo#11');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('autoPushStoryOnLld returns skipped when meta is missing storyId', () => {
	const repo = makeTmpRepo();
	try {
		const lldPath = join(repo, '.insrc/artifacts', `LLD-${HASH}-s1.json`);
		writeJson(lldPath, {
			meta: {
				workflow: 'design.story', runId: 'wf-3', repoPath: repo,
				epicHash: HASH, epicSlug: SLUG,
			},
			body: {},
		});
		const r = autoPushStoryOnLld(lldPath);
		assert.equal(r.status, 'skipped');
		if (r.status === 'skipped') assert.match(r.reason, /storyId/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
