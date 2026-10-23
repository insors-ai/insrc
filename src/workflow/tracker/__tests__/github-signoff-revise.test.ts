/**
 * The GitHub adapter's reads for resubmitting a signoff request (Story s8): the request's branch and openness, and the state
 * counted from the reviews made after the last submission. A fake gh through the exec seam: no gh, no network.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/github-signoff-revise.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubTracker } from '../github-adapter.js';
import { _setTrackerExecForTests } from '../github.js';
import type { PortResult } from '../port.js';

afterEach(() => { _setTrackerExecForTests(); });

const tracker = createGithubTracker('acme', 'demo');
const REF = { ref: 'acme/demo#12' };

function fakeGh(answer: (args: readonly string[]) => string): string[][] {
	const calls: string[][] = [];
	_setTrackerExecForTests((_cmd, args) => { calls.push([...args]); return answer(args); });
	return calls;
}

const failureOf = <T>(r: PortResult<T>): { kind: string; reason: string } => {
	assert.equal(r.ok, false);
	if (r.ok) throw new Error('unreachable');
	return r;
};

function readRequest(json: object) {
	const seen = fakeGh(() => JSON.stringify(json));
	const read = tracker.readSignoffRequest;
	assert.ok(read !== undefined, 'the github tracker reads a request');
	const r = read(REF);
	assert.deepEqual(seen[0], ['pr', 'view', '12', '--repo', 'acme/demo', '--json', 'headRefName,state']);
	return r;
}

test('readSignoffRequest maps headRefName and OPEN, MERGED and CLOSED to a branch and openness, and rejects a malformed ref and unreadable output', () => {
	assert.deepEqual(readRequest({ headRefName: 'insrc/signoff/s8', state: 'OPEN' }), { ok: true, value: { branch: 'insrc/signoff/s8', open: true } });
	assert.deepEqual(readRequest({ headRefName: 'insrc/signoff/s8', state: 'MERGED' }), { ok: true, value: { branch: 'insrc/signoff/s8', open: false } });
	assert.deepEqual(readRequest({ headRefName: 'insrc/signoff/s8', state: 'CLOSED' }), { ok: true, value: { branch: 'insrc/signoff/s8', open: false } });
	assert.match(failureOf(readRequest({ state: 'OPEN' })).reason, /no branch or state/);

	const read = tracker.readSignoffRequest;
	assert.ok(read !== undefined);
	assert.match(failureOf(read({ ref: 'nope' })).reason, /malformed signoff request reference/);
	fakeGh(() => 'not json');
	assert.match(failureOf(read(REF)).reason, /unexpected pull request JSON/);

	const kinds: Array<[Error, string]> = [
		[Object.assign(new Error('x'), { code: 'ENOENT' }), 'missing-tool'],
		[Object.assign(new Error('x'), { stderr: 'gh auth login required' }), 'missing-signin'],
		[Object.assign(new Error('x'), { code: 'ETIMEDOUT' }), 'unreachable'],
		[Object.assign(new Error('x'), { stderr: 'HTTP 422: Validation Failed' }), 'rejected'],
	];
	for (const [err, kind] of kinds) {
		_setTrackerExecForTests(() => { throw err; });
		assert.equal(failureOf(read(REF)).kind, kind, kind);
	}
});

const SINCE = '2026-10-23T10:00:00Z';
const review = (login: string, state: string, submittedAt: string) => ({ author: { login }, state, submittedAt });

function stateSince(reviews: object[], extra: object = {}, since: string | undefined = SINCE) {
	const seen = fakeGh(() => JSON.stringify({ state: 'OPEN', mergedAt: null, reviews, ...extra }));
	const r = tracker.readSignoffState(REF, since);
	assert.deepEqual(seen[0], ['pr', 'view', '12', '--repo', 'acme/demo', '--json', 'state,mergedAt,reviews']);
	return r;
}

test("readSignoffState with since uses each reviewer's latest decisive review and answers as in s7 without since", () => {
	// a request for changes at or before since is open, one after is changes-requested
	assert.deepEqual(stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T09:00:00Z')]), { ok: true, value: 'open' });
	assert.deepEqual(stateSince([review('bob', 'CHANGES_REQUESTED', SINCE)]), { ok: true, value: 'open' });
	assert.deepEqual(stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z')]), { ok: true, value: 'changes-requested' });
	// a later approval or dismissal by the same reviewer clears it; another reviewer's approval does not
	assert.deepEqual(stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z'), review('bob', 'APPROVED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'open' });
	assert.deepEqual(stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z'), review('bob', 'DISMISSED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'open' });
	assert.deepEqual(stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z'), review('amy', 'APPROVED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'changes-requested' });
	// a comment neither clears a request for changes nor creates one
	assert.deepEqual(stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z'), review('bob', 'COMMENTED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'changes-requested' });
	assert.deepEqual(stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T09:00:00Z'), review('bob', 'COMMENTED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'open' });
	// reviews are read in any order
	assert.deepEqual(stateSince([review('bob', 'APPROVED', '2026-10-23T12:00:00Z'), review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z')]), { ok: true, value: 'open' });
	// merged is completed and a closed request that was not merged is changes-requested, whatever the reviews
	assert.deepEqual(stateSince([], { state: 'MERGED', mergedAt: '2026-10-23T13:00:00Z' }), { ok: true, value: 'completed' });
	assert.deepEqual(stateSince([review('bob', 'APPROVED', '2026-10-23T12:00:00Z')], { state: 'CLOSED' }), { ok: true, value: 'changes-requested' });

	// without since the answer is the review decision, as in s7
	const seen = fakeGh(() => JSON.stringify({ state: 'OPEN', mergedAt: null, reviewDecision: 'CHANGES_REQUESTED' }));
	assert.deepEqual(tracker.readSignoffState(REF), { ok: true, value: 'changes-requested' });
	assert.deepEqual(seen[0], ['pr', 'view', '12', '--repo', 'acme/demo', '--json', 'state,mergedAt,reviewDecision']);
});
