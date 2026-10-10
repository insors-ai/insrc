/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The request measure's table and pure functions (LLD-b9d5c5c40df5a574-s2, task t1).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeEntityId } from '../../indexer/parser/base.js';
import type { AnalyzeScope } from '../../shared/analyze-types.js';
import type { Entity, EntityKind } from '../../shared/types.js';
import { buildCompleteness } from '../completeness.js';
import type { ResolvedScope } from '../context/scope.js';
import { filesNamedBy } from '../explore/types.js';
import type { ExecutedExploration, Exploration, ExplorationOutput } from '../explore/types.js';
import {
	measureLookupResults, measureNamedArea, NO_LOOKUP_RESULT_TO_COUNT, notDetermined, renderMeasureLine,
	SIZE_THRESHOLDS, sizeOfCounts,
} from '../measure.js';
import type { RequestMeasure } from '../measure.js';

const REPO = '/work/app';
const SIZES: readonly AnalyzeScope[] = ['XS', 'S', 'M', 'L', 'XL'];

function ent(kind: EntityKind, name: string, rel: string): Entity {
	const file = `${REPO}/${rel}`;
	return {
		id: makeEntityId(REPO, file, kind, name), kind, name, language: 'typescript', repoId: 1, repo: REPO, file,
		startLine: 1, endLine: 5, body: '', embedding: [], indexedAt: '2026-10-09T00:00:00.000Z',
	} as Entity;
}
const dirScope = (kind: 'repo' | 'module', rel = ''): ResolvedScope => {
	const dir = rel === '' ? REPO : `${REPO}/${rel}`;
	return { kind, value: dir, repoPath: REPO, lookupPath: dir };
};
const fileScope = (rel: string): ResolvedScope =>
	({ kind: 'file', value: `${REPO}/${rel}`, repoPath: REPO, lookupPath: REPO, filePath: `${REPO}/${rel}` });
const symbolScope = (e: Entity): ResolvedScope =>
	({ kind: 'symbol', value: `${e.file}#${e.name}`, repoPath: REPO, lookupPath: REPO, filePath: e.file, entityId: e.id, entityName: e.name });

/** A repo of two directories: `pay` (two files, five entities) and `ship` (one file, two entities). */
function repoEntities(): Entity[] {
	return [
		ent('file', 'settle.ts', 'pay/settle.ts'), ent('function', 'settle', 'pay/settle.ts'), ent('function', 'refund', 'pay/settle.ts'),
		ent('file', 'ledger.ts', 'pay/ledger.ts'), ent('class', 'Ledger', 'pay/ledger.ts'),
		ent('file', 'track.ts', 'ship/track.ts'), ent('function', 'track', 'ship/track.ts'),
	];
}

const complete = (returned: number) => buildCompleteness({ returned, basis: 'graph' });
const executed = (output: ExplorationOutput, id = 'e1'): ExecutedExploration => ({
	exploration: { id, type: output.type === 'failed' || output.type === 'unsupported' ? output.requested : output.type, params: {} } as unknown as Exploration,
	output, cached: false, elapsedMs: 1,
});

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

