/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Everything resume verifies before it restores anything: the receiving repository, the stage, the handoff branch, the checkpoint and
 * the upstream revisions. A real bare origin, a parker's repo that really parks, and a second clone that checks.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/handoff-resume-check.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { _clearWorkflowStateStoreForTests, saveState } from '../../../daemon/steps/workflow-step/state-store.js';
import { STATE_VERSION, type WorkflowStepStatePayload } from '../../../daemon/steps/workflow-step/state.js';
import { approveAmendment, proposeAmendment } from '../../amendments/store.js';
import type { AmendmentRecord } from '../../amendments/types.js';
import { artifactJsonPath, defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import { _setGateDepsForTests, TeamGateRefusedError } from '../gate.js';
import { checkpointPath, parkDraft, resumeCheck, verifyReceivingRepo, type ResumeCheck, type ResumeDeps } from '../handoff.js';
import { snapshotUpstream } from '../run-meta.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });
afterEach(() => { _setGateDepsForTests(); _clearWorkflowStateStoreForTests(); });

const git = (cwd: string, ...a: string[]): string => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (repo: string, id: string, doc: unknown): string => { const p = artifactJsonPath(repo, id); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(doc)); return p; };
const meta = (workflow: string, revision?: number) => ({ workflow, runId: `${workflow}-1`, epicHash: HASH, epicSlug: 'tag-filtering', storyId: 's1', approvedAt: '2026-10-18T00:00:00.000Z', ...(revision !== undefined ? { revision } : {}) });
const hldBody = {
	frameworkSummary: 'x', architectureShape: 'x',
	sharedContracts: [{ id: 'sc1', name: 'API', purpose: 'p', interfaceSketch: 'interface API { fn(): void; }', ownedByStory: 's1', consumedByStories: [], assumptions: [] }],
	storyBoundaries: [{ storyId: 's1', owns: ['sc1'], depends: [], interna: 'x' }], nonFunctional: {}, rolloutOverview: { phases: [], orderingRationale: 'x', riskyBits: [] },
	alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [],
};

interface World { root: string; origin: string; parker: string; recv: string; tmp: string; unit: (repo: string, story?: string) => UnitRef; notes: string[]; actor: { who: string; holder: string | null } }

/** A bare origin with a main branch holding the Define and HLD (revisions 3 and 5), the parker's clone and a second clone. */
function mkWorld(): World {
	const root = mkdtempSync(join(tmpdir(), 'insrc-resume-check-'));
	const origin = join(root, 'origin.git'), parker = join(root, 'parker'), recv = join(root, 'recv'), tmp = join(root, 'tmp');
	mkdirSync(tmp); mkdirSync(parker);
	git(root, 'init', '--bare', '-q', '-b', 'main', origin);
	git(parker, 'init', '-q', '-b', 'main'); git(parker, 'config', 'user.email', 'a@t'); git(parker, 'config', 'user.name', 'alice'); git(parker, 'config', 'commit.gpgsign', 'false');
	put(parker, defineArtifactId(HASH), { meta: meta('define', 3), body: {}, citations: [] });
	put(parker, hldArtifactId(HASH), { meta: { ...meta('design.epic', 5), runId: 'hld-run-1' }, body: hldBody, citations: [] });
	git(parker, 'add', '-A'); git(parker, 'commit', '-qm', 'upstream artifacts');
	git(parker, 'remote', 'add', 'origin', origin); git(parker, 'push', '-q', 'origin', 'main');
	git(root, 'clone', '-q', origin, recv); git(recv, 'config', 'user.email', 'b@t'); git(recv, 'config', 'user.name', 'bob'); git(recv, 'config', 'commit.gpgsign', 'false');
	const notes: string[] = [];
	const actor = { who: 'alice', holder: 'bob' as string | null };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: actor.who }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: actor.holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: [actor.who] }),
		issueOps: { comment: (_i: string, body: string): PortResult<void> => { notes.push(body); return { ok: true, value: undefined }; } },
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy: team, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7', ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'x' }), artifactExists: () => true });
	return { root, origin, parker, recv, tmp, notes, actor, unit: (repo, story = 's1') => ({ unit: 'story', repoPath: repo, epicHash: HASH, storyId: story }) };
}

