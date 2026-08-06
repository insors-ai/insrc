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
import type { DebugService, DaemonCardModel, OrphanScanResult, KillOutcome } from '../../services/debug-types.js';

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 25));

function renderSection(card: DaemonCardModel): ReturnType<typeof render> {
	const debug: DebugService = {
		sections: [{ id: 'daemon', title: 'Daemon' }],
		daemonStatus: async () => card,
		scanOrphans: () => ({ supported: false }),
		killOrphans: async () => [],
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

// --- Story s3, t4: the orphan area (multi-select + ConfirmPrompt-gated kill) ---

const UP = '[A';
const DOWN = '[B';

function renderOrphans(opts: {
	scan: OrphanScanResult;
	onKill?: (pids: readonly number[]) => KillOutcome[];
}): ReturnType<typeof render> & { killCalls: number[][] } {
	const killCalls: number[][] = [];
	const debug: DebugService = {
		sections: [{ id: 'daemon', title: 'Daemon' }],
		daemonStatus: async () => ({ reachable: false }), // orphan area is independent of the card
		scanOrphans: () => opts.scan,
		killOrphans: async pids => {
			killCalls.push([...pids]);
			return opts.onKill ? opts.onKill(pids) : pids.map(p => ({ pid: p, result: 'terminated' as const }));
		},
	};
	const r = render(createElement(DaemonSection, { services: { debug } }));
	return Object.assign(r, { killCalls });
}

test('orphan area (POSIX) renders scan rows as recommendations', async () => {
	const { lastFrame, unmount } = renderOrphans({
		scan: { supported: true, orphans: [{ pid: 5150, command: 'node /x/daemon/index.js' }] },
	});
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Orphan daemon processes/);
	assert.match(frame, /5150/);
	unmount();
});

test('orphan area: empty scan renders the no-orphans line', async () => {
	const { lastFrame, unmount } = renderOrphans({ scan: { supported: true, orphans: [] } });
	await settle();
	assert.match(lastFrame() ?? '', /no orphan processes found/);
	unmount();
});

test('orphan area: select pid + kill opens ConfirmPrompt; Yes kills EXACTLY the selection + shows outcomes', async () => {
	const { lastFrame, stdin, killCalls, unmount } = renderOrphans({
		scan: { supported: true, orphans: [{ pid: 5150, command: 'a' }, { pid: 5151, command: 'b' }] },
		onKill: () => [{ pid: 5150, result: 'terminated' }],
	});
	await settle();
	stdin.write(' ');   // select the cursor row (pid 5150)
	await settle();
	stdin.write('k');   // request kill
	await settle();
	assert.match(lastFrame() ?? '', /Kill 1 selected orphan/);
	stdin.write('y');   // confirm
	await settle();
	assert.deepEqual(killCalls, [[5150]]);           // only the selected pid, not 5151
	assert.match(lastFrame() ?? '', /5150: terminated/);
	unmount();
});

test('orphan area: choosing No never calls killOrphans and dismisses the prompt', async () => {
	const { lastFrame, stdin, killCalls, unmount } = renderOrphans({
		scan: { supported: true, orphans: [{ pid: 5150, command: 'a' }] },
	});
	await settle();
	stdin.write(' ');
	await settle();
	stdin.write('k');
	await settle();
	assert.match(lastFrame() ?? '', /Kill 1 selected orphan/);
	stdin.write('n');
	await settle();
	assert.deepEqual(killCalls, []);
	assert.doesNotMatch(lastFrame() ?? '', /Kill 1 selected orphan/);
	unmount();
});

test('orphan area: a kill request with an empty selection is inert', async () => {
	const { lastFrame, stdin, killCalls, unmount } = renderOrphans({
		scan: { supported: true, orphans: [{ pid: 5150, command: 'a' }] },
	});
	await settle();
	stdin.write('k');   // no selection made
	await settle();
	assert.doesNotMatch(lastFrame() ?? '', /Kill .* selected orphan/); // no confirm opened
	assert.deepEqual(killCalls, []);
	unmount();
});

test('orphan area: multi-select across rows kills exactly both chosen pids', async () => {
	const { stdin, killCalls, unmount } = renderOrphans({
		scan: { supported: true, orphans: [{ pid: 5150, command: 'a' }, { pid: 5151, command: 'b' }, { pid: 5152, command: 'c' }] },
		onKill: pids => pids.map(p => ({ pid: p, result: 'forced' as const })),
	});
	await settle();
	stdin.write(' ');          // select 5150
	await settle();
	stdin.write(DOWN);
	stdin.write(DOWN);         // cursor -> 5152
	await settle();
	stdin.write(' ');          // select 5152
	await settle();
	stdin.write(UP);           // cursor -> 5151 (left unselected)
	await settle();
	stdin.write('k');
	await settle();
	stdin.write('y');
	await settle();
	assert.deepEqual(killCalls, [[5150, 5152]]);
	unmount();
});

test('orphan area (non-POSIX) renders the not-supported line with no scan/kill control', async () => {
	const { lastFrame, stdin, killCalls, unmount } = renderOrphans({ scan: { supported: false } });
	await settle();
	assert.match(lastFrame() ?? '', /not supported on this platform/);
	stdin.write(' ');
	stdin.write('k');
	await settle();
	assert.deepEqual(killCalls, []);
	unmount();
});