test('sizeOfCounts gives each size at and just above each of the eight thresholds, takes the larger of the two sizes, never gives a smaller size for a larger count, and throws RangeError for a negative or fractional count (mutation: take the smaller of the two sizes)', () => {
	// The table itself: the stakeholder's decision of 2026-10-09.
	assert.deepEqual(SIZE_THRESHOLDS, { files: [1, 20, 200, 1500], items: [50, 500, 5000, 20000] });

	// Each column alone, with the other count at zero: at a bound the size is the bound's, just above it the next.
	for (const [column, bounds] of [['files', SIZE_THRESHOLDS.files], ['items', SIZE_THRESHOLDS.items]] as const) {
		const of = (n: number): AnalyzeScope => sizeOfCounts(column === 'files' ? { files: n, items: 0 } : { files: 0, items: n });
		assert.equal(of(0), 'XS', `${column} 0`);
		bounds.forEach((bound, i) => {
			assert.equal(of(bound), SIZES[i], `${column} at ${bound}`);
			assert.equal(of(bound + 1), SIZES[i + 1], `${column} just above ${bound}`);
		});
		assert.equal(of(10_000_000), 'XL');
	}

	// The larger of the two sizes wins, whichever column it comes from.
	assert.equal(sizeOfCounts({ files: 1, items: 6000 }), 'L', 'one file with 6,000 entities');
	assert.equal(sizeOfCounts({ files: 300, items: 10 }), 'L', '300 files with 10 entities');
	assert.equal(sizeOfCounts({ files: 20, items: 500 }), 'S');
	assert.equal(sizeOfCounts({ files: 21, items: 500 }), 'M');
	assert.equal(sizeOfCounts({ files: 20, items: 501 }), 'M');
	assert.equal(sizeOfCounts({ files: 2000, items: 0 }), 'XL');

	// Raising either count never gives a smaller size.
	const steps = [0, 1, 2, 20, 21, 50, 51, 200, 201, 500, 501, 1500, 1501, 5000, 5001, 20000, 20001];
	for (const files of steps) {
		for (const items of steps) {
			const here = SIZES.indexOf(sizeOfCounts({ files, items }));
			assert.ok(SIZES.indexOf(sizeOfCounts({ files: files + 1, items })) >= here, `files ${files}+1, items ${items}`);
			assert.ok(SIZES.indexOf(sizeOfCounts({ files, items: items + 1 })) >= here, `files ${files}, items ${items}+1`);
		}
	}

	// A count that is not a count is a caller's error.
	for (const bad of [{ files: -1, items: 0 }, { files: 0, items: -1 }, { files: 1.5, items: 0 }, { files: 0, items: 0.5 }, { files: Number.NaN, items: 0 }]) {
		assert.throws(() => sizeOfCounts(bad), RangeError, JSON.stringify(bad));
	}
	assert.throws(() => sizeOfCounts({ files: -1, items: 0 }), /files must be a whole number that is not negative; got -1/);
});

// ---------------------------------------------------------------------------
// A named area
// ---------------------------------------------------------------------------

test("measureNamedArea counts the entities of the scope's area and their distinct file paths for a repo, a module, a file and a symbol scope, and does not count the whole repo for a narrower scope (mutation: count every entity given)", () => {
	const all = repoEntities();
	const counts = (m: RequestMeasure): unknown => ({ source: m.source, items: m.items, files: m.files, characters: m.characters, size: m.size, determined: m.determined });

	// The whole repo: seven entities in three files.
	assert.deepEqual(counts(measureNamedArea(dirScope('repo'), all)),
		{ source: 'named-area', items: 7, files: 3, characters: null, size: 'S', determined: true });
	// A module: only what lies under its directory.
	assert.deepEqual(counts(measureNamedArea(dirScope('module', 'pay'), all)),
		{ source: 'named-area', items: 5, files: 2, characters: null, size: 'S', determined: true });
	assert.deepEqual(counts(measureNamedArea(dirScope('module', 'ship'), all)),
		{ source: 'named-area', items: 2, files: 1, characters: null, size: 'XS', determined: true });
	// A file: that file's entities, one file.
	assert.deepEqual(counts(measureNamedArea(fileScope('pay/settle.ts'), all)),
		{ source: 'named-area', items: 3, files: 1, characters: null, size: 'XS', determined: true });
	// A symbol: the one entity.
	const refund = all.find(e => e.name === 'refund')!;
	assert.deepEqual(counts(measureNamedArea(symbolScope(refund), all)),
		{ source: 'named-area', items: 1, files: 1, characters: null, size: 'XS', determined: true });

	// The same entities, a narrower scope, a smaller count: the whole repo is not what a module scope counts.
	assert.ok(measureNamedArea(dirScope('module', 'pay'), all).items < measureNamedArea(dirScope('repo'), all).items);
	// A measure of a named area carries no note and no hint unless one is given.
	assert.deepEqual(Object.keys(measureNamedArea(dirScope('repo'), all)).sort(), ['characters', 'determined', 'files', 'items', 'size', 'source']);
});

