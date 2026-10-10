/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The classifier states no size, and nothing picks one with a model
 * (LLD-b9d5c5c40df5a574-s2, task t8). No model, no store.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTask, plan } from '../../../daemon/analyze-rpc.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import { hintedIntentBase } from '../../orchestrator/driver.js';
import { _buildInitialMessagesForTest } from '../driver.js';
import { CLASSIFIED_INTENT_SCHEMA, validateIntentShape, validateIntentShapeWithErrors } from '../schema.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel: string): string => readFileSync(join(SRC, rel), 'utf8');

/** A TypeScript source with its comments removed: what is scanned is code, not prose about code. */
function code(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Every non-test TypeScript file under src, relative to it. */
function sourceFiles(dir = SRC): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			if (name === '__tests__' || name === 'node_modules') continue;
			out.push(...sourceFiles(path));
		} else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
			out.push(relative(SRC, path));
		}
	}
	return out;
}

const SIZE = "(?:XS|S|M|L|XL)";

test("the classifier's output schema has no size property and rejects an answer that carries one, the user message built for the classifier names no size among its required fields, and no placeholder size is given to the validator; ClassifiedIntent still has the field", async () => {
	// --- The schema: no size, and an answer with one is rejected as any unknown field is. ---
	assert.ok(!('scope' in CLASSIFIED_INTENT_SCHEMA.properties));
	assert.deepEqual([...CLASSIFIED_INTENT_SCHEMA.required], ['target', 'focused', 'scopeRef', 'reasoning']);
	assert.equal(CLASSIFIED_INTENT_SCHEMA.additionalProperties, false);
	const answer = { target: 'code', focused: false, scopeRef: { kind: 'repo', value: '/abs/repo' }, reasoning: 'a repository of code' };
	assert.equal(validateIntentShape(answer), true);
	for (const size of ['XS', 'S', 'M', 'L', 'XL']) {
		const rejected = validateIntentShapeWithErrors({ ...answer, scope: size });
		assert.equal(rejected.ok, false, `an answer that states ${size} is rejected`);
		assert.ok(rejected.errors.some(e => /additional propert/i.test(e)), rejected.errors.join('; '));
	}

	// --- The message sent to the classifier model: its required fields are listed without a size. ---
	const messages = _buildInitialMessagesForTest('SYSTEM PROMPT', '# workspace', { userPrompt: 'how are refunds paid', scopeRef: { kind: 'repo', value: '/abs/repo' } });
	const user = String(messages[messages.length - 1]!.content);
	const required = /Required fields: ([^.]*)\./.exec(user)?.[1] ?? '';
	assert.equal(required.replace(/\s+/g, ' '), 'target, focused, scopeRef ({kind, value}), reasoning');
	assert.ok(!/\bscope\b(?!Ref)/.test(required), required);
	// The prompt file: no `scope` key among its fields, and none among its required keys.
	const prompt = read('prompts/analyze/classify.system.md');
	assert.ok(!/`scope`/.test(prompt), 'the classifier prompt names no `scope` field');
	assert.ok(!new RegExp(`\\b${SIZE} \\| ${SIZE}\\b`).test(prompt), 'and lists no sizes');
	assert.ok(prompt.includes('`scopeRef`'), 'it still names the scope reference');

	// --- No placeholder size is given to the validator. ---
	// For a request with a stated kind of source the driver builds the intent and validates it itself. The checks
	// still run (a pairing the table refuses is refused), and the call carries no size.
	const refused = await hintedIntentBase('code', 'q', { kind: 'connection', value: 'ledger' }, async () => true);
	assert.ok(!refused.ok && refused.failure.code === 'scope-ref-kind-target-mismatch');
	const driver = code(read('analyze/orchestrator/driver.ts'));
	const call = /validateIntentSemantics\(([^;]*)\);/.exec(driver)?.[1] ?? '';
	assert.ok(call.length > 0, 'the driver calls the validator');
	assert.ok(!/\bscope\s*:/.test(call), `no size is given to the validator: ${call}`);
	assert.ok(!new RegExp(`scope:\\s*'${SIZE}'`).test(driver), 'the driver holds no literal size');

	// --- ClassifiedIntent keeps its field: a request that carries a whole intent must still state it. ---
	const sized: ClassifiedIntent = { ...answer, target: 'code', scopeRef: { kind: 'repo', value: '/abs/repo' }, scope: 'M' };
	assert.equal(sized.scope, 'M');
	const unsizedPlanRequest = await plan({ runId: 'no-size', intent: answer });
	assert.ok(!unsizedPlanRequest.ok);
	if (unsizedPlanRequest.ok) return;
	assert.equal(unsizedPlanRequest.error.code, 'invalid-params');
	assert.match(unsizedPlanRequest.error.message, /scope/);
	// So must a task-level request.
	const unsizedTaskRequest = await buildTask({ runId: 'no-size', intent: answer });
	assert.ok(!unsizedTaskRequest.ok && unsizedTaskRequest.error.code === 'invalid-params');
	assert.match(unsizedTaskRequest.ok ? '' : unsizedTaskRequest.error.message, /intent\.scope|scope: /);
});

