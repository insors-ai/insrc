/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s2/t3: the live read-only qualification suite --
 * bounded-retry allow-side probe, structural catalog evidence (reconciled polarity),
 * export.json fingerprint extraction, and in-flight coalescing.
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { _buildArgvForTests, _readOnlyQualificationCacheForTests, _setQualificationProbeTimeoutMsForTests, createVibeAdapter, qualifyReadOnlyCapability, stableDescriptorHash } from '../vibe-adapter.js';
import type { VibeAdapterContext, VibeAdapterDeps, VibeChildProcess } from '../vibe-adapter.js';

function fakeChild(pid: number | undefined = 4242): { child: VibeChildProcess; stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; emitter: EventEmitter } {
	const emitter = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const stdin = new PassThrough();
	emitter.on('exit', (code: number | null, signal: NodeJS.Signals | null) => { queueMicrotask(() => emitter.emit('close', code, signal)); });
	const child: VibeChildProcess = {
		pid, stdout, stderr, stdin,
		on(event, listener) { emitter.on(event, listener); },
		once(event, listener) { emitter.once(event, listener); },
		kill() { emitter.emit('exit', null, 'SIGKILL'); },
	};
	return { child, stdout, stderr, stdin, emitter };
}

function realDir(): string { return mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-qual-')); }

const TOOL_CALL_LINE = (toolCallId: string, toolName: string): string =>
	JSON.stringify({ type: 'effect', toolCallId, detail: { toolName, input: {} }, state: { status: 'completed', outputText: 'ok' } });

const DENIED_TOOL_CALL_LINE = (toolCallId: string, toolName: string): string =>
	JSON.stringify({ type: 'effect', toolCallId, detail: { toolName, input: {} }, state: { status: 'failed', outputText: 'denied: tool not enabled' } });

// A test-only stand-in for an operator's own live-confirmed denial wording (review r4
// finding 1 -- production supplies no default pattern at all; see structuralDenialWording).
const DENIAL_WORDING = /denied|not enabled/i;

// Satisfies both the allow-side proof (the two required tools) AND the structural denial
// proof (review r2 finding 2): `file_system.read_file`, outside the allowlist, denied.
function bothToolsCompletedJournal(): string {
	return [
		TOOL_CALL_LINE('c1', 'connector_insrc_insrc_analyze'),
		TOOL_CALL_LINE('c2', 'connector_insrc_insrc_analyze_step'),
		DENIED_TOOL_CALL_LINE('c3', 'file_system.read_file'),
	].join('\n') + '\n';
}

function exportJson(enabledTools: readonly string[], vibeVersion = '3.1.4'): string {
	return JSON.stringify({ vibe_version: vibeVersion, config: { enabled_tools: enabledTools, active_model: 'm' } });
}

function baseContext(cwd: string): VibeAdapterContext { return { cwd, processGroup: 'adapter-owned' }; }

/** One scripted probe run: emits `stdoutLines` on the child's stdout, exits 0, and the
 *  fake readFile returns `exportJsonText` for export.json. */
function scriptedDeps(command: string, stdoutLines: string, exportJsonText: string | undefined): VibeAdapterDeps {
	return {
		command,
		resolveCommandPath: (cmd) => cmd,
		identityStatSync: () => ({ size: 1, mtimeMs: 1 }),
		structuralDenialWordingForTests: DENIAL_WORDING,
		spawn: () => {
			const { child, stdout, emitter } = fakeChild();
			queueMicrotask(() => {
				if (stdoutLines !== '') stdout.write(stdoutLines);
				stdout.end();
				emitter.emit('exit', 0, null);
			});
			return child;
		},
		mkdtemp: async () => realDir(),
		readFile: async () => { if (exportJsonText === undefined) throw new Error('ENOENT'); return exportJsonText; },
		rm: async () => undefined,
	};
}

/** A scripted deps whose spawn behavior varies per call -- attempt N gets `attempts[N-1]`
 *  (clamped to the last entry once attempts run out). */
function multiAttemptDeps(command: string, attempts: readonly { readonly stdoutLines: string; readonly exportJsonText: string | undefined }[]): VibeAdapterDeps & { readonly spawnCount: () => number } {
	let count = 0;
	const deps: VibeAdapterDeps = {
		command,
		resolveCommandPath: (cmd) => cmd,
		identityStatSync: () => ({ size: 1, mtimeMs: 1 }),
		structuralDenialWordingForTests: DENIAL_WORDING,
		spawn: () => {
			const attempt = attempts[Math.min(count, attempts.length - 1)] as { readonly stdoutLines: string; readonly exportJsonText: string | undefined };
			count += 1;
			const { child, stdout, emitter } = fakeChild();
			queueMicrotask(() => {
				if (attempt.stdoutLines !== '') stdout.write(attempt.stdoutLines);
				stdout.end();
				emitter.emit('exit', 0, null);
			});
			return child;
		},
		mkdtemp: async () => realDir(),
		readFile: async () => {
			const attempt = attempts[Math.min(count - 1, attempts.length - 1)] as { readonly stdoutLines: string; readonly exportJsonText: string | undefined };
			if (attempt.exportJsonText === undefined) throw new Error('ENOENT');
			return attempt.exportJsonText;
		},
		rm: async () => undefined,
	};
	return { ...deps, spawnCount: () => count };
}

test('effectiveConfigFingerprint extraction from a fake export.json at qualification time; a missing/unparsable export.json fails qualification closed', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const context = baseContext(realDir());
	const good = await qualifyReadOnlyCapability(context, scriptedDeps('vibe-fp-good', bothToolsCompletedJournal(), exportJson(['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'])), 1);
	assert.equal(good.status, 'qualified');
	assert.ok(good.provenAgainst?.effectiveConfigFingerprint !== undefined && good.provenAgainst.effectiveConfigFingerprint.length > 0);

	_readOnlyQualificationCacheForTests().clear();
	const missing = await qualifyReadOnlyCapability(baseContext(realDir()), scriptedDeps('vibe-fp-missing', bothToolsCompletedJournal(), undefined), 1);
	assert.equal(missing.status, 'unavailable');
	assert.match(missing.reason ?? '', /export\.json/);

	_readOnlyQualificationCacheForTests().clear();
	const unparsable = await qualifyReadOnlyCapability(baseContext(realDir()), scriptedDeps('vibe-fp-unparsable', bothToolsCompletedJournal(), 'not json {{{'), 1);
	assert.equal(unparsable.status, 'unavailable');
	assert.match(unparsable.reason ?? '', /export\.json/);
});

