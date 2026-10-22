/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-b47dadc7 S001/t6 — each changed symbol says whether the coverage
 * dimension judges it (a function, method or class in a non-test file), and
 * every judge slot is told the run's groundingMode. The other judges still see
 * every symbol.
 *
 * Run: npx tsx --test src/workflow/code-review/__tests__/grounding-eligibility.test.ts
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';

// codeReview.run reaches the graph store through code that takes no path.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'insrc-test-store-'));
setGraphStorePath(join(STORE_DIR, 'graph.lmdb'));
after(async () => { await closeGraphStore(); rmSync(STORE_DIR, { recursive: true, force: true }); });

import type { IpcStreamMessage, LLMProvider } from '../../../shared/types.js';
import { assembleCodeReviewGrounding, assembleDiffCodeReviewGrounding, type GroundedEntity, type GroundingDeps } from '../grounding.js';
import { runCodeReview, type CodeReviewRunnerDeps, type JudgeSlot } from '../runner.js';
import type { CodeReviewGrounding, CodeReviewSubject, DimensionResult, JudgeContext, ReviewDimension } from '../types.js';
import { codeReviewRunStart, type CodeReviewRunDeps } from '../../../daemon/code-review-rpc.js';
import { noopRoundWriter } from '../../__tests__/helpers/round-writer.js';

const ENTITIES: readonly GroundedEntity[] = [
	{ id: '1', file: 'src/a.ts', kind: 'function', name: 'fn', signature: 'fn()' },
	{ id: '2', file: 'src/a.ts', kind: 'method', name: 'm', signature: 'm()' },
	{ id: '3', file: 'src/a.ts', kind: 'class', name: 'C', signature: 'class C' },
	{ id: '4', file: 'src/a.ts', kind: 'type', name: 'T', signature: 'type T' },
	{ id: '5', file: 'src/a.ts', kind: 'interface', name: 'I', signature: 'interface I' },
	{ id: '6', file: 'docs/x.md', kind: 'section', name: 'Intro', signature: '## Intro' },
	{ id: '7', file: 'docs/x.md', kind: 'document', name: 'x.md', signature: '' },
	{ id: '8', file: 'package.json', kind: 'config', name: 'package.json', signature: '' },
	{ id: '9', file: 'src/__tests__/a.test.ts', kind: 'function', name: 'helper', signature: 'helper()' },
	{ id: '10', file: 'src/b.spec.ts', kind: 'class', name: 'Fixture', signature: 'class Fixture' },
	{ id: '11', file: 'pkg/a_test.go', kind: 'method', name: 'TestM', signature: 'TestM()' },
];

const graphDeps: GroundingDeps = {
	entitiesInFile: async (_r, file) => ENTITIES.filter(e => e.file === file),
	callersOf: async () => [],
	calleesOf: async () => [],
};

const FILES = [...new Set(ENTITIES.map(e => e.file))];

test('sections, documents, config, types, interfaces and every entity of a test file are not coverage-eligible; functions, methods and classes in source files are', async () => {
	const { symbols } = await assembleCodeReviewGrounding('/repo', FILES, graphDeps);
	assert.equal(symbols.length, ENTITIES.length, 'every entity is still listed');
	const eligible = Object.fromEntries(symbols.map(s => [`${s.file}#${s.name}`, s.coverageEligible]));
	assert.deepEqual(eligible, {
		'src/a.ts#fn': true, 'src/a.ts#m': true, 'src/a.ts#C': true,
		'src/a.ts#T': false, 'src/a.ts#I': false,
		'docs/x.md#Intro': false, 'docs/x.md#x.md': false, 'package.json#package.json': false,
		'src/__tests__/a.test.ts#helper': false, 'src/b.spec.ts#Fixture': false, 'pkg/a_test.go#TestM': false,
	});

	// A diff review's per-file rows are never eligible: there is no symbol to grade.
	const diff = await assembleDiffCodeReviewGrounding('/repo', {
		rangeDiff: async () => ({ files: [{ path: 'src/a.ts', insertions: 1, deletions: 0, change: 'modified' }] as never, body: 'diff --git a/src/a.ts b/src/a.ts\n+x', truncated: false }),
		workingTreeDiff: async () => ({ files: [], body: '', truncated: false }),
	}, { base: 'abc' });
	assert.deepEqual(diff.grounding.symbols.map(s => s.coverageEligible), [false]);
});

