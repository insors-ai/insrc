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
	check?: Array<() => Promise<unknown>> | undefined; approve?: Array<() => Promise<unknown>> | undefined; restart?: Array<{ ok: boolean; error?: string | undefined }> | undefined;
	write?: ConfigWriteResult[] | undefined; definitions?: ModelDefinitionsResult | undefined;
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

test('tui-models.test.ts: Model Tiers pane retries after the daemon starts, names an older daemon, shows aliases and an effort the model does not take', async () => {
	// Down, then up: r on the not-running screen reloads.
	let up = false;
	const { svc } = tiersServices({ cheap: { runner: 'cli-codex', model: 'x-b', effort: '' }, core: { runner: 'cli-codex', model: 'x-b', effort: 'turbo' } });
	svc.models.definitions = async () => { if (!up) throw new Error('daemon is not running — start it with: insrc daemon start'); return DEFS; };
	let r = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '5');
	assert.ok((r.lastFrame() ?? '').includes(MODEL_TIERS_DOWN));
	up = true;
	await press(r.stdin, 'r'); await settle();
	let frame = r.lastFrame() ?? '';
	assert.match(frame, /Tiers \(family/, 'r reloads once the daemon answers');
	assert.match(frame, /cheap\s+FakeX \/ x-b \(xb\) \/ \(cli default effort\)/, "the model's aliases are shown");
	assert.match(frame, /core\s+FakeX \/ x-b \(xb\) \/ turbo \(set\) not accepted — runs at the CLI default/, 'an effort the model does not take is marked');
	assert.doesNotMatch(frame, /mid\s+FakeX[^\n]*not accepted/, 'no note for a tier whose effort the model takes');
	r.unmount();

	// An older daemon that does not know models.definitions: its error and the update, not "not running" — in the pane and in Setup.
	const old = tiersServices({});
	old.svc.models.definitions = async () => { throw new Error("unknown method 'models.definitions'"); };
	old.svc.setup.detect = () => ({ cpu: { model: 'M-Test', cores: 8 }, ram: { totalMb: 32768, freeMb: 16384 }, gpu: null, ollama: { available: true, version: '0.1', models: [] } }) as never;
	r = render(createElement(App, { services: old.svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '5');
	frame = r.lastFrame() ?? '';
	assert.ok(!frame.includes(MODEL_TIERS_DOWN), frame);
	assert.match(frame, /the daemon could not answer: unknown method 'models\.definitions' — if it is older than this/);
	await press(r.stdin, '4');
	assert.match(r.lastFrame() ?? '', /cannot recommend a local model: the daemon could not answer: unknown method[\s│]+'models\.definitions' — if it is older/);
	r.unmount();
});

test('tui-models.test.ts: check screen recovers from an expired check, offers an already-served id as a pick, reports the restart a save needs, and holds while restarting', async () => {
	// unknown-check on approve: the screen offers a fresh check, and c runs one.
	const a = checkServices({ approve: [async () => ({ ok: false, reason: 'unknown-check', detail: 'no pending check c1; run models.check again' })] });
	let r = await openCheck(a.svc);
	await press(r.stdin, 'a');
	assert.match(r.lastFrame() ?? '', /the daemon no longer holds this check \(it restarted or dropped it\) — check again \(c\)/);
	await press(r.stdin, 'c'); await settle();
	assert.equal(a.checks.length, 2);
	assert.match(r.lastFrame() ?? '', /lo — accepted/);
	r.unmount();

	// The daemon already serves the id (the definitions changed since the pane loaded): s saves it as a normal pick.
	const served: ModelDefinitionsResult = { ...DEFS, families: DEFS.families.map(f => f.id !== 'cli-codex' ? f : { ...f, models: [...f.models, { id: 'x-new', aliases: [], efforts: ['lo'], source: 'user-approved' as const }] }) };
	const b = checkServices({ check: [async () => ({ error: 'x-new is already a model or alias of cli-codex', recoverable: false })], definitions: served });
	r = await openCheck(b.svc);
	await settle();
	assert.match(r.lastFrame() ?? '', /x-new is served by the family now — save it as the core model \(s\)/);
	await press(r.stdin, 's'); await settle();
	assert.deepEqual(b.writes.at(-1), ['models.tiers.core', { runner: 'cli-codex', model: 'x-new', effort: 'lo' }], 'saved through the fresh definitions, keeping an effort it takes');
	r.unmount();

	// A save after the restart that still needs a restart: the pane shows the restart line.
	const c = checkServices({});
	r = await openCheck(c.svc);
	await press(r.stdin, 'a', 'R'); await settle();
	assert.match(r.lastFrame() ?? '', /Tiers \(family/);
	assert.match(r.lastFrame() ?? '', /restart the daemon to apply \(R\)/, 'the saved tier still needs a restart');
	r.unmount();

	// While restarting, esc does nothing; if the screen goes away anyway, the tier is not written afterwards.
	const d = checkServices({});
	let release: (v: { ok: boolean; steps: string[] }) => void = () => {};
	d.svc.daemon.restart = () => new Promise(res => { release = res; });
	r = await openCheck(d.svc);
	const before = d.writes.length;
	await press(r.stdin, 'a', 'R');
	await press(r.stdin, '\x1b'); await settle();
	assert.match(r.lastFrame() ?? '', /restarting…/, 'esc is ignored while the restart runs');
	await press(r.stdin, '1');   // leave the pane: the screen unmounts mid-restart
	release({ ok: true, steps: [] }); await settle(); await settle();
	assert.equal(d.writes.length, before, 'no tier write after the screen is gone');
	r.unmount();
});

test('tui-models.test.ts: an edit waits for the previous save to reload; a save whose connection drops is read back; an older daemon refusing the check is named', async () => {
	// Repo models view: while a tasks write is in flight, a second edit is refused instead of rebuilding the map from the old snapshot.
	const REPO = '/w/r';
	const { svc, writes } = tiersServices({});
	svc.daemon.getStatus = async () => status({ repos: [repo(REPO)] });
	let release: () => void = () => {};
	svc.config.write = (path, value) => { writes.push([path, value]); return new Promise(res => { release = () => res({ ok: true }); }); };
	let r = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '2', 'm'); await settle();
	await press(r.stdin, 'j', 'e');
	for (let i = 0; i < 8; i++) { r.stdin.write('\x7f'); await settle(); }
	r.stdin.write('cheap'); await settle(); r.stdin.write('\r'); await settle();
	assert.equal(writes.length, 1);
	await press(r.stdin, 'j', 'e');
	assert.match(r.lastFrame() ?? '', /saving — edit again once the view reloads/);
	assert.doesNotMatch(r.lastFrame() ?? '', /tier in this repo/, 'no prompt while the save is in flight');
	release(); await settle(); await settle();
	await press(r.stdin, 'e');
	assert.match(r.lastFrame() ?? '', /tier in this repo/, 'editable again after the reload');
	r.unmount();

	// Check screen: the save's connection drops after the write landed — read back, reported saved, restart line shown.
	const landed = checkServices({});
	const tiers: Record<string, unknown> = { core: { runner: 'cli-codex', model: 'x-a', effort: 'lo' } };
	landed.svc.config.show = async () => ({ models: { tiers } });
	landed.svc.config.write = async (path, value) => {
		landed.writes.push([path, value]);
		tiers['core'] = value;
		throw Object.assign(new Error('the daemon closed the connection before answering config.write'), { code: 'disconnected' });
	};
	r = await openCheck(landed.svc);
	await press(r.stdin, 'a', 'R'); await settle(); await settle();
	let frame = r.lastFrame() ?? '';
	assert.match(frame, /Tiers \(family/, 'back on the pane: the tier was found in the config');
	assert.match(frame, /restart the daemon to apply \(R\)/);
	assert.doesNotMatch(frame, /was not saved/);
	r.unmount();

	// ...and when it did not land, it says so.
	const lost = checkServices({});
	lost.svc.config.write = async () => { throw Object.assign(new Error('the daemon closed the connection before answering config.write'), { code: 'disconnected' }); };
	r = await openCheck(lost.svc);
	await press(r.stdin, 'a', 'R'); await settle(); await settle();
	assert.match(r.lastFrame() ?? '', /approval recorded; the tier was not saved: the daemon closed the connection/);
	r.unmount();

	// An older daemon without models.check: its refusal and the update hint.
	const old = checkServices({ check: [async () => { throw new Error("unknown method 'models.check'"); }] });
	r = await openCheck(old.svc);
	frame = r.lastFrame() ?? '';
	assert.match(frame, /the daemon could not answer: unknown method 'models\.check' — if it is older/);
	r.unmount();
});

test('tui-models.test.ts: a lost connection reads as daemon down; r waits for a pending repo save; an unreadable read-back is reported as unknown', async () => {
	// The daemon closed the connection mid-request: the pane shows its daemon-down message.
	const gone = tiersServices({});
	gone.svc.models.definitions = async () => { throw Object.assign(new Error('the daemon closed the connection before answering models.definitions'), { code: 'disconnected' }); };
	let r = render(createElement(App, { services: gone.svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '5');
	assert.ok((r.lastFrame() ?? '').includes(MODEL_TIERS_DOWN));
	r.unmount();

	// Repos models view: r during an in-flight save does not reload (the reload could unlock editing on the old snapshot).
	const REPO = '/w/r2';
	const pend = tiersServices({});
	pend.svc.daemon.getStatus = async () => status({ repos: [repo(REPO)] });
	let shows = 0;
	const show = pend.svc.config.show;
	pend.svc.config.show = async () => { shows++; return show(); };
	let release: () => void = () => {};
	pend.svc.config.write = (path, value) => { pend.writes.push([path, value]); return new Promise(res => { release = () => res({ ok: true }); }); };
	r = render(createElement(App, { services: pend.svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '2', 'm'); await settle();
	await press(r.stdin, 'e');
	for (let i = 0; i < 8; i++) { r.stdin.write('\x7f'); await settle(); }
	r.stdin.write('mid'); await settle(); r.stdin.write('\r'); await settle();
	const before = shows;
	await press(r.stdin, 'r'); await settle();
	assert.equal(shows, before, 'no reload while the save is pending');
	release(); await settle(); await settle();
	assert.equal(shows, before + 1, "the save's own reload runs");
	r.unmount();

	// Check screen: the save's connection drops and the config cannot be read back: the outcome is unknown, not "not saved".
	const blind = checkServices({});
	blind.svc.config.write = async () => { throw Object.assign(new Error('the daemon closed the connection before answering config.write'), { code: 'disconnected' }); };
	r = await openCheck(blind.svc);
	blind.svc.config.show = async () => { throw new Error('daemon is not running — start it with: insrc daemon start'); };
	await press(r.stdin, 'a', 'R'); await settle(); await settle();
	const frame = r.lastFrame() ?? '';
	assert.match(frame, /whether core was saved is unknown/);
	assert.doesNotMatch(frame, /the tier was not saved/);
	r.unmount();
});

/** DEFS plus a family that runs its CLI on Ollama (Epic b220bb61, Story s3): no
 *  tierDefaults, a cloud model with efforts and an alias, a local one without. */
const HOSTED_DEFS: ModelDefinitionsResult = {
	...DEFS,
	families: [...DEFS.families, {
		id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'FakeH',
		models: [
			{ id: 'hc:cloud', aliases: ['hc'], efforts: ['low', 'max'], source: 'shipped', hosting: 'cloud' },
			{ id: 'hl:7b', aliases: [], efforts: [], source: 'shipped', hosting: 'local' },
		],
	}],
};

/** tiersServices over HOSTED_DEFS. */
function hostedServices(tiers: Record<string, unknown>) {
	const s = tiersServices(tiers);
	s.svc.models.definitions = async () => HOSTED_DEFS;
	return s;
}

test("tui-models.test.ts: 'f' reaches the Ollama-hosted runner and writes its first declared model as a whole tier, labelled cloud or local", async () => {
	const tiers: Record<string, unknown> = { core: { runner: 'ollama', model: 'loc:1', effort: '' } };
	const { svc, writes } = hostedServices(tiers);
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(stdin, '5', 'f'); await settle();
	assert.deepEqual(writes, [['models.tiers.core', { runner: 'ollama-claude', model: 'hc:cloud', effort: '' }]]);
	assert.match(lastFrame() ?? '', /core\s+FakeH \/ hc:cloud \(hc\) \[cloud\] \/ \(cli default effort\) \(set\)/);
	// The plain local and vendor runners still carry no label; f moves on from the hosted runner to the first family.
	assert.doesNotMatch(lastFrame() ?? '', /mid[^\n]*\[(cloud|local)\]/);
	await press(stdin, 'f');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'cli-claude', model: 'c-big', effort: '' }]);
	unmount();
});

test("tui-models.test.ts: on a host-family tier 'm' and 'e' cycle only declared values, 'n' is hidden and opens nothing, and a model with no efforts says so", async () => {
	const tiers: Record<string, unknown> = { core: { runner: 'ollama-claude', model: 'hc:cloud', effort: '' } };
	const { svc, writes } = hostedServices(tiers);
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(stdin, '5');
	let frame = lastFrame() ?? '';
	assert.match(frame, /m model\s+e effort/, 'the key hints skip n on a host-family tier');
	assert.doesNotMatch(frame, /new model id/);
	await press(stdin, 'n');
	assert.doesNotMatch(lastFrame() ?? '', /model id for/, 'n opens no prompt');
	assert.equal(writes.length, 0);

	// e cycles '' + the model's own efforts; m cycles the declared models (the effort the new one lacks is dropped).
	await press(stdin, 'e');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'ollama-claude', model: 'hc:cloud', effort: 'low' }]);
	await press(stdin, 'e');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'ollama-claude', model: 'hc:cloud', effort: 'max' }]);
	await press(stdin, 'm');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'ollama-claude', model: 'hl:7b', effort: '' }]);
	assert.match(lastFrame() ?? '', /core\s+FakeH \/ hl:7b \[local\]/);
	assert.equal(writes.length, 3, 'one write per edit');

	// e on a model with no efforts: said so, nothing written.
	await press(stdin, 'e');
	assert.equal(writes.length, 3);
	assert.match(lastFrame() ?? '', /this model takes no effort setting/);
	// m wraps back to the first declared model.
	await press(stdin, 'm');
	assert.deepEqual(writes.at(-1), ['models.tiers.core', { runner: 'ollama-claude', model: 'hc:cloud', effort: '' }]);
	for (const [path, value] of writes) {
		assert.equal(path, 'models.tiers.core');
		assert.deepEqual(Object.keys(value as object).sort(), ['effort', 'model', 'runner']);
	}
	// A vendor tier still offers n.
	await press(stdin, 'j');
	frame = lastFrame() ?? '';
	assert.match(frame, /n new model id/);
	unmount();
});

