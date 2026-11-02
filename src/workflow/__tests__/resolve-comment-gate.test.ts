/**
 * The team gate on the review-comment recorder (Story f32c3abf4a55494b/s1): handleResolveComment asks the gate once, after the artifact is
 * found and before the first record. 'revise' (holder only) while the stage is in signoff, 'author' otherwise; a refusal records nothing.
 *
 * Run: npx tsx --test src/workflow/__tests__/resolve-comment-gate.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleResolveComment } from '../resolve-comment.js';
import type { RecordResolutionFn, ResolveCommentDeps, ReviewComment } from '../resolve-comment.js';
import { ARTIFACTS_DIR } from '../storage.js';
import { _setGateDepsForTests, registerCompletionHook } from '../team/gate.js';
import type { GuardedAction } from '../team/gate.js';
import { _setSignoffDepsForTests } from '../team/signoff.js';
import { ToolDenied } from '../tracker/tool-denied.js';
import type { PortResult, TrackerPort } from '../tracker/port.js';
import type { UnitRef } from '../tracker/refs.js';
import type { TeamPolicy } from '../team/types.js';

afterEach(() => { _setGateDepsForTests(); _setSignoffDepsForTests(); registerCompletionHook(undefined); });

const HASH = '238917216d8fd532';
const IDS = { define: `DEF-${HASH}`, hld: `HLD-${HASH}`, lld: `LLD-${HASH}-s4` } as const;

function fixture(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-resolvecmt-gate-'));
	mkdirSync(join(repo, ARTIFACTS_DIR), { recursive: true });
	for (const id of Object.values(IDS)) writeFileSync(join(repo, ARTIFACTS_DIR, `${id}.json`), JSON.stringify({ meta: {}, body: { openQuestions: ['Which cache policy?'] } }, null, 2) + '\n');
	return repo;
}

function recorder(): { fn: RecordResolutionFn; calls: number } {
	const r = { calls: 0, fn: undefined as unknown as RecordResolutionFn };
	r.fn = (() => { r.calls += 1; return { jsonPath: '', mdPath: '', resolution: { question: '', status: 'resolved', resolvedAt: '' }, remainingOpen: [] }; }) as unknown as RecordResolutionFn;
	return r;
}

const comments = (n: number): ReviewComment[] => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, anchor: {}, body: `comment ${i + 1}` }));

const policy = (): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

interface World { actions: GuardedAction[]; claimed: string[]; loads: number }

/** The artifact `id` has lifecycle `status` for the signoff reads; `holder` holds the issue and `me` is the actor. */
function world(id: string, status: string, holder: string | null, opts: { me?: string; noPolicy?: boolean; whoAmI?: () => PortResult<string> } = {}): World {
	const w: World = { actions: [], claimed: [], loads: 0 };
	const me = opts.me ?? 'alice';
	const port = {
		whoAmI: opts.whoAmI ?? ((): PortResult<string> => ({ ok: true, value: me })),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (_issue: string, who: string): PortResult<string[]> => { w.claimed.push(who); return { ok: true, value: [who] }; },
	} as unknown as TrackerPort;
	const readPolicy = async () => ({ ok: true as const, value: opts.noPolicy === true ? 'none' as const : policy() });
	_setGateDepsForTests({ readPolicy, loadTracker: () => { w.loads += 1; return { ok: true, value: port }; }, resolveIssue: () => 'acme/demo#1', artifactExists: () => true });
	_setSignoffDepsForTests({ readHead: (_repo, headId) => (headId === id ? { lifecycle: { status, revision: { number: 2 }, signoffs: [] } } : undefined), readPolicy });
	registerCompletionHook((_repo, _unit, _port, action) => { w.actions.push(action); return 'continue'; });
	return w;
}