test('concurrent cache misses for the identical stable descriptor coalescing into one in-flight qualification promise', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const cwd = realDir();
	const context = baseContext(cwd);
	const deps = multiAttemptDeps('vibe-coalesce', [{ stdoutLines: bothToolsCompletedJournal(), exportJsonText: exportJson(['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step']) }]);
	const [a, b] = await Promise.all([qualifyReadOnlyCapability(context, deps, 1), qualifyReadOnlyCapability(context, deps, 1)]);
	assert.equal(a.status, 'qualified');
	assert.deepEqual(a, b);
	assert.equal(deps.spawnCount(), 1, 'two concurrent calls for the same descriptor must share one probe run');
});

test("the allow-side probe's bounded retry tolerating simulated connector-not-registered attempts", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	const deps = multiAttemptDeps('vibe-retry', [
		{ stdoutLines: '', exportJsonText: exportJson(required) },
		{ stdoutLines: '', exportJsonText: exportJson(required) },
		{ stdoutLines: bothToolsCompletedJournal(), exportJsonText: exportJson(required) },
	]);
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 3);
	assert.equal(result.status, 'qualified');
	assert.equal(deps.spawnCount(), 3, 'the third attempt is what qualifies, after two simulated connector-flakiness misses');
});

test('the allow-side probe reports unavailable with a reason once the retry bound is exhausted', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	const deps = multiAttemptDeps('vibe-exhausted', [{ stdoutLines: '', exportJsonText: exportJson(required) }]);
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 3);
	assert.equal(result.status, 'unavailable');
	assert.equal(deps.spawnCount(), 3, 'every bound attempt runs when none ever completes');
	assert.match(result.reason ?? '', /did not show a confirmed completed call/);
});

