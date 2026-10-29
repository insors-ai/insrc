/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story 5d393a4b S001 / t6: a live analyze run is known by its owner thread on the status board,
 * and analyze.run.status / analyze.run.purge from any session reach that owner, the only thread
 * whose live count is true.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/analyze-run-owner.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import { isRunLive, raiseRunLive, lowerRunLive, setLiveRunPublisher, trackRunLive } from '../../../analyze/orchestrator/live-runs.js';
import { directDispatch } from '../../server.js';
import type { DeliverEnvelope } from '../../server.js';
import { HubClient, serveHub } from '../channel.js';
import type { MethodClass, SessionId } from '../channel.js';
import { methodClasses } from '../method-class.js';
import { TargetRegistry } from '../registry.js';
import { Router } from '../router.js';
import type { RouterSessions } from '../router.js';
import { StatusBoard, StatusBoardClient, statusBoardHubHandlers } from '../status-board.js';
import { serveRequests } from '../worker-requests.js';

const tick = (ms = 10): Promise<void> => new Promise(r => setTimeout(r, ms));

test('live runs: the publisher hears a run id when it becomes live and when it stops, once each, however many runs share the id', () => {
	const heard: string[] = [];
	setLiveRunPublisher((runId, live) => heard.push(`${runId} ${live ? 'live' : 'done'}`));
	try {
		raiseRunLive('r1');
		const release = trackRunLive('r1');
		assert.equal(isRunLive('r1'), true);
		lowerRunLive('r1');
		assert.deepEqual(heard, ['r1 live'], 'still live while one run remains');
		release();
		release();
		assert.deepEqual(heard, ['r1 live', 'r1 done']);
		assert.equal(isRunLive('r1'), false);
	} finally { setLiveRunPublisher(undefined); }
});

test("status board: a worker's live analyze runs reach the board through the hub; a stop from another thread or the owner's exit is handled", async () => {
	const board = new StatusBoard();
	const { port1, port2 } = new MessageChannel();
	const stop = serveHub(port1, statusBoardHubHandlers(board));
	const client = new StatusBoardClient(new HubClient(port2));
	try {
		client.markAnalyzeRun('a1', 41, true);
		client.markAnalyzeRun('a2', 41, true);
		client.markAnalyzeRun('b1', 42, true);
		await client.snapshot(); // ordered after the publishes on the same port
		assert.equal(board.analyzeRunOwner('a1'), 41);
		board.markAnalyzeRun('a1', 42, false);
		assert.equal(board.analyzeRunOwner('a1'), 41, 'a stop from a thread that does not own it leaves the owner');
		client.markAnalyzeRun('a1', 41, false);
		await client.snapshot();
		assert.equal(board.analyzeRunOwner('a1'), undefined);
		board.forgetAnalyzeRunsOf(41);
		assert.equal(board.analyzeRunOwner('a2'), undefined, "the owner's exit ends its runs");
		assert.equal(board.analyzeRunOwner('b1'), 42, "another thread's runs stay");
	} finally { stop(); port1.close(); port2.close(); }
});

test("router: analyze.run.status and analyze.run.purge from another session reach the worker running the analyze run; a run live nowhere is answered by the session's worker", { timeout: 10_000 }, async () => {
	const log: string[] = [];
	const registry = new TargetRegistry();
	const classOf = (m: string): MethodClass | undefined => methodClasses.classOf(m);
	const router = new Router({ classOf, registry, routed: new Set<MethodClass>(['session']), local: directDispatch({}) });
	const channels: MessageChannel[] = [];
	const stops: (() => void)[] = [];
	let next = 900;
	const worker = (name: string): number => {
		const channel = new MessageChannel();
		channels.push(channel);
		stops.push(serveRequests(channel.port2, directDispatch({
			'analyze.run.status': async p => { log.push(`${name} status ${(p as { runId: string }).runId}`); return { ok: true }; },
			'analyze.run.purge': async p => { log.push(`${name} purge ${(p as { runId: string }).runId}`); return { ok: true }; },
		})));
		const id = next++;
		router.attach(id, channel.port1);
		return id;
	};
	const workers = new Map<string, number>();
	const keyOf = (s?: SessionId): string => s === undefined ? 'unattributed' : `${s.label}:${s.pid}`;
	const busy: number[] = [];
	const sessions: RouterSessions = {
		workerFor: async s => { const key = keyOf(s); let id = workers.get(key); if (id === undefined) { id = worker(key); workers.set(key, id); } return { threadId: id }; },
		sharedWorker: async () => ({ threadId: worker('shared') }),
		started: () => {}, ended: () => {}, setQueued: () => {},
		startedOn: id => busy.push(id), endedOn: () => {},
	};
	const owners = new Map<string, number>();
	router.useSessions(sessions, undefined, runId => owners.get(runId));
	const A: SessionId = { label: 'mcp', pid: 3001 };
	const B: SessionId = { label: 'codex', pid: 3002 };
	const ask = (id: string, method: string, runId: string, session: SessionId): Promise<void> => new Promise(resolve => {
		const deliver: DeliverEnvelope = e => { if (e.kind === 'reply') resolve(); };
		router.forward({ kind: 'request', requestId: id, method, params: { runId }, stream: false, session }, deliver);
	});
	try {
		const a = (await sessions.workerFor(A)).threadId;
		owners.set('run-a', a);
		await ask('q1', 'analyze.run.status', 'run-a', B);
		await ask('q2', 'analyze.run.purge', 'run-a', B);
		await ask('q3', 'analyze.run.status', 'run-nowhere', B);
		await tick();
		assert.deepEqual(log, ['mcp:3001 status run-a', 'mcp:3001 purge run-a', 'codex:3002 status run-nowhere']);
		assert.deepEqual(busy, [a, a], "the owner's worker counts as busy for each");
	} finally { for (const s of stops) s(); for (const c of channels) { c.port1.close(); c.port2.close(); } }
});