/** The parker parks a run (and its uncommitted LLD draft) from the world; afterwards the actor is bob, who now holds the Story. */
async function parkRun(w: World, opts: { run?: boolean } = {}): Promise<void> {
	const params = { epicHash: HASH, storyId: 's1' };
	if (opts.run !== false) {
		const payload: WorkflowStepStatePayload = {
			version: STATE_VERSION, runId: 'wf-1', epicKey: HASH, startedAtMs: 1, stage: 'awaiting_llm_step',
			intent: { workflow: 'design.story', focus: 'f', repoPath: w.parker, repoIndexedAt: null, params },
			executor: { runId: 'wf-1', nextStepIndex: 2, plan: { workflow: 'design.story', steps: [] }, stepOutputs: { s1: { text: `see ${w.parker}/a.ts` } }, intent: { workflow: 'design.story', focus: 'f', repoPath: w.parker, repoIndexedAt: null, params } },
		};
		saveState(payload, { owner: 'alice', upstream: snapshotUpstream(w.parker, 'design.story', params) });
	}
	put(w.parker, lldArtifactId(HASH, 's1'), { draft: 'lld' });
	const parked = await parkDraft(w.parker, w.unit(w.parker), {}, { branchPattern: () => undefined, tmpRoot: w.tmp });
	assert.equal(parked.ok, true, parked.ok ? '' : parked.reason);
	_clearWorkflowStateStoreForTests();
	w.actor.who = 'bob';
}

const depsFor = (w: World, repos?: string[]): ResumeDeps => ({ branchPattern: () => undefined, tmpRoot: w.tmp, listRepos: async () => (repos ?? [w.recv]).map(path => ({ path })) });
const check = (w: World, over: { repo?: string; unit?: UnitRef; workflow?: string; deps?: ResumeDeps } = {}): Promise<ResumeCheck> =>
	resumeCheck(over.repo ?? w.recv, over.unit ?? w.unit(over.repo ?? w.recv), over.workflow !== undefined ? { workflow: over.workflow } : {}, over.deps ?? depsFor(w));
const reason = (r: ResumeCheck): string => (r.kind === 'refused' || r.kind === 'nothing-to-resume' || r.kind === 'restart' ? r.reason : r.kind);
const untouched = (dir: string): { refs: string; status: string; fetchHead: boolean } => ({ refs: git(dir, 'for-each-ref'), status: git(dir, 'status', '--porcelain', '--untracked-files=all'), fetchHead: existsSync(join(dir, '.git', 'FETCH_HEAD')) });

