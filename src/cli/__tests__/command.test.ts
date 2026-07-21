/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Command-bar interpreter tests — parse + dispatch against a fake
 * Services (no ink, no daemon).
 *
 * Run: npx tsx --test src/cli/__tests__/command.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCommand, COMMAND_HELP, type CommandCtx } from '../command.js';
import type { Services } from '../services/index.js';

interface Spies {
	repoAdd: string[];
	configWrite: Array<{ path: string; value: unknown }>;
	panes: number[];
	exited: boolean;
}

function ctxWith(overrides: Partial<Services> = {}): { ctx: CommandCtx; spies: Spies } {
	const spies: Spies = { repoAdd: [], configWrite: [], panes: [], exited: false };
	const base: Services = {
		daemon: {
			isRunning: () => true,
			getStatus: async () => ({ uptime: 61, repos: [], queueDepth: 3, embeddingsPending: 0, modelPullStatus: 'ready' }),
			startDaemon: async () => ({ started: true, logPath: '', alreadyRunning: false, pid: 42 }),
			stopDaemon: async () => {},
			restart: async () => ({ ok: true, steps: [] }),
			update: async () => ({ ok: true, steps: ['sync', 'build'] }),
			backup: async () => ({ targetDir: '/b', lmdbBytes: 0, lanceBytes: 0, elapsedMs: 0 }),
			compact: async () => ({ beforeBytes: 0, afterBytes: 0, savedBytes: 1024, elapsedMs: 500 }),
		},
		repo: {
			list: async () => [],
			add: async p => { spies.repoAdd.push(p); return p; },
			remove: async p => p,
			reindex: async p => p,
		},
		workflow: {
			listEpics: () => [{ epicHash: 'a3f4b8c9d1e2f3a4', epicSlug: 'x' }],
			chain: () => ({} as never),
			chainText: () => 'define: approved\nhld: pending',
			approve: () => ({ approval: { workflow: 'design.epic', path: '', approvedAt: '' } }),
			reject: () => ({ workflow: 'define', path: '', rejectedAt: '', rejectReason: '' }),
			ackStale: () => ({ path: '/p', ackedAt: '', reason: '' }),
			amendments: () => [],
			approveAmendment: () => ({} as never),
			rejectAmendment: () => ({} as never),
			staleness: () => [],
		},
		setup: {
			detect: () => ({} as never),
			recommend: () => ({ tier: 'balanced', coder: { model: 'c' }, embedding: { model: 'e' }, context: { shape: 'medium' } } as never),
			apply: () => '/cfg',
			modelsToPull: () => [],
			pullModels: async () => [],
		},
		config: {
			show: async () => ({ models: { providers: { local: { embeddingDim: 768 } }, analyze: { shaperProvider: 'cli-claude' } } }),
			write: async (path, value) => { spies.configWrite.push({ path, value }); return { ok: true }; },
			reload: async () => ({ ok: true }),
		},
		...overrides,
	};
	const ctx: CommandCtx = {
		services: base,
		repoPath: '/repo',
		setPane: i => spies.panes.push(i),
		onLog: () => {},
		exit: () => { spies.exited = true; },
	};
	return { ctx, spies };
}

test('help lists the command reference', async () => {
	const { ctx } = ctxWith();
	assert.deepEqual(await runCommand('help', ctx), [...COMMAND_HELP]);
});

test('repo add dispatches to repo.add with the path', async () => {
	const { ctx, spies } = ctxWith();
	const out = await runCommand('repo add /work/myrepo', ctx);
	assert.deepEqual(spies.repoAdd, ['/work/myrepo']);
	assert.match(out[0] ?? '', /registered \/work\/myrepo/);
});

test('daemon status renders a one-line summary', async () => {
	const { ctx } = ctxWith();
	const out = await runCommand('daemon status', ctx);
	assert.match(out[0] ?? '', /uptime 1m 1s · queue 3/);
});

test('config list shows known options (default) merged with set values', async () => {
	const { ctx } = ctxWith();
	const out = await runCommand('config list', ctx);
	// a set value is tagged (set) with its current value
	assert.ok(out.some(l => l.includes('models.providers.local.embeddingDim') && l.includes('= 768') && l.includes('(set)')));
	assert.ok(out.some(l => l.includes('models.analyze.shaperProvider') && l.includes('cli-claude') && l.includes('(set)')));
	// an unset known option is tagged (default) with its default value
	assert.ok(out.some(l => l.includes('models.providers.local.host') && l.includes('http://localhost:11434') && l.includes('(default)')));
	assert.ok(out.some(l => l.includes('models.providers.local.coreModel') && l.includes('(default)')));
});

test('config list <search> filters options by substring', async () => {
	const { ctx } = ctxWith();
	const out = await runCommand('config list analyze', ctx);
	assert.ok(out.length > 0);
	assert.ok(out.every(l => l.includes('analyze')));
	assert.ok(out.some(l => l.includes('models.analyze.shaperProvider')));
	// a non-matching known option is excluded
	assert.ok(!out.some(l => l.includes('providers.local.host')));
});

