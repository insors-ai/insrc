/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s2/t5: startTurn's mode:'read-only' real dispatch
 * -- re-checking the qualification cache at dispatch time, dispatching when 'qualified',
 * refusing when 'unavailable', and the post-dispatch effectiveConfigFingerprint check that
 * invalidates the cache for the NEXT call without affecting the current call's own result.
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter-readonly-dispatch.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _buildArgvForTests, _readOnlyQualificationCacheForTests, createVibeAdapter, stableDescriptorHash, VibeReadOnlyUnavailableError } from '../vibe-adapter.js';
import type { ReadOnlyCapability, VibeAdapterContext, VibeChildProcess, VibeTurnRequest } from '../vibe-adapter.js';

function realDir(): string { return mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-dispatch-')); }

function descriptorFor(context: VibeAdapterContext, command: string): string {
	const argv = _buildArgvForTests(readOnlyRequest(), '/tmp/unused-output-dir');
	return stableDescriptorHash(context, command, argv, { resolveCommandPath: (cmd) => cmd, statSync: () => ({ size: 1, mtimeMs: 1 }) });
}

// A test-only stand-in for an operator's own live-confirmed denial wording (review r5
// finding 1 -- the cache key below mixes this in, so changing/removing it must invalidate
// a stale entry; see structuralDenialWordingForTests).
const DENIAL_WORDING = /denied|not enabled/i;

/** The actual Map key the module now uses (review r5 finding 1): the pure stable descriptor
 *  plus the effective denial-wording fingerprint. */
function cacheKeyFor(context: VibeAdapterContext, command: string): string {
	return `${descriptorFor(context, command)}#configured:${DENIAL_WORDING.source}/${DENIAL_WORDING.flags}`;
}

function readOnlyRequest(overrides: Partial<VibeTurnRequest> = {}): VibeTurnRequest {
	return { prompt: 'x', outputMode: 'streaming', session: { kind: 'new' }, mode: 'read-only', ...overrides };
}

function fakeChild(pid: number | undefined = 4242): { child: VibeChildProcess; stdout: PassThrough; emitter: EventEmitter } {
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
	return { child, stdout, emitter };
}

const ASSISTANT_LINE = JSON.stringify({ sessionId: 'sess-1', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'ok' }] }) + '\n';

function exportJsonWithFingerprint(marker: string): string {
	return JSON.stringify({ vibe_version: '3.1.4', config: { enabled_tools: ['connector_insrc_insrc_analyze', 'connector_insrc_insrc_analyze_step'], active_model: marker } });
}

/** A scripted successful real dispatch: exits 0, streams one assistant message, and its
 *  export.json reports `exportMarker` (feeding effectiveConfigFingerprintFrom). */
function dispatchDeps(command: string, exportMarker: string) {
	return {
		command,
		resolveCommandPath: (cmd: string) => cmd,
		identityStatSync: () => ({ size: 1, mtimeMs: 1 }),
		structuralDenialWordingForTests: DENIAL_WORDING,
		spawn: () => {
			const { child, stdout, emitter } = fakeChild();
			queueMicrotask(() => { stdout.write(ASSISTANT_LINE); stdout.end(); emitter.emit('exit', 0, null); });
			return child;
		},
		mkdtemp: async () => realDir(),
		readFile: async () => exportJsonWithFingerprint(exportMarker),
		rm: async () => undefined,
	};
}

function qualifiedCapability(descriptorKey: string, fingerprint: string): ReadOnlyCapability {
	return { status: 'qualified', allowedTools: ['insrc_analyze', 'insrc_analyze_step'], provenAgainst: { stableDescriptorHash: descriptorKey, effectiveConfigFingerprint: fingerprint } };
}

