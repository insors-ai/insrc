/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * TUI render tests. A fake `Services` is injected through the `App`'s
 * `services` prop and `pollMs = 0` disables the live interval, so no
 * component touches the socket or the filesystem. JSX is avoided (the
 * app is built with `createElement`) so this stays a `.test.ts` file
 * picked up by the existing test glob.
 *
 * Run: npx tsx --test src/cli/__tests__/tui.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { App } from '../app.js';
import type { Services } from '../services/index.js';
import type { DaemonStatus, RegisteredRepo } from '../../shared/types.js';
import type { ChainReport } from '../../workflow/chain.js';
import type { AmendmentRecord } from '../../workflow/amendments/types.js';
import type { SystemInfo } from '../../shared/system-info.js';
import type { ModelRecommendation } from '../../shared/model-recommender.js';

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 25));

function status(overrides: Partial<DaemonStatus> = {}): DaemonStatus {
	return { uptime: 3661, repos: [], queueDepth: 2, embeddingsPending: 0, ...overrides };
}

function repo(path: string, s: RegisteredRepo['status'] = 'ready'): RegisteredRepo {
	return { path, name: path.split('/').pop() ?? path, addedAt: '', status: s };
}

const CHAIN: ChainReport = {
	epicHash: 'a3f4b8c9d1e2f3a4',
	epicSlug: 'add-tag-filter',
	define: { exists: true, approved: true, rejected: false, path: '/r/docs/defines/DEF-add-tag-filter.md' },
	hld:    { exists: true, approved: false, rejected: false, path: '/r/docs/designs/HLD-add-tag-filter.md' },
	stories: [{ id: 's1', title: 'Story one', hasLld: false, approved: false, stale: false }],
	amendments: { pending: 0, approved: 0, rejected: 0 },
	tracker: { pushed: false },
	nextAction: { kind: 'approve-hld', command: 'insrc workflow approve …' },
};

function fakeServices(): Services {
	return {
		daemon: {
			isRunning:   () => true,
			getStatus:   async () => status(),
			startDaemon: async () => ({ started: true, logPath: '/tmp/.insrc/daemon.log', alreadyRunning: false }),
			stopDaemon:  async () => {},
			restart:     async () => ({ ok: true, steps: ['stop', 'start'] }),
			update:      async () => ({ ok: true, steps: ['sync', 'build'] }),
			backup:      async () => ({ targetDir: '/b', lmdbBytes: 0, lanceBytes: 0, elapsedMs: 0 }),
			compact:     async () => ({ beforeBytes: 0, afterBytes: 0, savedBytes: 0, elapsedMs: 0 }),
		},
		repo: {
			list:    async () => [],
			add:     async p => p,
			remove:  async p => p,
			reindex: async p => p,
		},
		workflow: {
			listEpics:        () => [],
			chain:            () => CHAIN,
			chainText:        () => '',
			approve:          () => ({ approval: { workflow: 'define', path: '', approvedAt: '' } }),
			reject:           () => ({ workflow: 'define', path: '', rejectedAt: '', rejectReason: '' }),
			ackStale:         () => ({ path: '', ackedAt: '', reason: '' }),
			amendments:       () => [],
			approveAmendment: () => ({} as AmendmentRecord),
			rejectAmendment:  () => ({} as AmendmentRecord),
			staleness:        () => [],
		},
		setup: {
			detect:       () => ({} as SystemInfo),
			recommend:    () => ({} as ModelRecommendation),
			apply:        () => '/cfg',
			modelsToPull: () => [],
			pullModels:   async () => [],
		},
	};
}

test('Daemon pane shows running status + uptime', async () => {
	const { lastFrame, unmount } = render(createElement(App, { services: fakeServices(), pollMs: 0 }));
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /running/);
	assert.match(frame, /1h 1m/);   // uptime 3661s
	unmount();
});

test('Daemon pane renders the down state when the daemon is unreachable', async () => {
	const svc = fakeServices();
	svc.daemon.getStatus = async () => { throw new Error('daemon is not running'); };
	const { lastFrame, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	assert.match(lastFrame() ?? '', /daemon is not running/);
	unmount();
});

test('number keys switch panes (Daemon → Repos)', async () => {
	const svc = fakeServices();
	svc.daemon.getStatus = async () => status({ repos: [repo('/work/repoA')] });
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	assert.match(lastFrame() ?? '', /compact/);   // Daemon-only key hint
	stdin.write('2');
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /reindex/);               // Repos-only key hint
	assert.match(frame, /\/work\/repoA/);
	unmount();
});

test('Repos add flow drives repo.add with the entered path', async () => {
	const svc = fakeServices();
	const addCalls: string[] = [];
	svc.repo.add = async p => { addCalls.push(p); return p; };
	const { stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('2');          // → Repos pane
	await settle();
	stdin.write('a');          // → add prompt
	await settle();
	stdin.write('/tmp/some-repo');
	await settle();
	stdin.write('\r');         // submit
	await settle();
	assert.deepEqual(addCalls, ['/tmp/some-repo']);
	unmount();
});

test('Workflows pane lists epics and opens the chain detail', async () => {
	const svc = fakeServices();
	svc.workflow.listEpics = () => [{ epicHash: 'a3f4b8c9d1e2f3a4', epicSlug: 'add-tag-filter' }];
	const chainCalls: string[] = [];
	svc.workflow.chain = h => { chainCalls.push(h); return CHAIN; };
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('3');          // → Workflows pane
	await settle();
	assert.match(lastFrame() ?? '', /add-tag-filter/);
	stdin.write('\r');         // open selected epic
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /approve-hld/);            // nextAction shown
	assert.match(frame, /approve HLD/);            // actionable item
	assert.equal(chainCalls.length >= 1, true);
	unmount();
});

test('Setup pane renders system + recommendation without crashing', async () => {
	const svc = fakeServices();
	svc.setup.detect = () => ({
		cpu: { model: 'M-Test', cores: 8 },
		ram: { totalMb: 32768, freeMb: 16384 },
		gpu: null,
		ollama: { available: true, version: '0.1', models: [] },
	} as unknown as SystemInfo);
	svc.setup.recommend = () => ({
		tier: 'balanced',
		coder: { model: 'qwen3-coder', params: '30b', pull: false },
		embedding: { model: 'qwen3-embedding', dims: 1024, pull: true },
		context: { shape: 'medium', tokens: 32768 },
	} as unknown as ModelRecommendation);
	svc.setup.modelsToPull = () => ['qwen3-embedding'];
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('4');          // → Setup pane
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Recommendation/);
	assert.match(frame, /qwen3-coder/);
	assert.match(frame, /pull models \(1\)/);
	unmount();
});
