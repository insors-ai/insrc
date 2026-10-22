/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The MCP server holds no store and runs survive its restart (Epic c2ba6fa6,
 * Story s11, t12). Real processes: the real daemon (src/daemon/index.ts) and
 * the real MCP server (src/bin/insrc-mcp.ts) over stdio, both with HOME in a
 * temporary directory. No model is called: every input stops at a reply the
 * handlers give without one.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../db/lance/conn.js';
import { IpcServer } from '../../daemon/server.js';
import type { StreamHandler } from '../../daemon/server.js';
import { handleAnalyzeStep } from '../../daemon/steps/analyze-step/handler.js';
import { handleWorkflowStep } from '../../daemon/steps/workflow-step/handler.js';
import { STEP_TOOL_NAMES } from '../../shared/step-context.js';
import { registerWorkflowRunners } from '../../workflow/index.js';
import { alive, body, openPaths, sockOf, startDaemon, startMcp, storePaths } from './helpers/mcp-e2e.js';
import type { RunningDaemon } from './helpers/mcp-e2e.js';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-e2e-home-'));
const REPO = mkdtempSync(join(tmpdir(), 'insrc-e2e-repo-'));
let daemon: RunningDaemon;

before(async () => {
	const dir = join(REPO, 'docs', 'stub');
	mkdirSync(dir, { recursive: true });
	// the daemon runs in its own process, so the repository carries a real schema marker
	mkdirSync(join(REPO, '.insrc'), { recursive: true });
	writeFileSync(join(REPO, '.insrc', 'schema.json'), JSON.stringify({ version: 2 }));
	writeFileSync(join(dir, 's1.md'), '# Doc\n\nThe body.\n');
	writeFileSync(join(dir, 's1.json'), JSON.stringify({ meta: { workflow: 'design.story', epicHash: 'abcd', storyId: 'S001', authoredBy: 'daemon' }, body: {} }));
	daemon = await startDaemon(HOME);
});
after(async () => {
	await daemon?.stop();
	rmSync(HOME, { recursive: true, force: true });
	rmSync(REPO, { recursive: true, force: true });
});

/** One call of each moved tool, with inputs that need no model. */
const INPUTS: Record<string, Record<string, unknown>> = {
	insrc_analyze:          { focus: 'how does x work' },
	insrc_analyze_step:     { phase: 'start', focus: 'how does x work', repo: REPO },
	insrc_workflow_step:    { phase: 'start', workflow: 'issue', focus: 'add a flag to the cli', repo: REPO },
	insrc_build_step:       { phase: 'implement', target: 's1/t1', repo: REPO },
	insrc_review_step:      { phase: 'start', artifact: join(REPO, 'docs', 'stub', 's1.md'), repo: REPO },
	insrc_code_review_step: { phase: 'start', epicHash: 'abcdabcdabcdabcd', storyId: 's1', repo: REPO },
	insrc_triage:           { phase: 'start', focus: 'add a flag', repo: REPO },
};

const ANALYZE_PLAN  = { answerType: 'structural-map', synthesisHint: 'map the module', explorations: [] };
// The issue workflow: its first step is a prompt for the controller, so no model is called.
// (brainstorm's elicit runner drafts each turn with a model and must not be used here.)
const WORKFLOW_PLAN = { workflow: 'issue', steps: [{ id: 's1', runner: 'issue.capture', params: {} }, { id: 's2', runner: 'checklist.verify', params: {} }] };

test('no store in the MCP process: lsof of a real MCP server process shows no store file or lance path after each tool', { timeout: 180_000 }, async () => {
	// The check sees store paths where they are: the daemon holds them.
	assert.ok(storePaths(openPaths(daemon.pid)).some(p => p.endsWith('graph.lmdb')), 'lsof lists the daemon\'s store');

	const mcp = await startMcp(HOME, REPO);
	try {
		assert.deepEqual(Object.keys(INPUTS).sort(), [...STEP_TOOL_NAMES].sort());
		for (const [tool, args] of Object.entries(INPUTS)) {
			const result = await mcp.client.callTool({ name: tool, arguments: args });
			// The one-shot analyze replies in plain text; the others in JSON.
			const text = (result.content as { text: string }[])[0]!.text;
			assert.doesNotMatch(text, /daemon-unreachable|daemon-too-old/, `${tool} reached the daemon: ${text.slice(0, 300)}`);
			const held = openPaths(mcp.pid);
			assert.ok(held.length > 0, 'lsof lists the MCP process\'s files');
			assert.deepEqual(storePaths(held), [], `${tool}: the MCP process holds no store path`);
		}
	} finally { await mcp.close(); }
});

