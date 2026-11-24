/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * LIVE check of the read-only read-only session against the real `claude`,
 * `codex` and `vibe` binaries (LLD-f2f08ccf89f8ab25-S001, test T14): the
 * session can read a file, can call insrc analyze, cannot write a file, and
 * returns an answer matching the schema.
 *
 * Gate behind INSRC_LIVE_TESTS=1 -- each call costs real billed tokens, and the
 * insrc MCP server must be registered with the CLI under test.
 *
 *   INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-review-session.live.test.ts
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider, CodexMcpServerOverrideUnsafeError, discoverCodexMcpServers } from '../cli-provider.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const REPO = process.cwd();

const SCHEMA = {
	type: 'object', additionalProperties: false,
	required: ['readOk', 'line', 'analyzeCalled', 'writeRefused', 'note'],
	properties: {
		readOk: { type: 'boolean' }, line: { type: 'string' }, analyzeCalled: { type: 'boolean' },
		writeRefused: { type: 'boolean' }, note: { type: 'string' },
	},
};

interface Probe { readOk: boolean; line: string; analyzeCalled: boolean; writeRefused: boolean; note: string }

// --- per-server override safety (Story 08f9dd3412bc10f0 S001, plan task t3) -----
//
// This machine has codex_app, cua_repl, insrc and node_repl ALL globally
// registered at once (confirmed via `codex mcp list --json`, 2026-11-24).
// codexReadOnlySessionArgs disables every non-insrc server in ONE invocation,
// so codex's own bootstrap rejects the first unsafe one it processes before a
// node_repl-only success scenario could ever be exercised here -- that
// acceptance criterion is environmentally unreachable on this machine, not a
// gap in the implementation (it is covered synthetically by the unit tests in
// cli-readonly-session.test.ts, which control the discovered servers list).

test('T3a codex: a real session whose discovered servers include codex_app or cua_repl throws CodexMcpServerOverrideUnsafeError naming one of them, and never starts', { skip: !GATE }, async () => {
	const p = new CliProvider({ kind: 'codex' });
	const servers = await discoverCodexMcpServers('codex', REPO, 20_000);
	const unsafe = servers.find(s => s.name === 'codex_app' || s.name === 'cua_repl');
	assert.ok(unsafe !== undefined, 'this machine has codex_app or cua_repl globally registered (precondition for this test)');
	const err = await p.runReadOnlySession('say ok', { type: 'object', properties: { ok: { type: 'boolean' } } }, { cwd: REPO, deadlineMs: 60_000, internalRetry: false })
		.then(() => null, (e: unknown) => e);
	assert.ok(err instanceof CodexMcpServerOverrideUnsafeError, `expected CodexMcpServerOverrideUnsafeError, got ${String(err)}`);
	assert.ok(err.serverName === 'codex_app' || err.serverName === 'cua_repl', `named one of the unsafe servers, got '${err.serverName}'`);
});

test('T3b codex: a real session whose discovered servers include ONLY node_repl (besides insrc) starts a restricted session successfully, as today', { skip: !GATE }, async (t) => {
	const servers = await discoverCodexMcpServers('codex', REPO, 20_000);
	const unsafe = servers.filter(s => s.name === 'codex_app' || s.name === 'cua_repl');
	if (unsafe.length > 0) {
		t.skip(`this machine also has ${unsafe.map(s => s.name).join(', ')} globally registered alongside node_repl -- codexReadOnlySessionArgs disables every non-insrc server in one invocation, so the node_repl-only scenario is unreachable here (covered synthetically instead by the unit test in cli-readonly-session.test.ts)`);
		return;
	}
	const p = new CliProvider({ kind: 'codex' });
	const res = await p.runReadOnlySession<{ ok: boolean }>('answer {"ok":true}', { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } }, { cwd: REPO, deadlineMs: 60_000 });
	assert.equal(res.ok, true);
});

for (const kind of ['claude', 'codex', 'vibe'] as const) {
	test(`T14 a ${kind} read-only session reads, calls insrc analyze, cannot write, and answers to the schema`, { skip: !GATE }, async () => {
		const scratch = mkdtempSync(join(tmpdir(), 'insrc-review-live-'));
		const target = join(scratch, 'SHOULD_NOT_EXIST.txt');
		try {
			const prompt = [
				'This is a capability probe. Do these three things with your tools, then answer with the JSON.',
				'1. Read the file package.json and put its line 2 verbatim in `line` (`readOk` true if you could read it).',
				'2. Call the insrc analyze tool once (insrc_analyze_step with phase "start" and focus "where is runReview defined").',
				'   Set `analyzeCalled` true only if the call returned a result.',
				`3. Try to create the file ${target} with any tool you have. Set \`writeRefused\` true if no file was created.`,
				'Say briefly what happened in `note`.',
			].join('\n');
			const p = new CliProvider({ kind });
			const res = await p.runReadOnlySession<Probe>(prompt, SCHEMA, { cwd: REPO, deadlineMs: 180_000 });
			assert.equal(res.readOk, true, res.note);
			assert.ok(res.line.includes('"name"'), `line 2 of package.json, got: ${res.line}`);
			assert.equal(res.analyzeCalled, true, res.note);
			assert.equal(res.writeRefused, true, res.note);
			assert.equal(existsSync(target), false, 'the session could not create a file');
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});
}
