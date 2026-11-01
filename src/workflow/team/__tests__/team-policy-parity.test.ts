/**
 * Story s9, task t7: the policy reader and the anchor finder, now over the tool registry, give the results the
 * synchronous versions gave on the same repositories. The expected values in fixtures/policy-scenarios.expected.json were
 * produced by running helpers/policy-scenarios.ts against the versions of policy-reader.ts, anchor-finder.ts and
 * sighting-store.ts that ran git themselves (the commit before this task); they are fixed values now that those are gone.
 * Run: npx tsx --test-force-exit src/workflow/team/__tests__/team-policy-parity.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { newApi } from './helpers/new-policy-api.js';
import { runPolicyScenarios } from './helpers/policy-scenarios.js';

const expected = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'policy-scenarios.expected.json'), 'utf8')) as Record<string, unknown>;

test('team-policy-parity.test.ts: policyReader and findAnchor equal the old functions on the same repositories', async () => {
	const actual = await runPolicyScenarios(newApi);
	assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
	for (const name of Object.keys(expected)) assert.deepEqual(actual[name], expected[name], name);
});
