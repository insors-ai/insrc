/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t1: vibe-adapter.ts's construction-time
 * validation and startTurn's pre-dispatch refusal paths.
 * Run: npx tsx --test src/shared/__tests__/vibe-adapter.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	createVibeAdapter, mapApprovalFlags, buildSelectionArgs, VibeTurnError,
	VibeReadOnlyUnavailableError, VibeReadOnlyApprovalRejectedError,
} from '../vibe-adapter.js';
import type { VibeTurnRequest } from '../vibe-adapter.js';

function baseRequest(overrides: Partial<VibeTurnRequest> = {}): VibeTurnRequest {
	return {
		prompt: 'hello',
		outputMode: 'text',
		session: { kind: 'new' },
		mode: 'default',
		...overrides,
	};
}

test('createVibeAdapter throws when context.cwd is empty, before any subprocess spawns', () => {
	assert.throws(() => createVibeAdapter({ cwd: '', processGroup: 'adapter-owned' }));
});

test('createVibeAdapter throws when context.cwd is not a directory, before any subprocess spawns', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-'));
	const file = join(dir, 'not-a-dir.txt');
	writeFileSync(file, 'x');
	try {
		assert.throws(() => createVibeAdapter({ cwd: file, processGroup: 'adapter-owned' }));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('createVibeAdapter throws when context.cwd does not exist at all', () => {
	assert.throws(() => createVibeAdapter({ cwd: '/nonexistent/insrc-vibe-adapter-path', processGroup: 'adapter-owned' }));
});

test('createVibeAdapter succeeds for a real directory and returns an adapter', () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-'));
	try {
		const adapter = createVibeAdapter({ cwd: dir, processGroup: 'adapter-owned' });
		assert.equal(typeof adapter.startTurn, 'function');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("startTurn with mode:'read-only' refuses before any subprocess spawn, surfacing a reason", () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-'));
	try {
		const adapter = createVibeAdapter({ cwd: dir, processGroup: 'adapter-owned' });
		assert.throws(() => adapter.startTurn(baseRequest({ mode: 'read-only' })), VibeReadOnlyUnavailableError);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("startTurn with mode:'read-only' and any approval setting refuses before dispatch", () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-'));
	try {
		const adapter = createVibeAdapter({ cwd: dir, processGroup: 'adapter-owned' });
		for (const approval of ['manual', 'edit-auto', 'auto'] as const) {
			assert.throws(() => adapter.startTurn(baseRequest({ mode: 'read-only', approval })), VibeReadOnlyApprovalRejectedError);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the ordinary approval mapping matches today's chat mapping: default/manual/edit-auto/auto", () => {
	assert.deepEqual(mapApprovalFlags(undefined), {});
	assert.deepEqual(mapApprovalFlags('default'), {});
	assert.deepEqual(mapApprovalFlags('manual'), { agent: 'ask' });
	assert.deepEqual(mapApprovalFlags('edit-auto'), { agent: 'accept-edits' });
	assert.deepEqual(mapApprovalFlags('auto'), { autoApprove: true });
});

test("a new-session request's argv carries --model/--thinking only when the caller supplied them; a resumed-session request's type carries no selection fields", () => {
	assert.deepEqual(buildSelectionArgs({ kind: 'new' }), []);
	assert.deepEqual(buildSelectionArgs({ kind: 'new', model: 'opus' }), ['--model', 'opus']);
	assert.deepEqual(buildSelectionArgs({ kind: 'new', thinking: 'high' }), ['--thinking', 'high']);
	assert.deepEqual(buildSelectionArgs({ kind: 'new', model: 'opus', thinking: 'high' }), ['--model', 'opus', '--thinking', 'high']);
	assert.deepEqual(buildSelectionArgs({ kind: 'resume', resumeHandle: 'abc123' }), ['--resume', 'abc123']);
});

test('VibeTurnError is re-homed with the same constructor shape (dispatchState, sessionId, cause) structured-output.ts\'s instanceof check relies on', () => {
	const cause = new Error('boom');
	const err = new VibeTurnError('possibly-sent', 'session-1', cause);
	assert.ok(err instanceof Error);
	assert.equal(err.name, 'VibeTurnError');
	assert.equal(err.dispatchState, 'possibly-sent');
	assert.equal(err.sessionId, 'session-1');
	assert.equal(err.cause, cause);
	assert.equal(err.message, 'boom');

	const errNoCause = new VibeTurnError('not-sent', undefined, 'plain string cause');
	assert.equal(errNoCause.dispatchState, 'not-sent');
	assert.equal(errNoCause.sessionId, undefined);
	assert.equal(errNoCause.message, 'Vibe turn failed');
});
