/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the identity module (s1/t1): ArtifactIds and RequirementIds.
 *
 * Run: npx tsx --test src/workflow/__tests__/artifact-ids.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ArtifactIds,
	InvalidArtifactKeyError,
	MissingAnchorError,
	RequirementIds,
	type ArtifactKey,
} from '../artifact-ids.js';

const H = '2f27754d4ad00b8e';
const EPIC = '185807ba9a6b35d3';
const ISO = '2026-07-17T07:42:28.275Z';

const CASES: ReadonlyArray<readonly [ArtifactKey, string]> = [
	[{ kind: 'DEF', epicHash: H }, `DEF-${H}`],
	[{ kind: 'HLD', epicHash: H }, `HLD-${H}`],
	[{ kind: 'EPIC', epicHash: H }, `EPIC-${H}`],
	[{ kind: 'SPEC', epicHash: 'abc12345def67890' }, 'SPEC-abc12345def67890'],
	[{ kind: 'ISSUE', epicHash: 'abc12345def67890' }, 'ISSUE-abc12345def67890'],
	[{ kind: 'LLD', epicHash: H, story: 's1' }, `LLD-${H}-s1`],
	[{ kind: 'PLAN', epicHash: H, story: 's1' }, `PLAN-${H}-s1`],
	[{ kind: 'BUILD', epicHash: H, story: 's10' }, `BUILD-${H}-s10`],
	[{ kind: 'CR', epicHash: H, story: 's2' }, `CR-${H}-s2`],
	[{ kind: 'TESTS', epicHash: H, story: 's2' }, `TESTS-${H}-s2`],
	[{ kind: 'EXT', epicHash: H, story: 's3' }, `EXT-${H}-s3`],
	[{ kind: 'STORY', epicHash: H, story: 's6' }, `STORY-${H}-s6`],
	[{ kind: 'TASKS', epicHash: H, story: 's1' }, `TASKS-${H}-s1`],
	[{ kind: 'TASK', epicHash: H, story: 's6', task: 't10' }, `TASK-${H}-s6-t10`],
	[{ kind: 'DIAG', epicHash: H, story: 's1', seq: 2 }, `DIAG-${H}-s1-2`],
	[{ kind: 'AMD', epicHash: H, seq: 5 }, `AMD-${H}-5`],
];

test('make produces the stored text for every existing kind and parse returns the same key', () => {
	for (const [key, text] of CASES) {
		assert.equal(ArtifactIds.make(key), text);
		assert.deepEqual(ArtifactIds.parse(text), key);
	}
});

test('parentOf walks task, tasks and diagram to story, story to epic, and stops there', () => {
	const task = ArtifactIds.parse(`TASK-${H}-s6-t10`) as ArtifactKey;
	const story = ArtifactIds.parentOf(task);
	assert.deepEqual(story, { kind: 'STORY', epicHash: H, story: 's6' });
	assert.deepEqual(ArtifactIds.parentOf(story as ArtifactKey), { kind: 'EPIC', epicHash: H });
	assert.deepEqual(ArtifactIds.parentOf({ kind: 'TASKS', epicHash: H, story: 's1' }), { kind: 'STORY', epicHash: H, story: 's1' });
	assert.deepEqual(ArtifactIds.parentOf({ kind: 'DIAG', epicHash: H, story: 's1', seq: 1 }), { kind: 'STORY', epicHash: H, story: 's1' });
	assert.equal(ArtifactIds.parentOf({ kind: 'EPIC', epicHash: H }), undefined);
	assert.equal(ArtifactIds.parentOf({ kind: 'LLD', epicHash: H, story: 's1' }), undefined);
});

