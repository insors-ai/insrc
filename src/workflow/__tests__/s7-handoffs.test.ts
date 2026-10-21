import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the plans document names each s7 hand-off to s9', () => {
	const doc = readFileSync(join(ROOT, 'docs', 'plans', 'core-data-model.md'), 'utf8');
	const at = doc.indexOf('## s7 build: hand-offs to s9');
	assert.ok(at >= 0, 'the section exists');
	const rest = doc.slice(at + 1);
	const next = rest.indexOf('\n## ');
	const section = next < 0 ? rest : rest.slice(0, next);
	const items = section.split('\n').filter(l => /^[1-9]\. \*\*/.test(l));
	assert.equal(items.length, 6, 'six numbered items');
	const expect: ReadonlyArray<readonly [RegExp, ReadonlyArray<RegExp>]> = [
		[/creates Task heads for the Stories planned before s7/, [/`bindingHome`/, /`taskBuildPassed`/, /`createFromPlan`/, /fallbacks/]],
		[/removes the Plan's Task record fields/, [/`taskRefs`/, /`units`/, /`src\/workflow\/tracker\/resolve\.ts`/, /`pushTasks`/]],
		[/task table from the Tasks \(Gap 11\.4\)/, [/`planTaskId`/]],
		[/revision-less log entries/, [/`History\.appendLog`/, /`recordBuildRound`/, /`orderedEntryId`/]],
		[/overwrites a Task from the plan's row/, [/`reconcile`/, /withdrawn/, /next number/]],
		[/pending issue close/, [/`pending-close`/, /binding/]],
	];
	expect.forEach(([title, parts], i) => {
		assert.match(items[i] ?? '', title);
		for (const part of parts) assert.match(items[i] ?? '', part);
	});
});
