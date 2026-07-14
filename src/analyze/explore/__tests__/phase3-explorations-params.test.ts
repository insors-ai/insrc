/**
 * plans/exploration-based-context-build.md Phase 3. Unit tests for
 * the param-validation branches of the three new code-side
 * explorations. Mirrors the Phase 2 doc-explorations pattern -- we
 * only exercise the rejection paths so the failure surfaces before
 * an LMDB / LLM call is spent on garbage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCapabilityReuseCheck } from '../capability-reuse-check.js';
import { runClassHierarchy }       from '../class-hierarchy.js';
import { runUsageExample }         from '../usage-example.js';
import type { Exploration, ExplorationRunnerContext } from '../types.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';

const CTX: ExplorationRunnerContext = {
	runId:        'test-run',
	repoPath:     '/tmp/does-not-exist',
	closureRepos: ['/tmp/does-not-exist'],
	readDep:      () => undefined,
	ignoreFilter: permissiveIgnoreFilter(),
};

function mkExp(type: Exploration['type'], params: Record<string, unknown>): Exploration {
	return {
		id:      'e1',
		type,
		purpose: 'test',
		params,
	};
}

// ---------------------------------------------------------------------------
// usage.example -- symbolName OR entityId required
// ---------------------------------------------------------------------------

test('usage.example rejects empty params', async () => {
	await assert.rejects(
		() => runUsageExample(mkExp('usage.example', {}), CTX),
		/symbolName or params\.entityId is required/,
	);
});

test('usage.example rejects blank symbolName + blank entityId', async () => {
	await assert.rejects(
		() => runUsageExample(mkExp('usage.example', { symbolName: '   ', entityId: '' }), CTX),
		/symbolName or params\.entityId is required/,
	);
});

test('usage.example rejects non-string symbolName', async () => {
	await assert.rejects(
		() => runUsageExample(mkExp('usage.example', { symbolName: 42 }), CTX),
		/symbolName or params\.entityId is required/,
	);
});

// ---------------------------------------------------------------------------
// class.hierarchy -- symbolName OR entityId required
// ---------------------------------------------------------------------------

test('class.hierarchy rejects empty params', async () => {
	await assert.rejects(
		() => runClassHierarchy(mkExp('class.hierarchy', {}), CTX),
		/symbolName or params\.entityId is required/,
	);
});

test('class.hierarchy rejects both fields empty-string', async () => {
	await assert.rejects(
		() => runClassHierarchy(mkExp('class.hierarchy', { symbolName: '', entityId: '' }), CTX),
		/symbolName or params\.entityId is required/,
	);
});

// ---------------------------------------------------------------------------
// capability.reuse-check -- capability required
// ---------------------------------------------------------------------------

test('capability.reuse-check rejects empty params', async () => {
	await assert.rejects(
		() => runCapabilityReuseCheck(mkExp('capability.reuse-check', {}), CTX),
		/capability is required/,
	);
});

test('capability.reuse-check rejects whitespace-only capability', async () => {
	await assert.rejects(
		() => runCapabilityReuseCheck(mkExp('capability.reuse-check', { capability: '   ' }), CTX),
		/capability is required/,
	);
});

test('capability.reuse-check rejects non-string capability', async () => {
	await assert.rejects(
		() => runCapabilityReuseCheck(mkExp('capability.reuse-check', { capability: null }), CTX),
		/capability is required/,
	);
});
