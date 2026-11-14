/**
 * The planner offers no limit (LLD-b9d5c5c40df5a574-s4, task t12).
 *
 * No lookup stops at a count or cuts an item, so neither the lookup planner's
 * prompt and params nor the task planner's catalog offers a parameter that
 * says how many results to return or how much of an item to read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EXPLORATION_PARAMS } from '../../explore/params-schema.js';
import { _resetTemplateRegistryForTests, getTemplateCatalog, registerBuiltinTemplates, renderCatalog } from '../../planner/index.js';
import { _resetTemplateBootstrapLatchForTests } from '../../planner/templates/bootstrap.js';

const REMOVED = ['limit', 'topK', 'maxSources', 'previewChars', 'maxConstraintSources'] as const;

test('the planning prompt and catalog contain no limit, topK, maxSources or previewChars and no fixed result count', () => {
	// The lookup planner's prompt: its examples and its catalog of params.
	const prompt = readFileSync(join(process.cwd(), 'src/prompts/analyze/decompose.system.md'), 'utf8');
	for (const name of REMOVED) assert.equal(new RegExp(`\\b${name}\\b`).test(prompt), false, `decompose.system.md names ${name}`);
	// No fixed result count: no "top 20", "first 15" or "N results".
	assert.equal(/\b(top|first)[- ]?\d+\b/i.test(prompt), false, 'a top-N or first-N count');
	assert.equal(/\b([2-9]|\d{2,}) (hits|results|matches|symbols|callers|tables|sections|candidates)\b/.test(prompt), false, 'a count of results');

	// The params every lookup takes.
	for (const [type, params] of Object.entries(EXPLORATION_PARAMS)) {
		for (const name of REMOVED) assert.equal(name in params, false, `${type} takes ${name}`);
	}

	// The task planner's catalog, as it is shown to the planner.
	_resetTemplateBootstrapLatchForTests();
	_resetTemplateRegistryForTests();
	registerBuiltinTemplates();
	const shown = renderCatalog(getTemplateCatalog());
	for (const name of REMOVED) assert.equal(new RegExp(`\\b${name}\\b`).test(shown), false, `the catalog names ${name}`);
	assert.equal(/\btop-?K\b/i.test(shown), false, 'the catalog describes a top-K');
});