test("measureNamedArea gives XS with determined true for an area that holds nothing, and counts files by distinct path when the repo has no entity of kind 'file'", () => {
	// An empty directory inside a repo that holds entities: a count of zero, not a failure to count.
	const empty = measureNamedArea(dirScope('module', 'docs'), repoEntities());
	assert.deepEqual([empty.items, empty.files, empty.size, empty.determined, empty.note], [0, 0, 'XS', true, undefined]);
	// No entities at all given: still a count. (Whether the repo is indexed is the measuring pass's question.)
	assert.equal(measureNamedArea(dirScope('repo'), []).size, 'XS');

	// A repo whose parser stores no entity of kind 'file': files are counted by path.
	const noFileEntities = repoEntities().filter(e => e.kind !== 'file');
	const m = measureNamedArea(dirScope('repo'), noFileEntities);
	assert.deepEqual([m.items, m.files], [4, 3]);
});

// ---------------------------------------------------------------------------
// Lookup results
// ---------------------------------------------------------------------------

const symbolHits = (...rels: string[]): ExplorationOutput => ({
	type: 'symbol.locate', completeness: complete(rels.length), names: ['x'],
	hits: rels.map((rel, i) => ({ entityId: `id${i}`, name: `n${i}`, kind: 'function', file: `${REPO}/${rel}`, startLine: 1, endLine: 2 })),
});
const failed = (partial?: boolean): ExplorationOutput => ({
	type: 'failed', requested: 'search.text', errorCode: 'x', message: 'the search could not run',
	...(partial === true ? { partial: [{ what: 'a hit', detail: `${REPO}/pay/settle.ts` }] as never } : {}),
});

test("measureLookupResults sums the returned counts of the outputs that carry a completeness record, counts each file once through filesNamedBy, records the characters, and adds nothing for a failed or unsupported lookup (mutation: count a failed lookup's partial findings)", () => {
	const a = symbolHits('pay/settle.ts', 'pay/ledger.ts');
	const b = symbolHits('pay/settle.ts', 'ship/track.ts', 'ship/track.ts');
	const tables: ExplorationOutput = {
		type: 'db.tables.list', completeness: buildCompleteness({ returned: 4, basis: 'data-source' }), connectionId: 'ledger-db', family: 'rdbms',
		tables: [1, 2, 3, 4].map(n => ({ name: `t${n}`, kind: 'table' })), notFoundNote: '',
	};
	const m = measureLookupResults([executed(a, 'e1'), executed(b, 'e2'), executed(tables, 'e3'), executed(failed(true), 'e4'),
		executed({ type: 'unsupported', requested: 'search.text', reason: 'no backend' }, 'e5')]);

	assert.equal(m.source, 'lookup-results');
	assert.equal(m.determined, true);
	// 2 + 3 + 4 returned; the failed lookup's partial finding and the unsupported lookup add nothing.
	assert.equal(m.items, 9);
	// settle.ts is named by both lookups and track.ts twice by one: three distinct files. The tables are not files.
	assert.equal(m.files, 3);
	// The characters are those of the three counted outputs as the answer step is given them.
	assert.equal(m.characters, [a, b, tables].reduce((n, o) => n + JSON.stringify(o, null, 2).length, 0));
	assert.equal(m.size, sizeOfCounts({ files: 3, items: 9 }));
	assert.equal(m.size, 'S');

	// The characters are recorded and take no part in the size: a huge output of few items stays small.
	const wide: ExplorationOutput = { ...symbolHits('pay/settle.ts'), names: ['x'.repeat(2_000_000)] };
	const big = measureLookupResults([executed(wide)]);
	assert.ok((big.characters ?? 0) > 2_000_000);
	assert.equal(big.size, 'XS');

	// No lookup at all returned zero items and none failed: a count, XS.
	const none = measureLookupResults([executed(symbolHits())]);
	assert.deepEqual([none.items, none.files, none.size, none.determined], [0, 0, 'XS', true]);
});

