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
import { fakeServices, settle } from './helpers/fake-services.js';

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
