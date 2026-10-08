/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S003 — the gate pass over fabricated records. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveGates } from '../gate.js';
import { buildWorkItemGraph } from '../graph.js';
import type { ArtifactGate, ArtifactRecord, GatePassResult, WorkItemGraph } from '../types.js';
import {
	CREATED,
	buildRecord,
	crRecord,
	defRecord,
	lldRecord,
	recordSet,
} from './fixtures.js';

const EPIC = 'aaaaaaaaaaaaaaaa';
const APPROVED = { approvedAt: CREATED };
const REVIEWED = '2026-10-08T10:00:00.000Z';

function run(records: readonly ArtifactRecord[]): { graph: WorkItemGraph; result: GatePassResult } {
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	return { graph, result: deriveGates(graph, set) };
}

function gateOf(result: GatePassResult, artifactId: string): ArtifactGate {
	const gate = result.artifacts.get(artifactId);
	assert.ok(gate, `an artifact gate for ${artifactId}`);
	return gate;
}

/** A meta.review stamp with the given verdict and findings. */
function review(verdict: 'pass' | 'warn' | 'block', findings: readonly unknown[], extra: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
	return {
		artifact: 'LLD', stage: 'design.story', verdict, findings,
		counts: { high: 0, med: findings.length, low: 0 }, reviewedAt: REVIEWED, model: 'cli-claude:opus', ...extra,
	};
}

const MED = (claimId: string): Record<string, unknown> => ({ claimId, severity: 'MED', claim: 'c', evidence: 'e' });

test('approved, rejected and unstamped artifacts read approved, rejected and pending', () => {
	const { result } = run([
		defRecord(EPIC, ['s1', 's2', 's3']),
		lldRecord(EPIC, 's1', APPROVED),
		lldRecord(EPIC, 's2', { rejectedAt: '2026-10-07T12:00:00.000Z' }),
		lldRecord(EPIC, 's3'),
	]);
	assert.deepEqual(gateOf(result, `LLD-${EPIC}-s1`).approval, { state: 'approved', at: CREATED });
	assert.deepEqual(gateOf(result, `LLD-${EPIC}-s2`).approval, { state: 'rejected', at: '2026-10-07T12:00:00.000Z' });
	assert.deepEqual(gateOf(result, `LLD-${EPIC}-s3`).approval, { state: 'pending', at: null });
	assert.equal(gateOf(result, `LLD-${EPIC}-s3`).review, null, 'no meta.review, no review');
	assert.equal(result.artifacts.size, 4, 'every record gets a gate');
});

test('an approved historical block and an overridden block do not block and still show the verdict and the override', () => {
	const override = { reason: 'accepted by the stakeholder', at: '2026-10-08T11:00:00.000Z' };
	const { result } = run([
		defRecord(EPIC, ['s1', 's2', 's3']),
		lldRecord(EPIC, 's1', { ...APPROVED, review: review('block', [MED('q1')]) }),
		lldRecord(EPIC, 's2', { review: review('block', [MED('q1')]), reviewOverride: override }),
		lldRecord(EPIC, 's3', { review: review('block', [MED('q1')]) }),
	]);

	const approved = gateOf(result, `LLD-${EPIC}-s1`).review;
	assert.equal(approved?.verdict, 'block');
	assert.equal(approved?.effectiveVerdict, 'block');
	assert.equal(approved?.blocking, false);

	const overridden = gateOf(result, `LLD-${EPIC}-s2`).review;
	assert.equal(overridden?.verdict, 'block');
	assert.deepEqual(overridden?.override, override);
	assert.equal(overridden?.blocking, false);

	const open = gateOf(result, `LLD-${EPIC}-s3`).review;
	assert.equal(open?.blocking, true, 'an unapproved block with no override blocks');
	assert.equal(open?.override, null);
	assert.deepEqual(open?.counts, { high: 0, med: 1, low: 0 });
	assert.equal(open?.reviewedAt, REVIEWED);
});

test('a block whose blocking findings are all resolved has effective verdict pass, and a warn with an unresolved MED is effectively a block', () => {
	const resolution = { findingId: 'q1', status: 'resolved', resolvedAt: REVIEWED };
	const { result } = run([
		defRecord(EPIC, ['s1', 's2']),
		lldRecord(EPIC, 's1', { review: review('block', [MED('q1'), { claimId: 'q2', severity: 'LOW' }]), reviewResolutions: { q1: resolution } }),
		lldRecord(EPIC, 's2', { review: review('warn', [MED('q1')]) }),
	]);

	const resolved = gateOf(result, `LLD-${EPIC}-s1`).review;
	assert.equal(resolved?.verdict, 'block', 'the recorded verdict is reported unchanged');
	assert.equal(resolved?.effectiveVerdict, 'pass');
	assert.equal(resolved?.resolvedFindings, 1, 'only HIGH/MED findings count');
	assert.equal(resolved?.blocking, false);

	const warn = gateOf(result, `LLD-${EPIC}-s2`).review;
	assert.equal(warn?.verdict, 'warn');
	assert.equal(warn?.effectiveVerdict, 'block');
	assert.equal(warn?.blocking, true);
});

