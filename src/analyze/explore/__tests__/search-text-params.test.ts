/**
 * plans/exploration-based-context-build.md Phase 3.1. Unit tests for
 * search.text param parsing + scope-boundary enforcement. Same
 * pattern as the other exploration param tests -- exercise only the
 * rejection paths so bad params fail before a filesystem walk.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runSearchText } from '../search-text.js';
import type { Exploration, ExplorationRunnerContext } from '../types.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';

const CTX: ExplorationRunnerContext = {
	runId:        'test-run',
	repoPath:     '/tmp/does-not-exist-scope-root',
	closureRepos: ['/tmp/does-not-exist-scope-root'],
	readDep:      () => undefined,
	ignoreFilter: permissiveIgnoreFilter(),
};

function mkExp(params: Record<string, unknown>): Exploration {
	return { id: 'e1', type: 'search.text', purpose: 'test', params };
}

// ---------------------------------------------------------------------------
// pattern required
// ---------------------------------------------------------------------------

test('search.text rejects empty params', async () => {
	await assert.rejects(
		() => runSearchText(mkExp({}), CTX),
		/pattern is required/,
	);
});

test('search.text rejects whitespace-only pattern', async () => {
	await assert.rejects(
		() => runSearchText(mkExp({ pattern: '   ' }), CTX),
		/pattern is required/,
	);
});

test('search.text rejects non-string pattern', async () => {
	await assert.rejects(
		() => runSearchText(mkExp({ pattern: 42 }), CTX),
		/pattern is required/,
	);
});

// ---------------------------------------------------------------------------
// scope boundary: absolute path must be inside ctx.repoPath
// ---------------------------------------------------------------------------

test('search.text rejects absolute path outside repoPath', async () => {
	await assert.rejects(
		() => runSearchText(mkExp({ pattern: 'anything', path: '/etc/passwd' }), CTX),
		/not inside repoPath/,
	);
});

test('search.text rejects sibling-scoped absolute path', async () => {
	await assert.rejects(
		() => runSearchText(mkExp({
			pattern: 'anything',
			path:    '/tmp/does-not-exist-scope-root-evil-twin/lib',
		}), CTX),
		/not inside repoPath/,
	);
});
