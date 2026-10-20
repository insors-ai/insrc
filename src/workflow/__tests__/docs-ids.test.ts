/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * s1/t18 — the docs describe the strict lowercase ids, the stamped Epic anchor and the s9 conversion
 * inputs, and do not mention the removed docs migration command or give `S001` as a default.
 *
 * Run: npx tsx --test src/workflow/__tests__/docs-ids.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

test('the docs name the lowercase story form and the anchor rule and do not mention the removed command', () => {
	const workflow = read('docs/workflow.md');
	assert.match(workflow, /## Artifact ids/);
	assert.match(workflow, /lower case `s<n>`/, 'the lowercase story form');
	assert.match(workflow, /lower case `t<n>`/, 'the lowercase task form');
	assert.match(workflow, /not an id: an artifact stored with one fails with an error that points to the\s+s9 conversion/, 'uppercase is refused with a pointer to s9');
	assert.match(workflow, /### The Epic anchor/);
	assert.match(workflow, /`meta\.epicCreatedAt`/, 'the stamp');
	assert.match(workflow, /no Epic anchor/, 'a record with no stamp fails on a read');

	const plans = read('docs/plans/core-data-model.md');
	const conversion = plans.slice(plans.indexOf('## s9 conversion inputs'), plans.indexOf('## s1 LLD upstream prerequisites'));
	assert.ok(conversion.length > 0, 'the plans doc has an s9 conversion inputs section');
	for (const input of [/444 stored artifact files/, /`epicCreatedAt`/, /relabelled and retitled/, /`parentRef\.slug`/]) {
		assert.match(conversion, input);
	}

	// the removed command is named nowhere in the guides, and no guide gives S001 as a default
	for (const file of ['docs/workflow.md', 'docs/daemon.md', 'README.md', 'CLAUDE.md', 'AGENTS.md']) {
		const text = read(file);
		assert.doesNotMatch(text, /insrc-migrate-docs/, `${file} mentions the removed command`);
		assert.doesNotMatch(text, /(?:default|defaults to|e\.g\.|example)[^\n]{0,40}`?S00\d/i, `${file} gives S001 as a default or example`);
		assert.doesNotMatch(text, /-S00\d`?\)/, `${file} names an uppercase story artifact id`);
	}
	assert.doesNotMatch(conversion, /insrc-migrate-docs/);
});
