/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the docgen narrative extractor (Story s4).
 *
 * The LLM seam is an injected FAKE NarrativeGenerator, so grounding + the degrade
 * matrix + provenance partition + shell rendering are proven with NO real model.
 *
 * Run: npx tsx --test src/docgen/extract/__tests__/narrative.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildAllowedEntitySet,
	groundSections,
	buildNarrativeDocument,
	makeExtract,
	NARRATIVE_DOCTYPE,
	type NarrativeGenerator,
	type RawNarrativeSection,
	type BaseExtract,
} from '../narrative.js';
import { assembleShell } from '../../render/shell.js';
import { ok, emptyScope, isOk } from '../../outcome.js';
import type { DocumentIR } from '../../types.js';

const baseIR: DocumentIR = {
	docType: 'component-dependency', scopeDescription: 'src',
	derived: {
		nodes: [
			{ id: 'db', label: 'db', kind: 'component', citation: { entityId: 'e_db' } },
			{ id: 'daemon', label: 'daemon', kind: 'component' },
		],
		edges: [{ id: 'x', from: 'daemon', to: 'db', kind: 'depends-on' }],
	},
	narrated: { sections: [] }, generatedAtRevision: 'r1',
};

const sec = (title: string, text: string, citedNames: string[]): RawNarrativeSection => ({ title, text, citedNames });

/** A fake generator with toggleable availability + canned/throwing output. */
function fakeGen(o: { available?: boolean; raw?: readonly RawNarrativeSection[]; throws?: boolean }): NarrativeGenerator {
	return {
		available: () => o.available ?? true,
		generate: async () => { if (o.throws) throw new Error('boom'); return o.raw ?? []; },
	};
}

// ── pure: buildAllowedEntitySet ───────────────────────────────────────────────

test('buildAllowedEntitySet: node labels + citation entityIds, normalized', () => {
	const allowed = buildAllowedEntitySet(baseIR);
	assert.ok(allowed.has('db'));
	assert.ok(allowed.has('daemon'));
	assert.ok(allowed.has('e_db'));     // node citation entityId
	assert.ok(!allowed.has('ghost'));
});

// ── pure: groundSections ──────────────────────────────────────────────────────

test('groundSections: keeps fully-grounded, DROPS any section with an ungrounded name (ac1/k11)', () => {
	const allowed = buildAllowedEntitySet(baseIR);
	const out = groundSections([
		sec('A', 'grounded', ['db', 'daemon']),
		sec('B', 'has a ghost', ['db', 'ghost']),
	], allowed);
	assert.equal(out.length, 1);
	assert.equal(out[0]!.title, 'A');
	assert.equal(out[0]!.narrativeText, 'grounded');
});

test('groundSections: all-ungrounded -> [] (fidelity over completeness, ac4)', () => {
	const allowed = buildAllowedEntitySet(baseIR);
	assert.deepEqual(groundSections([sec('A', 't', ['ghost'])], allowed), []);
});

test('groundSections: cited names match case/whitespace-insensitively', () => {
	const allowed = buildAllowedEntitySet(baseIR);
	const out = groundSections([sec('A', 't', ['DB', '  Daemon '])], allowed);
	assert.equal(out.length, 1);
});

test('groundSections: a section naming nothing is vacuously grounded (kept)', () => {
	const out = groundSections([sec('A', 't', [])], buildAllowedEntitySet(baseIR));
	assert.equal(out.length, 1);
});

// ── pure: buildNarrativeDocument ──────────────────────────────────────────────

test('buildNarrativeDocument: derived carried through verbatim, narration under narrated, docType=narrative (k8)', () => {
	const doc = buildNarrativeDocument(baseIR, [{ id: 'narr:0', title: 'A', narrativeText: 't' }]);
	assert.equal(doc.docType, NARRATIVE_DOCTYPE);
	assert.equal(doc.derived, baseIR.derived);              // same reference — byte-identical diagram
	assert.equal(doc.narrated.sections.length, 1);
	assert.equal(doc.generatedAtRevision, 'r1');
});

// ── makeExtract: orchestration + degrade matrix (fake generator) ──────────────

const okBase: BaseExtract = async () => ok(baseIR);
const req = { repo: '/r', base: 'component-dependency', question: 'how does it flow?' };

