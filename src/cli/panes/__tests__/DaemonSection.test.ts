/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * DaemonSection render tests (Story s2, t3). Renders the section against a fake
 * `debug.daemonStatus()` via createElement (JSX avoided so the .test.ts glob
 * picks it up); asserts the reachable card, the unreachable line, and the
 * graceful omission of absent optional fields.
 *
 * Run: npx tsx --test src/cli/panes/__tests__/DaemonSection.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { DaemonSection } from '../DaemonSection.js';
import type { DebugService, DaemonCardModel } from '../../services/debug-types.js';

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 25));

function renderSection(card: DaemonCardModel): ReturnType<typeof render> {
	const debug: DebugService = {
		sections: [{ id: 'daemon', title: 'Daemon' }],
		daemonStatus: async () => card,
	};
	return render(createElement(DaemonSection, { services: { debug } }));
}

test('reachable model renders running + uptime + socket + version/pid + repos with index state', async () => {
	const { lastFrame, unmount } = renderSection({
		reachable: true,
		uptimeSec: 3661,
		repoCount: 2,
		repos: [{ name: 'repoA', status: 'ready' }, { name: 'repoB', status: 'indexing' }],
		socket: '/home/u/.insrc/daemon.sock',
		pid: 4242,
		version: '1.2.3',
	});
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /running/);
	assert.match(frame, /up 1h 1m/);                 // formatUptime(3661)
	assert.match(frame, /\/home\/u\/\.insrc\/daemon\.sock/);
	assert.match(frame, /version\s+1\.2\.3/);
	assert.match(frame, /pid\s+4242/);
	assert.match(frame, /repos\s+2/);
	assert.match(frame, /repoA .*— ready/);
	assert.match(frame, /repoB .*— indexing/);       // exact index state, not collapsed to ready
	unmount();
});

test('unreachable model renders a single stopped/unreachable line and no running fields', async () => {
	const { lastFrame, unmount } = renderSection({ reachable: false });
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /stopped \/ unreachable/);
	assert.doesNotMatch(frame, /running/);
	assert.doesNotMatch(frame, /socket/);
	assert.doesNotMatch(frame, /repos/);
	unmount();
});

test('zero-repo reachable model renders repo-count 0 with no per-repo rows', async () => {
	const { lastFrame, unmount } = renderSection({
		reachable: true, uptimeSec: 5, repoCount: 0, repos: [], socket: '/s',
	});
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /repos\s+0/);
	assert.doesNotMatch(frame, /—/); // no per-repo status rows
	unmount();
});

test('version/pid lines are omitted when those optional fields are undefined', async () => {
	const { lastFrame, unmount } = renderSection({
		reachable: true, uptimeSec: 10, repoCount: 1, repos: [{ name: 'x', status: 'ready' }], socket: '/s',
	});
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /running/);
	assert.doesNotMatch(frame, /version/);
	assert.doesNotMatch(frame, /pid/);
	unmount();
});
