import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('s8-handoffs.test.ts: the plans document names each s8 hand-off to s9', () => {
	const doc = readFileSync(join(ROOT, 'docs', 'plans', 'core-data-model.md'), 'utf8');
	const at = doc.indexOf('## s8 build: hand-offs to s9');
	assert.ok(at >= 0, 'the section exists');
	const rest = doc.slice(at + 1);
	const next = rest.indexOf('\n## ');
	const section = next < 0 ? rest : rest.slice(0, next);
	const items = section.split('\n').filter(l => /^[1-9]\. \*\*/.test(l));
	assert.equal(items.length, 5, 'five numbered items');
	const expect: ReadonlyArray<readonly [RegExp, ReadonlyArray<RegExp>]> = [
		[/Pre-s8 attach comments carry no marker/, [/`isFrameworkComment`/, /`<!-- insrc:attach:<artifact id> -->`/]],
		[/Story comments are recorded on the LLD/, [/`artifactOfUnit`/, /`tracker:<comment id>`/, /`feedback-post`/]],
		[/`feedback-post` receipts are revision-less/, [/`History\.appendLog`/, /`checkIntegrity`/, /`insrc:comment-sync`/]],
		[/no since point/, [/full read/, /`TrackerPort\.listComments`/, /`syncUnitComments`/]],
		[/first sync of a bound artifact posts any earlier feedback/, [/`postOutbound`/, /`feedback-post` receipt/, /cut-over/]],
	];
	expect.forEach(([title, parts], i) => {
		assert.match(items[i] ?? '', title);
		for (const part of parts) assert.match(items[i] ?? '', part);
	});
});
