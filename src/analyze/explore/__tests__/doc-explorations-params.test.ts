/**
 * plans/exploration-based-context-build.md Phase 2. Unit tests for
 * the param-validation branches of the three new doc explorations.
 *
 * These tests intentionally exercise ONLY parsing / validation --
 * everything after that touches LMDB + Ollama and belongs in a live
 * test. We fire the runners with intentionally-bad params and assert
 * on the typed rejection so the failure surfaces before we spend a
 * retriever/LLM call on garbage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDocMention }              from '../doc-mention.js';
import { runDocDecisionTrace }        from '../doc-decision-trace.js';
import { runDocConstraintEnumerate }  from '../doc-constraint-enumerate.js';
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
// doc.mention -- subject required
// ---------------------------------------------------------------------------

test('doc.mention rejects empty params', async () => {
	await assert.rejects(
		() => runDocMention(mkExp('doc.mention', {}), CTX),
		/subject is required/,
	);
});

test('doc.mention rejects whitespace-only subject', async () => {
	await assert.rejects(
		() => runDocMention(mkExp('doc.mention', { subject: '   ' }), CTX),
		/subject is required/,
	);
});

test('doc.mention rejects non-string subject', async () => {
	await assert.rejects(
		() => runDocMention(mkExp('doc.mention', { subject: 42 }), CTX),
		/subject is required/,
	);
});

// ---------------------------------------------------------------------------
// doc.decision.trace -- topic required
// ---------------------------------------------------------------------------

test('doc.decision.trace rejects empty params', async () => {
	await assert.rejects(
		() => runDocDecisionTrace(mkExp('doc.decision.trace', {}), CTX),
		/topic is required/,
	);
});

test('doc.decision.trace rejects empty topic string', async () => {
	await assert.rejects(
		() => runDocDecisionTrace(mkExp('doc.decision.trace', { topic: '' }), CTX),
		/topic is required/,
	);
});

// ---------------------------------------------------------------------------
// doc.constraint.enumerate -- subject required
// ---------------------------------------------------------------------------

test('doc.constraint.enumerate rejects empty params', async () => {
	await assert.rejects(
		() => runDocConstraintEnumerate(mkExp('doc.constraint.enumerate', {}), CTX),
		/subject is required/,
	);
});

test('doc.constraint.enumerate rejects null subject', async () => {
	await assert.rejects(
		() => runDocConstraintEnumerate(mkExp('doc.constraint.enumerate', { subject: null }), CTX),
		/subject is required/,
	);
});
