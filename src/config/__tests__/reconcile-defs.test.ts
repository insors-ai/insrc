/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The settings reconcile over definition-derived model rows (Epic
 * ce99b72065d03b1b, Story s3 · t2): a fresh config is filled from the
 * definitions' defaults, per-repo tiers are removed and reported, and the
 * retired models.shaper.ollamaNumCtx is pruned.
 *
 * Run: npx tsx --test src/config/__tests__/reconcile-defs.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildConfigCatalog } from '../config-catalog.js';
import { prunedRepoTiers, reconcileConfig } from '../reconcile.js';
import { reconcileConfigFile } from '../reconcile-io.js';
import type { ModelDefinitionsFile } from '../../daemon/model-catalog.js';

/** Definitions whose defaults all differ from today's, with non-empty default efforts. */
function fixture(): ModelDefinitionsFile {
	return {
		version: 1,
		defaultFamily: 'cli-codex',
		families: [
			{
				id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
				models: [{ id: 'claude-z', efforts: ['low'] }],
				tierDefaults: { core: { model: 'claude-z' }, mid: { model: 'claude-z' }, cheap: { model: 'claude-z' } },
				summariserModel: 'claude-z',
			},
			{
				id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
				models: [{ id: 'gpt-x', efforts: ['low', 'ultra'] }, { id: 'gpt-y', efforts: ['low'] }],
				tierDefaults: { core: { model: 'gpt-x', effort: 'ultra' }, mid: { model: 'gpt-y', effort: 'low' }, cheap: { model: 'gpt-y' } },
				summariserModel: 'gpt-y',
			},
			{ id: 'ollama', displayName: 'Ollama', models: [{ id: 'llama:1b', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'llama:1b' },
		],
	};
}

const at = (o: unknown, ...keys: string[]): unknown =>
	keys.reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], o);

test("reconcile-defs.test.ts: a fresh config is filled with a fixture's differing defaults including non-empty default efforts; byRepo tiers removed and reported per repo and tier, tasks and coreFloor kept; ollamaNumCtx pruned", () => {
	const catalog = buildConfigCatalog(fixture());

	// A fresh config takes every model default from the fixture.
	const fresh = reconcileConfig(undefined, catalog);
	assert.deepEqual(at(fresh.config, 'models', 'tiers'), {
		core:  { runner: 'cli-codex', model: 'gpt-x', effort: 'ultra' },
		mid:   { runner: 'cli-codex', model: 'gpt-y', effort: 'low' },
		cheap: { runner: 'cli-codex', model: 'gpt-y', effort: '' },
	});
	assert.equal(at(fresh.config, 'models', 'local', 'coreModel'), 'llama:1b');
	assert.equal(at(fresh.config, 'models', 'shaper', 'ollamaNumCtx'), undefined);

	// An existing config: per-repo tiers go, per repo and tier; tasks and coreFloor stay.
	const existing = {
		models: {
			tiers: { core: { runner: 'cli-claude', model: 'claude-z', effort: '' } },
			shaper: { ollamaNumCtx: 65536, maxToolTurns: 12 },
			byRepo: {
				'/w/a.repo': { tiers: { core: { runner: 'ollama', model: 'llama:1b' }, cheap: { runner: 'cli-claude', model: 'claude-z' } }, tasks: { 'tracker.render': 'cheap' }, coreFloor: 'core' },
				'/w/b': { tiers: {}, coreFloor: 'mid' },
				'/w/c': { tasks: { 'design.hld.synthesize': 'core' } },
			},
		},
	};
	const r = reconcileConfig(existing, catalog);
	const byRepo = at(r.config, 'models', 'byRepo');
	assert.deepEqual(byRepo, {
		'/w/a.repo': { tasks: { 'tracker.render': 'cheap' }, coreFloor: 'core' },
		'/w/b': { coreFloor: 'mid' },
		'/w/c': { tasks: { 'design.hld.synthesize': 'core' } },
	});
	assert.deepEqual(r.pruned.filter(p => p.startsWith('models.byRepo')), [
		'models.byRepo["/w/a.repo"].tiers.core',
		'models.byRepo["/w/a.repo"].tiers.cheap',
		'models.byRepo["/w/b"].tiers',
	]);
	assert.deepEqual(prunedRepoTiers(r.pruned), [
		{ repo: '/w/a.repo', tier: 'core' },
		{ repo: '/w/a.repo', tier: 'cheap' },
		{ repo: '/w/b', tier: undefined },
	]);
	// ollamaNumCtx is pruned; the user's other shaper knob and global tier are carried.
	assert.ok(r.pruned.includes('models.shaper.ollamaNumCtx'));
	assert.equal(at(r.config, 'models', 'shaper', 'ollamaNumCtx'), undefined);
	assert.equal(at(r.config, 'models', 'shaper', 'maxToolTurns'), 12);
	assert.deepEqual(at(r.config, 'models', 'tiers', 'core'), { runner: 'cli-claude', model: 'claude-z', effort: '' });
	assert.equal(existing.models.byRepo['/w/a.repo'].tiers !== undefined, true, 'the input is not mutated');

	// Idempotent: a second pass changes nothing.
	assert.equal(reconcileConfig(r.config, catalog).changed, false);

	// Through the file path the daemon boots with.
	const dir = mkdtempSync(join(tmpdir(), 'reconcile-defs-'));
	try {
		const configPath = join(dir, 'config.json');
		writeFileSync(configPath, JSON.stringify(existing));
		const outcome = reconcileConfigFile({ configPath, catalog });
		assert.equal(outcome.kind, 'written');
		const onDisk = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
		assert.deepEqual(at(onDisk, 'models', 'byRepo'), byRepo);
		assert.equal(at(onDisk, 'models', 'tiers', 'mid', 'model'), 'gpt-y');
		assert.equal(at(onDisk, 'models', 'tiers', 'mid', 'effort'), 'low');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