test("tui-models.test.ts: an undeclared host-family model shows 'not supported ... will not run'; a vendor unserved model keeps the vendor note", async () => {
	const tiers: Record<string, unknown> = {
		core:  { runner: 'ollama-claude', model: 'gone:cloud', effort: 'low' },
		cheap: { runner: 'cli-codex', model: 'x-unknown', effort: '' },
	};
	const { svc, writes } = hostedServices(tiers);
	const { lastFrame, stdin, unmount } = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(stdin, '5');
	let frame = lastFrame() ?? '';
	assert.match(frame, /core\s+FakeH \/ gone:cloud \/ low \(set\)[\s│]+not[\s│]+supported[\s│]+by[\s│]+FakeH:[\s│]+the[\s│]+tier[\s│]+will[\s│]+not[\s│]+run;[\s│]+pick[\s│]+a[\s│]+listed[\s│]+model[\s│]+with[\s│]+m/);
	assert.doesNotMatch(frame, /core[^\n]*not served/, 'not the vendor note');
	assert.match(frame, /cheap\s+FakeX \/ x-unknown \/ \(cli default effort\) \(set\) not served: runs the default/);

	await press(stdin, 'e');
	assert.match(lastFrame() ?? '', /gone:cloud is not supported by FakeH: pick a listed model with m/);
	assert.equal(writes.length, 0);

	// The vendor tier: its toast, and n still opens the typed-id prompt.
	await press(stdin, 'j', 'j', 'e');
	assert.match(lastFrame() ?? '', /x-unknown is not a listed model: pick one with m, or check it with n/);
	await press(stdin, 'n');
	frame = lastFrame() ?? '';
	assert.match(frame, /cheap model id for FakeX/);
	assert.equal(writes.length, 0);
	unmount();
});

