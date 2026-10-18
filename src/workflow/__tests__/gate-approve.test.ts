/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local approval in a team repo: a stage held by someone else is not approved here, the
 * refusal comes before any review check or stamp, and a refused BUILD target is refused
 * before its record is created. A repo with no policy approves exactly as before.
 *
 * Run: npx tsx --test src/workflow/__tests__/gate-approve.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { approveArtifactByJsonPath, approveWorkflowTarget } from '../gates.js';
import { _setGateDepsForTests, TeamGateRefusedError } from '../team/gate.js';
import type { PortResult, TrackerPort } from '../tracker/port.js';
import type { UnitRef } from '../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../team/types.js';

afterEach(() => _setGateDepsForTests());

const HASH = 'a3f4b8c9d1e2f3a4';
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });

/** One issue per unit; `holders` maps a unit key to its assignee (absent = unassigned). */
function inject(holders: Record<string, string>, readPolicy: PolicyReader = team): { reads: string[] } {
	const seen = { reads: [] as string[] };
	const key = (u: UnitRef): string => (u.unit === 'epic' ? 'epic' : u.unit === 'story' ? `story:${u.storyId}` : `task:${u.storyId}/${u.taskId}`);
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (issue: string): PortResult<string | null> => { seen.reads.push(issue); return { ok: true, value: holders[issue] ?? null }; },
		addAssignee: (_i: string, who: string): PortResult<string[]> => ({ ok: true, value: [who] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy, loadTracker: () => ({ ok: true, value: port }), resolveIssue: u => key(u) });
	return seen;
}

