/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b47dadc7 S001/t1 — both build prompts ask for the `Insrc-Story` trailer
 * with the Story's own epicHash and storyId, so the code review can keep only
 * the Story's commits. The commit subject line is unchanged.
 *
 * Run: npx tsx --test src/daemon/steps/build-step/__tests__/render-trailer.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderImplementPrompt, renderStandaloneImplementPrompt, type ResolvedTask } from '../render.js';

const TASK: ResolvedTask = {
	level:      'task',
	epicHash:   'b47dadc7cf0cccb1',
	epicSlug:   'scope-code-review-story-s-own',
	createdAt:  '2026-10-17T00:00:00.000Z',
	storyId:    'S001',
	taskId:     't1',
	workflowId: 'E20261017b47dadc7:S001:T001',
	slug:       'E20261017b47dadc7-S001-T001',
	task: {
		id: 't1', title: 'Trailer', summary: 'Ask for the trailer.',
		size: 'S', order: 1, dependsOn: [], derivedFrom: [],
		acceptanceChecks: ['x'], tests: [],
	},
} as ResolvedTask;

test('the implement prompt asks for the Insrc-Story trailer with the Story\'s epicHash and storyId', () => {
	const prompt = renderImplementPrompt('/repo', TASK, '');

	assert.ok(prompt.includes('`Insrc-Story: b47dadc7cf0cccb1/S001`'), 'the trailer carries the real values');
	assert.match(prompt, /blank line and then the git trailer/);
	assert.ok(prompt.includes('`feat(build): S001/t1 … ((no issue))`'), 'the subject line format is unchanged');
	assert.equal(prompt.includes('{{storyTrailerRule}}'), false, 'the placeholder is filled');
});

test('the no-plan standalone prompt asks for the Insrc-Story trailer with the Story\'s epicHash', () => {
	for (const producesLld of [true, false]) {
		const prompt = renderStandaloneImplementPrompt({
			epicHash: '748edb69bd23f767', storyId: 'S001', sizeClass: producesLld ? 'small' : 'trivial',
			producesLld, focus: 'x', resolvedDecisions: '',
		});
		assert.ok(prompt.includes('## Committing'), `has the commit section (producesLld ${producesLld})`);
		assert.ok(prompt.includes('`Insrc-Story: 748edb69bd23f767/S001`'), `the trailer carries the spec's epicHash (producesLld ${producesLld})`);
	}
});
