/**
 * Story s9, task t11: the build runners' git reads, now over the tool registry, give the values the synchronous versions gave on the same
 * repositories and write the same records. The expected values in fixtures/build-scenarios.expected.json were produced by running
 * helpers/build-scenarios.ts against the versions that ran git themselves (the commit before this task); they are fixed values now.
 * Run: npx tsx --test-force-exit src/workflow/runners/build/__tests__/build-runners-parity.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStartRelPath } from '../range-base.js';
import { runBuildScenarios } from './helpers/build-scenarios.js';
import { newBuildApi } from './helpers/new-build-api.js';

const expected = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'build-scenarios.expected.json'), 'utf8')) as Record<string, unknown>;

test('build-runners-parity.test.ts: range base, build start stamp and standalone record return the old values and write the same records', async () => {
	const actual = JSON.parse(JSON.stringify(await runBuildScenarios(newBuildApi, buildStartRelPath))) as Record<string, unknown>;
	assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
	for (const name of Object.keys(expected)) assert.deepEqual(actual[name], expected[name], name);
});
