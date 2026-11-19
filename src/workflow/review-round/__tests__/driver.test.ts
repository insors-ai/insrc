/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runReviewRound } from '../driver.js';
import type { RoundDriverHooks } from '../types.js';
import type { ReviewTargets } from '../../artifact-core/types.js';

const targets: ReviewTargets = { entries: [] };

function stubHooks<F>(ground: RoundDriverHooks<F>['ground'], security?: RoundDriverHooks<F>['security']): RoundDriverHooks<F> {
	return { reviewKind: 'design', checkpointGranularity: 'round', ground, ...(security !== undefined ? { security } : {}) };
}

/** A spy that records every call's argument count and [targets, round] pair. */
function spyGround<F>(findings: readonly F[]): { ground: RoundDriverHooks<F>['ground']; calls: Array<[ReviewTargets, number]>; argumentCounts: number[] } {
	const calls: Array<[ReviewTargets, number]> = [];
	const argumentCounts: number[] = [];
	const ground: RoundDriverHooks<F>['ground'] = async (...args: [ReviewTargets, number]) => {
		argumentCounts.push(args.length);
		calls.push([args[0], args[1]]);
		return findings;
	};
	return { ground, calls, argumentCounts };
}

describe('runReviewRound', () => {
	it('a round 1 call invokes hooks.ground once with the complete targets and no prior-findings argument', async () => {
		const spy = spyGround<string>(['finding-a']);
		const hooks = stubHooks<string>(spy.ground);

		const result = await runReviewRound('review-1', hooks, 1, targets);

		assert.equal(spy.calls.length, 1);
		assert.deepEqual(spy.calls[0], [targets, 1]);
		assert.deepEqual(spy.argumentCounts, [2], 'hooks.ground must receive exactly targets and round -- no third, prior-findings argument');
		assert.deepEqual(result, { round: 1, findings: ['finding-a'] });
	});

	it('a round 2 (Correction-and-Re-review) call invokes hooks.ground through the identical call shape as round 1, differing only in the round number passed', async () => {
		const spy = spyGround<string>(['finding-b']);
		const hooks = stubHooks<string>(spy.ground);

		await runReviewRound('review-1', hooks, 1, targets);
		await runReviewRound('review-1', hooks, 2, targets);

		assert.equal(spy.calls.length, 2);
		assert.deepEqual(spy.calls[0], [targets, 1]);
		assert.deepEqual(spy.calls[1], [targets, 2]);
		assert.deepEqual(spy.argumentCounts, [2, 2], 'both calls must have the identical two-argument shape, differing only in the round value');
	});

	it("hooks.ground receives the full targets/artifact unmodified -- nothing is stripped or withheld before grounding runs", async () => {
		// Deep-frozen so any in-place stripping by the driver would throw (ES modules are
		// always strict mode), and compared against a snapshot taken BEFORE the call --
		// not against itself -- so this proves content fidelity, not just reference identity.
		const populatedTargets: ReviewTargets = Object.freeze({ entries: Object.freeze([Object.freeze({ path: 'src/a.ts' })]) });
		const expectedSnapshot = structuredClone(populatedTargets);
		const spy = spyGround<string>([]);
		const hooks = stubHooks<string>(spy.ground);

		await runReviewRound('review-1', hooks, 1, populatedTargets);

		assert.equal(spy.calls[0]?.[0], populatedTargets, 'the exact same targets reference must reach hooks.ground, not a stripped copy');
		assert.deepEqual(spy.calls[0]?.[0], expectedSnapshot, 'content must match a snapshot taken before the call -- proves no field was stripped or withheld, not merely that the reference was not swapped');
	});

	it('round 0 is rejected with a RangeError before any hook is called', () => {
		const spy = spyGround<string>([]);
		let securityCalls = 0;
		const hooks = stubHooks<string>(spy.ground, async () => { securityCalls += 1; return []; });

		assert.throws(() => runReviewRound('review-1', hooks, 0, targets), RangeError);
		assert.equal(spy.calls.length, 0);
		assert.equal(securityCalls, 0, 'a supplied hooks.security must not be called either, when the round is rejected before any hook runs');
	});

	it('a negative round is rejected with a RangeError before any hook is called', () => {
		const spy = spyGround<string>([]);
		let securityCalls = 0;
		const hooks = stubHooks<string>(spy.ground, async () => { securityCalls += 1; return []; });

		assert.throws(() => runReviewRound('review-1', hooks, -1, targets), RangeError);
		assert.equal(spy.calls.length, 0);
		assert.equal(securityCalls, 0, 'a supplied hooks.security must not be called either, when the round is rejected before any hook runs');
	});

	it('a non-integer round is rejected with a RangeError before any hook is called', () => {
		const spy = spyGround<string>([]);
		let securityCalls = 0;
		const hooks = stubHooks<string>(spy.ground, async () => { securityCalls += 1; return []; });

		assert.throws(() => runReviewRound('review-1', hooks, 1.5, targets), RangeError);
		assert.equal(spy.calls.length, 0);
		assert.equal(securityCalls, 0, 'a supplied hooks.security must not be called either, when the round is rejected before any hook runs');
	});

	it('a rejecting hooks.ground propagates its rejection and hooks.security is never called for that round', async () => {
		const groundError = new Error('ground failed');
		let securityCalls = 0;
		const hooks = stubHooks<string>(
			async () => { throw groundError; },
			async () => { securityCalls += 1; return []; },
		);

		await assert.rejects(() => runReviewRound('review-1', hooks, 1, targets), groundError);
		assert.equal(securityCalls, 0);
	});

	it("a rejecting hooks.security propagates its rejection rather than returning hooks.ground's findings alone", async () => {
		const securityError = new Error('security failed');
		const hooks = stubHooks<string>(
			async () => ['finding-a'],
			async () => { throw securityError; },
		);

		await assert.rejects(() => runReviewRound('review-1', hooks, 1, targets), securityError);
	});

	it('an empty ReviewTargets.entries array is passed through to hooks.ground unchanged, with no special-casing', async () => {
		const emptyTargets: ReviewTargets = { entries: [] };
		const spy = spyGround<string>([]);
		const hooks = stubHooks<string>(spy.ground);

		await runReviewRound('review-1', hooks, 1, emptyTargets);

		assert.equal(spy.calls[0]?.[0], emptyTargets);
		assert.deepEqual(spy.calls[0]?.[0].entries, []);
	});

	it('opts omitted defaults runSecurityPass to true -- hooks.security runs when it is supplied', async () => {
		let securityCalls = 0;
		const hooks = stubHooks<string>(
			async () => ['finding-a'],
			async () => { securityCalls += 1; return ['finding-b']; },
		);

		const result = await runReviewRound('review-1', hooks, 1, targets);

		assert.equal(securityCalls, 1);
		assert.deepEqual(result.findings, ['finding-a', 'finding-b']);
	});

	it('opts.runSecurityPass:false suppresses hooks.security even when it is supplied', async () => {
		let securityCalls = 0;
		const hooks = stubHooks<string>(
			async () => ['finding-a'],
			async () => { securityCalls += 1; return ['finding-b']; },
		);

		const result = await runReviewRound('review-1', hooks, 1, targets, { runSecurityPass: false });

		assert.equal(securityCalls, 0);
		assert.deepEqual(result.findings, ['finding-a']);
	});

	it('hooks.security undefined is a no-op, not a thrown error, when runSecurityPass is true or omitted', async () => {
		const hooks = stubHooks<string>(async () => ['finding-a']);

		const omitted = await runReviewRound('review-1', hooks, 1, targets);
		const explicitTrue = await runReviewRound('review-1', hooks, 1, targets, { runSecurityPass: true });

		assert.deepEqual(omitted.findings, ['finding-a']);
		assert.deepEqual(explicitTrue.findings, ['finding-a']);
	});

	it('a large round number (e.g. 50) runs through the identical code path as round 1, with no round-number-based branching', async () => {
		const spy = spyGround<string>(['finding-a']);
		const hooks = stubHooks<string>(spy.ground);

		const result = await runReviewRound('review-1', hooks, 50, targets);

		assert.deepEqual(spy.calls[0], [targets, 50]);
		assert.deepEqual(spy.argumentCounts, [2]);
		assert.deepEqual(result, { round: 50, findings: ['finding-a'] });
	});

	it("reviewId never appears in hooks.ground's or hooks.security's own call arguments across round 1 and round 2, and is left available unchanged for the caller to thread on to the sc4/sc5 calls, never substituted for a different value", async () => {
		const reviewId = 'review-xyz';
		const spy = spyGround<string>(['finding-a']);
		const securityCalls: Array<[ReviewTargets, number]> = [];
		const securityArgumentCounts: number[] = [];
		const security: RoundDriverHooks<string>['security'] = async (...args: [ReviewTargets, number]) => {
			securityArgumentCounts.push(args.length);
			securityCalls.push([args[0], args[1]]);
			return ['finding-b'];
		};
		const hooks = stubHooks<string>(spy.ground, security);

		await runReviewRound(reviewId, hooks, 1, targets);
		await runReviewRound(reviewId, hooks, 2, targets);

		assert.deepEqual(spy.argumentCounts, [2, 2], 'hooks.ground never receives reviewId as one of its own arguments');
		assert.deepEqual(securityArgumentCounts, [2, 2], 'hooks.security never receives reviewId as one of its own arguments either');
		assert.deepEqual(spy.calls, [[targets, 1], [targets, 2]], "hooks.ground's actual received arguments are exactly [targets, round] -- reviewId was not substituted for either one");
		assert.deepEqual(securityCalls, [[targets, 1], [targets, 2]], "hooks.security's actual received arguments are exactly [targets, round] -- reviewId was not substituted for either one");
		for (const [call, label] of [...spy.calls.map((c) => [c, 'hooks.ground'] as const), ...securityCalls.map((c) => [c, 'hooks.security'] as const)]) {
			assert.ok(!call.includes(reviewId as unknown as ReviewTargets | number), `${label}'s captured arguments never contain the reviewId value itself -- it stays out of this function's hook calls entirely, left unchanged for the caller to thread on to the sc4/sc5 calls`);
		}
	});
});
