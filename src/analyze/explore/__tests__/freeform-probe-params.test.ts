/**
 * plans/exploration-based-context-build.md Phase 6. Unit tests for
 * freeform.probe param validation. The runner itself invokes the
 * target's legacy tool loop -- that path lives in a live test; here
 * we only exercise the reject branches.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runFreeformProbe } from '../freeform-probe.js';
import type { Exploration, ExplorationRunnerContext } from '../types.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';

const CTX: ExplorationRunnerContext = {
	runId:        'test-run',
	repoPath:     '/tmp/does-not-exist-phase6-root',
	closureRepos: ['/tmp/does-not-exist-phase6-root'],
	readDep:      () => undefined,
	ignoreFilter: permissiveIgnoreFilter(),
};

function mkExp(params: Record<string, unknown>): Exploration {
	return { id: 'e1', type: 'freeform.probe', purpose: 'test', params };
}

test('freeform.probe rejects empty params', async () => {
	await assert.rejects(
		() => runFreeformProbe(mkExp({}), CTX),
		/purpose is required/,
	);
});

test('freeform.probe rejects whitespace-only purpose', async () => {
	await assert.rejects(
		() => runFreeformProbe(mkExp({ purpose: '  ', shaperId: 'code' }), CTX),
		/purpose is required/,
	);
});

test('freeform.probe rejects missing shaperId', async () => {
	await assert.rejects(
		() => runFreeformProbe(mkExp({ purpose: 'x' }), CTX),
		/shaperId must be one of/,
	);
});

test('freeform.probe rejects unknown shaperId', async () => {
	await assert.rejects(
		() => runFreeformProbe(mkExp({ purpose: 'x', shaperId: 'classifier' }), CTX),
		/shaperId must be one of/,
	);
});

test('freeform.probe rejects non-string shaperId', async () => {
	await assert.rejects(
		() => runFreeformProbe(mkExp({ purpose: 'x', shaperId: 42 }), CTX),
		/shaperId must be one of/,
	);
});
