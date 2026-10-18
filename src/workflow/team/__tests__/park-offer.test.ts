/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The park offer (sc4 amendment AMD-315d510cb28100e2-13): a refusal for a stage someone else holds carries
 * offerPark when the registered provider says the actor has unparked work, and says so in its text.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/park-offer.test.ts
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setGateDepsForTests, claim, describeOutcome, registerParkOfferProvider, teamGate, type GateOutcome } from '../gate.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../types.js';

const UNIT: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' };
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });

interface Seen { loads: number }

function inject(holder: string | null, readPolicy: PolicyReader = team): Seen {
	const seen: Seen = { loads: 0 };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy,
		loadTracker: () => { seen.loads += 1; return { ok: true, value: port }; },
		resolveIssue: () => 'acme/demo#7',
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }),
		artifactExists: () => true,
	});
	return seen;
}

afterEach(() => { _setGateDepsForTests(); registerParkOfferProvider(undefined); });

const offer = (o: GateOutcome): boolean | undefined => (o.kind === 'held-by-other' ? o.offerPark : undefined);

test('teamGate sets offerPark only on held-by-other and only through a registered provider, a throwing provider counts as false, a repo with no policy makes no provider call, and describeOutcome appends the park command only then', () => {
	// no provider registered: never an offer
	inject('bob');
	assert.equal(offer(teamGate('/repo', UNIT, 'author')), false);

	// the provider is asked with (repo, unit, actor) and its answer decides
	const asked: Array<[string, string | undefined, string]> = [];
	registerParkOfferProvider((repo, unit, actor) => { asked.push([repo, unit.storyId, actor]); return true; });
	const held = teamGate('/repo', UNIT, 'author');
	assert.equal(offer(held), true);
	assert.deepEqual(asked, [['/repo', 's1', 'alice']]);
	// the explicit claim path offers too
	assert.equal(offer(claim('/repo', UNIT)), true);
	registerParkOfferProvider(() => false);
	assert.equal(offer(teamGate('/repo', UNIT, 'build')), false);

	// a throwing provider counts as false
	registerParkOfferProvider(() => { throw new Error('boom'); });
	assert.equal(offer(teamGate('/repo', UNIT, 'author')), false);

	// outcomes other than held-by-other never carry an offer and never ask the provider
	let calls = 0;
	registerParkOfferProvider(() => { calls += 1; return true; });
	inject('alice');
	assert.equal(teamGate('/repo', UNIT, 'author').kind, 'allowed');
	inject(null);
	assert.equal(teamGate('/repo', UNIT, 'author').kind, 'allowed');
	assert.equal(calls, 0, 'the provider is only asked for a held-by-other outcome');

	// no policy: no tracker call and no provider call
	const free = inject('bob', none);
	assert.equal(teamGate('/repo', UNIT, 'author').kind, 'allowed');
	assert.equal(free.loads, 0);
	assert.equal(calls, 0);

	// the text: the park command only when an offer exists
	assert.match(describeOutcome({ kind: 'held-by-other', holder: 'bob', offerPark: true }), /^held by bob; .*team park <epicHash> \[storyId\]/);
	assert.equal(describeOutcome({ kind: 'held-by-other', holder: 'bob', offerPark: false }), 'held by bob');
	assert.doesNotMatch(describeOutcome({ kind: 'refused', reason: 'nope' }), /park/);
});