/** The fingerprint effectiveConfigFingerprintFrom would compute for exportJsonWithFingerprint(marker). */
function fingerprintFor(marker: string): string {
	const obj = JSON.parse(exportJsonWithFingerprint(marker)) as { vibe_version: string; config: unknown };
	// Mirrors vibe-adapter.ts's own effectiveConfigFingerprintFrom exactly (sha256 of {vibeVersion, config}).
	return createHash('sha256').update(JSON.stringify({ vibeVersion: obj.vibe_version, config: obj.config })).digest('hex');
}

function tick(ms = 20): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

test('a read-only request with a \'qualified\' cached capability dispatches via buildArgv\'s read-only branch and returns the schema-validated result', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const command = 'vibe-dispatch-ok';
	const key = descriptorFor(context, command);
	const cacheKey = cacheKeyFor(context, command);
	const marker = 'm1';
	_readOnlyQualificationCacheForTests().set(cacheKey, qualifiedCapability(key, fingerprintFor(marker)));

	const adapter = createVibeAdapter(context, dispatchDeps(command, marker));
	const turn = adapter.startTurn(readOnlyRequest());
	const events = [];
	for await (const event of turn) events.push(event);
	const result = await turn.result;
	assert.equal(result.text, 'ok');
	assert.equal(result.sessionId, 'sess-1');
});

test('a read-only request with an \'unavailable\' cached capability throws VibeReadOnlyUnavailableError carrying the cached reason, without spawning a process', () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const command = 'vibe-dispatch-unavailable';
	const cacheKey = cacheKeyFor(context, command);
	_readOnlyQualificationCacheForTests().set(cacheKey, { status: 'unavailable', allowedTools: [], reason: 'bypass-absence failure: tool(s) outside the allowlist are enabled: file_system.bash', provenAgainst: undefined });

	let spawnInvoked = false;
	const adapter = createVibeAdapter(context, { command, resolveCommandPath: (cmd) => cmd, identityStatSync: () => ({ size: 1, mtimeMs: 1 }), structuralDenialWordingForTests: DENIAL_WORDING, spawn: () => { spawnInvoked = true; throw new Error('must not spawn'); } });
	assert.throws(() => adapter.startTurn(readOnlyRequest()), (error: unknown) => error instanceof VibeReadOnlyUnavailableError && error.message.includes('bypass-absence failure'));
	assert.equal(spawnInvoked, false);
});

test("startTurn's mode:'read-only' branch re-checking the cache by stableDescriptorHash at dispatch time", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const command = 'vibe-dispatch-recheck';
	const key = descriptorFor(context, command);
	const cacheKey = cacheKeyFor(context, command);
	// Cache is EMPTY at construction time -- the adapter's own readOnly snapshot says unavailable.
	const adapter = createVibeAdapter(context, dispatchDeps(command, 'm2'));
	assert.equal(adapter.readOnly.status, 'unavailable');

	// Qualification resolves in the background AFTER construction (t3's suite, simulated
	// here by directly populating the cache) -- startTurn must re-check the cache fresh at
	// dispatch time rather than trusting the stale construction-time snapshot.
	_readOnlyQualificationCacheForTests().set(cacheKey, qualifiedCapability(key, fingerprintFor('m2')));
	const turn = adapter.startTurn(readOnlyRequest());
	for await (const _e of turn) { /* drain */ }
	const result = await turn.result;
	assert.equal(result.text, 'ok');
});

test('a qualified dispatch whose own export.json diverges from the cached fingerprint invalidating the entry while still returning its own result', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const command = 'vibe-dispatch-drift';
	const key = descriptorFor(context, command);
	const cacheKey = cacheKeyFor(context, command);
	// Cached fingerprint is for 'cached-marker'; the real dispatch's own export.json reports 'drifted-marker'.
	_readOnlyQualificationCacheForTests().set(cacheKey, qualifiedCapability(key, fingerprintFor('cached-marker')));

	const adapter = createVibeAdapter(context, dispatchDeps(command, 'drifted-marker'));
	const turn = adapter.startTurn(readOnlyRequest());
	for await (const _e of turn) { /* drain */ }
	const result = await turn.result;
	assert.equal(result.text, 'ok', "the completed turn's own result is unaffected by the mismatch");

	await tick();
	assert.equal(_readOnlyQualificationCacheForTests().has(cacheKey), false, 'the mismatch invalidates the cache entry');
});