test('a source scan finds no call that picks a size with a model and no literal default size at the four places that set M today (mutation: restore one default)', () => {
	// --- Nothing names the size picker: its function, its module, its prompt, its error classes, its role. ---
	const offenders: string[] = [];
	for (const rel of sourceFiles()) {
		const text = read(rel);
		for (const name of ['pickScope', 'PickScope', 'ScopePicker', 'scope-picker.js', 'scope-picker.system.md', 'SCOPE_PICKER']) {
			if (text.includes(name)) offenders.push(`${rel}: ${name}`);
		}
		// The role id is named in one place only: the list of retired role ids.
		if (text.includes('analyze.scope.pick') && rel !== 'config/config-catalog.ts') offenders.push(`${rel}: analyze.scope.pick`);
	}
	assert.deepEqual(offenders, []);
	assert.equal(existsSync(join(SRC, 'analyze/classifier/scope-picker.ts')), false);
	assert.equal(existsSync(join(SRC, 'prompts/analyze/scope-picker.system.md')), false);
	assert.ok(read('config/config-catalog.ts').includes("'analyze.scope.pick'"), 'the catalog retires the role id');

	// --- The four places that set M before: no literal size is assigned or defaulted there. ---
	const places = ['mcp/server.ts', 'mcp/analyze-step/phases/start.ts', 'daemon/workflow-rpc.ts', 'analyze/explore/freeform-probe.ts'];
	const assigned = new RegExp(`\\bscope\\s*[:=]\\s*'${SIZE}'`);
	const defaulted = new RegExp(`\\?\\?\\s*'${SIZE}'`);
	for (const rel of places) {
		assert.ok(existsSync(join(SRC, rel)), `${rel} exists`);
		const text = code(read(rel));
		assert.ok(!assigned.test(text), `${rel} assigns no literal size (${assigned.exec(text)?.[0]})`);
		assert.ok(!defaulted.test(text), `${rel} defaults to no literal size (${defaulted.exec(text)?.[0]})`);
	}
	// The scan sees what it looks for: the same patterns match the code these places had.
	assert.ok(assigned.test("\t\tscope:     'M',") && assigned.test("scope = 'XL'"));
	assert.ok(defaulted.test("const scope  = input.scope  ?? 'M';") && defaulted.test("args.scope ?? 'M'"));
	// And each place still handles the size in some way, so the scan is not passing on an emptied file.
	assert.ok(code(read('mcp/server.ts')).includes('sizeHint'));
	assert.ok(code(read('mcp/analyze-step/phases/start.ts')).includes('measureResolvedScope'));
	assert.ok(code(read('daemon/workflow-rpc.ts')).includes('UnsizedIntent'));
	assert.ok(code(read('analyze/explore/freeform-probe.ts')).includes('measureOwnRequest'));
});
