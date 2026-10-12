/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Test files that used to open the graph store at its DEFAULT path — the
 * daemon's live store — because they set no temporary one (Epic c2ba6fa6,
 * Story s4, t9). Every process that opens and closes the live store can remove
 * a running daemon's locks.
 *
 * Each file is run here in its own temporary home, so that "the default path"
 * is a path inside that home. The file must pass, and nothing may appear there.
 *
 * Run: npx tsx --test src/db/graph/__tests__/no-live-store-in-tests.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const homes: string[] = [];
after(() => { for (const h of homes) rmSync(h, { recursive: true, force: true }); });

interface Run { status: number | null; pass: number; fail: number; storeFiles: string[]; out: string; }

/** Run one test file with HOME pointed at a fresh temporary directory. */
function runInTemporaryHome(file: string): Run {
	const home = mkdtempSync(join(tmpdir(), 'insrc-no-live-'));
	homes.push(home);
	// A test runner started from inside a test runs nothing unless this is cleared.
	const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
	delete env['NODE_TEST_CONTEXT'];
	const r = spawnSync(process.execPath, ['--import', 'tsx/esm', '--test', '--test-force-exit', '--test-reporter=tap', file], {
		cwd: REPO, env, encoding: 'utf8', timeout: 120_000,
	});
	const out = `${r.stdout}${r.stderr}`;
	const count = (label: string): number => Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(out)?.[1] ?? -1);
	const insrc = join(home, '.insrc');
	const storeFiles = existsSync(insrc) ? readdirSync(insrc).filter(n => n.startsWith('graph.lmdb')) : [];
	return { status: r.status, pass: count('pass'), fail: count('fail'), storeFiles, out };
}

function assertCleanRun(file: string): void {
	const r = runInTemporaryHome(file);
	assert.equal(r.status, 0, `${file} passes\n${r.out.slice(-2000)}`);
	assert.ok(r.pass > 0, `${file} ran its tests (${r.pass} passed)`);
	assert.equal(r.fail, 0);
	assert.deepEqual(r.storeFiles, [], `${file} created no store at the default path`);
}

test('the two formerly live-store test files pass against a temporary store and create nothing at the default path', () => {
	assertCleanRun('src/analyze/explore/__tests__/freeform-probe-scope.test.ts');
	assertCleanRun('src/analyze/explore/__tests__/phase5-explorations-params.test.ts');
});

test('the review probe test, found by the same search, creates nothing at the default path either', () => {
	assertCleanRun('src/workflow/review/__tests__/probe-source-roots.test.ts');
});

test('three daemon request tests, found by the same search, create nothing at the default path', () => {
	assertCleanRun('src/daemon/__tests__/analyze-rpc.test.ts');
	assertCleanRun('src/daemon/__tests__/code-review-rpc.test.ts');
	assertCleanRun('src/daemon/__tests__/workflow-review-rpc.test.ts');
});

test('the MCP step and review tests, found by the full audit, create nothing at the default path', () => {
	for (const file of [
		'src/daemon/steps/__tests__/analyze-step-handler.test.ts',
		'src/daemon/steps/__tests__/analyze-step-narrow.test.ts',
		'src/daemon/steps/__tests__/analyze-step-scope.test.ts',
		'src/daemon/steps/review-step/__tests__/review-step-routing.test.ts',
		'src/daemon/steps/review-step/__tests__/review-step.test.ts',
		'src/workflow/__tests__/spec-review-approve.test.ts',
		'src/workflow/review/__tests__/review.test.ts',
		'src/workflow/review/__tests__/same-party-refusal.test.ts',
		'src/workflow/review/__tests__/template-review.test.ts',
	]) assertCleanRun(file);
});

test('the check sees a store that IS opened at the default path', () => {
	// Falsifies the three assertions above: a file that opens the store with no
	// path set must be reported, or "created nothing" proves nothing.
	const r = runInTemporaryHome('src/db/graph/__tests__/helpers/opens-default-store.fixture.ts');
	assert.equal(r.status, 0, r.out.slice(-2000));
	assert.deepEqual(r.storeFiles.sort(), ['graph.lmdb', 'graph.lmdb-lock']);
});
