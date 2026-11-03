/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The project tsconfig excludes tests, so `tsc --noEmit` says nothing about
 * them. This runs tsc over the test files Story s5 (Epic ce99b72065d03b1b)
 * changed — the TUI tests, their fakes and the migrated model tests — with the
 * project's compiler options, and requires no errors.
 *
 * Run: npx tsx --test src/cli/__tests__/s5-tests-typecheck.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const S5_TESTS = [
	'src/__tests__/no-default-tiers.test.ts',
	'src/cli/__tests__/command.test.ts',
	'src/cli/__tests__/helpers/fake-services.ts',
	'src/cli/__tests__/model-tiers.test.ts',
	'src/cli/__tests__/s5-tests-typecheck.test.ts',
	'src/cli/__tests__/services.test.ts',
	'src/cli/__tests__/tui-models.test.ts',
	'src/cli/__tests__/tui.test.ts',
	'src/cli/services/__tests__/review-resolve-role.test.ts',
	'src/cli/services/__tests__/review-source-roots-daemon.test.ts',
	'src/config/__tests__/config-catalog-defs.test.ts',
	'src/config/__tests__/tier-defaults.test.ts',
	'src/daemon/__tests__/config-write-models.test.ts',
	'src/daemon/__tests__/model-catalog-asset.test.ts',
	'src/daemon/__tests__/model-catalog.test.ts',
	'src/daemon/__tests__/model-definitions.test.ts',
	'src/daemon/__tests__/model-literal-scan.test.ts',
	'src/daemon/__tests__/system-recommend.test.ts',
	'src/shared/__tests__/ipc-client.test.ts',
	'src/shared/__tests__/model-recommender.test.ts',
	'src/workflow/review/__tests__/same-party-refusal.test.ts',
];

test('s5-tests-typecheck.test.ts: tsc over the TUI and model tests s5 changed reports no errors', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-s5-tsc-'));
	try {
		const config = join(dir, 'tsconfig.json');
		writeFileSync(config, JSON.stringify({
			extends: join(ROOT, 'tsconfig.json'),
			compilerOptions: { noEmit: true, typeRoots: [join(ROOT, 'node_modules', '@types')] },
			include: S5_TESTS.map(f => join(ROOT, f)),
			exclude: [],
		}));
		const run = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', config], { cwd: ROOT, encoding: 'utf8' });
		assert.equal(run.status, 0, `tsc reported errors:\n${run.stdout}${run.stderr}`);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