test("structural catalog evidence: exclusion/denial of a disallowed tool passes qualification; exclusion/denial of a REQUIRED tool fails it -- the reconciled polarity", async () => {
	_readOnlyQualificationCacheForTests().clear();
	// A disallowed tool simply never appearing in enabled_tools (the normal case,
	// since --enabled-tools disables everything else) is exactly what the PASS case
	// below already exercises: enabled_tools contains ONLY the two required tools.
	const passResult = await qualifyReadOnlyCapability(baseContext(realDir()), scriptedDeps('vibe-polarity-pass', bothToolsCompletedJournal(), exportJson(['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'])), 1);
	assert.equal(passResult.status, 'qualified');

	_readOnlyQualificationCacheForTests().clear();
	// A REQUIRED tool excluded from the catalog must FAIL, even though the OTHER
	// required tool and nothing disallowed is present.
	const failResult = await qualifyReadOnlyCapability(baseContext(realDir()), scriptedDeps('vibe-polarity-fail', bothToolsCompletedJournal(), exportJson(['connector_insrc_insrc_analyze'])), 1);
	assert.equal(failResult.status, 'unavailable');
	assert.match(failResult.reason ?? '', /required tool\(s\) excluded/);
});

test("the allow-side completion check never lets a completed insrc_analyze_step call also count as confirming the plain insrc_analyze tool (no substring false-positive)", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	// Catalog check passes (both required tools enabled), but the journal shows a
	// confirmed completed call for ONLY the _step tool -- 'insrc_analyze' is a literal
	// string prefix of 'insrc_analyze_step', so a loose substring match would wrongly
	// treat this as confirming BOTH tools. Bounded retries all see the same journal, so
	// this must exhaust and report unavailable, never a false 'qualified'.
	const onlyStepCompletedJournal = JSON.stringify({ type: 'effect', toolCallId: 'c1', detail: { toolName: 'connector_insrc_insrc_analyze_step', input: {} }, state: { status: 'completed', outputText: 'ok' } }) + '\n';
	const deps = multiAttemptDeps('vibe-no-prefix-false-positive', [{ stdoutLines: onlyStepCompletedJournal, exportJsonText: exportJson(required) }]);
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 2);
	assert.equal(result.status, 'unavailable', 'a completed _step call alone must never satisfy the plain insrc_analyze requirement');
	assert.equal(deps.spawnCount(), 2, 'both bound attempts run since the plain tool never shows a confirmed call');
});

test('a genuine bypass-absence failure (a disallowed tool actually completes) failing qualification immediately, never retried', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	const deps = multiAttemptDeps('vibe-bypass', [{ stdoutLines: bothToolsCompletedJournal(), exportJsonText: exportJson([...required, 'file_system.bash']) }]);
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 5);
	assert.equal(result.status, 'unavailable');
	assert.match(result.reason ?? '', /bypass-absence failure/);
	assert.equal(deps.spawnCount(), 1, 'a bypass finding is never retried, even with retries available');
});

test('the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	const exhausted = await qualifyReadOnlyCapability(baseContext(realDir()), multiAttemptDeps('vibe-vrue-exhausted', [{ stdoutLines: '', exportJsonText: exportJson(required) }]), 2);
	assert.equal(exhausted.status, 'unavailable');

	_readOnlyQualificationCacheForTests().clear();
	const unusable = await qualifyReadOnlyCapability(baseContext(realDir()), scriptedDeps('vibe-vrue-unusable', bothToolsCompletedJournal(), undefined), 1);
	assert.equal(unusable.status, 'unavailable');

	// startTurn's mode:'read-only' branch is not yet wired to this suite's result
	// (that wiring is s2/t4-t5) -- it still carries its pre-existing s1 placeholder,
	// which already throws VibeReadOnlyUnavailableError regardless of qualification.
	const adapter = createVibeAdapter({ cwd: realDir(), processGroup: 'adapter-owned' });
	assert.throws(() => adapter.startTurn({ prompt: 'x', outputMode: 'json', session: { kind: 'new' }, mode: 'read-only' }), /no qualified capability yet/);
});

