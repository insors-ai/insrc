/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The reader of a repository's indexed entities, threaded through the review
 * (Epic c2ba6fa6, Story s4, t8). A review that runs outside the daemon (the
 * CLI's) may not open the store, so it is handed a reader that asks the
 * daemon; a review inside the daemon, and the MCP server's review step, pass
 * nothing and keep the default reader.
 *
 * The repository here holds the same token under two directories. Which of
 * them the evidence comes from shows which reader named the source roots.
 *
 * Run: npx tsx --test src/workflow/review/__tests__/source-root-reader.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { gatherEvidence } from '../probe.js';
import { runReview } from '../review.js';
import { reviewArtifactFile } from '../run-artifact.js';
import { renderReviewReport } from '../report.js';
import { resolveSourceRoots } from '../source-roots.js';
import type { Claim } from '../types.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { upsertEntities } from '../../../db/entities.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { Entity, LLMProvider, LLMResponse } from '../../../shared/types.js';
import { envelopeProvider } from '../../review-pipeline/__tests__/enveloped.js';
import { createRepoLifecycle } from '../../artifact-core/repo-lifecycle.js';

const base = mkdtempSync(join(tmpdir(), 'insrc-root-reader-'));
const repo = join(base, 'repo');
const TOKEN = 'UNIQUE_TOKEN_QRS';

function fileEntity(file: string): Entity {
	return {
		id: makeEntityId(repo, file, 'file', file), kind: 'file', name: file, language: 'typescript', repoId: 1,
		repo, file, startLine: 1, endLine: 1, body: '', embedding: [], indexedAt: '2026-10-11T00:00:00.000Z',
	};
}

before(async () => {
	for (const dir of ['indexed', 'elsewhere']) {
		mkdirSync(join(repo, dir), { recursive: true });
		writeFileSync(join(repo, dir, 'widget.ts'), `export const ${TOKEN} = 1;\n`);
	}
	// The default reader's store: a temporary one that knows ONLY indexed/.
	await closeGraphStore();
	setGraphStorePath(join(base, 'graph.lmdb'));
	await addRepo(null as never, { path: repo, name: 'repo', addedAt: '', status: 'ready' });
	await upsertEntities(null as never, [fileEntity(join(repo, 'indexed', 'widget.ts'))]);
});
after(async () => {
	await closeGraphStore();
	rmSync(base, { recursive: true, force: true });
});

const claims: Claim[] = [{ id: 'c1', kind: 'citation', text: 't', anchors: [], probe: { greps: [TOKEN], reads: [] } } as Claim];
const matches = (ev: Awaited<ReturnType<typeof gatherEvidence>>): string[] => ev[0]!.grepResults.flatMap(g => g.matches);
const under = (ms: string[], dir: string): boolean => ms.some(m => m.includes(`${dir}/widget.ts`));

/** A provider that extracts the one claim above and finds it sound. */
function provider(): LLMProvider {
	return envelopeProvider({
		supportsTools: false,
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async complete(): Promise<LLMResponse> { return { text: '', stopReason: 'end_turn' }; },
		async *stream(): AsyncIterable<string> { /* unused */ },
		async embed(): Promise<number[]> { return []; },
		async completeStructured<T>(_messages: unknown, schema: unknown): Promise<T> {
			const props = (schema as { properties?: Record<string, unknown> }).properties ?? {};
			if ('claims' in props) {
				return { claims: [{ id: 'c1', ref: 's1/t1', kind: 'citation', text: 'the token exists', anchors: [], probe: { greps: [TOKEN] } }] } as T;
			}
			return { severity: 'LOW', evidence: 'found', action: 'none — verified sound', fixability: 'manual' } as T;
		},
	} as LLMProvider);
}

test('review with no reader passed uses the default reader, as the daemon and the MCP server do', async () => {
	// The default reader is the store, which names indexed/ as the only root.
	const roots = await resolveSourceRoots(repo);
	assert.deepEqual(roots, { roots: [{ path: join(repo, 'indexed'), fileCount: 1 }], fallbackUsed: false });

	const viaDefault = matches(await gatherEvidence(claims, repo));
	assert.ok(under(viaDefault, 'indexed'));
	assert.equal(under(viaDefault, 'elsewhere'), false, 'only the root the store names is searched');

	// Passing an options object without a reader changes nothing.
	const viaEmptyOpts = matches(await gatherEvidence(claims, repo, {}));
	assert.deepEqual(viaEmptyOpts, viaDefault);

	const report = await runReview('# Story s1\n\n- t1: the token exists.\n', { repo, stage: 'plan', provider: provider(), model: 'fake', reviewedAt: '2026-10-11T00:00:00.000Z' });
	assert.equal('sourceRootFallback' in report, false, 'no fallback is reported');
	assert.doesNotMatch(renderReviewReport(report), /source roots could not be derived/);
});

test('a reader that is passed names the source roots, in place of the store', async () => {
	const calls: string[] = [];
	const reader = async (repoPath: string): Promise<Entity[]> => { calls.push(repoPath); return [fileEntity(join(repo, 'elsewhere', 'widget.ts'))]; };

	const viaReader = matches(await gatherEvidence(claims, repo, { readEntitiesForRepo: reader }));
	assert.deepEqual(calls, [repo], 'the reader is asked once, for this repository');
	assert.ok(under(viaReader, 'elsewhere'));
	assert.equal(under(viaReader, 'indexed'), false, 'the store was not consulted');

	// ... and through the whole review.
	calls.length = 0;
	const report = await runReview('# Story s1\n\n- t1: the token exists.\n', { repo, stage: 'plan', provider: provider(), model: 'fake', readEntitiesForRepo: reader });
	assert.deepEqual(calls, [repo]);
	assert.equal('sourceRootFallback' in report, false);
});

test('CLI review: a rejecting reader falls back to the repository root and the output says so', async () => {
	const rejecting = async (): Promise<Entity[]> => { throw new Error('daemon is not running — start it with: insrc daemon start'); };

	// The evidence still comes, from the whole repository root.
	const reasons: string[] = [];
	const ev = matches(await gatherEvidence(claims, repo, { readEntitiesForRepo: rejecting, onSourceRootFallback: r => reasons.push(r) }));
	assert.ok(under(ev, 'indexed') && under(ev, 'elsewhere'), 'both directories are searched');
	assert.equal(reasons.length, 1);
	assert.match(reasons[0] ?? '', /the index could not be read \(daemon is not running/);

	// The review's output says that it fell back, and why.
	const report = await runReview('# Story s1\n\n- t1: the token exists.\n', { repo, stage: 'plan', provider: provider(), model: 'fake', readEntitiesForRepo: rejecting });
	assert.match(report.sourceRootFallback ?? '', /the index could not be read \(daemon is not running/);
	const rendered = renderReviewReport(report);
	assert.match(rendered, /The source roots could not be derived from the index: the index could not be read \(daemon is not running/);
	assert.match(rendered, /The whole repository root was searched in their place/);

	// A reader that answers with no file is the other reason.
	const empty = await runReview('# Story s1\n\n- t1: the token exists.\n', { repo, stage: 'plan', provider: provider(), model: 'fake', readEntitiesForRepo: async () => [] });
	assert.equal(empty.sourceRootFallback, 'the index holds no file for this repository');
});

test('the reader given to the review of an artifact file reaches the source-root read, and the fallback reaches the written document', async () => {
	// a head is named by its artifact id, in the repository's store
	const write = (name: string): { mdPath: string; jsonPath: string } => {
		const id = `PLAN-abcd1234ef567890-${name}`;
		const mdPath = join(base, `${id}.md`);
		const jsonPath = join(repo, '.insrc', 'artifacts', `${id}.json`);
		mkdirSync(dirname(jsonPath), { recursive: true });
		writeFileSync(mdPath, '# Story s1\n\n- t1: the token exists.\n');
		writeFileSync(jsonPath, JSON.stringify({ meta: { workflow: 'plan', epicHash: 'abcd1234ef567890', storyId: name }, body: {}, citations: [] }));
		return { mdPath, jsonPath };
	};
	const common = { repo, lifecycle: createRepoLifecycle(repo).service, provider: provider(), model: 'fake', reviewedAt: '2026-10-11T00:00:00.000Z' };

	const calls: string[] = [];
	const ok = write('s1');
	const res = await reviewArtifactFile({ ...ok, ...common, readEntitiesForRepo: async repoPath => { calls.push(repoPath); return [fileEntity(join(repo, 'elsewhere', 'widget.ts'))]; } });
	assert.deepEqual(calls, [repo], 'the reader was asked, so the store was not');
	assert.equal('sourceRootFallback' in res.report, false);
	assert.doesNotMatch(readFileSync(ok.mdPath, 'utf8'), /source roots could not be derived/);

	const bad = write('s2');
	const fell = await reviewArtifactFile({ ...bad, ...common, readEntitiesForRepo: async () => { throw new Error('daemon is not running'); } });
	assert.match(fell.report.sourceRootFallback ?? '', /daemon is not running/);
	assert.match(readFileSync(bad.mdPath, 'utf8'), /The source roots could not be derived from the index: the index could not be read \(daemon is not running\)/);
});
