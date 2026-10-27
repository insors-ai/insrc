import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

import { ensureDraftIssues } from '../../draft-issues.js';
import { _setGateDepsForTests, teamContext } from '../../team/gate.js';
import type { PolicyReader, TeamPolicy } from '../../team/types.js';
import { defineArtifactId, lldArtifactId, planArtifactId } from '../../storage.js';
import { readBinding } from '../binding.js';
import type { Capability, PortResult, TrackerPort } from '../port.js';
import { ensureUnitIssueDetailed, isUnitSettled, unitLabel } from '../unit-issue.js';
import { CFG, HASH, MEMBERSHIP, bound, deps, epic, fakeTracker, ref, seed, story, task , epicHead, storyHead } from './unit-issue-kit.js';

afterEach(() => _setGateDepsForTests());

const policy: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: ['root'] } as unknown as TeamPolicy });
const planJson = (fx: ReturnType<typeof seed>) => fx.read(planArtifactId(HASH, 's1'));

test('ensureUnitIssueDetailed binds an issue a person created first and an issue the framework created, a repository with no tracker gets no binding, and a Task unit is bound on its Task artifact with no record on the Plan', async () => {
	// the framework creates the issues: the Epic's Define and the Story's LLD are bound to them
	let fx = seed();
	try {
		const t = fakeTracker();
		assert.ok((await ensureUnitIssueDetailed(epic(fx.repo), t.port, deps)).ok);
		assert.ok((await ensureUnitIssueDetailed(story(fx.repo), t.port, deps)).ok);
		assert.equal(bound(fx, epicHead), 'acme/demo#1');
		assert.equal(bound(fx, storyHead), 'acme/demo#2');
		assert.deepEqual(fx.read(storyHead).meta.envelope.binding, { reference: ref('acme/demo#2'), createdAtRevision: 1, posted: [] });
		assert.equal(readBinding(fx.repo, epicHead)?.reference.entityId, 'acme/demo#1');
		// nothing is written on the Define or the LLD: no unit record and no older ref
		assert.equal(fx.read(defineArtifactId(HASH)).meta.tracker, undefined);
		assert.equal(fx.read(lldArtifactId(HASH, 's1')).meta.tracker, undefined);

		// a Task unit is bound on its Task artifact, with no record and no binding on the Plan
		assert.ok((await ensureUnitIssueDetailed(task(fx.repo), t.port, deps)).ok);
		assert.equal(bound(fx, `TASK-${HASH}-s1-t1`), 'acme/demo#3');
		assert.equal(planJson(fx).meta.tracker?.units, undefined, 'no unit record on the Plan');
		assert.equal(planJson(fx).meta.tracker?.taskRefs, undefined, 'and no taskRefs');
		assert.equal(planJson(fx).meta.envelope, undefined, 'the Plan carries no binding');
		assert.equal(isUnitSettled(task(fx.repo)), true);
		assert.equal(isUnitSettled(story(fx.repo)), true);
	} finally { fx.cleanup(); }

	// a person created the issues first: they are found by their unit label and bound, and nothing is created
	fx = seed();
	try {
		const t = fakeTracker();
		const label = (unit: ReturnType<typeof epic>) => unitLabel(unit);
		t.issues.push({ number: 21, ref: 'acme/demo#21', state: 'open', spec: { title: 'Epic by hand', body: 'b', labels: [CFG.epicLabel, MEMBERSHIP, label(epic(fx.repo))] } });
		t.issues.push({ number: 22, ref: 'acme/demo#22', state: 'open', spec: { title: 'Story by hand', body: 'b', labels: [CFG.storyLabel, MEMBERSHIP, label(story(fx.repo))] } });
		const e = await ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		const s = await ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.deepEqual(e.ok && [e.value.issue, e.value.created], ['acme/demo#21', false]);
		assert.deepEqual(s.ok && [s.value.issue, s.value.created], ['acme/demo#22', false]);
		assert.equal(t.calls.create, 0, 'the issues a person made are adopted, not duplicated');
		assert.equal(bound(fx, epicHead), 'acme/demo#21');
		assert.equal(bound(fx, storyHead), 'acme/demo#22');
	} finally { fx.cleanup(); }

	// a repository with no tracker has no binding, and nothing is looked up or created
	fx = seed();
	try {
		const t = fakeTracker();
		const none = await ensureUnitIssueDetailed(epic(fx.repo), t.port, { ...deps, readConfig: () => ({ type: 'none', source: 'per-repo-config' }) });
		assert.equal(none.ok, false);
		assert.deepEqual([t.calls.find, t.calls.create], [0, 0]);
		assert.equal(readBinding(fx.repo, epicHead), undefined);
		assert.equal(fx.read(defineArtifactId(HASH)).meta.envelope, undefined);
	} finally { fx.cleanup(); }
});

