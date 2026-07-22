/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the per-repo shaper-override resolvers in
 * `src/config/analyze.ts` — the HIGHEST-priority signal in the client/shaper
 * resolution chain (per-repo > global config > per-run caller > ollama).
 *
 * The resolvers read `~/.insrc/config.json` FRESH (never the cached global);
 * each test writes a temp config file and passes its path via the resolver's
 * test-seam `configPath` argument, so nothing touches the real user config.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveRepoShaperProvider, resolveRepoShaperModel } from '../analyze.js';

const REPO = '/abs/path/to/repo';

/** Write a config.json into a fresh temp dir; return its path (+ dir for cleanup). */
function writeConfig(obj: unknown): { path: string; dir: string } {
	const dir  = mkdtempSync(join(tmpdir(), 'insrc-cfg-'));
	const path = join(dir, 'config.json');
	writeFileSync(path, JSON.stringify(obj), 'utf8');
	return { path, dir };
}

test('resolveRepoShaperProvider returns the pinned kind for a byRepo entry', () => {
	const { path, dir } = writeConfig({
		models: { analyze: { byRepo: { [REPO]: { shaperProvider: 'cli-claude' } } } },
	});
	try {
		assert.equal(resolveRepoShaperProvider(REPO, path), 'cli-claude');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('resolveRepoShaperProvider returns undefined when the repo has no entry', () => {
	const { path, dir } = writeConfig({
		models: { analyze: { byRepo: { '/other/repo': { shaperProvider: 'cli-codex' } } } },
	});
	try {
		assert.equal(resolveRepoShaperProvider(REPO, path), undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('resolveRepoShaperProvider returns undefined when byRepo section is absent', () => {
	const { path, dir } = writeConfig({ models: { analyze: { shaperProvider: 'cli-codex' } } });
	try {
		assert.equal(resolveRepoShaperProvider(REPO, path), undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('resolveRepoShaperProvider ignores an invalid pinned kind', () => {
	const { path, dir } = writeConfig({
		models: { analyze: { byRepo: { [REPO]: { shaperProvider: 'gpt-9000' } } } },
	});
	try {
		assert.equal(resolveRepoShaperProvider(REPO, path), undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('resolveRepoShaperProvider tolerates a missing config file', () => {
	assert.equal(resolveRepoShaperProvider(REPO, join(tmpdir(), 'insrc-nope-does-not-exist.json')), undefined);
});

test('resolveRepoShaperModel returns the pinned model, else undefined', () => {
	const { path, dir } = writeConfig({
		models: { analyze: { byRepo: { [REPO]: { shaperProvider: 'cli-claude', shaperModel: 'claude-haiku-4-5' } } } },
	});
	try {
		assert.equal(resolveRepoShaperModel(REPO, path), 'claude-haiku-4-5');
		assert.equal(resolveRepoShaperModel('/other/repo', path), undefined);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
