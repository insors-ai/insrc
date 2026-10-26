/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unknown-model check against the REAL installed CLIs (Epic ce99b72065d03b1b,
 * Story s4). Gated: runs only with INSRC_LIVE_TESTS=1 (it spends model calls).
 *
 * The definitions are an isolated copy of the shipped file with the live-tested
 * models removed (claude-haiku-5-5 / haiku, gpt-6-luna) and every default that
 * named them retargeted to a retained model of the same family, so the registry
 * does not serve them and models.check reaches the CLI.
 *
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test src/daemon/__tests__/model-check.live.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MODEL_CATALOG_DIR, validateModelCatalog, _setModelCatalogDirForTests } from '../model-catalog.js';
import { getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests, type ModelRegistry } from '../model-registry.js';
import { checkModel, _resetModelChecksForTests, type ModelCheckResult } from '../model-check.js';

const LIVE = process.env['INSRC_LIVE_TESTS'] === '1';
const skip = LIVE ? false : 'set INSRC_LIVE_TESTS=1 to run against the installed claude and codex CLIs';

let dir: string;
let registry: ModelRegistry;

type Family = { id: string; models: Array<{ id: string; aliases?: string[] | undefined }>; tierDefaults?: Record<string, { model: string }> | undefined; summariserModel?: string | undefined };

before(() => {
	if (!LIVE) return;
	dir = mkdtempSync(join(tmpdir(), 'model-check-live-'));
	const defs = JSON.parse(readFileSync(join(MODEL_CATALOG_DIR, 'cloud-model-catalog.json'), 'utf8')) as { families: Family[] };
	const isolate = (familyId: string, removed: string, retained: string): void => {
		const f = defs.families.find(x => x.id === familyId)!;
		const gone = f.models.find(m => m.id === removed)!;
		const names = new Set([gone.id, ...(gone.aliases ?? [])]);
		f.models = f.models.filter(m => m !== gone);
		for (const t of Object.values(f.tierDefaults ?? {})) if (names.has(t.model)) t.model = retained;
		if (f.summariserModel !== undefined && names.has(f.summariserModel)) f.summariserModel = retained;
	};
	isolate('cli-claude', 'claude-haiku-5-5', 'sonnet');
	isolate('cli-codex', 'gpt-6-luna', 'gpt-5.6-luna');
	writeFileSync(join(dir, 'cloud-model-catalog.json'), JSON.stringify(defs));
	_setModelCatalogDirForTests(dir);
	_setApprovedModelsPathForTests(join(dir, 'approved-models.json'));
	_resetModelRegistryForTests();
});
after(() => {
	if (!LIVE) return;
	_setModelCatalogDirForTests(undefined);
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	_resetModelChecksForTests();
	rmSync(dir, { recursive: true, force: true });
});

async function check(family: string, modelId: string, claimedEfforts: string[]): Promise<ModelCheckResult> {
	const r = await checkModel({ family, modelId, claimedEfforts }, { registry });
	assert.ok('checkId' in r, JSON.stringify(r));
	return r;
}

test('model-check.live.test.ts: isolated fixture validated and unserved; real codex and claude checks', { skip, timeout: 900_000 }, async () => {
	// The isolated fixture is valid and no longer serves the live-tested models.
	validateModelCatalog();
	registry = getModelRegistry();
	for (const [family, name] of [['cli-claude', 'claude-haiku-5-5'], ['cli-claude', 'haiku'], ['cli-codex', 'gpt-6-luna']] as const) {
		assert.equal(registry.find(family, name), undefined, `${family} ${name}`);
	}

	const unknownCodex = await check('cli-codex', 'gpt-nonexistent-insrc-probe', ['high']);
	assert.equal(unknownCodex.runs, false);
	assert.match(unknownCodex.error ?? '', /^the codex CLI refused the model: /);

	// gpt-6-luna runs; its verdicts are exactly what `codex debug models` lists for it.
	const listed = JSON.parse(execFileSync('codex', ['debug', 'models'], { encoding: 'utf8' })) as { models: Array<{ slug: string; supported_reasoning_levels: Array<{ effort: string }> }> };
	const levels = listed.models.find(m => m.slug === 'gpt-6-luna')!.supported_reasoning_levels.map(l => l.effort);
	const luna = await check('cli-codex', 'gpt-6-luna', ['low', 'ultra']);
	assert.equal(luna.runs, true, luna.error);
	assert.deepEqual(luna.efforts.map(e => [e.effort, e.verdict]), ['low', 'ultra'].map(e => [e, levels.includes(e) ? 'accepted' : 'rejected']));

	const unknownClaude = await check('cli-claude', 'claude-nonexistent-insrc-probe', ['high']);
	assert.equal(unknownClaude.runs, false);
	assert.match(unknownClaude.error ?? '', /^the claude CLI refused the model: /);

	const haiku = await check('cli-claude', 'haiku', ['high']);
	assert.equal(haiku.runs, true, haiku.error);
	assert.equal(haiku.inputLimit?.unit, 'tokens');
	assert.ok((haiku.inputLimit?.max ?? 0) > 0);
	assert.equal(haiku.efforts[0]?.verdict, 'recognised-unconfirmed');
});
