/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The pure parts of a handoff: the branch name, checkpoint validation, rebinding to the receiving clone, and stage inference.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/handoff-pure.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { WorkflowStepStatePayload } from '../../../daemon/steps/workflow-step/state.js';
import { artifactJsonPath, hldArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import {
	CHECKPOINT_SCHEMA_VERSION, DEFAULT_BRANCH_PATTERN, REPO_ROOT_TOKEN, buildRunCheckpoint, handoffBranchName, inferStageWorkflow, isUnitArtifactPath, portablePaths, rebindCheckpoint, validateCheckpoint,
	type HandoffUnit, type RunCheckpoint,
} from '../handoff.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const STORY: HandoffUnit = { epicHash: HASH, storyId: 's1' };
const EPIC: HandoffUnit = { epicHash: HASH };
const PARKER = '/home/parker/work/repo';
const WORK_ITEM = `docs/epics/tag-filtering-E20260718${HASH.slice(0, 8)}`;

test('handoffBranchName fills placeholders, applies the default, rejects a grammar break and a pattern without {id}', () => {
	// the default pattern, for a Story and for an Epic
	assert.deepEqual(handoffBranchName(undefined, STORY, 'Tag filtering'), { ok: true, name: `insrc/handoff/story-${HASH}-s1` });
	assert.deepEqual(handoffBranchName('', EPIC, 'x'), { ok: true, name: `insrc/handoff/epic-${HASH}` });
	assert.equal(DEFAULT_BRANCH_PATTERN, 'insrc/handoff/{type}-{id}');

	// placeholders: {slug} is lower-cased and made branch-safe; the name is the same every time
	const custom = handoffBranchName('team/{type}/{slug}-{id}', STORY, 'Tag Filtering & more!');
	assert.deepEqual(custom, { ok: true, name: `team/story/tag-filtering-more-${HASH}-s1` });
	assert.deepEqual(handoffBranchName('team/{type}/{slug}-{id}', STORY, 'Tag Filtering & more!'), custom);
	assert.notEqual((handoffBranchName(undefined, STORY, 'x') as { name: string }).name, (handoffBranchName(undefined, { epicHash: HASH, storyId: 's2' }, 'x') as { name: string }).name, 'two Stories never share a branch');

	// a pattern that breaks the grammar is refused with the rule's message
	for (const bad of ['/lead-{id}', 'trail-{id}/', 'a//{id}', 'a..{id}', '{id}.lock', 'sp ace-{id}', '{nope}-{id}', 'open-{id']) {
		const r = handoffBranchName(bad, STORY, 'x');
		assert.equal(r.ok, false, bad);
		if (!r.ok) assert.match(r.reason, /^the branch pattern /, bad);
	}
	// a pattern without {id} cannot tell two units apart
	const noId = handoffBranchName('insrc/handoff/{type}-{slug}', STORY, 'x');
	assert.equal(noId.ok, false);
	if (!noId.ok) assert.match(noId.reason, /does not identify the unit/);
	// an empty slug leaves a doubled slash in the name: refused, not silently repaired
	const empty = handoffBranchName('team/{slug}/{id}', STORY, '!!!');
	assert.equal(empty.ok, false);
	if (!empty.ok) assert.match(empty.reason, /slash/);
	// a name over 200 characters
	assert.equal(handoffBranchName('{slug}-{id}', STORY, 'x'.repeat(300)).ok, false);
});

function runCheckpoint(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		schemaVersion: CHECKPOINT_SCHEMA_VERSION, kind: 'run', portable: true, unit: { epicHash: HASH, storyId: 's1' },
		parkedBy: 'alice', parkedAt: '2026-10-18T10:00:00.000Z', sourceHead: 'abc123', repositoryId: 'root1',
		artifactPaths: [`.insrc/artifacts/${lldArtifactId(HASH, 's1')}.json`, `${WORK_ITEM}/S001/LLD.md`],
		runId: 'wf-1', epicKey: HASH, stage: 'awaiting_llm_step',
		intent: { workflow: 'design.story', focus: 'f', params: { epicHash: HASH, storyId: 's1' } },
		executor: { runId: 'wf-1', plan: { workflow: 'design.story', steps: [] }, nextStepIndex: 2, stepOutputs: { s1: { ok: true } } },
		owner: 'alice', upstream: [{ artifactId: `DEF-${HASH}`, revision: 3 }],
		...over,
	};
}

