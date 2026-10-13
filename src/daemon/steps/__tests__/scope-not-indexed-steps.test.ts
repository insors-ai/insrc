/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-7c255f612a40e0eb -- the analyze step tool, asked through the daemon's
 * step.call request about a scope the index does not hold, is refused with code
 * 'scope-not-indexed' and the analyze run's own message, at its start before any
 * size is announced or any state is minted, and at a later phase likewise. A data,
 * infra or generic request is not refused for it, as the run does not refuse it.
 *
 * The daemon's own handlers are called in this process over a temporary store
 * whose registry holds an indexed repository (one stored entity), a registered
 * repository with no stored entities, and not a third directory. Nothing here
 * reaches a model.
 *
 * Run: npx tsx --test src/daemon/steps/__tests__/scope-not-indexed-steps.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { scopeErrorMapping } from '../../../analyze/context/invariants.js';
import { resolveTaskScope } from '../../../analyze/runtimes/shared/task-scope.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, removeRepo } from '../../../db/repos.js';
import type { Entity, IpcStreamMessage } from '../../../shared/types.js';
import { createStepCallHandler } from '../host.js';

useTemporaryLance();

let store: string;
/** Registered, ready, one stored entity. */
let indexed: string;
/** Registered and ready, with no stored entities. */
let empty: string;
/** In no registered repository. */
let unregistered: string;

function dir(prefix: string): string {
	const d = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
	mkdirSync(join(d, 'src'), { recursive: true });
	writeFileSync(join(d, 'src', 'a.ts'), 'export function fn() {}\n', 'utf8');
	return d;
}

test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-scope-not-indexed-steps-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	indexed = dir('insrc-sni-indexed-');
	empty = dir('insrc-sni-empty-');
	unregistered = dir('insrc-sni-unregistered-');
	const at = '2026-10-13T00:00:00.000Z';
	await addRepo(null, { path: indexed, name: 'indexed', addedAt: at, status: 'ready', lastIndexed: at });
	await addRepo(null, { path: empty, name: 'empty', addedAt: at, status: 'ready', lastIndexed: at });
	await upsertEntities(null, [{
		id: 'e-indexed', repo: indexed, file: join(indexed, 'src', 'a.ts'), kind: 'function', name: 'fn', language: 'typescript', startLine: 1, endLine: 1,
	} as unknown as Entity]);
});

test.afterEach(async () => {
	await closeGraphStore();
	for (const d of [store, indexed, empty, unregistered]) rmSync(d, { recursive: true, force: true });
});

type StepReply = { next: string; error?: { code: string; message: string; retryable: boolean }; state?: string; userTurn?: string };

/** One step.call request for insrc_analyze_step to the daemon's handler; the reply. */
async function step(args: Record<string, unknown>): Promise<{ reply: StepReply; isError: boolean }> {
	const frames: IpcStreamMessage[] = [];
	await createStepCallHandler()({ tool: 'insrc_analyze_step', args, context: { cwd: indexed, client: 'claude' } }, m => { frames.push(m); }, new AbortController().signal);
	const done = frames.find(f => f.stream === 'done');
	assert.ok(done !== undefined, `a reply, not a failed request (${JSON.stringify(frames)})`);
	const envelope = done.data as { content: Array<{ text: string }>; isError?: boolean };
	return { reply: JSON.parse(envelope.content.map(c => c.text).join('\n')) as StepReply, isError: envelope.isError === true };
}

/** The analyze run's own refusal of a scope (resolveTaskScope, the check runAnalyze makes after
 *  classification): its code, through the analyzer's mapping, and its message. */
async function runRefusal(path: string, target: 'code' | 'docs'): Promise<{ code: string; message: string }> {
	try {
		await resolveTaskScope({ kind: 'repo', value: path }, target, 'the run');
	} catch (err) {
		const mapped = scopeErrorMapping(err);
		assert.ok(mapped !== undefined, `the run refuses ${path} with a scope error: ${String(err)}`);
		return { code: mapped.code, message: mapped.message };
	}
	throw new Error(`the run does not refuse ${path} for ${target}`);
}

test("insrc_analyze_step start on a scope the index does not hold (in no registered repository, or in one with no stored entities), for code and docs, is refused with code 'scope-not-indexed' and the run's message, with no size announced and no state minted", async () => {
	for (const path of [unregistered, empty]) {
		for (const target of ['code', 'docs'] as const) {
			const label = `${target} on ${path === empty ? 'a repository with no stored entities' : 'an unregistered directory'}`;
			const expected = await runRefusal(path, target);
			assert.equal(expected.code, 'scope-not-indexed', label);
			const { reply, isError } = await step({ phase: 'start', focus: 'how is it laid out', repo: path, target });
			assert.equal(isError, true, label);
			assert.equal(reply.next, 'error', label);
			assert.deepEqual(reply.error, { code: 'scope-not-indexed', message: expected.message, retryable: false }, label);
			assert.equal(reply.state, undefined, `${label}: no state minted`);
			assert.equal(reply.userTurn, undefined, `${label}: no planning prompt, so no size announced`);
		}
	}
});

test("insrc_analyze_step start on an indexed repository is answered; data, infra and generic requests on an unregistered directory are not refused for it", async () => {
	const answered = await step({ phase: 'start', focus: 'how is it laid out', repo: indexed, target: 'code' });
	assert.equal(answered.reply.next, 'emit_plan', JSON.stringify(answered.reply.error));
	for (const target of ['data', 'infra', 'generic'] as const) {
		const { reply } = await step({ phase: 'start', focus: 'how is it laid out', repo: unregistered, target });
		assert.equal(reply.next, 'emit_plan', `${target}: ${JSON.stringify(reply.error)}`);
	}
});

test("insrc_analyze_step plan on a run whose repository is no longer held by the index is refused with code 'scope-not-indexed' before its lookups run", async () => {
	const started = await step({ phase: 'start', focus: 'how is it laid out', repo: indexed, target: 'code' });
	assert.equal(started.reply.next, 'emit_plan');
	assert.ok(started.reply.state !== undefined);
	// The repository leaves the registry between the turns; another one stays registered.
	await removeRepo(null, indexed);
	const expected = await runRefusal(indexed, 'code');
	const plan = {
		answerType: 'structural-map',
		synthesisHint: 'h',
		explorations: [{ id: 'e1', type: 'module.profile', purpose: 'p', params: { path: indexed } }],
	};
	const { reply, isError } = await step({ phase: 'plan', plan, state: started.reply.state });
	assert.equal(isError, true);
	assert.equal(reply.next, 'error');
	assert.deepEqual(reply.error, { code: 'scope-not-indexed', message: expected.message, retryable: false });
});