function withRepo(fn: (repo: string, dir: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gate-approve-'));
	const dir = join(repo, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	return Promise.resolve(fn(repo, dir)).finally(() => rmSync(repo, { recursive: true, force: true }));
}

function put(dir: string, name: string, doc: unknown): string {
	const p = join(dir, name);
	writeFileSync(p, JSON.stringify(doc, null, 2));
	return p;
}

const planDoc = (repo: string, tasks: string[]) => ({
	meta: { workflow: 'plan', repoPath: repo, epicHash: HASH, storyId: 's1' },
	body: { tasks: tasks.map((id, i) => ({ id, title: id, summary: 's', size: 'S', order: i + 1, dependsOn: [], acceptanceChecks: ['x'], derivedFrom: [], tests: [] })) },
	citations: [],
});
const isApproved = (p: string): boolean => (JSON.parse(readFileSync(p, 'utf8')) as { meta?: { approvedAt?: string } }).meta?.approvedAt !== undefined;

test('approveArtifactByJsonPath throws TeamGateRefusedError for a non-holder before any review check or stamp, and approveWorkflowTarget authorizes a BUILD target before ensureBuildRecordOnCompletion so a refused target creates no BUILD record, puts it in skipped[] with the reason and approves the others', async () => {
	await withRepo(async (repo, dir) => {
		// a plan for story s1 with two Tasks; the Story is mine, task t2 is held by bob
		const plan = put(dir, `PLAN-${HASH}-s1.json`, planDoc(repo, ['t1', 't2']));
		inject({ 'task:s1/t2': 'bob', 'story:s1': 'alice' });

		// local approval of a stage held by someone else: refused before anything is stamped
		inject({ 'story:s1': 'bob' });
		assert.throws(() => approveArtifactByJsonPath(plan), (err: unknown) => err instanceof TeamGateRefusedError && /held by bob/.test(err.reason));
		assert.ok(!isApproved(plan), 'nothing stamped');
		assert.equal(JSON.stringify(JSON.parse(readFileSync(plan, 'utf8'))), JSON.stringify(planDoc(repo, ['t1', 't2'])), 'the artifact is unchanged');

		// the refusal comes BEFORE the review check: a blocking review and a stage held by someone else give the team refusal
		const blocked = planDoc(repo, ['t1']);
		(blocked.meta as Record<string, unknown>)['review'] = { verdict: 'block', findings: [{ severity: 'HIGH', claimId: 'c1', summary: 'x' }], counts: { high: 1, med: 0, low: 0 } };
		const blockedPath = put(dir, `PLAN-${HASH}-s2.json`, { ...blocked, meta: { ...blocked.meta, storyId: 's2' } });
		inject({ 'story:s2': 'bob' });
		assert.throws(() => approveArtifactByJsonPath(blockedPath), (err: unknown) => err instanceof TeamGateRefusedError);
		inject({ 'story:s2': 'alice' });
		assert.throws(() => approveArtifactByJsonPath(blockedPath), (err: unknown) => err instanceof Error && err.name === 'ReviewBlockedError', 'the holder then meets the review check');

		// the holder approves; so does a repo with no policy
		inject({ 'story:s1': 'alice' });
		assert.doesNotThrow(() => approveArtifactByJsonPath(plan));
		assert.ok(isApproved(plan));
	});

	await withRepo(async (repo, dir) => {
		const plan = put(dir, `PLAN-${HASH}-s1.json`, planDoc(repo, ['t1', 't2']));
		inject({}, none);
		assert.doesNotThrow(() => approveArtifactByJsonPath(plan));
		assert.ok(isApproved(plan), 'no policy: approved exactly as before');
	});

	// approveWorkflowTarget: a BUILD target for a Story whose Task t2 is held by bob is refused BEFORE its record is created
	await withRepo(async (repo, dir) => {
		const plan = put(dir, `PLAN-${HASH}-s1.json`, planDoc(repo, ['t1', 't2']));
		const buildPath = join(dir, `BUILD-${HASH}-s1.json`);
		const seen = inject({ 'task:s1/t2': 'bob', 'story:s1': 'alice' });
		const out = await approveWorkflowTarget({ repoPath: repo, artifactPath: buildPath });
		assert.equal(out.approved.length, 0);
		assert.equal(out.skipped.length, 1);
		assert.equal(out.skipped[0]!.path, buildPath);
		assert.match(out.skipped[0]!.reason, /task t2: held by bob/, 'names the first Task held by someone else');
		assert.ok(!existsSync(buildPath), 'no BUILD record was created for the refused target');
		assert.ok(seen.reads.includes('task:s1/t1') && seen.reads.includes('task:s1/t2'));

		// a batch: the refused BUILD target is skipped (its record exists already) and the PLAN is still approved
		put(dir, `BUILD-${HASH}-s1.json`, { meta: { workflow: 'build', repoPath: repo, epicHash: HASH, storyId: 's1' }, body: { tasks: [] }, citations: [] });
		const batch = await approveWorkflowTarget({ repoPath: repo, epicHash: HASH });
		assert.deepEqual(batch.approved.map(a => a.path), [plan]);
		assert.ok(batch.skipped.some(s => s.path === buildPath && /task t2: held by bob/.test(s.reason)));
		assert.ok(isApproved(plan) && !isApproved(buildPath));
	});

	// a plan that exists but cannot be read is never "no Tasks": the BUILD is refused, not authorized against the Story alone
	await withRepo(async (repo, dir) => {
		writeFileSync(join(dir, `PLAN-${HASH}-s1.json`), '{ not json');
		const buildPath = join(dir, `BUILD-${HASH}-s1.json`);
		inject({ 'story:s1': 'alice' });
		const out = await approveWorkflowTarget({ repoPath: repo, artifactPath: buildPath });
		assert.match(out.skipped[0]?.reason ?? '', /plan of Story s1 cannot be read/);
		assert.ok(!existsSync(buildPath));
		// and with no policy the unreadable plan changes nothing
		inject({}, none);
		const free = await approveWorkflowTarget({ repoPath: repo, artifactPath: buildPath }).catch((e: Error) => e);
		assert.ok(!(free instanceof Error && /plan of Story/.test(free.message)), 'no policy: the plan is not even looked at');
	});

	// a Story with no Tasks is authorized against the Story unit
	await withRepo(async (repo, dir) => {
		put(dir, `PLAN-${HASH}-s1.json`, planDoc(repo, []));
		const buildPath = join(dir, `BUILD-${HASH}-s1.json`);
		const seen = inject({ 'story:s1': 'bob' });
		const out = await approveWorkflowTarget({ repoPath: repo, artifactPath: buildPath });
		assert.match(out.skipped[0]?.reason ?? '', /held by bob/);
		assert.deepEqual(seen.reads, ['story:s1']);
		assert.ok(!existsSync(buildPath));
	});
});