test('measureLookupResults gives a measure that is not determined, with size XL, when no output carries a completeness record', () => {
	for (const results of [
		[] as ExecutedExploration[],
		[executed(failed())],
		[executed(failed(true)), executed({ type: 'unsupported', requested: 'search.text', reason: 'no backend' })],
	]) {
		const m = measureLookupResults(results, 'S');
		assert.deepEqual(m, {
			source: 'lookup-results', items: 0, files: 0, characters: null, size: 'XL', determined: false, sizeHint: 'S',
			note: NO_LOOKUP_RESULT_TO_COUNT,
		});
	}
	// An output whose record is missing or malformed is not counted either.
	const bare = { ...symbolHits('pay/settle.ts'), completeness: undefined } as unknown as ExplorationOutput;
	assert.equal(measureLookupResults([executed(bare)]).determined, false);
	// One counted output is enough.
	assert.equal(measureLookupResults([executed(failed()), executed(symbolHits('pay/settle.ts'))]).determined, true);
});

// ---------------------------------------------------------------------------
// The hint
// ---------------------------------------------------------------------------

test('every measure records the hint it was given and the hint never changes the size, whether the hint is smaller or larger than the measured size (mutation: use the hint when it is larger)', () => {
	const all = repoEntities();
	const results = [executed(symbolHits('pay/settle.ts', 'pay/ledger.ts'))];
	for (const hint of SIZES) {
		// A named area that measures S.
		const area = measureNamedArea(dirScope('repo'), all, hint);
		assert.deepEqual([area.size, area.sizeHint], ['S', hint]);
		// Lookup results that measure S (two files).
		const looked = measureLookupResults(results, hint);
		assert.deepEqual([looked.size, looked.sizeHint], ['S', hint]);
		// A measure that is not determined is XL whatever was asked for.
		const unknown = notDetermined('named-area', 'the index holds nothing for the path', hint);
		assert.deepEqual([unknown.size, unknown.determined, unknown.sizeHint], ['XL', false, hint]);
		assert.deepEqual([measureLookupResults([], hint).size, measureLookupResults([], hint).sizeHint], ['XL', hint]);
	}
	// With no hint the field is absent, not undefined.
	assert.ok(!('sizeHint' in measureNamedArea(dirScope('repo'), all)));
	assert.ok(!('sizeHint' in measureLookupResults(results)));
	assert.ok(!('sizeHint' in notDetermined('data-source', 'the source cannot be reached')));
});

// ---------------------------------------------------------------------------
// The line
// ---------------------------------------------------------------------------

