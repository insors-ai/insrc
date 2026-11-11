/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LIVE activity-mode review checks for ISSUE-738d62b848fd173f (Story
 * 3ec4189b758be646 s1 / t9): the cli-vibe activity branch and the ollama-claude
 * activity path against the real binaries. Each call costs real billed tokens.
 *
 * Needs: the `vibe-app-server` binary (real Mistral Vibe runtime) and, for the
 * ollama-claude case, the claude CLI plus Ollama signed in to ollama.com with
 * glm-5.3:cloud available.
 *
 * Gate behind INSRC_LIVE_TESTS=1.
 *
 * Run:
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-review-activity.live.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CliProvider } from '../cli-provider.js';
import { validateAgainstSchema } from '../structured-output.js';
import { openVerifiedVibeSession } from '../../../shared/vibe-session.js';
import { validateModelCatalog } from '../../../daemon/model-catalog.js';
import { buildModelRegistry } from '../../../daemon/model-registry.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const HOST = process.env['INSRC_OLLAMA_HOST'] ?? 'http://localhost:11434';

const SCHEMA = {
	type: 'object',
	required: ['verdict'],
	properties: { verdict: { type: 'string', enum: ['holds', 'does-not-hold'] } },
	additionalProperties: false,
} as const;

test('T10-vibe-session-readback-core-mid: a cli-vibe session with the versioned mistral-large-4 id at a mid effort opens and reads back the native session model/effort', { skip: !GATE, timeout: 120_000 }, async () => {
	const registry = buildModelRegistry(validateModelCatalog(), []);
	const rejected = new Set(registry.rejected('cli-vibe'));
	const catalog = registry.models('cli-vibe').filter(m => !rejected.has(m.id));
	assert.ok(catalog.some(m => m.id === 'mistral-large-4'), 'the catalog carries the versioned mistral-large-4 entry');
	const session = await openVerifiedVibeSession({
		command: 'vibe-app-server',
		cwd: process.cwd(),
		timeoutMs: 90_000,
		model: 'mistral-large-4',
		effort: 'medium',
		catalog,
		agentConfig: { cwd: process.cwd(), headless: true, enabledTools: ['read_file', 'mcp_insrc_*'] },
	});
	try {
		assert.equal(session.model, 'mistral-large-4', 'the runtime confirmed the versioned id, not an alias');
		assert.equal(session.effort, 'medium', 'the runtime confirmed the requested effort');
		assert.ok(session.id.length > 0, 'a native session id was verified');
	} finally {
		await session.transport.close();
	}
});

test('live-ollama-claude-activity-review-completes-planning: a mode:\'activity\' review on core-tier ollama-claude glm-5.3:cloud completes planning without NATIVE_CLI_FAILURE', { skip: !GATE, timeout: 300_000 }, async () => {
	const p = new CliProvider({ kind: 'claude', model: 'glm-5.3:cloud', effort: 'high', ollama: { host: HOST, hosting: 'cloud' }, timeoutMs: 240_000 });
	const diagnostics: string[] = [];
	const value = await p.runReviewSession<{ verdict: string }>(
		'Planning probe: in one line, is the insrc review pipeline coherent? Answer with the structured verdict.',
		SCHEMA,
		{
			mode: 'activity', cwd: process.cwd(), signal: new AbortController().signal,
			inactivityMs: 120_000, internalRetry: false,
			onActivity: () => {},
			onDiagnostic: s => { if (s.terminal !== undefined) diagnostics.push(`${s.terminal.reason}:${s.terminal.message ?? ''}`); },
			onCandidate: async () => ({ accepted: true as const }),
		},
	);
	assert.deepEqual(validateAgainstSchema(SCHEMA, value), { ok: true, value }, 'the accepted candidate validates against the review schema');
	assert.ok(!diagnostics.some(d => d.startsWith('NATIVE_CLI_FAILURE')), `no NATIVE_CLI_FAILURE diagnostic, got: ${diagnostics.join(' | ') || 'none'}`);
});
