/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The step host, the daemon's `step.call` stream request (Epic c2ba6fa6,
 * Story s11, task t8). The seven real handlers run against a temporary store;
 * the daemon requests they make go to stand-in handler maps through the
 * in-daemon client. No daemon process, no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../../db/lance/conn.js';
import { currentStepContext } from '../../../shared/step-context.js';
import type { StepCallContext } from '../../../shared/step-context.js';
import type { IpcStreamMessage } from '../../../shared/types.js';
import { runCodeReview } from '../../../workflow/code-review/runner.js';
import type { CodeReviewGrounding, CodeReviewSubject } from '../../../workflow/code-review/types.js';
import { IpcServer, directDispatch } from '../../server.js';
import type { RpcHandlers, StreamHandler, StreamHandlers } from '../../server.js';
import { loadState as loadAnalyzeState } from '../analyze-step/state-store.js';
import { loadState as loadCodeReviewState } from '../code-review-step/state-store.js';
import type { CodeReviewStepDeps } from '../code-review-step/handler.js';
import { createInDaemonClient, installStepDaemonClient, stepDaemonClient } from '../daemon-client.js';
import { createStepCallHandler, STEP_TOOL_NAMES, stepToolTable } from '../host.js';
import type { StepEnvelope } from '../host.js';
import { loadState as loadReviewState, updateState as updateReviewState } from '../review-step/state-store.js';
import { loadState as loadWorkflowState } from '../workflow-step/state-store.js';

/** Run a stream handler and collect what it sends. */
async function collect(handler: StreamHandler, params: unknown, signal: AbortSignal = new AbortController().signal): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await handler(params, (m) => { frames.push(m); }, signal);
	return frames;
}

const CTX: StepCallContext = { cwd: '/caller', envRepo: '/caller/repo', client: 'codex' };
const ENVELOPE: StepEnvelope = { content: [{ type: 'text', text: '{"next":"done","x":[1,2]}' }], isError: false };

// --- the host itself ----------------------------------------------------------------

test("step host: done frame carries the handler's envelope unchanged; unknown tool gives step-unknown-tool; a throwing handler gives step-failed with its message", async () => {
	const seen: { args: unknown; ctx: StepCallContext | undefined }[] = [];
	const host = createStepCallHandler({
		...stepToolTable(),
		insrc_triage: async (args) => { seen.push({ args, ctx: currentStepContext() }); return ENVELOPE; },
		insrc_build_step: async () => { throw new Error('the handler broke'); },
	});

	// done: the very envelope, with the raw args and the caller's context inside the handler.
	const args = { phase: 'start', focus: 'f', extra: [1, { y: 2 }] };
	const done = await collect(host, { tool: 'insrc_triage', args, context: CTX });
	assert.equal(done.length, 1);
	assert.equal(done[0]!.stream, 'done');
	assert.equal(done[0]!.data, ENVELOPE, 'the same object, not a copy');
	assert.deepEqual(seen, [{ args, ctx: CTX }]);
	assert.equal(currentStepContext(), undefined, 'the context does not outlive the call');

	// unknown tool: nothing runs.
	for (const tool of ['insrc_docgen', '__proto__', 'toString', undefined]) {
		const out = await collect(host, { tool, args: {}, context: CTX });
		assert.equal(out.length, 1);
		assert.equal(out[0]!.stream, 'error');
		assert.equal((out[0]!.data as { code: string }).code, 'step-unknown-tool', String(tool));
	}
	assert.equal(seen.length, 1);

	// a throwing handler.
	const failed = await collect(host, { tool: 'insrc_build_step', args: {}, context: CTX });
	assert.equal(failed.length, 1);
	assert.equal(failed[0]!.stream, 'error');
	assert.deepEqual(failed[0]!.data, { code: 'step-failed', error: 'the handler broke', recoverable: false });

	// a malformed context is refused before any handler runs.
	for (const context of [undefined, {}, { cwd: '' }, { cwd: '/x', client: 'gemini' }, { cwd: '/x', envRepo: 7 }]) {
		const out = await collect(host, { tool: 'insrc_triage', args: {}, context });
		assert.equal((out[0]!.data as { code: string }).code, 'step-failed', JSON.stringify(context));
	}
	assert.equal(seen.length, 1);

	// The table holds exactly the seven tools.
	assert.deepEqual(Object.keys(stepToolTable()).sort(), [...STEP_TOOL_NAMES].sort());
});

// --- equivalence on a temporary store ---------------------------------------------

