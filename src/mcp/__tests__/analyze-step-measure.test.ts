/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The step tool takes the measured size (LLD-b9d5c5c40df5a574-s2, task t7).
 *
 * The tool's phases are called as the agent calls them, one after another,
 * each with the state token the one before returned, over a sandboxed graph
 * store. The lookups are the real ones. No model: the agent's turns are
 * written here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { renderCompletenessLine, renderMeasureLine } from '../../analyze/completeness.js';
import { _setSynthesizerPromptPathForTest } from '../../analyze/context/synthesizer.js';
import { getNarrowRunner, _getRunnersForTest, _overrideRunnerForTest } from '../../analyze/explore/executor.js';
import type { Exploration, ExplorationPlan, ExplorationRunner } from '../../analyze/explore/types.js';
import { measureLookupResults } from '../../analyze/measure.js';
import { getDb } from '../../db/client.js';
import { upsertEntities } from '../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { addRepo } from '../../db/repos.js';
import type { AnalyzeScope } from '../../shared/analyze-types.js';
import type { Entity, EntityKind } from '../../shared/types.js';
import { handleBundle } from '../analyze-step/phases/bundle.js';
import { handleNarrow } from '../analyze-step/phases/narrow.js';
import { handlePlan } from '../analyze-step/phases/plan.js';
import { handleStart } from '../analyze-step/phases/start.js';
import { decodeState, encodeState, STATE_VERSION, type StepStatePayload } from '../analyze-step/state.js';
import type {
	StepInputBundle, StepInputNarrow, StepInputPlan, StepOutputDone, StepOutputEmitBundle, StepOutputEmitPlan, StepOutputError,
} from '../analyze-step/types.js';

const NOW = '2026-10-09T10:00:00.000Z';

let dir: string;
/** A registered repo of two files and three entities: it measures S (more than one file). */
let REPO: string;
let MISSING: string;

function ent(kind: EntityKind, name: string, rel: string, extra: Partial<Entity> = {}): Entity {
	const file = join(REPO, rel);
	const id = createHash('sha256').update(`${REPO}\x00${file}\x00${kind}\x00${name}`).digest('hex').slice(0, 32);
	return { id, kind, name, language: 'typescript', repoId: 1, repo: REPO, file, startLine: 1, endLine: 5, body: `// ${name}`, embedding: [], indexedAt: NOW, ...extra };
}
function write(rel: string, content: string): void {
	const p = join(REPO, rel);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, content);
}

const E_DOC:     Exploration = { id: 'e1', type: 'doc.constraint.enumerate', purpose: 'rules', params: { subject: 'refund' } };
const E_CONCEPT: Exploration = { id: 'e2', type: 'concept.resolve', purpose: 'where', params: { query: 'pay' } };
const PLAN_NO_MODEL: ExplorationPlan = { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: [E_CONCEPT] };
// (Another query than the plan above: a lookup answered before is served from the lookup cache and its runner is not called.)
const PLAN_WITH_MODEL: ExplorationPlan = { answerType: 'adherence-check', synthesisHint: 'h', explorations: [E_DOC, { ...E_CONCEPT, params: { query: 'index' } }] };
const VALID_ANSWER = { subject: 'refund', constraints: [], notFoundNote: 'none found' };
const LAYERS = { system: 's', focus: 'f', summary: 'sum', structure: 'st', surface: 'su', artefacts: 'a', upstream: 'u' };

/** The request size each run of the concept lookup was handed in its runner context. */
const handed: Array<AnalyzeScope | undefined> = [];
let realConceptRunner: ExplorationRunner | undefined;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-step-measure-')));
	REPO = join(dir, 'repo');
	MISSING = join(dir, 'no-such-prompt.md');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'ready' });
	write('docs/policy.md', '## Refund policy\n\nRefunds MUST be issued within 30 days.\n');
	write('src/pay/index.ts', 'export const pay = 1;\n');
	await upsertEntities(await getDb(), [
		ent('section', 'Refund policy', 'docs/policy.md', { language: 'markdown', artifact: true, body: '## Refund policy\n\nRefunds MUST be issued within 30 days.' }),
		ent('file', 'index.ts', 'src/pay/index.ts'),
		ent('function', 'pay', 'src/pay/index.ts'),
	]);
	// The real concept lookup, with what its runner context carried kept.
	handed.length = 0;
	realConceptRunner = _getRunnersForTest()['concept.resolve'];
	_overrideRunnerForTest('concept.resolve', async (exp, ctx) => { handed.push(ctx.requestSize); return realConceptRunner!(exp, ctx); });
});

