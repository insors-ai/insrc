/**
 * The team gate on the define extend path (Story f32c3abf4a55494b/s1): an extend of an existing Epic changes its Define, so it asks
 * the gate for 'revise' while the Define is in signoff (and 'author' otherwise) before the Story, the amendment or the EXT record
 * is written. A first define of a fresh Epic is not gated; a repo with no team policy is untouched.
 *
 * Run: npx tsx --test src/workflow/__tests__/define-extend-gate.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { finalizeArtifact } from '../orchestrator.js';
import type { WorkflowIntent } from '../orchestrator.js';
import { ARTIFACTS_DIR, defineArtifactPaths, hldArtifactPaths } from '../storage.js';
import { _setGateDepsForTests, registerCompletionHook, TeamGateRefusedError } from '../team/gate.js';
import type { GuardedAction } from '../team/gate.js';
import { _setSignoffDepsForTests } from '../team/signoff.js';
import { ToolDenied } from '../tracker/tool-denied.js';
import type { PortResult, TrackerPort } from '../tracker/port.js';
import type { TeamPolicy } from '../team/types.js';
import { approveJson } from './helpers/approve.js';
import { stampOtherPartyReview } from './helpers/other-party-review.js';
import './helpers/converted-repos.js';

afterEach(() => { _setGateDepsForTests(); _setSignoffDepsForTests(); registerCompletionHook(undefined); });

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-18T00:00:00.000Z';
const DEF = `DEF-${HASH}`;

/** An Epic with a Define and an HLD; both approved unless `approved` is false (then only the Define exists, unapproved). */
async function seed(repo: string, approved = true): Promise<void> {
	const definePaths = defineArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	mkdirSync(dirname(definePaths.json), { recursive: true });
	writeFileSync(definePaths.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'define-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			flavor: 'enhancement', problem: 'Users cannot filter todos by tag today; only status filtering exists.', nonGoals: [],
			assumptions: [{ text: 'Todos have tags', confidence: 'high', source: 'c1' }],
			constraints: [{ id: 'k1', text: 'Reuse sidebar', type: 'convention', source: 'c1' }],
			stories: [{ id: 's1', title: 'Filter by tag', userValue: 'v', acceptanceCriteria: [{ id: 'ac1', given: 'x', when: 'y', then: 'z', operationalizes: ['k1'] }] }],
			openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	if (!approved) return;
	stampOtherPartyReview(definePaths.json);
	await approveJson(definePaths.json);

	const hldPaths = hldArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering');
	mkdirSync(dirname(hldPaths.json), { recursive: true });
	writeFileSync(hldPaths.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld-run-1', schemaVersion: 1, epicHash: HASH, epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			frameworkSummary: 'Extract TagFilter service.', architectureShape: 'TagFilter owns the tag index [[c1]].',
			sharedContracts: [{ id: 'sc1', name: 'TagFilterAPI', purpose: 'Query todos by a single tag', interfaceSketch: 'interface TagFilterAPI { list(tag: string): Todo[] }', ownedByStory: 's1', consumedByStories: [], assumptions: ['c1'] }],
			storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], internal: 'index storage private' }],
			nonFunctional: { performance: 'P50 < 20ms' },
			rolloutOverview: { phases: [{ name: 'Phase A', includesStories: ['s1'], rationale: 'contract first', backwardCompat: '', featureFlag: null }], orderingRationale: 'single phase', riskyBits: [] },
			alternativesConsidered: [
				{ id: 'a1', name: 'Service', oneLineSummary: 'x', approach: 'own the index', pros: ['x'], cons: ['x'], costEstimate: 'S' },
				{ id: 'a2', name: 'Inline', oneLineSummary: 'x', approach: 'sidebar scans', pros: ['x'], cons: ['x'], costEstimate: 'XS', reasonRejected: 'perf' },
			],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'todos module' }],
	}, null, 2));
	stampOtherPartyReview(hldPaths.json);
	await approveJson(hldPaths.json);
}

const stepOutputs = (storyTitle = 'Clear the active tag filter'): Record<string, unknown> => ({
	s1: {
		decision: 'extend', scope: 'S', notify: 'Extends Epic `tag-filtering`.',
		evidence: [{ kind: 'code', ref: 'src/todos/filter.ts' }],
		target: { epicHash: HASH, epicSlug: 'tag-filtering' },
		newStory: { title: storyTitle, userValue: 'Users reset back to the full list in one click.', acceptanceCriteria: [{ given: 'a tag filter is active', when: 'the user clicks clear', then: 'all todos are shown again' }] },
		flavor: 'enhancement', flavorEvidence: { classifierHint: 'enhancement', capabilityProbeVerdict: 'clear-match', reasoning: 'covered by the Epic.' },
		analyzeBundles: [{ kind: 'capability-discovery', focus: 'is it designed?', summary: 'yes', pathsCited: ['src/todos/filter.ts'] }],
	},
	s4: { results: [{ itemId: 'x1', verdict: 'passed', evidence: 's1' }, { itemId: 'sb1', verdict: 'passed', evidence: 's1' }] },
});

const intentOf = (repo: string): WorkflowIntent => ({ workflow: 'define', focus: 'add a clear-filter button', repoPath: repo, repoIndexedAt: null, params: {} }) as WorkflowIntent;
const extend = (repo: string) => finalizeArtifact(intentOf(repo), stepOutputs(), 'run-x', 0, { acknowledged: true });