/** The envelope with the fresh state token, the one field two identical calls differ in, replaced. */
function normalised(env: StepEnvelope): unknown {
	const text = env.content[0]!.text;
	let body: unknown = text;
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>;
		if (typeof parsed['state'] === 'string') parsed['state'] = '<state token>';
		body = parsed;
	} catch { /* a plain-text reply is compared as it is */ }
	return { ...env, content: [{ ...env.content[0], text: body }] };
}

test('equivalence: each of the seven tools through step.call returns the same envelope as the handler called directly on the same temporary store', { timeout: 120_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-step-host-'));
	const repo = mkdtempSync(join(tmpdir(), 'insrc-step-host-repo-'));
	const envBefore = process.env['INSRC_REPO'];
	delete process.env['INSRC_REPO'];
	setGraphStorePath(join(home, 'graph.lmdb'));
	setLanceConnPath(join(home, 'lance'));
	installStepDaemonClient(createInDaemonClient({ 'repo.resolveForCwd': async () => ({ path: null }) }, {}));
	try {
		const dir = join(repo, 'docs', 'stub');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 's1.md'), '# Doc\n\nThe body.\n');
		writeFileSync(join(dir, 's1.json'), JSON.stringify({ meta: { workflow: 'design.story', epicHash: 'abcd', storyId: 'S001', authoredBy: 'daemon' }, body: {} }));

		const inputs: Record<string, unknown> = {
			insrc_analyze:          { focus: 'how does x work' },
			insrc_analyze_step:     { phase: 'start', focus: 'how does x work', repo },
			insrc_workflow_step:    { phase: 'start', workflow: 'issue', focus: 'add a flag to the cli', repo },
			insrc_build_step:       { phase: 'implement', target: 's1/t1', repo },
			insrc_review_step:      { phase: 'start', artifact: join(dir, 's1.md'), repo },
			insrc_code_review_step: { phase: 'start', epicHash: 'abcdabcdabcdabcd', storyId: 's1', repo },
			insrc_triage:           { phase: 'start', focus: 'add a flag', repo },
		};
		assert.deepEqual(Object.keys(inputs).sort(), [...STEP_TOOL_NAMES].sort(), 'every tool is compared');

		const table = stepToolTable();
		const host = createStepCallHandler(table);
		// The context a forwarder in this process would send: its cwd, no INSRC_REPO.
		const context: StepCallContext = { cwd: process.cwd() };
		const never = new AbortController().signal;
		for (const [tool, args] of Object.entries(inputs)) {
			const direct = await table[tool]!(args, never);
			const frames = await collect(host, { tool, args, context });
			assert.equal(frames.length, 1, tool);
			assert.equal(frames[0]!.stream, 'done', `${tool}: ${JSON.stringify(frames[0]!.data)}`);
			const viaHost = frames[0]!.data as StepEnvelope;
			// Compared as text with a short, located message: a full structural diff of these
			// replies (their schemas run to tens of kilobytes) is more than the test runner can report.
			const got = JSON.stringify(normalised(viaHost));
			const want = JSON.stringify(normalised(direct));
			if (got !== want) {
				let i = 0;
				while (i < got.length && got[i] === want[i]) i += 1;
				assert.fail(`${tool}: the envelope through step.call differs from the direct reply at character ${i}: ` +
					`step.call …${got.slice(Math.max(0, i - 40), i + 80)}… direct …${want.slice(Math.max(0, i - 40), i + 80)}…`);
			}
			// Not a vacuous comparison: each reply has a body.
			assert.ok(viaHost.content[0]!.text.length > 50, `${tool} replied`);
		}
	} finally {
		installStepDaemonClient(undefined);
		await closeGraphStore();
		await closeLanceConn();
		if (envBefore !== undefined) process.env['INSRC_REPO'] = envBefore;
		rmSync(home, { recursive: true, force: true });
		rmSync(repo, { recursive: true, force: true });
	}
});