test('config get navigates a dot-path', async () => {
	const { ctx } = ctxWith();
	assert.deepEqual(await runCommand('config get models.providers.local.embeddingDim', ctx), ['models.providers.local.embeddingDim = 768']);
	assert.deepEqual(await runCommand('config get models.missing', ctx), ['models.missing = (unset)']);
});

test('config set parses JSON values (number) and writes the dot-path', async () => {
	const { ctx, spies } = ctxWith();
	const out = await runCommand('config set models.embeddingDim 1024', ctx);
	assert.deepEqual(spies.configWrite, [{ path: 'models.embeddingDim', value: 1024 }]);
	assert.match(out[0] ?? '', /set models\.embeddingDim = 1024/);
});

test('config set keeps a non-JSON token as a string', async () => {
	const { ctx, spies } = ctxWith();
	await runCommand('config set models.local qwen3-coder:latest', ctx);
	assert.deepEqual(spies.configWrite, [{ path: 'models.local', value: 'qwen3-coder:latest' }]);
});

test('pane switches the active pane', async () => {
	const { ctx, spies } = ctxWith();
	await runCommand('pane workflows', ctx);
	assert.deepEqual(spies.panes, [2]);
});

test('quit calls exit', async () => {
	const { ctx, spies } = ctxWith();
	await runCommand('quit', ctx);
	assert.equal(spies.exited, true);
});

test('unknown command is reported, not thrown', async () => {
	const { ctx } = ctxWith();
	assert.match((await runCommand('frobnicate', ctx))[0] ?? '', /unknown command 'frobnicate'/);
});

test('service errors surface as a line, not a throw', async () => {
	const { ctx } = ctxWith();
	ctx.services.repo.add = async () => { throw new Error('path does not exist'); };
	assert.match((await runCommand('repo add /nope', ctx))[0] ?? '', /✗ path does not exist/);
});

test('workflow review renders verdict, counts, auto-fixes, and pending findings', async () => {
	const { ctx } = ctxWith();
	ctx.services.workflow.reviewArtifact = async () => ({
		report: {
			artifact: 'PLAN', stage: 'plan', verdict: 'block', findings: [],
			counts: { high: 2, med: 1, low: 3 }, reviewedAt: '', model: 'm',
		},
		applied: [{ claimId: 'c1', edits: [] }],
		skipped: [],
		pendingUser: [{
			claimId: 'c2', ref: 's2/t7', kind: 'citation', severity: 'HIGH',
			premise: 'wiring spans exactly two files', evidence: 'e', action: 'a', fixability: 'assisted',
		}],
	}) as never;
	const out = await runCommand('workflow review docs/plans/PLAN-x.md', ctx);
	assert.match(out[0] ?? '', /BLOCK · HIGH=2 MED=1 LOW=3/);
	assert.ok(out.some(l => /auto-fixed 1 finding/.test(l)));
	assert.ok(out.some(l => /\[HIGH\] s2\/t7 · assisted · citation/.test(l)));
});

test('workflow approve --override threads the reason to approve', async () => {
	const { ctx } = ctxWith();
	let seen: unknown;
	ctx.services.workflow.approve = ((p: string, t?: boolean, ov?: string) => {
		seen = [p, t, ov];
		return { approval: { workflow: 'plan', path: '', approvedAt: '' } };
	}) as never;
	const out = await runCommand('workflow approve docs/plans/PLAN-x.md --override findings are non-material', ctx);
	assert.deepEqual(seen, ['docs/plans/PLAN-x.md', true, 'findings are non-material']);
	assert.match(out[0] ?? '', /approved plan \(review overridden\)/);
});

test('workflow approve surfaces a review block as a line, not a throw', async () => {
	const { ctx } = ctxWith();
	ctx.services.workflow.approve = (() => {
		const e = new Error('blocked'); e.name = 'ReviewBlockedError';
		(e as { summary?: string }).summary = '2 HIGH · 1 MED · 3 LOW';
		throw e;
	}) as never;
	const out = await runCommand('workflow approve docs/plans/PLAN-x.md', ctx);
	assert.match(out[0] ?? '', /blocked by review \(2 HIGH · 1 MED · 3 LOW\)/);
});

test('workflow run streams progress via onLog and reports path + review verdict', async () => {
	const { ctx } = ctxWith();
	const logged: string[] = [];
	(ctx as { onLog: (l: string) => void }).onLog = (l) => logged.push(l);
	ctx.services.workflow.runWorkflowStreaming = (async (_repo: string, wf: string, focus: string, _params: unknown, onLine: (l: string) => void) => {
		onLine('▸ decompose');
		onLine('▸ plan-ready');
		return { path: '/docs/def.md', runId: 'wf-1', verdict: 'pass', counts: { high: 0, med: 0, low: 2 } };
	}) as never;
	const out = await runCommand('workflow run define add a build thing', ctx);
	assert.ok(logged.some(l => /running define — add a build thing/.test(l)), 'logged the run start');
	assert.ok(logged.some(l => /decompose/.test(l)), 'streamed a progress frame');
	assert.match(out[0] ?? '', /✓ define done · \/docs\/def\.md · review pass \(H0\/M0\/L2\)/);
});