test('handleResolveComment answers an error and records nothing when the actor may not revise the stage', async () => {
	const repo = fixture();
	try {
		for (const [kind, id] of Object.entries(IDS)) {
			const w = world(id, 'in-signoff', 'bob');
			const rec = recorder();
			const r = await handleResolveComment({ repo, artifactId: id, comments: comments(2) }, undefined, { record: rec.fn });
			assert.ok('error' in r, `${kind}: expected an error`);
			assert.match((r as { error: string }).error, /^workflow\.resolveComment: .*held by bob/);
			assert.equal(rec.calls, 0, `${kind}: nothing recorded`);
			assert.deepEqual(w.actions, ['revise']);
		}
		// nobody holds it: refused with a claim first
		world(IDS.define, 'changes-requested', null);
		const r = await handleResolveComment({ repo, artifactId: IDS.define, comments: comments(1) }, undefined, { record: recorder().fn });
		assert.match((r as { error: string }).error, /claim it before revising/);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('the gate is asked once for several comments and maps define, hld and lld to the Epic and Story stages', async () => {
	const repo = fixture();
	try {
		const asked: Array<{ unit: UnitRef; stage: string; authoring: string }> = [];
		const deps = (rec: RecordResolutionFn): ResolveCommentDeps => ({ record: rec, gate: async (_repo, unit, stage, authoring) => { asked.push({ unit, stage, authoring }); } });
		for (const id of Object.values(IDS)) {
			const rec = recorder();
			const r = await handleResolveComment({ repo, artifactId: id, comments: comments(3) }, undefined, deps(rec.fn));
			assert.ok(!('error' in r));
			assert.equal(rec.calls, 3);
		}
		assert.deepEqual(asked, [
			{ unit: { unit: 'epic', repoPath: repo, epicHash: HASH }, stage: 'DEF', authoring: 'resolveComment' },
			{ unit: { unit: 'epic', repoPath: repo, epicHash: HASH }, stage: 'HLD', authoring: 'resolveComment' },
			{ unit: { unit: 'story', repoPath: repo, epicHash: HASH, storyId: 's4' }, stage: 'LLD', authoring: 'resolveComment' },
		], 'one gate call per request, whatever the number of comments');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('outside signoff a comment behaves as an author turn, and a repo with no team policy records as today', async () => {
	const repo = fixture();
	try {
		// outside signoff on an unassigned stage the comment takes the claim, as an author turn does
		let w = world(IDS.lld, 'approved', null);
		let rec = recorder();
		let r = await handleResolveComment({ repo, artifactId: IDS.lld, comments: comments(1) }, undefined, { record: rec.fn });
		assert.ok(!('error' in r));
		assert.deepEqual([w.actions, w.claimed, rec.calls], [['author'], ['alice'], 1]);
		// the holder comments outside signoff
		w = world(IDS.lld, 'approved', 'alice');
		rec = recorder();
		r = await handleResolveComment({ repo, artifactId: IDS.lld, comments: comments(1) }, undefined, { record: rec.fn });
		assert.ok(!('error' in r));
		assert.deepEqual([w.actions, w.claimed, rec.calls], [['author'], [], 1]);
		// a stage held by someone else is refused outside signoff too
		world(IDS.lld, 'approved', 'bob');
		rec = recorder();
		r = await handleResolveComment({ repo, artifactId: IDS.lld, comments: comments(1) }, undefined, { record: rec.fn });
		assert.match((r as { error: string }).error, /held by bob/);
		assert.equal(rec.calls, 0);
		// a repo with no team policy: no tracker call, recorded as today
		w = world(IDS.lld, 'in-signoff', 'bob', { noPolicy: true });
		rec = recorder();
		r = await handleResolveComment({ repo, artifactId: IDS.lld, comments: comments(2) }, undefined, { record: rec.fn });
		assert.ok(!('error' in r));
		assert.deepEqual([w.loads, w.actions, w.claimed, rec.calls], [0, [], [], 2]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a denied tracker call in the gate is rethrown and is not an error result', async () => {
	const repo = fixture();
	try {
		const denied = new ToolDenied('gh_tracker', 'declined', {});
		world(IDS.lld, 'in-signoff', 'alice', { whoAmI: () => { throw denied; } });
		const rec = recorder();
		await assert.rejects(() => handleResolveComment({ repo, artifactId: IDS.lld, comments: comments(1) }, undefined, { record: rec.fn }), (e: unknown) => e === denied);
		assert.equal(rec.calls, 0);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
