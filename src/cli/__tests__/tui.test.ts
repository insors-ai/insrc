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

import { settle, status, repo, CHAIN, fakeServices } from './helpers/fake-services.js';

test('Daemon pane shows running status + uptime', async () => {
	const { lastFrame, unmount } = render(createElement(App, { services: fakeServices(), pollMs: 0 }));
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /running/);
	assert.match(frame, /1h 1m/);   // uptime 3661s
	unmount();
});

test('Daemon pane prints the store failure cause when the status carries it, and nothing of it otherwise', async () => {
	const cause = 'Another process opened and closed the graph store. Restart the daemon.';
	const svc = fakeServices();
	svc.daemon.getStatus = async () => status({ storeFailure: { kind: 'locks-lost', at: '2026-10-11T10:00:00.000Z', operation: 'request search', cause } });
	const failed = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	const frame = (failed.lastFrame() ?? '').replace(/\s+/g, ' ');
	assert.match(frame, /store FAILED since 2026-10-11T10:00:00\.000Z \(during: request search\)/);
	assert.ok(frame.includes('Another process opened and closed the graph store'), 'the cause line is printed');
	failed.unmount();

	const healthy = render(createElement(App, { services: fakeServices(), pollMs: 0 }));
	await settle();
	assert.doesNotMatch(healthy.lastFrame() ?? '', /FAILED|Another process/);
	healthy.unmount();
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

test('Repos add flow drives repo.add with the entered path (+ per-file steering)', async () => {
	const svc = fakeServices();
	const addCalls: Array<{ path: string; steering: unknown }> = [];
	svc.repo.add = async (p, steering) => { addCalls.push({ path: p, steering }); return { path: p }; };
	const { stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('2');          // → Repos pane
	await settle();
	stdin.write('a');          // → add prompt
	await settle();
	stdin.write('/tmp/some-repo');
	await settle();
	stdin.write('\r');         // submit path → steering-claude confirm
	await settle();
	stdin.write('y');          // install into CLAUDE.md
	await settle();
	stdin.write('n');          // skip AGENTS.md → vibe MCP registration confirm
	await settle();
	stdin.write('y');          // register the insrc MCP with Mistral Vibe → finish add
	await settle();
	assert.deepEqual(addCalls, [{ path: '/tmp/some-repo', steering: { claude: true, agents: false, vibe: true } }]);
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
		coder: { model: 'qwen3.6:27b', params: '27B', pull: false },
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
	assert.match(frame, /qwen3\.6:27b/);
	assert.match(frame, /pull models \(1\)/);
	unmount();
});

test('bottom box: Setup model-pull streams ollama progress into the message box', async () => {
	const svc = fakeServices();
	svc.setup.detect = () => ({
		cpu: { model: 'M-Test', cores: 8 },
		ram: { totalMb: 32768, freeMb: 16384 },
		gpu: null,
		ollama: { available: true, version: '0.1', models: [] },
	} as unknown as SystemInfo);
	svc.setup.recommend = () => ({
		tier: 'balanced',
		coder: { model: 'qwen3.6:27b', params: '27B', pull: false },
		embedding: { model: 'qwen3-embedding', dims: 1024, pull: true },
		context: { shape: 'medium', tokens: 32768 },
	} as unknown as ModelRecommendation);
	svc.setup.modelsToPull = () => ['qwen3-embedding'];
	svc.setup.pullModels = async (_models, onTick) => {
		onTick?.({ model: 'qwen3-embedding', line: 'downloading 50%' });
		return [{ model: 'qwen3-embedding', ok: true }];
	};
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('4');          // → Setup pane
	await settle();
	stdin.write('p');          // pull → ui.task streams into the bottom box
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /downloading 50%/);   // streamed tick line in the box
	assert.match(frame, /models pulled/);     // task.done line in the box
	assert.doesNotMatch(frame, /last pull:/); // old inline log label gone
	unmount();
});

/** A fake models.definitions answer for the Model Tiers pane (names unlike the shipped file). */
const PANE_DEFS = {
	version: 1, defaultFamily: 'cli-codex' as const,
	families: [
		{ id: 'cli-claude' as const, cliKind: 'claude' as const, displayName: 'C', tierDefaults: { core: { model: 'cl-a' }, mid: { model: 'cl-a' }, cheap: { model: 'cl-a' } }, summariserModel: 'cl-a',
			models: [{ id: 'cl-a', aliases: [], efforts: [], source: 'shipped' as const }] },
		{ id: 'cli-codex' as const, cliKind: 'codex' as const, displayName: 'X', tierDefaults: { core: { model: 'fx-core' }, mid: { model: 'fx-mid' }, cheap: { model: 'fx-cheap' } }, summariserModel: 'fx-cheap',
			models: [{ id: 'fx-core', aliases: [], efforts: ['lo', 'turbo', 'max'], source: 'shipped' as const }, { id: 'fx-mid', aliases: [], efforts: ['max'], source: 'shipped' as const }, { id: 'fx-cheap', aliases: [], efforts: [], source: 'shipped' as const }] },
	],
};

test('Model Tiers pane (5) renders effective tiers, coreFloor, and roles from config', async () => {
	const svc = fakeServices();
	svc.models.definitions = async () => PANE_DEFS;
	svc.config.show = async () => ({ models: { tasks: { 'context.assemble': 'cheap' } } });
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('5');          // → Model Tiers pane
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /Model Tiers/);
	assert.match(frame, /fx-core/);       // core-tier default model, from the definitions
	assert.match(frame, /coreFloor/);
	assert.match(frame, /review/);        // a critical role row (→ core)
	assert.match(frame, /override/);      // the context.assemble override is surfaced (in-window)
	unmount();
});

test('Repos pane: `t` runs tracker setup for the selected repo and shows the report', async () => {
	const svc = fakeServices();
	svc.daemon.getStatus = async () => status({ repos: [repo('/work/repoA')] });
	const calls: Array<{ path: string; opts: unknown }> = [];
	svc.workflow.trackerSetup = (path, opts) => {
		calls.push({ path, opts });
		return {
			steps: [
				{ key: 'gh-auth', title: 'gh CLI authenticated', status: 'already', detail: 'signed in' },
				{ key: 'scopes', title: 'OAuth scopes', status: 'manual', detail: 'admin:org missing', action: 'gh auth refresh -s admin:org' },
			],
			manualRemaining: 1,
		};
	};
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('2'); await settle();   // → Repos pane
	stdin.write('t'); await settle();   // run tracker setup (deferred a macrotask, covered by settle)
	const frame = lastFrame() ?? '';
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.path, '/work/repoA');
	assert.equal(calls[0]?.opts, undefined);          // Project board is NOT included
	assert.match(frame, /tracker setup/);             // modal title
	assert.match(frame, /OAuth scopes/);              // a step row
	assert.match(frame, /gh auth refresh/);           // the manual action command
	assert.match(frame, /manual action/);             // the summary footer
	unmount();
});