// --- the gate's world -------------------------------------------------------------------------------------------------------------

const policy = (): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

interface World { actions: GuardedAction[]; claimed: string[]; loads: number }

/** The Define is `defineStatus` for the signoff reads (the file on disk stays approved); `holder` holds the Epic issue, `me` is the actor. */
function world(opts: { defineStatus: string; holder: string | null; me?: string; noPolicy?: boolean; whoAmI?: () => PortResult<string> }): World {
	const w: World = { actions: [], claimed: [], loads: 0 };
	const me = opts.me ?? 'alice';
	const port = {
		whoAmI: opts.whoAmI ?? ((): PortResult<string> => ({ ok: true, value: me })),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: opts.holder }),
		addAssignee: (_issue: string, who: string): PortResult<string[]> => { w.claimed.push(who); return { ok: true, value: [who] }; },
	} as unknown as TrackerPort;
	const readPolicy = async () => ({ ok: true as const, value: opts.noPolicy === true ? 'none' as const : policy() });
	_setGateDepsForTests({ readPolicy, loadTracker: () => { w.loads += 1; return { ok: true, value: port }; }, resolveIssue: () => 'acme/demo#1', artifactExists: () => true });
	_setSignoffDepsForTests({ readHead: (_repo, id) => (id === DEF ? { lifecycle: { status: opts.defineStatus, revision: { number: 2 }, signoffs: [] } } : undefined), readPolicy });
	registerCompletionHook((_repo, _unit, _port, action) => { w.actions.push(action); return 'continue'; });
	return w;
}

/** What an extend writes in finalize: the appended Story and the amendment (the EXT record is written by the synthesize phase from what finalize returns). */
function written(repo: string): { stories: string[]; amendments: number } {
	const define = JSON.parse(readFileSync(defineArtifactPaths(repo, HASH, CREATED, 'epic', 'tag-filtering').json, 'utf8')) as { body: { stories: { id: string }[] } };
	const amendments = readdirSync(join(repo, ARTIFACTS_DIR)).filter(n => n.startsWith(`AMD-${HASH}-`) && n.endsWith('.json')).length;
	return { stories: define.body.stories.map(s => s.id), amendments };
}

test("the define extend path refuses a non-holder while the Define is in signoff and writes nothing, and the holder's extend is written as today", async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-extend-gate-'));
	try {
		await seed(repo);
		// someone else holds the Epic: refused as 'revise', nothing written
		let w = world({ defineStatus: 'in-signoff', holder: 'bob' });
		await assert.rejects(() => extend(repo), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'held-by-other' && e.outcome.holder === 'bob');
		assert.deepEqual(w.actions, ['revise']);
		assert.deepEqual(written(repo), { stories: ['s1'], amendments: 0 });
		// nobody holds it: refused with a claim first, and the claim is not taken
		w = world({ defineStatus: 'changes-requested', holder: null });
		await assert.rejects(() => extend(repo), (e: unknown) => e instanceof TeamGateRefusedError && /claim it before revising/.test(e.reason));
		assert.deepEqual(w.claimed, []);
		assert.deepEqual(written(repo), { stories: ['s1'], amendments: 0 });
		// the holder extends: written as today
		w = world({ defineStatus: 'in-signoff', holder: 'alice' });
		const done = await extend(repo);
		assert.equal(done.ok, true, JSON.stringify(done));
		assert.deepEqual(w.actions, ['revise']);
		assert.equal(done.ok && done.finalized.artifact !== null, true, 'the extend artifact is returned for the synthesize phase to write');
		assert.deepEqual(written(repo), { stories: ['s1', 's2'], amendments: 1 });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a repo with no team policy makes no tracker call and the extend is written as today', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-extend-gate-'));
	try {
		await seed(repo);
		const w = world({ defineStatus: 'in-signoff', holder: 'bob', noPolicy: true });
		const done = await extend(repo);
		assert.equal(done.ok, true, JSON.stringify(done));
		assert.deepEqual([w.loads, w.actions, w.claimed], [0, [], []]);
		assert.deepEqual(written(repo), { stories: ['s1', 's2'], amendments: 1 });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('an unapproved Epic fails before the gate is asked, and a denied tracker call in the gate stops the run', async () => {
	// an Epic that is not approved fails its validation, and the gate is never asked
	const unapproved = mkdtempSync(join(tmpdir(), 'insrc-extend-gate-'));
	const repo = mkdtempSync(join(tmpdir(), 'insrc-extend-gate-'));
	await seed(repo);   // seeded first: the seed's own approvals ask the gate
	try {
		await seed(unapproved, false);
		const w = world({ defineStatus: 'in-signoff', holder: 'bob' });
		const done = await extend(unapproved);
		assert.equal(done.ok, false);
		assert.deepEqual([w.loads, w.actions], [0, []]);
	} finally { rmSync(unapproved, { recursive: true, force: true }); }

	// a denied tracker call in the gate stops the run as the denial itself, and nothing is written
	try {
		const denied = new ToolDenied('gh_tracker', 'declined', {});
		world({ defineStatus: 'in-signoff', holder: 'alice', whoAmI: () => { throw denied; } });
		await assert.rejects(() => extend(repo), (e: unknown) => e === denied);
		assert.deepEqual(written(repo), { stories: ['s1'], amendments: 0 });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
