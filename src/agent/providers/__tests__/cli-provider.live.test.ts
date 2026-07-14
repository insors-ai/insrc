/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Live integration test for the `CliProvider` wrapper.
 *
 * Confirms the wrapper preserves the CLI binaries' structured-output
 * contract end-to-end:
 *
 *   - claude path: serialise messages -> spawn claude --print -> parse
 *     envelope -> return envelope.structured_output as the typed payload.
 *   - codex path: serialise messages -> write schema file -> spawn
 *     codex exec -> parse JSONL stream -> JSON.parse the agent_message.text
 *     -> return as the typed payload.
 *
 * The binary contract itself is pinned by `local-agents-structured.live.test.ts`
 * (raw-spawn tests against the unwrapped binaries). This file tests only
 * what the wrapper adds on top.
 *
 * Skips when the relevant binary is missing.
 * Gate behind INSRC_LIVE_TESTS=1 -- each call costs real billed tokens.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test \
 *     src/insrc/agent/providers/__tests__/cli-provider.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

import { CliProvider } from '../cli-provider.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';

function which(bin: string): Promise<boolean> {
	return new Promise(resolve => {
		const child = spawn('which', [bin], { stdio: ['ignore', 'pipe', 'ignore'] });
		child.on('close', code => resolve(code === 0));
		child.on('error', () => resolve(false));
	});
}

const claudeAvailable = await which('claude');
const codexAvailable = await which('codex');


// ---------------------------------------------------------------------------
// Schema fixture: closed object with bounded string array.
// Matches the smallest end-to-end pattern; the broader binary contract is
// pinned by local-agents-structured.live.test.ts.
// ---------------------------------------------------------------------------

const BULLETS_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['bullets'],
	properties: {
		bullets: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 200 } },
	},
};


test('CliProvider claude path: completeStructured returns typed payload', { skip: !GATE || !claudeAvailable }, async () => {
	const provider = new CliProvider({ kind: 'claude', model: 'haiku' });
	const result = await provider.completeStructured<{ bullets: string[] }>(
		[{ role: 'user', content: 'List two short bullets about TypeScript. Keep each under 80 chars.' }],
		BULLETS_SCHEMA,
	);
	assert.ok(result !== null && typeof result === 'object', 'result is an object');
	assert.ok(Array.isArray(result.bullets), 'bullets is an array');
	assert.ok(result.bullets.length >= 1 && result.bullets.length <= 5, `bullets length in [1,5]; got ${result.bullets.length}`);
	for (const b of result.bullets) {
		assert.equal(typeof b, 'string', 'every bullet is a string');
		assert.ok(b.length > 0, 'every bullet is non-empty');
	}
});


test('CliProvider claude path: capabilities reflect contract', () => {
	const provider = new CliProvider({ kind: 'claude' });
	assert.equal(provider.capabilities.structuredOutput, true);
	assert.equal(provider.capabilities.toolCalling, false);
	assert.equal(provider.capabilities.streaming, false);
	assert.equal(provider.capabilities.embeddings, false, 'embeddings off when no delegate');
	assert.equal(provider.capabilities.vision, false);
	assert.equal(provider.capabilities.webSearch, false);
});


test('CliProvider embed throws cleanly when no delegate wired', async () => {
	const provider = new CliProvider({ kind: 'claude' });
	await assert.rejects(
		() => provider.embed('anything'),
		/embed\(\) requires an embedDelegate/,
	);
});


test('CliProvider codex path: completeStructured returns typed payload', { skip: !GATE || !codexAvailable }, async () => {
	// Codex enforces OpenAI strict mode: additionalProperties:false on every
	// object + all `required` arrays populated. Our fixture already complies.
	const provider = new CliProvider({ kind: 'codex' });
	const result = await provider.completeStructured<{ bullets: string[] }>(
		[{ role: 'user', content: 'List two short bullets about TypeScript. Keep each under 80 chars.' }],
		BULLETS_SCHEMA,
	);
	assert.ok(result !== null && typeof result === 'object');
	assert.ok(Array.isArray(result.bullets));
	assert.ok(result.bullets.length >= 1 && result.bullets.length <= 5);
});


test('INSRC_LIVE_TESTS gate respected', { skip: GATE }, () => {
	assert.ok(true, 'gate off; billed tests skipped');
});
