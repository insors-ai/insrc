/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s7: signoff is shown apart from review and approval on the display surfaces (the signoff view, the delivery gates and
 * evidence, and the chain report's existing lines), and the review and approval output is unchanged.
 *
 * Run: npx tsx --test src/workflow/__tests__/signoff-view.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { buildChainReport, formatChainReport } from '../chain.js';
import { deriveCurrency } from '../delivery/currency.js';
import { deriveGates } from '../delivery/gate.js';
import { buildWorkItemGraph } from '../delivery/graph.js';
import { assembleSnapshot } from '../delivery/snapshot.js';
import { deriveStages } from '../delivery/stage.js';
import { defRecord, hldRecord, lldRecord, recordSet } from '../delivery/__tests__/fixtures.js';
import { defineArtifactPaths, hldArtifactPaths, lldArtifactPaths, writeAtomic } from '../storage.js';
import { signoffViewOf } from '../team/signoff.js';

const HASH = 'a3f4b8c9d1e2f3a4';
const CREATED = '2026-07-17T07:42:28.275Z';

const so = (ref: string, state: 'open' | 'completed'): unknown => ({ revision: 1, request: { entityId: ref, type: 'signoff-request', relation: 'tracked-by' }, state, actors: [], at: CREATED });
const lifecycle = (status: string, signoffs: unknown[] = [], review = false): Record<string, unknown> => ({
	lifecycle: {
		status, revision: { number: 1 }, approval: { revision: 1, at: CREATED }, signoffs,
		...(review ? { review: { revision: 1, party: 'daemon', verdict: 'pass', counts: { high: 0, med: 0, low: 0 }, at: CREATED } } : {}),
	},
});

test('signoffViewOf, ArtifactGate, DeliveryEvidenceEntry and the existing chain report lines show signoff separately while approval and review output is unchanged', () => {
	// the signoff view: apart from the review, and never counted as one
	const withBoth = lifecycle('in-signoff', [so('acme/demo#9', 'open')], true);
	assert.deepEqual(signoffViewOf(withBoth), { state: 'open', request: { ref: 'acme/demo#9' }, revision: 1 });

	// the delivery gate of a record: approval and review are what they were, and the signoff sits beside them
	const records = [
		defRecord(HASH, ['s1'], lifecycle('approved')), hldRecord(HASH, lifecycle('approved')),
		lldRecord(HASH, 's1', lifecycle('in-signoff', [so('acme/demo#9', 'open')], true)),
	];
	const set = recordSet(records);
	const graph = buildWorkItemGraph(set);
	const gates = deriveGates(graph, set);
	const lldGate = gates.artifacts.get(`LLD-${HASH}-s1`);
	assert.deepEqual(lldGate?.signoff, { state: 'open', request: { ref: 'acme/demo#9' }, revision: 1 });
	assert.equal(lldGate?.approval.state, 'approved');
	assert.equal(lldGate?.review?.verdict, 'pass', 'the lifecycle review is read as before');
	assert.ok(!('signoff' in (gates.artifacts.get(`DEF-${HASH}`) ?? {})), 'a record with no signoff carries none');
	const snapshot = assembleSnapshot(set, graph, deriveStages(graph, set), gates, deriveCurrency(graph, set), { markdownOf: () => null });
	assert.deepEqual(snapshot.items.find(i => i.kind === 'story')?.evidence.find(e => e.kind === 'LLD')?.signoff?.state, 'open');

	// the chain report: the existing Define, HLD and LLD lines gain their signoff state and nothing else changes
	const repo = mkdtempSync(join(tmpdir(), 'insrc-signoff-chain-'));
	try {
		const write = (path: string, meta: Record<string, unknown>, body: unknown): void => {
			mkdirSync(dirname(path), { recursive: true });
			writeAtomic(path, JSON.stringify({ meta: { schemaVersion: 1, epicHash: HASH, epicSlug: 'test-epic', createdAt: CREATED, epicCreatedAt: CREATED, ...meta }, body, citations: [] }, null, 2));
		};
		const def = defineArtifactPaths(repo, HASH, CREATED, 'epic');
		write(def.json, { workflow: 'define', runId: 'd1', ...lifecycle('signed-off', [so('acme/demo#1', 'completed')]) }, { flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [], stories: [{ id: 's1', title: 'Story s1', userValue: 'v', acceptanceCriteria: [] }], openQuestions: [] });
		const hld = hldArtifactPaths(repo, HASH, CREATED, 'epic');
		write(hld.json, { workflow: 'design.epic', runId: 'h1', ...lifecycle('in-signoff', [so('acme/demo#2', 'open')]) }, { frameworkSummary: 'x', architectureShape: 'x', sharedContracts: [], storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 'x' }], nonFunctional: {}, rolloutOverview: { phases: [], orderingRationale: '', riskyBits: [] }, alternativesConsidered: [], chosenAlternative: '', openQuestions: [] });
		const lld = lldArtifactPaths(repo, HASH, 's1', CREATED, 'epic');
		write(lld.json, { workflow: 'design.story', runId: 'l1', storyId: 's1', hldBaseRunId: 'h1', hldEffectiveHash: 'x', hldAmendmentsApplied: [], ...lifecycle('in-signoff', [so('acme/demo#3', 'open')]) }, { hldContextSlice: {}, contractDetails: { surfaceLevel: 'internal', api: [] }, dataModelChanges: [], interactionWithShared: [], errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] }, testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'x' }, alternativesConsidered: [], chosenAlternative: 'a1', openQuestions: [] });

		const report = buildChainReport(repo, HASH);
		assert.equal(report.define.signoff, 'completed');
		assert.equal(report.hld.signoff, 'open');
		assert.equal(report.stories[0]?.signoff, 'open');
		assert.equal(report.define.approved, true, 'approval reads as before');
		const text = formatChainReport(report);
		assert.match(text, /## Define\n.*\n.*approved: yes\n  - signoff: completed/);
		assert.match(text, /## HLD\n.*\n.*approved: yes\n  - signoff: open/);
		assert.match(text, /s1: Story s1 — .*; signoff open/);

		// a repository with no signoff prints exactly what it printed before: no signoff line anywhere
		const plain = mkdtempSync(join(tmpdir(), 'insrc-signoff-chain-plain-'));
		try {
			const d = defineArtifactPaths(plain, HASH, CREATED, 'epic');
			write(d.json, { workflow: 'define', runId: 'd1', ...lifecycle('approved') }, { flavor: 'enhancement', problem: 'x', nonGoals: [], assumptions: [], constraints: [], stories: [], openQuestions: [] });
			const r = buildChainReport(plain, HASH);
			assert.ok(!('signoff' in r.define));
			assert.doesNotMatch(formatChainReport(r), /signoff/);
		} finally { rmSync(plain, { recursive: true, force: true }); }
	} finally { rmSync(repo, { recursive: true, force: true }); }
});
