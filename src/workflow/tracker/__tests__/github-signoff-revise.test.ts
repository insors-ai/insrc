/**
 * The GitHub adapter's reads for resubmitting a signoff request (Story s8): the request's branch and openness, and the state
 * counted from the reviews made after the last submission. A fake gh through the exec seam: no gh, no network.
 *
 * Run: npx tsx --test src/workflow/tracker/__tests__/github-signoff-revise.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createGithubTracker } from '../github-adapter.js';
import { installExecStandIn, installNoPrograms } from '../../__tests__/helpers/exec-stand-in.js';
import type { PortResult } from '../port.js';

afterEach(() => { installExecStandIn(); });

const tracker = createGithubTracker('acme', 'demo');
const REF = { ref: 'acme/demo#12' };

const flagValue = (call: readonly string[] | undefined, flag: string): string | undefined => { const i = call?.indexOf(flag) ?? -1; return i < 0 ? undefined : call?.[i + 1]; };
const prRow = (extra: object = {}): object => ({ number: 12, title: 'Signoff', state: 'OPEN', ...extra });
/** The gh pr view argv is for pull request 12 of acme/demo and asks for (at least) these json fields. */
function assertView(call: readonly string[] | undefined, fields: readonly string[]): void {
	assert.deepEqual(call?.slice(0, 3), ['pr', 'view', '12']);
	assert.equal(flagValue(call, '-R'), 'acme/demo');
	const asked = (flagValue(call, '--json') ?? '').split(',');
	for (const f of fields) assert.ok(asked.includes(f), `asks for ${f}`);
}

function fakeGh(answer: (args: readonly string[]) => string): string[][] {
	const calls: string[][] = [];
	installExecStandIn((_cmd, args) => { calls.push([...args]); return answer(args); });
	return calls;
}

const failureOf = <T>(r: PortResult<T>): { kind: string; reason: string } => {
	assert.equal(r.ok, false);
	if (r.ok) throw new Error('unreachable');
	return r;
};

async function readRequest(json: object) {
	const seen = fakeGh(() => JSON.stringify(prRow(json)));
	const read = tracker.readSignoffRequest;
	assert.ok(read !== undefined, 'the github tracker reads a request');
	const r = await read(REF);
	assertView(seen[0], ['headRefName', 'state']);
	return r;
}

test('readSignoffRequest maps headRefName and OPEN, MERGED and CLOSED to a branch and openness, and rejects a malformed ref and unreadable output', async () => {
	assert.deepEqual(await readRequest({ headRefName: 'insrc/signoff/s8', state: 'OPEN' }), { ok: true, value: { branch: 'insrc/signoff/s8', open: true } });
	assert.deepEqual(await readRequest({ headRefName: 'insrc/signoff/s8', state: 'MERGED' }), { ok: true, value: { branch: 'insrc/signoff/s8', open: false } });
	assert.deepEqual(await readRequest({ headRefName: 'insrc/signoff/s8', state: 'CLOSED' }), { ok: true, value: { branch: 'insrc/signoff/s8', open: false } });
	assert.match(failureOf(await readRequest({ state: 'OPEN' })).reason, /no branch or state/);

	const read = tracker.readSignoffRequest;
	assert.ok(read !== undefined);
	assert.match(failureOf(await read({ ref: 'nope' })).reason, /malformed signoff request reference/);
	fakeGh(() => 'not json');
	assert.match(failureOf(await read(REF)).reason, /could not parse gh JSON/);

	const kinds: Array<[Error, string]> = [
		[Object.assign(new Error('x'), { code: 'ENOENT' }), 'missing-tool'],
		[Object.assign(new Error('x'), { stderr: 'gh auth login required' }), 'missing-signin'],
		[Object.assign(new Error('x'), { stderr: 'dial tcp: i/o timeout' }), 'unreachable'],
		[Object.assign(new Error('x'), { stderr: 'HTTP 422: Validation Failed' }), 'rejected'],
	];
	for (const [err, kind] of kinds) {
		if (kind === 'missing-tool') installNoPrograms(); else installExecStandIn(() => { throw err; });
		assert.equal(failureOf(await read(REF)).kind, kind, kind);
	}
});

const SINCE = '2026-10-23T10:00:00Z';
const review = (login: string, state: string, submittedAt: string) => ({ author: { login }, state, submittedAt });

async function stateSince(reviews: object[], extra: object = {}, since: string | undefined = SINCE) {
	const seen = fakeGh(() => JSON.stringify(prRow({ mergedAt: null, reviews, ...extra })));
	const r = (await tracker.readSignoffState(REF, since));
	assertView(seen[0], ['state', 'mergedAt', 'reviews']);
	return r;
}

test("readSignoffState with since uses each reviewer's latest decisive review and answers as in s7 without since", async () => {
	// a request for changes at or before since is open, one after is changes-requested
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T09:00:00Z')]), { ok: true, value: 'open' });
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', SINCE)]), { ok: true, value: 'open' });
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z')]), { ok: true, value: 'changes-requested' });
	// a later approval or dismissal by the same reviewer clears it; another reviewer's approval does not
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z'), review('bob', 'APPROVED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'open' });
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z'), review('bob', 'DISMISSED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'open' });
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z'), review('amy', 'APPROVED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'changes-requested' });
	// a comment neither clears a request for changes nor creates one
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z'), review('bob', 'COMMENTED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'changes-requested' });
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T09:00:00Z'), review('bob', 'COMMENTED', '2026-10-23T12:00:00Z')]), { ok: true, value: 'open' });
	// reviews are read in any order
	assert.deepEqual(await stateSince([review('bob', 'APPROVED', '2026-10-23T12:00:00Z'), review('bob', 'CHANGES_REQUESTED', '2026-10-23T11:00:00Z')]), { ok: true, value: 'open' });
	// whole seconds from GitHub against a local stamp with milliseconds are compared as instants, not as text
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T10:00:05Z')], {}, '2026-10-23T10:00:05.900Z'), { ok: true, value: 'open' });
	assert.deepEqual(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T10:00:06Z')], {}, '2026-10-23T10:00:05.900Z'), { ok: true, value: 'changes-requested' });
	assert.match(failureOf(await stateSince([review('bob', 'CHANGES_REQUESTED', '2026-10-23T10:00:06Z')], {}, 'not a time')).reason, /is not a time/);
	// merged is completed and a closed request that was not merged is changes-requested, whatever the reviews
	assert.deepEqual(await stateSince([], { state: 'MERGED', mergedAt: '2026-10-23T13:00:00Z' }), { ok: true, value: 'completed' });
	assert.deepEqual(await stateSince([review('bob', 'APPROVED', '2026-10-23T12:00:00Z')], { state: 'CLOSED' }), { ok: true, value: 'changes-requested' });

	// without since the answer is the review decision, as in s7
	const seen = fakeGh(() => JSON.stringify(prRow({ mergedAt: null, reviewDecision: 'CHANGES_REQUESTED' })));
	assert.deepEqual((await tracker.readSignoffState(REF)), { ok: true, value: 'changes-requested' });
	assertView(seen[0], ['state', 'mergedAt', 'reviewDecision']);
});
