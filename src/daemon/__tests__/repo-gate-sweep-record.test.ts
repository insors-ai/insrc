/**
 * Story 64703b708590bd68/s1, task t8: the full sweep cannot be repeated by a test; this one pins that its record exists with the comparison against the tree
 * before the fix and the outcome sections (deviations, scope decision, open items).
 * Run: npx tsx --test-force-exit src/daemon/__tests__/repo-gate-sweep-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'plans', 'repo-gate-outcome.md'), 'utf8');

test('repo-gate-sweep-record.test.ts: the full sweep compared by test name with the tree before the fix shows no new failure and no new skipped test, and the outcome section is written', () => {
	const sweep = doc.slice(doc.indexOf('## Full sweep'), doc.indexOf('## Deviations'));
	assert.match(sweep, /e87df83c2/, 'it names the tree before the fix');
	assert.match(sweep, /Compared by test name/);
	assert.match(sweep, /No new skipped test/);
	assert.match(sweep, /167 of the failing results fail in the tree before the fix too/);
	for (const heading of ['## Deviations from the LLD and the plan, and why', '## Scope decision', '## Installed daemon', '## Open items']) {
		assert.ok(doc.includes(heading), heading);
	}
});
