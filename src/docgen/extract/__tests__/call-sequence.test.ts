/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the docgen call-sequence extractor (Story s3).
 *
 * Run: npx tsx --test src/docgen/extract/__tests__/call-sequence.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildCallSequenceIR,
	makeExtract,
	CALL_SEQUENCE_DOCTYPE,
	type CallFrameRef,
	type CallWalk,
	type CallGraphReader,
} from '../call-sequence.js';
import { documentIRToMermaid } from '../../render/shell.js';
import { isOk } from '../../outcome.js';
import type { DocumentIR } from '../../types.js';

const f = (id: string, name: string, line: number): CallFrameRef =>
	({ entityId: id, name, file: `/repo/src/${id}.ts`, startLine: line });

/** A fake CallGraphReader driven by a canned adjacency map + entry point. */
function reader(o: {
	revision?: string | undefined;
	entry?: CallFrameRef | undefined;
	adj?: Record<string, readonly CallFrameRef[]>;
}): CallGraphReader {
	return {
		revision: async () => o.revision,
		resolveEntryPoint: async () => o.entry,
		calleesOf: async (id: string) => o.adj?.[id] ?? [],
	};
}

// ── pure core: buildCallSequenceIR ────────────────────────────────────────────

test('buildCallSequenceIR: frames -> call-frame nodes + ordered calls edges with citations (ac1)', () => {
	const a = f('a', 'main', 1), b = f('b', 'helper', 5), c = f('c', 'leaf', 9);
	const walk: CallWalk = {
		entry: a, frames: [a, b, c],
		steps: [{ from: 'a', to: 'b', repeat: false }, { from: 'b', to: 'c', repeat: false }],
		truncatedFrameIds: [], depthUsed: 12,
	};
	const ir = buildCallSequenceIR(walk, 'rev1', 'scope');
	assert.equal(ir.docType, CALL_SEQUENCE_DOCTYPE);
	assert.deepEqual(ir.derived.nodes.map(n => n.id), ['a', 'b', 'c']);
	assert.ok(ir.derived.nodes.every(n => n.kind === 'call-frame'));
	assert.equal(ir.derived.nodes[0]!.citation?.entityId, 'a');
	assert.match(ir.derived.nodes[0]!.label, /main \(a\.ts:1\)/);
	assert.deepEqual(ir.derived.edges.map(e => `${e.from}->${e.to}`), ['a->b', 'b->c']);
	assert.ok(ir.derived.edges.every(e => e.kind === 'calls'));
	assert.deepEqual(ir.narrated.sections, []);
	assert.equal(ir.generatedAtRevision, 'rev1');
});

test('buildCallSequenceIR: a repeat step is a marked calls edge, not a re-expanded node (ac2)', () => {
	const a = f('a', 'a', 1), b = f('b', 'b', 2);
	const walk: CallWalk = {
		entry: a, frames: [a, b],
		steps: [{ from: 'a', to: 'b', repeat: false }, { from: 'b', to: 'a', repeat: true }],
		truncatedFrameIds: [], depthUsed: 12,
	};
	const ir = buildCallSequenceIR(walk, 'r', 's');
	assert.deepEqual(ir.derived.nodes.map(n => n.id), ['a', 'b']); // b->a does NOT add a node
	assert.equal(ir.derived.edges.length, 2);
	assert.ok(!ir.derived.edges[0]!.id.endsWith(':repeat'));
	assert.ok(ir.derived.edges[1]!.id.endsWith(':repeat')); // the cycle step is marked
});

test('buildCallSequenceIR: a truncated frame yields a derived truncation marker stating depthUsed (ac3)', () => {
	const a = f('a', 'a', 1), b = f('b', 'b', 2);
	const walk: CallWalk = {
		entry: a, frames: [a, b],
		steps: [{ from: 'a', to: 'b', repeat: false }],
		truncatedFrameIds: ['b'], depthUsed: 3,
	};
	const ir = buildCallSequenceIR(walk, 'r', 's');
	const trunc = ir.derived.nodes.find(n => n.kind === 'truncation');
	assert.ok(trunc);
	assert.match(trunc!.label, /truncated at depth 3/);
	assert.equal(trunc!.citation?.entityId, 'b'); // attaches to the truncated frame
});

test('repeated calls to the same callee preserve BOTH ordered steps (no dedupe)', () => {
	const a = f('a', 'a', 1), b = f('b', 'b', 2);
	const walk: CallWalk = {
		entry: a, frames: [a, b],
		steps: [{ from: 'a', to: 'b', repeat: false }, { from: 'a', to: 'b', repeat: false }],
		truncatedFrameIds: [], depthUsed: 12,
	};
	const ir = buildCallSequenceIR(walk, 'r', 's');
	assert.equal(ir.derived.edges.length, 2); // NOT collapsed — a sequence keeps multiplicity
});

test('same walk -> deep-equal IR (determinism)', () => {
	const a = f('a', 'a', 1), b = f('b', 'b', 2);
	const walk: CallWalk = {
		entry: a, frames: [a, b], steps: [{ from: 'a', to: 'b', repeat: false }],
		truncatedFrameIds: [], depthUsed: 12,
	};
	assert.deepEqual(buildCallSequenceIR(walk, 'r', 's'), buildCallSequenceIR(walk, 'r', 's'));
});

// ── makeExtract: bounded DFS + outcome routing ────────────────────────────────

