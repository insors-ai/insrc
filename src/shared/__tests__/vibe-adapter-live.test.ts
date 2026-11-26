/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t2: live suite against the real installed
 * vibe binary. Gated behind INSRC_LIVE_TESTS=1 (skips cleanly otherwise).
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test src/shared/__tests__/vibe-adapter-live.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createVibeAdapter } from '../vibe-adapter.js';

const live = process.env['INSRC_LIVE_TESTS'] === '1';

test('live: a real vibe -p turn with a bogus model alias surfaces the tool\'s real catalog as VibeSelectionError', { skip: !live }, async () => {
	const cwd = mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-live-'));
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' });
		const turn = adapter.startTurn({
			prompt: 'say hi', outputMode: 'text',
			session: { kind: 'new', model: '__insrc_no_such_alias__' }, mode: 'default',
		});
		turn.result.catch(() => undefined);
		await assert.rejects(
			(async () => { for await (const _e of turn) { /* drain */ } })(),
			(err: unknown) => err instanceof Error && err.name === 'VibeSelectionError' && /Unknown model: __insrc_no_such_alias__/.test(err.message),
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('live: a real vibe -p turn with a valid model/thinking completes and reports exit evidence', { skip: !live }, async () => {
	const cwd = mkdtempSync(join(tmpdir(), 'insrc-vibe-adapter-live-'));
	try {
		const adapter = createVibeAdapter({ cwd, processGroup: 'adapter-owned' });
		const turn = adapter.startTurn({
			prompt: 'respond with exactly: OK', outputMode: 'streaming',
			session: { kind: 'new', model: 'mistral-medium-latest' }, mode: 'default',
			budget: { maxTurns: 1 },
		});
		const events: unknown[] = [];
		for await (const event of turn) events.push(event);
		const result = await turn.result;
		assert.ok(events.some((e): e is { kind: string } => (e as { kind?: string }).kind === 'session'));
		assert.ok(result.text.length > 0);
		assert.equal(result.exitEvidence?.effectiveSelection?.model, 'mistral-medium-latest');
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