test('a scripted post-dispatch export.json mismatch invalidating the cache for the NEXT call while the current call\'s result is unaffected', async () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const command = 'vibe-dispatch-next-call';
	const key = descriptorFor(context, command);
	const cacheKey = cacheKeyFor(context, command);
	_readOnlyQualificationCacheForTests().set(cacheKey, qualifiedCapability(key, fingerprintFor('cached-marker')));

	const adapter = createVibeAdapter(context, dispatchDeps(command, 'drifted-marker'));
	const firstTurn = adapter.startTurn(readOnlyRequest());
	for await (const _e of firstTurn) { /* drain */ }
	const firstResult = await firstTurn.result;
	assert.equal(firstResult.text, 'ok');
	await tick();

	// The NEXT call for the same descriptor now sees an invalidated (missing) cache entry.
	assert.throws(() => adapter.startTurn(readOnlyRequest()), VibeReadOnlyUnavailableError);
});

test("the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable", () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const command = 'vibe-dispatch-exhausted';
	const cacheKey = cacheKeyFor(context, command);
	_readOnlyQualificationCacheForTests().set(cacheKey, { status: 'unavailable', allowedTools: [], reason: "allow-side probe: insrc_analyze and/or insrc_analyze_step did not show a confirmed completed call (attempt 3/3)", provenAgainst: undefined });

	const adapter = createVibeAdapter(context, { command, resolveCommandPath: (cmd) => cmd, identityStatSync: () => ({ size: 1, mtimeMs: 1 }), structuralDenialWordingForTests: DENIAL_WORDING });
	assert.throws(() => adapter.startTurn(readOnlyRequest()), (error: unknown) => error instanceof VibeReadOnlyUnavailableError && error.message.includes('did not show a confirmed completed call'));
});

test("a FAILED turn (nonzero exit) still invalidates the cache on unverifiable evidence, preserving the original turn error (review r2 finding 4)", async () => {
	_readOnlyQualificationCacheForTests().clear();
	const context: VibeAdapterContext = { cwd: realDir(), processGroup: 'adapter-owned' };
	const command = 'vibe-dispatch-failed-turn';
	const key = descriptorFor(context, command);
	const cacheKey = cacheKeyFor(context, command);
	_readOnlyQualificationCacheForTests().set(cacheKey, qualifiedCapability(key, fingerprintFor('cached-marker')));

	const adapter = createVibeAdapter(context, {
		command, resolveCommandPath: (cmd) => cmd, identityStatSync: () => ({ size: 1, mtimeMs: 1 }), structuralDenialWordingForTests: DENIAL_WORDING,
		spawn: () => {
			const { child, emitter } = fakeChild();
			queueMicrotask(() => { (child.stderr as PassThrough).write('boom'); emitter.emit('exit', 1, null); });
			return child;
		},
		mkdtemp: async () => realDir(),
		// A failed launch's own export.json was never meaningfully written -- unreadable,
		// exactly the "cannot provide verification evidence" case the fix targets.
		readFile: async () => { throw new Error('ENOENT: no export.json from this failed launch'); },
		rm: async () => undefined,
	});
	// Only `.result` is awaited, matching the one real production caller
	// (readOnlySessionOnce, cli-provider.ts), which never iterates the event stream.
	const turn = adapter.startTurn(readOnlyRequest());
	await assert.rejects(
		turn.result,
		(error: unknown) => error instanceof Error && /boom/.test(error.message),
		"the original turn failure must still be what the caller sees",
	);
	assert.equal(_readOnlyQualificationCacheForTests().has(cacheKey), false, 'a failed turn with unverifiable evidence invalidates the cache exactly like a successful-but-drifted one');
});