test('tui-models.test.ts: a tier saved on the Ollama-hosted runner shows its runner, model, cloud/local label and effort after reload', async () => {
	// A hand-edited mid tier names an effort its local model does not take.
	const tiers: Record<string, unknown> = {
		core: { runner: 'ollama', model: 'loc:1', effort: '' },
		mid:  { runner: 'ollama-claude', model: 'hl:7b', effort: 'max' },
	};
	const { svc, writes } = hostedServices(tiers);
	let r = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '5', 'f', 'e'); await settle();
	assert.deepEqual(writes, [
		['models.tiers.core', { runner: 'ollama-claude', model: 'hc:cloud', effort: '' }],
		['models.tiers.core', { runner: 'ollama-claude', model: 'hc:cloud', effort: 'low' }],
	]);
	r.unmount();

	// A fresh pane reads the saved config back from config.show.
	r = render(createElement(App, { services: svc, pollMs: 0 }));
	await settle();
	await press(r.stdin, '5');
	const frame = r.lastFrame() ?? '';
	assert.match(frame, /core\s+FakeH \/ hc:cloud \(hc\) \[cloud\] \/ low \(set\)/);
	assert.match(frame, /mid\s+FakeH \/ hl:7b \[local\] \/ max \(set\) not accepted — runs at the CLI default/);
	r.unmount();
});