// -- Review response: code-review of e8105ad49, 5 findings ----------------------------------

test('a disallowed tool completing in the journal fails qualification even when the config-reported enabled_tools catalog under-reports it (review finding 2)', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	// The catalog claims ONLY the two required tools (the config-based bypass check above
	// would pass this cleanly) -- but the journal itself shows a THIRD tool's call actually
	// completing. A trustworthy catalog alone is not enough: the suite must also reject what
	// it can observe actually ran.
	const journalWithExtraCompletedCall = [
		TOOL_CALL_LINE('c1', 'connector_insrc_insrc_analyze'),
		TOOL_CALL_LINE('c2', 'connector_insrc_insrc_analyze_step'),
		TOOL_CALL_LINE('c3', 'file_system.write_file'),
	].join('\n') + '\n';
	const deps = multiAttemptDeps('vibe-journal-bypass', [{ stdoutLines: journalWithExtraCompletedCall, exportJsonText: exportJson(required) }]);
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 5);
	assert.equal(result.status, 'unavailable');
	assert.match(result.reason ?? '', /bypass-absence failure: an out-of-allowlist tool call completed: file_system\.write_file/);
	assert.equal(deps.spawnCount(), 1, 'a journal-observed bypass is never retried either, exactly like a config-reported one');
});

test('a run that only performs the two allowed calls, with no structural-denial attempt observed at all, does NOT qualify on the config catalog alone (review r2 finding 2)', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	// The config echoes back exactly the two requested tools (the OLD, insufficient
	// proof), and the allow-side journal evidence for both required tools is present --
	// but the structural denial probe (file_system.read_file) was never attempted at
	// all. "Never attempted" proves nothing about whether the restriction would have
	// held, so this must exhaust and report unavailable, never a false 'qualified'
	// based on the config catalog's own unverified echo.
	const noDenialProbeJournal = [
		TOOL_CALL_LINE('c1', 'connector_insrc_insrc_analyze'),
		TOOL_CALL_LINE('c2', 'connector_insrc_insrc_analyze_step'),
	].join('\n') + '\n';
	const deps = multiAttemptDeps('vibe-no-denial-probe', [{ stdoutLines: noDenialProbeJournal, exportJsonText: exportJson(required) }]);
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 2);
	assert.equal(result.status, 'unavailable');
	assert.match(result.reason ?? '', /structural denial probe: file_system\.read_file was not observed as a denied call/);
	assert.equal(deps.spawnCount(), 2, 'a missing structural-denial attempt is ambient-flakiness-retried, not a terminal bypass');
});

test('an unresolvable executable fails qualification closed rather than hashing under a reusable-but-ambiguous identity (review finding 3a)', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), env: { PATH: '/nonexistent-insrc-test-path-xyz' }, processGroup: 'adapter-owned' };
	const result = await qualifyReadOnlyCapability(context, { command: 'definitely-not-a-real-vibe-binary-xyz' }, 1);
	assert.equal(result.status, 'unavailable');
	assert.match(result.reason ?? '', /stable descriptor computation failed/);
});

