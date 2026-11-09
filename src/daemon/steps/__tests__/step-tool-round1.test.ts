/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Review round 1 of Story s3 on the step tool's answer progress: a single-mode reply is a finished answer, a failure
 * keeps the report derived from the lookups, and a turn that does not fit as rendered is a typed failure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { prepareAnswerTurn } from '../analyze-step/answer-turn.js';
import { admitTurn, applyReply, recordInvalid, startAnswerProgress } from '../../../analyze/context/answer-progress.js';
import type { AnswerProgress } from '../../../analyze/context/answer-progress.js';
import { finalizeSynthesize } from '../../../analyze/context/synthesizer.js';
import { HandlingBudgetError, ShaperAnswerStepFailedError } from '../../../analyze/context/answer-step-error.js';
import { RequestLifetime } from '../../request-context.js';
import { sessionConnectionExecution } from '../../../shared/step-context.js';
import { buildCompleteness } from '../../../analyze/completeness.js';
import type { ExecutedExploration, ExecutedPlan } from '../../../analyze/explore/types.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';

const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });
const LAYERS = { system: 'sys', focus: 'f', summary: 'a summary', structure: 'st', surface: 'su', artefacts: 'a', upstream: '' };

function search(id: string, size: number): ExecutedExploration {
	return {
		exploration: { id, type: 'search.text', purpose: 'p', params: {} },
		output: { completeness: WHOLE, type: 'search.text', hits: [{ file: `src/${id}.ts`, line: 1, snippet: `code ${'c'.repeat(size)}` }] },
		cached: false, elapsedMs: 1,
	} as unknown as ExecutedExploration;
}
const failedLookup = (id: string): ExecutedExploration => ({
	exploration: { id, type: 'search.text', purpose: 'p', params: {} },
	output: { type: 'failed', requested: 'search.text', errorCode: 'runtime-error', message: 'the search broke' }, cached: false, elapsedMs: 1,
} as unknown as ExecutedExploration);
const plan = (results: ExecutedExploration[]): ExecutedPlan =>
	({ plan: { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: results.map(r => r.exploration) }, results, totalMs: 1, totalCached: 0 }) as unknown as ExecutedPlan;
const intent: ClassifiedIntent = { target: 'code', scope: 'S', focused: true, focus: 'f', scopeRef: { kind: 'repo', value: '/work/app' }, reasoning: 'r' };

test('a single-mode reply is a finished answer carrying how it was handled', () => {
	const executed = plan([search('e1', 100)]);
	const progress = startAnswerProgress({ intent, executed, target: 'code' }, 'S');
	assert.equal(progress.mode, 'single');
	const done = finalizeSynthesize(LAYERS, undefined, progress, { executed });
	assert.equal(done.kind, 'final');
	if (done.kind === 'final') {
		assert.deepEqual(done.layers, LAYERS);
		assert.equal(done.handling.method, 'single-pass');
	}
});

test('the failure of a divided answer keeps the report derived from the lookups, not a complete one', () => {
	const executed = plan([failedLookup('e1'), search('e2', 40_000), search('e3', 40_000)]);
	const progress = startAnswerProgress({ intent, executed, target: 'code' }, 'XL');
	assert.equal(progress.mode, 'partitioned');
	assert.ok(progress.parts.length >= 2, 'the evidence is divided');
	let current: AnswerProgress = progress;
	let thrown: unknown;
	for (let i = 0; i < progress.parts.length + 1 && thrown === undefined; i++) {
		try {
			const out = recordInvalid(current, 'not a bundle', 1, { executed });
			if (out.kind !== 'next') break;
			current = out.progress;
		} catch (e) { thrown = e; }
	}
	assert.ok(thrown instanceof ShaperAnswerStepFailedError, String(thrown));
	assert.equal(thrown.found.report.completeness.complete, false, 'the failed lookup is in the report');
	assert.ok(thrown.partFailures?.length === progress.parts.length, 'every part is named');
});

test('a turn that does not fit as rendered is not covered and the answer goes on with what was completed', () => {
	const executed = plan([search('e1', 40_000), search('e2', 40_000), search('e3', 40_000)]);
	const progress = startAnswerProgress({ intent, executed, target: 'code' }, 'XL');
	assert.equal(progress.mode, 'partitioned');
	assert.ok(progress.limit !== undefined);
	const args = { intent, executed, target: 'code' } as const;
	const first = admitTurn(progress, args);
	assert.equal(first.kind, 'turn');
	assert.equal(first.kind === 'turn' ? first.turn.kind : '', 'part', 'the planned turn is admitted');

	// The first part is answered; the limit then shrinks so the next part cannot be rendered into a turn that fits.
	const second = applyReply(progress, { ...LAYERS, summary: 'covers the first part' }, { executed });
	assert.equal(second.kind, 'next');
	if (second.kind !== 'next' || second.progress.limit === undefined) return;
	assert.equal(second.progress.completed.length, 1);
	const squeezed: AnswerProgress = { ...second.progress, limit: { ...second.progress.limit, limit: 100 } };
	const after = admitTurn(squeezed, args);
	// Every later part is skipped; the first part's findings are the answer, with the rest named as not covered.
	assert.equal(after.kind, 'final');
	if (after.kind !== 'final') return;
	assert.equal(after.handling.method, 'partitioned');
	assert.ok(after.handling.notCovered.length >= 1, 'the parts that did not fit are named');
	assert.ok(after.layers.structure.length > 0 || after.layers.summary.length > 0, 'the completed part is kept');

	// With nothing completed, a turn that does not fit is the typed failure.
	assert.throws(() => admitTurn({ ...progress, limit: { ...progress.limit!, limit: 100 } }, args), ShaperAnswerStepFailedError);
});

