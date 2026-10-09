/**
 * The step tool reports a missing answer prompt with what its lookups found
 * (LLD-b9d5c5c40df5a574-s1, task t15).
 *
 * The plan and the narrow phase each prepare the answer-writing turn after
 * their lookups ran. That preparation loads the answer prompt; when the file
 * is missing the phase used to throw, and the executed results were lost.
 *
 * Both phases are driven through their own handlers, on a state as the tool
 * mints it, against a temporary graph and repository.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { renderCompletenessLine } from '../../analyze/completeness.js';
import { _setSynthesizerPromptPathForTest } from '../../analyze/context/synthesizer.js';
import { reportFromLookups } from '../../analyze/explore/answer-report.js';
import { measureLookupResults } from '../../analyze/measure.js';
import { stepPlan } from '../../analyze/explore/executor.js';
import type { Exploration, ExplorationPlan } from '../../analyze/explore/types.js';
import { getDb } from '../../db/client.js';
import { upsertEntities } from '../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { addRepo } from '../../db/repos.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';
import type { Entity, EntityKind } from '../../shared/types.js';
import { handleAnalyzeStep } from '../analyze-step/handler.js';
import { handleNarrow } from '../analyze-step/phases/narrow.js';
import { handlePlan } from '../analyze-step/phases/plan.js';
import { encodeState, STATE_VERSION, type StepStatePayload } from '../analyze-step/state.js';
import type { StepInputNarrow, StepInputPlan, StepOutputError } from '../analyze-step/types.js';

const NOW = '2026-10-08T10:00:00.000Z';
const INDEXED_AT = 1_790_000_000_000;

let dir: string;
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
/** A lookup that cannot run: its output is 'failed', so the report is not complete. */
const E_BAD:     Exploration = { id: 'e3', type: 'doc.constraint.enumerate', purpose: 'rules', params: { subject: '' } };

function intent(): ClassifiedIntent {
	return { target: 'code', scope: 'M', focused: true, focus: 'refund rules', scopeRef: { kind: 'workspace', value: REPO }, reasoning: 'test' };
}

/** The state the tool holds while it waits for the agent's plan. */
function awaitingPlan(): string {
	const payload: StepStatePayload = {
		version: STATE_VERSION, runId: 'r1', repoPath: REPO, repoIndexedAt: INDEXED_AT,
		intent: intent(), synthesizerKey: 'code', stage: 'awaiting_plan',
	};
	return encodeState(payload);
}

/** Run the plan to its pause and mint the state the tool would hold there. */
async function awaitingNarrow(p: ExplorationPlan): Promise<string> {
	const step = await stepPlan({ runId: 'r1', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: BigInt(INDEXED_AT), plan: p });
	if (step.kind !== 'pending') throw new Error('the plan should pause on its lookup that needs a model call');
	const payload: StepStatePayload = {
		version: STATE_VERSION, runId: 'r1', repoPath: REPO, repoIndexedAt: INDEXED_AT,
		intent: intent(), synthesizerKey: 'adherence', plan: p, stage: 'awaiting_narrow',
		narrow: { explorationId: step.explorationId, explorationType: step.explorationType, preparedBlob: step.preparedBlob, resumeState: step.resumeState },
	};
	return encodeState(payload);
}

const VALID_ANSWER = { subject: 'refund', constraints: [], notFoundNote: 'none found' };
const PLAN_NO_MODEL: ExplorationPlan = { answerType: 'how-does-it-work', synthesisHint: 'h', explorations: [E_CONCEPT, E_BAD] };
const PLAN_WITH_MODEL: ExplorationPlan = { answerType: 'adherence-check', synthesisHint: 'h', explorations: [E_DOC, E_CONCEPT, E_BAD] };

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-step-prompt-')));
	REPO = join(dir, 'repo');
	MISSING = join(dir, 'no-such-prompt.md');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
	write('docs/policy.md', '## Refund policy\n\nRefunds MUST be issued within 30 days.\n');
	write('src/pay/index.ts', 'export const pay = 1;\n');
	await upsertEntities(await getDb(), [
		ent('section', 'Refund policy', 'docs/policy.md', { language: 'markdown', artifact: true, body: '## Refund policy\n\nRefunds MUST be issued within 30 days.' }),
		ent('file', 'index.ts', 'src/pay/index.ts'),
	]);
});