const subject: CodeReviewSubject = {
	repoPath: '/repo', epicHash: 'b47dadc7cf0cccb1', storyId: 's1', changedFiles: FILES,
	approvedLld: { meta: { epicSlug: 'x', createdAt: '2026-10-18T00:00:00.000Z', epicCreatedAt: '2026-10-18T00:00:00.000Z' }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
	approvedPlan: null, buildRecord: null, testRecord: null,
};

interface Seen { readonly dimension: ReviewDimension; readonly ctx: JudgeContext | undefined; readonly symbols: number }

function spyJudges(seen: Seen[]): JudgeSlot[] {
	return (['adherence', 'conventions', 'coverage', 'quality'] as const).map(dimension => ({
		dimension,
		judge: async (_s: CodeReviewSubject, g: CodeReviewGrounding, _p: LLMProvider, ctx?: JudgeContext): Promise<DimensionResult> => {
			seen.push({ dimension, ctx, symbols: g.symbols.length });
			return { dimension, findings: [] };
		},
	}));
}

test("every judge slot receives the run's groundingMode and the non-coverage judges see every symbol", async () => {
	const grounding = await assembleCodeReviewGrounding('/repo', FILES, graphDeps);
	for (const mode of [undefined, 'full', 'degraded'] as const) {
		const seen: Seen[] = [];
		const deps: CodeReviewRunnerDeps = { judges: spyJudges(seen), assembleGrounding: async () => grounding, write: () => {} };
		const out = await runCodeReview(subject, {} as LLMProvider, { runId: 'r', modelLabel: 'm', ...(mode !== undefined ? { groundingMode: mode } : {}), capVerdictAtWarn: mode === 'degraded' }, deps);
		assert.ok(out.ok, out.ok ? '' : out.error);
		assert.deepEqual(seen.map(s => [s.dimension, s.ctx?.groundingMode]),
			['adherence', 'conventions', 'coverage', 'quality'].map(d => [d, mode ?? 'full']));
		for (const s of seen.filter(x => x.dimension !== 'coverage')) {
			assert.equal(s.symbols, ENTITIES.length, `${s.dimension} sees every changed symbol, eligible or not`);
		}
	}

	// The daemon's diff path (codeReview.run, degraded) reaches the judges as 'degraded'.
	const seen: Seen[] = [];
	const rpcDeps: CodeReviewRunDeps = {
		resolveSubject: async () => ({ ok: true, subject }),
		resolveProvider: () => ({ provider: {} as LLMProvider, modelLabel: 'm' }),
		assembleDiffGrounding: (async () => ({ grounding: { symbols: [] }, changedFiles: ['src/a.ts'] })) as never,
		write: () => {},
		roundWriterFor: () => noopRoundWriter(),
		runReview: (async (s: CodeReviewSubject, p: LLMProvider, o: Parameters<typeof runCodeReview>[2], d: CodeReviewRunnerDeps | undefined) =>
			runCodeReview(s, p, o, { judges: spyJudges(seen), assembleGrounding: d!.assembleGrounding, write: d!.write })) as never,
	};
	const frames: IpcStreamMessage[] = [];
	await codeReviewRunStart({ repo: '/repo', epicHash: subject.epicHash, storyId: 's1', groundingMode: 'degraded' }, m => frames.push(m), new AbortController().signal, rpcDeps);
	assert.equal(frames[frames.length - 1]!.stream, 'done', JSON.stringify(frames[frames.length - 1]!.data));
	assert.deepEqual(seen.map(s => s.ctx?.groundingMode), ['degraded', 'degraded', 'degraded', 'degraded']);
});
