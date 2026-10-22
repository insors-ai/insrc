/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A two-clone world for handoff tests: a real bare origin, the parker's repo with an approved Define/HLD/LLD chain, and a second
 * clone at another absolute path, with the team gate pointed at a fake tracker whose actor and holder a test can change.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { _clearWorkflowStateStoreForTests, listStates } from '../../../../daemon/steps/workflow-step/state-store.js';
import { computeHldEffectiveHash } from '../../../artifacts/lld.js';
import { markApprovedSync } from '../../../__tests__/lifecycle-fixtures.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths } from '../../../storage.js';
import type { PortResult, TrackerPort } from '../../../tracker/port.js';
import type { UnitRef } from '../../../tracker/refs.js';
import { _setGateDepsForTests } from '../../gate.js';
import { parkDraft } from '../../handoff.js';
import type { PolicyReader, TeamPolicy } from '../../types.js';

export const HASH = 'a3f4b8c9d1e2f3a4';
export const CREATED = '2026-07-18T00:00:00.000Z';
export const HLD_RUN = 'hld-run-1';
export const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });

export const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** An approved Define, HLD and Story LLD as the plan workflow reads them (each with a non-zero revision). */
export function seedChain(repo: string): void {
	const dp = defineArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED },
		body: { flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'a', when: 'b', then: 'c', operationalizes: [] }], dependsOn: [] }], openQuestions: [] },
		citations: [],
	}));
	markApprovedSync(dp.json, { revision: 3 });
	const hp = hldArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: HLD_RUN, schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			frameworkSummary: 'x', architectureShape: 'x [[c1]]',
			sharedContracts: [{ id: 'sc1', name: 'A', purpose: 'p', interfaceSketch: 'interface A {}', ownedByStory: 's1', consumedByStories: [], assumptions: [] }],
			storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'x' }], nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null }], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }], chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}));
	markApprovedSync(hp.json, { revision: 5 });
	const lp = lldArtifactPaths(repo, HASH, 's1', CREATED, 'epic', 'tag-filtering');
	writeFileSync(lp.json, JSON.stringify({
		meta: { workflow: 'design.story', runId: 'lld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', createdAt: CREATED, epicCreatedAt: CREATED, hldBaseRunId: HLD_RUN, hldEffectiveHash: computeHldEffectiveHash(HLD_RUN, []), hldAmendmentsApplied: [] },
		body: {
			hldContextSlice: {}, contractDetails: { surfaceLevel: 'internal', api: [] }, dataModelChanges: [], interactionWithShared: [],
			errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
			testStrategy: { testLevels: [{ level: 'unit', purpose: 'x', subjects: ['unit: filter by tag'] }], acceptanceMapping: [{ criterionId: 'ac1', provingTests: ['unit: filter by tag'] }], testFramework: 'node:test' },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: [], cons: [], costEstimate: 'S' }], chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [],
	}));
	markApprovedSync(lp.json, { revision: 7 });
}

export const PLAN_STEPS = [
	{ id: 's1', runner: 'context.assemble', params: {} }, { id: 's2', runner: 'tasks.enumerate', params: {} }, { id: 's3', runner: 'tasks.critique', params: {} },
	{ id: 's4', runner: 'tasks.finalize', params: {} }, { id: 's5', runner: 'test-strategy.write', params: {} }, { id: 's6', runner: 'checklist.verify', params: {} },
];
export const taskCore = { id: 't1', title: 'Implement the tag filter', summary: 'Add the filter path.', size: 'M', order: 1, dependsOn: [], acceptanceChecks: ['filter returns tagged todos'], derivedFrom: ['c1'] };
export const s1Context = { analyzeBundles: [{ kind: 'symbol.locate', focus: 'filter', summary: 'new path', pathsCited: ['src/todos/filter.ts'] }] };

export interface World { root: string; origin: string; parker: string; recv: string; tmp: string; actor: { who: string; holder: string | null } }

export function mkWorld(): World {
	const root = mkdtempSync(join(tmpdir(), 'insrc-resume-'));
	const origin = join(root, 'origin.git'), parker = join(root, 'parker-machine', 'repo'), recv = join(root, 'new-owner', 'deeper', 'clone'), tmp = join(root, 'tmp');
	mkdirSync(tmp); mkdirSync(parker, { recursive: true }); mkdirSync(dirname(recv), { recursive: true });
	git(root, 'init', '--bare', '-q', '-b', 'main', origin);
	git(parker, 'init', '-q', '-b', 'main'); git(parker, 'config', 'user.email', 'a@t'); git(parker, 'config', 'user.name', 'alice'); git(parker, 'config', 'commit.gpgsign', 'false');
	seedChain(parker);
	git(parker, 'add', '-A'); git(parker, 'commit', '-qm', 'approved upstream chain'); git(parker, 'remote', 'add', 'origin', origin); git(parker, 'push', '-q', 'origin', 'main');
	git(root, 'clone', '-q', origin, recv); git(recv, 'config', 'user.email', 'b@t'); git(recv, 'config', 'user.name', 'bob'); git(recv, 'config', 'commit.gpgsign', 'false');
	const actor = { who: 'alice', holder: 'alice' as string | null };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: actor.who }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: actor.holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: [actor.who] }),
		issueOps: { comment: (): PortResult<void> => ({ ok: true, value: undefined }) },
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy: team, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7', ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'x' }), artifactExists: () => true });
	return { root, origin, parker, recv, tmp, actor };
}

export const unitOf = (repo: string, story = 's1'): UnitRef => ({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: story });
export const parse = (env: { content: readonly { text: string }[] }): Record<string, any> => JSON.parse(env.content[0]!.text) as Record<string, any>;
export const parkDeps = (w: World) => ({ branchPattern: () => undefined, tmpRoot: w.tmp });
export const resumeDeps = (w: World) => ({ branchPattern: () => undefined, tmpRoot: w.tmp, listRepos: async () => [{ path: w.parker }, { path: w.recv }] });
/** After the park: bob holds the Story and acts. */
export const handOver = (w: World): void => { w.actor.who = 'bob'; w.actor.holder = 'bob'; };
/** Park as alice while bob already holds the Story. */
export async function park(w: World, unit: UnitRef): Promise<void> {
	w.actor.who = 'alice'; w.actor.holder = 'bob';
	const r = await parkDraft(w.parker, unit, {}, parkDeps(w));
	assert.equal(r.ok, true, r.ok ? '' : r.reason);
	_clearWorkflowStateStoreForTests();
	handOver(w);
}

export const entryOf = (token: string) => listStates().find(e => e.token === token);
export const treeOf = (dir: string): string => `${git(dir, 'status', '--porcelain', '--untracked-files=all')}\n${git(dir, 'ls-files', '-s')}`;
