/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The first prompts of design.story and plan for a Story of an Epic (ISSUE-1b3caadf04023d33, s1/t3).
 *
 * Run: npx tsx --test src/workflow/__tests__/epic-impact-prompts.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { registerDesignStoryRunners } from '../runners/design-story/index.js';
import { registerPlanRunners } from '../runners/plan/index.js';
import { getRunner } from '../executor.js';
import { EPIC_IMPACT_FIRST_ACTION, EPIC_IMPACT_NOT_APPLICABLE } from '../epic-built-state.js';
import { buildArtifactId, defineArtifactId, hldArtifactId, lldArtifactId } from '../storage.js';
import { computeHldEffectiveHash } from '../artifacts/lld.js';
import { approvedMeta, writeHead } from './lifecycle-fixtures.js';
import type { StepRunnerContext } from '../types.js';

registerDesignStoryRunners();
registerPlanRunners();

const HASH = 'c1d2e3f4a5b6c7d8';
const AT = '2026-01-01T00:00:00.000Z';

const boundary = (storyId: string): Record<string, unknown> => ({ storyId, owns: [], depends: [], internal: 'x' });

/** An Epic of s1, s2 with an approved Define, HLD and LLD for s2; s1 has an approved BUILD when `s1Built`. */
function epicRepo(s1Built: boolean): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-impact-'));
	const meta = { epicHash: HASH, epicSlug: 'x', createdAt: AT, epicCreatedAt: AT, ...approvedMeta() };
	writeHead(repo, defineArtifactId(HASH), {
		meta: { workflow: 'define', ...meta },
		body: { flavor: 'new-capability', problem: 'p', nonGoals: [], assumptions: [], constraints: [], openQuestions: [],
			stories: ['s1', 's2'].map(id => ({ id, title: `Title ${id}`, userValue: 'v', acceptanceCriteria: [], dependsOn: [] })) },
		citations: [],
	});
	writeHead(repo, hldArtifactId(HASH), {
		meta: { workflow: 'design.epic', runId: 'r', ...meta },
		body: { frameworkSummary: 'f', sharedContracts: [], storyBoundaries: [boundary('s1'), boundary('s2')], rolloutOverview: { phases: [] }, nonFunctional: {} },
		citations: [],
	});
	writeHead(repo, lldArtifactId(HASH, 's2'), {
		meta: { workflow: 'design.story', runId: 'r', storyId: 's2', hldBaseRunId: 'r', hldEffectiveHash: computeHldEffectiveHash('r', []), ...meta },
		body: { contractDetails: { api: [] }, testStrategy: { testLevels: [], acceptanceMapping: [] } },
		citations: [],
	});
	if (s1Built) {
		writeHead(repo, buildArtifactId(HASH, 's1'), {
			meta: { workflow: 'build', epicHash: HASH, createdAt: AT, ...approvedMeta() },
			body: { summary: 'built s1 thing', tasks: [{ id: 't1', passed: true }], changeLog: [{ target: { file: 'src/s1.ts' } }] },
			citations: [],
		});
	}
	return repo;
}

async function prompts(workflow: 'design.story' | 'plan', repo: string, storyId: string): Promise<{ prompt: string; userTurn: string }> {
	const ctx = { intent: { workflow, repoPath: repo, focus: 'f', params: { epicHash: HASH, storyId } } } as unknown as StepRunnerContext;
	const r = await getRunner(workflow, 'context.assemble').run(ctx);
	assert.equal(r.type, 'llm-pause');
	return r as unknown as { prompt: string; userTurn: string };
}

test('epic-impact-prompts.test.ts: the design.story and plan context.assemble prompts for a later Story of an Epic lead with EPIC_IMPACT_FIRST_ACTION and carry the rendered digest above the Story detail or the LLD handoff, and the prompts for a first or standalone Story carry only the one-line \'does not apply\'', async () => {
	const later = epicRepo(true);
	const first = epicRepo(false);
	try {
		const ds = await prompts('design.story', later, 's2');
		assert.ok(ds.prompt.startsWith(EPIC_IMPACT_FIRST_ACTION), 'design.story leads with the first action');
		const dsAt = ds.userTurn.indexOf('Epic built-state digest');
		assert.ok(dsAt >= 0 && dsAt < ds.userTurn.indexOf('Story detail (verbatim)'), 'the digest sits above the Story detail');
		assert.match(ds.userTurn, /built s1 thing/);

		const pl = await prompts('plan', later, 's2');
		assert.ok(pl.prompt.startsWith(EPIC_IMPACT_FIRST_ACTION), 'plan leads with the first action');
		const plAt = pl.userTurn.indexOf('Epic built-state digest');
		assert.ok(plAt >= 0 && plAt < pl.userTurn.indexOf('Approved LLD handoff'), 'the digest sits above the LLD handoff');

		// nothing built yet: only the one line, no instruction
		for (const w of ['design.story', 'plan'] as const) {
			const p = await prompts(w, first, 's2');
			assert.equal(p.prompt.includes(EPIC_IMPACT_FIRST_ACTION), false, `${w}: no first action`);
			assert.ok(p.userTurn.includes(EPIC_IMPACT_NOT_APPLICABLE), `${w}: the one-line does-not-apply`);
			assert.equal(p.userTurn.includes('Epic built-state digest'), false, `${w}: no digest`);
		}
		// the Epic's first Story, even with a later Story built
		const own = await prompts('design.story', later, 's1');
		assert.ok(own.userTurn.includes(EPIC_IMPACT_NOT_APPLICABLE));
	} finally { rmSync(later, { recursive: true, force: true }); rmSync(first, { recursive: true, force: true }); }
});
