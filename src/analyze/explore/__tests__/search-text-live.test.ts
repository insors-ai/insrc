/**
 * A live text search is as large as an independent search of the same pattern
 * (LLD-b9d5c5c40df5a574-s4, task t14).
 *
 * Gated: INSRC_LIVE_TESTS=1. It reads this repository's own files with the real
 * search backend (ripgrep when installed, the Node scan otherwise) and compares
 * the count with `grep`, which shares none of its code.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { savedAnalysisExecution } from '../../connection-access.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import { runSearchText } from '../search-text.js';
import type { Exploration, ExplorationRunnerContext } from '../types.js';

const LIVE = process.env['INSRC_LIVE_TESTS'] === '1';

test('a live search.text over this repository returns the same count as an independent search of the same pattern', { skip: LIVE ? false : 'INSRC_LIVE_TESTS=1 is not set' }, async () => {
	const repo = process.cwd();
	const pattern = 'EXPLORATION_CACHE_VERSION';
	const exp: Exploration = { id: 'e1', type: 'search.text', purpose: 'live count', params: { pattern, path: 'src' } };
	const ctx = {
		connectionExecution: savedAnalysisExecution(repo),
		runId: 'live-search', repoPath: repo, closureRepos: [repo],
		readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(repo),
	} as ExplorationRunnerContext;

	const out = await runSearchText(exp, ctx);
	assert.equal(out.completeness.limited, undefined, 'no limit is reached');

	// Independent: grep counts matching lines of text files under src (-I skips binaries), as the search does.
	const { stdout } = await promisify(execFile)('grep', ['-rnIF', '--exclude-dir=node_modules', '--exclude-dir=.git', pattern, join(repo, 'src')], { maxBuffer: 64 * 1024 * 1024 }).catch(e => ({ stdout: String((e as { stdout?: string }).stdout ?? '') }));
	const expected = stdout.split('\n').filter(l => l.length > 0).length;
	assert.ok(expected > 3, `the pattern occurs ${expected} times`);
	assert.equal(out.hits.length, expected, `search.text found ${out.hits.length}, grep found ${expected}`);
});
