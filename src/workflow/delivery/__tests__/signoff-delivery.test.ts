/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s7: the delivery evidence of a Story lists its BUILD record with its signoff entry, so a BUILD that is in signoff or
 * approved and held is visible there; the entry sits beside approval and review and changes neither.
 *
 * Run: npx tsx --test src/workflow/delivery/__tests__/signoff-delivery.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveCurrency } from '../currency.js';
import { deriveGates } from '../gate.js';
import { buildWorkItemGraph } from '../graph.js';
import { assembleSnapshot } from '../snapshot.js';
import { deriveStages } from '../stage.js';
import type { ArtifactRecord, DeliveryMarkdownPort, DeliverySnapshot } from '../types.js';
import { CREATED, buildRecord, crRecord, defRecord, hldRecord, lldRecord, planRecord, recordSet } from './fixtures.js';

const EPIC = 'aaaaaaaaaaaaaaaa';
const PORT: DeliveryMarkdownPort = { markdownOf: () => null };

const lifecycle = (status: string, signoffs: unknown[] = []): { lifecycle: unknown } => ({
	lifecycle: { status, revision: { number: 1 }, approval: { revision: 1, at: CREATED }, signoffs },
});
const so = (ref: string, state: 'open' | 'completed'): unknown => ({ revision: 1, request: { entityId: ref, type: 'signoff-request', relation: 'tracked-by' }, state, actors: [], at: CREATED });

function snapshotOf(records: readonly ArtifactRecord[]): DeliverySnapshot {
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	return assembleSnapshot(set, graph, deriveStages(graph, set), deriveGates(graph, set), deriveCurrency(graph, set), PORT);
}

const baseRecords = (build: ArtifactRecord): ArtifactRecord[] => [
	defRecord(EPIC, ['s1'], { approvedAt: CREATED }), hldRecord(EPIC, { approvedAt: CREATED }),
	lldRecord(EPIC, 's1', { approvedAt: CREATED }), planRecord(EPIC, 's1', ['t1'], { approvedAt: CREATED }),
	build, crRecord(EPIC, 's1', 'pass'),
];

test('the delivery evidence of a Story lists its BUILD record with its signoff entry, so a BUILD that is in signoff or approved and held is visible there', () => {
	const held = snapshotOf(baseRecords(buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], lifecycle('in-signoff', [so('acme/demo#9', 'open')]))));
	const story = held.items.find(i => i.kind === 'story');
	assert.ok(story, 'the Story item');
	const buildEntry = story.evidence.find(e => e.kind === 'BUILD');
	assert.ok(buildEntry, 'the Story lists its BUILD record');
	assert.deepEqual(buildEntry.signoff, { state: 'open', request: { ref: 'acme/demo#9' }, revision: 1 });
	assert.equal(buildEntry.approval.state, 'approved', 'approval is shown as before');
	assert.equal(buildEntry.review, null, 'the signoff is never counted as a review');

	// a record with no signoff carries no signoff entry, and its approval and review read the same as the held one's
	const plain = snapshotOf(baseRecords(buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], lifecycle('approved'))));
	const plainBuild = plain.items.find(i => i.kind === 'story')?.evidence.find(e => e.kind === 'BUILD');
	assert.ok(plainBuild);
	assert.ok(!('signoff' in plainBuild), 'no signoff entry when there is none');
	assert.deepEqual({ approval: plainBuild.approval, review: plainBuild.review }, { approval: buildEntry.approval, review: buildEntry.review });

	// a signed-off BUILD reads completed
	const done = snapshotOf(baseRecords(buildRecord(EPIC, 's1', [{ id: 't1', passed: true }], lifecycle('signed-off', [so('acme/demo#9', 'completed')]))));
	assert.equal(done.items.find(i => i.kind === 'story')?.evidence.find(e => e.kind === 'BUILD')?.signoff?.state, 'completed');
});