test('the step host registers the workflow runners: a workflow run continues past its plan phase through step.call', { timeout: 60_000 }, async () => {
	const home = mkdtempSync(join(tmpdir(), 'insrc-step-host-runners-'));
	const repo = mkdtempSync(join(tmpdir(), 'insrc-step-host-runners-repo-'));
	setGraphStorePath(join(home, 'graph.lmdb'));
	setLanceConnPath(join(home, 'lance'));
	try {
		const host = createStepCallHandler();
		const context: StepCallContext = { cwd: process.cwd() };
		const text = (frames: IpcStreamMessage[]): Record<string, unknown> => {
			assert.equal(frames[0]!.stream, 'done', JSON.stringify(frames[0]!.data));
			return JSON.parse((frames[0]!.data as StepEnvelope).content[0]!.text) as Record<string, unknown>;
		};
		const start = text(await collect(host, { tool: 'insrc_workflow_step', args: { phase: 'start', workflow: 'issue', focus: 'add a flag to the cli', repo }, context }));
		assert.equal(start['next'], 'emit_plan');
		// The issue workflow: its first step is a prompt for the controller, so no model is called
		// (brainstorm's elicit runner drafts with a model and must not be used here).
		const plan = { workflow: 'issue', steps: [{ id: 's1', runner: 'issue.capture', params: {} }, { id: 's2', runner: 'checklist.verify', params: {} }] };
		const next = text(await collect(host, { tool: 'insrc_workflow_step', args: { phase: 'plan', plan, state: start['state'] }, context }));
		assert.equal(next['next'], 'emit_step', JSON.stringify(next).slice(0, 300));
	} finally {
		await closeGraphStore();
		await closeLanceConn();
		rmSync(home, { recursive: true, force: true });
		rmSync(repo, { recursive: true, force: true });
	}
});

// --- cancellation over a real socket ------------------------------------------------

/** A stream handler that runs until its signal is aborted. */
function untilAborted() {
	const state = { started: false, aborted: false };
	let started: () => void = () => {};
	const startedP = new Promise<void>(r => { started = r; });
	let ended: () => void = () => {};
	const endedP = new Promise<void>(r => { ended = r; });
	const handler: StreamHandler = async (_p, _send, signal) => {
		state.started = true;
		started();
		await new Promise<void>(r => { if (signal.aborted) r(); else signal.addEventListener('abort', () => r()); });
		state.aborted = true;
		ended();
	};
	return { handler, state, started: startedP, ended: endedP };
}

/** An IpcServer serving `stream` on a temporary socket path, through its own connection handling. */
async function serve(stream: StreamHandlers, rpc: RpcHandlers = {}) {
	const ipc = new IpcServer(directDispatch(rpc, stream));
	const dir = mkdtempSync(join(tmpdir(), 'insrc-step-sock-'));
	const path = join(dir, 'd.sock');
	const server = createServer((socket: Socket) => {
		(ipc as unknown as { handleConnection(s: Socket): void }).handleConnection(socket);
	});
	await new Promise<void>(r => server.listen(path, () => r()));
	return {
		path,
		close: async () => { await new Promise<void>(r => server.close(() => r())); rmSync(dir, { recursive: true, force: true }); },
	};
}

/** Open a step.call stream and resolve once it is written. */
function openStepCall(path: string, tool: string, args: unknown): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const socket = createConnection(path);
		socket.on('error', reject);
		socket.on('connect', () => {
			socket.write(JSON.stringify({ id: 1, method: 'step.call', stream: true, params: { tool, args, context: { cwd: process.cwd() } } }) + '\n');
			resolve(socket);
		});
	});
}

const CREATED = '2026-07-18T00:00:00.000Z';
const GROUNDING: CodeReviewGrounding = { symbols: [{ entityId: 'sym:src/a.ts#f', file: 'src/a.ts', kind: 'function', name: 'f', signature: 'f(): void', callers: [], callees: [], testsReaching: [] }] };
const crDeps: CodeReviewStepDeps = {
	resolveSubject: async () => ({ ok: true, subject: {
		repoPath: '/repo', epicHash: 'e1a2b3c4d5e6f7a8', storyId: 's8', changedFiles: ['src/a.ts'],
		approvedLld:  { meta: { epicSlug: 'tag-filtering', createdAt: CREATED, epicCreatedAt: CREATED }, body: {} } as unknown as CodeReviewSubject['approvedLld'],
		approvedPlan: { body: { tasks: [] } } as unknown as CodeReviewSubject['approvedPlan'],
		buildRecord: null,
	} }),
	fetchGrounding: (p) => stepDaemonClient().fetchCodeReviewGrounding(p),
	fetchFreshness: (p) => stepDaemonClient().fetchCodeReviewFreshness(p),
	assembleDiffGrounding: async () => { throw new Error('not used'); },
	runReview: runCodeReview,
	write: () => { throw new Error('not used'); },
	sleep: async () => {},
	now: () => 0,
	freshnessTimeoutMs: () => 120000,
	readBuildAuthor: () => 'controller',
};

