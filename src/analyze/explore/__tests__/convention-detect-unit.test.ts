/**
 * plans/exploration-based-context-build.md Phase 4. Unit tests for
 * the pure helpers behind convention.detect -- name classification,
 * test-file convention detection, and the dominance rule that turns
 * a bucket count into a `NamingCase` label.
 *
 * These do NOT touch LMDB; they exercise the pure functions directly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	_classifyNameForTest,
	_classifyTestFileForTest,
	_dominantForTest,
} from '../convention-detect.js';
import { _classifyRoleForTest } from '../config-trace.js';
import { _tokeniseSubjectForTest } from '../test-locate.js';

// ---------------------------------------------------------------------------
// classifyName
// ---------------------------------------------------------------------------

test('classifyName: snake_case with underscore', () => {
	assert.equal(_classifyNameForTest('parse_invoice_header'), 'snake_case');
});

test('classifyName: all-lowercase word reads as snake_case', () => {
	// Single-word all-lowercase can't be distinguished from snake_case
	// without an underscore -- bucketed as snake_case per convention.
	assert.equal(_classifyNameForTest('parse'), 'snake_case');
});

test('classifyName: PascalCase class name', () => {
	assert.equal(_classifyNameForTest('InvoiceExtractor'), 'PascalCase');
});

test('classifyName: camelCase identifier', () => {
	assert.equal(_classifyNameForTest('getInvoiceHeader'), 'camelCase');
});

test('classifyName: kebab-case file name', () => {
	assert.equal(_classifyNameForTest('invoice-header'), 'kebab-case');
});

test('classifyName: strips single leading underscore for classification', () => {
	assert.equal(_classifyNameForTest('_private_helper'), 'snake_case');
});

test('classifyName: dunder methods classify as unknown', () => {
	assert.equal(_classifyNameForTest('__init__'),   'unknown');
	assert.equal(_classifyNameForTest('__repr__'),   'unknown');
});

test('classifyName: mixed underscore + uppercase', () => {
	assert.equal(_classifyNameForTest('MAX_RETRIES'), 'mixed');
});

test('classifyName: 1-char and empty strings are unknown', () => {
	assert.equal(_classifyNameForTest(''),  'unknown');
	assert.equal(_classifyNameForTest('a'), 'unknown');
});

// ---------------------------------------------------------------------------
// classifyTestFile
// ---------------------------------------------------------------------------

test('classifyTestFile: test_*.py -> test_*', () => {
	assert.equal(_classifyTestFileForTest('/repo/tests/test_matcher.py'), 'test_*');
});

test('classifyTestFile: *_test.go -> *_test', () => {
	assert.equal(_classifyTestFileForTest('/repo/matcher_test.go'), '*_test');
});

test('classifyTestFile: *.spec.ts -> *.spec', () => {
	assert.equal(_classifyTestFileForTest('/repo/foo.spec.ts'), '*.spec');
});

test('classifyTestFile: *.test.tsx -> *.test', () => {
	assert.equal(_classifyTestFileForTest('/repo/foo.test.tsx'), '*.test');
});

test('classifyTestFile: file inside tests/ dir with plain name -> inline', () => {
	assert.equal(_classifyTestFileForTest('/repo/tests/helpers.py'), 'inline');
});

test('classifyTestFile: production file -> none', () => {
	assert.equal(_classifyTestFileForTest('/repo/src/matcher.py'), 'none');
});

// ---------------------------------------------------------------------------
// dominant: 60% share AND 2x runner-up ratio
// ---------------------------------------------------------------------------

test('dominant: single bucket at 100% wins', () => {
	assert.equal(
		_dominantForTest({ snake_case: 10, camelCase: 0, PascalCase: 0, 'kebab-case': 0, mixed: 0, unknown: 0 }),
		'snake_case',
	);
});

test('dominant: 60% share + 2x runner-up wins', () => {
	// snake_case = 6, camelCase = 3, PascalCase = 1 -> 6/10 = 60% AND 6/3 = 2x
	assert.equal(
		_dominantForTest({ snake_case: 6, camelCase: 3, PascalCase: 1, 'kebab-case': 0, mixed: 0, unknown: 0 }),
		'snake_case',
	);
});

test('dominant: 50/50 split -> mixed', () => {
	assert.equal(
		_dominantForTest({ snake_case: 5, camelCase: 5, PascalCase: 0, 'kebab-case': 0, mixed: 0, unknown: 0 }),
		'mixed',
	);
});

test('dominant: unknown bucket is ignored in the total', () => {
	// 8 snake + 2 camel + 100 unknown -- the unknown bucket should not
	// dilute the share calculation, so snake still dominates.
	assert.equal(
		_dominantForTest({ snake_case: 8, camelCase: 2, PascalCase: 0, 'kebab-case': 0, mixed: 0, unknown: 100 }),
		'snake_case',
	);
});

test('dominant: empty -> unknown', () => {
	assert.equal(
		_dominantForTest({ snake_case: 0, camelCase: 0, PascalCase: 0, 'kebab-case': 0, mixed: 0, unknown: 0 }),
		'unknown',
	);
});

// ---------------------------------------------------------------------------
// config.trace role classification
// ---------------------------------------------------------------------------

test('config.trace role: JSON file, quoted key -> definition', () => {
	assert.equal(
		_classifyRoleForTest('/repo/config.json', '  "STRIPE_KEY": "sk_live_..."', 'STRIPE_KEY'),
		'definition',
	);
});

test('config.trace role: python getenv with fallback -> default', () => {
	assert.equal(
		_classifyRoleForTest('/repo/settings.py', 'os.getenv("STRIPE_KEY", "sk_test")', 'STRIPE_KEY'),
		'default',
	);
});

test('config.trace role: python getenv without fallback -> usage', () => {
	assert.equal(
		_classifyRoleForTest('/repo/settings.py', 'os.getenv("STRIPE_KEY")', 'STRIPE_KEY'),
		'usage',
	);
});

test('config.trace role: comment line -> unknown', () => {
	assert.equal(
		_classifyRoleForTest('/repo/settings.py', '# STRIPE_KEY is set at deploy time', 'STRIPE_KEY'),
		'unknown',
	);
});

// ---------------------------------------------------------------------------
// test.locate subject tokenisation
// ---------------------------------------------------------------------------

test('test.locate tokenise: strips stopwords + short tokens', () => {
	assert.deepEqual(_tokeniseSubjectForTest('the payable matcher module'), ['payable', 'matcher']);
});

test('test.locate tokenise: camelCase splits into fragments', () => {
	assert.deepEqual(
		_tokeniseSubjectForTest('PayableExtractionAgent'),
		['payable', 'extraction', 'agent'],
	);
});

test('test.locate tokenise: dedupes repeats', () => {
	assert.deepEqual(_tokeniseSubjectForTest('invoice invoice_matcher'), ['invoice', 'matcher']);
});
