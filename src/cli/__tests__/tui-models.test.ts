/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The TUI on the daemon's model definitions (Epic ce99b72065d03b1b, Story s5):
 * the Model Tiers pane, the unknown-model check screen, the Repos models view
 * and the not-running states, rendered through App with fake services whose
 * models.definitions answer names nothing in the shipped file.
 *
 * Run: npx tsx --test src/cli/__tests__/tui-models.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { render } from 'ink-testing-library';

import { App } from '../app.js';
import type { ConfigWriteResult } from '../services/config.js';
import type { ModelDefinitionsResult } from '../services/models.js';
import { MODEL_TIERS_DOWN } from '../panes/ModelTiersPane.js';
import { CANNOT_RECOMMEND } from '../services/setup.js';
import { REPO_MODELS_DOWN } from '../panes/RepoModelsView.js';
import { fakeServices, repo, settle, status } from './helpers/fake-services.js';

export const DEFS: ModelDefinitionsResult = {
	version: 1,
	defaultFamily: 'cli-codex',
	families: [
		{ id: 'cli-claude', cliKind: 'claude', displayName: 'FakeC', tierDefaults: { core: { model: 'c-big' }, mid: { model: 'c-big' }, cheap: { model: 'c-big' } }, summariserModel: 'c-big',
			models: [{ id: 'c-big', aliases: [], efforts: ['deep', 'deeper'], source: 'shipped' }] },
		{ id: 'cli-codex', cliKind: 'codex', displayName: 'FakeX', tierDefaults: { core: { model: 'x-a', effort: 'lo' }, mid: { model: 'x-a' }, cheap: { model: 'x-b' } }, summariserModel: 'x-b',
			models: [{ id: 'x-a', aliases: [], efforts: ['lo', 'turbo'], source: 'shipped' }, { id: 'x-b', aliases: ['xb'], efforts: ['lo'], source: 'shipped' }] },
		{ id: 'ollama', displayName: 'FakeLocal', toolLoopModel: 'loc:1',
			models: [{ id: 'loc:1', aliases: [], efforts: [], source: 'shipped', installed: true, memoryMb: 2000 }] },
	],
};

/** Fake services holding a mutable config: each whole-tier write updates it. */
export function tiersServices(tiers: Record<string, unknown>, results: ConfigWriteResult[] = []) {
	const svc = fakeServices();
	const writes: Array<[string | string[], unknown]> = [];
	const restarts: number[] = [];
	svc.models.definitions = async () => DEFS;
	svc.config.show = async () => ({ models: { tiers } });
	svc.config.write = async (path, value) => {
		writes.push([path, value]);
		const res = results.shift() ?? { ok: true, restartRequired: true };
		if (res.ok && typeof path === 'string' && path.startsWith('models.tiers.')) tiers[path.slice('models.tiers.'.length)] = value;
		return res;
	};
	svc.daemon.restart = async () => { restarts.push(1); return { ok: true, steps: ['stop', 'start'] }; };
	return { svc, writes, restarts };
}

const press = async (stdin: { write(s: string): void }, ...keys: string[]): Promise<void> => {
	for (const k of keys) { stdin.write(k); await settle(); }
};

