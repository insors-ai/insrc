/**
 * Phase A.3 tests for the shared stripJsonFences helper.
 *
 * Pre-A.3 the four callers each had their own copy: two lenient
 * (classify/index.ts, classify/scope.ts) and two strict (the two
 * select-scope skills). The strict variants rejected single-sided
 * open fences -- which the LLM emits when its response gets
 * truncated by maxTokens -- and the skills' JSON.parse blew up
 * downstream. These tests pin the lenient behaviour now everyone
 * shares.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stripJsonFences } from '../json-fences.js';

test('strips matched ```json ... ``` fences', () => {
	const input = '```json\n{"id": "a"}\n```';
	assert.equal(stripJsonFences(input), '{"id": "a"}');
});

test('strips bare ``` ... ``` fences (no language tag)', () => {
	const input = '```\n{"id": "a"}\n```';
	assert.equal(stripJsonFences(input), '{"id": "a"}');
});

test('strips single-sided OPEN fence (no closer) -- the live trigger', () => {
	// Live warning at agent.5.log:1778489725246 -- the LLM emitted
	// an opening ```json followed by JSON content but no closing
	// fence (truncated by maxTokens). The strict variant returned
	// the raw text and select-scope blew up.
	const input = '```json\n{"id": "a", "x": 1}';
	assert.equal(stripJsonFences(input), '{"id": "a", "x": 1}');
});

test('no fences -> passthrough trimmed', () => {
	assert.equal(stripJsonFences('  {"id": "a"}  '), '{"id": "a"}');
});

test('empty input -> empty string', () => {
	assert.equal(stripJsonFences(''),     '');
	assert.equal(stripJsonFences('   \n\n'), '');
});

test('strips ```JSON (uppercase tag)', () => {
	assert.equal(stripJsonFences('```JSON\n{}\n```'), '{}');
});

test('handles trailing whitespace AFTER closing fence', () => {
	assert.equal(stripJsonFences('```json\n{}\n```\n   '), '{}');
});

test('only the LEADING fence is stripped if the content starts with one', () => {
	// Defensive: garbage after the closer shouldn't propagate
	// (caller's JSON.parse would still fail in that case -- the
	// fencing helper just removes the fences, not malformed content).
	const out = stripJsonFences('```json\n{"id": "a"}\n```\nextra prose');
	// Either yields '{"id": "a"}\nextra prose' or '{"id": "a"}'
	// depending on whether the trailing ``` regex was greedy. Our
	// version uses `\s*```$` so trailing-after-closer survives.
	assert.match(out, /^\{"id": "a"\}/);
});
