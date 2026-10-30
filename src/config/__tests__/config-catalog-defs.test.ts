/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Settings catalog model rows derived from the model definitions (Epic
 * ce99b72065d03b1b, Story s3 · t1).
 *
 * buildConfigCatalog over a fixture whose defaults differ from the shipped
 * file takes every model default and enum from the fixture; CONFIG_CATALOG is
 * the catalog over the shipped file; the derivation never throws on missing
 * fields; and the catalog's runtime import closure stays free of the logger,
 * the registry and file I/O so it loads anywhere at module load.
 *
 * Run: npx tsx --test src/config/__tests__/config-catalog-defs.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildConfigCatalog, CONFIG_CATALOG, RETIRED_PATHS, type ConfigOption } from '../config-catalog.js';
import { deriveModelDefaults, SHIPPED_MODEL_DEFAULTS } from '../model-defaults.js';
import type { ModelDefinitionsFile } from '../../daemon/model-catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');
const ROOT = resolve(SRC, '..');

/** Definitions whose default family, tier defaults, efforts and tool-loop model all differ from the shipped file. */
function fixture(): ModelDefinitionsFile {
	return {
		version: 7,
		defaultFamily: 'cli-codex',
		families: [
			{ id: 'ollama', displayName: 'Ollama', models: [{ id: 'llama:1b', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'llama:1b' },
			{
				id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
				models: [{ id: 'gpt-x', efforts: ['low', 'turbo'] }, { id: 'gpt-y', efforts: ['low'] }],
				tierDefaults: { core: { model: 'gpt-x', effort: 'turbo' }, mid: { model: 'gpt-y', effort: 'low' }, cheap: { model: 'gpt-y' } },
				summariserModel: 'gpt-y',
			},
			{
				id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
				models: [{ id: 'claude-z', efforts: ['deep'] }],
				tierDefaults: { core: { model: 'claude-z' }, mid: { model: 'claude-z' }, cheap: { model: 'claude-z' } },
				summariserModel: 'claude-z',
			},
		],
	};
}

const row = (catalog: readonly ConfigOption[], path: string): ConfigOption | undefined => catalog.find(r => r.path === path);

test('config-catalog-defs.test.ts: buildConfigCatalog(fixture) takes runner/model/effort defaults, effort enums and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog', () => {
	const catalog = buildConfigCatalog(fixture());
	const expected = {
		core:  { model: 'gpt-x', effort: 'turbo' },
		mid:   { model: 'gpt-y', effort: 'low' },
		cheap: { model: 'gpt-y', effort: '' },
	};
	for (const [tier, want] of Object.entries(expected)) {
		const runner = row(catalog, `models.tiers.${tier}.runner`)!;
		assert.equal(runner.default, 'cli-codex', `${tier} runner default`);
		assert.deepEqual(runner.enumValues, ['ollama', 'cli-codex', 'cli-claude'], `${tier} runner enum = the family ids`);
		assert.equal(row(catalog, `models.tiers.${tier}.model`)!.default, want.model, `${tier} model default`);
		const effort = row(catalog, `models.tiers.${tier}.effort`)!;
		assert.equal(effort.default, want.effort, `${tier} effort default`);
		assert.deepEqual(effort.enumValues, ['', 'low', 'turbo', 'deep'], `${tier} effort enum = '' + the fixture's efforts`);
	}
	assert.equal(row(catalog, 'models.local.coreModel')!.default, 'llama:1b');
	assert.equal(row(catalog, 'models.shaper.ollamaNumCtx'), undefined);
	// Only the model rows depend on the definitions.
	assert.deepEqual(catalog.map(r => r.path), CONFIG_CATALOG.map(r => r.path));

	// CONFIG_CATALOG is the catalog over the shipped file (read from disk, not the module import).
	const shipped = JSON.parse(readFileSync(join(SRC, 'assets', 'models', 'cloud-model-catalog.json'), 'utf8')) as ModelDefinitionsFile;
	assert.deepEqual(CONFIG_CATALOG, buildConfigCatalog(shipped));
	assert.equal(row(CONFIG_CATALOG, 'models.shaper.ollamaNumCtx'), undefined);
	assert.ok(RETIRED_PATHS.some(r => r.path === 'models.shaper.ollamaNumCtx'));
	const def = shipped.families.find(f => f.id === shipped.defaultFamily)!;
	assert.equal(row(CONFIG_CATALOG, 'models.tiers.core.model')!.default, def.tierDefaults!.core.model);
	assert.equal(row(CONFIG_CATALOG, 'models.local.coreModel')!.default, shipped.families.find(f => f.id === 'ollama')!.toolLoopModel);

	// The shipped defaults are derived from the same file.
	for (const tier of ['core', 'mid', 'cheap'] as const) {
		assert.deepEqual(SHIPPED_MODEL_DEFAULTS.tiers[tier], { runner: shipped.defaultFamily, model: def.tierDefaults![tier].model, effort: def.tierDefaults![tier].effort ?? '' });
	}
	assert.deepEqual(SHIPPED_MODEL_DEFAULTS, deriveModelDefaults(shipped));

	// The updater's loader accepts the COMPILED catalog: tsc emits config-catalog.js and the
	// shipped JSON into a temp outDir, and a plain node process (no tsx) loads it through the
	// compiled loader, JSON module import included.
	const out = mkdtempSync(join(tmpdir(), 'built-catalog-'));
	try {
		const tsc = spawnSync(process.execPath, [
			join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
			'--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--resolveJsonModule',
			'--verbatimModuleSyntax', '--strict', '--skipLibCheck', '--types', 'node',
			'--rootDir', SRC, '--outDir', out,
			join(SRC, 'config', 'config-catalog.ts'), join(SRC, 'config', 'config-catalog-loader.ts'),
		], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
		assert.equal(tsc.status, 0, `${tsc.stdout}${tsc.stderr}`);
		assert.ok(existsSync(join(out, 'assets', 'models', 'cloud-model-catalog.json')), 'tsc emits the shipped JSON beside the built catalog');
		const builtCatalog = join(out, 'config', 'config-catalog.js');
		const loaderUrl = pathToFileURL(join(out, 'config', 'config-catalog-loader.js')).href;
		const run = spawnSync(process.execPath, ['--input-type=module', '-e',
			`const { loadBuiltCatalog } = await import(${JSON.stringify(loaderUrl)}); process.stdout.write(JSON.stringify(await loadBuiltCatalog(${JSON.stringify(builtCatalog)})));`,
		], { cwd: out, encoding: 'utf8', timeout: 60_000, env: { ...process.env, NODE_OPTIONS: '' } });
		assert.equal(run.status, 0, run.stderr);
		const loaded = JSON.parse(run.stdout) as unknown;
		assert.ok(loaded !== null, 'loadBuiltCatalog loads the built catalog module');
		assert.deepEqual(loaded, JSON.parse(JSON.stringify(CONFIG_CATALOG)));
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
});

/** The runtime (non-type) import specifiers of a source file. */
function runtimeImports(file: string): string[] {
	const src = readFileSync(file, 'utf8');
	return [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map(m => m[1]!);
}

/** The runtime import closure of a source file under src, as repo-relative module paths or bare specifiers. */
function closure(entry: string): Set<string> {
	const seen = new Set<string>();
	const walk = (file: string): void => {
		for (const spec of runtimeImports(file)) {
			if (!spec.startsWith('.')) { seen.add(spec); continue; }
			const target = resolve(dirname(file), spec.endsWith('.js') ? spec.replace(/\.js$/, '.ts') : spec);
			const rel = target.slice(SRC.length + 1);
			if (seen.has(rel)) continue;
			seen.add(rel);
			if (target.endsWith('.ts')) walk(target);
		}
	};
	walk(entry);
	return seen;
}

test('config-catalog-defs.test.ts: model-defaults and config-catalog import no logger, registry or file-I/O module and derive without throwing from a fixture missing fields', () => {
	for (const entry of ['model-defaults.ts', 'config-catalog.ts']) {
		const reached = [...closure(join(SRC, 'config', entry))];
		assert.ok(reached.includes(join('assets', 'models', 'cloud-model-catalog.json')), `${entry} reaches the shipped JSON`);
		const forbidden = reached.filter(m =>
			/^node:(fs|fs\/promises|net|http|https|child_process)$/.test(m) || m === 'fs'
			|| /shared[\\/]logger\.ts$/.test(m) || /^pino/.test(m)
			|| /daemon[\\/]model-(registry|catalog)\.ts$/.test(m));
		assert.deepEqual(forbidden, [], `${entry}'s runtime import closure`);
	}

	const partial: unknown[] = [
		{},
		{ families: [] },
		{ defaultFamily: 'cli-claude', families: [{ id: 'cli-claude' }] },
		{ defaultFamily: 'cli-claude', families: [{ id: 'cli-claude', models: [{ id: 'm' }], tierDefaults: { core: {} } }, { id: 'ollama' }] },
		{ families: 'nope', defaultFamily: 3 },
	];
	for (const defs of partial) {
		const label = JSON.stringify(defs);
		const d = deriveModelDefaults(defs as ModelDefinitionsFile);
		assert.deepEqual(d.tiers.core, { runner: d.defaultFamily, model: '', effort: '' }, label);
		assert.equal(d.toolLoopModel, '', label);
		const catalog = buildConfigCatalog(defs as ModelDefinitionsFile);
		assert.equal(catalog.length, CONFIG_CATALOG.length, label);
		assert.equal(row(catalog, 'models.tiers.cheap.model')!.default, '', label);
		assert.deepEqual(row(catalog, 'models.tiers.cheap.effort')!.enumValues, [''], label);
	}
});

test("config-catalog-defs.test.ts: deriveModelDefaults lists five familyIds, keeps the default family's tier defaults and 'ollama' as the local family", () => {
	const shipped = JSON.parse(readFileSync(join(SRC, 'assets', 'models', 'cloud-model-catalog.json'), 'utf8')) as ModelDefinitionsFile;
	const d = deriveModelDefaults(shipped);
	assert.deepEqual(d.familyIds, ['cli-claude', 'cli-codex', 'cli-vibe', 'ollama', 'ollama-claude']);
	assert.equal(d.defaultFamily, 'cli-claude');
	const claude = shipped.families.find(f => f.id === 'cli-claude')!;
	for (const tier of ['core', 'mid', 'cheap'] as const) {
		assert.deepEqual(d.tiers[tier], { runner: 'cli-claude', model: claude.tierDefaults![tier].model, effort: claude.tierDefaults![tier].effort ?? '' }, tier);
	}
	const local = shipped.families.find(f => f.id === 'ollama')!;
	assert.equal(d.toolLoopModel, local.toolLoopModel, "the local family is still 'ollama' (the host family carries a CLI kind)");
});