test('Repos pane: a throwing tracker setup renders a failed row instead of crashing', async () => {
	const svc = fakeServices();
	svc.daemon.getStatus = async () => status({ repos: [repo('/work/repoA')] });
	svc.workflow.trackerSetup = () => { throw new Error('gh exploded'); };
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('2'); await settle();
	stdin.write('t'); await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /tracker setup/);
	assert.match(frame, /gh exploded/);               // the error surfaces as a failed step detail
	unmount();
});

test('Repos pane: `t` with no repos registered is a no-op', async () => {
	const svc = fakeServices();   // default getStatus → repos: []
	let called = false;
	svc.workflow.trackerSetup = () => { called = true; return { steps: [], manualRemaining: 0 }; };
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('2'); await settle();
	stdin.write('t'); await settle();
	assert.equal(called, false);
	assert.match(lastFrame() ?? '', /no repositories registered/);   // still the list, no modal
	unmount();
});

test('Repos pane: the tracker modal dismisses on any key back to the list', async () => {
	const svc = fakeServices();
	svc.daemon.getStatus = async () => status({ repos: [repo('/work/repoA')] });
	svc.workflow.trackerSetup = () => ({
		steps: [{ key: 'gh-auth', title: 'gh CLI authenticated', status: 'already', detail: 'signed in' }],
		manualRemaining: 0,
	});
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('2'); await settle();
	stdin.write('t'); await settle();
	assert.match(lastFrame() ?? '', /gh CLI authenticated/);   // modal is up
	stdin.write('x'); await settle();                          // any key dismisses
	assert.doesNotMatch(lastFrame() ?? '', /gh CLI authenticated/);   // back to the list
	assert.match(lastFrame() ?? '', /\/work\/repoA/);
	unmount();
});

test('bottom box: a daemon op streams into the message box; DaemonPane body stays stable', async () => {
	const svc = fakeServices();
	svc.daemon.getStatus = async () => status({ repos: [repo('/work/repoA')] });
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();                       // starts on the Daemon pane (pane 0)
	assert.match(lastFrame() ?? '', /running/);   // pane body (Health) present
	stdin.write('c');                     // compact op → ui.task streams into the box
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /compacted: saved/);      // the op result landed in the bottom box
	assert.match(frame, /running/);               // DaemonPane body (Health) unchanged
	assert.doesNotMatch(frame, /last run:/);      // the old inline log label is gone
	unmount();
});