test('the per-kind required and forbidden fields and the uppercase story and task form throw InvalidArtifactKeyError', () => {
	const bad: ArtifactKey[] = [
		{ kind: 'LLD', epicHash: H },                                   // story required
		{ kind: 'LLD', epicHash: H, story: 'S001' },                    // uppercase story
		{ kind: 'LLD', epicHash: H, story: 's0' },
		{ kind: 'DEF', epicHash: H, story: 's1' },                      // story forbidden
		{ kind: 'TASK', epicHash: H, story: 's1' },                     // task required
		{ kind: 'TASK', epicHash: H, story: 's1', task: 'T001' },       // uppercase task
		{ kind: 'TASKS', epicHash: H, story: 's1', seq: 1 },            // seq forbidden on TASKS
		{ kind: 'DIAG', epicHash: H, story: 's1' },                     // seq required
		{ kind: 'AMD', epicHash: H, story: 's1', seq: 1 },              // story forbidden on AMD
		{ kind: 'AMD', epicHash: H },                                   // seq required
		{ kind: 'AMD', epicHash: H, seq: 0 },
		{ kind: 'DEF', epicHash: 'ABC' },                               // not lowercase hex
		{ kind: 'DEF', epicHash: 'abc' },                               // wrong length
	];
	for (const key of bad) {
		assert.throws(() => ArtifactIds.make(key), InvalidArtifactKeyError, JSON.stringify(key));
	}
});

test('a folder name is not parsed as an artifact id', () => {
	const misses = [
		'one-common-model-every-artifact-E202610192f27754d',
		'E202610192f27754d:S001',
		'E202610192f27754d-S001',
		`LLD-${H}-S001`,
		`TASK-${H}-s1-T001`,
		`LLD-${H}`,
		`DEF-${H}-s1`,
		`TASKS-${H}-s1-1`,
		`AMD-${H}-s1-1`,
		`AMD-${H}-0`,
		`LLD-${H}-s1-extra`,
		`<!-- insrc:id E202610192f27754d:S001 -->`,
		'',
		'LLD',
	];
	for (const text of misses) assert.equal(ArtifactIds.parse(text), undefined, text);
});

test('stored requirement ids in the canonical and slug forms parse to date, hash8, story as a number and fr', () => {
	assert.deepEqual(RequirementIds.parse('E20260717185807ba:S002:FR005'), { date: '20260717', hash8: '185807ba', story: 2, fr: 5 });
	assert.deepEqual(RequirementIds.parse('E20260717185807ba-S002-FR005'), { date: '20260717', hash8: '185807ba', story: 2, fr: 5 });
	assert.deepEqual(RequirementIds.parse('E20260717185807ba:FR042'), { date: '20260717', hash8: '185807ba', fr: 42 });
	assert.deepEqual(RequirementIds.parse('E20260717185807ba-FR1000'), { date: '20260717', hash8: '185807ba', fr: 1000 });
	assert.equal(RequirementIds.parse('E20260717185807ba:S002'), undefined);
	assert.equal(RequirementIds.parse('nonsense'), undefined);
	assert.equal(RequirementIds.isRequirementId('E20260717185807ba:S002:FR005'), true);
	assert.equal(RequirementIds.isRequirementId('E20260717185807ba:S002'), false);

	assert.equal(RequirementIds.mint(EPIC, ISO, 1), 'E20260717185807ba:FR001');
	assert.equal(RequirementIds.mint(EPIC, ISO, 3, 's2'), 'E20260717185807ba:S002:FR003');
	assert.equal(RequirementIds.mint(EPIC, ISO, 12345), 'E20260717185807ba:FR12345');
	assert.equal(RequirementIds.isRequirementId(RequirementIds.mint(EPIC, ISO, 7, 's1')), true);
	assert.throws(() => RequirementIds.mint(EPIC, ISO, 3, 'S002'), InvalidArtifactKeyError);
	assert.throws(() => RequirementIds.mint(EPIC, ISO, 0), InvalidArtifactKeyError);
	assert.throws(() => RequirementIds.mint(EPIC, 'not-a-date', 1), InvalidArtifactKeyError);
});

test('MissingAnchorError is an InvalidArtifactKeyError', () => {
	const e = new MissingAnchorError('no anchor');
	assert.ok(e instanceof InvalidArtifactKeyError);
	assert.equal(e.name, 'MissingAnchorError');
});
