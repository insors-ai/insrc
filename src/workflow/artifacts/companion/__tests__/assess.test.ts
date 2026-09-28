/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc4 (S003) unit tests — assessDiagramNeed content-gate (ac1/k3). Empty for a
 * no-visual document; a type:'er' need when warranted; fail-safe to no-diagram on a
 * provider/parse error (never throws). Exactly ONE serial provider path (no
 * Promise.all).
 *
 * Run: npx tsx --test --test-force-exit src/workflow/artifacts/companion/__tests__/assess.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assessDiagramNeed, type DiagramAssessmentDoc } from '../assess.js';
import type { LLMProvider } from '../../../../shared/types.js';

const doc: DiagramAssessmentDoc = { kind: 'LLD', body: { dataModelChanges: [] } };

/** A provider whose completeStructured returns a canned object, counting calls. */
function cannedProvider(value: unknown): { provider: LLMProvider; calls: () => number } {
	let calls = 0;
	const provider = {
		capabilities: { structuredOutput: true },
		// eslint-disable-next-line @typescript-eslint/require-await
		completeStructured: async () => { calls += 1; return value; },
	} as unknown as LLMProvider;
	return { provider, calls: () => calls };
}

/** A provider whose completeStructured always throws. */
function throwingProvider(): LLMProvider {
	return {
		capabilities: { structuredOutput: true },
		// eslint-disable-next-line @typescript-eslint/require-await
		completeStructured: async () => { throw new Error('provider down'); },
	} as unknown as LLMProvider;
}

test('assessDiagramNeed: empty when the model says no visual is warranted (one serial call)', async () => {
	const { provider, calls } = cannedProvider({ warranted: false, diagrams: [] });
	const out = await assessDiagramNeed(doc, provider);
	assert.equal(out.warranted, false);
	assert.deepEqual(out.diagrams, []);
	assert.equal(calls(), 1);
});

test('assessDiagramNeed: a type:"er" need when warranted', async () => {
	const { provider } = cannedProvider({ warranted: true, diagrams: [{ type: 'er', rationale: 'multiple related records', ofSectionId: '4-data-model-changes' }] });
	const out = await assessDiagramNeed(doc, provider);
	assert.equal(out.warranted, true);
	assert.equal(out.diagrams.length, 1);
	assert.equal(out.diagrams[0]!.type, 'er');
	assert.equal(out.diagrams[0]!.ofSectionId, '4-data-model-changes');
});

test('assessDiagramNeed: warranted:true but no diagrams → treated as no-need', async () => {
	const { provider } = cannedProvider({ warranted: true, diagrams: [] });
	const out = await assessDiagramNeed(doc, provider);
	assert.equal(out.warranted, false);
	assert.deepEqual(out.diagrams, []);
});

test('assessDiagramNeed: fail-safe to no-diagram on a provider error (never throws)', async () => {
	const out = await assessDiagramNeed(doc, throwingProvider());
	assert.deepEqual(out, { warranted: false, diagrams: [] });
});

test('assessDiagramNeed: fail-safe on an unparseable/invalid provider output (schema violation)', async () => {
	const { provider } = cannedProvider({ nonsense: true });   // fails schema validation → retries exhaust → fail-safe
	const out = await assessDiagramNeed(doc, provider);
	assert.deepEqual(out, { warranted: false, diagrams: [] });
});