test("resolution and the actual probe dispatch agree on the SAME binary found under this context's own env.PATH, not the inherited process env (review finding 3b)", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const dir = realDir();
	const scriptName = `insrc-identity-probe-${Date.now()}`;
	const scriptPath = join(dir, scriptName);
	const script = `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
const outputDir = args[args.indexOf('--output-dir') + 1];
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputDir + '/export.json', JSON.stringify({ vibe_version: '1.0', config: { enabled_tools: ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'] } }));
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c1', detail: { toolName: 'connector_insrc_insrc_analyze', input: {} }, state: { status: 'completed', outputText: 'ok' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c2', detail: { toolName: 'connector_insrc_insrc_analyze_step', input: {} }, state: { status: 'completed', outputText: 'ok' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c3', detail: { toolName: 'file_system.read_file', input: {} }, state: { status: 'failed', outputText: 'denied: tool not enabled' } }) + '\\n');
process.exit(0);
`;
	writeFileSync(scriptPath, script);
	chmodSync(scriptPath, 0o755);
	// Only this script's own directory is on PATH (plus node's own directory, so the
	// shebang's `env node` still resolves) -- the SAME, uniquely-named bare command would
	// never be found by the real system's own ambient PATH. Resolution succeeding, and the
	// SAME script actually running and reporting a qualified result, together prove
	// resolveCommandOnPath used THIS context's env.PATH, not something it merely inherited.
	// `/usr/bin:/bin` is included so the resolver's own `which` call can run at all --
	// the regression this test actually targets is the SCRIPT's own directory, not that.
	const nodeDir = dirname(process.execPath);
	const context: VibeAdapterContext = { cwd: dir, env: { PATH: `${dir}:${nodeDir}:/usr/bin:/bin` }, processGroup: 'adapter-owned' };
	const result = await qualifyReadOnlyCapability(context, { command: scriptName, structuralDenialWordingForTests: DENIAL_WORDING }, 1);
	assert.equal(result.status, 'qualified');
});

test("a RELATIVE command resolves against the launch context's own cwd, not wherever this process happens to be running (review r2 finding 5)", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const dir = realDir();
	const scriptName = 'insrc-relative-identity-probe';
	const scriptPath = join(dir, scriptName);
	const script = `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
const outputDir = args[args.indexOf('--output-dir') + 1];
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputDir + '/export.json', JSON.stringify({ vibe_version: '1.0', config: { enabled_tools: ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'] } }));
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c1', detail: { toolName: 'connector_insrc_insrc_analyze', input: {} }, state: { status: 'completed', outputText: 'ok' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c2', detail: { toolName: 'connector_insrc_insrc_analyze_step', input: {} }, state: { status: 'completed', outputText: 'ok' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c3', detail: { toolName: 'file_system.read_file', input: {} }, state: { status: 'failed', outputText: 'denied: tool not enabled' } }) + '\\n');
process.exit(0);
`;
	writeFileSync(scriptPath, script);
	chmodSync(scriptPath, 0o755);
	// `process.cwd()` here is the repo root (wherever the test runner started), NOT
	// `dir` -- a relative command resolved against THAT (the old bug) would never find
	// this script. `context.cwd` is `dir`, so `./insrc-relative-identity-probe` must
	// resolve (and spawn) relative to `dir` for this to qualify at all.
	assert.notEqual(process.cwd(), dir);
	const context: VibeAdapterContext = { cwd: dir, processGroup: 'adapter-owned' };
	const result = await qualifyReadOnlyCapability(context, { command: `./${scriptName}`, structuralDenialWordingForTests: DENIAL_WORDING }, 1);
	assert.equal(result.status, 'qualified');
});

test("a hanging offline child is actually killed by the suite's own bounded per-probe timeout, not left running indefinitely (review finding 4)", async () => {
	// No caller `opts` at all here (review r2 finding 1 decoupled the suite's own bound
	// from any individual caller's budget) -- `_setQualificationProbeTimeoutMsForTests`
	// is the only remaining seam, so this proves the KILL mechanism itself, not merely
	// that some caller gave up waiting while the hung process kept running unseen.
	_readOnlyQualificationCacheForTests().clear();
	const dir = realDir();
	const scriptPath = join(dir, 'hanging-vibe');
	// Never exits on its own; only SIGKILL (via killProcessGroup) ends it.
	writeFileSync(scriptPath, '#!/usr/bin/env node\nsetInterval(() => undefined, 1000);\n');
	chmodSync(scriptPath, 0o755);
	const context: VibeAdapterContext = { cwd: dir, processGroup: 'adapter-owned' };
	_setQualificationProbeTimeoutMsForTests(300);
	try {
		const startedAt = Date.now();
		const result = await qualifyReadOnlyCapability(context, { command: scriptPath }, 1);
		const elapsedMs = Date.now() - startedAt;
		assert.equal(result.status, 'unavailable');
		assert.ok(elapsedMs < 5_000, `the suite's own bounded per-probe timeout must actually kill the hung child, not wait indefinitely (took ${elapsedMs}ms)`);
	} finally {
		_setQualificationProbeTimeoutMsForTests(undefined);
	}
});