test.afterEach(async () => {
	_setSynthesizerPromptPathForTest('code', undefined);
	_setSynthesizerPromptPathForTest('adherence', undefined);
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

/** What a missing-prompt error must hold for the lookups of one plan. */
function assertCarriesFindings(out: StepOutputError, ids: readonly string[]): void {
	assert.equal(out.next, 'error');
	assert.equal(out.error.code, 'answer-prompt-missing');
	assert.equal(out.error.retryable, false, 'the file is still missing on the next call');
	const data = out.error.data;
	assert.ok(data !== undefined, 'the error carries what the lookups found');
	assert.deepEqual(data.results.map(r => r.exploration.id), ids);
	assert.equal(data.results.find(r => r.exploration.id === 'e2')?.output.type, 'concept.resolve');
	assert.equal(data.results.find(r => r.exploration.id === 'e3')?.output.type, 'failed');
	// The report is the one derived from those results, and names the failed lookup.
	assert.deepEqual(data.report, reportFromLookups(data.results, measureLookupResults(data.results)));
	assert.equal(data.report.completeness.complete, false);
	assert.deepEqual(data.report.completeness.failed.map(f => f.sourceId), ['doc.constraint.enumerate [e3]']);
	// The message starts with the completeness line and names the missing file.
	assert.equal(out.error.message.split('\n')[0], renderCompletenessLine(data.report));
	assert.match(out.error.message.split('\n')[0] ?? '', /^Incomplete: .*doc\.constraint\.enumerate \[e3\]/);
	assert.ok(out.error.message.includes(MISSING), out.error.message);
}

test('a missing answer prompt after the lookups ran returns a non-retryable error with the results and the report, from the plan phase and from the narrow phase', async () => {
	// With the prompt present both phases reach the answer-writing turn.
	const planOk = await handlePlan({ phase: 'plan', plan: PLAN_NO_MODEL, state: awaitingPlan() } as StepInputPlan);
	assert.equal(planOk.next, 'emit_bundle');
	const narrowToken = await awaitingNarrow(PLAN_WITH_MODEL);
	const narrowOk = await handleNarrow({ phase: 'narrow', explorationId: 'e1', narrow: VALID_ANSWER, state: narrowToken } as unknown as StepInputNarrow);
	assert.equal(narrowOk.next, 'emit_bundle');

	// Plan phase: every lookup of the plan ran in this call; then the prompt is found missing.
	_setSynthesizerPromptPathForTest('code', MISSING);
	const fromPlan = await handlePlan({ phase: 'plan', plan: PLAN_NO_MODEL, state: awaitingPlan() } as StepInputPlan);
	assertCarriesFindings(fromPlan as StepOutputError, ['e2', 'e3']);

	// Narrow phase: the agent's answer finished the plan; then the prompt is found missing.
	_setSynthesizerPromptPathForTest('adherence', MISSING);
	// (A different subject: the answer given above is in the lookup cache, and a cached lookup does not pause.)
	const again: ExplorationPlan = { ...PLAN_WITH_MODEL, explorations: [{ ...E_DOC, params: { subject: 'refund policy' } }, E_CONCEPT, E_BAD] };
	const fromNarrow = await handleNarrow({ phase: 'narrow', explorationId: 'e1', narrow: { ...VALID_ANSWER, subject: 'refund policy' }, state: await awaitingNarrow(again) } as unknown as StepInputNarrow);
	assertCarriesFindings(fromNarrow as StepOutputError, ['e1', 'e2', 'e3']);
	const answered = (fromNarrow as StepOutputError).error.data!.results.find(r => r.exploration.id === 'e1');
	assert.equal(answered?.output.type, 'doc.constraint.enumerate', "the agent's answer is among the results");
});

test("the step tool's JSON output carries error.data, its message starts with the completeness line, and any other error has no data member", async () => {
	_setSynthesizerPromptPathForTest('code', MISSING);
	const envelope = await handleAnalyzeStep({ phase: 'plan', plan: PLAN_NO_MODEL, state: awaitingPlan() });
	const text = envelope.content[0]?.text ?? '';
	const out = JSON.parse(text) as StepOutputError;
	// The agent reads this JSON: the data arrives as part of it, with no rendering step.
	assertCarriesFindings(out, ['e2', 'e3']);
	assert.deepEqual(Object.keys(out.error).sort(), ['code', 'data', 'message', 'retryable']);

	// Errors of other kinds, from the plan phase, the narrow phase and the router.
	const others: StepOutputError[] = [];
	// A plan that fails its schema.
	others.push(await handlePlan({ phase: 'plan', plan: { answerType: 'how-does-it-work' }, state: awaitingPlan() } as unknown as StepInputPlan) as StepOutputError);
	// A state token that cannot be decoded.
	others.push(await handlePlan({ phase: 'plan', plan: PLAN_NO_MODEL, state: 'not-a-token' } as StepInputPlan) as StepOutputError);
	// An answer that fails its lookup's schema.
	others.push(await handleNarrow({ phase: 'narrow', explorationId: 'e1', narrow: { subject: 'refund' }, state: await awaitingNarrow(PLAN_WITH_MODEL) } as unknown as StepInputNarrow) as StepOutputError);
	// An answer for a lookup the tool is not waiting on.
	others.push(await handleNarrow({ phase: 'narrow', explorationId: 'e9', narrow: VALID_ANSWER, state: await awaitingNarrow(PLAN_WITH_MODEL) } as unknown as StepInputNarrow) as StepOutputError);
	// A phase called at the wrong stage, through the router.
	others.push(JSON.parse((await handleAnalyzeStep({ phase: 'narrow', explorationId: 'e1', narrow: VALID_ANSWER, state: awaitingPlan() })).content[0]?.text ?? '') as StepOutputError);

	assert.equal(others.length, 5);
	const codes = new Set<string>();
	for (const o of others) {
		assert.equal(o.next, 'error', JSON.stringify(o));
		assert.notEqual(o.error.code, 'answer-prompt-missing');
		assert.equal('data' in o.error, false, `${o.error.code} has no data member`);
		assert.deepEqual(Object.keys(o.error).sort(), ['code', 'message', 'retryable']);
		codes.add(o.error.code);
	}
	assert.ok(codes.size >= 3, `several kinds of error were exercised: ${[...codes].join(', ')}`);
});
