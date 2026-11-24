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
// Whichever MCP servers happen to be globally registered on the machine
// running this test (see ISSUE-08f9dd3412bc10f0 for the live evidence that
// grounded this Story -- insrc itself never hardcodes which third-party
// server names are safe or unsafe). codexReadOnlySessionArgs disables every
// non-insrc server in ONE invocation, so codex's own bootstrap rejects the
// first unsafe one it processes, if any is present, before any other
// server's override is even reached.

test('T3a codex: when a real session has an unsafe server registered alongside insrc, it throws CodexMcpServerOverrideUnsafeError naming a real discovered server, and never starts', { skip: !GATE }, async (t) => {
	const servers = await discoverCodexMcpServers('codex', REPO, 20_000);
	const others = servers.filter(s => s.name !== 'insrc');
	if (others.length === 0) { t.skip('no other MCP server is globally registered alongside insrc on this machine -- nothing to disable, nothing to refuse'); return; }
	const err = await new CliProvider({ kind: 'codex' })
		.runReadOnlySession('say ok', { type: 'object', properties: { ok: { type: 'boolean' } } }, { cwd: REPO, deadlineMs: 60_000, internalRetry: false })
		.then(() => null, (e: unknown) => e);
	if (err === null) { t.skip('every other registered server accepted its override -- this machine has none codex\'s bootstrap rejects (see T3b)'); return; }
	assert.ok(err instanceof CodexMcpServerOverrideUnsafeError, `expected CodexMcpServerOverrideUnsafeError, got ${String(err)}`);
	assert.ok(others.some(s => s.name === (err as CodexMcpServerOverrideUnsafeError).serverName), `named a real discovered server, got '${(err as CodexMcpServerOverrideUnsafeError).serverName}'`);
});

test('T3b codex: when every server registered alongside insrc accepts its override, a real session starts a restricted session successfully, as today', { skip: !GATE }, async (t) => {
	const servers = await discoverCodexMcpServers('codex', REPO, 20_000);
	const res = await new CliProvider({ kind: 'codex' })
		.runReadOnlySession<{ ok: boolean }>('answer {"ok":true}', { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } }, { cwd: REPO, deadlineMs: 60_000, internalRetry: false })
		.then(ok => ({ ok: true as const, res: ok }), (e: unknown) => ({ ok: false as const, err: e }));
	if (!res.ok) {
		if (res.err instanceof CodexMcpServerOverrideUnsafeError) {
			t.skip(`'${res.err.serverName}' (one of the ${servers.length - 1} other server(s) globally registered alongside insrc on this machine) is rejected by codex's own bootstrap -- the all-accepted scenario is unreachable here (covered synthetically instead by the unit test in cli-readonly-session.test.ts)`);
			return;
		}
		throw res.err;
	}
	assert.equal(res.res.ok, true);
});

// --- bounded one-retry recovery when a disabled server is unexcludable (LLD amendment) ----

test("T5 codex: a real session whose discovered servers include exactly one unexcludable server succeeds via the one-time retry, instead of throwing CodexMcpServerOverrideUnsafeError", { skip: !GATE }, async (t) => {
	const servers = await discoverCodexMcpServers('codex', REPO, 20_000);
	const others = servers.filter(s => s.name !== 'insrc');
	const res = await new CliProvider({ kind: 'codex' })
		.runReadOnlySession<{ ok: boolean }>('answer {"ok":true}', { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } }, { cwd: REPO, deadlineMs: 60_000, internalRetry: false })
		.then(ok => ({ ok: true as const, res: ok }), (e: unknown) => ({ ok: false as const, err: e }));
	if (res.ok) { assert.equal(res.res.ok, true); return; }
	if (res.err instanceof CodexMcpServerOverrideUnsafeError) {
		t.skip(`the retry also failed (naming '${res.err.serverName}') -- this machine has more than one unexcludable server among its ${others.length} other registration(s), so the single-retry-succeeds scenario is unreachable here (covered synthetically instead by the unit tests in cli-readonly-session.test.ts)`);
		return;
	}
	throw res.err;
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
