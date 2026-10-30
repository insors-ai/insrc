/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live: the claude CLI on an Ollama cloud model (Epic b220bb61, Story s2 · t5).
 * Needs the claude CLI, Ollama running at models.local.host's default
 * (http://localhost:11434), signed in to ollama.com, with glm-5.3:cloud pulled.
 *
 * Gate behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-ollama.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CliProvider } from '../cli-provider.js';
import { OllamaTargetError } from '../ollama-target.js';
import { validateAgainstSchema } from '../structured-output.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const HOST = process.env['INSRC_OLLAMA_HOST'] ?? 'http://localhost:11434';

const schema = {
	type: 'object',
	required: ['capital', 'population_millions'],
	properties: {
		capital: { type: 'string' },
		population_millions: { type: 'number' },
	},
	additionalProperties: false,
};

test("cli-ollama.live.test.ts: completeStructured on glm-5.3:cloud returns a schema-valid answer, and a missing model fails with 'model-unavailable'", { skip: !GATE, timeout: 300_000 }, async () => {
	const p = new CliProvider({ kind: 'claude', model: 'glm-5.3:cloud', ollama: { host: HOST, hosting: 'cloud' }, timeoutMs: 240_000 });
	const answer = await p.completeStructured<{ capital: string; population_millions: number }>(
		[{ role: 'user', content: 'What is the capital of France and its population in millions? Answer with the structured result.' }],
		schema,
	);
	assert.deepEqual(validateAgainstSchema(schema, answer), { ok: true, value: answer });
	assert.match(answer.capital, /paris/i);

	const missing = new CliProvider({ kind: 'claude', model: 'no-such-model-x9:cloud', ollama: { host: HOST, hosting: 'cloud' }, timeoutMs: 60_000 });
	await assert.rejects(
		missing.completeStructured([{ role: 'user', content: 'hello' }], schema),
		(e: unknown) => e instanceof OllamaTargetError && e.cause === 'model-unavailable',
	);
});
