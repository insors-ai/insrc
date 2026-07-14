/**
 * Node-fallback smoke tests for `runGrepSearch` -- the shared helper
 * behind both the `search_grep` tool and the `search.text`
 * exploration.
 *
 * The regression this pins: the fallback used to compile the regex
 * with a `g` flag and share it across `.test()` calls per line,
 * which advances lastIndex and silently drops matches after the
 * first hit per file. This test seeds a temp tree with the same
 * literal shape that surfaced the bug in the live insors-extraction
 * adherence run (repeated model-id lines in a `.py` file) and
 * asserts every line is matched.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runGrepSearch } from '../grep.js';

function makeFixture(): { root: string; pyPath: string } {
	const root = mkdtempSync(join(tmpdir(), 'insrc-grep-core-'));
	const sub = join(root, 'src', 'llm');
	mkdirSync(sub, { recursive: true });
	const pyPath = join(sub, 'client.py');
	writeFileSync(
		pyPath,
		[
			'# unrelated line',
			'model = "claude-haiku-4-5"',
			'other = "not a model"',
			'model2 = "claude-haiku-4-5-20251001"',
			'nested = {"model": "claude-haiku-4-5"}',
			'note = "fallback if unset"',
			'model3 = "claude-sonnet-4-5"',
			'model4 = "claude-opus-4-1"',
		].join('\n'),
		'utf8',
	);
	writeFileSync(join(root, 'src', 'llm', 'other.md'), 'just docs, do not match', 'utf8');
	return { root, pyPath };
}

test('runGrepSearch: node fallback matches every occurrence, not just the first per file', async () => {
	const { root } = makeFixture();
	const result = await runGrepSearch({
		pattern: '(claude-(opus|sonnet|haiku))[-_]?[0-9]*',
		root,
		glob:    '*.py',
	});
	// Fresh regex per line is now stateless -> every candidate line hits.
	// Expected: 5 hits (haiku, haiku-20251001, nested haiku, sonnet, opus).
	assert.equal(result.hits.length, 5, `expected 5 hits, got ${result.hits.length}: ${JSON.stringify(result.hits)}`);
	// The .md file must be filtered out by the glob.
	for (const h of result.hits) {
		assert.match(h.path, /\.py$/, `glob leaked non-.py file: ${h.path}`);
	}
});

test('runGrepSearch: honours caseInsensitive flag', async () => {
	const { root } = makeFixture();
	const result = await runGrepSearch({
		pattern: 'HAIKU',
		root,
		glob:    '*.py',
		caseInsensitive: true,
	});
	assert.ok(result.hits.length >= 3, `expected at least 3 case-insensitive haiku hits, got ${result.hits.length}`);
});

test('runGrepSearch: rejects empty pattern', async () => {
	await assert.rejects(
		() => runGrepSearch({ pattern: '', root: '/tmp' }),
		/pattern is required/,
	);
});
