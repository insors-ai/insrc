/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s2/t6: readOnlySessionOnce's vibe branch -- real
 * dispatch through startTurn(mode:'read-only') instead of the s1 placeholder's unconditional
 * 'unreachable' throw. Driven against a scripted fake `vibe` binary, matching the real
 * installed binary's own output shapes (same fixture convention as s1/t5's
 * cli-provider-vibe-adapter.test.ts).
 *
 * Run: npx tsx --test src/agent/providers/__tests__/cli-provider-readonly-vibe.test.ts
 */

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';
import { UnqualifiedCapabilityPolicyError } from '../../../shared/types.js';
import { _buildArgvForTests, _readOnlyQualificationCacheForTests, stableDescriptorHash, VibeReadOnlyUnavailableError } from '../../../shared/vibe-adapter.js';
import type { ReadOnlyCapability, VibeTurnRequest } from '../../../shared/vibe-adapter.js';

/** A fake `vibe`: records every invocation (argv, stdin) as a JSON line in
 *  <dir>/calls.jsonl, writes export.json to --output-dir, then prints a JSON
 *  journal-entry array with one assistant message whose text is <dir>/answer. */
const FAKE = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
let stdin = '';
for await (const c of process.stdin) stdin += c;
const args = process.argv.slice(2);
appendFileSync(join(here, 'calls.jsonl'), JSON.stringify({ args, stdin }) + '\\n');
const outputDirIdx = args.indexOf('--output-dir');
const outputDir = outputDirIdx >= 0 ? args[outputDirIdx + 1] : undefined;
const enabledTools = [];
for (let i = 0; i < args.length; i++) if (args[i] === '--enabled-tools') enabledTools.push(args[i + 1]);
if (outputDir !== undefined) {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'export.json'), JSON.stringify({ vibe_version: '3.1.4', outcome: 'finished', stop_reason: null, config: { enabled_tools: enabledTools, active_model: 'm' } }));
}
const answer = readFileSync(join(here, 'answer'), 'utf8');
process.stdout.write(JSON.stringify([{ sessionId: 'fixture-session', type: 'message', role: 'assistant', content: [{ type: 'text', text: answer }] }]));
process.exit(0);
`;

function makeFakeVibe(answer: string): { readonly dir: string; readonly bin: string; readonly calls: () => Array<{ args: readonly string[]; stdin: string }> } {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-fake-vibe-readonly-'));
	const bin = join(dir, 'vibe');
	writeFileSync(bin, FAKE);
	chmodSync(bin, 0o755);
	writeFileSync(join(dir, 'answer'), answer);
	writeFileSync(join(dir, 'calls.jsonl'), '');
	return {
		dir, bin,
		calls: () => readFileSync(join(dir, 'calls.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as { args: readonly string[]; stdin: string }),
	};
}

function readOnlyProbeRequest(): VibeTurnRequest {
	return { prompt: 'x', outputMode: 'streaming', session: { kind: 'new' }, mode: 'read-only' };
}

function descriptorFor(cwd: string, command: string): string {
	const argv = _buildArgvForTests(readOnlyProbeRequest(), '/tmp/unused-output-dir');
	return stableDescriptorHash({ cwd, processGroup: 'adapter-owned' }, command, argv);
}

function qualify(dir: string, command: string): void {
	const key = descriptorFor(dir, command);
	const cap: ReadOnlyCapability = { status: 'qualified', allowedTools: ['insrc_analyze', 'insrc_analyze_step'], provenAgainst: { stableDescriptorHash: key, effectiveConfigFingerprint: 'ignored-for-this-test' } };
	_readOnlyQualificationCacheForTests().set(key, cap);
}

const SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } };

test("readOnlySessionOnce's vibe branch returning the schema-validated answer on a qualified capability", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const f = makeFakeVibe('{"ok":true}');
	try {
		qualify(f.dir, f.bin);
		const provider = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		const result = await provider.runReadOnlySession<{ ok: boolean }>('analyze this', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 });
		assert.deepEqual(result, { ok: true });
		assert.equal(f.calls().length, 1);
	} finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("the recorded argv matching buildArgv's own values exactly except outputDir", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const f = makeFakeVibe('{"ok":true}');
	try {
		qualify(f.dir, f.bin);
		const provider = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await provider.runReadOnlySession<{ ok: boolean }>('analyze this', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 });
		const [call] = f.calls();
		assert.ok(call !== undefined);
		assert.ok(!call.args.includes('--auto-approve'));
		assert.ok(!call.args.includes('--approval-policy'));
		const enabledToolsPairs: string[] = [];
		for (let i = 0; i < call.args.length; i++) if (call.args[i] === '--enabled-tools') enabledToolsPairs.push(call.args[i + 1] as string);
		assert.deepEqual(enabledToolsPairs, ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step']);
	} finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const f = makeFakeVibe('{"ok":true}');
	try {
		const key = descriptorFor(f.dir, f.bin);
		_readOnlyQualificationCacheForTests().set(key, { status: 'unavailable', allowedTools: [], reason: "allow-side probe: insrc_analyze and/or insrc_analyze_step did not show a confirmed completed call (attempt 3/3)", provenAgainst: undefined });
		const provider = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await assert.rejects(
			provider.runReadOnlySession<{ ok: boolean }>('analyze this', SCHEMA, { cwd: f.dir, deadlineMs: 20_000 }),
			(e: unknown) => e instanceof VibeReadOnlyUnavailableError && e.message.includes('did not show a confirmed completed call'),
		);
		assert.equal(f.calls().length, 0, 'an unavailable capability never spawns a process');
	} finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test('the capabilityPolicy precondition refused before readOnlySessionOnce is reached', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const f = makeFakeVibe('{"ok":true}');
	try {
		qualify(f.dir, f.bin);
		const provider = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 10_000 });
		await assert.rejects(
			provider.runReadOnlySession('analyze this', SCHEMA, { cwd: f.dir, deadlineMs: 20_000, capabilityPolicy: 'strict-read-analyze' }),
			(e: unknown) => e instanceof UnqualifiedCapabilityPolicyError && /vibe/.test(e.message) && /strict-read-analyze/.test(e.message),
		);
		assert.equal(f.calls().length, 0, 'vibe is not qualified for strict-read-analyze (capability-qualification.ts); readOnlySessionOnce is never reached');
	} finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("a cold cache that spends this call's own deadline on qualification leaves the real turn no fresh budget of its own (review r2 finding 3)", async () => {
	// No qualify() seeding here -- a genuinely cold cache. With a deadline this tight,
	// qualifyReadOnlyCapability's own caller-side race (review r2 finding 1) resolves
	// 'unavailable' at (or before) the deadline; readOnlySessionOnce must then see its
	// own overall budget already exhausted and refuse, rather than handing the turn a
	// FRESH full timeoutMs on top of what qualification already spent.
	_readOnlyQualificationCacheForTests().clear();
	const f = makeFakeVibe('{"ok":true}');
	try {
		const provider = new CliProvider({ kind: 'vibe', binPath: f.bin, timeoutMs: 50 });
		await assert.rejects(
			provider.runReadOnlySession<{ ok: boolean }>('analyze this', SCHEMA, { cwd: f.dir, deadlineMs: 50 }),
			(e: unknown) => e instanceof Error && e.name === 'ReadOnlySessionTimeoutError',
		);
	} finally { rmSync(f.dir, { recursive: true, force: true }); }
});