test('resumeCheck refuses an unregistered receiving path and a clone of a different repository before restoring anything, and refuses a moved upstream including the effective HLD and the Define', async () => {
	const w = mkWorld();
	try {
		await parkRun(w);

		// the baseline: a registered clone of the same repository gets a verified plan, and no working file is written
		const before = untouched(w.recv);
		const ok = await check(w);
		assert.equal(ok.kind, 'resume', reason(ok));
		if (ok.kind !== 'resume') return;
		assert.equal(ok.plan.workflow, 'design.story');
		assert.equal(ok.plan.branch, `insrc/handoff/story-${HASH}-s1`);
		assert.deepEqual(ok.plan.files.map(f => f.path), [`.insrc/artifacts/${lldArtifactId(HASH, 's1')}.json`]);
		assert.equal(ok.plan.files[0]?.content, '{"draft":"lld"}');
		assert.equal(ok.plan.checkpoint.owner, 'alice');
		assert.deepEqual(untouched(w.recv), before, 'checking changed nothing: no file, no ref left behind');
		assert.equal(existsSync(artifactJsonPath(w.recv, lldArtifactId(HASH, 's1'))), false, 'the draft was not restored by the check');

		// an unregistered path is refused before the remote is even asked
		const unregistered = await check(w, { deps: depsFor(w, ['/some/other/repo']) });
		assert.equal(unregistered.kind, 'refused');
		assert.match(reason(unregistered), /is not a repository registered with the daemon/);
		assert.deepEqual(untouched(w.recv), before);
		const noRegistry = await check(w, { deps: { ...depsFor(w), listRepos: async () => { throw new Error('registry down'); } } });
		assert.match(reason(noRegistry), /registry could not be read: registry down/);
		assert.deepEqual(await verifyReceivingRepo(w.recv, undefined, { listRepos: async () => [{ path: w.recv + '/' }] }), { ok: true }, 'a trailing slash is the same path');

		// a registered path that is not a repository with history has no identity at all: refused before the remote is asked anything
		const empty = join(w.root, 'empty'); mkdirSync(empty); git(empty, 'init', '-q', '-b', 'main'); git(empty, 'remote', 'add', 'origin', w.origin);
		const emptyBefore = untouched(empty);
		const noHistory = await check(w, { repo: empty, deps: depsFor(w, [empty]) });
		assert.equal(noHistory.kind, 'refused');
		assert.match(reason(noHistory), /is not a git repository with history/);
		assert.deepEqual(untouched(empty), emptyBefore, 'the remote was not even fetched from');
		const notGit = join(w.root, 'plain-dir'); mkdirSync(notGit);
		assert.match(reason(await check(w, { repo: notGit, deps: depsFor(w, [notGit]) })), /is not a git repository with history/);

		// a clone of a different repository (unrelated history that can fetch the same branch) is refused after the fetch and before any restore
		const other = join(w.root, 'other');
		mkdirSync(other); git(other, 'init', '-q', '-b', 'main'); git(other, 'config', 'user.email', 'o@t'); git(other, 'config', 'user.name', 'o'); git(other, 'config', 'commit.gpgsign', 'false');
		writeFileSync(join(other, 'x.txt'), 'x'); git(other, 'add', '-A'); git(other, 'commit', '-qm', 'unrelated');
		git(other, 'remote', 'add', 'origin', w.origin);
		const otherBefore = untouched(other);
		const different = await check(w, { repo: other, deps: depsFor(w, [other]) });
		assert.equal(different.kind, 'refused');
		assert.match(reason(different), /is a different repository from the one the draft was parked from/);
		assert.deepEqual(untouched(other), otherBefore, 'nothing left in the other repository, not even the temporary ref');
		const unrelatedId = await verifyReceivingRepo(other, 'f'.repeat(40), { listRepos: async () => [{ path: other }] });
		assert.equal(unrelatedId.ok, false);

		// the upstream moved: the Define's revision changed on the receiving clone
		const defPath = artifactJsonPath(w.recv, defineArtifactId(HASH));
		const defOriginal = readFileSync(defPath, 'utf8');
		writeFileSync(defPath, JSON.stringify({ meta: meta('define', 4), body: {}, citations: [] }));
		const movedDef = await check(w);
		assert.equal(movedDef.kind, 'refused');
		assert.match(reason(movedDef), /the upstream moved since this run started: .*DEF-a3f4b8c9d1e2f3a4 @ revision 3 \(parked\).*DEF-a3f4b8c9d1e2f3a4 @ revision 4 \(now\)/);
		// revision 0 on one side and not the other counts as moved
		writeFileSync(defPath, JSON.stringify({ meta: meta('define'), body: {}, citations: [] }));
		assert.match(reason(await check(w)), /DEF-a3f4b8c9d1e2f3a4 @ revision 0 \(now\)/);
		writeFileSync(defPath, defOriginal);
		assert.equal((await check(w)).kind, 'resume', 'back to the parked revisions: fine again');

		// the effective HLD moved: an amendment was approved on the receiving clone
		const amendment: AmendmentRecord = {
			id: `AMD-${HASH}-1`, epicHash: HASH, epicSlug: 'tag-filtering', hldBaseRunId: 'hld-run-1',
			amendment: { type: 'sharedContract.fieldAdd', contractId: 'sc1', field: { name: 'batchSize', type: 'number', optional: true, purpose: 'batching' }, breaking: false },
			rationale: 'r', citations: [], proposedBy: { workflow: 'design.story', runId: 'x', storyId: 's2', stepId: 's4' }, proposedAt: new Date().toISOString(), status: 'pending',
		};
		proposeAmendment(w.recv, amendment);
		assert.equal((await check(w)).kind, 'resume', 'a pending amendment changes nothing');
		approveAmendment(w.recv, amendment.id, 'bob');
		const movedHld = await check(w);
		assert.equal(movedHld.kind, 'refused');
		assert.match(reason(movedHld), /the upstream moved since this run started: .*HLD-a3f4b8c9d1e2f3a4@\w+ @ revision 5 \(parked\).*HLD-a3f4b8c9d1e2f3a4@\w+ @ revision 5 \(now\)/);
	} finally { rmSync(w.root, { recursive: true, force: true }); }
});

