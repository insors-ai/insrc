/**
 * The scope line of an answer (Story 65b643840a294422/s1, task t13): the
 * report states the scope the analysis ran on and who named it; how the
 * lookups chose their centre is stated only when an executed concept.resolve
 * result establishes it. Both tools render the same line for the same intent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildCompleteness, renderReportHead, renderScopeLine } from '../../completeness.js';
import type { ExecutedExploration, Exploration, ExplorationOutput } from '../types.js';
import { reportFromLookups } from '../answer-report.js';
import type { AnalyzeScopeRef } from '../../../shared/analyze-types.js';

const REPO = '/work/app';
const WORKSPACE: AnalyzeScopeRef = { kind: 'workspace', value: REPO };
const WHOLE = buildCompleteness({ returned: 1, basis: 'graph' });

const executed = (type: string, output: Record<string, unknown>): ExecutedExploration =>
	({ exploration: { id: 'e1', type, purpose: 'p', params: {} } as Exploration, output: { type, completeness: WHOLE, ...output } as unknown as ExplorationOutput, cached: false, elapsedMs: 0 });

const ranked = executed('concept.resolve', { query: 'q', hits: [{ kind: 'dir', path: `${REPO}/src`, name: 'src', score: 1, diagnostics: {} }], anchor: { path: `${REPO}/src`, kind: 'dir', source: 'ranked' } });
const named = executed('concept.resolve', { query: 'q', hits: [], anchor: { path: `${REPO}/src/pay`, kind: 'dir', source: 'named-scope' } });
const docsOnly = executed('doc.mention', { subject: 'q', hits: [] });

const lineFor = (results: ExecutedExploration[], ref: AnalyzeScopeRef, source: 'request' | 'prompt' | undefined): string =>
	renderScopeLine(reportFromLookups(results, undefined, { ref, source }).scope!);

test('the scope line for request, prompt and not-recorded sources, the same scopeRef with a different source renders differently, a prompt-only docs analysis is not text-matched while a ranked concept.resolve result is', () => {
	const asked  = lineFor([ranked], WORKSPACE, 'request');
	const prompt = lineFor([ranked], WORKSPACE, 'prompt');
	const old    = lineFor([ranked], WORKSPACE, undefined);
	assert.match(asked, /^Scope: workspace \/work\/app, named by the request\./);
	assert.match(prompt, /^Scope: workspace \/work\/app, the whole repository by default: the caller named no scope\./);
	assert.match(old, /^Scope: workspace \/work\/app; whether the caller named it was not recorded\./);
	assert.equal(new Set([asked, prompt, old]).size, 3, 'a structured workspace request, a prompt-only call and an older payload all differ');

	// the anchor sentence comes from an executed concept.resolve result and nothing else
	for (const line of [asked, prompt, old]) assert.match(line, /centred on the best text match found over that scope/);
	const docs = lineFor([docsOnly], WORKSPACE, 'prompt');
	assert.doesNotMatch(docs, /text match|centred/, 'a prompt-only documents analysis is not described as text-matched');
	assert.equal(lineFor([], WORKSPACE, 'prompt').includes('centred'), false, 'no lookups, no claim');
	assert.match(lineFor([named], { kind: 'module', value: `${REPO}/src/pay` }, 'request'), /^Scope: module \/work\/app\/src\/pay, named by the request\. The lookups centred on that scope itself\.$/);

	// the report carries the fields and the head renders the line under the others
	const report = reportFromLookups([ranked], undefined, { ref: WORKSPACE, source: 'prompt' });
	assert.deepEqual(report.scope, { kind: 'workspace', value: REPO, named: 'prompt', anchor: 'ranked' });
	assert.deepEqual(renderReportHead(report).split('\n'), ['Complete.', prompt]);
	// a report built without a scope is exactly the report of the lookups
	assert.equal(reportFromLookups([ranked]).scope, undefined);
	assert.equal(renderReportHead(reportFromLookups([ranked])), 'Complete.');
});
