/**
 * The completeness record's builder and the answer report derived from
 * it (LLD-b9d5c5c40df5a574-s1, task t1). Pure functions -- no store, no
 * files, no LLM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	buildCompleteness,
	deriveAnswerReport,
	renderCompletenessLine,
	type AnswerReport,
	type Completeness,
	type ReportSource,
} from '../completeness.js';

const GRAPH_NOTE = "the stored graph's own coverage is not established";

function complete(extra: Partial<Parameters<typeof buildCompleteness>[0]> = {}): Completeness {
	return buildCompleteness({ returned: 3, basis: 'graph', ...extra });
}

// --- buildCompleteness -------------------------------------------------------

test('buildCompleteness computes complete and rejects contradictory facts with RangeError', () => {
	const whole = buildCompleteness({ returned: 3, basis: 'text' });
	assert.deepEqual(whole, { complete: true, total: 3, returned: 3, basis: 'text' });
	assert.equal('limited' in whole || 'skipped' in whole || 'partlyRead' in whole, false, 'empty lists are omitted');

	// Each of the four facts makes the record incomplete on its own.
	const limited = buildCompleteness({
		returned: 200, basis: 'text',
		limited: [{ what: 'hits', limit: 200, scope: 'overall', reason: 'hit limit' }],
	});
	assert.equal(limited.complete, false);
	assert.equal(limited.total, null, 'a reached limit leaves the total unknown unless it is given');

	const skipped = buildCompleteness({
		returned: 3, basis: 'text', skipped: [{ what: 'big.bin', reason: 'too-large' }],
	});
	assert.equal(skipped.complete, false);
	assert.equal(skipped.total, 3);

	const partly = buildCompleteness({
		returned: 1, basis: 'doc-index',
		partlyRead: [{ what: 'docs/a.md', readChars: 2_000, totalChars: 100_000 }],
	});
	assert.equal(partly.complete, false);

	const unknown = buildCompleteness({ returned: 1, basis: 'model-directed', notEstablished: true });
	assert.equal(unknown.complete, false);
	assert.deepEqual(Object.keys(unknown).sort(), ['basis', 'complete', 'returned', 'total'], 'notEstablished adds no field');

	// A given total is kept, and a known total beside a reached limit is allowed.
	assert.equal(buildCompleteness({
		returned: 200, total: 950, basis: 'graph',
		limited: [{ what: 'callers', limit: 200, scope: 'overall', reason: 'caller limit' }],
	}).total, 950);
	assert.equal(buildCompleteness({ returned: 2, total: null, basis: 'graph' }).total, null);

	// `complete` is never an input: a caller cannot assert it past a reached limit.
	const forced = buildCompleteness({
		returned: 1, basis: 'text', complete: true,
		skipped: [{ what: 'x', reason: 'unreadable' }],
	} as unknown as Parameters<typeof buildCompleteness>[0]);
	assert.equal(forced.complete, false);

	assert.throws(() => buildCompleteness({ returned: -1, basis: 'text' }), RangeError);
	assert.throws(() => buildCompleteness({ returned: 5, total: 4, basis: 'text' }), RangeError);
	assert.throws(() => buildCompleteness({
		returned: 5, basis: 'text',
		limited: [{ what: 'hits', limit: 4, scope: 'overall', reason: 'hit limit' }],
	}), RangeError);
	assert.throws(() => buildCompleteness({ returned: 5, total: Number.NaN, basis: 'text' }), RangeError);
	assert.throws(() => buildCompleteness({
		returned: 5, basis: 'graph',
		limited: [{ what: 'fields per target', limit: -1, scope: 'per-group', reason: 'field limit' }],
	}), RangeError);
	assert.throws(() => buildCompleteness({
		returned: 1, basis: 'doc-index', partlyRead: [{ what: 'a.md', readChars: -1, totalChars: 10 }],
	}), RangeError);
	assert.throws(() => buildCompleteness({
		returned: 1, basis: 'doc-index', partlyRead: [{ what: 'a.md', readChars: 2_000, totalChars: 1_999 }],
	}), /totalChars 1999 of a\.md is below the 2000 characters read/);
	// An unknown full length is not a contradiction.
	assert.equal(buildCompleteness({
		returned: 1, basis: 'doc-index', partlyRead: [{ what: 'a.md', readChars: 2_000, totalChars: null }],
	}).complete, false);
});

test('buildCompleteness accepts several reached limits and a per-group limit below the returned count', () => {
	// data-model.trace's shape: 4 targets overall, 12 fields and 6 callers for EACH target.
	const c = buildCompleteness({
		returned: 4, basis: 'graph',
		limited: [
			{ what: 'targets',            limit: 4,  scope: 'overall',   reason: 'target limit' },
			{ what: 'fields per target',  limit: 12, scope: 'per-group', reason: 'field limit' },
			{ what: 'callers per target', limit: 6,  scope: 'per-group', reason: 'caller limit' },
		],
	});
	// 4 targets were returned: at the overall limit, and below both per-group limits' counts.
	assert.equal(c.limited?.length, 3);
	assert.equal(c.complete, false);
	assert.equal(c.total, null);

	// 48 fields returned is above the per-group limit of 12: not a contradiction.
	const fields = buildCompleteness({
		returned: 48, basis: 'graph',
		limited: [{ what: 'fields per target', limit: 12, scope: 'per-group', reason: 'field limit' }],
	});
	assert.equal(fields.returned, 48);
	assert.equal(fields.complete, false);
});

test("a limit on a result's sources is not compared with the returned count", () => {
	// Fifteen sections were read and forty constraints came out of them.
	const c = buildCompleteness({
		returned: 40, basis: 'doc-index',
		limited: [{ what: 'document sections', limit: 15, scope: 'source', reason: 'section limit' }],
	});
	assert.equal(c.complete, false);
	assert.equal(c.total, null);
	const reason = deriveAnswerReport([{ sourceId: 'e1', sourceKind: 'lookup', completeness: c }]).completeness.incomplete[0]!.reason;
	assert.equal(reason, 'limit of 15 document sections read reached (section limit)');
});

test('an overall limit is compared with the returned count even beside per-group limits', () => {
	assert.throws(() => buildCompleteness({
		returned: 48, basis: 'graph',
		limited: [
			{ what: 'targets',           limit: 4,  scope: 'overall',   reason: 'target limit' },
			{ what: 'fields per target', limit: 12, scope: 'per-group', reason: 'field limit' },
		],
	}), /overall limit 4 on targets/);
});

// --- deriveAnswerReport ------------------------------------------------------

test('deriveAnswerReport: all complete, one incomplete, one failed, and a source with neither is rejected', () => {
	const allComplete = deriveAnswerReport([
		{ sourceId: 'e1', sourceKind: 'lookup', completeness: buildCompleteness({ returned: 2, basis: 'text' }) },
		{ sourceId: 'e2', sourceKind: 'lookup', completeness: buildCompleteness({ returned: 0, basis: 'text' }) },
	]);
	assert.deepEqual(allComplete, { completeness: { complete: true, incomplete: [], failed: [] } });

	// One incomplete: its reason is composed from limited, skipped AND partlyRead.
	const incomplete = deriveAnswerReport([
		{ sourceId: 'e1', sourceKind: 'lookup', completeness: buildCompleteness({ returned: 2, basis: 'text' }) },
		{
			sourceId: 'e2', sourceKind: 'lookup',
			completeness: buildCompleteness({
				returned: 200, basis: 'text',
				limited:    [{ what: 'hits', limit: 200, scope: 'overall', reason: 'hit limit' }],
				skipped:    [{ what: 'big.bin', reason: 'too-large' }],
				partlyRead: [
					{ what: 'a.ts:9', readChars: 500, totalChars: 1_800 },
					{ what: 'b.md',   readChars: 2_000, totalChars: null, totalNote: 'file changed since it was indexed' },
				],
			}),
		},
	]);
	assert.equal(incomplete.completeness.complete, false);
	assert.deepEqual(incomplete.completeness.incomplete.map(n => n.sourceId), ['e2']);
	const reason = incomplete.completeness.incomplete[0]!.reason;
	assert.match(reason, /limit of 200 hits reached/);
	assert.match(reason, /skipped big\.bin \(too-large\)/);
	assert.match(reason, /a\.ts:9 \(500 of 1800 characters\)/);
	assert.match(reason, /b\.md \(2000 of an unknown length \(file changed since it was indexed\) characters\)/);

	// A per-group limit reads as a limit on each group.
	const perGroup = deriveAnswerReport([{
		sourceId: 'e1', sourceKind: 'lookup',
		completeness: buildCompleteness({
			returned: 30, basis: 'graph',
			limited: [{ what: 'fields per target', limit: 12, scope: 'per-group', reason: 'field limit' }],
		}),
	}]);
	assert.match(perGroup.completeness.incomplete[0]!.reason, /limit of 12 fields per target each reached/);

	// A record that is incomplete without a limit, a skip or a cut still gets a reason.
	const unknown = deriveAnswerReport([{
		sourceId: 'e1', sourceKind: 'lookup',
		completeness: buildCompleteness({ returned: 1, basis: 'model-directed', notEstablished: true, basisNote: 'a model chose the search' }),
	}]);
	assert.equal(unknown.completeness.incomplete[0]!.reason, 'completeness could not be established: a model chose the search');

	// One failed: a failed source is never counted as complete, and it needs no record.
	const failed = deriveAnswerReport([
		{ sourceId: 'e1', sourceKind: 'lookup', completeness: buildCompleteness({ returned: 2, basis: 'text' }) },
		{ sourceId: 't3', sourceKind: 'plan-task', failure: 'grep failed: EACCES' },
	]);
	assert.equal(failed.completeness.complete, false);
	assert.deepEqual(failed.completeness.failed, [{ sourceId: 't3', sourceKind: 'plan-task', reason: 'grep failed: EACCES' }]);
	assert.deepEqual(failed.completeness.incomplete, []);

	// Neither a record nor a failure: rejected, not counted as complete.
	const silent: ReportSource[] = [{ sourceId: 'e9', sourceKind: 'lookup' }];
	assert.throws(() => deriveAnswerReport(silent), (err: unknown) =>
		err instanceof RangeError && /lookup e9 has neither a completeness record nor a failure/.test(err.message));

	assert.deepEqual(deriveAnswerReport([]).completeness, { complete: true, incomplete: [], failed: [] });
});

// --- renderCompletenessLine --------------------------------------------------

test('renderCompletenessLine names every incomplete and failed source and repeats a shared basis note once', () => {
	assert.equal(renderCompletenessLine(deriveAnswerReport([
		{ sourceId: 'e1', sourceKind: 'lookup', completeness: buildCompleteness({ returned: 2, basis: 'text' }) },
	])), 'Complete.');

	const report = deriveAnswerReport([
		{ sourceId: 'e1', sourceKind: 'lookup', completeness: complete({ basisNote: GRAPH_NOTE }) },
		{ sourceId: 'e2', sourceKind: 'lookup', completeness: complete({
			basisNote: GRAPH_NOTE,
			limited: [{ what: 'callers', limit: 3, scope: 'overall', reason: 'caller limit' }],
		}) },
		{ sourceId: 'e3', sourceKind: 'lookup', completeness: complete({
			basisNote: GRAPH_NOTE, skipped: [{ what: 'x.ts', reason: 'unreadable' }],
		}) },
		{ sourceId: 'e4', sourceKind: 'lookup', failure: 'store closed' },
		{ sourceId: 'e5', sourceKind: 'lookup', failure: 'timeout' },
	]);
	const line = renderCompletenessLine(report);
	assert.equal(line.includes('\n'), false, 'one line');
	assert.match(line, /^Incomplete: /);
	for (const id of ['e2', 'e3', 'e4', 'e5']) assert.ok(line.includes(`${id} — `), `names ${id}`);
	assert.equal(line.includes('e1 — '), false, 'a complete source is not named');
	assert.match(line, /2 incomplete: /);
	assert.match(line, /2 failed: e4 — store closed \| e5 — timeout/);
	assert.equal(line.split(GRAPH_NOTE).length - 1, 1, 'the shared basis note is written once');

	// Complete, with a note the answer rests on.
	const noted = renderCompletenessLine(deriveAnswerReport([
		{ sourceId: 'e1', sourceKind: 'lookup', completeness: complete({ basisNote: GRAPH_NOTE }) },
		{ sourceId: 'e2', sourceKind: 'lookup', completeness: complete({ basisNote: GRAPH_NOTE }) },
	]));
	assert.equal(noted, `Complete. Note: ${GRAPH_NOTE}`);

	// A failed answer step is never 'Complete.', even over complete sources.
	const base = deriveAnswerReport([
		{ sourceId: 'e1', sourceKind: 'lookup', completeness: buildCompleteness({ returned: 2, basis: 'text' }) },
	]);
	assert.equal(
		renderCompletenessLine({ ...base, answerFailure: 'model-failed' }),
		'Incomplete: the answer could not be written (model-failed).',
	);
});

test('the completeness line is one line even when a reason, a source id or a note spans lines; the report keeps them as given', () => {
	const report: AnswerReport = {
		completeness: {
			complete:   false,
			incomplete: [{ sourceId: 'search.text [e1]', sourceKind: 'lookup', reason: 'limit of 5 hits reached\n(the search stops\tat 5 hits)' }],
			failed:     [{ sourceId: 'symbol.locate\n[e2]', sourceKind: 'lookup', reason: 'claude exited with 1.\r\nstderr:\n  overloaded\n' }],
			basisNotes: ['first note\nsecond line'],
		},
		answerFailure: 'the model call failed:\n  timeout',
	};
	const line = renderCompletenessLine(report);
	assert.equal(/[\r\n\t]/.test(line), false, JSON.stringify(line));
	assert.equal(line,
		'Incomplete: the answer could not be written (the model call failed: timeout). '
		+ '1 incomplete: search.text [e1] — limit of 5 hits reached (the search stops at 5 hits). '
		+ '1 failed: symbol.locate [e2] — claude exited with 1. stderr: overloaded. Note: first note second line');
	// Only the line is flattened.
	assert.equal(report.completeness.failed[0]?.reason, 'claude exited with 1.\r\nstderr:\n  overloaded\n');

	const complete: AnswerReport = { completeness: { complete: true, incomplete: [], failed: [], basisNotes: ['a\nb'] } };
	assert.equal(renderCompletenessLine(complete), 'Complete. Note: a b');
});