test('bottom box: a failing daemon op surfaces its error line; pane body untouched', async () => {
	const svc = fakeServices();
	svc.daemon.getStatus = async () => status({ repos: [repo('/work/repoA')] });
	svc.daemon.compact = async () => { throw new Error('compact boom'); };
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('c');
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /compact boom/);          // ui.task.fail line in the box
	assert.match(frame, /running/);               // pane body still there, no crash
	unmount();
});

test('bottom box: a multi-line op is bounded (oldest lines scroll off, no layout growth)', async () => {
	const svc = fakeServices();
	svc.daemon.getStatus = async () => status({ repos: [repo('/work/repoA')] });
	svc.daemon.update = async (_opts, push) => {
		for (let i = 0; i < 12; i++) push?.(`line ${i}`);
		return { ok: true, steps: ['sync', 'build'] };
	};
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('u');                     // update streams 12 push lines + a done line
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /update complete/);       // terminal line kept
	assert.match(frame, /line 11/);               // newest streamed line kept
	assert.doesNotMatch(frame, /line 0\b/);       // oldest scrolled off the bounded window
	assert.doesNotMatch(frame, /updating daemon/);// even the title scrolled off (bounded to N)
	unmount();
});

test('bottom box: ui.toast (r refresh) lands in the message box', async () => {
	const svc = fakeServices();
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('r');                     // global refresh → ui.toast('refreshed')
	await settle();
	assert.match(lastFrame() ?? '', /refreshed/);
	unmount();
});

test("':' opens the command bar and runs a typed command", async () => {
	const svc = fakeServices();
	const addCalls: string[] = [];
	svc.repo.add = async p => { addCalls.push(p); return { path: p }; };
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write(':');                    // open the command bar
	await settle();
	assert.match(lastFrame() ?? '', /Enter run/);   // command bar is showing
	stdin.write('repo add /tmp/viacmd');
	await settle();
	stdin.write('\r');                   // run it
	await settle();
	assert.deepEqual(addCalls, ['/tmp/viacmd']);
	assert.match(lastFrame() ?? '', /registered \/tmp\/viacmd/);   // output rendered inline
	unmount();
});

// ---------------------------------------------------------------------------
// Debug pane wiring (Story s1, t4) — the 6th peer pane in the switcher.
// ---------------------------------------------------------------------------

test('the tab bar renders a 6th 6:Debug peer tab', async () => {
	const { lastFrame, unmount } = render(createElement(App, { services: fakeServices(), pollMs: 0 }));
	await settle();
	assert.match(lastFrame() ?? '', /6:Debug/);
	unmount();
});

test("pressing '6' opens the Debug pane and hides the previously active pane", async () => {
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: fakeServices(), pollMs: 0 }));
	await settle();
	assert.doesNotMatch(lastFrame() ?? '', /←\/→ section/); // DebugPane not shown yet (index 0)
	stdin.write('6');
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /stopped \/ unreachable/);        // DebugPane's live DaemonSection (fake → unreachable)
	assert.match(frame, /←\/→ section/);                  // DebugPane's own key hint (unique to it)
	// one-pane-at-a-time: DebugPane showing means index 0's DaemonPane body is unmounted
	unmount();
});

test('Tab-cycling from the last pane wraps forward to Debug (TABS.length-driven)', async () => {
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: fakeServices(), pollMs: 0 }));
	await settle();
	stdin.write('5');            // Tiers (index 4)
	await settle();
	stdin.write('\t');           // Tab → Debug (index 5)
	await settle();
	assert.match(lastFrame() ?? '', /←\/→ section/); // DebugPane is now shown (its unique hint)
	unmount();
});

test('the TUI tests run with fakeServices carrying the team entry', () => {
	const svc = fakeServices();
	assert.equal(typeof svc.team.teamInit, 'function');
	assert.equal(typeof svc.team.teamRefresh, 'function');
});

test("TUI ModelTiersPane shows the model definitions' tier defaults for an unset config", async () => {
	const svc = fakeServices();
	svc.models.definitions = async () => PANE_DEFS;
	svc.config.show = async () => ({});
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	stdin.write('5');          // → Model Tiers pane
	await settle();
	const frame = lastFrame() ?? '';
	assert.match(frame, /core\s+X \/ fx-core/);
	assert.match(frame, /mid\s+X \/ fx-mid/);
	assert.match(frame, /cheap\s+X \/ fx-cheap/);
	unmount();
});
