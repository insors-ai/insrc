/**
 * The step tool's path reports a lookup that cannot run as failed, the same
 * way the daemon's pipeline does (LLD-b9d5c5c40df5a574-s1, task t8).
 *
 * The narrow phase is driven through its own handler, on a state as the tool
 * mints it, against a temporary graph and repository.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { stepPlan } from '../../analyze/explore/executor.js';
import { getNarrowRunner } from '../../analyze/explore/index.js';
import type { Exploration, ExplorationOutput, ExplorationPlan, FailedExplorationOutput } from '../../analyze/explore/types.js';
import { getDb } from '../../db/client.js';
import { upsertEntities } from '../../db/entities.js';
import { getCachedExploration } from '../../db/exploration-cache.js';
import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { addRepo } from '../../db/repos.js';
import type { ClassifiedIntent } from '../../shared/analyze-types.js';
import type { Entity, EntityKind } from '../../shared/types.js';
import { handleNarrow } from '../analyze-step/phases/narrow.js';
import { decodeState, encodeState, STATE_VERSION, type StepStatePayload } from '../analyze-step/state.js';
import type { StepInputNarrow, StepOutputEmitBundle, StepOutputEmitNarrow, StepOutputError } from '../analyze-step/types.js';

const NOW = '2026-10-08T10:00:00.000Z';
const INDEXED_AT = 1_790_000_000_000;

let dir: string;
let REPO: string;

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
const E_CAP:     Exploration = { id: 'e1', type: 'capability.reuse-check', purpose: 'reuse', params: { capability: 'pay' } };

function plan(...explorations: Exploration[]): ExplorationPlan {
	return { answerType: 'adherence-check', synthesisHint: 'h', explorations };
}

function intent(): ClassifiedIntent {
	return { target: 'code', scope: 'M', focused: true, focus: 'refund rules', scopeRef: { kind: 'workspace', value: REPO }, reasoning: 'test' };
}

/** Run the plan to its first pause and mint the state the tool would hold there. */
async function pauseOn(p: ExplorationPlan, mutate?: (blob: unknown) => unknown): Promise<{ token: string; pause: NonNullable<StepStatePayload['narrow']> }> {
	const step = await stepPlan({ runId: 'r1', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: BigInt(INDEXED_AT), plan: p });
	assert.equal(step.kind, 'pending', 'the plan pauses on its lookup that needs a model call');
	if (step.kind !== 'pending') throw new Error('unreachable');
	const pause = {
		explorationId:   step.explorationId,
		explorationType: step.explorationType,
		preparedBlob:    mutate !== undefined ? mutate(step.preparedBlob) : step.preparedBlob,
		resumeState:     step.resumeState,
	};
	const payload: StepStatePayload = {
		version: STATE_VERSION, runId: 'r1', repoPath: REPO, repoIndexedAt: INDEXED_AT,
		intent: intent(), synthesizerKey: 'adherence', plan: p, narrow: pause, stage: 'awaiting_narrow',
	};
	return { token: encodeState(payload), pause };
}

function narrowInput(token: string, explorationId: string, narrow: unknown): StepInputNarrow {
	return { phase: 'narrow', explorationId, narrow, state: token } as unknown as StepInputNarrow;
}

/** The lookup outputs the tool holds after the narrow phase finished the plan. */
function executedOf(out: StepOutputEmitBundle): readonly { exploration: Exploration; output: ExplorationOutput }[] {
	const state = decodeState(out.state);
	assert.equal(state.stage, 'awaiting_bundle');
	return state.executed!.results;
}

const VALID_ANSWER = { subject: 'refund', constraints: [], notFoundNote: 'none found' };