test('a reply is validated under the request\'s own connection execution: a temporary request is told only that the reply is invalid', () => {
	const execution = sessionConnectionExecution(
		Object.freeze({ sessionHandle: 'h', lookupRoot: '/work/app', daemonEpoch: 'e' }) as never,
		{ bindingId: 'b', audience: 'analysis' as never, controlGeneration: 1, lifetime: new RequestLifetime(), assertActive: () => {} },
	);
	const executed = plan([search('e1', 40_000), search('e2', 40_000)]);
	const progress = startAnswerProgress({ intent, executed, target: 'code' }, 'XL');
	assert.equal(progress.mode, 'partitioned');
	const bad = { ...LAYERS, structure: 42 };
	assert.throws(() => applyReply(progress, bad, { executed }, execution), /Structured output did not match the schema\./);
	assert.equal(applyReply(progress, LAYERS, { executed }, execution).kind, 'next');
	// A forged execution is refused: the validation really runs under the one it is given.
	assert.throws(() => applyReply(progress, LAYERS, { executed }, { mode: 'session-memory' } as never), /session-expired|expired/i);
	// The single-reply path takes the same execution.
	const single = startAnswerProgress({ intent, executed: plan([search('e1', 10)]), target: 'code' }, 'S');
	assert.throws(() => finalizeSynthesize(bad, execution, single), /Structured output did not match the schema\./);
});

test('a single-pass prompt that is too large as rendered (a long purpose) is answered in parts, not returned over the limit', () => {
	const big = search('e1', 100);
	(big.exploration as { purpose: string }).purpose = 'p'.repeat(70_000);
	const executed = plan([big]);
	const turn = prepareAnswerTurn({ intent, executed, target: 'code' });
	assert.ok(turn.ok);
	if (!turn.ok) return;
	assert.equal(turn.progress.mode, 'partitioned');
	assert.equal(turn.prepared.kind, 'part');
});

test('naturally sectioned evidence next to a reference fits every turn: no part is skipped for the reference wrapper', () => {
	const rule = {
		exploration: { id: 'e0', type: 'doc.constraint.enumerate', purpose: 'p', params: {} }, cached: false, elapsedMs: 1,
		output: { type: 'doc.constraint.enumerate', subject: 's', notFoundNote: '', retrievedSectionCount: 1, completeness: WHOLE,
			constraints: [{ constraint: 'The daemon owns every handle.', kind: 'must', sourceEntityId: 'ent-1', file: 'docs/r.md', heading: 'Rule', rationale: 'why' }] },
	} as unknown as ExecutedExploration;
	const executed = plan([rule, search('e1', 130_000)]);
	const args = { intent, executed, target: 'adherence' } as const;
	let progress = startAnswerProgress(args, 'XL');
	assert.equal(progress.mode, 'partitioned');
	assert.ok(progress.parts.length >= 3, 'the evidence is cut into several sections');
	for (let i = 0; i < progress.parts.length; i++) {
		const admitted = admitTurn(progress, args);
		assert.equal(admitted.kind, 'turn');
		if (admitted.kind !== 'turn') return;
		assert.equal(admitted.progress.failures.length, 0, `part ${i + 1} was not skipped`);
		const next = applyReply(admitted.progress, { ...LAYERS, summary: `covers part ${i + 1}` }, { executed });
		if (next.kind === 'next') progress = next.progress;
		else return;
		if (progress.pending?.kind === 'combine') break;
	}
});