test('a code review blocks only while its story has no approved build', () => {
	const { result } = run([
		defRecord(EPIC, ['s1', 's2', 's3']),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], APPROVED),
		crRecord(EPIC, 's1', 'block'),
		buildRecord(EPIC, 's2', [{ id: 't1', passed: true }]),
		crRecord(EPIC, 's2', 'block'),
		crRecord(EPIC, 's3', 'block'),
	]);
	assert.equal(gateOf(result, `CR-${EPIC}-s1`).review?.blocking, false, 'the build it guards is approved');
	assert.equal(gateOf(result, `CR-${EPIC}-s2`).review?.blocking, true, 'the build is unapproved');
	assert.equal(gateOf(result, `CR-${EPIC}-s3`).review?.blocking, true, 'there is no build');
	assert.deepEqual(gateOf(result, `CR-${EPIC}-s3`).review?.counts, { high: 0, med: 0, low: 0 }, 'a body without counts reads zeros');
	assert.equal(gateOf(result, `BUILD-${EPIC}-s1`).review, null, 'a BUILD has no review of its own');
});

test("the reviewer party is read through reviewerPartyOf, and a code review's own approval stamp is reported but does not lift its block", () => {
	const { result } = run([
		defRecord(EPIC, ['s1', 's2']),
		buildRecord(EPIC, 's1', [{ id: 't1', passed: true }]),
		crRecord(EPIC, 's1', 'block', { model: 'client', approvedAt: CREATED }),
		lldRecord(EPIC, 's2', { review: review('pass', [], { reviewedBy: 'daemon', model: 'client' }) }),
		crRecord(EPIC, 's2', 'pass'),
	]);

	const cr = gateOf(result, `CR-${EPIC}-s1`);
	assert.deepEqual(cr.approval, { state: 'approved', at: CREATED }, 'the stamp is reported');
	assert.equal(cr.review?.blocking, true, 'but the guarded build is unapproved');
	assert.equal(cr.review?.reviewedBy, 'controller', "model 'client' without reviewedBy reads as the controller");

	assert.equal(gateOf(result, `LLD-${EPIC}-s2`).review?.reviewedBy, 'daemon', 'reviewedBy wins over the model label');
	assert.equal(gateOf(result, `CR-${EPIC}-s2`).review?.reviewedBy, null, 'no reviewedBy and no model is unknown');
});

test('a malformed review, finding, code-review body, task entry or unparseable task id never throws and reports nothing invented', () => {
	const { result } = run([
		defRecord(EPIC, ['s1', 's2', 's3', 's4', 's5']),
		lldRecord(EPIC, 's1', { review: 'not an object' }),
		lldRecord(EPIC, 's2', { review: review('maybe' as 'pass', []) }),
		lldRecord(EPIC, 's3', { review: { ...review('block', []), findings: [null, 'x', 7, MED('q1')] }, reviewResolutions: ['not', 'a', 'map'] }),
		lldRecord(EPIC, 's4', { review: { ...review('warn', []), findings: 'none', counts: { high: 'one', med: null } } }),
		crRecord(EPIC, 's5', 'nope' as 'pass'),
	]);

	assert.equal(gateOf(result, `LLD-${EPIC}-s1`).review, null, 'a non-object review is no review');
	assert.equal(gateOf(result, `LLD-${EPIC}-s2`).review, null, 'an unrecognised verdict is no review');

	const dropped = gateOf(result, `LLD-${EPIC}-s3`).review;
	assert.equal(dropped?.effectiveVerdict, 'block', 'malformed findings are dropped; the valid MED still blocks');
	assert.equal(dropped?.resolvedFindings, 0);

	const noFindings = gateOf(result, `LLD-${EPIC}-s4`).review;
	assert.equal(noFindings?.effectiveVerdict, 'warn', 'no findings array keeps the recorded verdict');
	assert.deepEqual(noFindings?.counts, { high: 0, med: 0, low: 0 });

	assert.equal(gateOf(result, `CR-${EPIC}-s5`).review, null, 'a code review with no recognised verdict is no review');
});
