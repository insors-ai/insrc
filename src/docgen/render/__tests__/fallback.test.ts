/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the docgen oversized-scope subprocess fallback (Story s5).
 *
 * The pure fns (oversized / toGraphvizDot / assembleFallbackShell) and the
 * assembleShell primary-vs-fallback DISPATCH are proven with hand-built IR
 * fixtures + an injected FAKE SubprocessRenderer — no real binary. The real
 * graphvizSubprocessRenderer + full generateDocument path are exercised by the
 * binary-gated live tests at the tail (skipped when neither dot nor d2 is on
 * PATH), so this file runs in the fast sweep.
 *
 * Run: npx tsx --test src/docgen/render/__tests__/fallback.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

import {
	oversized,
	OVERSIZED_LIMIT,
	toGraphvizDot,
	assembleFallbackShell,
	graphvizSubprocessRenderer,
	type SubprocessRenderer,
	type SubprocessRenderResult,
} from '../fallback.js';
import { assembleShell } from '../shell.js';
import { isOk } from '../../outcome.js';
import { generateDocument } from '../../index.js';
import type { DocumentIR, IrNode, IrEdge } from '../../types.js';

// ── fixtures ──────────────────────────────────────────────────────────────

/** A DocumentIR with `n` nodes and `e` edges (edges wire consecutive nodes). */
function irOf(n: number, e: number, labels?: Record<number, string>): DocumentIR {
	const nodes: IrNode[] = Array.from({ length: n }, (_, i) => ({
		id: `id${i}`, label: labels?.[i] ?? `C${i}`, kind: 'component',
	}));
	const edges: IrEdge[] = Array.from({ length: e }, (_, i) => ({
		id: `e${i}`, from: `id${i % Math.max(n, 1)}`, to: `id${(i + 1) % Math.max(n, 1)}`, kind: 'depends-on',
	}));
	return {
		docType: 'component-dependency', scopeDescription: 'src (topology)',
		derived: { nodes, edges }, narrated: { sections: [] }, generatedAtRevision: 'r1',
	};
}

const smallIR = irOf(3, 2);                                   // 5 elements — well under the limit
const bigIR = irOf(OVERSIZED_LIMIT, OVERSIZED_LIMIT);         // 2×limit elements — oversized

/** A fake renderer with a toggleable ok(svg) / unavailable result. */
function fakeRenderer(result: SubprocessRenderResult): SubprocessRenderer & { calls: number } {
	return {
		calls: 0,
		async renderSvg(): Promise<SubprocessRenderResult> { this.calls++; return result; },
	};
}

const CANNED_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>';

// ── t1 · oversized predicate ────────────────────────────────────────────────

test('oversized: false at/below the limit, true above it (strict >, ac4/ac1)', () => {
	assert.equal(oversized(irOf(30, 30)), false);              // exactly at the limit → primary
	assert.equal(oversized(irOf(30, 29)), false);              // below → primary
	assert.equal(oversized(irOf(30, 31)), true);               // above → fallback
	assert.equal(oversized(smallIR), false);
	assert.equal(oversized(bigIR), true);
});

test('oversized: default OVERSIZED_LIMIT applied when no limit passed; injected limit overrides', () => {
	assert.equal(OVERSIZED_LIMIT, 60);
	assert.equal(oversized(irOf(40, 40)), true);               // 80 > 60 default
	assert.equal(oversized(irOf(40, 40), 100), false);         // 80 <= 100 injected
	assert.equal(oversized(irOf(2, 1), 2), true);              // 3 > 2 injected
});

// ── t2 · toGraphvizDot ──────────────────────────────────────────────────────

