/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Section envelopes (LLD-b9d5c5c40df5a574-s3, task t4): a cut record or
 * aggregate value keeps its citation fields at the head of every section.
 * Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSection, sectionBlock, upstreamBlocks, recordBlock } from '../sections.js';
import type { BlockSection, EvidenceBlock, SectionResult } from '../sections.js';
import { measureInput } from '../handling.js';

function sections(result: SectionResult): readonly BlockSection[] {
	assert.equal(result.admissible, true, result.admissible ? '' : result.reason);
	return result.admissible ? result.sections : [];
}

const constraint = {
	constraint: 'The daemon must never open the graph store from the CLI. '.repeat(260),
	kind: 'hard-rule', sourceEntityId: 'ent-42', file: 'docs/daemon.md', heading: 'IPC',
	rationale: 'A second writer corrupts LMDB; the daemon owns all DB access. '.repeat(120),
};

test('oversized real-shaped doc.constraint.enumerate record keeps sourceEntityId, file, heading and kind in every section and reconstructs the original', () => {
	const block = recordBlock('t2#constraints[0]', constraint);
	assert.deepEqual(block.envelope, { kind: 'hard-rule', sourceEntityId: 'ent-42', file: 'docs/daemon.md', heading: 'IPC' });
	const room = 6_000;
	const cut = sections(sectionBlock(block, room));
	assert.ok(cut.length > 1);
	for (const s of cut) {
		assert.deepEqual(s.envelope, block.envelope);
		const rendered = renderSection(s);
		for (const field of ['sourceEntityId: ent-42', 'file: docs/daemon.md', 'heading: IPC', 'kind: hard-rule']) assert.ok(rendered.includes(field), field);
		assert.ok(measureInput(rendered, 'bytes') <= room, 'fits the room');
	}
	// The cut fields concatenate to the original text, constraint and rationale crossing the boundaries.
	assert.equal(cut.map(s => s.text).join(''), block.text);
	assert.ok(block.text.includes(constraint.constraint) && block.text.includes(constraint.rationale));
	assert.deepEqual(cut.map(s => s.index), cut.map((_, i) => i + 1));
	assert.ok(cut.every(s => s.count === cut.length));

	// A block that fits whole is one section.
	const small = sections(sectionBlock(recordBlock('k', { sourceEntityId: 'e', file: 'f', heading: 'h', constraint: 'short' }), room));
	assert.equal(small.length, 1);
});

test('oversized aggregate upstream value with nested records repeats each nested record\'s citation fields plus taskId, template and params in every section', () => {
	const value = {
		subject: 'daemon rules',
		decisions:   [{ sourceEntityId: 'ent-1', file: 'docs/a.md', heading: 'A', decision: 'Use LMDB. '.repeat(900) }],
		constraints: [{ sourceEntityId: 'ent-2', file: 'docs/b.md', heading: 'B', kind: 'must', constraint: 'Never Promise.all providers. '.repeat(700), rationale: 'r' }],
	};
	const params = { path: 'docs/' };
	const blocks = upstreamBlocks({ taskId: 't7', template: 'doc.decision.trace', params, value });
	assert.equal(blocks.length, 3, 'the rest of the value and one block per nested record');
	const rest = blocks[0] as EvidenceBlock;
	assert.deepEqual(rest.envelope, { taskId: 't7', template: 'doc.decision.trace', params });
	assert.ok(rest.text.includes('daemon rules') && rest.text.includes('$record'));

	for (const [i, expected] of [[1, { id: 'ent-1', file: 'docs/a.md', heading: 'A' }], [2, { id: 'ent-2', file: 'docs/b.md', heading: 'B' }]] as const) {
		const block = blocks[i] as EvidenceBlock;
		const cut = sections(sectionBlock(block, 5_000));
		assert.ok(cut.length > 1, `${block.key} is cut`);
		for (const s of cut) {
			const rendered = renderSection(s);
			for (const need of [`sourceEntityId: ${expected.id}`, `file: ${expected.file}`, `heading: ${expected.heading}`, 'taskId: t7', 'template: doc.decision.trace', 'params: {"path":"docs/"}']) {
				assert.ok(rendered.includes(need), `${block.key}: ${need}`);
			}
			assert.ok(measureInput(rendered, 'bytes') <= 5_000);
		}
		assert.equal(cut.map(s => s.text).join(''), block.text);
	}

	// A value with no cited record is one block of its JSON.
	const plain = upstreamBlocks({ taskId: 't1', template: 'x', params: {}, value: { a: [1, 2] } });
	assert.equal(plain.length, 1);
	assert.equal(plain[0]?.text, '{"a":[1,2]}');
	// A hit with a file and a line is a cited record too.
	const hit = upstreamBlocks({ taskId: 't3', template: 'search', params: {}, value: { hits: [{ file: 'src/a.ts', line: 12, snippet: 's' }] } });
	assert.deepEqual(hit[1]?.envelope, { taskId: 't3', template: 'search', params: {}, file: 'src/a.ts', line: 12 });
});

test('an envelope leaving less than 4,000 units marks only that block unadmittable and the other blocks stay admissible', () => {
	const fat: EvidenceBlock = { key: 'fat', envelope: { params: { blob: 'p'.repeat(2_500) } }, text: 'x'.repeat(20_000) };
	const ok: EvidenceBlock = { key: 'ok', envelope: { file: 'a.md' }, text: 'y'.repeat(20_000) };
	const room = 6_000;
	const results = [fat, ok].map(b => sectionBlock(b, room));
	assert.equal(results[0]?.admissible, false);
	assert.match((results[0] as { reason: string }).reason, /envelope of block 'fat'/);
	assert.match((results[0] as { reason: string }).reason, /less than the 4000 bytes a section needs/);
	const good = sections(results[1] as SectionResult);
	assert.ok(good.length > 1);
	assert.equal(good.map(s => s.text).join(''), ok.text);
	// The same fat block is admissible in a larger room: it is the room that is short, not the block malformed.
	assert.equal(sectionBlock(fat, 12_000).admissible, true);
});

test('the section line is measured as rendered: a block is admitted when its rendered header leaves the minimum room', () => {
	// Key 'k', no envelope, room 4,030: the two-section line is about 21 bytes, so 4,009 bytes remain for text.
	const block: EvidenceBlock = { key: 'k', envelope: {}, text: 'z'.repeat(6_000) };
	const r = sectionBlock(block, 4_030);
	assert.equal(r.admissible, true);
	if (!r.admissible) return;
	assert.equal(r.sections.map(x => x.text).join(''), block.text);
	for (const sec of r.sections) assert.ok(measureInput(renderSection(sec), 'bytes') <= 4_030);
	// The first section is the largest prefix that fits: no more than the digits' slack is left unused.
	assert.ok(4_030 - measureInput(renderSection(r.sections[0] as BlockSection), 'bytes') <= 1);
	// One unit less than the minimum room is refused, for this block only.
	assert.equal(sectionBlock(block, 4_000).admissible, false);
});
