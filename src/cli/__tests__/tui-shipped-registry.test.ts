/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The TUI resolution stopgap (Epic ce99b72065d03b1b, Story s3 · t8): the
 * model-tiers pane and the review command resolve tiers through
 * shippedModelRegistry() — the shipped definitions and no approved profiles —
 * so the TUI process never reads the user's approved-model store (k2).
 *
 * The daemon registry is made unusable: the definitions directory it would
 * validate does not exist (getModelRegistry() throws) and the store path is a
 * directory (unreadable as a file). Both TUI callers still succeed.
 *
 * Run: npx tsx --test src/cli/__tests__/tui-shipped-registry.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = mkdtempSync(join(tmpdir(), 'tui-shipped-registry-'));
process.env['HOME'] = HOME;
const { computeEffectiveTiers } = await import('../panes/model-tiers.js');
const { reviewArtifact } = await import('../services/workflow.js');
const { shippedModelRegistry } = await import('../shipped-model-registry.js');
const { _setModelCatalogDirForTests } = await import('../../daemon/model-catalog.js');
const { getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests } = await import('../../daemon/model-registry.js');
const { SHIPPED_DEFINITIONS } = await import('../../config/model-defaults.js');
const { CliProvider } = await import('../../agent/providers/cli-provider.js');

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test("tui-shipped-registry.test.ts: computeEffectiveTiers and reviewArtifact succeed with getModelRegistry stubbed to throw and the store unreadable; the pane shows the definitions' defaults; src/cli/** does not import getModelRegistry", async () => {
	try {
		_setModelCatalogDirForTests(join(HOME, 'no-such-definitions'));
		_setApprovedModelsPathForTests(HOME);   // a directory: unreadable as the store file
		_resetModelRegistryForTests();
		assert.throws(() => getModelRegistry(), /ModelCatalogValidationError|file not found/);

		// The shipped definitions' tier defaults, as canonical ids.
		const def = SHIPPED_DEFINITIONS.families.find(f => f.id === SHIPPED_DEFINITIONS.defaultFamily)!;
		const canonical = (alias: string): string => def.models.find(m => m.id === alias || (m.aliases ?? []).includes(alias))!.id;

		// The model-tiers pane's data.
		const eff = computeEffectiveTiers({});
		for (const tier of ['core', 'mid', 'cheap'] as const) {
			assert.equal(eff.tiers[tier].runner, SHIPPED_DEFINITIONS.defaultFamily, tier);
			assert.equal(eff.tiers[tier].model, canonical(def.tierDefaults![tier].model), tier);
		}

		// The review command: loadAnalyzeConfig + createRoleRouter + provider construction, end to end.
		let seen: { provider: unknown; model: string } | undefined;
		const result = await reviewArtifact('/w/repo', '/w/repo/docs/stub/lld-a.md', (async (opts: { provider: unknown; model: string }) => {
			seen = { provider: opts.provider, model: opts.model };
			return { ok: true } as never;
		}) as never);
		assert.deepEqual(result, { ok: true });
		assert.ok(seen !== undefined);
		assert.ok(seen.provider instanceof CliProvider, 'review (a critical role) runs on the core CLI tier');
		assert.equal(seen.model, `${SHIPPED_DEFINITIONS.defaultFamily}:${canonical(def.tierDefaults!.core.model)}`);
		assert.equal(shippedModelRegistry().defaultFamily(), SHIPPED_DEFINITIONS.defaultFamily);
	} finally {
		_setModelCatalogDirForTests(undefined);
		_setApprovedModelsPathForTests(undefined);
		_resetModelRegistryForTests();
		rmSync(HOME, { recursive: true, force: true });
	}

	// No TUI module reads the user's store.
	const offenders: string[] = [];
	const walk = (d: string): void => {
		for (const name of readdirSync(d)) {
			const p = join(d, name);
			if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); continue; }
			if (/\.(ts|tsx|mts)$/.test(name) && /\bgetModelRegistry\b/.test(readFileSync(p, 'utf8'))) offenders.push(relative(SRC, p));
		}
	};
	walk(join(SRC, 'cli'));
	assert.deepEqual(offenders, []);
});

test('tui-shipped-registry.test.ts: the TUI build (tsc) passes', async () => {
	const { spawnSync } = await import('node:child_process');
	const root = join(SRC, '..');
	const r = spawnSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', join(root, 'tsconfig.json')], { cwd: root, encoding: 'utf8', timeout: 300_000 });
	assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
	// The TUI's entry and the stopgap are in the compiled program.
	const config = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8')) as { include: string[] };
	assert.ok(config.include.includes('src/**/*.tsx') && config.include.includes('src/**/*.ts'));
});