test('makeExtract: grounded generator -> ok narrative doc with derived diagram + grounded sections', async () => {
	const out = await makeExtract({ 'component-dependency': okBase }, fakeGen({ raw: [sec('A', 't', ['db'])] }))(req);
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.equal(out.value.docType, NARRATIVE_DOCTYPE);
		assert.equal(out.value.derived, baseIR.derived);
		assert.equal(out.value.narrated.sections.length, 1);
	}
});

test('makeExtract: available()=false -> ok(base derived IR), no narration (graceful, ac2)', async () => {
	const out = await makeExtract({ 'component-dependency': okBase }, fakeGen({ available: false }))(req);
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.equal(out.value, baseIR);                     // base returned unchanged (diagram alone)
		assert.equal(out.value.narrated.sections.length, 0);
	}
});

test('makeExtract: generator throws -> ok(base derived IR), no narration (degrade)', async () => {
	const out = await makeExtract({ 'component-dependency': okBase }, fakeGen({ throws: true }))(req);
	assert.ok(isOk(out));
	if (isOk(out)) assert.equal(out.value, baseIR);
});

test('makeExtract: all-ungrounded narration -> ok narrative doc with narrated.sections=[]', async () => {
	const out = await makeExtract({ 'component-dependency': okBase }, fakeGen({ raw: [sec('A', 't', ['ghost'])] }))(req);
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.equal(out.value.docType, NARRATIVE_DOCTYPE);
		assert.equal(out.value.narrated.sections.length, 0);  // dropped; diagram still rendered
	}
});

test('makeExtract: a base non-ok outcome short-circuits verbatim', async () => {
	const failBase: BaseExtract = async () => emptyScope('base said no');
	const out = await makeExtract({ 'component-dependency': failBase }, fakeGen({}))(req);
	assert.equal(out.status, 'empty-scope');
	if (out.status === 'empty-scope') assert.match(out.reason, /base said no/);
});

test('makeExtract: missing repo / unknown base / missing question -> empty-scope', async () => {
	const gen = fakeGen({});
	assert.equal((await makeExtract({ 'component-dependency': okBase }, gen)({ base: 'component-dependency', question: 'q' })).status, 'empty-scope');
	assert.equal((await makeExtract({ 'component-dependency': okBase }, gen)({ repo: '/r', base: 'nope', question: 'q' })).status, 'empty-scope');
	assert.equal((await makeExtract({ 'component-dependency': okBase }, gen)({ repo: '/r', base: 'component-dependency' })).status, 'empty-scope');
});

test('makeExtract: dispatches to the requested base extractor', async () => {
	const csIR: DocumentIR = { ...baseIR, docType: 'call-sequence', scopeDescription: 'from main' };
	const bases = {
		'component-dependency': okBase,
		'call-sequence': (async () => ok(csIR)) as BaseExtract,
	};
	const out = await makeExtract(bases, fakeGen({ raw: [] }))({ repo: '/r', base: 'call-sequence', symbol: 'main', question: 'q' });
	assert.ok(isOk(out));
	if (isOk(out)) assert.equal(out.value.scopeDescription, 'from main');  // the call-sequence base ran
});

// ── shell: distinct narrated region, offline, derived-only byte-identical ─────

test('assembleShell(narrative IR): distinct #docgen-narrative region, escaped, offline (ac3/ac5)', async () => {
	const ir = buildNarrativeDocument(baseIR, [
		{ id: 'narr:0', title: 'Flow', narrativeText: 'db is used by <daemon> & others' },
	]);
	const out = await assembleShell(ir);
	assert.ok(isOk(out));
	if (isOk(out)) {
		const h = out.value.html;
		assert.match(h, /id="docgen-narrative"/);              // distinct region (ac3)
		assert.match(h, /db is used by &lt;daemon&gt; &amp; others/); // narrativeText escaped (no injection)
		assert.doesNotMatch(h, /<script[^>]*\bsrc=/i);         // offline (ac5)
	}
});

test('assembleShell(derived-only IR): NO narrated region -> pre-s4 shell unchanged (regression)', async () => {
	const out = await assembleShell(baseIR); // narrated.sections=[]
	assert.ok(isOk(out));
	if (isOk(out)) {
		assert.doesNotMatch(out.value.html, /docgen-narrative/);        // no region emitted
		assert.match(out.value.html, /<div id="docgen-diagram"><pre class="mermaid">/); // no injected style attr — byte-identical marker
	}
});