test("a caller's own short deadline never poisons the shared result for a differently-budgeted caller, or the cache (review r2 finding 1)", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	let spawnCount = 0;
	const deps: VibeAdapterDeps = {
		command: 'vibe-shared-race',
		resolveCommandPath: (cmd) => cmd,
		identityStatSync: () => ({ size: 1, mtimeMs: 1 }),
		structuralDenialWordingForTests: DENIAL_WORDING,
		spawn: () => {
			spawnCount += 1;
			const { child, stdout, emitter } = fakeChild();
			// Slower than the short-budget caller's own deadline below, so that caller's
			// own race loses before the shared probe itself ever finishes.
			setTimeout(() => { stdout.write(bothToolsCompletedJournal()); stdout.end(); emitter.emit('exit', 0, null); }, 80);
			return child;
		},
		mkdtemp: async () => realDir(),
		readFile: async () => exportJson(required),
		rm: async () => undefined,
	};
	const context = baseContext(realDir());

	const [shortBudgetResult, fullBudgetResult] = await Promise.all([
		qualifyReadOnlyCapability(context, deps, 1, { deadlineMs: 10 }),
		qualifyReadOnlyCapability(context, deps, 1),
	]);
	assert.equal(shortBudgetResult.status, 'unavailable');
	assert.match(shortBudgetResult.reason ?? '', /exceeded the caller's deadline/);
	assert.equal(fullBudgetResult.status, 'qualified', "a differently-budgeted caller must see the suite's own real outcome, not the short-budget caller's own timeout");

	// The cache itself holds the real, genuine outcome -- never poisoned by the
	// short-budget caller's own early give-up -- and a later caller (even a short-
	// budget one) now hits it warm, with no further spawn.
	const warmResult = await qualifyReadOnlyCapability(context, deps, 1, { deadlineMs: 10 });
	assert.equal(warmResult.status, 'qualified');
	assert.equal(spawnCount, 1, 'only ONE real probe ran -- both callers shared it, and the warm cache hit spawned nothing further');
});

test('a missing, malformed, or config-less post-dispatch export invalidates the cache (fail-closed), and the invalidation is visible before the result that triggered it resolves (review finding 5)', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const command = 'vibe-unverifiable-evidence';
	const argv = _buildArgvForTests({ prompt: 'x', outputMode: 'streaming', session: { kind: 'new' }, mode: 'read-only' }, '/tmp/unused-output-dir');
	const key = stableDescriptorHash(context, command, argv, { resolveCommandPath: (cmd) => cmd, statSync: () => ({ size: 1, mtimeMs: 1 }) });
	_readOnlyQualificationCacheForTests().set(key, { status: 'qualified', allowedTools: ['insrc_analyze', 'insrc_analyze_step'], provenAgainst: { stableDescriptorHash: key, effectiveConfigFingerprint: 'fp-cached' } });

	const adapter = createVibeAdapter(context, {
		command, resolveCommandPath: (cmd) => cmd, identityStatSync: () => ({ size: 1, mtimeMs: 1 }),
		spawn: () => {
			const { child, stdout, emitter } = fakeChild();
			queueMicrotask(() => {
				stdout.write(JSON.stringify([{ sessionId: 's', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }] }]));
				stdout.end();
				emitter.emit('exit', 0, null);
			});
			return child;
		},
		mkdtemp: async () => realDir(),
		readFile: async () => { throw new Error('ENOENT: export.json never written by this fixture'); },
		rm: async () => undefined,
	});
	const turn = adapter.startTurn({ prompt: 'x', outputMode: 'json', session: { kind: 'new' }, mode: 'read-only' });
	for await (const _e of turn) { /* drain */ }
	const result = await turn.result;
	assert.equal(result.text, 'ok', "the turn's own answer is unaffected by an unreadable export");
	// No `tick()`/wait here at all -- the invalidation is awaited BEFORE resolveResult
	// publishes, so it must already be visible the instant `turn.result` settles.
	assert.equal(_readOnlyQualificationCacheForTests().has(key), false, 'an unreadable/unverifiable export invalidates the cache, never leaves it untouched');
});