test('ac2 restart: an analyze step and a workflow step continue through a new MCP process with the same state token', { timeout: 180_000 }, async () => {
	const a = await startMcp(HOME, REPO);
	const aPid = a.pid;
	const analyzeStart  = body(await a.client.callTool({ name: 'insrc_analyze_step', arguments: INPUTS['insrc_analyze_step']! }));
	const workflowStart = body(await a.client.callTool({ name: 'insrc_workflow_step', arguments: INPUTS['insrc_workflow_step']! }));
	assert.equal(analyzeStart['next'], 'emit_plan');
	assert.equal(workflowStart['next'], 'emit_plan');
	await a.close();
	for (let i = 0; i < 50 && alive(aPid); i++) await new Promise(r => setTimeout(r, 100));
	assert.equal(alive(aPid), false, 'the first MCP process has exited');

	const b = await startMcp(HOME, REPO);
	try {
		assert.notEqual(b.pid, aPid);
		const analyzeNext = body(await b.client.callTool({ name: 'insrc_analyze_step', arguments: { phase: 'plan', plan: ANALYZE_PLAN, state: analyzeStart['state'] } }));
		assert.notEqual(analyzeNext['next'], 'error', JSON.stringify(analyzeNext).slice(0, 500));
		assert.ok(['emit_narrow', 'emit_bundle'].includes(String(analyzeNext['next'])), String(analyzeNext['next']));
		const workflowNext = body(await b.client.callTool({ name: 'insrc_workflow_step', arguments: { phase: 'plan', plan: WORKFLOW_PLAN, state: workflowStart['state'] } }));
		assert.equal(workflowNext['next'], 'emit_step', JSON.stringify(workflowNext).slice(0, 500));

		// Control: a token the daemon never minted is a miss naming a daemon restart.
		const miss = body(await b.client.callTool({ name: 'insrc_workflow_step', arguments: { phase: 'plan', plan: WORKFLOW_PLAN, state: 'never-minted-token' } }));
		assert.equal(miss['next'], 'error');
		assert.match(JSON.stringify(miss), /the insrc daemon was restarted/);
	} finally { await b.close(); }
});

/** A socket in front of the daemon's that records every byte the daemon sends back. */
async function recordingProxy(upstream: string, home: string): Promise<{ frames: () => Record<string, unknown>[]; close: () => Promise<void> }> {
	mkdirSync(join(home, '.insrc'), { recursive: true });
	let fromDaemon = '';
	const server: Server = createServer((client: Socket) => {
		const up = createConnection(upstream);
		// The bytes are passed on untouched; the record decodes them as a stream, so a
		// character split across chunks is recorded whole.
		const decoder = new StringDecoder('utf8');
		client.pipe(up);
		up.on('data', (d: Buffer) => { fromDaemon += decoder.write(d); client.write(d); });
		up.on('end', () => client.end());
		client.on('close', () => up.destroy());
		up.on('error', () => client.destroy());
	});
	await new Promise<void>(r => server.listen(sockOf(home), () => r()));
	return {
		frames: () => fromDaemon.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as Record<string, unknown>),
		close: () => new Promise<void>(r => server.close(() => r())),
	};
}

