/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the config write-path setter (config.write's core).
 *
 * The load-bearing case: a config key that CONTAINS dots (role ids like
 * "context.assemble", or byRepo absolute paths) must be written as a single
 * FLAT key when passed as a segment array — never split/mis-nested. A legacy
 * dot-string keeps splitting for the common dot-free case.
 *
 * Run: npx tsx --test src/config/__tests__/write-path.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toConfigSegments, setConfigAtPath, ConfigPathError } from '../write-path.js';

// ── toConfigSegments ────────────────────────────────────────────────────────

test('toConfigSegments: a dot-string splits on every dot (legacy)', () => {
	assert.deepEqual(toConfigSegments('models.analyze.coreFloor'), ['models', 'analyze', 'coreFloor']);
});

test('toConfigSegments: an array is used verbatim — a dotted element stays ONE segment', () => {
	assert.deepEqual(
		toConfigSegments(['models', 'analyze', 'roleTiers', 'context.assemble']),
		['models', 'analyze', 'roleTiers', 'context.assemble'],
	);
});

test('toConfigSegments: empty path / empty segment is rejected', () => {
	assert.throws(() => toConfigSegments(''), ConfigPathError);
	assert.throws(() => toConfigSegments('a..b'), ConfigPathError);
	assert.throws(() => toConfigSegments('models.'), ConfigPathError);
	assert.throws(() => toConfigSegments(['models', '']), ConfigPathError);
	assert.throws(() => toConfigSegments([]), ConfigPathError);
});

// ── setConfigAtPath: the fix ────────────────────────────────────────────────

test('setConfigAtPath: a segmented path with a DOTTED leaf writes a flat key (not nested)', () => {
	const cfg: Record<string, unknown> = {};
	setConfigAtPath(cfg, ['models', 'analyze', 'roleTiers', 'context.assemble'], 'core');
	assert.deepEqual(cfg, { models: { analyze: { roleTiers: { 'context.assemble': 'core' } } } });
	// the dotted id did NOT nest under `context`
	const roleTiers = (cfg as any).models.analyze.roleTiers;
	assert.equal(roleTiers['context.assemble'], 'core');
	assert.equal(roleTiers['context'], undefined);
});

test('setConfigAtPath: a byRepo path (dots AND slashes in one segment) stays flat', () => {
	const cfg: Record<string, unknown> = {};
	setConfigAtPath(cfg, ['models', 'analyze', 'byRepo', '/Users/x/my.repo', 'shaperModel'], 'sonnet');
	assert.equal((cfg as any).models.analyze.byRepo['/Users/x/my.repo'].shaperModel, 'sonnet');
});

test('setConfigAtPath: legacy dot-string still nests for dot-free keys', () => {
	const cfg: Record<string, unknown> = {};
	setConfigAtPath(cfg, 'models.analyze.tiers.core.model', 'opus');
	assert.deepEqual(cfg, { models: { analyze: { tiers: { core: { model: 'opus' } } } } });
});

test('setConfigAtPath: overwrites an existing leaf, preserves siblings', () => {
	const cfg: Record<string, unknown> = { models: { analyze: { coreFloor: 'mid', shaperModel: 'x' } } };
	setConfigAtPath(cfg, 'models.analyze.coreFloor', 'core');
	assert.deepEqual(cfg, { models: { analyze: { coreFloor: 'core', shaperModel: 'x' } } });
});

test('setConfigAtPath: a non-object intermediate (scalar or array) is replaced with an object', () => {
	const scalar: Record<string, unknown> = { models: 'oops' };
	setConfigAtPath(scalar, ['models', 'analyze', 'coreFloor'], 'core');
	assert.deepEqual(scalar, { models: { analyze: { coreFloor: 'core' } } });

	const arr: Record<string, unknown> = { models: { analyze: [] } };
	setConfigAtPath(arr, ['models', 'analyze', 'coreFloor'], 'mid');
	assert.deepEqual(arr, { models: { analyze: { coreFloor: 'mid' } } });
});

test('setConfigAtPath: a single-segment path sets a top-level key', () => {
	const cfg: Record<string, unknown> = {};
	setConfigAtPath(cfg, 'logLevel', 'debug');
	assert.deepEqual(cfg, { logLevel: 'debug' });
});

test('setConfigAtPath: an invalid path throws before mutating', () => {
	const cfg: Record<string, unknown> = { a: 1 };
	assert.throws(() => setConfigAtPath(cfg, '', 'x'), ConfigPathError);
	assert.deepEqual(cfg, { a: 1 });
});
