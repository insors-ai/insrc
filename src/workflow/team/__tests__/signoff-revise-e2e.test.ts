/**
 * Revising a signoff request end to end (Story s8): the real team gate with the registered hook, the real lifecycle over a
 * store-backed repository, the real content write, and an in-memory tracker that keeps timed reviews. Changes are requested on a
 * request of two artifacts, one is re-authored and the other left as it is, both go back to the same request, a request for
 * changes made on the old push does not hold them, the merge settles them for their current revisions, and a later revision of a
 * merged request gets a request of its own.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff-revise-e2e.test.ts
 */

import assert from 'node:assert/strict';
import { mkdtempSync as mkdtempRaw, readFileSync, rmSync as rmRaw } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after as afterAll, afterEach, test } from 'node:test';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// The approval path reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempRaw(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
afterAll(async () => {
	await closeGraphStore();
	rmRaw(STORE_DIR, { recursive: true, force: true });
});

import { createCompletionEvidence } from '../../artifact-core/completion-evidence.js';
import { History } from '../../artifact-core/history.js';
import { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import { artifactJsonPath, writeArtifact } from '../../storage.js';
import { assertMayAuthor } from '../author-gate.js';
import { _setGateDepsForTests, claim, registerCompletionHook, TeamGateRefusedError } from '../gate.js';
import { _setSignoffDepsForTests, openSignoff, registerSignoffHook, settleForAttempt, settleSignoff } from '../signoff.js';
import type { TeamPolicy } from '../types.js';
import type { PortResult, SignoffRequestRef, SignoffRequestSpec, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { WorkflowIntent } from '../../types.js';
import { H, alice, bob, clock, kit } from '../../artifact-core/__tests__/store-kit.js';
import { seedEpic } from '../../artifact-core/__tests__/lifecycle-kit.js';

afterEach(() => { _setGateDepsForTests(); _setSignoffDepsForTests(); registerCompletionHook(undefined); });

const EPIC_ISSUE = 'acme/demo#1';
const STORY_ISSUE = 'acme/demo#2';
const DEF = `DEF-${H}`;
const HLD = `HLD-${H}`;

const policy = (): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

interface Review { readonly state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'; readonly at: string }

/** An in-memory tracker: assignees per issue, and the pull requests with their timed reviews, answered as the GitHub adapter answers. */
function tracker() {
	const assignees: Record<string, string[]> = { [EPIC_ISSUE]: [], [STORY_ISSUE]: [] };
	const opened: SignoffRequestSpec[] = [];
	const requests = new Map<string, { branch: string; merged: boolean; reviews: Review[] }>();
	const port = {
		kind: 'github', capabilities: new Set(['claim', 'signoff-request']),
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (issue: string): PortResult<string | null> => ({ ok: true, value: assignees[issue]?.[0] ?? null }),
		addAssignee: (issue: string, who: string): PortResult<string[]> => { (assignees[issue] ??= []).push(who); return { ok: true, value: [...(assignees[issue] ?? [])] }; },
		setAssignee: (issue: string, who: string | null): PortResult<void> => { assignees[issue] = who === null ? [] : [who]; return { ok: true, value: undefined }; },
		openSignoffRequest: (spec: SignoffRequestSpec): PortResult<SignoffRequestRef> => {
			opened.push(spec);
			const ref = `acme/demo#${40 + opened.length}`;
			requests.set(ref, { branch: spec.branch, merged: false, reviews: [] });
			return { ok: true, value: { ref } };
		},
		readSignoffRequest: (r: SignoffRequestRef): PortResult<{ branch: string; open: boolean }> => {
			const pr = requests.get(r.ref);
			return pr === undefined ? { ok: false, kind: 'rejected', reason: `no request ${r.ref}` } : { ok: true, value: { branch: pr.branch, open: !pr.merged } };
		},
		readSignoffState: (r: SignoffRequestRef, since?: string): PortResult<'open' | 'changes-requested' | 'completed'> => {
			const pr = requests.get(r.ref);
			if (pr === undefined) return { ok: false, kind: 'rejected', reason: `no request ${r.ref}` };
			if (pr.merged) return { ok: true, value: 'completed' };
			const decisive = pr.reviews.filter(v => v.state !== 'COMMENTED' && (since === undefined || v.at > since));
			return { ok: true, value: decisive.at(-1)?.state === 'CHANGES_REQUESTED' ? 'changes-requested' : 'open' };
		},
	} as unknown as TrackerPort;
	return { port, assignees, opened, requests };
}

function serviceFor(k: ReturnType<typeof kit>): LifecycleService {
	return new LifecycleService({ store: k.store, evidence: ctx => createCompletionEvidence(k.repo, { ...ctx, enforce: false, history: new History(k.sidecar) }), now: clock() });
}

/** Review by the daemon, then approve: what a submission requires of each artifact. */
async function approveReviewed(svc: LifecycleService, id: string): Promise<void> {
	await svc.apply(id, 'review', bob, { review: { reviewer: bob, party: 'daemon', verdict: 'pass', counts: { high: 0, med: 0, low: 0 } } });
	await svc.apply(id, 'approve', bob);
}

const intent = (k: ReturnType<typeof kit>, workflow: string): Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'> =>
	({ workflow, repoPath: k.repo, params: { epicHash: H, storyId: 's1' } }) as Pick<WorkflowIntent, 'workflow' | 'repoPath' | 'params'>;

test('changes requested on a two-artifact request, both re-authored through writeArtifact or one left unchanged, approved again and resubmitted to the same request, settled signed-off for the new revisions only, a lingering old decision not cancelling it, a merged request not carried over, and a non-holder and an unassigned user refused', async () => {
	const k = kit();
	try {
		await seedEpic(k);
		const svc = serviceFor(k);
		const t = tracker();
		const epic: UnitRef = { unit: 'epic', repoPath: k.repo, epicHash: H };
		const story: UnitRef = { unit: 'story', repoPath: k.repo, epicHash: H, storyId: 's1' };
		const readPolicy = () => ({ ok: true as const, value: policy() });
		const resolveIssue = (unit: UnitRef) => (unit.unit === 'epic' ? EPIC_ISSUE : STORY_ISSUE);
		_setGateDepsForTests({ readPolicy, loadTracker: () => ({ ok: true, value: t.port }), resolveIssue, now: () => '2026-10-22T00:00:00.000Z' });
		_setSignoffDepsForTests({ readPolicy, loadTracker: () => ({ ok: true, value: t.port }), resolveIssue, lifecycleFor: () => svc, publishBranch: () => ({ ok: true, value: 'feature/signoff' }), currentBranch: () => 'feature/signoff' });
		registerSignoffHook();

		const head = (id: string) => JSON.parse(readFileSync(artifactJsonPath(k.repo, id), 'utf8')) as { meta: { lifecycle: { status: string; revision: { number: number }; signoffs: Array<{ revision: number; state: string; at: string; request: { entityId: string } }> } } };
		const statusOf = (id: string): string => head(id).meta.lifecycle.status;
		const entriesOf = (id: string) => head(id).meta.lifecycle.signoffs.map(e => [e.revision, e.state, e.request.entityId]);
		/** The time of the latest submission of the epic's artifacts: the later of their last Signoff entries. */
		const submittedAt = (): string => [DEF, HLD].map(id => head(id).meta.lifecycle.signoffs.at(-1)?.at ?? '').reduce((a, b) => (b > a ? b : a), '');
		const after = (iso: string): string => new Date(Date.parse(iso) + 500).toISOString();
		/** Re-author an artifact the way a workflow run does: a freshly synthesized head with no lifecycle, written as content. */
		const reauthor = async (id: string, text: string): Promise<void> => {
			const current = JSON.parse(readFileSync(artifactJsonPath(k.repo, id), 'utf8')) as { meta: Record<string, unknown> };
			const { lifecycle: _kept, ...meta } = current.meta;
			writeArtifact(artifactJsonPath(k.repo, id), { ...current, meta, body: { text } }, 'content');
			// the revision the write minted is entered in the change log, as the store's own write enters it, so the next review and approval find head and log in step
			const { number, contentHash } = head(id).meta.lifecycle.revision as { number: number; contentHash: string };
			await new History(k.sidecar).appendLog(id, { id: `content-${id}-r${number}`, actor: alice, timestamp: '2026-10-22T00:00:00.000Z', operation: 'update', revision: { number, contentHash } });
		};

		// --- the request: DEF and HLD go to one pull request, #41 ---
		await approveReviewed(svc, DEF);
		await approveReviewed(svc, HLD);
		assert.equal(claim(k.repo, epic).kind, 'allowed');
		assert.deepEqual(await openSignoff(k.repo, epic, [DEF, HLD]), { ok: true, value: { ref: 'acme/demo#41' } });
		const firstSubmission = submittedAt();

		// --- a reviewer asks for changes: both artifacts go to changes-requested together, and the next stage stays blocked ---
		t.requests.get('acme/demo#41')?.reviews.push({ state: 'CHANGES_REQUESTED', at: after(firstSubmission) });
		await assert.rejects(settleForAttempt(k.repo, story, 'author', 'design.story'), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'refused' && /changes were requested/.test(e.outcome.reason));
		assert.deepEqual([statusOf(DEF), statusOf(HLD)], ['changes-requested', 'changes-requested']);

		// --- someone else, and nobody, may not revise it; revising never takes the claim ---
		t.assignees[EPIC_ISSUE] = ['bob'];
		assert.throws(() => assertMayAuthor(intent(k, 'design.epic')), (e: unknown) => e instanceof TeamGateRefusedError && e.outcome.kind === 'held-by-other' && e.outcome.holder === 'bob');
		t.assignees[EPIC_ISSUE] = [];
		assert.throws(() => assertMayAuthor(intent(k, 'design.epic')), (e: unknown) => e instanceof TeamGateRefusedError && /claim it before revising/.test(e.reason));
		assert.deepEqual(t.assignees[EPIC_ISSUE], [], 'no claim was taken');
		t.assignees[EPIC_ISSUE] = ['alice'];
		assert.doesNotThrow(() => assertMayAuthor(intent(k, 'design.epic')), 'the holder revises');

		// --- the holder re-authors the DEF and leaves the HLD as it is: the DEF keeps its history, the HLD is untouched ---
		await reauthor(DEF, 'revised after review');
		assert.equal(statusOf(DEF), 'draft');
		assert.equal(head(DEF).meta.lifecycle.revision.number, 2);
		assert.deepEqual(entriesOf(DEF), [[1, 'changes-requested', 'acme/demo#41']], 'the Signoff entry survives the content write');
		await reauthor(HLD, (JSON.parse(readFileSync(artifactJsonPath(k.repo, HLD), 'utf8')) as { body: { text: string } }).body.text);
		assert.equal(statusOf(HLD), 'changes-requested', 'an identical content write leaves the head as it was');
		await approveReviewed(svc, DEF);

		// --- both go back to the same request: the revised DEF at revision 2, the unchanged HLD at revision 1 ---
		assert.deepEqual(await openSignoff(k.repo, epic, [DEF, HLD]), { ok: true, value: { ref: 'acme/demo#41' } });
		assert.equal(t.opened.length, 1, 'no second request');
		assert.deepEqual(entriesOf(DEF), [[1, 'changes-requested', 'acme/demo#41'], [2, 'open', 'acme/demo#41']]);
		assert.deepEqual(entriesOf(HLD), [[1, 'changes-requested', 'acme/demo#41'], [1, 'open', 'acme/demo#41']]);

		// --- the request for changes made on the old push is still on the pull request: it does not hold the resubmission ---
		assert.deepEqual(await settleSignoff(k.repo, epic), []);
		assert.deepEqual([statusOf(DEF), statusOf(HLD)], ['in-signoff', 'in-signoff']);
		const secondSubmission = submittedAt();

		// --- the merge is recorded on both artifacts for their current revisions, and the claim is released ---
		const pr = t.requests.get('acme/demo#41');
		assert.ok(pr !== undefined && secondSubmission > firstSubmission);
		pr.merged = true;
		assert.deepEqual(await settleSignoff(k.repo, epic), []);
		assert.deepEqual([statusOf(DEF), statusOf(HLD)], ['signed-off', 'signed-off']);
		assert.deepEqual(entriesOf(DEF).at(-1), [2, 'completed', 'acme/demo#41']);
		assert.deepEqual(entriesOf(HLD).at(-1), [1, 'completed', 'acme/demo#41']);
		assert.deepEqual(t.assignees[EPIC_ISSUE], []);
		await settleForAttempt(k.repo, story, 'author', 'design.story');

		// --- the merged request is not carried over: a later revision of the DEF gets a request of its own ---
		assert.equal(claim(k.repo, epic).kind, 'allowed');
		await reauthor(DEF, 'revised again after the merge');
		await approveReviewed(svc, DEF);
		assert.deepEqual(await openSignoff(k.repo, epic, [DEF]), { ok: true, value: { ref: 'acme/demo#42' } });
		assert.equal(t.opened.length, 2);
		assert.deepEqual(entriesOf(DEF).at(-1), [3, 'open', 'acme/demo#42']);
	} finally { k.done(); }
});
