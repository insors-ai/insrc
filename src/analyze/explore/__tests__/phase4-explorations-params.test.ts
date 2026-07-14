/**
 * plans/exploration-based-context-build.md Phase 4. Unit tests for
 * param-validation branches of the 4 new explorations. Mirrors the
 * Phase 2 + 3 pattern -- rejection paths only, so a bad param
 * surfaces before an LMDB / grep / LLM call gets spent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runConfigTrace }        from '../config-trace.js';
import { runConventionDetect }   from '../convention-detect.js';
import { runDataModelTrace }     from '../data-model-trace.js';
import { runTestLocate }         from '../test-locate.js';
import type { Exploration, ExplorationRunnerContext } from '../types.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';

const CTX: ExplorationRunnerContext = {
	runId:        'test-run',
	repoPath:     '/tmp/does-not-exist-phase4-root',
	closureRepos: ['/tmp/does-not-exist-phase4-root'],
	readDep:      () => undefined,
	ignoreFilter: permissiveIgnoreFilter(),
};

function mkExp(type: Exploration['type'], params: Record<string, unknown>): Exploration {
	return { id: 'e1', type, purpose: 'test', params };
}

// ---------------------------------------------------------------------------
// convention.detect
// ---------------------------------------------------------------------------

test('convention.detect rejects empty params', async () => {
	await assert.rejects(
		() => runConventionDetect(mkExp('convention.detect', {}), CTX),
		/path is required/,
	);
});

test('convention.detect rejects whitespace-only path', async () => {
	await assert.rejects(
		() => runConventionDetect(mkExp('convention.detect', { path: '   ' }), CTX),
		/path is required/,
	);
});

// ---------------------------------------------------------------------------
// test.locate
// ---------------------------------------------------------------------------

test('test.locate rejects empty params', async () => {
	await assert.rejects(
		() => runTestLocate(mkExp('test.locate', {}), CTX),
		/subject is required/,
	);
});

test('test.locate rejects non-string subject', async () => {
	await assert.rejects(
		() => runTestLocate(mkExp('test.locate', { subject: 42 }), CTX),
		/subject is required/,
	);
});

// ---------------------------------------------------------------------------
// config.trace
// ---------------------------------------------------------------------------

test('config.trace rejects empty params', async () => {
	await assert.rejects(
		() => runConfigTrace(mkExp('config.trace', {}), CTX),
		/key is required/,
	);
});

test('config.trace rejects path outside repoPath', async () => {
	await assert.rejects(
		() => runConfigTrace(mkExp('config.trace', {
			key:  'ANY_KEY',
			path: '/etc/passwd',
		}), CTX),
		/not inside repoPath/,
	);
});

// ---------------------------------------------------------------------------
// data-model.trace
// ---------------------------------------------------------------------------

test('data-model.trace rejects empty params', async () => {
	await assert.rejects(
		() => runDataModelTrace(mkExp('data-model.trace', {}), CTX),
		/entityName is required/,
	);
});

test('data-model.trace rejects whitespace-only entityName', async () => {
	await assert.rejects(
		() => runDataModelTrace(mkExp('data-model.trace', { entityName: '  ' }), CTX),
		/entityName is required/,
	);
});