test.beforeEach(async () => {
	await closeGraphStore();
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-step-failed-')));
	REPO = join(dir, 'repo');
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
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// prepare
// ---------------------------------------------------------------------------

test('stepPlan with a lookup whose prepare throws records the failed output and goes on to the next lookup (mutation: remove the conversion)', async () => {
	// An empty subject: the lookup's prepare throws before it retrieves anything.
	const bad: Exploration = { id: 'e1', type: 'doc.constraint.enumerate', purpose: 'rules', params: { subject: '' } };
	const step = await stepPlan({
		runId: 'r1', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: BigInt(INDEXED_AT),
		plan: plan(bad, E_CONCEPT),
	});

	// It used to throw out of stepPlan and abort the whole step call.
	assert.equal(step.kind, 'done');
	if (step.kind !== 'done') throw new Error('unreachable');
	const [first, second] = step.executed.results;
	assert.equal(first!.output.type, 'failed');
	assert.equal((first!.output as FailedExplorationOutput).requested, 'doc.constraint.enumerate');
	assert.match((first!.output as FailedExplorationOutput).message, /subject is required/);
	assert.equal(second!.output.type, 'concept.resolve', 'the plan went on to the next lookup');
	assert.equal(step.executed.results.length, 2);
});

// ---------------------------------------------------------------------------
// the agent's answer, and finalize
// ---------------------------------------------------------------------------

test("an agent's answer that fails the lookup's schema is rejected as retryable before finalize is called", async () => {
	// The prepared value is broken on purpose: if finalize WERE called it would
	// throw, and the lookup would be recorded as failed. A rejected answer must
	// never get that far.
	const { token } = await pauseOn(plan(E_DOC, E_CONCEPT), () => null);

	for (const answer of [
		{ subject: 'refund' },                                                   // required fields missing
		{ subject: 'refund', constraints: 'none', notFoundNote: '' },            // wrong type
		{ subject: 'refund', notFoundNote: '', constraints: [{ constraint: 'x', kind: 'sometimes', sourceEntityId: 'a', file: 'f', heading: 'h', rationale: '' }] },
		'not an object',
	]) {
		const out = await handleNarrow(narrowInput(token, 'e1', answer)) as StepOutputError;
		assert.equal(out.next, 'error', JSON.stringify(answer));
		assert.equal(out.error.code, 'narrow-finalize');
		assert.equal(out.error.retryable, true, 'the agent can correct its answer and retry with the same state');
		assert.match(out.error.message, /does not match its schema/);
	}
	// No answer at all is not acceptable to THIS lookup either.
	const none = await handleNarrow(narrowInput(token, 'e1', null)) as StepOutputError;
	assert.equal(none.error.code, 'narrow-finalize');
	assert.equal(none.error.retryable, true);

	// The state is still usable: the same token takes a corrected answer.
	const fixed = await handleNarrow(narrowInput(token, 'e1', VALID_ANSWER));
	assert.equal(fixed.next, 'emit_bundle');
});

test('a finalize that throws records the failed output and the run goes on', async () => {
	// A valid answer, and a prepared value finalize cannot use.
	const { token } = await pauseOn(plan(E_DOC, E_CONCEPT), () => null);

	const out = await handleNarrow(narrowInput(token, 'e1', VALID_ANSWER));
	// It used to be a retryable 'narrow-finalize' error that no retry could clear.
	assert.equal(out.next, 'emit_bundle', 'the run went on to the answer-writing turn');
	const results = executedOf(out as StepOutputEmitBundle);
	assert.deepEqual(results.map(r => r.exploration.id), ['e1', 'e2']);
	assert.equal(results[0]!.output.type, 'failed');
	assert.equal((results[0]!.output as FailedExplorationOutput).requested, 'doc.constraint.enumerate');
	assert.equal(results[1]!.output.type, 'concept.resolve', 'the next lookup ran');
	// The answer-writing turn is handed the failed output to state honestly.
	assert.match((out as StepOutputEmitBundle).userTurn, /"type":\s*"failed"/);
});

test('no answer at all to capability.reuse-check is accepted and gives a record that is not established', async () => {
	const { token, pause } = await pauseOn(plan(E_CAP));
	assert.equal(pause.explorationType, 'capability.reuse-check');
	assert.equal(getNarrowRunner('capability.reuse-check')!.acceptsNoAnswer, true);
	assert.equal(getNarrowRunner('doc.constraint.enumerate')!.acceptsNoAnswer, undefined);

	const out = await handleNarrow(narrowInput(token, 'e1', null));
	assert.equal(out.next, 'emit_bundle');
	const [cap] = executedOf(out as StepOutputEmitBundle);
	assert.equal(cap!.output.type, 'capability.reuse-check');
	const output = cap!.output as Extract<ExplorationOutput, { type: 'capability.reuse-check' }>;
	assert.ok(output.candidates.length > 0);
	assert.ok(output.candidates.every(c => c.verdict === 'unrelated'));
	assert.equal(output.completeness.complete, false);
	assert.match(output.completeness.basisNote ?? '', /No candidate was judged \(outer LLM returned no verdict payload\)/);

	// An answer that IS given is still checked.
	const { token: t2 } = await pauseOn(plan({ ...E_CAP, params: { capability: 'pay index' } }));
	const bad = await handleNarrow(narrowInput(t2, 'e1', { verdicts: 'none' })) as StepOutputError;
	assert.equal(bad.error.code, 'narrow-finalize');
	assert.equal(bad.error.retryable, true);
});

// ---------------------------------------------------------------------------
// the lookup cache
// ---------------------------------------------------------------------------

test('a finalize that throws, and a prepare that throws, leave no row in the lookup cache (mutation: store before the check)', async () => {
	// prepare throws
	const bad: Exploration = { id: 'e1', type: 'doc.constraint.enumerate', purpose: 'rules', params: { subject: '' } };
	await stepPlan({ runId: 'r1', repoPath: REPO, closureRepos: [REPO], repoLastIndexedAtMs: BigInt(INDEXED_AT), plan: plan(bad) });
	assert.equal(await getCachedExploration(REPO, BigInt(INDEXED_AT), bad), null, 'a failed prepare stored nothing');

	// finalize throws
	const { token } = await pauseOn(plan(E_DOC), () => null);
	const out = await handleNarrow(narrowInput(token, 'e1', VALID_ANSWER));
	assert.equal(executedOf(out as StepOutputEmitBundle)[0]!.output.type, 'failed');
	assert.equal(await getCachedExploration(REPO, BigInt(INDEXED_AT), E_DOC), null,
		'a failed output is never stored: it would be served to every later run');

	// A lookup that succeeds IS stored, under the same key, so the check above is not vacuous.
	const { token: ok } = await pauseOn(plan(E_DOC));
	await handleNarrow(narrowInput(ok, 'e1', VALID_ANSWER));
	const cached = await getCachedExploration(REPO, BigInt(INDEXED_AT), E_DOC);
	assert.equal(cached?.type, 'doc.constraint.enumerate');
});

// ---------------------------------------------------------------------------
// a state minted before the change
// ---------------------------------------------------------------------------

test('a step state minted before the change still resumes', async () => {
	// As the tool minted it before this Story: the prepared value has no
	// completeness facts, and the state carries no schema (it never did).
	const { token, pause } = await pauseOn(plan(E_DOC, E_CONCEPT), (blob) => {
		const { completenessFacts: _dropped, ...old } = blob as Record<string, unknown>;
		void _dropped;
		return old;
	});
	assert.deepEqual(Object.keys(pause.preparedBlob as object).sort(), ['retrievedSectionCount', 'subject', 'validEntityIds']);
	assert.deepEqual(Object.keys(pause).sort(), ['explorationId', 'explorationType', 'preparedBlob', 'resumeState']);

	const out = await handleNarrow(narrowInput(token, 'e1', VALID_ANSWER));
	assert.equal(out.next, 'emit_bundle', 'the run finishes');
	const [doc, concept] = executedOf(out as StepOutputEmitBundle);
	assert.equal(doc!.output.type, 'doc.constraint.enumerate');
	const record = (doc!.output as Extract<ExplorationOutput, { type: 'doc.constraint.enumerate' }>).completeness;
	// ...and says honestly that what was left out was not carried.
	assert.equal(record.complete, false);
	assert.match(record.basisNote ?? '', /was not carried from its first step/);
	assert.equal(concept!.output.type, 'concept.resolve');
});

test('a plan with two lookups that need a model call pauses again after the first', async () => {
	const second: Exploration = { id: 'e2', type: 'doc.decision.trace', purpose: 'why', params: { topic: 'refund' } };
	const { token } = await pauseOn(plan(E_DOC, second));
	const out = await handleNarrow(narrowInput(token, 'e1', VALID_ANSWER)) as StepOutputEmitNarrow;
	assert.equal(out.next, 'emit_narrow');
	assert.equal(out.explorationId, 'e2');
	// The second pause's answer is checked against the SECOND lookup's schema.
	const wrong = await handleNarrow(narrowInput(out.state, 'e2', VALID_ANSWER)) as StepOutputError;
	assert.equal(wrong.error.code, 'narrow-finalize', "a constraint answer does not fit the decision lookup's schema");
	const right = await handleNarrow(narrowInput(out.state, 'e2', { topic: 'refund', decisions: [], notFoundNote: 'none' }));
	assert.equal(right.next, 'emit_bundle');
});
