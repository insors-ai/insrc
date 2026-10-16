/**
 * Story E2026101614851595:S001 — the Ponytail credit is kept where a reader of the repository can
 * find it, with the licence text its MIT licence asks to be kept.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

test('the third-party notice at the repository root names Ponytail, links its repository, carries its copyright line and its MIT licence text, and says where the ladder was used', () => {
	const notice = readFileSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), 'utf8');
	assert.match(notice, /## Ponytail/);
	assert.ok(notice.includes('https://github.com/DietrichGebert/ponytail'));
	assert.ok(notice.includes('Copyright (c) 2026 DietrichGebert'));
	assert.ok(notice.includes('MIT License'));
	assert.match(notice, /Permission is hereby granted, free of charge, to any person obtaining a copy/);
	assert.match(notice, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/);
	// It says where the ladder was used, and those places exist.
	for (const place of ['src/prompts/build/implement-task.md', 'renderStandaloneImplementPrompt', 'src/workflow/runners/scope-prompts.ts', 'SMALLEST_CHANGE_RULE', 'SMALLEST_SHAPE_RULE']) {
		assert.ok(notice.includes(place), `names ${place}`);
	}
	// The source comment credits it too.
	assert.ok(readFileSync(join(ROOT, 'src/workflow/runners/scope-prompts.ts'), 'utf8').includes('github.com/DietrichGebert/ponytail'));
});
