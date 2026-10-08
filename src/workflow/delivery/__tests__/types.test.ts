/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S001 / t1 — delivery types. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DeliveryStoreUnreadableError } from '../types.js';
import type {
	ArtifactCurrency, ArtifactGate, AttentionReason, CurrencyPassResult, DeliveryRoute, DeliveryStage, EffectiveAmendment,
	GatePassResult, ItemGates, ReviewCurrency, ReviewVerdict, StageAnnotation, StagePassResult, TaskResult,
} from '../types.js';
import type { ReviewVerdict as SourceReviewVerdict } from '../../review/types.js';

test('DeliveryStoreUnreadableError carries the store path and the underlying message', () => {
	const err = new DeliveryStoreUnreadableError('/repo/.insrc/artifacts', 'EACCES: permission denied');
	assert.ok(err instanceof Error);
	assert.equal(err.name, 'DeliveryStoreUnreadableError');
	assert.equal(err.storePath, '/repo/.insrc/artifacts');
	assert.match(err.message, /\/repo\/\.insrc\/artifacts/);
	assert.match(err.message, /EACCES: permission denied/);
});

// E1 / S002 / t1 — the sc4 types. Each table is typed Record<Union, true>, so a
// member missing from the table or a key that is not a member fails to compile;
// the runtime assertions pin the HLD's member lists.

const STAGES: Record<DeliveryStage, true> = {
	'scoped': true, 'design-plan': true, 'ready-design-approved': true,
	'ready-plan-approved': true, 'build-recorded': true, 'complete': true,
};
const ROUTES: Record<DeliveryRoute, true> = {
	'full-chain': true, 'feature': true, 'small': true, 'small-bugfix': true,
	'sized-bugfix': true, 'trivial': true, 'unknown': true,
};

test('the stage and route types list exactly the HLD members', () => {
	assert.deepEqual(Object.keys(STAGES), ['scoped', 'design-plan', 'ready-design-approved', 'ready-plan-approved', 'build-recorded', 'complete']);
	assert.deepEqual(Object.keys(ROUTES), ['full-chain', 'feature', 'small', 'small-bugfix', 'sized-bugfix', 'trivial', 'unknown']);
	const annotation: StageAnnotation = { itemId: 'E1:S001', stage: 'scoped', route: 'full-chain', reason: { text: 'no design, plan or build record', artifactIds: [] } };
	const result: StagePassResult = { stages: new Map([[annotation.itemId, annotation]]), notices: [] };
	assert.equal(result.stages.get('E1:S001')?.stage, 'scoped');
});

// E1 / S003 / t1 — the sc5 types.

const VERDICTS: Record<ReviewVerdict, true> = { 'pass': true, 'warn': true, 'block': true };
const TASK_RESULTS: Record<TaskResult, true> = { 'passed': true, 'failed': true, 'unrecorded': true };
const REASONS: Record<AttentionReason, true> = {
	'pending-decision': true, 'rejected': true, 'review-blocked': true,
	'validation-failed': true, 'validation-conflict': true,
};

/** Compiles only while the re-exported verdict is the review module's own type. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const SAME_VERDICT: Same<ReviewVerdict, SourceReviewVerdict> = true;

test('the gate types re-export the review verdict and list exactly the sketched members', () => {
	assert.equal(SAME_VERDICT, true);
	assert.deepEqual(Object.keys(VERDICTS), ['pass', 'warn', 'block']);
	assert.deepEqual(Object.keys(TASK_RESULTS), ['passed', 'failed', 'unrecorded']);
	assert.deepEqual(Object.keys(REASONS), ['pending-decision', 'rejected', 'review-blocked', 'validation-failed', 'validation-conflict']);

	const gate: ArtifactGate = {
		artifactId: 'LLD-h-s1',
		approval:   { state: 'pending', at: null },
		review: {
			verdict: 'block', reviewedAt: '2026-10-08T00:00:00.000Z', reviewedBy: 'daemon',
			counts: { high: 0, med: 1, low: 0 }, override: null, resolvedFindings: 0,
			effectiveVerdict: 'block', blocking: true,
		},
	};
	const item: ItemGates = {
		itemId: 'E1:S001', tasks: [{ taskItemId: 'E1:S001:T001', result: 'unrecorded', planned: true }],
		validation: { passed: 0, failed: 0, unrecorded: 1, unplanned: 0 },
		storyLevelResult: null, conflict: null, attentionReasons: ['review-blocked'], attentionRule: 'rule',
	};
	const result: GatePassResult = { artifacts: new Map([[gate.artifactId, gate]]), items: new Map([[item.itemId, item]]), notices: [] };
	assert.equal(result.artifacts.get('LLD-h-s1')?.review?.blocking, true);
	assert.equal(result.items.get('E1:S001')?.validation.unrecorded, 1);
});

// E1 / S004 / t1 — the sc6 types.

const CURRENCIES: Record<ReviewCurrency, true> = { 'current': true, 'stale': true, 'unknown': true };
const AMENDMENT_STATUSES: Record<EffectiveAmendment['status'], true> = { 'pending': true, 'approved': true, 'rejected': true };

test('the currency types list exactly the sketched members', () => {
	assert.deepEqual(Object.keys(CURRENCIES), ['current', 'stale', 'unknown']);
	assert.deepEqual(Object.keys(AMENDMENT_STATUSES), ['pending', 'approved', 'rejected']);

	const currency: ArtifactCurrency = { artifactId: 'LLD-h-s1', reviewCurrency: 'stale', basis: 'hld-rerun' };
	const unreviewed: ArtifactCurrency = { artifactId: 'BUILD-h-s1', reviewCurrency: null, basis: null };
	const amendment: EffectiveAmendment = { amendmentId: 'AMD-h-1', status: 'approved', type: 'storyBoundary.addStory', storyId: 's2', appliesToHld: true };
	const result: CurrencyPassResult = {
		artifacts:  new Map([[currency.artifactId, currency], [unreviewed.artifactId, unreviewed]]),
		amendments: new Map([['E1', [amendment]]]),
		notices:    [],
	};
	assert.equal(result.artifacts.get('LLD-h-s1')?.reviewCurrency, 'stale');
	assert.equal(result.artifacts.get('BUILD-h-s1')?.reviewCurrency, null);
	assert.equal(result.amendments.get('E1')?.[0]?.appliesToHld, true);
});
