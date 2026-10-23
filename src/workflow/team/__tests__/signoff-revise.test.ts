/**
 * Signoff revision (Story s8): the prerequisites of a resubmission, finding the request an artifact was sent to, resubmitting
 * to it, and settling only on a request for changes made after the last submission.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/signoff-revise.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setSignoffDepsForTests, openSignoff, type SignoffDeps } from '../signoff.js';
import type { LifecycleService } from '../../artifact-core/lifecycle-service.js';
import type { PortResult, SignoffRequestRef, SignoffRequestSpec, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { TeamPolicy } from '../types.js';

afterEach(() => { _setSignoffDepsForTests(); });

const EPIC = 'a3f4b8c9d1e2f3a4';
const STORY: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: EPIC, storyId: 's1' };
const LLD = `LLD-${EPIC}-s1`;

const policy = (): TeamPolicy => ({
	teamMode: true, signoffStages: ['DEF', 'HLD', 'LLD', 'BUILD'], claimsEnforced: true, administrators: [],
	claimUnits: { epic: ['DEF', 'HLD'], story: ['LLD', 'PLAN'], task: ['BUILD'] }, forceTaskIssues: true,
	source: { ref: 'origin/main', fetchedAt: '2026-01-01T00:00:00Z', firstCommit: 'abc', firstCommitTime: '2026-06-01T00:00:00Z', anchorKnown: true },
}) as TeamPolicy;

const entryOf = (revision: number, ref: string, state: 'open' | 'changes-requested' | 'completed', at = '2026-07-01T00:00:00Z') =>
	({ revision, request: { entityId: ref, type: 'signoff-request', relation: 'tracked-by' }, state, actors: [], at });

/** A head approved and reviewed by the daemon at `revision`; `approvedRevision` and `reviewRevision` default to it. */
const headOf = (over: { status?: string; revision?: number; approvedRevision?: number; reviewRevision?: number; signoffs?: unknown[] } = {}): unknown => {
	const revision = over.revision ?? 1;
	return {
		authoredBy: 'controller',
		lifecycle: {
			status: over.status ?? 'approved', revision: { number: revision },
			approval: { revision: over.approvedRevision ?? revision, at: '2026-07-01T00:00:00Z' },
			review: { revision: over.reviewRevision ?? revision, party: 'daemon', verdict: 'pass', counts: {}, at: '2026-07-01T00:00:00Z' },
			signoffs: over.signoffs ?? [],
		},
	};
};

interface Submit {
	heads: Record<string, unknown>;
	opened: SignoffRequestSpec[];
	applied: Array<{ id: string; op: string; request: unknown }>;
	deps: SignoffDeps;
}

function submit(heads: Record<string, unknown>): Submit {
	const s: Submit = { heads: { ...heads }, opened: [], applied: [], deps: {} };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: 'alice' }),
		openSignoffRequest: (spec: SignoffRequestSpec): PortResult<SignoffRequestRef> => { s.opened.push(spec); return { ok: true, value: { ref: `acme/demo#${40 + s.opened.length}` } }; },
	} as unknown as TrackerPort;
	const service = {
		apply: async (id: string, op: string, _by: unknown, detail: { request?: unknown }) => { s.applied.push({ id, op, request: detail.request }); },
	} as unknown as LifecycleService;
	s.deps = {
		readPolicy: () => ({ ok: true, value: policy() }),
		readHead: (_repo, id) => s.heads[id],
		loadTracker: () => ({ ok: true, value: port }),
		resolveIssue: () => 'acme/demo#2',
		lifecycleFor: () => service,
		publishBranch: () => ({ ok: true, value: 'feature/signoff' }),
		readCodeReview: () => ({ verdict: 'pass', party: 'daemon' }),
	};
	return s;
}

const reasonOf = (r: PortResult<unknown>): string => { assert.equal(r.ok, false); return r.ok ? '' : r.reason; };

test('prerequisiteFailure refuses a stale review including an override-approved one, accepts a changes-requested head whose approval and review are current, and refuses one whose approval is behind', async () => {
	// a review of an earlier revision is refused, even when the revision was approved over it with an override reason
	let s = submit({ [LLD]: headOf({ revision: 3, reviewRevision: 2 }) });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /review of .* is of revision 2 but it is at revision 3: review it again first/);
	const overridden = headOf({ revision: 3, reviewRevision: 2 }) as { lifecycle: { approval: Record<string, unknown> } };
	overridden.lifecycle.approval['override'] = { reason: 'the reviewer is away' };
	s = submit({ [LLD]: overridden });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /is of revision 2 but it is at revision 3/);
	assert.deepEqual([s.opened.length, s.applied.length], [0, 0]);
	// a review of the current revision is accepted
	s = submit({ [LLD]: headOf({ revision: 3 }) });
	assert.equal((await openSignoff('/repo', STORY, [LLD], s.deps)).ok, true);

	// a head the reviewers asked changes of is accepted while its approval and review are of its current revision
	s = submit({ [LLD]: headOf({ status: 'changes-requested', revision: 2, signoffs: [entryOf(2, 'acme/demo#9', 'changes-requested')] }) });
	assert.equal((await openSignoff('/repo', STORY, [LLD], s.deps)).ok, true);
	// and refused, naming its status, when its approval is behind its revision, or its review is
	s = submit({ [LLD]: headOf({ status: 'changes-requested', revision: 3, approvedRevision: 2 }) });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /in changes-requested and its approval is not of its current revision 3: review and approve it again first/);
	s = submit({ [LLD]: headOf({ status: 'changes-requested', revision: 3, reviewRevision: 2 }) });
	assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), /is of revision 2 but it is at revision 3/);
	// every other status is refused as before
	for (const status of ['draft', 'signed-off']) {
		s = submit({ [LLD]: headOf({ status }) });
		assert.match(reasonOf(await openSignoff('/repo', STORY, [LLD], s.deps)), new RegExp(`not approved \\(status ${status}\\)`), status);
	}
});
