/**
 * Story s9, task t23: the full sweep is a run of the whole suite that no single test can repeat; this test pins that the record of it exists in
 * docs/plans/tool-registry.md with its comparison against the tree before s9 and the outcome section with the deviations and open items.
 * Run: npx tsx --test-force-exit src/workflow/__tests__/s9-sweep-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'plans', 'tool-registry.md'), 'utf8');

test('the full sweep (foreground, per area, --test-force-exit) compared by test name with the checkout before s9: no new failure and no new skipped test', () => {
	const sweep = doc.slice(doc.indexOf('## s9 full sweep'), doc.indexOf('## s9 outcome'));
	assert.ok(sweep.length > 0, 'the sweep section is written');
	assert.match(sweep, /968107369/, 'it names the tree before s9');
	assert.match(sweep, /compared by test name/i);
	assert.match(sweep, /No new skipped test/);
	assert.match(sweep, /Six files failed only in the s9 tree/, 'every failure that was only in the s9 tree is accounted for');
	const outcome = doc.slice(doc.indexOf('## s9 outcome'));
	assert.match(outcome, /### Deviations from the approved LLD and PLAN, and why/);
	assert.match(outcome, /### Open items/);
});
