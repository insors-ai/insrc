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
	const props: DebugPaneProps = { services: { debug: { sections, daemonStatus: async () => ({ reachable: false }) } } };
	return render(createElement(CaptureContext.Provider, { value: captured }, createElement(DebugPane, props)));
}

test('initial render shows all three section tabs with daemon active', async () => {
	const { lastFrame, unmount } = renderPane(THREE);
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Daemon/);
	assert.match(frame, /MCP/);
	assert.match(frame, /Logs/);
	// default active section body is the daemon placeholder
	assert.match(frame, /Daemon diagnostics/);
	assert.doesNotMatch(frame, /MCP diagnostics/);
	unmount();
});

test('a right-arrow keypress switches the active section without unmounting', async () => {
	const { lastFrame, stdin, unmount } = renderPane(THREE);
	await settle();
	stdin.write(RIGHT);
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /MCP diagnostics/);          // moved to mcp
	assert.doesNotMatch(frame, /Daemon diagnostics/); // prior section hidden
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
	assert.match(frame, /Daemon diagnostics/);
	assert.doesNotMatch(frame, /MCP diagnostics/);
	unmount();
});

test('cycling on a single-section registry is an idempotent no-op', async () => {
	const { lastFrame, stdin, unmount } = renderPane([{ id: 'daemon', title: 'Daemon' }]);
	await settle();
	stdin.write(RIGHT);
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Daemon diagnostics/); // unchanged, no crash
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
