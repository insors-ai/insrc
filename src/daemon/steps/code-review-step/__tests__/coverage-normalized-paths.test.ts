/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b47dadc7 S001/t8 — the controller review path prepares and normalises
 * coverage the same way the daemon judge does: the same prepared symbol list in
 * the coverage prompt, and a graph-gap HIGH lowered to LOW so neither path folds
 * to 'block'. The daemon's diff path reaches the coverage judge as 'degraded'.
 *
 * Run: npx tsx --test src/daemon/steps/code-review-step/__tests__/coverage-normalized-paths.test.ts
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../../db/graph/store.js';

// codeReview.run reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => { await closeGraphStore(); rmSync(STORE_DIR, { recursive: true, force: true }); });

import type { IpcStreamMessage, LLMMessage, LLMProvider } from '../../../../shared/types.js';
import { handleCodeReviewStep, type CodeReviewStepDeps } from '../handler.js';
import { _clearCodeReviewStateStoreForTests } from '../state-store.js';
import type { CodeReviewStepOutput } from '../types.js';
import { judgeCoverage } from '../../../../workflow/code-review/dimensions/coverage.js';
import { runCodeReview, type JudgeSlot } from '../../../../workflow/code-review/runner.js';
import type { CodeReviewArtifact, CodeReviewGrounding, CodeReviewSubject, DimensionResult, ReviewDimension } from '../../../../workflow/code-review/types.js';
import { codeReviewRunStart, type CodeReviewRunDeps } from '../../../code-review-rpc.js';
import { enveloped, unenveloped } from '../../../../workflow/review-pipeline/__tests__/enveloped.js';

const EPIC = 'b47dadc7cf0cccb1';
const STORY = 'S001';
const CREATED = '2026-10-18T00:00:00.000Z';

