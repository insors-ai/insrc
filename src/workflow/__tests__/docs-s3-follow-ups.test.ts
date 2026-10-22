import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the plans doc lists the four hand-offs from the lifecycle Story', () => {
	const doc = readFileSync(join(ROOT, 'docs', 'plans', 'core-data-model.md'), 'utf8');
	const at = doc.indexOf('## s3 build: hand-offs to later Stories');
	assert.ok(at >= 0, 'the section exists');
	const rest = doc.slice(at + 1);
	const next = rest.indexOf('\n## ');
	const section = next < 0 ? rest : rest.slice(0, next);
	const items = section.split('\n').filter(l => /^[1-9]\. \*\*/.test(l));
	assert.equal(items.length, 4, 'four numbered hand-offs');
	for (const [i, topic] of [[0, /s4 wires a durable `LifecycleService`/], [1, /legacy meta fields until s9/], [2, /pass-through codecs/], [3, /Task side of `CompletionEvidence`/]] as const) {
		assert.match(items[i] ?? '', topic);
	}
	assert.match(items[0] ?? '', /AMD-8/);
	assert.match(items[2] ?? '', /s7/);
	assert.match(items[3] ?? '', /s7/);
});
