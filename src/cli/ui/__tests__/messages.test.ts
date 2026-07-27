/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the pure message-log helpers behind the bottom message box.
 *
 * Run: npx tsx --test src/cli/ui/__tests__/messages.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendMessage, clearTransient, dismissMessage, MAX_MESSAGES } from '../messages.js';
import type { MsgKind, MsgLine } from '../messages.js';

let seq = 0;
function line(text: string, kind: MsgKind = 'info', transient = false): MsgLine {
	return { id: ++seq, text, kind, transient };
}

test('appendMessage appends in order below the bound', () => {
	const a = line('one');
	const b = line('two');
	const out = appendMessage(appendMessage([], a), b);
	assert.deepEqual(out.map(m => m.text), ['one', 'two']);
});

test('appendMessage bounds to the last N (older lines scroll off, no growth)', () => {
	let list: MsgLine[] = [];
	for (let i = 0; i < MAX_MESSAGES + 4; i++) list = appendMessage(list, line(`l${i}`));
	assert.equal(list.length, MAX_MESSAGES);
	// The oldest four scrolled off; the newest is kept.
	assert.equal(list[0]?.text, `l4`);
	assert.equal(list[list.length - 1]?.text, `l${MAX_MESSAGES + 3}`);
});

test('appendMessage honours an explicit max', () => {
	let list: MsgLine[] = [];
	for (let i = 0; i < 6; i++) list = appendMessage(list, line(`x${i}`), 3);
	assert.deepEqual(list.map(m => m.text), ['x3', 'x4', 'x5']);
});

test('clearTransient removes ALL transient lines but keeps sticky note/task lines', () => {
	const list = [line('sticky-info', 'info', false), line('toast', 'success', true), line('sticky-err', 'error', false)];
	const out = clearTransient(list);
	assert.deepEqual(out.map(m => m.text), ['sticky-info', 'sticky-err']);
});

test('dismissMessage removes only the line with the given id (sticky siblings survive)', () => {
	const toast = line('toast', 'success', true);
	const err = line('boom', 'error', false);   // added after the toast, before its timer fires
	const list = [toast, err];
	const out = dismissMessage(list, toast.id);
	assert.deepEqual(out.map(m => m.text), ['boom']);
	// The concurrently-added sticky error is untouched.
	assert.equal(out.find(m => m.id === err.id)?.kind, 'error');
});

test('an error-kind line is non-transient and survives clearTransient', () => {
	const err = line('failed', 'error', false);
	assert.equal(err.transient, false);
	assert.deepEqual(clearTransient([err]).map(m => m.text), ['failed']);
});