test("tui-models.test.ts: Model Tiers pane cycles the fake answer's families, models and efforts and writes whole tiers; unserved model has no effort edit; refusals and restart shown", async () => {
	const tiers: Record<string, unknown> = {
		core:  { runner: 'cli-codex', model: 'x-a', effort: 'lo' },
		cheap: { runner: 'cli-codex', model: 'x-unknown', effort: 'turbo' },
	};
	const { svc, writes, restarts } = tiersServices(tiers, [{ ok: true, restartRequired: true }, { ok: true }, { ok: true }, { ok: true }, { ok: false, reason: 'rejected-model', detail: "models.tiers.core: model 'x-b' is rejected in cli-codex" }]);
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(stdin, '5');
	let frame = lastFrame() ?? '';
	assert.match(frame, /core\s+FakeX \/ x-a \/ lo \(set\)/);
	assert.match(frame, /mid\s+FakeX \/ x-a \/ \(cli default effort\) \(default\)/);
	assert.match(frame, /cheap\s+FakeX \/ x-unknown \/ turbo \(set\) not served/);

	// e on core: the next of '' + x-a's efforts.
	await press(stdin, 'e');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'cli-codex', model: 'x-a', effort: 'turbo' }]);
	assert.match(lastFrame() ?? '', /restart the daemon to apply \(R\)/);
	await press(stdin, 'R');
	assert.equal(restarts.length, 1, 'R restarts the daemon');

	// f on core: the next family (FakeLocal, no tier defaults) → its tool-loop model, no effort.
	await press(stdin, 'f');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'ollama', model: 'loc:1', effort: '' }]);
	// f again wraps to the first family's default for core.
	await press(stdin, 'f');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'cli-claude', model: 'c-big', effort: '' }]);
	// m cycles the family's models (one model: stays), then f to codex and m to x-b with the effort dropped.
	await press(stdin, 'f');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'cli-codex', model: 'x-a', effort: 'lo' }]);
	const before = writes.length;
	await press(stdin, 'm');
	assert.equal(writes.length, before + 1);
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'cli-codex', model: 'x-b', effort: 'lo' }]);
	assert.match(lastFrame() ?? '', /✗ not saved: rejected-model — models\.tiers\.core: model 'x-b' is rejected in cli-codex/);

	// The unserved cheap tier: e writes nothing and shows the hint.
	const n = writes.length;
	await press(stdin, 'j', 'j', 'e');
	assert.equal(writes.length, n, 'no write for an effort on an unserved model');
	frame = lastFrame() ?? '';
	assert.match(frame, /x-unknown is not a listed model: pick one with m, or check it with n/);
	// Every write was one whole tier object at models.tiers.<tier>.
	for (const [path, value] of writes) {
		assert.match(String(path), /^models\.tiers\.(core|mid|cheap)$/);
		assert.deepEqual(Object.keys(value as object).sort(), ['effort', 'model', 'runner']);
	}
	unmount();
});

test('tui-models.test.ts: daemon down shows the not-running message in the Model Tiers pane and Setup', async () => {
	const svc = fakeServices();
	svc.models.definitions = async () => { throw new Error('daemon is not running — start it with: insrc daemon start'); };
	svc.setup.detect = () => ({ cpu: { model: 'M-Test', cores: 8 }, ram: { totalMb: 32768, freeMb: 16384 }, gpu: null, ollama: { available: true, version: '0.1', models: [] } }) as never;
	const applied: unknown[] = [];
	svc.setup.apply = rec => { applied.push(rec); return '/tmp/config.json'; };
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(stdin, '5');
	let frame = lastFrame() ?? '';
	assert.ok(frame.includes(MODEL_TIERS_DOWN), frame);
	assert.doesNotMatch(frame, /Tiers \(family/, 'no tier list is shown');
	await press(stdin, '4');
	frame = lastFrame() ?? '';
	assert.ok(frame.includes(CANNOT_RECOMMEND), frame);
	assert.doesNotMatch(frame, /Recommendation/);
	await press(stdin, 'a');
	assert.deepEqual(applied, [], 'apply is not offered without a recommendation');
	unmount();
});

type CheckParams = { family: string; modelId: string; claimedEfforts: readonly string[] };
const disconnectedError = (method: string): Error => Object.assign(new Error(`the daemon closed the connection before answering ${method}`), { code: 'disconnected' });

/** Fake services for the check screen: scripted check / approve / restart / save answers, all recorded. */
function checkServices(script: {
	check?: Array<() => Promise<unknown>>; approve?: Array<() => Promise<unknown>>; restart?: Array<{ ok: boolean; error?: string }>;
	write?: ConfigWriteResult[]; definitions?: ModelDefinitionsResult;
}) {
	const tiers: Record<string, unknown> = { core: { runner: 'cli-codex', model: 'x-a', effort: 'lo' } };
	const { svc, writes } = tiersServices(tiers, script.write ?? []);
	const checks: CheckParams[] = [];
	const approves: unknown[] = [];
	const rejects: unknown[] = [];
	const restarts: number[] = [];
	const okResult = { checkId: 'c1', family: 'cli-codex', modelId: 'x-new', runs: true, inputLimit: { unit: 'tokens', max: 64000 },
		efforts: [{ effort: 'lo', verdict: 'accepted', evidence: 'ev-lo listed' }, { effort: 'turbo', verdict: 'rejected', evidence: 'ev-turbo not listed' }] };
	svc.models.check = (async (p: CheckParams) => { checks.push(p); const next = script.check?.shift(); return next !== undefined ? next() : okResult; }) as never;
	svc.models.approve = (async (p: unknown) => { approves.push(p); const next = script.approve?.shift(); return next !== undefined ? next() : { ok: true, restartRequired: true }; }) as never;
	svc.models.reject = (async (p: unknown) => { rejects.push(p); return { ok: true, restartRequired: true }; }) as never;
	svc.daemon.restart = async () => { restarts.push(1); const r = script.restart?.shift() ?? { ok: true }; return { ok: r.ok, steps: [], ...(r.error !== undefined ? { error: r.error } : {}) }; };
	if (script.definitions !== undefined) { const d = script.definitions; let first = true; svc.models.definitions = async () => { if (first) { first = false; return DEFS; } return d; }; }
	return { svc, writes, checks, approves, rejects, restarts };
}

/** Open the Model Tiers pane, type an unserved id for core and accept the default claimed efforts. */
async function openCheck(svc: ReturnType<typeof fakeServices>, modelId = 'x-new') {
	const r = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '5', 'n');
	r.stdin.write(modelId); await settle();
	r.stdin.write('\r'); await settle();
	r.stdin.write('\r'); await settle(); await settle();   // the claimed-efforts prompt: accept the default
	return r;
}