test('makeExtract -> not-found when the entry-point symbol is unindexed (ac4)', async () => {
	const out = await makeExtract(reader({ revision: 'r', entry: undefined }))({ repo: '/repo', symbol: 'ghost' });
	assert.equal(out.status, 'not-found');
	if (out.status === 'not-found') assert.equal(out.symbol, 'ghost');
});

test('makeExtract -> source-not-ready / empty-scope', async () => {
	assert.equal((await makeExtract(reader({ revision: undefined }))({ repo: '/r', symbol: 'x' })).status, 'source-not-ready');
	assert.equal((await makeExtract(reader({ revision: 'r' }))({ repo: '/r' })).status, 'empty-scope'); // no symbol
	assert.equal((await makeExtract(reader({ revision: 'r' }))({ symbol: 'x' })).status, 'empty-scope'); // no repo
});

test('makeExtract over a CYCLIC reader terminates and marks the repeat step (ac2)', async () => {
	const a = f('a', 'a', 1), b = f('b', 'b', 2);
	// a -> b -> a (cycle). Without the visited set this would recurse forever.
	const out = await makeExtract(reader({ revision: 'r', entry: a, adj: { a: [b], b: [a] } }))(
		{ repo: '/repo', symbol: 'a' });
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.deepEqual(out.value.derived.nodes.filter(n => n.kind === 'call-frame').map(n => n.id), ['a', 'b']);
		assert.ok(out.value.derived.edges.some(e => e.id.endsWith(':repeat'))); // the b->a cycle step
	}
});

test('makeExtract over a deeper-than-maxDepth reader stops at the cap + records truncation (ac3)', async () => {
	const a = f('a', 'a', 1), b = f('b', 'b', 2), c = f('c', 'c', 3);
	// a -> b -> c, but maxDepth 1 stops expanding at b.
	const out = await makeExtract(reader({ revision: 'r', entry: a, adj: { a: [b], b: [c], c: [] } }))(
		{ repo: '/repo', symbol: 'a', maxDepth: 1 });
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.deepEqual(out.value.derived.nodes.filter(n => n.kind === 'call-frame').map(n => n.id), ['a', 'b']); // c never reached
		const trunc = out.value.derived.nodes.find(n => n.kind === 'truncation');
		assert.ok(trunc);
		assert.match(trunc!.label, /depth 1/);
		assert.equal(trunc!.citation?.entityId, 'b'); // b's callees were cut
	}
});

test('makeExtract on a leaf entry point -> ok single-participant doc, no fabricated frames (k11)', async () => {
	const a = f('a', 'a', 1);
	const out = await makeExtract(reader({ revision: 'r', entry: a, adj: { a: [] } }))({ repo: '/repo', symbol: 'a' });
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.deepEqual(out.value.derived.nodes.map(n => n.id), ['a']);
		assert.equal(out.value.derived.edges.length, 0); // no calls, not an error
	}
});

// ── render: sequenceDiagram branch + s1/s2 regression ─────────────────────────

test('documentIRToMermaid(call-sequence IR) emits a sequenceDiagram with ->> messages in order', () => {
	const a = f('a', 'a', 1), b = f('b', 'b', 2), c = f('c', 'c', 3);
	const ir = buildCallSequenceIR(
		{ entry: a, frames: [a, b, c], steps: [{ from: 'a', to: 'b', repeat: false }, { from: 'b', to: 'c', repeat: false }], truncatedFrameIds: [], depthUsed: 12 },
		'r', 's');
	const src = documentIRToMermaid(ir);
	assert.match(src, /^sequenceDiagram/);
	assert.match(src, /n0->>n1: call/);
	assert.match(src, /n1->>n2: call/);
	assert.doesNotMatch(src, /classDiagram|flowchart/);
});

test('documentIRToMermaid renders cycle-repeat + truncation markers as Note over', () => {
	const a = f('a', 'a', 1), b = f('b', 'b', 2);
	const ir = buildCallSequenceIR(
		{ entry: a, frames: [a, b], steps: [{ from: 'a', to: 'b', repeat: false }, { from: 'b', to: 'a', repeat: true }], truncatedFrameIds: ['b'], depthUsed: 4 },
		'r', 's');
	const src = documentIRToMermaid(ir);
	assert.match(src, /Note over n0: recursion/); // b->a repeat (a is n0)
	assert.match(src, /Note over n1: truncated at depth 4/); // b is n1
});

test('documentIRToMermaid keeps type-structure + component-dependency dispatch (no regression)', () => {
	const ts: DocumentIR = {
		docType: 'type-structure', scopeDescription: 'x',
		derived: { nodes: [{ id: 'A', label: 'A', kind: 'class' }], edges: [] },
		narrated: { sections: [] }, generatedAtRevision: 'r',
	};
	const cd: DocumentIR = {
		docType: 'component-dependency', scopeDescription: 'x',
		derived: { nodes: [{ id: 'db', label: 'db', kind: 'component' }], edges: [] },
		narrated: { sections: [] }, generatedAtRevision: 'r',
	};
	assert.match(documentIRToMermaid(ts), /^classDiagram/);
	assert.match(documentIRToMermaid(cd), /^flowchart LR/);
	assert.doesNotMatch(documentIRToMermaid(ts), /sequenceDiagram/);
	assert.doesNotMatch(documentIRToMermaid(cd), /sequenceDiagram/);
});
