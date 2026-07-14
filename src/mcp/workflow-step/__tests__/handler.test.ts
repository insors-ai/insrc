/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * End-to-end `insrc_workflow_step` walk through all four phases with
 * the `stub` workflow. No LLM — the test emits the plan / step
 * responses / artifact directly, exercising the handler + executor
 * + storage wiring.
 *
 * Run:
 *   npx tsx --test src/insrc/mcp/workflow-step/__tests__/handler.test.ts
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
	assert.ok(first !== undefined, 'envelope has no content[0]');
	return JSON.parse(first.text) as Record<string, unknown>;
}

test('stub workflow: start → plan → synthesize → done writes artifact', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-e2e-'));
	try {
		// --- phase='start' ---
		const startOut = payload(await handleWorkflowStep({
			phase:    'start',
			workflow: 'stub',
			focus:    'demo the workflow framework skeleton',
			repo,
		}));
		assert.equal(startOut['next'], 'emit_plan');
		const state1 = startOut['state'] as string;
		assert.ok(state1.length === 22);

		// --- phase='plan' ---
		const plan = {
			workflow: 'stub',
			steps: [
				{ id: 's1', runner: 'echo.a', params: { seed: 'alpha' } },
				{ id: 's2', runner: 'echo.b', params: { fromA: '$s1.echoed' } },
				{ id: 's3', runner: 'echo.c', params: { fromA: '$s1.marker', fromB: '$s2.marker' } },
			],
		};
		const planOut = payload(await handleWorkflowStep({
			phase: 'plan',
			plan,
			state: state1,
		}));
		assert.equal(planOut['next'], 'emit_synthesize');
		const state2 = planOut['state'] as string;

		// --- phase='synthesize' ---
		const artifact = {
			body: {
				title:   'Stub demo',
				summary: 'The framework skeleton walked the stub workflow end-to-end [[c1]] [[c2]] [[c3]].',
				bulletList: [
					's1 emitted alpha [[c1]]',
					's2 threaded s1 output [[c2]]',
					's3 assembled the pair [[c3]]',
				],
			},
			citations: [
				{ id: 'c1', kind: 'step-output', ref: 's1' },
				{ id: 'c2', kind: 'step-output', ref: 's2' },
				{ id: 'c3', kind: 'step-output', ref: 's3' },
			],
		};
		const done = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact,
			state:    state2,
		}));
		assert.equal(done['next'], 'done');
		const outPath = done['path'] as string;
		assert.ok(existsSync(outPath), `expected artifact at ${outPath}`);
		const contents = readFileSync(outPath, 'utf8');
		assert.ok(contents.includes('# Stub demo'));
		assert.ok(contents.includes('## Citations'));
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('stub workflow: synthesizer rejects ungrounded citation', async () => {
	_clearWorkflowStateStoreForTests();
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-wf-e2e-'));
	try {
		const startOut = payload(await handleWorkflowStep({
			phase:    'start',
			workflow: 'stub',
			focus:    'ungrounded citation test',
			repo,
		}));
		const state1 = startOut['state'] as string;

		const planOut = payload(await handleWorkflowStep({
			phase: 'plan',
			plan: {
				workflow: 'stub',
				steps: [
					{ id: 's1', runner: 'echo.a', params: {} },
					{ id: 's2', runner: 'echo.b', params: {} },
					{ id: 's3', runner: 'echo.c', params: {} },
				],
			},
			state: state1,
		}));
		assert.equal(planOut['next'], 'emit_synthesize');
		const state2 = planOut['state'] as string;

		const badArtifact = {
			body: {
				title: 'x',
				summary: 'refers to [[c99]] which does not exist',
				bulletList: ['x [[c99]]'],
			},
			citations: [{ id: 'c1', kind: 'step-output', ref: 's1' }],
		};
		const errOut = payload(await handleWorkflowStep({
			phase:    'synthesize',
			artifact: badArtifact,
			state:    state2,
		}));
		assert.equal(errOut['next'], 'error');
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}
});

test('stub workflow: bad state token errors cleanly', async () => {
	_clearWorkflowStateStoreForTests();
	const errOut = payload(await handleWorkflowStep({
		phase: 'plan',
		plan:  { workflow: 'stub', steps: [] },
		state: 'not-a-real-token-xxxxxx',
	}));
	assert.equal(errOut['next'], 'error');
});
