import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the plans doc lists the four s9 conversion inputs from the common model Story', () => {
	const doc = readFileSync(join(ROOT, 'docs', 'plans', 'core-data-model.md'), 'utf8');
	const at = doc.indexOf('## s2 build: s9 conversion inputs');
	assert.ok(at >= 0, 'the section exists');
	const rest = doc.slice(at + 1);
	const next = rest.indexOf('\n## ');
	const section = next < 0 ? rest : rest.slice(0, next);
	const items = section.split('\n').filter(l => /^[1-9]\. \*\*/.test(l));
	assert.equal(items.length, 4, 'four numbered inputs');
	for (const [i, topic] of [[0, /flat amendments/i], [1, /envelope and lifecycle/i], [2, /feedback conversion/i], [3, /version marker/i]] as const) {
		assert.match(items[i] ?? '', topic);
	}
	// each input names what it relies on
	assert.match(section, /convertLegacyFeedback/);
	assert.match(section, /legacyBatchOutcomes/);
	assert.match(section, /RepoSchemaGate\.require\(repo, 2\)/);
	assert.match(section, /\.insrc\/schema\.json/);
});
