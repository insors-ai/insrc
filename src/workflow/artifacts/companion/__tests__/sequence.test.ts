/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * E20260929e2c6705f:S003 t1 — the SEQUENCE companion definition. sequenceDefinitionToIr
 * maps participants → 'call-frame' nodes, messages → edges (a 'recurse' message's edge
 * id carries the ':repeat' suffix), truncations → 'truncation' nodes citing their frame;
 * docType is 'call-sequence' and the IR is byte-identical for a byte-identical def. A
 * dangling message endpoint throws SequenceDefinitionError; validateSequenceDefinition
 * surfaces the same as a HIGH breach against the JSON element.
 *
 * Run: npx tsx --test src/workflow/artifacts/companion/__tests__/sequence.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	sequenceDefinitionToIr,
	validateSequenceDefinition,
	SequenceDefinitionError,
	SEQUENCE_DOC_TYPE,
	type SequenceDefinition,
} from '../sequence.js';

const seq: SequenceDefinition = {
	participants: [{ id: 'A', label: 'Client' }, { id: 'B', label: 'Server' }],
	messages: [
		{ from: 'A', to: 'B', label: 'request' },
		{ from: 'B', to: 'B', label: 'retry', kind: 'recurse' },
		{ from: 'B', to: 'A', label: 'response', kind: 'return' },
	],
	truncations: [{ atParticipant: 'B', note: 'depth truncated' }],
};

test('sequenceDefinitionToIr: participants→call-frame nodes, messages→edges, docType call-sequence', () => {
	const ir = sequenceDefinitionToIr(seq);
	assert.equal(ir.docType, SEQUENCE_DOC_TYPE);
	assert.equal(ir.docType, 'call-sequence');
	const frames = ir.derived.nodes.filter(n => n.kind === 'call-frame');
	assert.equal(frames.length, 2);
	assert.deepEqual(frames.map(n => n.id), ['A', 'B']);
	assert.equal(frames[0]!.label, 'Client');
	assert.equal(ir.derived.edges.length, 3);
	assert.deepEqual(ir.derived.edges.map(e => [e.from, e.to]), [['A', 'B'], ['B', 'B'], ['B', 'A']]);
});

test('sequenceDefinitionToIr: a recurse message edge id carries the :repeat suffix', () => {
	const ir = sequenceDefinitionToIr(seq);
	const recurse = ir.derived.edges[1]!;
	assert.ok(recurse.id.endsWith(':repeat'), `expected the recurse edge id to end ':repeat', saw ${recurse.id}`);
	assert.ok(!ir.derived.edges[0]!.id.endsWith(':repeat'), 'a non-recurse edge id has no :repeat suffix');
});

test('sequenceDefinitionToIr: a truncation → a truncation node citing its frame', () => {
	const ir = sequenceDefinitionToIr(seq);
	const trunc = ir.derived.nodes.find(n => n.kind === 'truncation');
	assert.ok(trunc !== undefined, 'a truncation node is present');
	assert.equal(trunc!.label, 'depth truncated');
	assert.equal(trunc!.citation?.entityId, 'B');
});

test('sequenceDefinitionToIr: byte-identical IR for a byte-identical def (deterministic)', () => {
	assert.equal(JSON.stringify(sequenceDefinitionToIr(seq)), JSON.stringify(sequenceDefinitionToIr(seq)));
});

test('sequenceDefinitionToIr: a dangling message endpoint throws SequenceDefinitionError', () => {
	const bad: SequenceDefinition = { participants: [{ id: 'A' }], messages: [{ from: 'A', to: 'Z', label: 'x' }] };
	assert.throws(() => sequenceDefinitionToIr(bad), (e: unknown) => {
		assert.ok(e instanceof SequenceDefinitionError);
		return true;
	});
});

test('validateSequenceDefinition: a sound def → no findings; a dangling endpoint → HIGH breach', () => {
	assert.deepEqual(validateSequenceDefinition(seq), []);
	const bad = { participants: [{ id: 'A' }], messages: [{ from: 'A', to: 'Z', label: 'x' }] };
	const findings = validateSequenceDefinition(bad);
	assert.ok(findings.some(f => f.severity === 'HIGH' && f.confidence === 'breach'), 'a dangling endpoint is a HIGH breach');
	assert.ok(findings.every(f => f.dimension === 'diagram'), 'findings are on the diagram dimension');
});

test('validateSequenceDefinition: a non-array participants/messages → HIGH breach', () => {
	assert.ok(validateSequenceDefinition({ participants: 'x', messages: [] }).some(f => f.severity === 'HIGH'));
	assert.ok(validateSequenceDefinition({ participants: [], messages: 'x' }).some(f => f.severity === 'HIGH'));
});
