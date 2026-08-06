/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DebugPane section-hosting tests (Story s1, t3). Renders the pane against a
 * fake `debug` facade via createElement (JSX avoided so the `.test.ts` glob
 * picks it up), wrapping in CaptureContext to exercise the capture gate.
 *
 * Run: npx tsx --test src/cli/panes/__tests__/DebugPane.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { DebugPane } from '../DebugPane.js';
import { CaptureContext } from '../../ui/context.js';
import type { DebugPaneProps, DebugSection } from '../../services/debug-types.js';

const THREE: readonly DebugSection[] = [
	{ id: 'daemon', title: 'Daemon' },
	{ id: 'mcp', title: 'MCP' },
	{ id: 'logs', title: 'Logs' },
];

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 25));
const RIGHT = '[C';

function renderPane(sections: readonly DebugSection[], captured = false): ReturnType<typeof render> {
	const props: DebugPaneProps = { services: { debug: { sections, daemonStatus: async () => ({ reachable: false }), scanOrphans: () => ({ supported: false }), killOrphans: async () => [], attachedClients: async () => ({ reachable: false }), mcpStatus: async () => [] } } };
	return render(createElement(CaptureContext.Provider, { value: captured }, createElement(DebugPane, props)));
}

test('initial render shows all three section tabs with daemon active', async () => {
	const { lastFrame, unmount } = renderPane(THREE);
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Daemon/);
	assert.match(frame, /MCP/);
	assert.match(frame, /Logs/);
	// default active section is the live DaemonSection (s2); the fake reports unreachable
	assert.match(frame, /stopped \/ unreachable/);
	assert.doesNotMatch(frame, /MCP diagnostics/);
	unmount();
});

test('a right-arrow keypress switches the active section without unmounting', async () => {
	const { lastFrame, stdin, unmount } = renderPane(THREE);
	await settle();
	stdin.write(RIGHT);
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /MCP clients/);              // moved to the live MCPSection (s4)
	assert.doesNotMatch(frame, /stopped \/ unreachable/); // prior (daemon) section hidden
	assert.match(frame, /Debug/);                     // pane still mounted (title present)
	unmount();
});

test('inner-section navigation is suppressed while captured', async () => {
	const { lastFrame, stdin, unmount } = renderPane(THREE, true);
	await settle();
	stdin.write(RIGHT);
	await settle();
	const frame = lastFrame() ?? '';
	// still on daemon — the capture gate disabled the pane's useInput
	assert.match(frame, /stopped \/ unreachable/);
	assert.doesNotMatch(frame, /MCP diagnostics/);
	unmount();
});

test('cycling on a single-section registry is an idempotent no-op', async () => {
	const { lastFrame, stdin, unmount } = renderPane([{ id: 'daemon', title: 'Daemon' }]);
	await settle();
	stdin.write(RIGHT);
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /stopped \/ unreachable/); // unchanged daemon section, no crash
	assert.match(frame, /Debug/);
	unmount();
});

test('an unknown active section id renders the inline fallback, not a throw', async () => {
	const bogus: readonly DebugSection[] = [{ id: 'bogus' as DebugSection['id'], title: 'Bogus' }];
	const { lastFrame, unmount } = renderPane(bogus);
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /unknown section/);
	unmount();
});

test('an empty section list renders the pane frame without throwing', async () => {
	const { lastFrame, unmount } = renderPane([]);
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Debug/); // Panel title still renders
	unmount();
});

// --- Story s2, t4: the Daemon section now mounts the live DaemonSection ---

function renderWithDaemon(card: import('../../services/debug-types.js').DaemonCardModel): ReturnType<typeof render> {
	const props: DebugPaneProps = { services: { debug: { sections: THREE, daemonStatus: async () => card, scanOrphans: () => ({ supported: false }), killOrphans: async () => [], attachedClients: async () => ({ reachable: false }), mcpStatus: async () => [] } } };
	return render(createElement(CaptureContext.Provider, { value: false }, createElement(DebugPane, props)));
}

test('selecting the Daemon section renders DaemonSection\'s running card from the debug facade', async () => {
	const { lastFrame, unmount } = renderWithDaemon({
		reachable: true, uptimeSec: 3661, repoCount: 1, repos: [{ name: 'repoA', status: 'ready' }], socket: '/s/daemon.sock',
	});
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /running/);                    // DaemonSection card, not the s1 placeholder
	assert.match(frame, /repoA .*— ready/);
	assert.doesNotMatch(frame, /Daemon diagnostics/);  // s1 placeholder is gone
	unmount();
});

test('with an unreachable daemonStatus() the Daemon section shows the stopped/unreachable line', async () => {
	const { lastFrame, unmount } = renderWithDaemon({ reachable: false });
	await settle();
	assert.match(lastFrame() ?? '', /stopped \/ unreachable/);
	unmount();
});
