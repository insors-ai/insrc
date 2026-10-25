/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The build gate scripts/check-model-definitions.mjs (Epic ce99b72065d03b1b,
 * Story s3 · t1): it validates the definitions with the daemon's own validator
 * and fails the build, naming the entry, on a structurally invalid file.
 *
 * The script runs as a child process against the source validator (through
 * tsx), so no prior build is needed.
 *
 * Run: npx tsx --test src/config/__tests__/check-model-definitions.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-model-definitions.mjs');
const SHIPPED = join(ROOT, 'src', 'assets', 'models', 'cloud-model-catalog.json');

function runGate(catalogDir: string | undefined): { status: number | null; out: string } {
	const env: NodeJS.ProcessEnv = { ...process.env, INSRC_MODEL_CATALOG_MODULE: join(ROOT, 'src', 'daemon', 'model-catalog.ts') };
	if (catalogDir === undefined) delete env['INSRC_MODEL_CATALOG_DIR'];
	else env['INSRC_MODEL_CATALOG_DIR'] = catalogDir;
	const r = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT], { cwd: ROOT, env, encoding: 'utf8', timeout: 60_000 });
	return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('check-model-definitions.test.ts: the build gate exits non-zero naming the entry for a structurally invalid copy and zero for the shipped file', () => {
	const ok = runGate(undefined);
	assert.equal(ok.status, 0, ok.out);
	assert.match(ok.out, /model definitions v\d+ valid/);

	const dir = mkdtempSync(join(tmpdir(), 'check-model-defs-'));
	try {
		// Syntactically valid JSON, structurally invalid: a Codex tier default that is not a Codex model.
		const bad = JSON.parse(readFileSync(SHIPPED, 'utf8')) as { families: Array<{ id: string; tierDefaults?: Record<string, { model: string }> }> };
		bad.families.find(f => f.id === 'cli-codex')!.tierDefaults!['mid']!.model = 'not-a-codex-model';
		writeFileSync(join(dir, 'cloud-model-catalog.json'), JSON.stringify(bad));
		const failed = runGate(dir);
		assert.notEqual(failed.status, 0, failed.out);
		assert.match(failed.out, /\(cli-codex\): tierDefaults\.mid\.model 'not-a-codex-model' is not a model or alias of cli-codex/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}

	// The gate runs after tsc and before copy-assets in the build.
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
	assert.equal(pkg.scripts['build'], 'tsc && node scripts/check-model-definitions.mjs && node copy-assets.mjs');
});
