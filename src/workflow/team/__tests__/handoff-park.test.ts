/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parking, carried out against a real repository with a real bare origin: the draft and its checkpoint reach the handoff
 * branch through a temporary worktree, one note goes to the issue, and the parker's checkout is never touched.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/handoff-park.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { _clearWorkflowStateStoreForTests, listStates, saveState } from '../../../daemon/steps/workflow-step/state-store.js';
import { STATE_VERSION, type WorkflowStepStatePayload } from '../../../daemon/steps/workflow-step/state.js';
import { artifactJsonPath, lldArtifactId } from '../../storage.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import { _setGateDepsForTests } from '../gate.js';
import { checkpointPath, parkDraft, validateCheckpoint, type ParkDeps, type ParkResult } from '../handoff.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const BRANCH = `insrc/handoff/story-${HASH}-s1`;
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });

afterEach(() => { _setGateDepsForTests(); _clearWorkflowStateStoreForTests(); });

interface Env {
	root: string; repo: string; origin: string; tmp: string; unit: UnitRef;
	git: (...a: string[]) => string; ogit: (...a: string[]) => string;
	draft: string; mdDraft: string; notes: string[]; noteResult: { fail: boolean };
}

function git(cwd: string, ...a: string[]): string {
	return execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function mkEnv(): Env {
	const root = mkdtempSync(join(tmpdir(), 'insrc-park-'));
	const origin = join(root, 'origin.git');
	const repo = join(root, 'repo');
	const tmp = join(root, 'tmp');
	mkdirSync(tmp); mkdirSync(repo);
	git(root, 'init', '--bare', '-q', origin);
	git(repo, 'init', '-q', '-b', 'main'); git(repo, 'config', 'user.email', 't@t'); git(repo, 'config', 'user.name', 'alice'); git(repo, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(repo, 'README.md'), 'x'); git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'init');
	git(repo, 'remote', 'add', 'origin', origin); git(repo, 'push', '-q', 'origin', 'main');
	const unit: UnitRef = { unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's1' };
	const draft = join(repo, '.insrc', 'artifacts', `${lldArtifactId(HASH, 's1')}.json`);
	const mdDraft = join(repo, `docs/epics/tag-filtering-E20260718${HASH.slice(0, 8)}/S001/LLD.md`);
	mkdirSync(dirname(draft), { recursive: true }); writeFileSync(draft, '{"draft":1}\n');
	mkdirSync(dirname(mdDraft), { recursive: true }); writeFileSync(mdDraft, '# the draft\n');

	const notes: string[] = [];
	const noteResult = { fail: false };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: 'bob' }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
		issueOps: { comment: (_issue: string, body: string): PortResult<void> => { notes.push(body); return noteResult.fail ? { ok: false, kind: 'rejected', reason: 'comments are locked' } : { ok: true, value: undefined }; } },
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy: team, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7',
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }), artifactExists: () => true,
	});
	return { root, repo, origin, tmp, unit, git: (...a) => git(repo, ...a), ogit: (...a) => git(origin, ...a), draft, mdDraft, notes, noteResult };
}

const run = (repo: string): WorkflowStepStatePayload => ({
	version: STATE_VERSION, runId: 'wf-1', epicKey: HASH, startedAtMs: 1, stage: 'awaiting_llm_step',
	intent: { workflow: 'design.story', focus: 'f', repoPath: repo, repoIndexedAt: null, params: { epicHash: HASH, storyId: 's1' } },
	executor: { runId: 'wf-1', nextStepIndex: 2, plan: { workflow: 'design.story', steps: [] }, stepOutputs: { s1: { text: `see ${repo}/a.ts` } }, intent: { workflow: 'design.story', focus: 'f', repoPath: repo, repoIndexedAt: null, params: {} } },
});

const deps = (env: Env, over: Partial<ParkDeps> = {}): ParkDeps => ({ branchPattern: () => undefined, now: () => '2026-10-18T12:00:00.000Z', tmpRoot: env.tmp, ...over });

