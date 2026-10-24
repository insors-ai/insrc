/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The decomposer's codex-expressible params and the params step both plan entry
 * points share (ISSUE-8d39ef09, LLD-9874475f902756f6-S001 t2).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codexStrictSchema, validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { LLMProvider } from '../../../shared/types.js';
import { decompose, DECOMPOSE_SCHEMA, DecomposerSchemaUnrecoverable, finalizeDecompose } from '../decomposer.js';
import type { ResolvedScope } from '../scope.js';

const REPO = '/repo';
const INTENT: ClassifiedIntent = { target: 'code', scope: 'M', focused: true, focus: 'how does settlement work', scopeRef: { kind: 'module', value: `${REPO}/src` }, reasoning: 'test' };
const SCOPE: ResolvedScope = { kind: 'module', value: `${REPO}/src`, repoPath: REPO, lookupPath: `${REPO}/src` };

const plan = (explorations: unknown[]) => ({ answerType: 'how-does-it-work', synthesisHint: 'h', explorations });
const answering = (reply: unknown): LLMProvider => ({ completeStructured: async () => reply } as unknown as LLMProvider);

/** Every object node of a schema that codex's strict grammar refuses: no properties, or additionalProperties not false. */
function refusedObjects(node: unknown, path = '(root)', out: string[] = []): string[] {
	if (Array.isArray(node)) { node.forEach((n, i) => refusedObjects(n, `${path}[${i}]`, out)); return out; }
	if (node === null || typeof node !== 'object') return out;
	const n = node as Record<string, unknown>;
	const isObject = n['type'] === 'object' || (Array.isArray(n['type']) && (n['type'] as unknown[]).includes('object'));
	if (isObject && (n['properties'] === undefined || n['additionalProperties'] !== false)) out.push(path);
	for (const [k, v] of Object.entries(n)) if (!['enum', 'const', 'default', 'examples'].includes(k)) refusedObjects(v, `${path}.${k}`, out);
	return out;
}

test('the codex strict copy of DECOMPOSE_SCHEMA contains no object without properties and no object whose additionalProperties is not false', () => {
	assert.deepEqual(refusedObjects(codexStrictSchema(DECOMPOSE_SCHEMA)), []);
});

test("decompose and finalizeDecompose remove null params, so the executor receives today's params", async () => {
	const reply = plan([
		{ id: 'e1', type: 'symbol.locate', purpose: 'p', params: { names: ['runReview'], kinds: null, limit: null, matchMode: null } },
		{ id: 'e2', type: 'search.text', purpose: 'p', params: { pattern: 'X', glob: null, caseInsensitive: null, topK: 5, path: null }, dependsOn: ['e1'] },
	]);
	const today = [{ names: ['runReview'] }, { pattern: 'X', topK: 5 }];
	const viaDecompose = await decompose({ intent: INTENT, runId: 'r', scope: SCOPE, provider: answering(reply) });
	assert.deepEqual(viaDecompose.explorations.map(e => e.params), today, 'decompose');
	assert.deepEqual(finalizeDecompose(reply).explorations.map(e => e.params), today, 'finalizeDecompose');
});

test('an exploration carrying a key its type does not declare fails with DecomposerSchemaUnrecoverable at decompose and at finalizeDecompose', async () => {
	// module.profile given concept.resolve's params: valid against the unbound params anyOf, refused by the step.
	const reply = plan([{ id: 'e1', type: 'module.profile', purpose: 'p', params: { query: 'x' } }]);
	assert.ok(validateAgainstSchema(DECOMPOSE_SCHEMA, reply).ok, "the schema's anyOf alone admits the pair");
	const named = (e: unknown): boolean => e instanceof DecomposerSchemaUnrecoverable && /'e1' \(module\.profile\) has param 'query'/.test((e as Error).message + JSON.stringify(e));
	await assert.rejects(decompose({ intent: INTENT, runId: 'r', scope: SCOPE, provider: answering(reply) }), named);
	assert.throws(() => finalizeDecompose(reply), named);
});

test('empty params, a placeholder string where an array is expected, and a plan omitting optional params validate against DECOMPOSE_SCHEMA', () => {
	const ok = (explorations: unknown[]) => validateAgainstSchema(DECOMPOSE_SCHEMA, plan(explorations)).ok;
	assert.ok(ok([{ id: 'e1', type: 'module.profile', purpose: 'no path could be expressed', params: {} }]), 'empty params');
	assert.ok(ok([
		{ id: 'e1', type: 'module.profile', purpose: 'p', params: { path: '/repo/src' } },
		{ id: 'e2', type: 'symbol.locate', purpose: 'p', params: { names: '$e1.profile.exports[0..2]' }, dependsOn: ['e1'] },
	]), 'a placeholder where an array is expected');
	assert.ok(ok([{ id: 'e1', type: 'search.text', purpose: 'p', params: { pattern: 'X' } }]), 'optional params omitted (non-codex providers)');
	assert.deepEqual(finalizeDecompose(plan([{ id: 'e1', type: 'module.profile', purpose: 'p', params: {} }])).explorations[0]!.params, {}, 'empty params pass the step unchanged');
});
