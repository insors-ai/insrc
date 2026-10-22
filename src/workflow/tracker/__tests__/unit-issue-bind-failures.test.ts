import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ensureDraftIssues } from '../../draft-issues.js';
import { History } from '../../artifact-core/history.js';
import { createMemoryJournal } from '../../artifact-core/journal.js';
import { createMemorySidecar } from '../../artifact-core/sidecar.js';
import { ArtifactStore } from '../../artifact-core/store.js';
import { ArtifactShapeError } from '../../artifact-core/types.js';
import { _setGateDepsForTests } from '../../team/gate.js';
import type { PolicyReader, TeamPolicy } from '../../team/types.js';
import { defineArtifactId, lldArtifactId } from '../../storage.js';
import { readBinding } from '../binding.js';
import { ensureUnitIssueDetailed, isUnitSettled } from '../unit-issue.js';
import { HASH, bound, deps, epic, fakeTracker, ref, seed, story , epicHead, storyHead } from './unit-issue-kit.js';

afterEach(() => _setGateDepsForTests());

const policy: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: ['root'] } as unknown as TeamPolicy });

test('two racing creates for one unit bind the lowest-numbered issue once, close the other as a duplicate, and keep the created issue when the duplicate check cannot list', () => {
	// another daemon's issue is created just before ours, so it has the lower number: it is the one bound, and ours is closed
	let fx = seed();
	try {
		const t = fakeTracker({ racer: true });
		const r = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.ok(r.ok);
		assert.deepEqual(r.ok && [r.value.issue, r.value.created, r.value.duplicateCheck], ['acme/demo#1', false, 'adopted-other']);
		assert.equal(bound(fx, epicHead), 'acme/demo#1', 'the lowest-numbered issue is the binding');
		assert.deepEqual(t.calls.closed, ['acme/demo#2'], 'this call\'s own issue is closed');
		assert.match(t.calls.comments[0]?.[1] ?? '', /Duplicate of acme\/demo#1/);
		// bound once: a second ensure resolves it with no tracker call
		const creates = t.calls.create;
		assert.ok(ensureUnitIssueDetailed(epic(fx.repo), t.port, deps).ok);
		assert.equal(t.calls.create, creates);
		assert.equal(readBinding(fx.repo, epicHead)?.reference.entityId, 'acme/demo#1');
	} finally { fx.cleanup(); }

	// the lower issue is ours: it is bound and the other call's is left to that call
	fx = seed();
	try {
		const t = fakeTracker({});
		const r = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.deepEqual(r.ok && [r.value.issue, r.value.created, r.value.duplicateCheck], ['acme/demo#1', true, 'clean']);
		assert.deepEqual(t.calls.closed, []);
	} finally { fx.cleanup(); }

	// the listing that finds duplicates fails: the created issue is bound and kept, and nothing is closed
	fx = seed();
	try {
		const t = fakeTracker({ racer: true, failList: true });
		const r = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.deepEqual(r.ok && [r.value.issue, r.value.created, r.value.duplicateCheck], ['acme/demo#2', true, 'not-run']);
		assert.equal(bound(fx, epicHead), 'acme/demo#2');
		assert.deepEqual(t.calls.closed, []);
	} finally { fx.cleanup(); }
});

test('a malformed binding makes ensureUnitIssueDetailed fail before creating anything and leaves the store read of that artifact failing until repaired', async () => {
	const fx = seed();
	try {
		const head = fx.read(epicHead);
		head.meta.envelope = { binding: { reference: ref('acme/demo#1'), createdAtRevision: 'x', posted: [] } };
		writeFileSync(fx.json(epicHead), JSON.stringify(head));

		const t = fakeTracker();
		const failed = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.equal(failed.ok, false);
		assert.equal(!failed.ok && failed.phase, 'before-create');
		assert.match(!failed.ok ? failed.reason : '', /the head of EPIC-[0-9a-f]+ cannot be read.*malformed binding/);
		assert.deepEqual([t.calls.find, t.calls.create, t.calls.list, t.calls.label.length], [0, 0, 0, 0], 'nothing was looked up or created');
		assert.equal(isUnitSettled(epic(fx.repo)), false);

		// the store cannot read that artifact either, until it is repaired
		const store = new ArtifactStore({ repoPath: fx.repo, history: new History(createMemorySidecar()), journal: createMemoryJournal() });
		await assert.rejects(store.read(epicHead), ArtifactShapeError);

		// repaired (the binding removed), the same call goes through and the store reads it again
		const repaired = fx.read(epicHead);
		delete repaired.meta.envelope.binding;
		writeFileSync(fx.json(epicHead), JSON.stringify(repaired));
		const ok = ensureUnitIssueDetailed(epic(fx.repo), t.port, deps);
		assert.ok(ok.ok);
		assert.equal(bound(fx, epicHead), 'acme/demo#1');
		assert.equal((await store.read(epicHead)).binding?.reference.entityId, 'acme/demo#1');
	} finally { fx.cleanup(); }
});

test('a bind that fails to write after the issue was created returns ok with the issue, leaves the unit unsettled so the draft hook reports it, and the next ensure binds it by label', () => {
	const fx = seed();
	try {
		const t = fakeTracker();
		assert.ok(ensureUnitIssueDetailed(epic(fx.repo), t.port, deps).ok);
		// a write staged for the STORY head makes the binding patch refuse: the issue is created, the record is not written
		const journal = join(fx.repo, '.insrc', 'journal', `${storyHead}.json`);
		mkdirSync(dirname(journal), { recursive: true });
		writeFileSync(journal, '{}');
		const first = ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.ok(first.ok, 'never a before-create failure');
		assert.deepEqual(first.ok && [first.value.issue, first.value.created, first.value.duplicateCheck], ['acme/demo#2', true, 'not-run']);
		assert.equal(readBinding(fx.repo, storyHead), undefined, 'the binding is absent');
		assert.equal(isUnitSettled(story(fx.repo)), false);

		// the draft hook reports it
		const lld = fx.read(lldArtifactId(HASH, 's1'));
		lld.meta.repoPath = fx.repo;
		writeFileSync(fx.json(lldArtifactId(HASH, 's1')), JSON.stringify(lld));
		const hook = ensureDraftIssues(fx.json(lldArtifactId(HASH, 's1')), { readPolicy: policy, loadTracker: () => ({ ok: true, value: t.port }), ensure: deps });
		assert.equal(hook.status, 'not-ready');
		assert.match(hook.status === 'not-ready' ? hook.reason : '', /exists but could not be recorded/);

		// the store write completes, and the next ensure binds the issue it already made: no second issue
		const creates = t.calls.create;
		rmSync(journal);
		const next = ensureUnitIssueDetailed(story(fx.repo), t.port, deps);
		assert.ok(next.ok);
		assert.equal(t.calls.create, creates, 'no second issue');
		assert.equal(bound(fx, storyHead), 'acme/demo#2');
		assert.equal(isUnitSettled(story(fx.repo)), true);

		// and by label when the binding was never written: the unit label finds the created issue
		const fresh = seed();
		try {
			const t2 = fakeTracker();
			assert.ok(ensureUnitIssueDetailed(epic(fresh.repo), t2.port, deps).ok);
			const j = join(fresh.repo, '.insrc', 'journal', `${storyHead}.json`);
			mkdirSync(dirname(j), { recursive: true }); writeFileSync(j, '{}');
			assert.ok(ensureUnitIssueDetailed(story(fresh.repo), t2.port, deps).ok);
			rmSync(j);
			const creates2 = t2.calls.create;
			const again = ensureUnitIssueDetailed(story(fresh.repo), t2.port, deps);
			assert.deepEqual(again.ok && [again.value.issue, again.value.created], ['acme/demo#2', false], 'found by its label');
			assert.equal(t2.calls.create, creates2);
			assert.equal(bound(fresh, storyHead), 'acme/demo#2');
		} finally { fresh.cleanup(); }
	} finally { fx.cleanup(); }
});