/** The parker's checkout, in every part a park must leave alone. */
function snapshot(env: Env): Record<string, string> {
	return {
		head: env.git('rev-parse', 'HEAD'), branch: env.git('rev-parse', '--abbrev-ref', 'HEAD'), status: env.git('status', '--porcelain', '--untracked-files=all'),
		index: env.git('ls-files', '-s'), draft: readFileSync(env.draft, 'utf8'), md: readFileSync(env.mdDraft, 'utf8'),
	};
}

/** Nothing of the park is left behind locally: no worktree, no temporary branch, nothing in the temp directory. */
function assertClean(env: Env): void {
	assert.equal(env.git('worktree', 'list').split('\n').length, 1, 'only the main worktree is left');
	assert.equal(env.git('branch', '--list', 'insrc-park-tmp-*'), '', 'no temporary branch is left');
	assert.deepEqual(readdirSync(env.tmp), [], 'the temporary directory is gone');
}

const must = (r: ParkResult): Extract<ParkResult, { ok: true }> => { assert.equal(r.ok, true, r.ok ? '' : r.reason); return r as Extract<ParkResult, { ok: true }>; };

test('parking commits the draft and checkpoint to the handoff branch, pushes it, notes the branch on the issue through issueOps.comment and leaves the user\'s branch, index and working tree untouched', async () => {
	const env = mkEnv();
	try {
		saveState(run(env.repo), { owner: 'alice', upstream: [{ artifactId: `DEF-${HASH}`, revision: 3 }] });
		const before = snapshot(env);
		const rel = (p: string): string => p.slice(env.repo.length + 1);

		const res = must(await parkDraft(env.repo, env.unit, {}, deps(env)));
		assert.equal(res.branch, BRANCH);
		assert.equal(res.variant, 'run');
		assert.equal(res.runId, 'wf-1');
		assert.equal(res.noted, true);

		// the branch is on the remote, at the commit the result names, holding the checkpoint and the draft files
		assert.equal(env.ogit('rev-parse', `refs/heads/${BRANCH}`), res.commit);
		const files = env.ogit('ls-tree', '-r', '--name-only', `refs/heads/${BRANCH}`).split('\n');
		assert.ok(files.includes(checkpointPath({ epicHash: HASH, storyId: 's1' })), files.join(','));
		assert.ok(files.includes(rel(env.draft)) && files.includes(rel(env.mdDraft)));
		assert.equal(env.ogit('show', `refs/heads/${BRANCH}:${rel(env.draft)}`), '{"draft":1}');
		const cp = JSON.parse(env.ogit('show', `refs/heads/${BRANCH}:${checkpointPath({ epicHash: HASH, storyId: 's1' })}`));
		assert.equal(cp.kind, 'run');
		assert.equal(cp.owner, 'alice');
		assert.equal(cp.stage, 'awaiting_llm_step');
		assert.deepEqual(cp.artifactPaths.sort(), [rel(env.draft), rel(env.mdDraft)].sort());
		assert.equal(JSON.stringify(cp).includes(env.repo), false, 'the checkpoint carries no path of the parker\'s machine');
		assert.equal(validateCheckpoint(cp, { epicHash: HASH, storyId: 's1' }).ok, true);
		assert.match(env.ogit('log', '-1', '--format=%s', `refs/heads/${BRANCH}`), /^park: run and draft of story /);

		// exactly one note, naming the branch and the commit
		assert.equal(env.notes.length, 1);
		assert.match(env.notes[0] ?? '', /<!-- insrc:handoff -->/);
		assert.ok((env.notes[0] ?? '').includes(BRANCH) && (env.notes[0] ?? '').includes(res.commit));
		assert.match(env.notes[0] ?? '', /team resume /);

		// the parker's checkout is exactly as it was, and the run is still in the daemon
		assert.deepEqual(snapshot(env), before);
		assert.equal(env.git('branch', '--list', BRANCH), '', 'the handoff branch is not made locally');
		assertClean(env);
		assert.equal(listStates().filter(e => e.payload.runId === 'wf-1').length, 1);
	} finally { rmSync(env.root, { recursive: true, force: true }); }
});

