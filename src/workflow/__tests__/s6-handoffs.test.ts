import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the plans document names each s6 hand-off to s7 and s9 and each carve-out this Story chose', () => {
	const doc = readFileSync(join(ROOT, 'docs', 'plans', 'core-data-model.md'), 'utf8');
	const at = doc.indexOf('## s6 build: hand-offs to s7 and s9');
	assert.ok(at >= 0, 'the section exists');
	const rest = doc.slice(at + 1);
	const next = rest.indexOf('\n## ');
	const section = next < 0 ? rest : rest.slice(0, next);
	const items = section.split('\n').filter(l => /^[1-9]\. \*\*/.test(l));
	assert.equal(items.length, 6, 'six numbered items');
	const expect: ReadonlyArray<readonly [RegExp, ReadonlyArray<RegExp>]> = [
		[/Epic and Story bindings sit on the Define and the LLD until s9/, [/s9/, /`epicRef`/, /`storyRef`/, /`storyRefs`/, /`taskRefs`/, /renderers/]],
		[/Task record accessor and the Plan record go to s7/, [/s7/, /`bindingHome`/, /`readRecord`/]],
		[/not in the change log/, [/carve-out/]],
		[/lost-update window/, [/reconciled/, /marker/]],
		[/before s6 carry no marker/, [/post it a second time/]],
		[/`carryBinding`/, [/`prepareArtifactWrite`/, /`meta\.envelope\.attachments`/]],
	];
	expect.forEach(([title, parts], i) => {
		assert.match(items[i] ?? '', title);
		for (const part of parts) assert.match(items[i] ?? '', part);
	});
});
