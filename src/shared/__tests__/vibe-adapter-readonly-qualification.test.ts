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
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _readOnlyQualificationCacheForTests, createVibeAdapter, qualifyReadOnlyCapability } from '../vibe-adapter.js';
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

function bothToolsCompletedJournal(): string {
	return [
		TOOL_CALL_LINE('c1', 'connector_insrc_insrc_analyze'),
		TOOL_CALL_LINE('c2', 'connector_insrc_insrc_analyze_step'),
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