test('renderMeasureLine states the size, the source and the counts for each of the three sources, the characters for lookup results, the note when not determined, and the hint when one was given', () => {
	const base = { determined: true } as const;
	assert.equal(
		renderMeasureLine({ ...base, source: 'named-area', items: 18330, files: 1204, characters: null, size: 'L' }),
		'Size: L, measured from the area the request names: 1,204 files, 18,330 entities.');
	assert.equal(
		renderMeasureLine({ ...base, source: 'named-area', items: 1, files: 1, characters: null, size: 'XS' }),
		'Size: XS, measured from the area the request names: 1 file, 1 entity.');
	assert.equal(
		renderMeasureLine({ ...base, source: 'lookup-results', items: 42, files: 7, characters: 61234, size: 'S' }),
		'Size: S, measured from what the lookups returned: 7 files, 42 items, 61,234 characters.');
	assert.equal(
		renderMeasureLine({ ...base, source: 'data-source', items: 40, files: 0, characters: null, size: 'M' }),
		'Size: M, measured from the data source: 40 objects.');
	assert.equal(
		renderMeasureLine({ ...base, source: 'data-source', items: 12, files: 12, characters: null, size: 'S' }),
		'Size: S, measured from the data source: 12 objects, 12 files.');

	// Not determined: the largest size and the reason, with no counts.
	assert.equal(
		renderMeasureLine(notDetermined('named-area', 'the index holds nothing for the path /work/other')),
		'Size: XL, not determined: the index holds nothing for the path /work/other.');
	assert.equal(renderMeasureLine(measureLookupResults([])), `Size: XL, not determined: ${NO_LOOKUP_RESULT_TO_COUNT}.`);

	// A hint is said, on a determined and on an undetermined measure.
	assert.equal(
		renderMeasureLine({ ...base, source: 'named-area', items: 18330, files: 1204, characters: null, size: 'L', sizeHint: 'S' }),
		'Size: L, measured from the area the request names: 1,204 files, 18,330 entities. The caller asked for S.');
	assert.equal(
		renderMeasureLine(notDetermined('data-source', 'the source cannot be reached', 'M')),
		'Size: XL, not determined: the source cannot be reached. The caller asked for M.');
	// A measure built by this module renders to one line.
	assert.ok(!renderMeasureLine(measureNamedArea(dirScope('repo'), repoEntities(), 'XL')).includes('\n'));
});

// ---------------------------------------------------------------------------
// The files an output names
// ---------------------------------------------------------------------------

