/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Boot-time prompt validator tests.
 *
 * The validator resolves each PROMPT_PATHS entry against the insrc
 * root and asserts the file exists + has non-empty content. Failure
 * mode is a typed AnalyzePromptValidationError listing every missing
 * / empty / unreadable prompt.
 *
 * Strategy:
 *   1. Happy path -- with all five real prompt files present in the
 *      repo, validateAnalyzePrompts() returns without throwing.
 *   2. Failure paths -- temporarily move a prompt file out of the
 *      way, run the validator, assert the typed error fires with the
 *      missing entry listed. Restore the file before the test ends.
 *
 * Pure file-I/O tests. No LLM, no Ollama dependency.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/context/__tests__/boot-validator.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROMPT_PATHS } from '../index.js';
import {
	AnalyzePromptValidationError,
	validateAnalyzePrompts,
} from '../boot-validator.js';

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function insrcRoot(): string {
	// This test file lives at .../analyze/context/__tests__/boot-validator.test.ts
	// (or .js in compiled). insrcRoot = ../../../..
	const thisFile = fileURLToPath(import.meta.url);
	return resolve(thisFile, '..', '..', '..', '..');
}

function promptAbs(shaperId: keyof typeof PROMPT_PATHS): string {
	return join(insrcRoot(), PROMPT_PATHS[shaperId]);
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('validateAnalyzePrompts: every PROMPT_PATHS entry is present + non-empty', () => {
	// Sanity check on the test's own assumption: the five expected
	// prompt files exist in the repo.
	for (const id of Object.keys(PROMPT_PATHS) as (keyof typeof PROMPT_PATHS)[]) {
		const abs = promptAbs(id);
		assert.ok(existsSync(abs), `prompt file should exist: ${abs}`);
		const body = readFileSync(abs, 'utf8');
		assert.ok(body.trim().length > 0, `prompt file should be non-empty: ${abs}`);
	}
	// And the validator agrees.
	assert.doesNotThrow(() => validateAnalyzePrompts());
});

// ---------------------------------------------------------------------------
// Failure path: missing file
// ---------------------------------------------------------------------------

test('validateAnalyzePrompts: throws when a prompt file is missing', () => {
	const targetId = 'data' as const;
	const abs = promptAbs(targetId);
	const tmpStash = `${abs}.bak-${process.pid}`;

	// Move the file out of the way.
	renameSync(abs, tmpStash);
	try {
		assert.throws(
			() => validateAnalyzePrompts(),
			(err: unknown) => {
				assert.ok(err instanceof AnalyzePromptValidationError);
				assert.equal(err.missing.length, 1);
				assert.equal(err.missing[0]!.componentId, targetId);
				assert.equal(err.missing[0]!.path, abs);
				assert.match(err.missing[0]!.reason, /file not found/);
				assert.match(err.message, /prompt validation failed/);
				assert.match(err.message, new RegExp(targetId));
				return true;
			},
		);
	} finally {
		// Restore.
		renameSync(tmpStash, abs);
	}
});

// ---------------------------------------------------------------------------
// Failure path: empty file
// ---------------------------------------------------------------------------

test('validateAnalyzePrompts: throws when a prompt file is empty', () => {
	const targetId = 'infra' as const;
	const abs = promptAbs(targetId);
	const tmpStash = `${abs}.bak-${process.pid}`;

	// Stash the real contents, replace with empty body.
	renameSync(abs, tmpStash);
	writeFileSync(abs, '   \n  \t  ', 'utf8');
	try {
		assert.throws(
			() => validateAnalyzePrompts(),
			(err: unknown) => {
				assert.ok(err instanceof AnalyzePromptValidationError);
				assert.equal(err.missing.length, 1);
				assert.equal(err.missing[0]!.componentId, targetId);
				assert.match(err.missing[0]!.reason, /empty/);
				return true;
			},
		);
	} finally {
		// Restore the real file, drop the placeholder.
		rmSync(abs);
		renameSync(tmpStash, abs);
	}
});

// ---------------------------------------------------------------------------
// Failure path: multiple missing collected in one go
// ---------------------------------------------------------------------------

test('validateAnalyzePrompts: collects ALL failures in one error', () => {
	const a = promptAbs('classification');
	const b = promptAbs('generic');
	const aStash = `${a}.bak-${process.pid}`;
	const bStash = `${b}.bak-${process.pid}`;

	renameSync(a, aStash);
	renameSync(b, bStash);
	try {
		assert.throws(
			() => validateAnalyzePrompts(),
			(err: unknown) => {
				assert.ok(err instanceof AnalyzePromptValidationError);
				assert.equal(err.missing.length, 2);
				const ids = err.missing.map(m => m.componentId).sort();
				assert.deepEqual(ids, ['classification', 'generic']);
				return true;
			},
		);
	} finally {
		renameSync(aStash, a);
		renameSync(bStash, b);
	}
});

// ---------------------------------------------------------------------------
// AnalyzePromptValidationError structural shape
// ---------------------------------------------------------------------------

test('AnalyzePromptValidationError preserves the failures array on the instance', () => {
	const e = new AnalyzePromptValidationError([
		{ componentId: 'code', path: '/abs/path/code.md', reason: 'file not found' },
	]);
	assert.equal(e.name, 'AnalyzePromptValidationError');
	assert.equal(e.missing.length, 1);
	assert.equal(e.missing[0]!.componentId, 'code');
	assert.match(e.message, /code: \/abs\/path\/code\.md \(file not found\)/);
});

// ---------------------------------------------------------------------------
// Smoke: prompt files have the expected structure (role intro present,
// not just whitespace)
// ---------------------------------------------------------------------------

const SHAPER_ROLE_INTRO_HINTS: Readonly<Record<keyof typeof PROMPT_PATHS, RegExp>> = {
	classification: /classification context builder/i,
	generic:        /generic-target run-level/i,
	code:           /code-shaper/i,
	data:           /data-shaper/i,
	infra:          /infrastructure-shaper|infra-shaper/i,
	docs:           /docs-shaper/i,
};

for (const id of Object.keys(PROMPT_PATHS) as (keyof typeof PROMPT_PATHS)[]) {
	test(`prompt file for '${id}' has a role intro matching expectations`, () => {
		const body = readFileSync(promptAbs(id), 'utf8');
		assert.match(body, SHAPER_ROLE_INTRO_HINTS[id]);
	});
}

// Use the tmp helpers somewhere so they're imported correctly under
// strict lint -- they're left in case future failure tests need them.
test('tmp helpers are wired (smoke)', () => {
	const d = mkdtempSync(join(tmpdir(), 'analyze-boot-validator-smoke-'));
	try {
		assert.ok(existsSync(d));
	} finally {
		rmSync(d, { recursive: true });
	}
});