const subject = (): CodeReviewSubject => ({
	repoPath: '/repo', epicHash: EPIC, storyId: STORY, changedFiles: ['src/a.ts', 'docs/x.md'],
	approvedLld:  { meta: { epicSlug: 'scope-code-review', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: null, buildRecord: null, testRecord: null,
});

/** One symbol a test reaches (with no record: reached-not-passing), one with no
 *  edge (no-edge-no-tests), and a section the coverage judge must not see. */
const GROUNDING: CodeReviewGrounding = { symbols: [
	{ entityId: 'reached', file: 'src/a.ts', kind: 'function', name: 'reached', signature: 'reached()', callers: ['helper'], callees: [], testsReaching: ['src/a.test.ts#helper'], coverageEligible: true },
	{ entityId: 'bare', file: 'src/a.ts', kind: 'function', name: 'bare', signature: 'bare()', callers: [], callees: [], testsReaching: [], coverageEligible: true },
	{ entityId: 'sec', file: 'docs/x.md', kind: 'section', name: 'Intro', signature: '## Intro', callers: [], callees: [], testsReaching: [], coverageEligible: false },
] };

/** A graph gap the model calls a HIGH breach on a symbol a test does reach. */
const GRAPH_GAP = { dimension: 'coverage' as const, severity: 'HIGH' as const, location: 'src/a.ts:1', message: 'graph gap', confidence: 'breach' as const, findingKind: 'symbol-coverage' as const, symbolId: 'reached' };

const BASE_DIMS: readonly ReviewDimension[] = ['adherence', 'conventions', 'coverage', 'quality'];
const parse = (env: { content: readonly { text: string }[] }): CodeReviewStepOutput => JSON.parse(env.content[0]!.text) as CodeReviewStepOutput;
const listedIn = (msgs: readonly LLMMessage[]): unknown => {
	const user = msgs.find(m => m.role === 'user')!.content as string;
	return JSON.parse(user.split('```json\n')[1]!.split('\n```')[0]!);
};

test('on both the controller and daemon paths a lowered graph-gap finding is LOW and the folded verdict is not block', async () => {
	// Controller path: emit_judgements, then the controller's judgements.
	_clearCodeReviewStateStoreForTests();
	const writes: { path: string; content: string }[] = [];
	const deps: CodeReviewStepDeps = {
		resolveSubject: async () => ({ ok: true, subject: subject() }),
		fetchGrounding: async () => ({ ok: true, grounding: GROUNDING }),
		fetchFreshness: async () => ({ ok: true, isProcessing: false, staleFiles: [] }),
		assembleDiffGrounding: async () => { throw new Error('the graph path is under test'); },
		runReview: runCodeReview,
		write: (path, content) => { writes.push({ path, content }); },
		sleep: async () => {}, now: () => 0, freshnessTimeoutMs: () => 120000,
		readBuildAuthor: () => 'daemon',
	};
	const start = parse(await handleCodeReviewStep({ phase: 'start', epicHash: EPIC, storyId: STORY, repo: '/repo' }, deps));
	assert.ok(start.next === 'emit_judgements', JSON.stringify(start));
	const controllerPrompt = (start.prompts as readonly (readonly LLMMessage[])[])
		.find(p => (p.find(m => m.role === 'system')?.content as string).includes('judging COVERAGE'))!;
	const judgements = { judgements: BASE_DIMS.map((d): DimensionResult => ({ dimension: d, findings: d === 'coverage' ? [GRAPH_GAP] : [] })) };
	const done = parse(await handleCodeReviewStep({ phase: 'judgements', judgements, state: start.state }, deps));
	assert.ok(done.next === 'done', JSON.stringify(done));
	const controllerRecord = JSON.parse(writes.find(w => w.path.endsWith('.json'))!.content) as CodeReviewArtifact;

	// Daemon path: the real coverage judge over the same grounding, same model answer.
	let daemonPrompt: readonly LLMMessage[] = [];
	const provider = { completeStructured: async (msgs: readonly LLMMessage[], schema: unknown) => { daemonPrompt = unenveloped(msgs); const { dimension: _d, ...answer } = GRAPH_GAP; return enveloped(schema, { findings: [answer] }); } } as unknown as LLMProvider;
	const judges: JudgeSlot[] = BASE_DIMS.map(dimension => dimension === 'coverage'
		? { dimension, judge: judgeCoverage }
		: { dimension, judge: async (): Promise<DimensionResult> => ({ dimension, findings: [] }) });
	const daemon = await runCodeReview(subject(), provider, { runId: 'r', modelLabel: 'm' }, { judges, assembleGrounding: async () => GROUNDING, write: () => {} });
	assert.ok(daemon.ok, daemon.ok ? '' : daemon.error);
	if (!daemon.ok) return;

	for (const [path, record] of [['controller', controllerRecord], ['daemon', daemon.artifact]] as const) {
		const coverage = record.body.dimensions.find(d => d.dimension === 'coverage')!;
		assert.deepEqual(coverage.findings.map(f => [f.severity, f.confidence]), [['LOW', 'observation']], `${path}: the graph gap is lowered`);
		assert.match(coverage.lowered?.[0]?.reason ?? '', /reached-not-passing/, `${path}: the reason is recorded`);
		assert.deepEqual(record.body.counts, { high: 0, med: 0, low: 1 }, path);
		assert.notEqual(record.body.verdict, 'block', path);
	}

	// The controller's coverage prompt lists the same prepared symbols the daemon judge sees.
	assert.deepEqual(listedIn(controllerPrompt), listedIn(daemonPrompt));
	assert.deepEqual((listedIn(daemonPrompt) as { entityId: string }[]).map(s => s.entityId), ['reached', 'bare']);
});

test('the daemon diff path reaches the coverage judge as degraded, also with an empty grounding', async () => {
	const calls: (readonly LLMMessage[])[] = [];
	const provider = { completeStructured: async (msgs: readonly LLMMessage[], schema: unknown) => { calls.push(unenveloped(msgs)); return enveloped(schema, { findings: [] }); } } as unknown as LLMProvider;
	const writes: string[] = [];
	const rpcDeps: CodeReviewRunDeps = {
		resolveSubject: async () => ({ ok: true, subject: subject() }),
		resolveProvider: () => ({ provider, modelLabel: 'm' }),
		assembleDiffGrounding: (async () => ({ grounding: { symbols: [] }, changedFiles: ['src/a.ts'] })) as never,
		write: (path) => { writes.push(path); },
	};
	const frames: IpcStreamMessage[] = [];
	await codeReviewRunStart({ repo: '/repo', epicHash: EPIC, storyId: STORY, groundingMode: 'degraded' }, m => frames.push(m), new AbortController().signal, rpcDeps);
	assert.equal(frames[frames.length - 1]!.stream, 'done', JSON.stringify(frames[frames.length - 1]!.data));
	const coverageCall = calls.find(c => (c.find(m => m.role === 'system')?.content as string).includes('judging COVERAGE'));
	assert.ok(coverageCall !== undefined, 'the real coverage judge ran');
	const system = coverageCall.find(m => m.role === 'system')!.content as string;
	assert.ok(system.includes('This is a DIFF review'), 'the coverage judge was told the review is degraded');
	assert.ok(writes.some(p => p.endsWith('.json')), 'the record was written');
});
