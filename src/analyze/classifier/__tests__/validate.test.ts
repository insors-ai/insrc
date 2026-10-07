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
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	isKindCompatibleWithTarget,
	TARGET_TO_KINDS,
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
	{ target: 'code',  allowed: ['repo', 'module', 'file', 'symbol', 'manifest-dir', 'workspace'] },
	{ target: 'data',  allowed: ['connection', 'repo', 'manifest-dir', 'workspace'] },
	{ target: 'infra', allowed: ['repo', 'manifest-dir', 'workspace'] },
	{ target: 'docs',  allowed: ['repo', 'module', 'file', 'workspace'] },
	{ target: 'generic', allowed: [...ALL_KINDS] },
];

test('the matrix covers every pairing: five kinds of source by seven kinds of scope', () => {
	assert.equal(PER_TARGET_ALLOWED.length * ALL_KINDS.length, 35);
	assert.deepEqual(
		PER_TARGET_ALLOWED.map(r => r.target).sort(),
		Object.keys(TARGET_TO_KINDS).sort(),
		'one row per kind of source in the table',
	);
});

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

test('validateIntentSemantics: infra+module -> scope-ref-kind-target-mismatch', async () => {
	const failure = await validateIntentSemantics(intent('infra', 'module', dirPath));
	assert.notEqual(failure, null);
	assert.equal(failure!.code, 'scope-ref-kind-target-mismatch');
	assert.match(failure!.message, /Allowed kinds for this target: repo, manifest-dir, workspace\./);
});

test('validateIntentSemantics: pairings the plan tasks accept are accepted (infra+repo, data+repo, data+manifest-dir, code+manifest-dir)', async () => {
	// Each was refused by the table before it was corrected, though the
	// source's own plan tasks accept that kind of scope.
	const accepted: ReadonlyArray<readonly [AnalyzeTarget, AnalyzeScopeRef['kind']]> = [
		['infra', 'repo'],
		['data',  'repo'],
		['data',  'manifest-dir'],
		['code',  'manifest-dir'],
	];
	for (const [target, kind] of accepted) {
		const failure = await validateIntentSemantics(intent(target, kind, dirPath));
		assert.equal(failure, null, `${target}+${kind} should pass (got ${JSON.stringify(failure)})`);
	}
});

// ---------------------------------------------------------------------------
// validateIntentSemantics -- a symbol's value: '<absolute file path>#<entity name>'
// ---------------------------------------------------------------------------

test('validator symbol form: passes, no \'#\', file part not a file', async () => {
	// passes when the file exists; the name is not checked here.
	assert.equal(await validateIntentSemantics(intent('code', 'symbol', `${filePath}#settle`)), null);

	// A file path that itself contains '#': split at the LAST one.
	const hashDir = join(sandbox, 'c#');
	mkdirSync(hashDir, { recursive: true });
	const hashFile = join(hashDir, 'pay.ts');
	writeFileSync(hashFile, 'x', 'utf8');
	assert.equal(await validateIntentSemantics(intent('code', 'symbol', `${hashFile}#settle`)), null);

	// no '#': a bare path is no longer a symbol value, even though it exists.
	for (const value of [filePath, `${filePath}#`, '#settle']) {
		const failure = await validateIntentSemantics(intent('code', 'symbol', value));
		assert.equal(failure?.code, 'scope-ref-unresolved', value);
		assert.match(failure!.message, /<absolute file path>#<entity name>/, value);
	}

	// file part is a directory.
	const dirFailure = await validateIntentSemantics(intent('code', 'symbol', `${dirPath}#settle`));
	assert.equal(dirFailure?.code, 'scope-ref-unresolved');
	assert.match(dirFailure!.message, /is not a file/);

	// file part does not exist.
	const missing = await validateIntentSemantics(intent('code', 'symbol', `${join(sandbox, 'nope.ts')}#settle`));
	assert.equal(missing?.code, 'scope-ref-unresolved');
	assert.match(missing!.message, /does not exist on disk/);
});

// ---------------------------------------------------------------------------
// The classifier's prompt states the same table
// ---------------------------------------------------------------------------

test("classifier prompt's pairing list equals the exported table", () => {
	const promptPath = fileURLToPath(new URL('../../../prompts/analyze/classify.system.md', import.meta.url));
	const prompt = readFileSync(promptPath, 'utf8');

	// Lines of the form:  - `target=code`    → kinds: `repo | module | ...`
	//                or:  - `target=generic` → any kind
	const fromPrompt: Record<string, string[]> = {};
	for (const line of prompt.split('\n')) {
		const m = /^\s*-\s+`target=([a-z]+)`\s+→\s+(?:kinds:\s+`([^`]+)`|(any kind))\s*$/.exec(line);
		if (m === null) continue;
		fromPrompt[m[1]!] = m[3] !== undefined
			? [...ALL_KINDS]
			: m[2]!.split('|').map(k => k.trim());
	}

	const fromTable: Record<string, string[]> = {};
	for (const [target, kinds] of Object.entries(TARGET_TO_KINDS)) fromTable[target] = [...kinds];

	assert.deepEqual(Object.keys(fromPrompt).sort(), Object.keys(fromTable).sort(), 'the prompt lists every kind of source');
	for (const target of Object.keys(fromTable)) {
		assert.deepEqual(
			[...fromPrompt[target]!].sort(),
			[...fromTable[target]!].sort(),
			`target=${target}: prompt and table disagree`,
		);
	}

	// The symbol rule is stated in the prompt in the same form the validator enforces.
	assert.ok(prompt.includes('`<absolute file path>#<entity name>`'), 'the prompt states the symbol form');
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
