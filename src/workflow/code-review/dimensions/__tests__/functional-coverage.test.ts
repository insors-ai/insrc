/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for sc2 (S001, Task t4): the functional-coverage dimension judge.
 * Mirrors the coverage.test.ts fake-provider pattern.
 *
 * Run: npx tsx --test src/workflow/code-review/dimensions/__tests__/functional-coverage.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	judgeFunctionalCoverage,
	functionalRequirementsOf,
	hasFunctionalDefinition,
} from '../functional-coverage.js';
import type { CodeReviewSubject, CodeReviewGrounding, ChangedSymbolSummary } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';
import { mintFrId } from '../../../id.js';

const EPIC = '185807ba9a6b35d3';
const ISO  = '2026-07-17T07:42:28.275Z';
const FR1 = mintFrId(EPIC, ISO, 1);
const FR2 = mintFrId(EPIC, ISO, 2);

const subject = (
	changedFiles: readonly string[] = ['src/a.ts'],
	requirements: readonly { id: string; statement: string; scope: 'doc' | 'item' }[] = [
		{ id: FR1, statement: 'outcome one', scope: 'doc' },
	],
): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: 'e', storyId: 's1', changedFiles,
	approvedLld:  { body: { functionalDefinition: { requirements } } } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: null,
	buildRecord: { changedFiles } as CodeReviewSubject['buildRecord'],
});

const grounding = (symbols: readonly Partial<ChangedSymbolSummary>[] = [{ file: 'src/a.ts', name: 'alpha' }]): CodeReviewGrounding => ({
	symbols: symbols.map((s, i) => ({
		entityId: `e${i}`, file: 'src/a.ts', kind: 'function', name: `fn${i}`,
		signature: `fn${i}(): void`, callers: [], callees: [], testsReaching: [],
		...s,
	})),
});

function fakeProvider(scripted: unknown): { provider: LLMProvider; calls: () => number } {
	let n = 0;
	const provider = { completeStructured: async () => { n++; return scripted; } } as unknown as LLMProvider;
	return { provider, calls: () => n };
}

test('functionalRequirementsOf / hasFunctionalDefinition read the approved LLD record', () => {
	assert.equal(functionalRequirementsOf(subject()).length, 1);
	assert.equal(hasFunctionalDefinition(subject()), true);
	const none = subject(['src/a.ts'], []);
	assert.equal(functionalRequirementsOf(none).length, 0);
	assert.equal(hasFunctionalDefinition(none), false);
});

test('judgeFunctionalCoverage: an unrealized FR is a HIGH finding bound to its FR id', async () => {
	const { provider, calls } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:1', message: 'FR not realized', expectationRef: FR1, confidence: 'breach' },
	] });
	const res = await judgeFunctionalCoverage(subject(), grounding(), provider);
	assert.equal(calls(), 1, 'exactly one serial provider call');
	assert.equal(res.dimension, 'functional-coverage');
	assert.equal(res.findings.length, 1);
	assert.equal(res.findings[0]!.severity, 'HIGH');
	assert.equal(res.findings[0]!.expectationRef, FR1);
});

test('judgeFunctionalCoverage: a finding outside the changed set is dropped', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/OTHER.ts:1', message: 'x', expectationRef: FR1 },
	] });
	const res = await judgeFunctionalCoverage(subject(['src/a.ts']), grounding(), provider);
	assert.equal(res.findings.length, 0);
});

test('judgeFunctionalCoverage: a finding referencing an unknown FR id is dropped', async () => {
	const { provider } = fakeProvider({ findings: [
		{ severity: 'HIGH', location: 'src/a.ts:1', message: 'x', expectationRef: FR2 }, // FR2 not declared
	] });
	const res = await judgeFunctionalCoverage(subject(['src/a.ts'], [{ id: FR1, statement: 'one', scope: 'doc' }]), grounding(), provider);
	assert.equal(res.findings.length, 0);
});

test('judgeFunctionalCoverage: every FR realized => empty findings (pass)', async () => {
	const { provider } = fakeProvider({ findings: [] });
	const res = await judgeFunctionalCoverage(subject(), grounding(), provider);
	assert.equal(res.findings.length, 0);
	assert.equal(res.dimension, 'functional-coverage');
});