// -- Review response round 2: code-review of 5cb577231, 3 findings ---------------------------

test("an ordinary operational failure (e.g. a missing file) does NOT count as a confirmed policy denial, even with status 'failed' (review r3 finding 1)", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	// Exactly the reviewer's own reproduction: only the denial-probe tool's own result
	// TEXT changes, to a mundane "file not found" -- status is still 'failed', the OLD
	// (insufficiently strict) check would have accepted this as a confirmed denial.
	const mundaneFailureJournal = [
		TOOL_CALL_LINE('c1', 'connector_insrc_insrc_analyze'),
		TOOL_CALL_LINE('c2', 'connector_insrc_insrc_analyze_step'),
		DENIED_TOOL_CALL_LINE('c3', 'file_system.read_file').replace('denied: tool not enabled', 'file not found'),
	].join('\n') + '\n';
	const deps = multiAttemptDeps('vibe-mundane-failure', [{ stdoutLines: mundaneFailureJournal, exportJsonText: exportJson(required) }]);
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 2);
	assert.equal(result.status, 'unavailable', 'a mundane file-not-found failure must never count as confirmed structural denial evidence');
	assert.match(result.reason ?? '', /structural denial probe: file_system\.read_file was not observed as a denied call/);
	assert.equal(deps.spawnCount(), 2, "an ordinary-looking failure is ambient-flakiness-retried, same as never having attempted the probe at all");
});

test("a DIFFERENT generic failure wording (\"operation timed out\") not covered by any exclusion list also does NOT count as a denial (review r4 finding 1)", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	// The reviewer's own round-4 reproduction: an exclusion-list approach (round 3's own
	// fix) is unsound no matter how many patterns it names, since the space of non-denial
	// failure wording is unbounded. This wording was never on any exclusion list, and the
	// fix (requiring POSITIVE, operator-configured wording) must still reject it.
	const timeoutFailureJournal = [
		TOOL_CALL_LINE('c1', 'connector_insrc_insrc_analyze'),
		TOOL_CALL_LINE('c2', 'connector_insrc_insrc_analyze_step'),
		DENIED_TOOL_CALL_LINE('c3', 'file_system.read_file').replace('denied: tool not enabled', 'operation timed out'),
	].join('\n') + '\n';
	const deps = multiAttemptDeps('vibe-timeout-failure', [{ stdoutLines: timeoutFailureJournal, exportJsonText: exportJson(required) }]);
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 2);
	assert.equal(result.status, 'unavailable', 'a timeout establishes no restriction on tool reachability and must never count as a confirmed denial');
	assert.match(result.reason ?? '', /structural denial probe: file_system\.read_file was not observed as a denied call/);
});

test('with NO denial wording configured at all (the real production default), qualification can never succeed via the structural denial probe, even when the journal shows a genuinely well-formed denial (review r4 finding 1, fail-closed default)', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	const deps: VibeAdapterDeps = {
		command: 'vibe-no-wording-configured',
		resolveCommandPath: (cmd) => cmd,
		identityStatSync: () => ({ size: 1, mtimeMs: 1 }),
		// No structuralDenialWordingForTests at all, and INSRC_VIBE_ENABLED_TOOLS_DENIAL_WORDING
		// is not set in this test run -- this is the real, unconfigured production default.
		spawn: () => {
			const { child, stdout, emitter } = fakeChild();
			queueMicrotask(() => { stdout.write(bothToolsCompletedJournal()); stdout.end(); emitter.emit('exit', 0, null); });
			return child;
		},
		mkdtemp: async () => realDir(),
		readFile: async () => exportJson(required),
		rm: async () => undefined,
	};
	assert.equal(process.env['INSRC_VIBE_ENABLED_TOOLS_DENIAL_WORDING'], undefined, 'this test assumes the real production default: nothing configured');
	const result = await qualifyReadOnlyCapability(baseContext(realDir()), deps, 1);
	assert.equal(result.status, 'unavailable', 'with no verified denial wording configured, qualification must fail closed by design, never guess');
	assert.match(result.reason ?? '', /structural denial probe: file_system\.read_file was not observed as a denied call/);
});