test('a missing branch returns restart, a network failure is refused, a committed LLD with no PLAN resumes as plan, both committed is nothing-to-resume, and an unknown schema, unit mismatch, outside path and dirty file are each refused', async () => {
	const w = mkWorld();
	try {
		await parkRun(w);
		const noTemp = (): void => assert.equal(git(w.recv, 'for-each-ref', 'refs/insrc'), '', 'the temporary ref is always dropped');

		// a missing branch (Story s2 was never parked) returns restart for the stage that is next
		const missing = await check(w, { unit: w.unit(w.recv, 's2') });
		assert.equal(missing.kind, 'restart');
		if (missing.kind === 'restart') { assert.equal(missing.workflow, 'design.story'); assert.deepEqual(missing.params, { epicHash: HASH, storyId: 's2' }); assert.match(missing.reason, /nothing was parked/); assert.equal(missing.restore, undefined); }

		// with the LLD committed and no PLAN the stage is plan; with both committed there is nothing to resume
		const commit = (id: string): void => { put(w.recv, id, { committed: id }); git(w.recv, 'add', '-A'); git(w.recv, 'commit', '-qm', id); };
		commit(lldArtifactId(HASH, 's2'));
		const plan = await check(w, { unit: w.unit(w.recv, 's2') });
		assert.equal(plan.kind, 'restart');
		if (plan.kind === 'restart') assert.equal(plan.workflow, 'plan');
		commit(planArtifactId(HASH, 's2'));
		const done = await check(w, { unit: w.unit(w.recv, 's2') });
		assert.equal(done.kind, 'nothing-to-resume');
		// an explicit stage that is already committed is nothing to resume too, and the stage must fit the unit
		assert.equal((await check(w, { unit: w.unit(w.recv, 's2'), workflow: 'plan' })).kind, 'nothing-to-resume');
		assert.match(reason(await check(w, { workflow: 'design.epic' })), /does not belong to this story/);
		assert.match(reason(await check(w, { workflow: 'build' })), /is not a stage that can be resumed/);
		assert.match(reason(await check(w, { workflow: 'plan' })), /no committed LLD yet/);
		const epic: UnitRef = { unit: 'epic', repoPath: w.recv, epicHash: HASH };
		assert.equal((await check(w, { unit: epic })).kind, 'nothing-to-resume', 'the Epic already has its committed HLD');
		assert.match(reason(await check(w, { unit: { ...w.unit(w.recv), unit: 'task', taskId: 't1' } })), /a Task has no run to resume/);

		// a network failure is refused with git's message; it is not mistaken for a missing branch
		const goodUrl = git(w.recv, 'remote', 'get-url', 'origin');
		git(w.recv, 'remote', 'set-url', 'origin', join(w.root, 'does-not-exist.git'));
		const down = await check(w);
		assert.equal(down.kind, 'refused');
		assert.match(reason(down), /the remote 'origin' could not be reached to look for the handoff branch: .*does-not-exist/s);
		git(w.recv, 'remote', 'set-url', 'origin', goodUrl);

		// bad checkpoints, each pushed to the Story's handoff branch by a helper clone
		const helper = join(w.root, 'helper');
		git(w.root, 'clone', '-q', w.origin, helper); git(helper, 'config', 'user.email', 'h@t'); git(helper, 'config', 'user.name', 'h'); git(helper, 'config', 'commit.gpgsign', 'false');
		const pushCheckpoint = (story: string, cp: unknown, file = checkpointPath({ epicHash: HASH, storyId: story })): void => {
			git(helper, 'checkout', '-q', '-B', `h-${story}`, 'origin/main');
			mkdirSync(dirname(join(helper, file)), { recursive: true });
			writeFileSync(join(helper, file), typeof cp === 'string' ? cp : JSON.stringify(cp));
			git(helper, 'add', '-A'); git(helper, 'commit', '-qm', 'bad'); git(helper, 'push', '-qf', 'origin', `h-${story}:refs/heads/insrc/handoff/story-${HASH}-${story}`);
		};
		const root1 = git(w.recv, 'rev-list', '--max-parents=0', 'HEAD');
		const goodDraft = (story: string, over: Record<string, unknown> = {}) => ({ schemaVersion: 1, kind: 'draft', portable: true, unit: { epicHash: HASH, storyId: story }, parkedBy: 'alice', parkedAt: 't', sourceHead: 'h', repositoryId: root1, artifactPaths: [], ...over });
		pushCheckpoint('s3', goodDraft('s3', { schemaVersion: 9 }));
		assert.match(reason(await check(w, { unit: w.unit(w.recv, 's3') })), /unknown checkpoint schemaVersion 9/);
		pushCheckpoint('s4', goodDraft('s5'));
		assert.match(reason(await check(w, { unit: w.unit(w.recv, 's4') })), /different unit/);
		pushCheckpoint('s5', goodDraft('s5', { artifactPaths: ['src/evil.ts'] }));
		assert.match(reason(await check(w, { unit: w.unit(w.recv, 's5') })), /outside the unit's own artifacts: src\/evil\.ts/);
		pushCheckpoint('s6', '{ not json');
		assert.match(reason(await check(w, { unit: w.unit(w.recv, 's6') })), /is not valid JSON/);
		pushCheckpoint('s7', 'ignored', 'README-only.txt');
		assert.match(reason(await check(w, { unit: w.unit(w.recv, 's7') })), /has no checkpoint at/);
		noTemp();

		// a dirty target file is refused, naming the file and writing nothing
		const llDraft = artifactJsonPath(w.recv, lldArtifactId(HASH, 's1'));
		mkdirSync(dirname(llDraft), { recursive: true });
		writeFileSync(llDraft, '{"mine":"local work"}');
		const dirty = await check(w);
		assert.equal(dirty.kind, 'refused');
		assert.match(reason(dirty), /these files have local changes that a resume would overwrite: \.insrc\/artifacts\/LLD-a3f4b8c9d1e2f3a4-s1\.json; commit or stash them first/);
		assert.equal(readFileSync(llDraft, 'utf8'), '{"mine":"local work"}', 'the local file was not touched');
		rmSync(llDraft);
		noTemp();

		// a draft-only checkpoint returns restart with the files to restore
		const w2 = w; _clearWorkflowStateStoreForTests();
		w2.actor.who = 'alice';
		put(w.parker, lldArtifactId(HASH, 's1'), { draft: 'lld v2' });
		const parkedAgain = await parkDraft(w.parker, w.unit(w.parker), {}, { branchPattern: () => undefined, tmpRoot: w.tmp });
		assert.equal(parkedAgain.ok && parkedAgain.variant, 'draft');
		w2.actor.who = 'bob';
		const draftOnly = await check(w);
		assert.equal(draftOnly.kind, 'restart');
		if (draftOnly.kind === 'restart') { assert.equal(draftOnly.workflow, 'design.story'); assert.equal(draftOnly.restore?.files[0]?.content, '{"draft":"lld v2"}'); assert.equal(draftOnly.restore?.checkpoint.kind, 'draft'); }
		noTemp();

		// the gate: a Story someone else holds throws; a repo that does not enforce claims is refused
		w.actor.holder = 'carol';
		await assert.rejects(() => check(w), (err: unknown) => err instanceof TeamGateRefusedError && /held by carol/.test(err.reason));
		w.actor.holder = 'bob';
		_setGateDepsForTests({ readPolicy: none });
		assert.match(reason(await check(w)), /does not enforce claims/);
		noTemp();
	} finally { rmSync(w.root, { recursive: true, force: true }); }
});
