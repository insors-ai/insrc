/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The code review's material (Epic 8315a11f s2): atoms and relations from a
 * dimension's grounding, on hand-built groundings.
 *
 * Run: npx tsx --test src/workflow/review-pipeline/__tests__/code-review-material.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { coverageSpec, prepareCoverageGrounding } from '../../code-review/dimensions/coverage.js';
import { qualitySpec } from '../../code-review/dimensions/quality.js';
import type { ChangedSymbolSummary, CodeReviewGrounding, CodeReviewSubject } from '../../code-review/types.js';
import { codeReviewSnapshot, modelDimensionAdapter } from '../code-review.js';
import { codeReviewMaterial, neighbourSummary } from '../adapters/code-review-material.js';

const row = (entityId: string, file: string, name: string, callees: string[] = [], callers: string[] = [], kind = 'function'): ChangedSymbolSummary =>
	({ entityId, file, kind, name, signature: `${name}()`, callers, callees, testsReaching: [] });
const grounding = (...symbols: ChangedSymbolSummary[]): CodeReviewGrounding => ({ symbols });
/** Relations as sorted "kind a~b" strings, direction ignored. */
const rels = (g: CodeReviewGrounding, kind?: string): string[] =>
	codeReviewMaterial(g).relations.filter(r => kind === undefined || r.kind === kind)
		.map(r => `${r.kind} ${[r.from, r.to].sort().join('~')}`).sort();

test("each included summary is one atom with id entityId, label file#name, the file's directory as module, and text equal to the row's JSON", () => {
	const rows = [row('e1', 'src/a/x.ts', 'one'), row('e2', 'src/b/y.ts', 'two'), row('e3', 'README.md', 'top', [], [], 'file')];
	const m = codeReviewMaterial(grounding(...rows));
	assert.deepEqual(m.atoms, [
		{ id: 'e1', label: 'src/a/x.ts#one', text: JSON.stringify(rows[0]), file: 'src/a/x.ts', module: 'src/a' },
		{ id: 'e2', label: 'src/b/y.ts#two', text: JSON.stringify(rows[1]), file: 'src/b/y.ts', module: 'src/b' },
		{ id: 'e3', label: 'README.md#top', text: JSON.stringify(rows[2]), file: 'README.md', module: '.' },
	], 'every row, in grounding order, whole');
	assert.deepEqual(m.obligations, [], 'obligations are the dimension\'s own (s3)');
	assert.equal(m.context, undefined);
	assert.deepEqual(codeReviewMaterial(grounding()).atoms, [], 'an empty grounding gives no atoms');
});

test('a callee or caller name matching a changed symbol gives a calls relation; a same-named pair relates to both; no self-relation; an unmatched name gives none', () => {
	// a calls b (a's callees); c is called by a (c's callers); two rows are named "dup"; self calls itself; "ghost" is unchanged.
	const g = grounding(
		row('a', 'src/p/a.ts', 'a', ['b', 'dup', 'ghost']),
		row('b', 'src/q/b.ts', 'b'),
		row('c', 'src/r/c.ts', 'c', [], ['a']),
		row('d1', 'src/s/d.ts', 'dup'),
		row('d2', 'src/t/d.ts', 'dup'),
		row('self', 'src/u/s.ts', 'self', ['self'], ['self']),
	);
	assert.deepEqual(rels(g, 'calls'), ['calls a~b', 'calls a~c', 'calls a~d1', 'calls a~d2']);
	// Direction: the caller is `from`.
	const calls = codeReviewMaterial(g).relations.filter(r => r.kind === 'calls');
	assert.ok(calls.every(r => r.from === 'a'), 'a is the caller of each');
	// A relation stated from both sides is one relation.
	const both = grounding(row('x', 'src/v/x.ts', 'x', ['y']), row('y', 'src/w/y.ts', 'y', [], ['x']));
	assert.deepEqual(rels(both, 'calls'), ['calls x~y']);
});

test('same-file and same-module relations join atoms sharing a file or directory; a diff review gets same-module relations only', () => {
	const g = grounding(row('f1', 'src/m/one.ts', 'f1'), row('f2', 'src/m/one.ts', 'f2'), row('g1', 'src/m/two.ts', 'g1'), row('h1', 'src/n/three.ts', 'h1'));
	assert.deepEqual(rels(g, 'same-file'), ['same-file f1~f2']);
	assert.deepEqual(rels(g, 'same-module'), ['same-module f1~f2', 'same-module f1~g1', 'same-module f2~g1']);
	assert.deepEqual(rels(g).filter(r => r.includes('h1')), [], 'a symbol alone in its directory is related to nothing');
	// A diff review: one 'file' row per changed file, no callers or callees.
	const diff = grounding(
		{ ...row('src/m/one.ts', 'src/m/one.ts', 'src/m/one.ts', [], [], 'file'), signature: '@@ -1 +1 @@\n-a\n+b' },
		row('src/m/two.ts', 'src/m/two.ts', 'src/m/two.ts', [], [], 'file'),
		row('src/n/three.ts', 'src/n/three.ts', 'src/n/three.ts', [], [], 'file'),
	);
	assert.deepEqual(rels(diff), ['same-module src/m/one.ts~src/m/two.ts'], 'only same-module relations');
	// Ids holding the separator characters (diff ids are paths) never collide: every pair is kept.
	// (x, y:z) and (x:y, z) would both join to 'same-module:x:y:z'.
	const odd = ['x', 'y:z', 'x:y', 'z'].map(p => row(p, p, p, [], [], 'file'));
	assert.equal(codeReviewMaterial(grounding(...odd)).relations.filter(r => r.kind === 'same-module').length, 6, 'all six root-level pairs');
});