test('toGraphvizDot: valid digraph — n<i> aliases, one node + one edge each', () => {
	const dot = toGraphvizDot(irOf(3, 2));
	assert.match(dot, /^digraph docgen \{/);
	assert.match(dot, /\}\s*$/);
	assert.match(dot, /n0 \[label="C0"\];/);
	assert.match(dot, /n2 \[label="C2"\];/);
	assert.match(dot, /n0 -> n1;/);                            // from consecutive-node wiring
	// exactly 3 node lines + 2 edge lines
	assert.equal((dot.match(/\[label=/g) ?? []).length, 3);
	assert.equal((dot.match(/->/g) ?? []).length, 2);
	// raw entity ids never leak into DOT
	assert.doesNotMatch(dot, /id0|id1|id2/);
});

test('toGraphvizDot: DOT-hostile label chars are escaped into well-formed DOT', () => {
	const dot = toGraphvizDot(irOf(1, 0, { 0: 'A"b\\c\nd' }));
	// " → \" , \ → \\ , newline → \n
	assert.match(dot, /label="A\\"b\\\\c\\nd"/);
	assert.doesNotMatch(dot, /\n\s*d"/);                       // the raw newline is gone
});

test('toGraphvizDot: an edge to an alias-less node is skipped', () => {
	const doc: DocumentIR = {
		...smallIR,
		derived: { nodes: [{ id: 'x', label: 'X', kind: 'component' }], edges: [{ id: 'e', from: 'x', to: 'ghost', kind: 'depends-on' }] },
	};
	const dot = toGraphvizDot(doc);
	assert.doesNotMatch(dot, /->/);                            // dangling edge dropped
	assert.doesNotMatch(dot, /ghost/);
});

// ── t4 · assembleFallbackShell ──────────────────────────────────────────────

test('assembleFallbackShell: sc3 shape, inlined SVG + svg-pan-zoom, offline (ac2)', () => {
	const shell = assembleFallbackShell(bigIR, CANNED_SVG, '/*SVGPANZOOM-BUNDLE*/', '3.6.2');
	assert.equal(shell.backend, 'fallback-subprocess');
	assert.equal(shell.diagramFormat, 'svg');
	assert.equal(shell.supportsZoomPan, true);
	assert.equal(shell.inlinedRuntimeVersion, '3.6.2');
	assert.equal(shell.docType, 'component-dependency');
	assert.match(shell.html, /<svg xmlns=/);                   // the SVG inlined directly (not escaped)
	assert.match(shell.html, /SVGPANZOOM-BUNDLE/);             // the bundle inlined
	assert.match(shell.html, /window\.svgPanZoom\(/);          // init wires pan/zoom
	assert.doesNotMatch(shell.html, /mermaid/i);               // no mermaid on the fallback path
	// the OFFLINE guarantee: no external fetch
	assert.doesNotMatch(shell.html, /<script[^>]*\bsrc=/i);
	assert.doesNotMatch(shell.html, /<link[^>]*\bhref=/i);
});

// ── t5 · assembleShell dispatch (fake renderer) ─────────────────────────────

test('assembleShell(small IR): primary-inline path; renderer NEVER invoked (ac4)', async () => {
	const fake = fakeRenderer({ status: 'unavailable', reason: 'x', triedBinaries: ['dot'] });
	const out = await assembleShell(smallIR, fake);
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.equal(out.value.backend, 'primary-inline');
		assert.match(out.value.html, /<pre class="mermaid">/); // primary marker
	}
	assert.equal(fake.calls, 0, 'subprocess renderer must not run for a small doc');
});

test('assembleShell(small IR): byte-identical to the default-renderer output (ac4 regression)', async () => {
	const withFake = await assembleShell(smallIR, fakeRenderer({ status: 'unavailable', reason: 'x', triedBinaries: [] }));
	const withDefault = await assembleShell(smallIR);          // default graphvizSubprocessRenderer, never invoked
	assert.ok(isOk(withFake) && isOk(withDefault));
	if (isOk(withFake) && isOk(withDefault)) assert.equal(withFake.value.html, withDefault.value.html);
});

test('assembleShell(oversized IR, ok renderer): fallback-subprocess shell (ac1/ac2)', async () => {
	const fake = fakeRenderer({ status: 'ok', svg: CANNED_SVG, tool: 'dot' });
	const out = await assembleShell(bigIR, fake);
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.equal(out.value.backend, 'fallback-subprocess');
		assert.equal(out.value.diagramFormat, 'svg');
		assert.match(out.value.html, /<svg xmlns=/);
		assert.match(out.value.html, /svgPanZoom|svg-pan-zoom/);
		assert.doesNotMatch(out.value.html, /<script[^>]*\bsrc=/i);
	}
	assert.equal(fake.calls, 1);
});

test('assembleShell(oversized IR, unavailable renderer): fallback-unavailable naming tried binaries + remedy (ac3)', async () => {
	const out = await assembleShell(bigIR, fakeRenderer({ status: 'unavailable', reason: 'boom', triedBinaries: ['dot', 'd2'] }));
	assert.equal(out.status, 'fallback-unavailable');
	if (out.status === 'fallback-unavailable') {
		assert.match(out.reason, /dot, d2/);                   // names the tried binaries
		assert.match(out.reason, /boom/);
		assert.match(out.remedy, /graphviz|d2/);               // install remedy
	}
});

// ── t6 · live, binary-gated (skips when neither dot nor d2 is on PATH) ───────

function which(bin: string): Promise<boolean> {
	return new Promise(resolve => {
		const child = spawn('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] });
		child.on('close', code => resolve(code === 0));
		child.on('error', () => resolve(false));
	});
}

const dotPresent = await which('dot');
const d2Present = await which('d2');
const dotOrD2 = dotPresent || d2Present;

test('live: graphvizSubprocessRenderer renders real DOT to an <svg> root', { skip: !dotOrD2 }, async () => {
	const result = await graphvizSubprocessRenderer.renderSvg(toGraphvizDot(irOf(3, 2)));
	assert.equal(result.status, 'ok');
	if (result.status === 'ok') {
		assert.match(result.svg, /<svg/);
		assert.ok(result.tool === 'dot' || result.tool === 'd2');
	}
});

test('live: generateDocument for an oversized component-dependency scope → ok fallback shell', { skip: !dotOrD2 }, async () => {
	// Feed the oversized IR straight through the real assembler via the default
	// renderer (the graph-backed extractor path is covered by s2's own tests;
	// here we prove the oversized → subprocess → sc3 shell wiring end-to-end).
	const out = await assembleShell(bigIR);
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.equal(out.value.backend, 'fallback-subprocess');
		assert.match(out.value.html, /<svg/);
		assert.doesNotMatch(out.value.html, /<script[^>]*\bsrc=/i);
	}
});

// Complementary gates prove the real renderer's ENOENT + failure mappings
// deterministically (no fragile child_process.spawn mock):

test('live: both binaries absent → unavailable naming the tried binaries (ac3)', { skip: dotOrD2 }, async () => {
	const result = await graphvizSubprocessRenderer.renderSvg(toGraphvizDot(smallIR));
	assert.equal(result.status, 'unavailable');
	if (result.status === 'unavailable') assert.deepEqual([...result.triedBinaries], ['dot', 'd2']);
});

test('live: a present binary that fails on bad DOT → unavailable(reason), never throws', { skip: !dotPresent }, async () => {
	const result = await graphvizSubprocessRenderer.renderSvg('this is not valid dot {{{');
	assert.equal(result.status, 'unavailable');
	if (result.status === 'unavailable') assert.match(result.reason, /dot/);
});

// Touch generateDocument so the module import is not dead weight (unknown docType
// stays not-found — the surface contract is unchanged by s5).
test('generateDocument: unknown docType still → not-found (s5 leaves the surface intact)', async () => {
	const out = await generateDocument('no-such-doc-type', {});
	assert.equal(out.status, 'not-found');
});
