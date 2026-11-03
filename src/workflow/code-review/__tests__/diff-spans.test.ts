import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffDigest, MAX_DIFF_SPAN_CHARS, splitDiffRow, validateDiffFragments } from '../diff-spans.js';
import { assembleDiffCodeReviewGrounding, buildDiffSymbols } from '../grounding.js';
import type { ChangedSymbolSummary } from '../types.js';

const row = (signature: string): ChangedSymbolSummary => ({ entityId: 'diff:src/data.json', file: 'src/data.json', name: 'src/data.json', kind: 'file', signature, callers: [], callees: [], testsReaching: [], coverageEligible: false });

test('DIFF-SPANS: large text is a deterministic lossless ordered partition; small and binary rows keep legacy identity', () => {
	for (const text of [Array.from({ length: 3000 }, (_, i) => `+item-${i}\r\n`).join(''), `+${'🙂'.repeat(30_000)}\n`, '-deleted\n'.repeat(5_000)]) {
		const parts = splitDiffRow(row(text));
		assert.ok(parts.length > 1);
		assert.equal(parts.map(p => p.signature).join(''), text);
		assert.deepEqual(parts, splitDiffRow(row(text)));
		assert.equal(new Set(parts.map(p => p.entityId)).size, parts.length);
		for (const [i, part] of parts.entries()) {
			assert.ok(part.signature.length <= MAX_DIFF_SPAN_CHARS);
			assert.equal(part.diffFragment!.index, i); assert.equal(part.diffFragment!.count, parts.length);
			assert.equal(part.diffFragment!.contentDigest, diffDigest(part.signature));
			assert.ok(!/^[\uDC00-\uDFFF]/.test(part.signature) && !/[\uD800-\uDBFF]$/.test(part.signature));
			assert.deepEqual([part.callers, part.callees, part.testsReaching], [[], [], []]); assert.equal(part.coverageEligible, false);
		}
		validateDiffFragments(parts);
	}
	const small = row('small diff'); assert.equal(splitDiffRow(small)[0], small);
	const binary = buildDiffSymbols({ files: [{ path: 'logo.bin', change: 'binary', insertions: 0, deletions: 0 }], body: '', truncated: false });
	assert.equal(binary.length, 1); assert.equal(binary[0]!.diffFragment, undefined); assert.equal(binary[0]!.entityId, 'diff:logo.bin');
});

test('DIFF-COORDS: continuation spans preserve UTF16 diff/source coordinates and renamed-file ownership', () => {
	const text = `diff --git a/old.json b/src/data.json\n--- a/old.json\n+++ b/src/data.json\n@@ -10 +20 @@\n-old\n+${'x'.repeat(50_000)}\n`;
	const parts = splitDiffRow(row(text), 'old.json');
	const plusStart = text.indexOf('+', text.indexOf('\n-old\n') + 6);
	for (const part of parts) {
		const m = part.diffFragment!;
		assert.equal(m.oldFile, 'old.json'); assert.equal(m.newFile, 'src/data.json');
		assert.equal(text.slice(m.startOffset, m.endOffset), part.signature);
		if (m.startOffset > plusStart) {
			assert.equal(m.start.newLine, 20); assert.equal(m.start.oldLine, undefined);
			assert.equal(m.start.newColumn, m.startOffset - plusStart);
		}
	}
	validateDiffFragments(parts);
});

test('DIFF-INTEGRITY: missing, duplicated, reordered, overlapping or tampered spans/coordinates are rejected', () => {
	const parts = splitDiffRow(row('+item\n'.repeat(10_000)));
	assert.ok(parts.length > 2);
	const mutate = (edit: (rows: ChangedSymbolSummary[]) => void) => { const copy = structuredClone(parts); edit(copy); return copy; };
	for (const bad of [
		parts.slice(1), [...parts, parts[0]!], [...parts].reverse(),
		mutate(a => { a[1] = { ...a[1]!, diffFragment: { ...a[1]!.diffFragment!, startOffset: 1 } }; }),
		mutate(a => { a[0] = { ...a[0]!, signature: a[0]!.signature + 'lost' }; }),
		mutate(a => { a[1] = { ...a[1]!, diffFragment: { ...a[1]!.diffFragment!, start: { line: 1, column: 1 } } }; }),
	]) assert.throws(() => validateDiffFragments(bad), /diff fragment/);
});

test('DIFF-SPANS: staging rows retain original file order and unique changed paths', async () => {
	const files = ['b.json', 'a.json', 'small.ts'];
	const sections = files.map((path, i) => `diff --git a/${path} b/${path}\n@@ -0,0 +1 @@\n+${'x'.repeat(i < 2 ? 50_000 : 10)}\n`);
	const result = await assembleDiffCodeReviewGrounding('/repo', {
		rangeDiff: async () => ({ files: files.map(path => ({ path, change: 'added', insertions: 1, deletions: 0 })), body: sections.join(''), truncated: false }),
		workingTreeDiff: async () => ({ files: [], body: '', truncated: false }),
	}, { base: 'base' });
	assert.deepEqual(result.changedFiles, files, 'assembler preserves first occurrence order, without repeated fragment paths');
	const rows = result.grounding.symbols;
	for (const [index, path] of files.entries()) {
		const parts = rows.filter(p => p.file === path);
		assert.equal(parts.map(p => p.signature).join(''), sections[index]!.replace(/\n$/, ''));
		assert.ok(index < 2 ? parts.length > 1 : parts.length === 1);
	}
	assert.deepEqual(rows.map(p => p.file), [
		...Array(rows.filter(p => p.file === 'b.json').length).fill('b.json'),
		...Array(rows.filter(p => p.file === 'a.json').length).fill('a.json'), 'small.ts',
	], 'file groups retain source order rather than sorting');
});

test('DIFF-INTEGRITY: a digest-preserving partition that splits a surrogate pair is invalid', () => {
	const parts = splitDiffRow(row('🙂🙂'), undefined, 3);
	const first = parts[0]!, second = parts[1]!;
	const left = '🙂🙂'.slice(0, 1), right = '🙂🙂'.slice(1);
	const bad = [
		{ ...first, signature: left, diffFragment: { ...first.diffFragment!, endOffset: 1, contentDigest: diffDigest(left), end: { line: 1, column: 2 } } },
		{ ...second, signature: right, diffFragment: { ...second.diffFragment!, startOffset: 1, contentDigest: diffDigest(right), start: { line: 1, column: 2 } } },
	];
	assert.equal(bad.map(p => p.signature).join(''), '🙂🙂');
	assert.throws(() => validateDiffFragments(bad), /diff fragment/);
});
