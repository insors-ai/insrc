/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCPSection render tests (Story s4, t6). Renders the section against a fake
 * `debug` facade via createElement (JSX avoided so the .test.ts glob picks it
 * up); asserts the per-client mcp rows, the attached-session list, the daemon-
 * unreachable degrade, the read-only key handling (ac3/k5), and poll-cleanup on
 * unmount.
 *
 * Run: npx tsx --test src/cli/panes/__tests__/MCPSection.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { MCPSection } from '../MCPSection.js';
import type { DebugService, DebugStatusModel, McpClientStatus } from '../../services/debug-types.js';

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 25));
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

interface Fakes {
	mcp?: readonly McpClientStatus[];
	status?: DebugStatusModel;
}

function makeDebug(f: Fakes): { debug: DebugService; attachedCalls: () => number } {
	let attachedCalls = 0;
	const debug: DebugService = {
		sections: [{ id: 'mcp', title: 'MCP' }],
		daemonStatus: async () => ({ reachable: false }),
		scanOrphans: () => ({ supported: false }),
		killOrphans: async () => [],
		attachedClients: async () => { attachedCalls++; return f.status ?? { reachable: false }; },
		mcpStatus: async () => f.mcp ?? [],
	};
	return { debug, attachedCalls: () => attachedCalls };
}

function renderSection(f: Fakes, pollMs = 2000): ReturnType<typeof render> & { attachedCalls: () => number } {
	const { debug, attachedCalls } = makeDebug(f);
	const r = render(createElement(MCPSection, { services: { debug }, pollMs }));
	return Object.assign(r, { attachedCalls });
}

test('renders per-client mcp registration rows showing registered + connected independently (ac1)', async () => {
	const { lastFrame, unmount } = renderSection({
		mcp: [
			{ client: 'claude', available: true, registered: true, connected: true },
			{ client: 'codex', available: true, registered: true, connected: false },
		],
	});
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /MCP clients/);
	assert.match(frame, /claude .*registered · connected/);
	assert.match(frame, /codex .*registered · not connected/); // registered-but-not-connected
	unmount();
});

test('an unavailable client renders CLI not found', async () => {
	const { lastFrame, unmount } = renderSection({
		mcp: [{ client: 'claude', available: false, registered: false, connected: false }],
	});
	await settle();
	assert.match(lastFrame() ?? '', /claude .*CLI not found/);
	unmount();
});

test('renders the attached-session list with label + pid + connected-at (ac2)', async () => {
	const { lastFrame, unmount } = renderSection({
		status: { reachable: true, clients: [{ id: 7, label: 'mcp', pid: 4242, connectedAt: 1717, lastMethod: 'workflow.run' }] },
	});
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Attached sessions/);
	assert.match(frame, /mcp .*pid 4242 · since 1717/);
	unmount();
});

test('an empty non-self attached set renders no other sessions attached', async () => {
	const { lastFrame, unmount } = renderSection({
		// only this pane's own debug-status poll is attached — it is filtered out.
		status: { reachable: true, clients: [{ id: 1, label: 'cli', pid: 10, connectedAt: 5, lastMethod: 'daemon.debug-status' }] },
	});
	await settle();
	assert.match(lastFrame() ?? '', /no other sessions attached/);
	unmount();
});

test('an unreachable daemon renders the unreachable line while the mcp rows still show', async () => {
	const { lastFrame, unmount } = renderSection({
		mcp: [{ client: 'claude', available: true, registered: true, connected: true }],
		status: { reachable: false },
	});
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /daemon unreachable/);
	assert.match(frame, /claude .*registered · connected/); // ac1 rows survive a down daemon
	unmount();
});

test('no keypress disconnects/terminates a client — only r refresh is honoured (ac3/k5)', async () => {
	const { stdin, attachedCalls, unmount } = renderSection({ status: { reachable: false } }, 100_000);
	await settle();
	const afterMount = attachedCalls(); // the initial tick
	stdin.write('x'); // an unmapped key does nothing
	stdin.write('d'); // there is no disconnect action
	await settle();
	assert.equal(attachedCalls(), afterMount); // no refetch from stray keys
	stdin.write('r'); // explicit refresh re-reads
	await settle();
	assert.equal(attachedCalls(), afterMount + 1);
	unmount();
});

test('the poll interval fires while open and is cleared on unmount (ac2)', async () => {
	const { attachedCalls, unmount } = renderSection({ status: { reachable: false } }, 15);
	await sleep(60); // several poll cadences
	const whileOpen = attachedCalls();
	assert.ok(whileOpen >= 2, `expected polling (>=2 calls), got ${whileOpen}`);
	unmount();
	await sleep(60);
	assert.equal(attachedCalls(), whileOpen); // no further calls after unmount → interval cleared
});
