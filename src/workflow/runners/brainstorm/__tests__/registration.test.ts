/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story S001 (brainstorm stage scaffold) — registration + contract tests.
 * Covers plan tasks t1 (standalone context), t2 (schemas placeholder),
 * t3 (registration scaffold + k10 import-guard), t4 (boot-wiring +
 * workflow-id recognition, no new handler phase).
 *
 * Run: npx tsx --test src/workflow/runners/brainstorm/__tests__/registration.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv } from 'ajv';

import { registerBrainstormRunners } from '../index.js';
import { brainstormElicitSchema } from '../schemas.js';
import { standaloneBrainstormContext, type StandaloneBrainstormContext } from '../standalone.js';
import { getRunner, hasRunner, registerRunner } from '../../../executor.js';
import { prepareDecompose } from '../../../orchestrator.js';
import { WORKFLOW_NAMES, type WorkflowIntent } from '../../../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');           // src/workflow/runners/brainstorm

// ---------------------------------------------------------------------------
// t1 — standalone context
// ---------------------------------------------------------------------------

test('t1: StandaloneBrainstormContext accepts a bare focus string', () => {
	const ctx: StandaloneBrainstormContext = standaloneBrainstormContext('add a dark mode toggle');
	assert.equal(ctx.focus, 'add a dark mode toggle');
	assert.deepEqual(Object.keys(ctx), ['focus']);   // exactly one field
});

// ---------------------------------------------------------------------------
// t2 — schemas placeholder is ajv-compilable
// ---------------------------------------------------------------------------

test('t2: brainstormElicitSchema is a valid, ajv-compilable JSON Schema stub', () => {
	const ajv = new Ajv({ allErrors: true });
	assert.doesNotThrow(() => ajv.compile(brainstormElicitSchema as object));
	assert.equal(brainstormElicitSchema.type, 'object');
});

// ---------------------------------------------------------------------------
// t3 — registration scaffold
// ---------------------------------------------------------------------------

test('t3: registerBrainstormRunners is idempotent and resolves the elicit runner', () => {
	registerBrainstormRunners();
	registerBrainstormRunners();   // second call must be a no-op (registered guard), no throw
	assert.ok(hasRunner('brainstorm', 'elicit'));
	const r = getRunner('brainstorm', 'elicit');
	assert.equal(r.workflow, 'brainstorm');
	assert.equal(r.id, 'elicit');
});

test('t3: a duplicate runnerId under workflow brainstorm reproduces executor\'s duplicate-runner throw', () => {
	registerBrainstormRunners();   // ensure 'elicit' is present
	assert.throws(
		() => registerRunner({ id: 'elicit', workflow: 'brainstorm', run: async () => ({ type: 'output', output: {} }) }),
		/registerRunner: duplicate runner 'brainstorm\/elicit'/,
	);
});

test('t3: k10 — the brainstorm runner module never IMPORTS the daemon layer or CALLS the addIdea stub', () => {
	// An import-guard checks real imports/calls, not doc-comment mentions of the
	// guard itself. Strip comments, then assert no daemon import + no stub call.
	for (const f of ['index.ts', 'standalone.ts', 'schemas.ts']) {
		const raw = readFileSync(join(SRC, f), 'utf8');
		const code = raw
			.replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
			.replace(/\/\/.*$/gm, '');           // line comments
		assert.doesNotMatch(code, /\bfrom\s+['"][^'"]*daemon[^'"]*['"]/, `${f} must not import the daemon layer (k10)`);
		assert.doesNotMatch(code, /\baddIdea\b/,                          `${f} must not call the brainstorm.addIdea stub (k10)`);
		assert.doesNotMatch(code, /\bofflineRpc\b/,                       `${f} must not touch the offlineRpc surface (k10)`);
	}
});

// ---------------------------------------------------------------------------
// t4 — boot-wiring + workflow-id recognition, no new handler phase
// ---------------------------------------------------------------------------

test('t4: brainstorm is a member of the WORKFLOW_NAMES union', () => {
	assert.ok((WORKFLOW_NAMES as readonly string[]).includes('brainstorm'));
});

test('t4: prepareDecompose recognizes brainstorm (not "not yet supported") and yields a one-step plan schema', () => {
	const intent: WorkflowIntent = {
		workflow: 'brainstorm',
		focus:    'a rough idea',
		repoPath: '/tmp/x',
		repoIndexedAt: null,
		params:   {},
	};
	const prepared = prepareDecompose(intent);
	const schema = prepared.schema as { properties: { workflow: { const: string }; steps: { maxItems: number } } };
	assert.equal(schema.properties.workflow.const, 'brainstorm');
	assert.equal(schema.properties.steps.maxItems, 1);   // scaffold: single elicit step
});

test('t4: registerWorkflowRunners() wires registerBrainstormRunners beside the existing register*Runners', () => {
	const src = readFileSync(join(SRC, '..', '..', 'index.ts'), 'utf8');   // src/workflow/index.ts
	assert.match(src, /registerBrainstormRunners\(\);/);
	assert.match(src, /import \{ registerBrainstormRunners \}/);
});

test('t4: the workflow-step handler phase switch gains NO brainstorm case (new workflow value, not a new phase)', () => {
	const handler = readFileSync(join(SRC, '..', '..', '..', 'mcp', 'workflow-step', 'handler.ts'), 'utf8');
	assert.doesNotMatch(handler, /case 'brainstorm'/);   // recognized via the workflow-id union, not a phase case
});

test('t4: the triage route table (classify.ts) is not modified to insert brainstorm (ac5)', () => {
	const classify = readFileSync(join(SRC, '..', '..', 'triage', 'classify.ts'), 'utf8');
	assert.doesNotMatch(classify, /brainstorm/);   // small/trivial routing unchanged; no forced elicitation
});
