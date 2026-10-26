import './private-paths.js';
/**
 * Epic c2ba6fa6, Story s5, Task t4 -- a run whose context build fails on a
 * read of the last-indexed time, or on the lookups themselves, ends with
 * that cause's own code, never 'internal-error'.
 *
 * The run is hinted (no classifier model) on a sandboxed, indexed repo; the
 * context builder is a stand-in that fails the given way, so nothing here
 * reaches a model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import type { Entity } from '../../../shared/types.js';
import { ShaperIndexStateReadError, ShaperLookupFailedError } from '../../context/driver.js';
import type { RunShaper } from '../../context/types.js';
import { _setRunShaperForTest, runAnalyze } from '../driver.js';
import { purgeRunForTests, readRunRecord } from '../persistence.js';
import type { AnalyzeRunEvent } from '../types.js';

let sandbox: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-shaper-causes-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	repo = join(sandbox, 'app');
	mkdirSync(join(repo, 'src'), { recursive: true });
	writeFileSync(join(repo, 'src', 'a.ts'), 'export function fn() { return 1; }\n', 'utf8');
	await addRepo(null, { path: repo, name: repo, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	await upsertEntities(null, [{
		id: 'e-fixture', repo, file: `${repo}/src/a.ts`, kind: 'function', name: 'fn',
		language: 'typescript', startLine: 1, endLine: 1,
	} as unknown as Entity]);
});

test.afterEach(async () => {
	_setRunShaperForTest(undefined);
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

/** A context builder whose run build fails with `err`. */
function failingShaper(err: Error): () => RunShaper {
	return () => ({ buildRunBundle: async () => { throw err; } }) as unknown as RunShaper;
}

test('runAnalyze: index-state-read-failed and lookup-failed end with their own codes, not internal-error', async () => {
	const cases: ReadonlyArray<readonly [Error, string]> = [
		[new ShaperIndexStateReadError('MDB_BAD_TXN'), 'index-state-read-failed'],
		[new ShaperLookupFailedError('the graph store is closed'), 'lookup-failed'],
	];
	for (const [err, code] of cases) {
		const runId = `shaper-causes-${code}-${Math.floor(Math.random() * 1e9).toString(16)}`;
		_setRunShaperForTest(failingShaper(err));
		try {
			const events: AnalyzeRunEvent[] = [];
			const result = await runAnalyze(
				{ runId, userPrompt: 'how is this laid out', scopeRef: { kind: 'repo', value: repo }, targetHint: 'code', scopeHint: 'M' },
				{ onEvent: e => events.push(e) },
			);
			assert.equal(result.ok, false, code);
			if (result.ok) continue;
			assert.equal(result.error.code, code);
			assert.equal(result.error.message, err.message);
			assert.equal(readRunRecord(runId)?.error?.code, code, `${code}: the run record carries it`);
			assert.equal(events.filter(e => e.type === 'done').length, 1);
		} finally {
			purgeRunForTests(runId);
		}
	}
});
