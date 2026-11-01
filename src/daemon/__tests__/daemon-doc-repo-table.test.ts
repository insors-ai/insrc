/**
 * Story 64703b708590bd68/s1, task t7: docs/daemon.md lists the calls of the repo gate's table and its refusal codes.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/daemon-doc-repo-table.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FILE_MODIFYING_METHODS } from '../repo-call-gate.js';

const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'daemon.md'), 'utf8');
const section = doc.slice(doc.indexOf('## Calls that modify files name their repository'), doc.indexOf('## CLI reference'));

test('daemon-doc-repo-table.test.ts: docs/daemon.md lists the methods of the table and the refusal codes', () => {
	assert.ok(section.length > 200, 'the section exists');
	const documented = [...section.matchAll(/^\| `([^`]+)` \| `([^`]+)` \|/gm)].map(m => [m[1]!, m[2]!] as const);
	assert.deepEqual(documented.map(([m]) => m).sort(), Object.keys(FILE_MODIFYING_METHODS).sort(), 'the documented calls are exactly the table');
	for (const [method, repoParam] of documented) assert.equal(repoParam, FILE_MODIFYING_METHODS[method]!.repoParam, `${method}: repo param`);
	for (const code of ['repo-missing', 'repo-not-absolute', 'repo-not-directory', 'repo-not-registered', 'path-outside-repo', 'repo-mismatch']) {
		assert.ok(section.includes(`\`${code}\``), `the refusal code ${code} is documented`);
	}
	for (const phrase of ['absolute path of a registered repository', 'never', 'INSRC_REPO']) assert.ok(section.includes(phrase), phrase);
});