test('tui-models.test.ts: unknown model check, approve then restart then save, reject, runs:false', async () => {
	// Approve: nothing is saved; a failed restart saves nothing and does not re-approve; R again restarts then saves.
	const a = checkServices({ restart: [{ ok: false, error: 'boom' }, { ok: true }] });
	let r = await openCheck(a.svc);
	assert.deepEqual(a.checks, [{ family: 'cli-codex', modelId: 'x-new', claimedEfforts: ['lo', 'turbo'] }], "the family's effort names are claimed");
	let frame = r.lastFrame() ?? '';
	assert.match(frame, /\[x\] lo — accepted: ev-lo listed/);
	assert.match(frame, /\[ \] turbo — rejected: ev-turbo not listed/);
	assert.match(frame, /runs: yes · input limit: 64000 tokens/);
	const before = a.writes.length;
	await press(r.stdin, 'a');
	assert.deepEqual(a.approves, [{ checkId: 'c1', efforts: ['lo'] }]);
	assert.equal(a.writes.length, before, 'approving saves nothing');
	assert.match(r.lastFrame() ?? '', /Approved x-new \(levels: lo\) — restart the daemon to use it/);
	await press(r.stdin, 'R'); await settle();
	assert.match(r.lastFrame() ?? '', /approval recorded; restart failed: boom — the tier was not saved \(R retries\)/);
	assert.equal(a.writes.length, before, 'no save after a failed restart');
	await press(r.stdin, 'R'); await settle();
	assert.equal(a.restarts.length, 2);
	assert.equal(a.approves.length, 1, 'the approval is never sent again');
	assert.deepEqual(a.writes.at(-1), ['models.tiers.core', { runner: 'cli-codex', model: 'x-new', effort: 'lo' }]);
	assert.match(r.lastFrame() ?? '', /Tiers \(family/, 'back on the pane after the save');
	r.unmount();

	// A save refused after the restart shows its reason.
	const b = checkServices({ write: [{ ok: false, reason: 'rejected-model', detail: "model 'x-new' is rejected in cli-codex" }] });
	r = await openCheck(b.svc);
	await press(r.stdin, 'a', 'R'); await settle();
	assert.match(r.lastFrame() ?? '', /approval recorded; the tier was not saved: rejected-model — model 'x-new' is rejected in/);
	r.unmount();

	// Reject records the rejection and saves nothing.
	const c = checkServices({});
	r = await openCheck(c.svc);
	const n = c.writes.length;
	await press(r.stdin, 'x');
	assert.deepEqual(c.rejects, [{ checkId: 'c1' }]);
	assert.equal(c.writes.length, n);
	r.unmount();

	// runs:false offers no approve; 'a' does nothing.
	const d = checkServices({ check: [async () => ({ checkId: 'c2', family: 'cli-codex', modelId: 'x-new', runs: false, efforts: [{ effort: 'lo', verdict: 'accepted', evidence: 'listed' }], error: 'the codex CLI refused the model: nope' })] });
	r = await openCheck(d.svc);
	frame = r.lastFrame() ?? '';
	assert.match(frame, /the codex CLI refused the model: nope/);
	assert.match(frame, /lo — accepted: listed/, 'a runs:false result still shows its verdicts');
	assert.match(frame, /runs: no/);
	assert.doesNotMatch(frame, /\[x\]|\[ \]/, 'no levels to toggle');
	assert.match(frame, /x reject\s+esc back/);
	assert.doesNotMatch(frame, /a approve|space allow level|select/, 'only reject / back are offered');
	await press(r.stdin, 'a', ' ');
	assert.deepEqual(d.approves, []);
	await press(r.stdin, 'x');
	assert.deepEqual(d.rejects, [{ checkId: 'c2' }], 'reject still works');
	r.unmount();
});

test('tui-models.test.ts: interrupted check and outcome-unknown decision', async () => {
	// A lost connection on the check: interrupted, and c checks again.
	const a = checkServices({ check: [async () => { throw disconnectedError('models.check'); }] });
	let r = await openCheck(a.svc);
	assert.match(r.lastFrame() ?? '', /the check was interrupted: the daemon closed the connection — check again \(c\)/);
	await press(r.stdin, 'c'); await settle();
	assert.equal(a.checks.length, 2);
	assert.match(r.lastFrame() ?? '', /lo — accepted/);
	r.unmount();

	// A lost connection on approve: outcome unknown; reload reads the definitions and reports, without approving again.
	const recorded: ModelDefinitionsResult = { ...DEFS, families: DEFS.families.map(f => f.id !== 'cli-codex' ? f : { ...f, models: [...f.models, { id: 'x-new', aliases: [], efforts: ['lo'], source: 'user-approved' as const }] }) };
	const b = checkServices({ approve: [async () => { throw disconnectedError('models.approve'); }], definitions: recorded });
	r = await openCheck(b.svc);
	await press(r.stdin, 'a');
	assert.match(r.lastFrame() ?? '', /outcome unknown: the daemon disconnected before answering — reload \(l\)/);
	await press(r.stdin, 'l'); await settle();
	assert.match(r.lastFrame() ?? '', /recorded: approved — restart the daemon to use it/);
	assert.equal(b.approves.length, 1, 'not approved again');
	r.unmount();
});

test('tui-models.test.ts: repo models view edits only tasks and coreFloor', async () => {
	const REPO = '/w/my.repo';
	const { svc, writes } = tiersServices({ core: { runner: 'cli-codex', model: 'x-a', effort: 'lo' } }, [{ ok: true, restartRequired: true }, { ok: true }, { ok: true }]);
	svc.daemon.getStatus = async () => status({ repos: [repo(REPO)] });
	svc.config.show = async () => ({ models: { tiers: { core: { runner: 'cli-codex', model: 'x-a', effort: 'lo' } }, byRepo: { [REPO]: { tasks: { 'design.alternatives.judge': 'mid' } } } } });
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(stdin, '2', 'm'); await settle();
	let frame = lastFrame() ?? '';
	assert.match(frame, /Repos · models · \/w\/my\.repo/, 'the view of the selected repo');
	assert.match(frame, /core\s+FakeX \/ x-a/, 'global tier models shown read-only');
	assert.match(frame, /coreFloor\s+global/);
	assert.match(frame, /design\.alternatives\.enumerate\s+global/);
	assert.match(frame, /design\.alternatives\.judge\s+mid/);
	assert.doesNotMatch(frame, /runner|effort|\bf family|\bn new model/i, 'no runner, model or effort field');

	const retype = async (value: string): Promise<void> => {
		for (let i = 0; i < 8; i++) { stdin.write('\x7f'); await settle(); }
		stdin.write(value); await settle();
		stdin.write('\r'); await settle(); await settle();
	};
	// coreFloor → mid, at the literal-segment path (the dotted repo path is one segment).
	await press(stdin, 'e'); await retype('mid');
	// The first role → cheap: the whole tasks map, dotted role ids as flat keys.
	await press(stdin, 'j', 'e'); await retype('cheap');
	// Clearing a role (global) drops its key from the map.
	await press(stdin, 'j', 'e'); await retype('global');
	assert.deepEqual(writes, [
		[['models', 'byRepo', REPO, 'coreFloor'], 'mid'],
		[['models', 'byRepo', REPO, 'tasks'], { 'design.alternatives.judge': 'mid', 'design.alternatives.enumerate': 'cheap' }],
		[['models', 'byRepo', REPO, 'tasks'], {}],
	]);
	assert.ok(writes.every(([path]) => !JSON.stringify(path).includes('tiers')), 'nothing written under tiers');
	unmount();

	// Daemon down: the view says so and offers no edit.
	const down = tiersServices({});
	down.svc.daemon.getStatus = async () => status({ repos: [repo(REPO)] });
	down.svc.models.definitions = async () => { throw new Error('daemon is not running'); };
	const r = render(createElement(App, { services: down.svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '2', 'm'); await settle();
	assert.ok((r.lastFrame() ?? '').includes(REPO_MODELS_DOWN));
	await press(r.stdin, 'e');
	assert.deepEqual(down.writes, []);
	r.unmount();
});
