/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story b94cf2c9 S001/t3 — the document-summary sweep yields to edits, skips
 * documents deleted after it began, classifies every result, reports its
 * progress and stops between documents on shutdown.
 *
 * Run: npx tsx --test src/indexer/__tests__/doc-summary-sweep.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDocSummarySweep, type DocSummarySweepDeps } from '../doc-summary-sweep.js';
import type { SummariseDocResult } from '../../analyze/summariser/index.js';
import type { Entity } from '../../shared/types.js';

const entity = (id: string): Entity => ({
	id, kind: 'section', name: id, language: 'markdown', repoId: 1, repo: '/r', file: '/r/a.md',
	startLine: 1, endLine: 1, body: id, embedding: [], indexedAt: '2026-10-17T00:00:00.000Z',
});

/** Deps over a scripted world; `events` records what ran, in order. */
function world(opts: {
	results?: Record<string, SummariseDocResult | 'throw'> | undefined;
	missing?: readonly string[] | undefined;
	edits?: string[] | undefined;
	stopAfterSummaries?: number | undefined;
}): { deps: DocSummarySweepDeps; events: string[]; progress: [number, number][]; edits: string[] } {
	const events: string[] = [];
	const progress: [number, number][] = [];
	const edits = [...(opts.edits ?? [])];
	let summaries = 0;
	const deps: DocSummarySweepDeps = {
		getEntity: async id => (opts.missing ?? []).includes(id) ? null : entity(id),
		summarise: async e => {
			events.push(`summarise:${e.id}`);
			summaries++;
			const r = opts.results?.[e.id] ?? { ok: true };
			if (r === 'throw') throw new Error(`boom ${e.id}`);
			return r;
		},
		takeEdit: () => { const id = edits.shift(); return id === undefined ? undefined : { entityId: id }; },
		runEdit: async id => { events.push(`edit:${id}`); },
		shouldStop: () => opts.stopAfterSummaries !== undefined && summaries >= opts.stopAfterSummaries,
		onProgress: (done, total) => { progress.push([done, total]); },
		waitForCodeIdle: async () => { events.push('wait'); },
	};
	return { deps, events, progress, edits };
}

test('every queued single-document job runs before each document, including jobs queued while the sweep runs', async () => {
	const w = world({ edits: ['x', 'y'] });
	const inner = w.deps.summarise;
	w.deps.summarise = async e => { const r = await inner(e); if (e.id === 'a') w.edits.push('z'); return r; };
	const counts = await runDocSummarySweep(['a', 'b'], w.deps);
	assert.deepEqual(w.events.filter(e => e !== 'wait'), ['edit:x', 'edit:y', 'summarise:a', 'edit:z', 'summarise:b']);
	assert.deepEqual(counts, { summarised: 2, skipped: 0, failed: 0, gone: 0, stopped: false });
});

test('a document deleted after the sweep began is counted as gone and not summarised, and a throwing document is counted as failed while the sweep continues', async () => {
	const w = world({ missing: ['b'], results: { c: 'throw' } });
	const counts = await runDocSummarySweep(['a', 'b', 'c', 'd'], w.deps);
	assert.deepEqual(w.events.filter(e => e !== 'wait'), ['summarise:a', 'summarise:c', 'summarise:d']);
	assert.deepEqual(counts, { summarised: 2, skipped: 0, failed: 1, gone: 1, stopped: false });
});

test('every result kind is classified as summarised, skipped, gone or failed', async () => {
	const results: Record<string, SummariseDocResult> = {
		new:       { ok: true },
		unchanged: { ok: true, skipped: 'unchanged' },
		notdoc:    { ok: false, skipped: 'not-a-doc' },
		empty:     { ok: false, skipped: 'body-empty' },
		deleted:   { ok: false, skipped: 'entity-gone' },
		rewritten: { ok: false, skipped: 'body-changed' },
		model:     { ok: false, errorCode: 'llm-unavailable', errorMessage: 'down' },
		write:     { ok: false, errorCode: 'persistence-failed', errorMessage: 'disk' },
	};
	const counts = await runDocSummarySweep(Object.keys(results), world({ results }).deps);
	assert.deepEqual(counts, { summarised: 1, skipped: 3, failed: 2, gone: 2, stopped: false });
});

test('progress is reported after each document, with the total', async () => {
	const w = world({ missing: ['b'], results: { c: 'throw' } });
	await runDocSummarySweep(['a', 'b', 'c'], w.deps);
	assert.deepEqual(w.progress, [[1, 3], [2, 3], [3, 3]]);
});

test('once shouldStop is true the sweep returns stopped after the summary in progress, also between single-document jobs', async () => {
	const w = world({ stopAfterSummaries: 1 });
	const counts = await runDocSummarySweep(['a', 'b', 'c'], w.deps);
	assert.deepEqual(w.events.filter(e => e !== 'wait'), ['summarise:a']);
	assert.deepEqual(counts, { summarised: 1, skipped: 0, failed: 0, gone: 0, stopped: true });

	let stop = false;
	const w2 = world({ edits: ['x', 'y'] });
	w2.deps.shouldStop = () => stop;
	w2.deps.runEdit = async id => { w2.events.push(`edit:${id}`); stop = true; };
	const counts2 = await runDocSummarySweep(['a'], w2.deps);
	assert.deepEqual(w2.events.filter(e => e !== 'wait'), ['edit:x'], 'stopped after the edit in progress');
	assert.equal(counts2.stopped, true);

	// Shutdown during the last (here the only) document.
	const w3 = world({ stopAfterSummaries: 1 });
	const counts3 = await runDocSummarySweep(['only'], w3.deps);
	assert.deepEqual(counts3, { summarised: 1, skipped: 0, failed: 0, gone: 0, stopped: true });
});

test('the sweep waits for code work before each single-document job and each document, runs an edit queued during the wait before the next document, and ends with stopped when shutdown comes during the wait', async () => {
	const w = world({ edits: ['x'] });
	await runDocSummarySweep(['a', 'b'], w.deps);
	assert.deepEqual(w.events, ['wait', 'edit:x', 'wait', 'summarise:a', 'wait', 'summarise:b'], 'a wait before every edit and every document');

	// An edit queued while the sweep is waiting runs before the next document.
	const w2 = world({});
	let waits = 0;
	w2.deps.waitForCodeIdle = async () => { waits++; if (waits === 2) w2.edits.push('late'); };
	await runDocSummarySweep(['a', 'b'], w2.deps);
	assert.deepEqual(w2.events.filter(e => e !== 'wait'), ['summarise:a', 'edit:late', 'summarise:b']);

	// Shutdown arriving during the wait.
	const w3 = world({});
	let stop = false;
	w3.deps.shouldStop = () => stop;
	w3.deps.waitForCodeIdle = async () => { stop = true; };
	const counts = await runDocSummarySweep(['a'], w3.deps);
	assert.deepEqual(counts, { summarised: 0, skipped: 0, failed: 0, gone: 0, stopped: true });
	assert.deepEqual(w3.events, []);
});