test("checkpoint validation rejects an unknown schemaVersion or kind, a unit mismatch and a path outside the unit's artifact paths, for the run and draft variants", () => {
	const ok = validateCheckpoint(runCheckpoint(), STORY);
	assert.equal(ok.ok, true);
	const draft = { schemaVersion: 1, kind: 'draft', portable: true, unit: { epicHash: HASH, storyId: 's1' }, parkedBy: 'alice', parkedAt: 't', sourceHead: 'h', repositoryId: 'r', artifactPaths: [`.insrc/artifacts/${planArtifactId(HASH, 's1')}.json`] };
	assert.equal(validateCheckpoint(draft, STORY).ok, true);

	const reason = (raw: unknown, unit: HandoffUnit = STORY): string => { const r = validateCheckpoint(raw, unit); return r.ok ? 'OK' : r.reason; };
	// version, kind, unit
	assert.match(reason(runCheckpoint({ schemaVersion: 2 })), /unknown checkpoint schemaVersion 2/);
	assert.match(reason(runCheckpoint({ kind: 'weird' })), /unknown checkpoint kind 'weird'/);
	assert.match(reason({ ...draft, schemaVersion: 0 }), /schemaVersion/);
	assert.match(reason(runCheckpoint(), { epicHash: HASH, storyId: 's2' }), /different unit/);
	assert.match(reason(runCheckpoint(), EPIC), /different unit/);
	assert.match(reason(runCheckpoint({ unit: { epicHash: 'ffffffffffffffff', storyId: 's1' } })), /different unit/);
	assert.match(reason('nope'), /not an object/);

	// a checkpoint that was not made portable is refused, whatever else it holds
	assert.match(reason(runCheckpoint({ portable: undefined })), /not made portable/);
	assert.match(reason({ ...draft, portable: false }), /not made portable/);

	// the draft variant is held to the same checks
	assert.match(reason({ ...draft, kind: 'weird' }), /unknown checkpoint kind/);
	assert.match(reason({ ...draft, unit: { epicHash: HASH, storyId: 's2' } }), /different unit/);
	assert.match(reason({ ...draft, unit: { epicHash: HASH } }), /different unit/);
	assert.match(reason({ ...draft, parkedBy: '' }), /no parkedBy/);

	// paths: both variants refuse a file that is not the unit's own
	for (const bad of ['../outside.json', '/etc/passwd', 'src/workflow/team/gate.ts', `.insrc/artifacts/${lldArtifactId(HASH, 's2')}.json`, `.insrc/artifacts/LLD-ffffffffffffffff-s1.json`, `${WORK_ITEM}/S002/LLD.md`, 'docs/epics/x-E20260718deadbeef/S001/LLD.md', `${WORK_ITEM}/S001/../S002/LLD.md`, 'C:\\x.json', `${WORK_ITEM}/./HLD.md`, `${WORK_ITEM}/./S001/LLD.md`, `${WORK_ITEM}//S001/LLD.md`, `.insrc/artifacts/./${lldArtifactId(HASH, 's1')}.json`]) {
		assert.match(reason(runCheckpoint({ artifactPaths: [bad] })), /outside the unit's own artifacts/, bad);
		assert.match(reason({ ...draft, artifactPaths: [bad] }), /outside the unit's own artifacts/, bad);
	}
	assert.equal(isUnitArtifactPath(EPIC, `${WORK_ITEM}/HLD.md`), true);
	assert.equal(isUnitArtifactPath(EPIC, `${WORK_ITEM}/S001/LLD.md`), false, "an Epic does not own a Story's folder");
	assert.equal(isUnitArtifactPath(STORY, `${WORK_ITEM}/HLD.md`), false, "a Story does not own the Epic's files");
	assert.equal(isUnitArtifactPath(EPIC, `.insrc/artifacts/${hldArtifactId(HASH)}.json`), true);

	// the run variant's own fields
	assert.match(reason(runCheckpoint({ stage: 'done' })), /unknown run stage/);
	assert.match(reason(runCheckpoint({ owner: undefined })), /no owner/);
	assert.match(reason(runCheckpoint({ upstream: 'x' })), /no upstream snapshot/);
	assert.match(reason(runCheckpoint({ intent: { workflow: 'plan', focus: 'f', params: {}, repoPath: PARKER } })), /parker's machine paths/);
	assert.match(reason(runCheckpoint({ executor: undefined })), /no usable executor state/);
	assert.match(reason(runCheckpoint({ stage: 'awaiting_plan' })), /must not carry executor state/);
	assert.match(reason(runCheckpoint({ stage: 'awaiting_synthesize', executor: undefined })), /no stepOutputs/);
	assert.match(reason(runCheckpoint({ stage: 'awaiting_plan', executor: undefined, stepOutputs: {} })), /must not carry stepOutputs/);
});

test('rebindCheckpoint replaces repoPath and repoIndexedAt in both intents, resets startedAtMs and leaves no parker path, for all three stages, and inferStageWorkflow follows the committed artifact chain', () => {
	const binding = { repoPath: '/Users/bob/clone', repoIndexedAt: 12345, now: 999 };
	const asRun = (over: Record<string, unknown>): RunCheckpoint => {
		const v = validateCheckpoint(runCheckpoint(over), STORY);
		assert.equal(v.ok, true);
		return (v as { ok: true; checkpoint: RunCheckpoint }).checkpoint;
	};

	// awaiting_llm_step: the executor intent is rebound too, and the step state is kept
	const mid = rebindCheckpoint(asRun({}), binding);
	assert.equal(mid.version, 1);
	assert.equal(mid.startedAtMs, 999);
	assert.equal(mid.stage, 'awaiting_llm_step');
	assert.equal(mid.intent.repoPath, '/Users/bob/clone');
	assert.equal(mid.intent.repoIndexedAt, 12345);
	assert.equal(mid.executor?.intent.repoPath, '/Users/bob/clone');
	assert.equal(mid.executor?.intent.repoIndexedAt, 12345);
	assert.equal(mid.executor?.nextStepIndex, 2);
	assert.deepEqual(mid.executor?.stepOutputs, { s1: { ok: true } });
	assert.equal(mid.stepOutputs, undefined);
	assert.equal(JSON.stringify(mid).includes(PARKER), false, 'no parker path anywhere in the payload');

	// awaiting_plan: no executor yet
	const early = rebindCheckpoint(asRun({ stage: 'awaiting_plan', executor: undefined }), binding);
	assert.equal(early.stage, 'awaiting_plan');
	assert.equal(early.executor, undefined);
	assert.equal(early.intent.repoPath, '/Users/bob/clone');
	assert.equal(JSON.stringify(early).includes(PARKER), false);

	// awaiting_synthesize: the finished step outputs are kept
	const late = rebindCheckpoint(asRun({ stage: 'awaiting_synthesize', executor: undefined, stepOutputs: { s1: 1, s2: 2 } }), binding);
	assert.equal(late.stage, 'awaiting_synthesize');
	assert.deepEqual(late.stepOutputs, { s1: 1, s2: 2 });
	assert.equal(late.executor, undefined);
	assert.equal(late.intent.repoIndexedAt, 12345);
	assert.equal(JSON.stringify(late).includes(PARKER), false);

	// a path the parker's step outputs quote is made portable at park time and becomes the receiving clone's path when rebound
	const quoted = { pathsCited: [`${PARKER}/src/todos/filter.ts`, `${PARKER}2/other.ts`, 'src/relative.ts'], note: `see ${PARKER}.` };
	const scrubbed = portablePaths(quoted, PARKER);
	assert.deepEqual(scrubbed, { pathsCited: [`${REPO_ROOT_TOKEN}/src/todos/filter.ts`, `${PARKER}2/other.ts`, 'src/relative.ts'], note: `see ${REPO_ROOT_TOKEN}.` });
	assert.equal(/\/home\/parker\/work\/repo(?![0-9A-Za-z_-])/.test(JSON.stringify(scrubbed)), false, 'only the sibling repo2 path (a different directory) is left');
	assert.deepEqual(portablePaths(quoted, ''), quoted, 'an empty path scrubs nothing');
	const withPaths = asRun({
		intent: { workflow: 'design.story', focus: `work in ${REPO_ROOT_TOKEN}`, params: { epicHash: HASH, storyId: 's1', dir: `${REPO_ROOT_TOKEN}/docs` } },
		executor: { runId: 'wf-1', plan: { workflow: 'design.story', steps: [] }, nextStepIndex: 1, stepOutputs: { s1: scrubbed } },
	});
	const rebound = rebindCheckpoint(withPaths, binding);
	assert.deepEqual(rebound.executor?.stepOutputs['s1'], { pathsCited: ['/Users/bob/clone/src/todos/filter.ts', `${PARKER}2/other.ts`, 'src/relative.ts'], note: 'see /Users/bob/clone.' });
	assert.equal(rebound.intent.params['dir'], '/Users/bob/clone/docs');
	assert.equal(rebound.intent.focus, 'work in /Users/bob/clone');
	assert.equal(JSON.stringify(rebound).includes(REPO_ROOT_TOKEN), false, 'no token is left');
	const lateWithPaths = rebindCheckpoint(asRun({ stage: 'awaiting_synthesize', executor: undefined, stepOutputs: { s1: scrubbed } }), binding);
	assert.deepEqual((lateWithPaths.stepOutputs?.['s1'] as { note: string }).note, 'see /Users/bob/clone.');
	assert.equal(JSON.stringify(lateWithPaths).includes(`"${PARKER}/`), false);

	// end to end: a live run whose params, executor state and step outputs quote the parker's full path is built into a checkpoint,
	// validated, and rebound; the parker's path survives nowhere and the receiving path is in its place
	const live: WorkflowStepStatePayload = {
		version: 1, runId: 'wf-9', epicKey: HASH, startedAtMs: 111, stage: 'awaiting_llm_step',
		intent: { workflow: 'design.story', focus: `read ${PARKER}/docs`, repoPath: PARKER, repoIndexedAt: 777, params: { epicHash: HASH, storyId: 's1', root: PARKER, files: [`${PARKER}/a.ts`] } },
		executor: {
			runId: 'wf-9', nextStepIndex: 1, plan: { workflow: 'design.story', steps: [{ id: 's1', runner: 'context.assemble', params: { dir: PARKER } }] },
			stepOutputs: { s1: { summary: `found in ${PARKER}/src`, [`${PARKER}/key`]: 1 } },
			intent: { workflow: 'design.story', focus: 'x', repoPath: PARKER, repoIndexedAt: 777, params: {} },
		},
	};
	const built = buildRunCheckpoint({
		unit: STORY, parkedBy: 'alice', parkedAt: 't', sourceHead: 'h', repositoryId: 'r', artifactPaths: [], payload: live, owner: 'alice', upstream: [],
	});
	assert.equal(built.portable, true);
	assert.equal(JSON.stringify(built).includes(PARKER), false, 'the built checkpoint carries no parker path');
	assert.equal('repoPath' in built.intent || 'repoIndexedAt' in built.intent, false);
	assert.equal(built.executor !== undefined && 'intent' in built.executor, false);
	const checked = validateCheckpoint(JSON.parse(JSON.stringify(built)), STORY);
	assert.equal(checked.ok, true, checked.ok ? '' : checked.reason);
	const landed = rebindCheckpoint((checked as { ok: true; checkpoint: RunCheckpoint }).checkpoint, binding);
	assert.equal(JSON.stringify(landed).includes(PARKER), false, 'no parker path after rebinding');
	assert.equal(JSON.stringify(landed).includes(REPO_ROOT_TOKEN), false, 'no token left after rebinding');
	assert.equal(landed.intent.params['root'], '/Users/bob/clone');
	assert.deepEqual(landed.intent.params['files'], ['/Users/bob/clone/a.ts']);
	assert.equal((landed.executor?.stepOutputs['s1'] as Record<string, unknown>)['summary'], 'found in /Users/bob/clone/src');
	assert.equal((landed.executor?.stepOutputs['s1'] as Record<string, unknown>)['/Users/bob/clone/key'], 1, 'keys are rebound too');
	assert.equal(landed.intent.repoPath, '/Users/bob/clone');
	assert.equal(landed.executor?.intent.repoIndexedAt, 12345);

	// a different indexing state on the receiving side is respected as given
	assert.equal(rebindCheckpoint(asRun({}), { ...binding, repoIndexedAt: null }).intent.repoIndexedAt, null);

	// stage inference follows the artifacts COMMITTED at HEAD: a file only in the working tree does not count
	const repo = mkdtempSync(join(tmpdir(), 'insrc-infer-'));
	try {
		const git = (...a: string[]): void => { execFileSync('git', a, { cwd: repo, stdio: 'ignore' }); };
		git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
		writeFileSync(join(repo, 'README.md'), 'x'); git('add', '-A'); git('commit', '-qm', 'init');
		const put = (id: string, commit: boolean): void => {
			const p = artifactJsonPath(repo, id); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, '{}');
			if (commit) { git('add', '-A'); git('commit', '-qm', id); }
		};
		const story = { ...STORY, repoPath: repo, unit: 'story' as const };
		const epic = { ...EPIC, repoPath: repo, unit: 'epic' as const };
		assert.equal(inferStageWorkflow(repo, epic), 'design.epic');
		assert.equal(inferStageWorkflow(repo, story), 'design.story');
		put(hldArtifactId(HASH), false);
		assert.equal(inferStageWorkflow(repo, epic), 'design.epic', 'an HLD that is only a local draft is not a committed stage');
		git('add', '-A'); git('commit', '-qm', 'hld');
		assert.equal(inferStageWorkflow(repo, epic), 'complete');
		assert.equal(inferStageWorkflow(repo, story), 'design.story', 'the Epic being complete says nothing about the Story');
		put(lldArtifactId(HASH, 's1'), true);
		assert.equal(inferStageWorkflow(repo, story), 'plan', 'a committed LLD does not hide an unfinished plan');
		put(planArtifactId(HASH, 's1'), false);
		assert.equal(inferStageWorkflow(repo, story), 'plan', 'an uncommitted PLAN is a draft, not a completed stage');
		git('add', '-A'); git('commit', '-qm', 'plan');
		assert.equal(inferStageWorkflow(repo, story), 'complete');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