test('a git failure cleans up the worktree and local branch, a failed note returns noted false, a rejected push says someone else parked first, and a second park commits on top', async () => {
	const env = mkEnv();
	try {
		saveState(run(env.repo), { owner: 'alice', upstream: [] });
		const before = snapshot(env);

		// a git failure while pushing (the remote's hook declines): the reason names the step and git's message; nothing is left behind
		const hook = join(env.origin, 'hooks', 'pre-receive');
		writeFileSync(hook, '#!/bin/sh\necho "no pushes today" >&2\nexit 1\n'); chmodSync(hook, 0o755);
		const declined = await parkDraft(env.repo, env.unit, {}, deps(env));
		assert.equal(declined.ok, false);
		assert.match(declined.ok ? '' : declined.reason, /park failed at pushing the handoff branch: .*no pushes today/s);
		assert.doesNotMatch(declined.ok ? '' : declined.reason, /someone else parked first/);
		assertClean(env);
		assert.deepEqual(snapshot(env), before);
		assert.equal(listStates().some(e => e.payload.runId === 'wf-1'), true, 'the run is still in the daemon');
		assert.equal(env.notes.length, 0, 'no note for a park that did not happen');
		rmSync(hook);

		// a worktree git half-makes (its post-checkout hook fails after the branch and the directory exist) is cleaned up too
		const postCheckout = join(env.repo, '.git', 'hooks', 'post-checkout');
		writeFileSync(postCheckout, '#!/bin/sh\nexit 1\n'); chmodSync(postCheckout, 0o755);
		const half = await parkDraft(env.repo, env.unit, {}, deps(env));
		assert.equal(half.ok, false);
		assert.match(half.ok ? '' : half.reason, /park failed at making the temporary worktree/);
		assertClean(env);
		assert.deepEqual(snapshot(env), before);
		rmSync(postCheckout);

		// a failed note: the park succeeded, the push stands, and the failure is reported
		env.noteResult.fail = true;
		const unnoted = must(await parkDraft(env.repo, env.unit, {}, deps(env)));
		assert.equal(unnoted.noted, false);
		assert.match(unnoted.noteFailure ?? '', /rejected: comments are locked/);
		assert.equal(env.ogit('rev-parse', `refs/heads/${BRANCH}`), unnoted.commit, 'the push was not undone');
		assert.equal(env.notes.length, 1, 'one note was tried');
		env.noteResult.fail = false;
		assertClean(env);

		// a second park reuses the branch and commits on top of the first
		writeFileSync(env.draft, '{"draft":2}\n');
		const second = must(await parkDraft(env.repo, env.unit, {}, deps(env)));
		assert.equal(second.branch, BRANCH);
		assert.notEqual(second.commit, unnoted.commit);
		assert.equal(env.ogit('rev-parse', `${second.commit}~1`), unnoted.commit, 'the second park is a child of the first');
		assert.equal(env.ogit('rev-list', '--count', `refs/heads/${BRANCH}`), String(Number(env.ogit('rev-list', '--count', 'refs/heads/main')) + 2), 'two park commits on the base');
		assert.equal(env.ogit('show', `refs/heads/${BRANCH}:.insrc/artifacts/${lldArtifactId(HASH, 's1')}.json`), '{"draft":2}');
		assert.equal(env.notes.length, 2);
		assertClean(env);

		// a push that loses a race: someone else lands a commit on the branch between our fetch and our push
		const other = join(env.root, 'other');
		git(env.root, 'clone', '-q', env.origin, other);
		git(other, 'config', 'user.email', 'c@t'); git(other, 'config', 'user.name', 'carol'); git(other, 'config', 'commit.gpgsign', 'false');
		git(other, 'checkout', '-q', '-b', 'park', `origin/${BRANCH}`);
		writeFileSync(join(other, 'carol.txt'), 'c'); git(other, 'add', '-A'); git(other, 'commit', '-qm', 'carol parks');
		writeFileSync(env.draft, '{"draft":3}\n');
		const raced = await parkDraft(env.repo, env.unit, {}, deps(env, { beforePush: () => { git(other, 'push', '-q', 'origin', `park:refs/heads/${BRANCH}`); } }));
		assert.equal(raced.ok, false);
		assert.match(raced.ok ? '' : raced.reason, /someone else parked first/);
		assert.equal(env.ogit('log', '-1', '--format=%s', `refs/heads/${BRANCH}`), 'carol parks', 'the other owner\'s commit is intact');
		assertClean(env);
		assert.equal(env.notes.length, 2, 'no note for the lost race');

		// parking again after the race builds on carol's commit
		const third = must(await parkDraft(env.repo, env.unit, {}, deps(env)));
		assert.equal(env.ogit('log', '-1', '--format=%s', `${third.commit}~1`), 'carol parks', 'the new park sits directly on the other owner\'s commit');
		assert.equal(env.ogit('log', '--format=%s', '-3', `refs/heads/${BRANCH}`).split('\n')[1], 'carol parks');
		assert.equal(existsSync(env.draft), true);

		// a deleted draft is deleted on the branch; if git cannot remove it the park fails at that step and cleans up
		writeFileSync(env.draft, '{"draft":4}\n');
		env.git('add', '.insrc'); env.git('commit', '-qm', 'commit the draft locally');
		rmSync(env.draft);
		const brokenRm = await parkDraft(env.repo, env.unit, {}, deps(env, { failGit: args => (args[0] === 'rm' ? 'rm exploded' : undefined) }));
		assert.equal(brokenRm.ok, false);
		assert.match(brokenRm.ok ? '' : brokenRm.reason, /^park failed at removing a deleted draft file: rm exploded$/);
		assertClean(env);
		const deleted = must(await parkDraft(env.repo, env.unit, {}, deps(env)));
		assert.equal(env.ogit('ls-tree', '-r', '--name-only', `${deleted.commit}~1`).split('\n').includes(`.insrc/artifacts/${lldArtifactId(HASH, 's1')}.json`), true, 'the file is on the base the branch grew from');
		assert.equal(env.ogit('diff', '--name-status', `${deleted.commit}~1`, deleted.commit).includes(`D\t.insrc/artifacts/${lldArtifactId(HASH, 's1')}.json`), true, 'but this park deleted it');
		assert.equal(env.ogit('ls-tree', '-r', '--name-only', deleted.commit).split('\n').includes(`.insrc/artifacts/${lldArtifactId(HASH, 's1')}.json`), false, 'and it is gone from the parked tree');
		assertClean(env);

		// cleanup that cannot finish is reported, never silent: on a park that worked, and added to the reason of one that did not
		// 'branch -D' failing alone is not a leftover: the branch is dropped another way
		writeFileSync(env.draft, '{"draft":4.5}\n');
		const fallback = must(await parkDraft(env.repo, env.unit, {}, deps(env, { failGit: args => (args[0] === 'branch' && args[1] === '-D' ? 'cannot delete the branch' : undefined) })));
		assert.equal(fallback.cleanupWarning, undefined);
		assertClean(env);
		// both ways failing leaves it, and says so
		const keepBranch = (args: readonly string[]): string | undefined => ((args[0] === 'branch' && args[1] === '-D') || args[0] === 'update-ref' ? 'cannot delete the branch' : undefined);
		writeFileSync(env.draft, '{"draft":5}\n');
		const dirty = must(await parkDraft(env.repo, env.unit, {}, deps(env, { failGit: keepBranch })));
		assert.match(dirty.cleanupWarning ?? '', /the temporary branch insrc-park-tmp-\w+ could not be removed; remove it by hand/);
		env.git('branch', '-D', env.git('branch', '--list', 'insrc-park-tmp-*').replace(/^[*+ ]+/, ''));
		assertClean(env);
		writeFileSync(env.draft, '{"draft":6}\n');
		const both = await parkDraft(env.repo, env.unit, {}, deps(env, { failGit: args => (args[0] === 'push' ? 'push exploded' : keepBranch(args)) }));
		assert.equal(both.ok, false);
		assert.match(both.ok ? '' : both.reason, /park failed at pushing the handoff branch: push exploded; cleanup also failed: the temporary branch insrc-park-tmp-\w+ could not be removed/);
		env.git('branch', '-D', env.git('branch', '--list', 'insrc-park-tmp-*').replace(/^[*+ ]+/, ''));
		assertClean(env);

		// a repository with no remote cannot park
		git(env.repo, 'remote', 'remove', 'origin');
		const lonely = await parkDraft(env.repo, env.unit, {}, deps(env));
		assert.match(lonely.ok ? '' : lonely.reason, /no git remote/);
		assertClean(env);
	} finally { rmSync(env.root, { recursive: true, force: true }); }
});
