/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, Task t15 -- an analysis asked of the daemon about
 * a repository being indexed is refused with code 'repo-indexing' and how far
 * the run has got, whichever way it is asked: the analyze request itself
 * (analyze.context.buildRun), the two step tools through the daemon's
 * step.call request, and a workflow step grounded on the analyzer, which
 * passes the refusal on unchanged.
 *
 * The daemon's own handlers are called in this process over a temporary store
 * in which the repository is being indexed (began at a known time, 4 of 9
 * files done). Nothing here reaches a model: each path is refused before one.
 *
 * Run: npx tsx --test src/daemon/steps/__tests__/repo-indexing-steps.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../../db/repos.js';
import { bumpIndexRunDone, closeIndexRun, openIndexRun, setIndexRunSelected } from '../../../indexer/run-record.js';
import type { Entity, IpcStreamMessage } from '../../../shared/types.js';
import { buildRun } from '../../analyze-rpc.js';
import { _groundingForTest, AnalyzeGroundingFailedError } from '../../workflow-rpc.js';
import { createStepCallHandler } from '../host.js';
import '../../../workflow/__tests__/helpers/converted-repos.js';

useTemporaryLance();

const BEGAN = Date.UTC(2026, 9, 13, 16, 30);
let store: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-repo-indexing-steps-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-repo-indexing-app-')));
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, 'src', 'a.ts'), 'export function fn() {}\n', 'utf8');
	await addRepo(null, { path: repo, name: 'app', addedAt: '2026-10-13T00:00:00.000Z', status: 'indexing' });
	await upsertEntities(null, [{
		id: 'e-app', repo, file: join(repo, 'src', 'a.ts'), kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 1,
	} as unknown as Entity]);
	// The repository's full index is running: began at BEGAN, 4 of 9 files done.
	openIndexRun(repo, BEGAN);
	setIndexRunSelected(repo, 9);
	for (let i = 0; i < 4; i++) bumpIndexRunDone(repo);
});

test.afterEach(async () => {
	closeIndexRun(repo);
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

/** The refusal's message: the repository, and how far its run has got. */
function refusalText(path: string): string {
	return `The repository ${path} is being indexed: the run began at 2026-10-13T16:30:00.000Z, 4 of 9 files done. Retry once the index is ready.`;
}

/** One step.call request to the daemon's handler; the reply envelope's text. */
async function stepCall(tool: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
	const frames: IpcStreamMessage[] = [];
	await createStepCallHandler()({ tool, args, context: { cwd: repo, client: 'claude' } }, m => { frames.push(m); }, new AbortController().signal);
	const done = frames.find(f => f.stream === 'done');
	assert.ok(done !== undefined, `${tool}: a reply, not a failed request (${JSON.stringify(frames)})`);
	const envelope = done.data as { content: Array<{ text: string }>; isError?: boolean };
	return { text: envelope.content.map(c => c.text).join('\n'), isError: envelope.isError === true };
}

test("analyze through the daemon (analyze.context.buildRun and the step tools via step.call) on a repository being indexed returns code 'repo-indexing' with the figures; the workflow step that reaches it passes the reply on unchanged", async () => {
	const intent = { target: 'code', focused: true, focus: 'how is it laid out', scopeRef: { kind: 'repo', value: repo }, reasoning: 'r' };

	// The analyze request itself.
	const run = await buildRun({ runId: 'repo-indexing-buildrun', intent });
	assert.equal(run.ok, false);
	if (run.ok) return;
	assert.equal(run.error.code, 'repo-indexing');
	assert.equal(run.error.message, refusalText(repo));
	assert.deepEqual(run.error.data, { repoPath: repo, status: 'indexing', run: { startedAt: BEGAN, filesSelected: 9, filesDone: 4 } });

	// The one-shot tool, through step.call: the error reply names the code and carries the figures.
	const oneShot = await stepCall('insrc_analyze', { focus: 'how is it laid out', repo, target: 'code' });
	assert.equal(oneShot.isError, true);
	assert.equal(oneShot.text, `analyze.context.buildRun failed: repo-indexing -- ${refusalText(repo)}`);

	// The multi-turn tool, through step.call: refused at its start, before anything is measured or minted.
	const started = await stepCall('insrc_analyze_step', { phase: 'start', focus: 'how is it laid out', repo, target: 'code' });
	assert.equal(started.isError, true);
	const reply = JSON.parse(started.text) as { next: string; error: { code: string; message: string; retryable: boolean }; state?: string };
	assert.deepEqual(reply.error, { code: 'repo-indexing', message: refusalText(repo), retryable: true });
	assert.equal(reply.next, 'error');
	assert.equal(reply.state, undefined, 'no run state was minted');

	// A workflow step grounded on the analyzer: the step fails with the analyze request's
	// own code and message, unchanged.
	await assert.rejects(_groundingForTest('context.assemble', { runId: 'repo-indexing-grounding', intent }), (e: unknown) =>
		e instanceof AnalyzeGroundingFailedError
		&& e.code === 'repo-indexing'
		&& e.message === `workflow.run: analyze grounding failed for step 'context.assemble' (repo-indexing): ${refusalText(repo)}`);
});
