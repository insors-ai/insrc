/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setCheckpointDepsForTests, writeCheckpoint } from '../checkpoint.js';
import type { ReviewCheckpoint } from '../checkpoint.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/review-round/__type-tests__/checkpoint.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-checkpoint-typecheck-'));
	try {
		writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
			extends: resolve(ROOT, 'tsconfig.json'),
			compilerOptions: {
				noEmit: true, declaration: false, declarationMap: false, sourceMap: false,
				typeRoots: [resolve(ROOT, 'node_modules/@types')],
			},
			include: [resolve(ROOT, FIXTURE)],
			exclude: [],
		}));
		execFileSync('node', [TSC, '-p', join(dir, 'tsconfig.json')], { cwd: ROOT, stdio: 'pipe' });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** The resolveRepoRoot dep every test not specifically exercising repo resolution itself injects. */
const resolveRepoRoot = async (): Promise<string> => ROOT;

describe('writeCheckpoint/readCheckpoint/finalizeAndCleanup and ReviewCheckpoint', () => {
	it('writeCheckpoint writes a ReviewCheckpoint JSON record to .insrc/tmp/<reviewId>/checkpoint.json containing exactly {reviewId, lastCompletedUnit}, overwriting any prior checkpoint for the same reviewId', async () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const reviewId = `review-t1-${process.pid}-${Date.now()}`;
		const path = join(ROOT, '.insrc/tmp', reviewId, 'checkpoint.json');
		_setCheckpointDepsForTests({ resolveRepoRoot });

		try {
			await writeCheckpoint(reviewId, { kind: 'round', ref: 1 });
			const first: ReviewCheckpoint = JSON.parse(readFileSync(path, 'utf8'));
			assert.deepEqual(first, { reviewId, lastCompletedUnit: { kind: 'round', ref: 1 } });

			await writeCheckpoint(reviewId, { kind: 'round', ref: 2 });
			const second: ReviewCheckpoint = JSON.parse(readFileSync(path, 'utf8'));
			assert.deepEqual(second, { reviewId, lastCompletedUnit: { kind: 'round', ref: 2 } }, 'the second write must overwrite the first, not accumulate a history');
		} finally {
			rmSync(join(ROOT, '.insrc/tmp', reviewId), { recursive: true, force: true });
			_setCheckpointDepsForTests({});
		}
	});
});
