/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live: codex accepts the analyzer's complete plan schemas (ISSUE-8d39ef09,
 * LLD-9874475f902756f6-S001 t7): DECOMPOSE_SCHEMA with all its exploration
 * types, and the planner wire schema of every built-in target's catalog.
 * Before the fix codex refused each with "'...params.properties' is required
 * for object schemas" (evidence/open-object-probe.md beside the ISSUE).
 *
 * Gated: INSRC_LIVE_TESTS=1 and a `codex` binary on PATH. One call at a time.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { CliProvider } from '../../agent/providers/cli-provider.js';
import { validateCodexReply } from '../../agent/providers/structured-output.js';
import type { StructuredSchema } from '../../shared/types.js';
import { DECOMPOSE_SCHEMA } from '../context/decomposer.js';
import { registerBuiltinTemplates } from '../planner/templates/bootstrap.js';
import { getTemplatesForTarget } from '../planner/templates/registry.js';
import { plannerWireSchema } from '../planner/wire-schema.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1' && spawnSync('which', ['codex']).status === 0;
const TARGETS = ['code', 'docs', 'data', 'infra', 'generic'] as const;

registerBuiltinTemplates();

test('codex accepts the complete DECOMPOSE_SCHEMA and every built-in planner wire schema, and the replies pass the reply check', { skip: !GATE, timeout: 30 * 60_000 }, async () => {
	const provider = new CliProvider({ kind: 'codex', model: 'gpt-6.1-sol', effort: 'low' });
	const cases: [string, StructuredSchema, string][] = [
		['DECOMPOSE_SCHEMA', DECOMPOSE_SCHEMA,
			'Plan two explorations for "how does runReview work" in /repo/src: e1 a symbol.locate for names ["runReview"], e2 a search.text for pattern "runReview" depending on e1. ' +
			'answerType "how-does-it-work", synthesisHint "trace the call". Leave unneeded optional params null. Do not use tools.'],
		...TARGETS.map(target => [`planner wire schema (${target})`, plannerWireSchema(getTemplatesForTarget(target)).schema,
			`Emit a plan for target "${target === 'docs' ? 'generic' : target}", scope "S", planId "p", goal "survey". Use exactly one task: taskId "t01", template "${target}.aggregate.report", kind "leaf", ` +
			'produces ["report"], params the JSON text "{}", rationale of at least 20 characters. reasoning at least 50 characters. Do not use tools.'] as [string, StructuredSchema, string]),
	];
	const refused: string[] = [];
	for (const [name, schema, ask] of cases) {
		try {
			const reply = await provider.completeStructured([{ role: 'user', content: ask }], schema, { internalRetry: false, timeoutMs: 300_000 });
			const check = validateCodexReply(schema, reply);
			if (!check.ok) refused.push(`${name}: reply check failed: ${check.errors.join('; ')}`);
		} catch (err) {
			refused.push(`${name}: ${(err as Error).message.slice(0, 400)}`);
		}
	}
	assert.deepEqual(refused, [], 'every schema accepted and every reply passes the reply check');
});