test('a failed link under the parent is stored as the binding\'s pending link, retried by the next ensure, cleared once done and not retried again', async () => {
	const fx = seed();
	try {
		const t = fakeTracker({ failLink: 1 });
		assert.ok((await ensureUnitIssueDetailed(epic(fx.repo), t.port, deps)).ok);
		assert.ok((await ensureUnitIssueDetailed(story(fx.repo), t.port, deps)).ok, 'the issue is still returned');
		assert.deepEqual(readBinding(fx.repo, storyHead)?.pendingLink, { parent: ref('acme/demo#1'), childId: 1002 });
		assert.equal(isUnitSettled(story(fx.repo)), false);

		const links = t.calls.link.length;
		const creates = t.calls.create;
		assert.ok((await ensureUnitIssueDetailed(story(fx.repo), t.port, deps)).ok);
		assert.equal(t.calls.link.length, links + 1, 'the retry linked once');
		assert.equal(t.calls.create, creates, 'no new issue');
		assert.equal(readBinding(fx.repo, storyHead)?.pendingLink, undefined, 'cleared');
		assert.equal(isUnitSettled(story(fx.repo)), true);

		// done: a further ensure makes no link call
		await ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.equal(t.calls.link.length, links + 1, 'not retried again');
		// the binding is still one issue
		assert.equal(bound(fx, storyHead), 'acme/demo#2');
	} finally { fx.cleanup(); }
});

test('the draft hook and the handoff check read the binding for an Epic or Story unit, and a pre-s6 head with only the old ref is rebound once from it with no new issue', async () => {
	const fx = seed();
	try {
		// bind both units, then make the LLD a head a draft hook accepts (it reads repoPath from the head's meta)
		const t = fakeTracker();
		assert.ok((await ensureUnitIssueDetailed(epic(fx.repo), t.port, deps)).ok);
		assert.ok((await ensureUnitIssueDetailed(story(fx.repo), t.port, deps)).ok);
		const lld = fx.read(lldArtifactId(HASH, 's1'));
		lld.meta.repoPath = fx.repo;
		writeFileSync(fx.json(lldArtifactId(HASH, 's1')), JSON.stringify(lld));

		// the draft hook: every unit is bound and settled, so no tracker is loaded
		let loads = 0;
		const hook = await ensureDraftIssues(fx.json(lldArtifactId(HASH, 's1')), { readPolicy: policy, loadTracker: () => { loads += 1; return { ok: false, kind: 'missing-tool', reason: 'no gh' }; }, ensure: deps });
		assert.equal(hook.status, 'ready');
		assert.deepEqual(hook.status === 'ready' ? hook.units.map(u => [u.unit, u.issue, u.created]) : null, [['epic', 'acme/demo#1', false], ['story:s1', 'acme/demo#2', false]]);
		assert.equal(loads, 0, 'read from the binding: no tracker call');

		// the handoff check (teamContext with createIssue false) reads the binding
		const port = { kind: 'github', capabilities: new Set(['claim']), whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }) } as unknown as TrackerPort;
		_setGateDepsForTests({ readPolicy: policy, loadTracker: (_r: string, _n: ReadonlySet<Capability>) => ({ ok: true, value: port }) });
		const ctx = await teamContext(fx.repo, story(fx.repo), { createIssue: false });
		assert.ok(ctx.ok && ctx.team);
		assert.equal(ctx.ok && ctx.team ? ctx.issue : null, 'acme/demo#2');
	} finally { fx.cleanup(); }

	// a head with only the older storyRef and no binding on the STORY head: the older ref is not read, so the Story has no issue yet
	const old = seed();
	try {
		const lld = old.read(lldArtifactId(HASH, 's1'));
		lld.meta.tracker = { adapter: 'github', storyRef: 'acme/demo#5' };
		writeFileSync(old.json(lldArtifactId(HASH, 's1')), JSON.stringify(lld));
		assert.equal(readBinding(old.repo, storyHead), undefined);
		const t = fakeTracker();
		const port = { ...t.port, whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }) } as unknown as TrackerPort;
		_setGateDepsForTests({ readPolicy: policy, loadTracker: () => ({ ok: true, value: port }) });
		const ctx = await teamContext(old.repo, story(old.repo), { createIssue: false });
		assert.notEqual(ctx.ok && ctx.team ? ctx.issue : null, 'acme/demo#5', 'the older ref is not resolved');
		assert.equal(readBinding(old.repo, storyHead), undefined, 'and nothing is bound from it');
		assert.deepEqual([t.calls.find, t.calls.create, t.calls.list], [0, 0, 0], 'no lookup and no new issue');
	} finally { old.cleanup(); }
});