test('ac5 pass-through: emit_plan and emit_step prompts, schemas and state are byte-identical to the in-process replies', { timeout: 180_000 }, async () => {
	// The MCP server talks to the daemon through a recording proxy, so the text the
	// daemon put in each 'done' frame can be compared with what the client received.
	const proxyHome = mkdtempSync(join(tmpdir(), 'insrc-e2e-proxy-'));
	const proxy = await recordingProxy(daemon.sock, proxyHome);
	const mcp = await startMcp(proxyHome, REPO);
	const received: string[] = [];
	const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
		const r = await mcp.client.callTool({ name, arguments: args });
		const text = (r.content as { text: string }[])[0]!.text;
		received.push(text);
		return JSON.parse(text) as Record<string, unknown>;
	};
	try {
		const analyzePlan  = await call('insrc_analyze_step', INPUTS['insrc_analyze_step']!);
		const workflowPlan = await call('insrc_workflow_step', INPUTS['insrc_workflow_step']!);
		const workflowStep = await call('insrc_workflow_step', { phase: 'plan', plan: WORKFLOW_PLAN, state: workflowPlan['state'] });
		assert.equal(analyzePlan['next'], 'emit_plan');
		assert.equal(workflowPlan['next'], 'emit_plan');
		assert.equal(workflowStep['next'], 'emit_step');

		// 1. Through the MCP process, byte for byte what the daemon sent: prompt, schema and state.
		const done = proxy.frames().filter(f => f['stream'] === 'done').map(f => ((f['data'] as { content: { text: string }[] }).content[0]!.text));
		assert.equal(done.length, received.length);
		for (let i = 0; i < received.length; i++) assert.ok(done[i] === received[i], `reply ${i} differs from the daemon's frame`);

		// 2. The same as the handlers give in-process (on an empty temporary store, as the
		//    daemon's is): every field byte-identical, the state token apart, which is fresh per run.
		const store = mkdtempSync(join(tmpdir(), 'insrc-e2e-inproc-'));
		setGraphStorePath(join(store, 'graph.lmdb'));
		setLanceConnPath(join(store, 'lance'));
		try {
			const text = (env: { content: { text: string }[] }): Record<string, unknown> => JSON.parse(env.content[0]!.text) as Record<string, unknown>;
			registerWorkflowRunners();   // as the daemon's step host does
			const inAnalyze  = text(await handleAnalyzeStep(INPUTS['insrc_analyze_step']!));
			const inWorkflow = text(await handleWorkflowStep(INPUTS['insrc_workflow_step']!));
			const inStep     = text(await handleWorkflowStep({ phase: 'plan', plan: WORKFLOW_PLAN, state: inWorkflow['state'] }));
			for (const [label, viaMcp, inProc] of [['emit_plan (analyze)', analyzePlan, inAnalyze], ['emit_plan (workflow)', workflowPlan, inWorkflow], ['emit_step (workflow)', workflowStep, inStep]] as const) {
				assert.deepEqual(Object.keys(viaMcp), Object.keys(inProc), label);
				for (const key of Object.keys(inProc)) {
					if (key === 'state') {
						assert.equal(typeof viaMcp[key], 'string');
						assert.equal(String(viaMcp[key]).length, String(inProc[key]).length, `${label}: a token of the same form`);
						continue;
					}
					const got = JSON.stringify(viaMcp[key]);
					const want = JSON.stringify(inProc[key]);
					if (got !== want) {
						let i = 0;
						while (i < got.length && got[i] === want[i]) i += 1;
						assert.fail(`${label}: '${key}' differs from the in-process reply at character ${i}: via MCP …${got.slice(Math.max(0, i - 120), i + 160)}… in-process …${want.slice(Math.max(0, i - 120), i + 160)}…`);
					}
				}
			}
			for (const key of ['prompt', 'schema']) assert.ok(key in workflowStep && key in analyzePlan, `${key} is compared`);
		} finally {
			await closeGraphStore();
			await closeLanceConn();
			rmSync(store, { recursive: true, force: true });
		}
	} finally {
		await mcp.close();
		await proxy.close();
		rmSync(proxyHome, { recursive: true, force: true });
	}
});

test('ac3: with no daemon every moved tool returns DaemonUnreachableError through a real MCP process, which opens no store; against a daemon without step.call, DaemonTooOldError', { timeout: 180_000 }, async () => {
	// No daemon: an empty home.
	const empty = mkdtempSync(join(tmpdir(), 'insrc-e2e-nodaemon-'));
	try {
		const mcp = await startMcp(empty, REPO);
		try {
			for (const [tool, args] of Object.entries(INPUTS)) {
				const result = await mcp.client.callTool({ name: tool, arguments: args });
				assert.equal(result.isError, true, tool);
				const error = body(result)['error'] as { code: string; name: string };
				assert.equal(error.code, 'daemon-unreachable', tool);
				assert.equal(error.name, 'DaemonUnreachableError', tool);
				assert.deepEqual(storePaths(openPaths(mcp.pid)), [], `${tool}: no store opened`);
			}
		} finally { await mcp.close(); }
		const insrc = join(empty, '.insrc');
		const made = (await import('node:fs')).existsSync(insrc) ? (await import('node:fs')).readdirSync(insrc) : [];
		assert.deepEqual(made.filter(n => n.startsWith('graph.lmdb') || n === 'lance'), [], 'nothing of a store was created');
	} finally { rmSync(empty, { recursive: true, force: true }); }

	// A daemon without step.call: the real request server with only an older request served.
	const old = mkdtempSync(join(tmpdir(), 'insrc-e2e-old-'));
	mkdirSync(join(old, '.insrc'), { recursive: true });
	let ran = 0;
	const other: StreamHandler = async (_p, send) => { ran += 1; send({ id: 0, stream: 'done', data: {} }); };
	const ipc = new IpcServer({ 'daemon.status': async () => { ran += 1; return {}; } }, { 'workflow.review': other });
	const server = createServer((s: Socket) => { (ipc as unknown as { handleConnection(x: Socket): void }).handleConnection(s); });
	await new Promise<void>(r => server.listen(sockOf(old), () => r()));
	try {
		const mcp = await startMcp(old, REPO);
		try {
			for (const [tool, args] of Object.entries(INPUTS)) {
				const result = await mcp.client.callTool({ name: tool, arguments: args });
				const error = body(result)['error'] as { code: string; name: string; message: string };
				assert.equal(error.code, 'daemon-too-old', tool);
				assert.equal(error.name, 'DaemonTooOldError', tool);
				assert.match(error.message, /unknown method: step\.call/);
			}
		} finally { await mcp.close(); }
		assert.equal(ran, 0, 'nothing else on the older daemon ran');
	} finally {
		await new Promise<void>(r => server.close(() => r()));
		rmSync(old, { recursive: true, force: true });
	}
});