/** One output of every member of the union, keyed by its type. */
function oneOfEvery(): Record<ExplorationOutput['type'], { output: ExplorationOutput; files: string[] }> {
	const f = (rel: string): string => `${REPO}/${rel}`;
	const c = complete(1);
	return {
		'concept.resolve': {
			output: { type: 'concept.resolve', completeness: c, query: 'q', hits: [
				{ kind: 'dir', path: f('pay'), name: 'pay', score: 1, diagnostics: {} },
				{ kind: 'file', path: f('pay/settle.ts'), name: 'settle.ts', score: 1, diagnostics: {} },
				{ kind: 'entity', path: f('pay/ledger.ts'), entityId: 'e', name: 'Ledger', score: 1, diagnostics: {} },
			] },
			files: [f('pay/settle.ts'), f('pay/ledger.ts')],
		},
		'module.profile': {
			output: { type: 'module.profile', completeness: c, profile: {
				path: f('pay'), kind: 'dir', subdirs: [f('pay/rules')],
				filesInDir: [{ file: f('pay/settle.ts'), language: 'typescript', bytes: 1, kind: 'file' }],
				exports: [], entrypoints: [], entityCount: 1, totalBytes: 1,
			} },
			files: [f('pay/settle.ts')],
		},
		'symbol.locate': { output: symbolHits('pay/settle.ts'), files: [f('pay/settle.ts')] },
		'import.graph': {
			output: { type: 'import.graph', completeness: c, summary: {
				target: f('pay'), topImporters: [{ file: f('ship/track.ts'), edges: 1 }], topImportees: [{ file: f('pay/ledger.ts'), edges: 2 }],
				totalInDegree: 1, totalOutDegree: 2,
			} },
			files: [f('ship/track.ts'), f('pay/ledger.ts')],
		},
		'doc.mention': {
			output: { type: 'doc.mention', completeness: c, subject: 's', hits: [{ entityId: 'e', file: f('docs/a.md'), heading: 'h', kind: 'section', score: 1 }] },
			files: [f('docs/a.md')],
		},
		'doc.decision.trace': {
			output: { type: 'doc.decision.trace', completeness: c, topic: 't', notFoundNote: '', retrievedSectionCount: 1,
				decisions: [{ decision: 'd', sourceEntityId: 'e', file: f('docs/b.md'), heading: 'h', rationale: 'r' }] },
			files: [f('docs/b.md')],
		},
		'doc.constraint.enumerate': {
			output: { type: 'doc.constraint.enumerate', completeness: c, subject: 's', notFoundNote: '', retrievedSectionCount: 1,
				constraints: [{ constraint: 'x', kind: 'must', sourceEntityId: 'e', file: f('docs/c.md'), heading: 'h', rationale: 'r' }] },
			files: [f('docs/c.md')],
		},
		'usage.example': {
			output: { type: 'usage.example', completeness: c, subject: 's',
				callers: [{ entityId: 'e', name: 'n', kind: 'function', file: f('ship/track.ts'), startLine: 1, endLine: 2 }] },
			files: [f('ship/track.ts')],
		},
		'class.hierarchy': {
			output: { type: 'class.hierarchy', completeness: c, subject: 's', notFoundNote: '', nodes: [{
				entityId: 'e', name: 'Ledger', kind: 'class', file: f('pay/ledger.ts'), startLine: 1,
				extendsList: [{ name: 'Base', file: f('pay/base.ts') }, { name: 'Unplaced' }],
				implementsList: [{ name: 'Book', file: f('pay/book.ts') }],
				subclasses: [{ entityId: 's', name: 'Sub', file: f('pay/sub.ts') }],
				implementers: [{ entityId: 'i', name: 'Impl', file: f('pay/impl.ts') }],
			}] },
			files: [f('pay/ledger.ts'), f('pay/base.ts'), f('pay/book.ts'), f('pay/sub.ts'), f('pay/impl.ts')],
		},
		'capability.reuse-check': {
			output: { type: 'capability.reuse-check', completeness: c, capability: 'x', notFoundNote: '',
				candidates: [{ path: f('pay'), moduleName: 'pay', verdict: 'partial-match', rationale: 'r', evidenceEntities: [], conceptScore: 1 }] },
			files: [],
		},
		'search.text': {
			output: { type: 'search.text', completeness: c, pattern: 'p', backend: 'node', root: REPO,
				hits: [{ file: 'pay/settle.ts', line: 1, text: 't' }, { file: f('pay/ledger.ts'), line: 2, text: 't' }] },
			files: [f('pay/settle.ts'), f('pay/ledger.ts')],
		},
		'convention.detect': {
			output: { type: 'convention.detect', completeness: c, path: f('pay'), baseClassIdioms: [], privatePrefixCount: 0, dunderMethodCount: 0,
				totalEntities: 1, notFoundNote: '', namingSchema: {
					functions: 'camelCase', functionsBreakdown: {}, classes: 'PascalCase', classesBreakdown: {}, files: 'kebab-case', filesBreakdown: {},
					testFiles: '*.test', sampleSizes: { functions: 1, classes: 1, files: 1 },
				} },
			files: [],
		},
		'config.trace': {
			output: { type: 'config.trace', completeness: c, key: 'k', backend: 'node', root: REPO,
				hits: [{ file: 'config/app.yaml', line: 1, text: 't', role: 'definition' }] },
			files: [f('config/app.yaml')],
		},
		'test.locate': {
			output: { type: 'test.locate', completeness: c, subject: 's', notFoundNote: '',
				hits: [{ file: f('pay/__tests__/settle.test.ts'), name: 'n', kind: 'file' }] },
			files: [f('pay/__tests__/settle.test.ts')],
		},
		'data-model.trace': {
			output: { type: 'data-model.trace', completeness: c, subject: 's', notFoundNote: '', nodes: [{
				entityId: 'e', name: 'Invoice', kind: 'class', file: f('pay/invoice.ts'), startLine: 1, fields: [{ name: 'id' }],
				extendsList: [{ name: 'Doc', file: f('pay/doc.ts') }, { name: 'Unplaced' }],
				subclasses: [{ entityId: 's', name: 'Credit', file: f('pay/credit.ts') }],
				topCallers: [{ entityId: 'c', name: 'bill', file: f('pay/bill.ts'), line: 3 }],
			}] },
			files: [f('pay/invoice.ts'), f('pay/doc.ts'), f('pay/credit.ts'), f('pay/bill.ts')],
		},
		'db.connections.list': {
			output: { type: 'db.connections.list', completeness: c, notFoundNote: '',
				connections: [{ id: 'ledger-db', kind: 'sqlite', family: 'rdbms', label: 'ledger', path: f('data/ledger.db') }] },
			files: [],
		},
		'db.tables.list': {
			output: { type: 'db.tables.list', completeness: c, connectionId: 'ledger-db', family: 'rdbms', notFoundNote: '', tables: [{ name: 'payments', kind: 'table' }] },
			files: [],
		},
		'db.table.describe': {
			output: { type: 'db.table.describe', completeness: c, connectionId: 'ledger-db', target: 'payments', family: 'rdbms',
				columns: [{ name: 'id', type: 'int' }], shapeSummary: 's', notFoundNote: '' },
			files: [],
		},
		'manifests.locate': {
			output: { type: 'manifests.locate', completeness: c, notFoundNote: '', families: {} as never,
				hits: [{ file: f('deploy/app.yaml'), family: 'kubernetes' as never }] },
			files: [f('deploy/app.yaml')],
		},
		'freeform.probe': {
			output: { type: 'freeform.probe', completeness: buildCompleteness({ returned: 1, basis: 'model-directed' }), purpose: 'p', shaperId: 'code', toolCallCount: 1,
				rawBundle: { system: '', focus: '', summary: `see ${f('pay/settle.ts')}`, structure: '', surface: '', artefacts: '', upstream: '' } } as ExplorationOutput,
			files: [],
		},
		'unsupported': { output: { type: 'unsupported', requested: 'search.text', reason: 'no backend' }, files: [] },
		'failed': { output: failed(true), files: [] },
	};
}