test.afterEach(async () => {
	_overrideRunnerForTest('concept.resolve', realConceptRunner);
	_setSynthesizerPromptPathForTest('code', undefined);
	_setSynthesizerPromptPathForTest('adherence', undefined);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

/** The size the intent in a prompt's user turn carries. */
const sizeIn = (userTurn: string): string | undefined => /"scope": "(XS|S|M|L|XL)"/.exec(userTurn)?.[1];
const headOf = (text: string): string[] => text.split('\n').slice(0, 2);
/** The state token of a run just started with that stated size. */
const startedStating = async (scope: AnalyzeScope): Promise<string> =>
	(await handleStart({ phase: 'start', focus: 'how are refunds paid', repo: REPO, scope }) as StepOutputEmitPlan).state;

test("the step tool carries a caller's stated size in its state token from the start phase to the bundle phase and the answer turn, whose reports give the measured size with that hint; a token minted before the change still decodes", async () => {
	// --- start: the caller states L. The repo holds two files, which is S. ---
	const started = await handleStart({ phase: 'start', focus: 'how are refunds paid', repo: REPO, scope: 'L' }) as StepOutputEmitPlan;
	assert.equal(started.next, 'emit_plan');
	const atStart = decodeState(started.state);
	// The planning prompt is given the size of the named area, and the token keeps the stated size as a hint.
	assert.equal(atStart.intent.scope, 'S');
	assert.equal(sizeIn(started.userTurn), 'S');
	assert.equal(atStart.sizeHint, 'L');
	assert.equal(atStart.version, 2, "the state's version is not raised");
	assert.equal(STATE_VERSION, 2);

	// The area is counted through the registered repo that contains the path: started on a directory inside the
	// repo, the size is that directory's (one file: XS), not that of a path the index does not hold.
	const inner = await handleStart({ phase: 'start', focus: 'how are refunds paid', repo: join(REPO, 'src'), scope: 'L' }) as StepOutputEmitPlan;
	assert.equal(decodeState(inner.state).intent.scope, 'XS');

	// With no size stated: the same measured size (no default of M), and no hint in the token.
	const unstated = await handleStart({ phase: 'start', focus: 'how are refunds paid', repo: REPO }) as StepOutputEmitPlan;
	assert.equal(decodeState(unstated.state).intent.scope, 'S');
	assert.equal(sizeIn(unstated.userTurn), 'S');
	assert.ok(!('sizeHint' in decodeState(unstated.state)));

	// --- plan: the lookups run with the request's measured size in their runner context. ---
	const planned = await handlePlan({ phase: 'plan', plan: PLAN_NO_MODEL, state: started.state } as StepInputPlan) as StepOutputEmitBundle;
	assert.equal(planned.next, 'emit_bundle', JSON.stringify(planned).slice(0, 300));
	assert.deepEqual(handed, ['S']);
	const atBundle = decodeState(planned.state);
	assert.equal(atBundle.sizeHint, 'L', 'the hint is carried to the next token');
	// The answer turn is given the size measured from what the lookups returned, with the hint.
	const fromResults = measureLookupResults(atBundle.executed!.results, 'L');
	assert.equal(fromResults.source, 'lookup-results');
	assert.equal(fromResults.determined, true);
	assert.equal(fromResults.sizeHint, 'L');
	assert.equal(sizeIn(planned.userTurn), fromResults.size);
	// (That size is the results', not the named area's carried in the token and not the caller's.)
	assert.equal(fromResults.size, 'XS');
	assert.equal(atBundle.intent.scope, 'S');

	// --- bundle: the report carries that measure, and the answer's head its line. ---
	const done = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: planned.state } as StepInputBundle) as StepOutputDone;
	assert.equal(done.next, 'done');
	assert.deepEqual(done.report?.measure, fromResults);
	assert.deepEqual(headOf(done.markdown), [renderCompletenessLine(done.report!), renderMeasureLine(fromResults)]);
	assert.match(headOf(done.markdown)[1]!, /^Size: XS, measured from what the lookups returned: .* The caller asked for L\.$/);

	// --- the answer turn's own report, when the answer prompt is missing after the lookups ran. ---
	_setSynthesizerPromptPathForTest('code', MISSING);
	// (Each run starts again: a state token is given up when the next one is minted.)
	const failed = await handlePlan({ phase: 'plan', plan: PLAN_NO_MODEL, state: await startedStating('L') } as StepInputPlan) as StepOutputError;
	assert.equal(failed.error.code, 'answer-prompt-missing');
	assert.deepEqual(failed.error.data!.report.measure, measureLookupResults(failed.error.data!.results, 'L'));
	assert.equal(failed.error.data!.report.measure?.sizeHint, 'L');
	assert.deepEqual(headOf(failed.error.message), [renderCompletenessLine(failed.error.data!.report), renderMeasureLine(failed.error.data!.report.measure!)]);
	_setSynthesizerPromptPathForTest('code', undefined);

	// --- narrow: a plan that pauses for the agent carries the hint through the pause, and the lookups that run
	// after it are handed the request's size too. ---
	handed.length = 0;
	// (What a lookup that pauses for the agent is handed when it prepares its question.)
	const prepared: Array<AnalyzeScope | undefined> = [];
	const docLookup = getNarrowRunner('doc.constraint.enumerate')! as { prepare: NonNullable<ReturnType<typeof getNarrowRunner>>['prepare'] };
	const realPrepare = docLookup.prepare;
	docLookup.prepare = async (exp, ctx) => { prepared.push(ctx.requestSize); return realPrepare(exp, ctx); };
	let paused: Awaited<ReturnType<typeof handlePlan>>;
	try {
		paused = await handlePlan({ phase: 'plan', plan: PLAN_WITH_MODEL, state: await startedStating('L') } as StepInputPlan);
	} finally {
		docLookup.prepare = realPrepare;
	}
	assert.equal(paused.next, 'emit_narrow', JSON.stringify(paused).slice(0, 300));
	if (paused.next !== 'emit_narrow') return;
	assert.deepEqual(prepared, ['S']);
	assert.equal(decodeState(paused.state).sizeHint, 'L');
	assert.deepEqual(handed, [], 'the concept lookup has not run yet');
	const resumed = await handleNarrow({ phase: 'narrow', explorationId: 'e1', narrow: VALID_ANSWER, state: paused.state } as unknown as StepInputNarrow) as StepOutputEmitBundle;
	assert.equal(resumed.next, 'emit_bundle', JSON.stringify(resumed).slice(0, 300));
	assert.deepEqual(handed, ['S']);
	const afterNarrow = decodeState(resumed.state);
	assert.equal(afterNarrow.sizeHint, 'L');
	assert.equal(sizeIn(resumed.userTurn), measureLookupResults(afterNarrow.executed!.results, 'L').size);
	const narrowDone = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: resumed.state } as StepInputBundle) as StepOutputDone;
	assert.deepEqual(narrowDone.report?.measure, measureLookupResults(afterNarrow.executed!.results, 'L'));

	// A plan that pauses twice: the token of the second pause, minted by the narrow phase, carries the hint too.
	const twice: ExplorationPlan = { answerType: 'adherence-check', synthesisHint: 'h', explorations: [
		{ ...E_DOC, params: { subject: 'refund window' } }, { ...E_DOC, id: 'e2', params: { subject: 'refund days' } },
	] };
	const firstPause = await handlePlan({ phase: 'plan', plan: twice, state: await startedStating('L') } as StepInputPlan);
	assert.equal(firstPause.next, 'emit_narrow');
	if (firstPause.next !== 'emit_narrow') return;
	const secondPause = await handleNarrow({ phase: 'narrow', explorationId: 'e1', narrow: { ...VALID_ANSWER, subject: 'refund window' }, state: firstPause.state } as unknown as StepInputNarrow);
	assert.equal(secondPause.next, 'emit_narrow', JSON.stringify(secondPause).slice(0, 300));
	if (secondPause.next !== 'emit_narrow') return;
	assert.equal(decodeState(secondPause.state).sizeHint, 'L');

	// The narrow phase's own answer turn: with the answer prompt missing, its report's measure has the hint.
	_setSynthesizerPromptPathForTest('adherence', MISSING);
	const failedNarrow = await handleNarrow({ phase: 'narrow', explorationId: 'e2', narrow: { ...VALID_ANSWER, subject: 'refund days' }, state: secondPause.state } as unknown as StepInputNarrow) as StepOutputError;
	assert.equal(failedNarrow.error.code, 'answer-prompt-missing', JSON.stringify(failedNarrow).slice(0, 300));
	assert.deepEqual(failedNarrow.error.data!.report.measure, measureLookupResults(failedNarrow.error.data!.results, 'L'));
	assert.equal(failedNarrow.error.data!.report.measure?.sizeHint, 'L');
	_setSynthesizerPromptPathForTest('adherence', undefined);

	// --- a run with no stated size: the reports carry the measure with no hint. ---
	const plannedUnstated = await handlePlan({ phase: 'plan', plan: PLAN_NO_MODEL, state: unstated.state } as StepInputPlan) as StepOutputEmitBundle;
	const doneUnstated = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: plannedUnstated.state } as StepInputBundle) as StepOutputDone;
	const { sizeHint: _hint, ...withoutHint } = fromResults;
	assert.deepEqual(doneUnstated.report?.measure, withoutHint);
	assert.ok(!headOf(doneUnstated.markdown)[1]!.includes('The caller asked for'));

	// --- a token minted before the change: no `sizeHint` field. It decodes, and its phases work. ---
	const { sizeHint: _dropped, ...before } = atBundle;
	assert.ok(!('sizeHint' in before));
	const oldToken = encodeState(before as StepStatePayload);
	assert.deepEqual(decodeState(oldToken), before);
	const oldDone = await handleBundle({ phase: 'bundle', bundle: LAYERS, state: oldToken } as StepInputBundle) as StepOutputDone;
	assert.equal(oldDone.next, 'done');
	assert.deepEqual(oldDone.report?.measure, withoutHint);
});