test('a transient qualification failure (e.g. a missing export on one run) is never cached durably -- a LATER, separate call starts a fresh run and can still succeed (review r3 finding 2)', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const required = ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'];
	const context = baseContext(realDir());
	// maxAllowRetries=1: the FIRST call's own single attempt gets a missing export (a
	// transient, non-structural failure) and exhausts immediately.
	const firstCallDeps = multiAttemptDeps('vibe-transient-exhaustion', [{ stdoutLines: '', exportJsonText: undefined }]);
	const firstResult = await qualifyReadOnlyCapability(context, firstCallDeps, 1);
	assert.equal(firstResult.status, 'unavailable');
	assert.equal(_readOnlyQualificationCacheForTests().size, 0, 'a transient exhaustion must never be written to the durable cache');

	// A LATER, entirely separate qualifyReadOnlyCapability call (same descriptor) --
	// since nothing was cached, this must run the suite fresh, not reuse the first
	// call's own stale 'unavailable' outcome.
	const secondCallDeps = multiAttemptDeps('vibe-transient-exhaustion', [{ stdoutLines: bothToolsCompletedJournal(), exportJsonText: exportJson(required) }]);
	const secondResult = await qualifyReadOnlyCapability(context, secondCallDeps, 1);
	assert.equal(secondResult.status, 'qualified', 'a later call must get a fresh run, not be stuck on the first run\'s own transient failure');
	assert.equal(secondCallDeps.spawnCount(), 1, 'the second call actually spawned its own probe rather than hitting a poisoned cache');
});

test("a relative PATH entry whose own 'which' output comes back relative is still absolutized against the launch cwd before stat/spawn (review r3 finding 3)", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const dir = realDir();
	const scriptName = 'insrc-which-review';
	const scriptPath = join(dir, 'bin', scriptName);
	mkdirSync(join(dir, 'bin'), { recursive: true });
	const script = `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require('node:fs');
const args = process.argv.slice(2);
const outputDir = args[args.indexOf('--output-dir') + 1];
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputDir + '/export.json', JSON.stringify({ vibe_version: '1.0', config: { enabled_tools: ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'] } }));
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c1', detail: { toolName: 'connector_insrc_insrc_analyze', input: {} }, state: { status: 'completed', outputText: 'ok' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c2', detail: { toolName: 'connector_insrc_insrc_analyze_step', input: {} }, state: { status: 'completed', outputText: 'ok' } }) + '\\n');
process.stdout.write(JSON.stringify({ type: 'effect', toolCallId: 'c3', detail: { toolName: 'file_system.read_file', input: {} }, state: { status: 'failed', outputText: 'denied: tool not enabled' } }) + '\\n');
process.exit(0);
`;
	writeFileSync(scriptPath, script);
	chmodSync(scriptPath, 0o755);
	// PATH's own entry ("bin") is RELATIVE -- `which`, even run with `cwd: dir`, may
	// echo back "bin/insrc-which-review" verbatim rather than absolutizing it itself
	// (confirmed on this host). If resolveCommandOnPath ever stops absolutizing that
	// result against `cwd`, the identity stat/spawn would resolve it against WHATEVER
	// this test process's own cwd happens to be instead, which is never `dir`.
	assert.notEqual(process.cwd(), dir);
	const nodeDir = dirname(process.execPath);
	const context: VibeAdapterContext = { cwd: dir, env: { PATH: `bin:${nodeDir}:/usr/bin:/bin` }, processGroup: 'adapter-owned' };
	const result = await qualifyReadOnlyCapability(context, { command: scriptName, structuralDenialWordingForTests: DENIAL_WORDING }, 1);
	assert.equal(result.status, 'qualified');
});
