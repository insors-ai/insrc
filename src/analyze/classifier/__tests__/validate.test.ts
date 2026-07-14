/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Cross-field validator tests for the classifier:
 *   - scopeRef.kind ↔ target compatibility matrix
 *   - filesystem path resolution rules per kind
 *   - connection-id resolution via injected callback
 *
 * Pure functional + filesystem tests; no LLM, no Ollama.
 *
 * Run:
 *   npx tsx --test src/insrc/analyze/classifier/__tests__/validate.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	isKindCompatibleWithTarget,
	validateIntentSemantics,
} from '../validate.js';
import type {
	AnalyzeScopeRef,
	AnalyzeTarget,
	ClassifiedIntent,
} from '../types.js';

// ---------------------------------------------------------------------------
// isKindCompatibleWithTarget matrix
// ---------------------------------------------------------------------------

const ALL_KINDS: ReadonlyArray<AnalyzeScopeRef['kind']> = [
	'repo', 'module', 'file', 'symbol', 'connection', 'manifest-dir', 'workspace',
];

const PER_TARGET_ALLOWED: ReadonlyArray<{ target: AnalyzeTarget; allowed: ReadonlyArray<AnalyzeScopeRef['kind']> }> = [
	{ target: 'code',  allowed: ['repo', 'module', 'file', 'symbol', 'workspace'] },
	{ target: 'data',  allowed: ['connection', 'workspace'] },
	{ target: 'infra', allowed: ['manifest-dir', 'workspace'] },
	{ target: 'generic', allowed: [...ALL_KINDS] },
];

for (const { target, allowed } of PER_TARGET_ALLOWED) {
	for (const kind of ALL_KINDS) {
		const expected = allowed.includes(kind);
		test(`isKindCompatibleWithTarget: target=${target}, kind=${kind} -> ${expected}`, () => {
			assert.equal(isKindCompatibleWithTarget(target, kind), expected);
		});
	}
}

// ---------------------------------------------------------------------------
// Sandbox setup for path-resolution tests
// ---------------------------------------------------------------------------

let sandbox: string;
let dirPath: string;
let filePath: string;

test.beforeEach(() => {
	sandbox = mkdtempSync(join(tmpdir(), 'classifier-validate-'));
	dirPath = join(sandbox, 'somedir');
	filePath = join(sandbox, 'somefile.txt');
	mkdirSync(dirPath, { recursive: true });
	writeFileSync(filePath, 'content', 'utf8');
});

test.afterEach(() => {
	rmSync(sandbox, { recursive: true, force: true });
});

function intent(
	target:    AnalyzeTarget,
	kind:      AnalyzeScopeRef['kind'],
	value:     string,
	focused = false,
): ClassifiedIntent {
	const base: Record<string, unknown> = {
		target,
		scope:     'M',
		focused,
		scopeRef:  { kind, value },
		reasoning: 'test',
	};
	if (focused) base['focus'] = 'test focus';
	return base as unknown as ClassifiedIntent;
}

// ---------------------------------------------------------------------------
// validateIntentSemantics -- kind/target mismatch detection
// ---------------------------------------------------------------------------

test('validateIntentSemantics: code+connection -> scope-ref-kind-target-mismatch', async () => {
	const failure = await validateIntentSemantics(intent('code', 'connection', 'whatever'));
	assert.notEqual(failure, null);
	assert.equal(failure!.code, 'scope-ref-kind-target-mismatch');
	assert.match(failure!.message, /connection.*code/);
});

test('validateIntentSemantics: data+file -> scope-ref-kind-target-mismatch', async () => {
	const failure = await validateIntentSemantics(intent('data', 'file', filePath));
	assert.notEqual(failure, null);
	assert.equal(failure!.code, 'scope-ref-kind-target-mismatch');
});

test('validateIntentSemantics: infra+repo -> scope-ref-kind-target-mismatch', async () => {
	const failure = await validateIntentSemantics(intent('infra', 'repo', dirPath));
	assert.notEqual(failure, null);
	assert.equal(failure!.code, 'scope-ref-kind-target-mismatch');
});

test('validateIntentSemantics: generic+any-kind -> no kind/target failure', async () => {
	// Every kind is compatible with generic. Path-resolution checks
	// still fire below; we use existing fixture paths.
	for (const kind of ['repo', 'module', 'file', 'manifest-dir', 'workspace'] as const) {
		const value = kind === 'file' ? filePath : dirPath;
		const failure = await validateIntentSemantics(intent('generic', kind, value));
		assert.equal(failure, null,
			`generic+${kind} should not fail (got ${JSON.stringify(failure)})`);
	}
});

// ---------------------------------------------------------------------------
// validateIntentSemantics -- filesystem path resolution
// ---------------------------------------------------------------------------

test('validateIntentSemantics: missing path -> scope-ref-unresolved', async () => {
	const failure = await validateIntentSemantics(intent('code', 'repo', join(sandbox, 'does-not-exist')));
	assert.notEqual(failure, null);
	assert.equal(failure!.code, 'scope-ref-unresolved');
	assert.match(failure!.message, /does not exist/);
});

test('validateIntentSemantics: kind=file but value is a directory -> scope-ref-unresolved', async () => {
	const failure = await validateIntentSemantics(intent('code', 'file', dirPath));
	assert.notEqual(failure, null);
	assert.equal(failure!.code, 'scope-ref-unresolved');
	assert.match(failure!.message, /expects a regular file/);
});

test('validateIntentSemantics: kind=repo but value is a file -> scope-ref-unresolved', async () => {
	const failure = await validateIntentSemantics(intent('code', 'repo', filePath));
	assert.notEqual(failure, null);
	assert.equal(failure!.code, 'scope-ref-unresolved');
	assert.match(failure!.message, /expects a directory/);
});

test('validateIntentSemantics: kind=workspace + real dir -> pass', async () => {
	const failure = await validateIntentSemantics(intent('code', 'workspace', dirPath));
	assert.equal(failure, null);
});

test('validateIntentSemantics: kind=file + real file -> pass', async () => {
	const failure = await validateIntentSemantics(intent('code', 'file', filePath));
	assert.equal(failure, null);
});

test('validateIntentSemantics: kind=manifest-dir + real dir + infra target -> pass', async () => {
	const failure = await validateIntentSemantics(intent('infra', 'manifest-dir', dirPath));
	assert.equal(failure, null);
});

// ---------------------------------------------------------------------------
// validateIntentSemantics -- connection-id resolution
// ---------------------------------------------------------------------------

test('validateIntentSemantics: kind=connection + registered id -> pass', async () => {
	const exists = async (id: string): Promise<boolean> => id === 'prod-db';
	const failure = await validateIntentSemantics(intent('data', 'connection', 'prod-db'), exists);
	assert.equal(failure, null);
});

test('validateIntentSemantics: kind=connection + unknown id -> scope-ref-unresolved', async () => {
	const exists = async (id: string): Promise<boolean> => id === 'prod-db';
	const failure = await validateIntentSemantics(intent('data', 'connection', 'staging-db'), exists);
	assert.notEqual(failure, null);
	assert.equal(failure!.code, 'scope-ref-unresolved');
	assert.match(failure!.message, /staging-db.*not registered/);
});

test('validateIntentSemantics: kind=connection + no callback -> pass (cannot verify)', async () => {
	// Without an injected callback the validator treats connection
	// existence as unverifiable, which is NOT a failure -- production
	// always wires the callback, tests can choose to omit it.
	const failure = await validateIntentSemantics(intent('data', 'connection', 'unknown'));
	assert.equal(failure, null);
});
