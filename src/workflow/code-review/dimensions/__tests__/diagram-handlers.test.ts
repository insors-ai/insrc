/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929e2c6705f:S003 t7 — the additive sequence + component diagram adherence
 * handlers (Option B). Proves: both peer handlers register alongside 'er' WITHOUT
 * editing handlers/er.ts; hasDiagramReferences engages on a body carrying only a
 * sequence / component definition (body-keyed, no companion ref); judgeDiagram
 * dispatches such a body to its peer handler — a sound def → no findings, a
 * dangling-ref def → a HIGH breach folded through the dimension. Deterministic.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/code-review/dimensions/__tests__/diagram-handlers.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diagramHandlerFor } from '../diagram/registry.js';
import { judgeDiagram, hasDiagramReferences } from '../diagram/index.js';
import { erDiagramHandler } from '../diagram/handlers/er.js';
import { SEQUENCE_HANDLER_TYPE } from '../diagram/handlers/sequence.js';
import { COMPONENT_HANDLER_TYPE } from '../diagram/handlers/component.js';
import type { CodeReviewSubject, CodeReviewGrounding } from '../../types.js';
import type { LLMProvider } from '../../../../shared/types.js';

const grounding: CodeReviewGrounding = { symbols: [] };
const provider = {} as unknown as LLMProvider;

function subject(body: Record<string, unknown>, repoPath = '/repo'): CodeReviewSubject {
	return {
		repoPath, epicHash: 'e2c6705fd105d4ac', storyId: 's3', changedFiles: ['src/a.ts'],
		approvedLld: { meta: {}, body } as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: null,
		buildRecord: null,
	};
}

const validSeq = { participants: [{ id: 'A' }, { id: 'B' }], messages: [{ from: 'A', to: 'B', label: 'x' }] };
const validComp = { components: [{ id: 'api' }, { id: 'db' }], dependencies: [{ from: 'api', to: 'db' }] };

test('registry: the sequence + component peer handlers register alongside er (additive, er untouched)', () => {
	assert.equal(diagramHandlerFor('er'), erDiagramHandler, 'the ER handler is unchanged');
	assert.ok(diagramHandlerFor(SEQUENCE_HANDLER_TYPE) !== undefined, "the 'sequence' peer is registered");
	assert.ok(diagramHandlerFor(COMPONENT_HANDLER_TYPE) !== undefined, "the 'component' peer is registered");
	// The peers own no companion ref kind (reached body-keyed, not by ref routing).
	assert.equal(diagramHandlerFor(SEQUENCE_HANDLER_TYPE)!.appliesTo({ kind: 'diagram-mermaid', relPath: 'x', title: 'x' }), false);
	assert.equal(diagramHandlerFor(COMPONENT_HANDLER_TYPE)!.appliesTo({ kind: 'diagram-mermaid', relPath: 'x', title: 'x' }), false);
});

test('hasDiagramReferences: engages on a body carrying only a sequence / component definition (body-keyed)', () => {
	assert.equal(hasDiagramReferences(subject({ sequenceDefinition: validSeq })), true);
	assert.equal(hasDiagramReferences(subject({ componentDependencyDefinition: validComp })), true);
	assert.equal(hasDiagramReferences(subject({})), false);
});

test('judgeDiagram: a sound sequence / component definition → no findings', async () => {
	assert.deepEqual((await judgeDiagram(subject({ sequenceDefinition: validSeq }), grounding, provider)).findings, []);
	assert.deepEqual((await judgeDiagram(subject({ componentDependencyDefinition: validComp }), grounding, provider)).findings, []);
});

test('judgeDiagram: a dangling sequence definition folds a HIGH breach through the diagram dimension', async () => {
	const badSeq = { participants: [{ id: 'A' }], messages: [{ from: 'A', to: 'Z', label: 'x' }] };
	const res = await judgeDiagram(subject({ sequenceDefinition: badSeq }), grounding, provider);
	assert.equal(res.dimension, 'diagram');
	assert.ok(res.findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach'), 'a dangling endpoint is a HIGH breach');
});

test('judgeDiagram: a dangling component definition folds a HIGH breach through the diagram dimension', async () => {
	const badComp = { components: [{ id: 'api' }], dependencies: [{ from: 'api', to: 'ghost' }] };
	const res = await judgeDiagram(subject({ componentDependencyDefinition: badComp }), grounding, provider);
	assert.ok(res.findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach'));
});
