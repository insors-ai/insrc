/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t8: a FieldSpec pattern is carried into the input schema, a shared field must agree on it,
 * and a value outside it is refused by the executor before any approval is asked.
 * Run: npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-field-pattern.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';

import { validateAgainstSchema } from '../../../../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../../../../shared/types.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { _resetRegistryForTests, registerTool } from '../../../registry.js';
import type { ApprovalGate, ApprovalRequest, ToolDeps } from '../../../types.js';
import { NAME_PATTERN, apiPath, defineGhFamily, field, fieldSchema, kvField } from '../op-table.js';
import type { OpDef } from '../op-table.js';
import { installFakeGh } from './_fakegh.js';

afterEach(() => { _setApprovalGateForTests(undefined); _resetRegistryForTests(); });

const ok = (schema: unknown, v: unknown): boolean => validateAgainstSchema(schema as StructuredSchema, v).ok;

test('gh-field-pattern.test.ts: fieldSchema of a string spec with a pattern carries it, and one without builds today\'s schema', () => {
	const withPattern = fieldSchema({ kind: 'string', pattern: '^a+$', description: 'd' }) as unknown as Record<string, unknown>;
	assert.equal(withPattern['pattern'], '^a+$');
	assert.equal(withPattern['minLength'], 1);
	assert.equal(withPattern['description'], 'd');
	const plain = fieldSchema({ kind: 'string', description: 'd' }) as unknown as Record<string, unknown>;
	assert.equal('pattern' in plain, false);
	assert.deepEqual({ type: plain['type'], minLength: plain['minLength'], description: plain['description'] }, { type: 'string', minLength: 1, description: 'd' });
	// an expression field ignores a pattern: it has its own rule
	assert.equal('pattern' in (fieldSchema({ kind: 'expr', pattern: '^x$' }) as unknown as Record<string, unknown>), false);
});

test('gh-field-pattern.test.ts: field.name accepts octo-org, my.repo_1 and a.b, and rejects empty, dots, slashes, query characters, whitespace and non-ASCII', () => {
	const schema = fieldSchema(field.name('an owner'));
	assert.equal((schema as unknown as Record<string, unknown>)['pattern'], NAME_PATTERN);
	for (const good of ['octo-org', 'my.repo_1', 'a.b', 'A1', '...a', 'a..b', '_x']) assert.equal(ok(schema, good), true, good);
	for (const bad of ['', '.', '..', 'a/b', 'x?y', 'a#b', 'a%2Fb', 'a b', 'a\tb', 'caf\u00e9', '\u65e5\u672c', 'a:b', 'a@b', 'a\nb']) assert.equal(ok(schema, bad), false, JSON.stringify(bad));
});

const op = (name: string, fields: OpDef['fields']): OpDef => ({
	name, command: ['api'], cls: 'none', limitS: 30, fields, args: [],
	out: { kind: 'custom', shape: { ok: Type.Boolean() }, build: async () => ({ ok: true }) },
});

test('gh-field-pattern.test.ts: two ops that declare a shared field with different patterns make defineGhFamily throw, identical patterns and differing descriptions do not', () => {
	const build = (a: OpDef['fields'], b: OpDef['fields']) => defineGhFamily({ id: 'gh_t8_clash', description: 'x', ops: [op('one', a), op('two', b)] });
	assert.throws(() => build({ owner: { kind: 'string', pattern: '^a$' } }, { owner: { kind: 'string', pattern: '^b$' } }), /field owner is declared differently by two ops/);
	assert.throws(() => build({ owner: { kind: 'string', pattern: '^a$' } }, { owner: { kind: 'string' } }), /declared differently/);
	assert.doesNotThrow(() => build({ owner: field.name('one way') }, { owner: field.name('another way') }));
});

function family() {
	return defineGhFamily({
		id: 'gh_t8_fam', description: 'a family with name fields',
		ops: [{
			name: 'create', command: ['api'], cls: 'common', limitS: 30,
			fields: { owner: field.name(), repo: field.name(), title: field.str() },
			required: ['owner', 'repo', 'title'],
			args: [apiPath('repos/', { field: 'owner' }, '/', { field: 'repo' }, '/issues'), kvField('-f', 'title', 'title')],
			out: { kind: 'custom', shape: { ok: Type.Boolean() }, build: async () => ({ ok: true }) },
		}],
	});
}

for (const [label, attached] of [['an approval subscriber attached', true], ['no subscriber attached', false]] as const) {
	test(`gh-field-pattern.test.ts: through executeTool a bad owner returns a rejected input failure, the approval gate is not called and no gh command runs, with ${label}`, async () => {
		_resetRegistryForTests();
		registerTool(family());
		const requests: ApprovalRequest[] = [];
		const gate: ApprovalGate = { async ask(r) { requests.push(r); return attached ? { requestId: r.requestId, decision: 'approve' } : 'no-client'; } };
		_setApprovalGateForTests(() => gate);
		const gh = installFakeGh('ok', '{}');
		const deps: ToolDeps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'manual' };
		try {
			for (const owner of ['a/b', '..', 'x?y', 'a#b', 'caf\u00e9', '']) {
				const r = await executeTool('gh_t8_fam', { op: 'create', owner, repo: 'r', title: 't' }, deps);
				assert.equal(r.success, false, owner);
				assert.equal(r.failure?.kind, 'rejected', `${owner}: rejected, not denied`);
			}
			assert.equal(requests.length, 0, 'no approval was asked');
			assert.deepEqual(gh.calls(), [], 'gh did not run');
			// a valid owner passes the schema and (manual mode, a common op) reaches the approval step
			await executeTool('gh_t8_fam', { op: 'create', owner: 'my.org', repo: 'r_1', title: 't' }, deps);
			assert.equal(requests.length, 1);
		} finally { gh.restore(); }
	});
}
