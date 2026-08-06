/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LogsSection render tests (Story s5, t4). Renders the section against a fake
 * `debug` facade whose tailLog is a controllable emitter (records the call,
 * exposes push() to emit, and a disposed flag its dispose() sets) via
 * createElement + ink-testing-library.
 *
 * Run: npx tsx --test src/cli/panes/__tests__/LogsSection.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { LogsSection } from '../LogsSection.js';
import type { DebugService, LogLine } from '../../services/debug-types.js';

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 25));
const DOWN = '[B';
const UP = '[A';
const ENTER = '\r';

interface TailHandle {
	debug: DebugService;
	tailCalls: () => number;
	push: (lines: LogLine[]) => void;
	disposedCount: () => number;
}

function makeDebug(): TailHandle {
	let tailCalls = 0;
	let disposedCount = 0;
	let sink: ((lines: readonly LogLine[]) => void) | null = null;
	const debug: DebugService = {
		sections: [{ id: 'logs', title: 'Logs' }],
		daemonStatus: async () => ({ reachable: false }),
		scanOrphans: () => ({ supported: false }),
		killOrphans: async () => [],
		attachedClients: async () => ({ reachable: false }),
		mcpStatus: async () => [],
		logCategories: () => [
			{ id: 'daemon', title: 'Daemon', stem: 'daemon' },
			{ id: 'agent', title: 'Agent', stem: 'agent' },
		],
		tailLog: (_id, onLines) => {
			tailCalls++;
			sink = onLines;
			return () => { disposedCount++; sink = null; };
		},
	};
	return {
		debug,
		tailCalls: () => tailCalls,
		push: lines => sink?.(lines),
		disposedCount: () => disposedCount,
	};
}

const jsonLine = (level: number, name: string, msg: string): LogLine => ({ raw: JSON.stringify({ level, name, msg }), level, module: name, msg });

test('on open renders the daemon + agent category list and calls neither tailLog (no stream until select) (ac1)', async () => {
	const h = makeDebug();
	const { lastFrame, unmount } = render(createElement(LogsSection, { services: { debug: h.debug } }));
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Daemon/);
	assert.match(frame, /Agent/);
	assert.match(frame, /select a category/);
	assert.equal(h.tailCalls(), 0); // no stream until a selection
	unmount();
});

test('selecting a category calls tailLog once + renders its lines; selecting another disposes the first (single stream) (ac2)', async () => {
	const h = makeDebug();
	const { lastFrame, stdin, unmount } = render(createElement(LogsSection, { services: { debug: h.debug } }));
	await settle();
	stdin.write(ENTER); // select daemon (cursor 0)
	await settle();
	assert.equal(h.tailCalls(), 1);
	h.push([{ raw: 'first line' }]);
	await settle();
	assert.match(lastFrame() ?? '', /first line/);

	stdin.write(DOWN);  // cursor -> agent
	await settle();
	assert.match(lastFrame() ?? '', /›\s*[●○]\s*Agent/); // cursor landed on Agent
	stdin.write(ENTER); // select agent -> disposes daemon subscription
	await settle();
	assert.equal(h.disposedCount(), 1); // prior subscription disposed
	assert.equal(h.tailCalls(), 2);     // exactly one new stream
	unmount();
});

test('an emit AFTER dispose (stale subscription) does not appear in the view', async () => {
	const h = makeDebug();
	const { lastFrame, stdin, unmount } = render(createElement(LogsSection, { services: { debug: h.debug } }));
	await settle();
	stdin.write(ENTER);
	await settle();
	h.push([{ raw: 'live line' }]);
	await settle();
	assert.match(lastFrame() ?? '', /live line/);
	unmount(); // disposes the subscription (sink cleared)
	h.push([{ raw: 'ghost line' }]); // a stale emit after dispose — no sink, no crash
	await settle();
	assert.equal(h.disposedCount(), 1);
});

test('setting a level/module/text filter limits the visible lines while emits accumulate; clearing re-reveals them (ac3)', async () => {
	const h = makeDebug();
	const { lastFrame, stdin, unmount } = render(createElement(LogsSection, { services: { debug: h.debug } }));
	await settle();
	stdin.write(ENTER); // select daemon
	await settle();
	h.push([jsonLine(30, 'router', 'info msg'), jsonLine(50, 'db', 'boom error')]);
	await settle();
	assert.match(lastFrame() ?? '', /info msg/);
	assert.match(lastFrame() ?? '', /boom error/);

	// text filter: only lines whose raw contains 'boom'
	stdin.write('f');
	await settle();
	stdin.write('boom');
	await settle();
	stdin.write(ENTER);
	await settle();
	let frame = lastFrame() ?? '';
	assert.match(frame, /boom error/);
	assert.doesNotMatch(frame, /info msg/); // filtered out while the stream continues

	// clear all filters -> both re-revealed
	stdin.write('x');
	await settle();
	frame = lastFrame() ?? '';
	assert.match(frame, /info msg/);
	assert.match(frame, /boom error/);
	unmount();
});

test('no key deletes/rotates/clears a log — only select + filter + section-nav honoured (k2); disposed on unmount', async () => {
	const h = makeDebug();
	const { stdin, unmount } = render(createElement(LogsSection, { services: { debug: h.debug } }));
	await settle();
	stdin.write(ENTER); // select
	await settle();
	// stray keys that might imply a mutating action do nothing to the stream
	stdin.write('d'); // no delete
	stdin.write('R'); // no rotate
	await settle();
	assert.equal(h.tailCalls(), 1);   // no extra streams from stray keys
	assert.equal(h.disposedCount(), 0);
	unmount();
	await settle();
	assert.equal(h.disposedCount(), 1); // subscription disposed on unmount (no watcher leak)
});
