/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A run records its owner and its upstream snapshot when handleStart creates it, and the later turns keep both
 * (Story s6, a handoff needs to know whose run it is and which revisions it started from).
 *
 * Run: npx tsx --test src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { handleWorkflowStep } from '../handler.js';
import { _clearWorkflowStateStoreForTests, listStates } from '../state-store.js';
import { registerWorkflowRunners } from '../../../../workflow/index.js';
import { computeHldEffectiveHash } from '../../../../workflow/artifacts/lld.js';
import { markApprovedSync } from '../../../../workflow/__tests__/lifecycle-fixtures.js';
import { defineArtifactId, defineArtifactPaths, hldArtifactId, hldArtifactPaths, lldArtifactId, lldArtifactPaths } from '../../../../workflow/storage.js';
import { _setGateDepsForTests } from '../../../../workflow/team/gate.js';
import type { PortResult, TrackerPort } from '../../../../workflow/tracker/port.js';
import type { PolicyReader, TeamPolicy } from '../../../../workflow/team/types.js';
import '../../../../workflow/__tests__/helpers/converted-repos.js';

const HASH = 'a3f4b8c9d1e2f3a4';
afterEach(() => { _setGateDepsForTests(); _clearWorkflowStateStoreForTests(); });

const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });

function inject(readPolicy: PolicyReader): { loads: () => number } {
	let loads = 0;
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: 'alice' }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy,
		loadTracker: () => { loads += 1; return { ok: true, value: port }; },
		resolveIssue: () => 'acme/demo#7',
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }),
		artifactExists: () => true,
	});
	return { loads: () => loads };
}

const CREATED = '2026-07-18T00:00:00.000Z';
const HLD_RUN = 'hld-run-1';

/** An approved Define, HLD and Story LLD, each carrying a non-zero revision, as the plan workflow reads them. */
function seedChain(repo: string): void {
	const dp = defineArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'a', when: 'b', then: 'c', operationalizes: [] }], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}));
	markApprovedSync(dp.json, { revision: 3 });

	const hp = hldArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: HLD_RUN, schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			frameworkSummary: 'x', architectureShape: 'x [[c1]]',
			sharedContracts: [{ id: 'sc1', name: 'A', purpose: 'p', interfaceSketch: 'interface A {}', ownedByStory: 's1', consumedByStories: [], assumptions: [] }],
			storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'x' }],
			nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null }], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}));
	markApprovedSync(hp.json, { revision: 5 });

	const lp = lldArtifactPaths(repo, HASH, 's1', CREATED, 'epic', 'tag-filtering');
	writeFileSync(lp.json, JSON.stringify({
		meta: {
			workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED,
			hldBaseRunId: HLD_RUN, hldEffectiveHash: computeHldEffectiveHash(HLD_RUN, []), hldAmendmentsApplied: [],
		},
		body: {
			hldContextSlice: {}, contractDetails: { surfaceLevel: 'internal', api: [] },
			dataModelChanges: [], interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [{ level: 'unit', purpose: 'x', subjects: ['unit: filter by tag'] }], acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit: filter by tag'] }], testFramework: 'node:test' },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [],
	}));
	markApprovedSync(lp.json, { revision: 7 });
}

const PLAN_STEPS = [
	{ id: 's1', runner: 'context.assemble', params: {} }, { id: 's2', runner: 'tasks.enumerate', params: {} },
	{ id: 's3', runner: 'tasks.critique', params: {} }, { id: 's4', runner: 'tasks.finalize', params: {} },
	{ id: 's5', runner: 'test-strategy.write', params: {} }, { id: 's6', runner: 'checklist.verify', params: {} },
];
const taskCore = { id: 't1', title: 'Implement the tag filter', summary: 'Add the filter path.', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['filter returns tagged todos'], derivedFrom: ['c1'] };
const s1Context = { analyzeBundles: [{ kind: 'symbol.locate', focus: 'filter', summary: 'new path', pathsCited: ['src/todos/filter.ts'] }] };

const parse = (env: { content: readonly { text: string }[] }): { next: string; state: string; error?: { code: string; message: string } } => JSON.parse(env.content[0]!.text) as never;
const entryOf = (token: string) => listStates().find(e => e.token === token);

test('handleStart records the acting user and the upstream snapshot on the stored run, plan and step turns keep them, and a repo without a policy records neither and makes no tracker call', async () => {
	registerWorkflowRunners();
	const repo = mkdtempSync(join(tmpdir(), 'insrc-handoff-own-'));
	try {
		seedChain(repo);
		inject(team);

		// the real plan workflow: start records the owner and the snapshot of everything plan reads
		const started = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo, params: { epicHash: HASH, storyId: 's1' } }));
		assert.equal(started.next, 'emit_plan', JSON.stringify(started));
		const first = entryOf(started.state)?.meta;
		assert.equal(first?.owner, 'alice');
		const byId = new Map((first?.upstream ?? []).map(u => [u.artifactId.split('@')[0], u.revision]));
		assert.deepEqual([...byId.entries()], [[lldArtifactId(HASH, 's1'), 7], [hldArtifactId(HASH), 5], [defineArtifactId(HASH), 3]]);

		// a plan turn and then step turns each mint a new token, and each keeps both the owner and the snapshot
		const planned = parse(await handleWorkflowStep({ phase: 'plan', plan: { workflow: 'plan', steps: PLAN_STEPS }, state: started.state } as never));
		assert.equal(planned.next, 'emit_step', JSON.stringify(planned));
		const afterPlan = entryOf(planned.state)?.meta;
		assert.equal(afterPlan?.owner, 'alice');
		assert.deepEqual(afterPlan?.upstream, first?.upstream);
		assert.equal(entryOf(started.state), undefined, 'the superseded token is gone');

		const s1 = parse(await handleWorkflowStep({ phase: 'step', stepId: 's1', response: s1Context, state: planned.state } as never));
		assert.equal(s1.next, 'emit_step', JSON.stringify(s1));
		assert.equal(entryOf(s1.state)?.meta?.owner, 'alice');
		assert.deepEqual(entryOf(s1.state)?.meta?.upstream, first?.upstream);
		assert.equal(entryOf(planned.state), undefined, 'a step turn releases the token it decoded');
		const s2 = parse(await handleWorkflowStep({ phase: 'step', stepId: 's2', response: { tasks: [taskCore] }, state: s1.state } as never));
		assert.equal(s2.next, 'emit_step', JSON.stringify(s2));
		assert.equal(entryOf(s2.state)?.meta?.owner, 'alice');
		assert.deepEqual(entryOf(s2.state)?.meta?.upstream, first?.upstream);
		assert.equal(entryOf(s1.state), undefined);
	} finally { rmSync(repo, { recursive: true, force: true }); }

	// no policy: neither owner nor snapshot, and the tracker is never loaded
	const free = mkdtempSync(join(tmpdir(), 'insrc-handoff-own-free-'));
	try {
		seedChain(free);
		const seen = inject(none);
		const started = parse(await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo: free, params: { epicHash: HASH, storyId: 's1' } }));
		assert.equal(started.next, 'emit_plan');
		assert.equal(entryOf(started.state)?.meta, undefined);
		const planned = parse(await handleWorkflowStep({ phase: 'plan', plan: { workflow: 'plan', steps: PLAN_STEPS }, state: started.state } as never));
		assert.equal(entryOf(planned.state)?.meta, undefined);
		assert.equal(seen.loads(), 0);
	} finally { rmSync(free, { recursive: true, force: true }); }
});
