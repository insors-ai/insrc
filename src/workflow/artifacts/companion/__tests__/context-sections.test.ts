/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (enrich-docgen-generated-companion-html-artifacts) — each companion
 * toIr now populates narrated.sections (Purpose + per-element field-explanation
 * + Legend), read-only. Plus the renderers thread the optional sourceLink onto
 * the written HTML.
 *
 * Run: npx tsx --test src/workflow/artifacts/companion/__tests__/context-sections.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { erDefinitionToIr, type ErDefinition } from '../er.js';
import { uxDefinitionToIr, type UxDefinition } from '../ux.js';
import { sequenceDefinitionToIr, type SequenceDefinition } from '../sequence.js';
import { componentDependencyDefinitionToIr, type ComponentDependencyDefinition } from '../component.js';
import { renderErCompanion, renderSequenceCompanion } from '../render.js';
import type { IrSection } from '../../../docgen/types.js';

const er: ErDefinition = {
	classes: {
		Customer: { attributes: { id: { range: 'string', identifier: true }, name: { range: 'string' } } },
		Order:    { attributes: { id: { range: 'string', identifier: true }, customer: { range: 'Customer', required: true } } },
	},
};
const ux: UxDefinition = {
	type: 'AdaptiveCard',
	body: [{ type: 'TextBlock', text: 'Hello' }, { type: 'ActionSet', actions: [{ type: 'Action.Submit', title: 'OK' }] }],
};
const seq: SequenceDefinition = {
	participants: [{ id: 'A' }, { id: 'B' }],
	messages: [{ from: 'A', to: 'B', label: 'do it', kind: 'call' }],
};
const comp: ComponentDependencyDefinition = {
	components: [{ id: 'x' }, { id: 'y' }],
	dependencies: [{ from: 'x', to: 'y' }],
};

const titles = (s: readonly IrSection[]): string[] => s.map(x => x.title);

// ── t4: each mapper populates Purpose + Fields + Legend ─────────────────────

test('erDefinitionToIr: sections = Purpose + Fields & schema + Legend', () => {
	const s = erDefinitionToIr(er).narrated.sections;
	assert.deepEqual(titles(s), ['Purpose', 'Fields & schema', 'Legend']);
	const fields = s.find(x => x.title === 'Fields & schema')!.narrativeText;
	assert.match(fields, /id: string \(identifier\)/);
	assert.match(fields, /customer → Customer \(relationship, one-to-one\)/);
	assert.match(s.find(x => x.title === 'Legend')!.narrativeText, /Crow's-foot/);
});

test('uxDefinitionToIr: sections = Purpose + Elements & roles + Legend', () => {
	const s = uxDefinitionToIr(ux).narrated.sections;
	assert.deepEqual(titles(s), ['Purpose', 'Elements & roles', 'Legend']);
	assert.match(s.find(x => x.title === 'Elements & roles')!.narrativeText, /ActionSet .* row of buttons/);
});

test('sequenceDefinitionToIr: sections = Purpose + Participants & message flow + Legend', () => {
	const s = sequenceDefinitionToIr(seq).narrated.sections;
	assert.deepEqual(titles(s), ['Purpose', 'Participants & message flow', 'Legend']);
	assert.match(s.find(x => x.title === 'Participants & message flow')!.narrativeText, /A → B: do it \[call\]/);
});

test('componentDependencyDefinitionToIr: sections = Purpose + Components & dependencies + Legend', () => {
	const s = componentDependencyDefinitionToIr(comp).narrated.sections;
	assert.deepEqual(titles(s), ['Purpose', 'Components & dependencies', 'Legend']);
	assert.match(s.find(x => x.title === 'Components & dependencies')!.narrativeText, /x → y/);
});

// ── t4: empty-but-valid def → Purpose + Legend, Fields omitted ──────────────

test('empty-but-valid definitions emit Purpose + Legend only (field section omitted, no throw)', () => {
	assert.deepEqual(titles(erDefinitionToIr({ classes: {} }).narrated.sections), ['Purpose', 'Legend']);
	assert.deepEqual(titles(uxDefinitionToIr({ type: 'AdaptiveCard', body: [] }).narrated.sections), ['Purpose', 'Legend']);
	assert.deepEqual(titles(sequenceDefinitionToIr({ participants: [], messages: [] }).narrated.sections), ['Purpose', 'Legend']);
	assert.deepEqual(titles(componentDependencyDefinitionToIr({ components: [], dependencies: [] }).narrated.sections), ['Purpose', 'Legend']);
});

// ── t4: read-only — the input definition is not mutated ─────────────────────

test('toIr does not mutate the input definition (read-only derivation)', () => {
	const erClone = structuredClone(er);
	erDefinitionToIr(er);
	assert.deepEqual(er, erClone);
	const seqClone = structuredClone(seq);
	sequenceDefinitionToIr(seq);
	assert.deepEqual(seq, seqClone);
});

// ── t5: renderers thread the optional sourceLink onto the written HTML ───────

test('renderErCompanion with opts.sourceLink writes the escaped back-link into the HTML', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ctx-src-'));
	const dest = join(dir, 'er-model.html');
	const ref = await renderErCompanion(er, 'ER model', dest, { repoPath: dir, sourceLink: { label: 'View the source document (LLD.md)', href: './LLD.md' } });
	assert.equal(ref.kind, 'diagram-mermaid');
	const html = readFileSync(dest, 'utf8');
	assert.match(html, /<a href="\.\/LLD\.md"[^>]*>View the source document \(LLD\.md\)<\/a>/);
	assert.match(html, /id="docgen-narrative"/);
	rmSync(dir, { recursive: true, force: true });
});

test('renderSequenceCompanion without sourceLink still writes HTML (backward-safe) — band present, no link', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ctx-nolink-'));
	const dest = join(dir, 'sequence-diagram.html');
	const ref = await renderSequenceCompanion(seq, 'Sequence diagram', dest, { repoPath: dir });
	assert.ok(existsSync(dest));
	assert.equal(ref.kind, 'diagram-mermaid');
	const html = readFileSync(dest, 'utf8');
	assert.match(html, /id="docgen-narrative"/);                 // context band still rendered (sections populated)
	assert.doesNotMatch(html, /View the source document/);        // but no source link
	rmSync(dir, { recursive: true, force: true });
});
