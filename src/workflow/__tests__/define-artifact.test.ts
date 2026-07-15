/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DefineArtifact renderer + cross-artifact invariants (dependency
 * DAG, constraint coverage).
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/define-artifact.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	checkConstraintCoverage,
	checkStoryDependencyGraph,
	isDefineBody,
	renderDefineMarkdown,
	type DefineBody,
	type DefineStory,
} from '../artifacts/define.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function fixture(): DefineBody {
	return {
		flavor: 'enhancement',
		problem: 'Users cannot filter todos by tag today. Filtering is only available by status. This friction blocks their triage flow.',
		nonGoals: [
			{ text: 'Multi-tag AND filtering', rationale: 'out of scope; needs a query builder' },
		],
		assumptions: [
			{ text: 'Todos already have a tags column', confidence: 'high', source: 'c1' },
		],
		constraints: [
			{ id: 'k1', text: 'Filter UI must live in the existing sidebar', type: 'convention', source: 'c2' },
		],
		stories: [
			{
				id: 's1', title: 'As a user, I can filter todos by a single tag',
				userValue: 'Users triaging their backlog can see just the tag-scoped subset without scrolling.',
				acceptanceCriteria: [
					{ id: 'ac1', given: 'a repo with tagged todos', when: 'user picks a tag in the sidebar', then: 'only matching todos are visible',
						operationalizes: ['k1'] },
				],
				existingCapabilityRefs: ['c1'],
			},
			{
				id: 's2', title: 'As a user, I can clear the tag filter',
				userValue: 'Users can return to the full list without reloading.',
				acceptanceCriteria: [
					{ id: 'ac1', given: 'a filter is active', when: 'user clicks clear', then: 'all todos are visible',
						operationalizes: ['k1'] },
				],
				dependsOn: ['s1'],
			},
		],
		openQuestions: [],
	};
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

test('renderDefineMarkdown produces expected sections', () => {
	const md = renderDefineMarkdown({
		meta: {
			workflow: 'define', runId: 'run-1', repoPath: '/tmp/x',
			createdAt: '2026-07-12T00:00:00Z', model: 'client', elapsedMs: 0,
			repoIndexedAt: null, schemaVersion: 1,
		},
		body: fixture(),
		citations: [
			{ id: 'c1', kind: 'analyze-bundle', ref: 'todos-module' },
			{ id: 'c2', kind: 'convention', ref: 'sidebar convention' },
		],
	});
	assert.ok(md.includes('# Epic:'));
	assert.ok(md.includes('**Flavor:** enhancement'));
	assert.ok(md.includes('## Problem'));
	assert.ok(md.includes('## Non-goals'));
	assert.ok(md.includes('## Assumptions'));
	assert.ok(md.includes('## Constraints'));
	assert.ok(md.includes('## Stories'));
	assert.ok(md.includes('### s1:'));
	assert.ok(md.includes('### s2:'));
	assert.ok(md.includes('[[c1]]'));   // assumption source
	assert.ok(md.includes('[[c2]]'));   // constraint source
	assert.ok(md.includes('**Depends on:**'));
	assert.ok(md.includes('**Extends:**'));
});

test('renderDefineMarkdown adds a Tracker link only when meta.tracker.epicRef is set', () => {
	const meta = { workflow: 'define', runId: 'run-1', repoPath: '/tmp/x', createdAt: '', model: 'client', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1 };
	assert.doesNotMatch(renderDefineMarkdown({ meta, body: fixture(), citations: [] } as unknown as Parameters<typeof renderDefineMarkdown>[0]), /\*\*Tracker:\*\*/);
	const linked = { meta: { ...meta, tracker: { epicRef: 'acme/demo#3' } }, body: fixture(), citations: [] } as unknown as Parameters<typeof renderDefineMarkdown>[0];
	assert.match(renderDefineMarkdown(linked), /\*\*Tracker:\*\* \[acme\/demo#3\]/);
});

test('renderDefineMarkdown escapes pipes in constraint text', () => {
	const body = fixture();
	const dirty: DefineBody = {
		...body,
		constraints: [{ id: 'k1', text: 'foo | bar', type: 'convention', source: 'c1' }],
	};
	const md = renderDefineMarkdown({
		meta: { workflow: 'define', runId: 'x', repoPath: '/', createdAt: '', model: 'client', elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1 },
		body: dirty,
		citations: [{ id: 'c1', kind: 'doc', ref: 'x' }, { id: 'c2', kind: 'doc', ref: 'y' }],
	});
	assert.ok(md.includes('foo \\| bar'), md);
});

// ---------------------------------------------------------------------------
// isDefineBody
// ---------------------------------------------------------------------------

test('isDefineBody accepts valid body', () => {
	assert.equal(isDefineBody(fixture()), true);
});

test('isDefineBody rejects bad flavor', () => {
	const bad = { ...fixture(), flavor: 'other' };
	assert.equal(isDefineBody(bad), false);
});

test('isDefineBody rejects missing stories', () => {
	const bad = { ...fixture() } as Record<string, unknown>;
	delete bad['stories'];
	assert.equal(isDefineBody(bad), false);
});

// ---------------------------------------------------------------------------
// Dependency DAG
// ---------------------------------------------------------------------------

test('checkStoryDependencyGraph passes clean DAG', () => {
	const details = checkStoryDependencyGraph(fixture().stories);
	assert.deepEqual(details, []);
});

test('checkStoryDependencyGraph reports unknown dependency', () => {
	const stories: DefineStory[] = [
		{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [], dependsOn: ['s9'] },
	];
	const details = checkStoryDependencyGraph(stories);
	assert.equal(details.length, 1);
	assert.match(details[0]!, /unknown/);
});

test('checkStoryDependencyGraph detects a cycle', () => {
	const stories: DefineStory[] = [
		{ id: 's1', title: 't', userValue: 'v', acceptanceCriteria: [], dependsOn: ['s2'] },
		{ id: 's2', title: 't', userValue: 'v', acceptanceCriteria: [], dependsOn: ['s1'] },
	];
	const details = checkStoryDependencyGraph(stories);
	assert.ok(details.some(d => d.includes('cycle')));
});

// ---------------------------------------------------------------------------
// Constraint coverage
// ---------------------------------------------------------------------------

test('checkConstraintCoverage passes when every operationalizes id resolves', () => {
	assert.deepEqual(checkConstraintCoverage(fixture()), []);
});

test('checkConstraintCoverage reports unknown constraint id', () => {
	const bad = { ...fixture() };
	bad.stories = [
		{
			...bad.stories[0]!,
			acceptanceCriteria: [
				{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k9'] },
			],
		},
	];
	const issues = checkConstraintCoverage(bad);
	assert.equal(issues.length, 1);
	assert.match(issues[0]!, /k9/);
});

test('checkConstraintCoverage resolves local constraint ids too', () => {
	const bad: DefineBody = {
		...fixture(),
		stories: [{
			id: 's1', title: 't', userValue: 'v',
			acceptanceCriteria: [
				{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k3'] },
			],
			localConstraints: [
				{ id: 'k3', text: 'local', type: 'convention', source: 'c1' },
			],
		}],
	};
	assert.deepEqual(checkConstraintCoverage(bad), []);
});