test('filesNamedBy returns the file paths of a fixture of every lookup output type, none for the three data outputs and for a failed or unsupported output, and is a switch the compiler checks for every member of the output union', () => {
	const every = oneOfEvery();
	for (const [type, { output, files }] of Object.entries(every)) {
		assert.equal(output.type, type);
		assert.deepEqual([...filesNamedBy(output)], files, type);
	}
	// None for the three data outputs, nor for a lookup that failed or is not supported.
	for (const type of ['db.connections.list', 'db.tables.list', 'db.table.describe', 'failed', 'unsupported'] as const) {
		assert.deepEqual([...filesNamedBy(every[type].output)], [], type);
	}
	// A relative path of a search is joined to the root it was searched from, so one file is one path.
	assert.deepEqual(new Set([...filesNamedBy(every['search.text'].output), ...filesNamedBy(every['symbol.locate'].output)]).size, 2);

	// The switch has a case for every member of the union and no default: the source says so.
	const source = readFileSync(fileURLToPath(new URL('../explore/types.ts', import.meta.url)), 'utf8');
	const union = source.slice(source.indexOf('export type ExplorationOutput ='));
	const members = [...union.slice(0, union.indexOf(';')).matchAll(/\|\s*(\w+)/g)].map(m => m[1]!);
	assert.equal(members.length, 22, 'the members of the output union');
	const typeOf = (iface: string): string => {
		const at = source.indexOf(`export interface ${iface} {`);
		assert.ok(at >= 0, iface);
		return /readonly type:\s+'([^']+)'/.exec(source.slice(at))![1]!;
	};
	const types = members.map(typeOf).sort();
	assert.deepEqual(types, Object.keys(every).sort(), 'the fixture holds one output of every member');
	const body = source.slice(source.indexOf('export function filesNamedBy('));
	const fn = body.slice(0, body.indexOf('\n}\n'));
	for (const type of types) assert.ok(fn.includes(`case '${type}':`), `filesNamedBy has a case for '${type}'`);
	assert.ok(!/\bdefault\s*:/.test(fn), 'filesNamedBy has no default case, so the compiler checks the switch');
});