test('a duplicate entityId throws an error naming it', () => {
	assert.throws(
		() => codeReviewMaterial(grounding(row('e1', 'src/a.ts', 'one'), row('e1', 'src/b.ts', 'two'))),
		(e: unknown) => e instanceof Error && e.message.includes('e1') && e.message.includes('src/a.ts#one') && e.message.includes('src/b.ts#two'),
	);
});

test('the same grounding gives identical material and identical neighbour summaries every time', () => {
	const make = (): CodeReviewGrounding => grounding(
		row('a', 'src/p/a.ts', 'a', ['b', 'c']), row('b', 'src/p/a.ts', 'b', [], ['a']), row('c', 'src/q/c.ts', 'c'), row('d', 'src/p/d.ts', 'd'),
	);
	const first = codeReviewMaterial(make());
	const summaries = (m: ReturnType<typeof codeReviewMaterial>): string[] => m.atoms.map(a => neighbourSummary(a, m));
	const firstSummaries = summaries(first);
	for (let i = 0; i < 5; i++) {
		const again = codeReviewMaterial(make());
		assert.deepEqual(again, first, 'same atoms, same relations, same order');
		assert.deepEqual(summaries(again), firstSummaries, 'same neighbour summaries');
	}
	assert.equal(firstSummaries[0], 'function a in src/p/a.ts: a(); calls: b, c; called by: none');
	// Built from the grounding alone: the input is not changed.
	const g = make();
	const before = JSON.stringify(g);
	codeReviewMaterial(g);
	assert.equal(JSON.stringify(g), before);
});

test('a neighbour summary names kind, name, file, the first signature line within 200 characters, and the related changed names', () => {
	const long = `${'x'.repeat(250)}\nsecond line`;
	const g = grounding(
		{ ...row('m', 'src/svc/main.ts', 'main', ['helper', 'unchangedLib', 'twin']), kind: 'method', signature: long },
		{ ...row('h', 'src/svc/helper.ts', 'helper', [], ['main', 'outsider']), signature: 'helper()\n  // the body is not part of the line' },
		row('t1', 'src/a/twin.ts', 'twin'),
		row('t2', 'src/b/twin.ts', 'twin'),
		row('c', 'src/svc/caller.ts', 'caller', ['main']),
	);
	const m = codeReviewMaterial(g);
	const of = (id: string): string => neighbourSummary(m.atoms.find(a => a.id === id)!, m);
	// Kind, name, file; the first signature line cut at 200; only changed related names (unchangedLib and outsider are not).
	assert.equal(of('m'), `method main in src/svc/main.ts: ${'x'.repeat(200)}; calls: helper, twin; called by: caller`);
	assert.equal(of('h'), 'function helper in src/svc/helper.ts: helper(); calls: none; called by: main');
	assert.equal(of('t1'), 'function twin in src/a/twin.ts: twin(); calls: none; called by: main');
	// The atom itself is never shortened: only its summary line is.
	assert.ok(m.atoms.find(a => a.id === 'm')!.text.includes('second line'));
});

test('coverage material built from prepareCoverageGrounding keeps only eligible rows and carries their coverageEvidence', () => {
	const subject = {
		repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f708', storyId: 's1', changedFiles: ['src/a.ts', 'src/__tests__/a.test.ts'],
		approvedLld: null, approvedPlan: null, buildRecord: null,
	} as CodeReviewSubject;
	const g = grounding(
		row('fn', 'src/a.ts', 'run'),
		{ ...row('iface', 'src/a.ts', 'Shape'), kind: 'interface' },
		row('t', 'src/__tests__/a.test.ts', 'testRun'),
		{ ...row('reached', 'src/a.ts', 'helper'), testsReaching: ['src/__tests__/a.test.ts#testRun'] },
	);
	const adapter = modelDimensionAdapter(coverageSpec(subject), subject, codeReviewSnapshot(subject, g));
	const material = adapter.material();
	const prepared = prepareCoverageGrounding(subject, g, 'full');
	assert.deepEqual(material.atoms.map(a => a.id), prepared.symbols.map(s => s.entityId), 'exactly the rows coverage judges');
	assert.ok(!material.atoms.some(a => a.id === 'iface' || a.id === 't'), 'ineligible rows are not atoms');
	assert.ok(material.atoms.length >= 1);
	for (const a of material.atoms) {
		const parsed = JSON.parse(a.text) as ChangedSymbolSummary;
		assert.ok(parsed.coverageEvidence !== undefined, `${a.id} carries its coverage evidence`);
		assert.deepEqual(parsed, prepared.symbols.find(s => s.entityId === a.id));
	}
	// The other dimensions take the grounding itself.
	const quality = modelDimensionAdapter(qualitySpec(subject), subject, codeReviewSnapshot(subject, g));
	assert.deepEqual(quality.material().atoms.map(a => a.id), ['fn', 'iface', 't', 'reached']);
});