test('an M request with only rules is answered in one reply, and one that packs into a single part keeps the partitioned handling', async () => {
	const rule = (id: string, i: number) => ({
		exploration: { id, type: 'doc.constraint.enumerate', purpose: 'p', params: {} }, cached: false, elapsedMs: 1,
		output: { type: 'doc.constraint.enumerate', subject: 's', notFoundNote: '', retrievedSectionCount: 1, completeness: WHOLE,
			constraints: [{ constraint: `Rule ${i}.`, kind: 'must', sourceEntityId: `ent-${i}`, file: `docs/r${i}.md`, heading: 'Rule', rationale: 'why' }] },
	}) as unknown as ExecutedExploration;
	const onlyRules = plan(Array.from({ length: 3 }, (_, i) => rule(`e${i}`, i)));
	const single = prepareAnswerTurn({ intent: { ...intent, scope: 'M' }, executed: onlyRules, target: 'adherence' });
	assert.ok(single.ok);
	if (single.ok) { assert.equal(single.progress.mode, 'single'); assert.equal(single.prepared.kind, undefined); }

	const oneBlock = plan([rule('e0', 0), search('e1', 100)]);
	const part = prepareAnswerTurn({ intent: { ...intent, scope: 'M' }, executed: oneBlock, target: 'adherence' });
	assert.ok(part.ok);
	if (part.ok) { assert.equal(part.progress.mode, 'partitioned'); assert.equal(part.prepared.kind, 'part'); }
});

test('the three-argument finish of a partitioned adherence answer still states the rules counted from every lookup', () => {
	const rule = {
		exploration: { id: 'e0', type: 'doc.constraint.enumerate', purpose: 'p', params: {} }, cached: false, elapsedMs: 1,
		output: { type: 'doc.constraint.enumerate', subject: 's', notFoundNote: '', retrievedSectionCount: 2, completeness: WHOLE,
			constraints: [
				{ constraint: 'Rule one.', kind: 'must', sourceEntityId: 'a', file: 'docs/a.md', heading: 'A', rationale: 'w' },
				{ constraint: 'Rule two.', kind: 'must', sourceEntityId: 'b', file: 'docs/b.md', heading: 'B', rationale: 'w' },
			] },
	} as unknown as ExecutedExploration;
	const executed = plan([rule, search('e1', 100)]);
	const progress = startAnswerProgress({ intent, executed, target: 'adherence' }, 'M');
	assert.equal(progress.mode, 'partitioned');
	const done = finalizeSynthesize({ ...LAYERS, summary: 'covers it' }, undefined, progress);
	assert.equal(done.kind, 'final');
	if (done.kind === 'final') {
		assert.match(done.layers.focus, /Rule sources checked \(counted from every lookup\): 2/);
		assert.ok(done.layers.focus.includes('Rule one.') && done.layers.focus.includes('Rule two.'));
	}
});

test('the cause of an invalid part survives the stored progress and the terminal failure with its exact content', () => {
	const executed = plan([failedLookup('e1'), search('e2', 40_000), search('e3', 40_000)]);
	let current: AnswerProgress = startAnswerProgress({ intent, executed, target: 'code' }, 'XL');
	assert.equal(current.mode, 'partitioned');
	const parts = current.parts.length;
	let thrown: unknown;
	for (let i = 0; i < parts + 1 && thrown === undefined; i++) {
		// Each turn's progress is stored as JSON between calls, as the step tool does.
		current = JSON.parse(JSON.stringify(current)) as AnswerProgress;
		try {
			const out = recordInvalid(current, `part ${i + 1} reply was not a bundle`, 1, { executed });
			if (out.kind !== 'next') break;
			current = out.progress;
		} catch (e) { thrown = e; }
	}
	assert.ok(thrown instanceof ShaperAnswerStepFailedError, String(thrown));
	assert.equal(thrown.partFailures?.length, parts);
	thrown.partFailures?.forEach((f, i) => {
		assert.equal(f.kind, 'invalid-reply');
		assert.deepEqual(f.cause, { name: 'Error', message: `part ${i + 1} reply was not a bundle` }, 'the cause keeps its name and message');
	});
});

test('a combine turn that stays invalid is asked again, then falls back to the parts with combine not covered', () => {
	const executed = plan([search('e1', 40_000), search('e2', 40_000)]);
	let progress = startAnswerProgress({ intent, executed, target: 'code' }, 'XL');
	assert.equal(progress.mode, 'partitioned');
	// Answer every part; the answer then asks for the combine.
	for (let i = 0; i < progress.parts.length; i++) {
		const next = applyReply(progress, { ...LAYERS, summary: `covers part ${i + 1}`, structure: `- finding of part ${i + 1}` }, { executed });
		assert.equal(next.kind, 'next');
		if (next.kind !== 'next') return;
		progress = next.progress;
	}
	assert.equal(progress.pending?.kind, 'combine');
	// The first invalid reply asks the same turn again; the second (the bound) ends the combine.
	const again = recordInvalid(progress, 'not a narrative', 2, { executed });
	assert.equal(again.kind, 'retry');
	if (again.kind !== 'retry') return;
	assert.equal(again.progress.pending?.kind, 'combine');
	const done = recordInvalid(again.progress, 'still not a narrative', 2, { executed });
	assert.equal(done.kind, 'final');
	if (done.kind !== 'final') return;
	assert.ok(done.handling.notCovered.some(n => n.part === 'combine'), 'the combine is named as not covered');
	for (let i = 0; i < progress.parts.length; i++) assert.ok(done.layers.structure.includes(`- finding of part ${i + 1}`), `part ${i + 1} is kept`);
});
