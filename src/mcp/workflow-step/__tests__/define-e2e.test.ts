/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end `define` workflow test. Walks the full multi-turn
 * loop by supplying hand-crafted "LLM" responses to each pause.
 * No real LLM involved — the test acts as the outer client.
 *
 * Coverage:
 *   - Happy path: 4 llm-pauses + synthesize → artifact written.
 *   - Hard-fail path: s4 verdict with sb1=missed → synthesize
 *     refuses and returns error.
 *   - Ungrounded synthesize citation → refused.
 *
 * Run:
 *   npx tsx --test src/insrc/mcp/workflow-step/__tests__/define-e2e.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleWorkflowStep } from '../handler.js';
import { registerWorkflowRunners } from '../../../workflow/index.js';
import { _clearWorkflowStateStoreForTests } from '../state-store.js';

interface Envelope {
	readonly content: readonly { readonly type: 'text'; readonly text: string }[];
	readonly isError?: boolean;
}

function payload(env: Envelope): Record<string, unknown> {
	const first = env.content[0];
	assert.ok(first !== undefined);
	return JSON.parse(first.text) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Canned LLM responses
// ---------------------------------------------------------------------------

const s1Context = {
	decision: 'new' as const,
	scope: 'S' as const,
	notify: 'New capability — no existing Epic matches; framing a fresh Epic.',
	flavor: 'enhancement' as const,
	flavorEvidence: {
		classifierHint: 'ambiguous' as const,
		capabilityProbeVerdict: 'clear-match' as const,
		reasoning: 'insrc_analyze_step surfaced an existing todos module that already supports filtering by status.',
	},
	analyzeBundles: [
		{
			kind: 'capability-discovery',
			focus: 'does the codebase already do todos-by-tag filtering?',
			summary: 'The todos module has a status filter but no tag filter; adding one is a small extension.',
			pathsCited: ['src/todos/filter.ts'],
		},
	],
};

const s2Epic = {
	problem: 'Users cannot filter todos by tag today. Filtering is only available by status which blocks triage.',
	nonGoals: [
		{ text: 'Multi-tag AND filtering', rationale: 'out of scope' },
	],
	assumptions: [
		{ text: 'Todos already carry a tags column', confidence: 'high' as const, source: 'c1' },
	],
	constraints: [
		{ id: 'k1', text: 'Filter UI reuses the existing sidebar', type: 'convention' as const, source: 'c2' },
	],
	citations: [
		{ id: 'c1', kind: 'analyze-bundle' as const, ref: 'todos filter module' },
		{ id: 'c2', kind: 'convention' as const, ref: 'sidebar convention' },
	],
};

const s3Stories = {
	stories: [
		{
			id: 's1',
			title: 'As a user, I can filter todos by a single tag',
			userValue: 'Triaging users see just the tag subset without scrolling.',
			acceptanceCriteria: [
				{ id: 'ac1', given: 'a repo with tagged todos', when: 'user picks a tag', then: 'only matching todos are visible', operationalizes: ['k1'] },
			],
			existingCapabilityRefs: ['c1'],
		},
	],
	citations: [
		{ id: 'c1', kind: 'analyze-bundle' as const, ref: 'todos filter module' },
		{ id: 'c2', kind: 'convention' as const, ref: 'sidebar convention' },
	],
};

const s4VerdictPassed = {
	results: [
		{ itemId: 'sb1', verdict: 'passed', evidence: 's3' },
		{ itemId: 'sb2', verdict: 'passed', evidence: 's3' },
		{ itemId: 'sb3', verdict: 'passed', evidence: 's3' },
		{ itemId: 'p1', verdict: 'passed', evidence: 's2' },
	],
};

const s4VerdictBoundaryFail = {
	results: [
		{ itemId: 'sb1', verdict: 'missed', evidence: 's3', notes: 'Story leaks API shape' },
		{ itemId: 'sb2', verdict: 'passed', evidence: 's3' },
		{ itemId: 'sb3', verdict: 'passed', evidence: 's3' },
	],
};

const finalArtifact = {
	body: {
		flavor: 'enhancement' as const,
		problem: s2Epic.problem,
		nonGoals: s2Epic.nonGoals,
		assumptions: s2Epic.assumptions,
		constraints: s2Epic.constraints,
		stories: s3Stories.stories,
		openQuestions: [],
	},
	citations: [
		{ id: 'c1', kind: 'analyze-bundle', ref: 'todos filter module' },
		{ id: 'c2', kind: 'convention', ref: 'sidebar convention' },
	],
};

// ---------------------------------------------------------------------------
// Helper: walk to just before synthesize with a given s4 verdict
// ---------------------------------------------------------------------------

async function walkToSynthesize(repo: string, s4: Record<string, unknown>): Promise<string> {
	const startOut = payload(await handleWorkflowStep({
		phase:    'start',
		workflow: 'define',
		focus:    'let me filter todos by tag',
		repo,
	}));
	assert.equal(startOut['next'], 'emit_plan');
	let state = startOut['state'] as string;

	const planOut = payload(await handleWorkflowStep({
		phase: 'plan',
		plan: {
			workflow: 'define',
			steps: [
				{ id: 's1', runner: 'scope.assess',     params: {} },
				{ id: 's2', runner: 'epic.frame',       params: {} },
				{ id: 's3', runner: 'stories.compose',  params: {} },
				{ id: 's4', runner: 'checklist.verify', params: {} },
			],
		},
		state,
	}));
	assert.equal(planOut['next'], 'emit_step');
	state = planOut['state'] as string;

	// s1 → s2 → s3 → s4 as pauses
	const responses: Record<string, unknown>[] = [s1Context, s2Epic, s3Stories, s4];
	const stepIds = ['s1', 's2', 's3', 's4'];
	for (let i = 0; i < 4; i++) {
		const out = payload(await handleWorkflowStep({
			phase:    'step',
			stepId:   stepIds[i]!,
			response: responses[i]!,
			state,
		}));
		if (i < 3) {
			assert.equal(out['next'], 'emit_step');
		} else {
			assert.equal(out['next'], 'emit_synthesize');
		}
		state = out['state'] as string;
	}
	return state;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('define workflow: happy path writes artifact to docs/defines/<slug>.md', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-def-e2e-'));
	try {
		const state = await walkToSynthesize(repo, s4VerdictPassed);
		const done = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: finalArtifact,
			state,
		}));
		assert.equal(done['next'], 'done', JSON.stringify(done));
		const outPath = done['path'] as string;
		assert.ok(existsSync(outPath), outPath);
		assert.ok(outPath.includes('/docs/defines/'), outPath);
		const md = readFileSync(outPath, 'utf8');
		assert.ok(md.includes('# Epic:'));
		assert.ok(md.includes('**Flavor:** enhancement'));
		assert.ok(md.includes('## Stories'));
		assert.ok(md.includes('## Citations'));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('define workflow: s4 sb1=missed forces synthesize hard-fail', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-def-e2e-'));
	try {
		const state = await walkToSynthesize(repo, s4VerdictBoundaryFail);
		const errOut = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: finalArtifact,
			state,
		}));
		assert.equal(errOut['next'], 'error');
		const err = errOut['error'] as { code: string; message: string };
		assert.match(err.message, /sb1/);
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('define workflow: ungrounded citation fails synthesize', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-def-e2e-'));
	try {
		const state = await walkToSynthesize(repo, s4VerdictPassed);
		const badArtifact = {
			...finalArtifact,
			body: {
				...finalArtifact.body,
				assumptions: [{ text: 'x', confidence: 'high' as const, source: 'c99' }],
			},
		};
		const errOut = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: badArtifact,
			state,
		}));
		assert.equal(errOut['next'], 'error');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});