test('cancellation: closing the stream during a design-review wait and during a code-review wait aborts the inner run in the daemon', { timeout: 30_000 }, async () => {
	const review = untilAborted();
	const codeReview = untilAborted();
	const rpc: RpcHandlers = {
		'codeReview.grounding': async () => ({ ok: true, grounding: GROUNDING }),
		'codeReview.freshness': async () => ({ isProcessing: false, staleFiles: [] }),
	};
	const inner: StreamHandlers = { 'workflow.review': review.handler, 'codeReview.run': codeReview.handler };
	installStepDaemonClient(createInDaemonClient(rpc, inner));
	// The daemon's stream map: the inner review handlers and the step host, as index.ts registers them.
	const host = createStepCallHandler(stepToolTable({ codeReviewDeps: crDeps }));
	const srv = await serve({ ...inner, 'step.call': host }, rpc);
	const repo = mkdtempSync(join(tmpdir(), 'insrc-step-cancel-'));
	try {
		const dir = join(repo, 'docs', 'stub');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 's1.md'), '# Doc\n\nThe body.\n');
		writeFileSync(join(dir, 's1.json'), JSON.stringify({ meta: { workflow: 'design.story', epicHash: 'abcd', storyId: 'S001', authoredBy: 'controller' }, body: {} }));

		// A design review: the step waits on the daemon's review; the forwarder goes away.
		const s1 = await openStepCall(srv.path, 'insrc_review_step', { phase: 'start', artifact: join(dir, 's1.md'), repo });
		await review.started;
		assert.equal(review.state.aborted, false, 'the review is waiting');
		s1.destroy();
		await review.ended;
		assert.equal(review.state.aborted, true, 'closing the stream aborted the inner review run');

		// A code review the same way.
		const s2 = await openStepCall(srv.path, 'insrc_code_review_step', { phase: 'start', epicHash: 'e1a2b3c4d5e6f7a8', storyId: 's8', repo: '/repo' });
		await codeReview.started;
		assert.equal(codeReview.state.aborted, false, 'the code review is waiting');
		s2.destroy();
		await codeReview.ended;
		assert.equal(codeReview.state.aborted, true, 'closing the stream aborted the inner code-review run');
	} finally {
		installStepDaemonClient(undefined);
		await srv.close();
		rmSync(repo, { recursive: true, force: true });
	}
});

// --- the state stores' miss message -------------------------------------------------

test('state store miss: each of the four stores says the daemon was restarted and the run must be started again', async () => {
	const misses: [string, () => unknown][] = [
		['analyze',      () => loadAnalyzeState('no-such-token')],
		['workflow',     () => loadWorkflowState('no-such-token')],
		['review',       () => loadReviewState('no-such-token')],
		['review update', () => updateReviewState('no-such-token', {} as never)],
		['code-review',  () => loadCodeReviewState('no-such-token')],
	];
	for (const [store, miss] of misses) {
		await assert.rejects(async () => miss(), (err: unknown) => {
			const message = err instanceof Error ? err.message : '';
			assert.match(message, /the insrc daemon was restarted/, `${store}: ${message}`);
			assert.match(message, /Start the run again with phase='start'/, `${store}: ${message}`);
			assert.doesNotMatch(message, /server restarted/, store);
			return true;
		});
	}
});

test('insrc_analyze through step.call refuses bad arguments with a clear error, not a step-failed frame', async () => {
	const host = createStepCallHandler(stepToolTable());
	const context: StepCallContext = { cwd: process.cwd() };
	const cases: [unknown, RegExp][] = [
		[{}, /`focus` \(a non-empty string\) is required/],
		[{ focus: '   ' }, /`focus` \(a non-empty string\) is required/],
		[{ focus: 7 }, /`focus` \(a non-empty string\) is required/],
		[{ focus: 'q', repo: 3 }, /`repo` must be a string/],
		[{ focus: 'q', target: 'sql' }, /`target` must be one of code, docs, data, infra, generic/],
		[{ focus: 'q', scope: 'XXL' }, /`scope` must be one of XS, S, M, L, XL/],
		['not an object', /the arguments must be an object/],
	];
	for (const [args, message] of cases) {
		const frames = await collect(host, { tool: 'insrc_analyze', args, context });
		assert.equal(frames.length, 1);
		assert.equal(frames[0]!.stream, 'done', `${JSON.stringify(args)}: ${JSON.stringify(frames[0]!.data)}`);
		const env = frames[0]!.data as StepEnvelope;
		assert.equal(env.isError, true);
		assert.match(env.content[0]!.text, message, JSON.stringify(args));
	}
});
