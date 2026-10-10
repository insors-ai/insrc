/**
 * A run that dies says so (Story s7, task t12).
 *
 * runAnalyze counts itself live from before its first read of a run record
 * until it returns or throws, and guards everything from that read onward: an
 * error no stage catches is written to the run record as failed at the stage
 * reached, with 'internal-error', and returned.
 *
 * The run-level tests use a sandboxed graph store and a request with a stated
 * kind of source and size, so nothing here reaches a model: such a run passes
 * classification and stops at the context builder's indexed check.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConnections } from '../../../daemon/db/config.js';
import { findEntitiesByFile, listEntitiesForRepo, upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo, listRepos } from '../../../db/repos.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { ClassifiedIntent } from '../../../shared/analyze-types.js';
import type { Entity, LLMProvider } from '../../../shared/types.js';
import type { AnswerReport } from '../../completeness.js';
import { runWithRoutingContext } from '../../context/shaper-provider.js';
import { _setMeasureDepsForTest } from '../../measure.js';
import type { RoutingSeamContext } from '../../context/shaper-provider.js';
import { runAnalyze } from '../driver.js';
import { isRunLive } from '../index.js';
import { purgeRunForTests, readRunRecord, runRecordPathFor, writeRunRecord } from '../persistence.js';
import type { AnalyzeRunEvent, RunAnalyzeArgs, RunRecord } from '../types.js';

let sandbox: string;
let dirPath: string;
const REGISTERED = '/registered/elsewhere';

test.beforeEach(async () => {
	await closeGraphStore();
	sandbox = mkdtempSync(join(tmpdir(), 'analyze-live-runs-'));
	setGraphStorePath(join(sandbox, 'graph.lmdb'));
	dirPath = join(sandbox, 'proj');
	mkdirSync(dirPath, { recursive: true });
	writeFileSync(join(dirPath, 'a.ts'), 'export const a = 1;\n', 'utf8');
	// One registered, indexed repo that does NOT contain the sandbox: the
	// registry is not pristine, so the code source's indexed check is live.
	await addRepo(null, { path: REGISTERED, name: REGISTERED, addedAt: '2026-01-01T00:00:00.000Z', status: 'ready' });
	const fixtureFile = `${REGISTERED}/index.ts`;
	await upsertEntities(null, [{
		id: makeEntityId(REGISTERED, fixtureFile, 'function', 'fn'), repo: REGISTERED, file: fixtureFile, kind: 'function', name: 'fn',
		language: 'typescript', startLine: 1, endLine: 3,
	} as unknown as Entity]);
});

test.afterEach(async () => {
	_setMeasureDepsForTest(undefined);
	await closeGraphStore();
	rmSync(sandbox, { recursive: true, force: true });
});

const uniqueId = (tag: string): string => `live-runs-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`;

/** A request with a stated kind of source and size: no model is called for it. */
function hinted(runId: string, extra: Partial<RunAnalyzeArgs> = {}): RunAnalyzeArgs {
	return { runId, userPrompt: 'what does this do', scopeRef: { kind: 'repo', value: dirPath }, targetHint: 'code', scopeHint: 'M', ...extra };
}

/** A signal whose `aborted` cannot be read at its n-th reading: an error raised inside the run, where no stage catches it. */
function signalFailingAt(n: number): AbortSignal {
	let reads = 0;
	return { get aborted(): boolean { reads += 1; if (reads === n) throw new Error(`the signal could not be read (reading ${n})`); return false; } } as unknown as AbortSignal;
}

test("an uncaught error gives a failed record at the stage reached and a returned failure, 'done' fires once and the run is no longer live (mutation: remove the handler)", async () => {
	// --- inside the plan stage: the second reading of the signal is the plan stage's ---
	const id = uniqueId('uncaught-plan');
	try {
		const events: AnalyzeRunEvent[] = [];
		const liveAtDone: boolean[] = [];
		let createdAtFirst: string | undefined;
		const result = await runAnalyze(hinted(id), {
			signal: signalFailingAt(2),
			onEvent: e => {
				events.push(e);
				if (createdAtFirst === undefined) createdAtFirst = readRunRecord(id)?.createdAt;
				if (e.type === 'done') liveAtDone.push(isRunLive(id));
			},
		});
		// Returned, not thrown: 'internal-error' at the stage that was running, with the error's message.
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.deepEqual([result.stage, result.error.code, result.error.message], ['plan', 'internal-error', 'the signal could not be read (reading 2)']);
		assert.equal(result.intent?.target, 'code', 'the intent the run had reached goes with the failure');
		// The record on disk says the same; it is not left in progress.
		const record = readRunRecord(id);
		assert.deepEqual([record?.status, record?.stage, record?.error?.code, record?.error?.message], ['failed', 'plan', 'internal-error', 'the signal could not be read (reading 2)']);
		assert.equal(record?.intent?.target, 'code');
		// It is the run's own record, marked failed: the one it had last written, not a new one.
		assert.ok(createdAtFirst !== undefined);
		assert.equal(record?.createdAt, createdAtFirst);
		assert.equal(record?.userPrompt, 'what does this do');
		// The run had classified and had not started planning.
		assert.ok(events.some(e => e.type === 'classified'));
		assert.ok(!events.some(e => e.type === 'stage-started' && e.stage === 'plan'));
		// 'done' fired once, with the returned result, while the run was still live; it is not live now.
		const done = events.filter(e => e.type === 'done');
		assert.equal(done.length, 1);
		assert.deepEqual(done[0], { type: 'done', result });
		assert.deepEqual(liveAtDone, [true]);
		assert.equal(isRunLive(id), false);
	} finally {
		purgeRunForTests(id);
	}

	// --- before any stage has started: the first reading of the signal comes before 'classify' starts ---
	const early = uniqueId('uncaught-early');
	try {
		const events: AnalyzeRunEvent[] = [];
		const result = await runAnalyze(hinted(early), { signal: signalFailingAt(1), onEvent: e => { events.push(e); } });
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.deepEqual([result.stage, result.error.code], ['classify', 'internal-error']);
		assert.equal(result.intent, undefined);
		assert.deepEqual(events.map(e => e.type), ['done'], 'no stage had started');
		const record = readRunRecord(early);
		assert.deepEqual([record?.status, record?.stage, record?.error?.code], ['failed', 'classify', 'internal-error']);
		assert.equal(isRunLive(early), false);
	} finally {
		purgeRunForTests(early);
	}

	// --- before the run's first record was written: the handler writes the failed record itself ---
	const first = uniqueId('uncaught-first');
	try {
		let reads = 0;
		const args = {
			...hinted(first),
			// The request's prompt cannot be read the first time it is asked for.
			get userPrompt(): string { reads += 1; if (reads === 1) throw new Error('the request could not be read'); return 'what does this do'; },
		} as RunAnalyzeArgs;
		assert.equal(readRunRecord(first), null);
		const result = await runAnalyze(args);
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.deepEqual([result.stage, result.error.code, result.error.message], ['classify', 'internal-error', 'the request could not be read']);
		const record = readRunRecord(first);
		assert.deepEqual([record?.runId, record?.status, record?.stage, record?.error?.code], [first, 'failed', 'classify', 'internal-error']);
		assert.equal(isRunLive(first), false);
	} finally {
		purgeRunForTests(first);
	}
});

test('a run is live from its first read of a record until it returns, and with two runs under one id until the second returns (mutation: hold a set of ids instead of a count)', async () => {
	const id = uniqueId('two-runs');
	const other = uniqueId('other');

	/** A run held where it measures its request until `release` is called. */
	function heldRun() {
		let release!: () => void;
		let entered!: () => void;
		const gate = new Promise<void>(r => { release = r; });
		const inside = new Promise<void>(r => { entered = r; });
		// The run is held where it measures its request: at the first read of the registry by the measuring pass.
		// (No model is called before the run context is built, so there is no model call to hold it in.)
		let held = false;
		_setMeasureDepsForTest({ scope: {
			listRepos:           async () => { if (!held) { held = true; entered(); await gate; } return listRepos(null); },
			findEntitiesByFile:  file => findEntitiesByFile(null, file),
			listEntitiesForRepo: repo => listEntitiesForRepo(null, repo),
			loadConnections,
		} });
		const model = { completeStructured: async () => { throw new Error('no model is called by a run that ends at the indexed check'); } } as unknown as LLMProvider;
		const routing = { router: { resolveProviderForRole: () => ({ provider: model }) } } as unknown as RoutingSeamContext;
		// What the run saw when it first read its request, which is before it reads any record.
		const atFirstRead: Array<{ live: boolean; recordOnDisk: boolean }> = [];
		const base = hinted(id);
		const args = {
			runId: id, scopeRef: base.scopeRef, targetHint: 'code',
			get userPrompt(): string {
				if (atFirstRead.length === 0) atFirstRead.push({ live: isRunLive(id), recordOnDisk: readRunRecord(id) !== null });
				return 'what does this do';
			},
		} as RunAnalyzeArgs;
		const liveAtDone: boolean[] = [];
		const promise = runWithRoutingContext(routing, () => runAnalyze(args, { onEvent: e => { if (e.type === 'done') liveAtDone.push(isRunLive(id)); } }));
		return { promise, inside, release, atFirstRead, liveAtDone };
	}

	try {
		assert.equal(isRunLive(id), false, 'not live before it starts');

		const a = heldRun();
		// Live already when the run first reads its request, and no record exists yet:
		// the count is raised before the first read of a record.
		assert.deepEqual(a.atFirstRead, [{ live: true, recordOnDisk: false }]);
		await a.inside;
		assert.equal(isRunLive(id), true);
		assert.equal(readRunRecord(id)?.status, 'in-progress');
		assert.equal(isRunLive(other), false, 'another id is not live');

		// A second run under the same id, while the first is still going.
		const b = heldRun();
		assert.deepEqual(b.atFirstRead, [{ live: true, recordOnDisk: true }]);
		await b.inside;
		assert.equal(isRunLive(id), true);

		// The first returns: the id is STILL live, because the second is still running.
		a.release();
		const ra = await a.promise;
		assert.equal(ra.ok, false, 'it ends at the indexed check, a failure the plan stage knows');
		assert.equal(isRunLive(id), true, 'the second run is still going');
		assert.deepEqual(a.liveAtDone, [true]);

		// The second returns: now it is not.
		b.release();
		await b.promise;
		assert.deepEqual(b.liveAtDone, [true]);
		assert.equal(isRunLive(id), false);

		// A third, after both: live again while it runs, and not after.
		const c = heldRun();
		await c.inside;
		assert.equal(isRunLive(id), true);
		c.release();
		await c.promise;
		assert.equal(isRunLive(id), false);
	} finally {
		purgeRunForTests(id);
	}

	// A run that THROWS inside is not live afterwards either.
	const thrown = uniqueId('thrown');
	try {
		await runAnalyze(hinted(thrown), { signal: signalFailingAt(2) });
		assert.equal(isRunLive(thrown), false);
	} finally {
		purgeRunForTests(thrown);
	}
});

test("with a run record that cannot be written the handler still returns 'internal-error' and fires 'done' once (mutation: let the write's error escape)", async () => {
	const id = uniqueId('unwritable');
	try {
		// A directory stands where the run record's file goes: no record can be written.
		const path = runRecordPathFor(id);
		mkdirSync(path, { recursive: true });

		const events: AnalyzeRunEvent[] = [];
		const result = await runAnalyze(hinted(id), { onEvent: e => { events.push(e); } });

		// The run's first write failed, which no stage catches; the handler's own write failed too.
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.deepEqual([result.stage, result.error.code], ['classify', 'internal-error']);
		assert.match(result.error.message, /EISDIR|directory/i, "the first error's message, not the handler's");
		assert.deepEqual(events.map(e => e.type), ['done']);
		assert.deepEqual(events[0], { type: 'done', result });
		// Nothing was written, and the run is no longer live.
		assert.ok(statSync(path).isDirectory());
		assert.equal(readRunRecord(id), null);
		assert.equal(isRunLive(id), false);
	} finally {
		purgeRunForTests(id);
	}
});

test('a completed run asked for again returns its stored result and report; a record left in progress is replaced by the new run\'s first record, with no abandoned rewrite', async () => {
	const INTENT: ClassifiedIntent = { target: 'code', scope: 'XS', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'stored' };
	const FINAL = { summary: 'Complete.\n\nthe stored summary', findings: [] };
	const REPORT: AnswerReport = { completeness: { complete: true, incomplete: [], failed: [] } };
	const stored = (runId: string, extra: Partial<RunRecord>): RunRecord => ({
		runId, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:05.000Z',
		userPrompt: 'the earlier request', initialScopeRef: { kind: 'repo', value: '/r' },
		stage: 'done', status: 'ok', intent: INTENT, tasksCompleted: 2, tasksFailed: [], ...extra,
	});

	// --- a completed run: its stored result and report, and the record is left as it was ---
	const done = uniqueId('completed');
	try {
		const record = stored(done, { finalReport: FINAL, report: REPORT });
		writeRunRecord(record);
		const events: AnalyzeRunEvent[] = [];
		const result = await runAnalyze(hinted(done), { onEvent: e => { events.push(e); } });
		assert.deepEqual(result, {
			ok: true, runId: done, intent: INTENT, finalReport: FINAL, tasksCompleted: 2, tasksFailed: [], durationMs: 0, report: REPORT,
		});
		assert.deepEqual(events, [{ type: 'done', result }], 'no stage ran');
		assert.deepEqual(readRunRecord(done), record);
		assert.equal(isRunLive(done), false);
	} finally {
		purgeRunForTests(done);
	}

	// --- a record left 'in-progress' by a run that died: the new run's first record replaces it ---
	const left = uniqueId('left-in-progress');
	try {
		writeRunRecord(stored(left, { stage: 'execute', status: 'in-progress' }));
		assert.equal(isRunLive(left), false, 'no run is going under this id');

		// The record on disk at each event of the new run.
		const seen: Array<{ event: string; status: string | undefined; stage: string | undefined; prompt: string | undefined; code: string | undefined; createdAt: string | undefined }> = [];
		const result = await runAnalyze(hinted(left), {
			onEvent: e => {
				const r = readRunRecord(left);
				seen.push({ event: e.type, status: r?.status, stage: r?.stage, prompt: r?.userPrompt, code: r?.error?.code, createdAt: r?.createdAt });
			},
		});
		// At the run's first event the record is already the new run's first record:
		// its own request, in progress at 'classify', a new creation time, and no error.
		const firstSeen = seen[0]!;
		assert.deepEqual([firstSeen.event, firstSeen.status, firstSeen.stage, firstSeen.prompt, firstSeen.code],
			['stage-started', 'in-progress', 'classify', 'what does this do', undefined]);
		assert.notEqual(firstSeen.createdAt, '2026-10-08T00:00:00.000Z');
		// The old record was never rewritten as failed or abandoned on the way: until the
		// new run's own end, every record seen is the new run's, in progress and without an error.
		const beforeEnd = seen.filter(s => s.event !== 'done');
		assert.ok(beforeEnd.length >= 2);
		assert.ok(beforeEnd.every(s => s.status === 'in-progress' && s.code === undefined && s.prompt === 'what does this do' && s.createdAt === firstSeen.createdAt),
			JSON.stringify(beforeEnd));
		// The stored intent of the dead run is not carried into the new record.
		assert.equal(result.ok, false);
		if (result.ok) return;
		// The new run ends as it would have with no record there: at the indexed check.
		assert.deepEqual([result.stage, result.error.code], ['plan', 'scope-not-indexed']);
		const final = readRunRecord(left);
		assert.deepEqual([final?.status, final?.stage, final?.error?.code, final?.userPrompt], ['failed', 'plan', 'scope-not-indexed', 'what does this do']);
		assert.equal(isRunLive(left), false);
	} finally {
		purgeRunForTests(left);
	}
});

test("the handler of an uncaught error leaves a record that already says how the run ended, and the record of another run still going under the same id", async () => {
	// --- the error is raised AFTER the run wrote its own end ---
	// The run ends at the indexed check and writes its record as failed with that
	// cause. Its event subscriber then cannot be read, once: an error nothing catches.
	const ended = uniqueId('after-the-end');
	try {
		let thrown = false;
		const events: AnalyzeRunEvent[] = [];
		const opts = {
			get onEvent(): ((e: AnalyzeRunEvent) => void) | undefined {
				if (!thrown && readRunRecord(ended)?.status === 'failed') { thrown = true; throw new Error('the subscriber could not be read'); }
				return (e) => { events.push(e); };
			},
		};
		const result = await runAnalyze(hinted(ended), opts);
		assert.equal(thrown, true, 'the error was raised, after the record was written');
		// The error is returned, and 'done' fires once ...
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.deepEqual([result.error.code, result.error.message], ['internal-error', 'the subscriber could not be read']);
		assert.equal(events.filter(e => e.type === 'done').length, 1);
		// ... and the record keeps the end the run had written: it is not rewritten as an internal error.
		const record = readRunRecord(ended);
		assert.deepEqual([record?.status, record?.stage, record?.error?.code], ['failed', 'plan', 'scope-not-indexed']);
		assert.equal(isRunLive(ended), false);
	} finally {
		purgeRunForTests(ended);
	}

	// A completed record ('ok') is left too: asked for again with a subscriber that cannot be read.
	const completed = uniqueId('completed-then-thrown');
	try {
		const stored: RunRecord = {
			runId: completed, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:05.000Z',
			userPrompt: 'the earlier request', initialScopeRef: { kind: 'repo', value: '/r' }, stage: 'done', status: 'ok',
			intent: { target: 'code', scope: 'XS', focused: false, scopeRef: { kind: 'repo', value: '/r' }, reasoning: 'stored' },
			finalReport: { summary: 'Complete.\n\ns', findings: [] }, tasksCompleted: 1, tasksFailed: [],
		};
		writeRunRecord(stored);
		let reads = 0;
		const opts = { get onEvent(): ((e: AnalyzeRunEvent) => void) | undefined { reads += 1; if (reads === 1) throw new Error('the subscriber could not be read'); return undefined; } };
		const result = await runAnalyze(hinted(completed), opts);
		assert.equal(result.ok, false);
		assert.deepEqual(readRunRecord(completed), stored, 'the completed record is byte for byte what it was');
	} finally {
		purgeRunForTests(completed);
	}

	// --- two runs under one id: the one that throws leaves the shared record to the one still going ---
	const shared = uniqueId('shared');
	try {
		let release!: () => void;
		let entered!: () => void;
		const gate = new Promise<void>(r => { release = r; });
		const inside = new Promise<void>(r => { entered = r; });
		// The first run is held where it measures its request, at the measuring pass's first read of the registry:
		// it is live and its record is in progress.
		let held = false;
		_setMeasureDepsForTest({ scope: {
			listRepos:           async () => { if (!held) { held = true; entered(); await gate; } return listRepos(null); },
			findEntitiesByFile:  file => findEntitiesByFile(null, file),
			listEntitiesForRepo: repo => listEntitiesForRepo(null, repo),
			loadConnections,
		} });
		const going = runAnalyze(hinted(shared));
		await inside;
		assert.equal(readRunRecord(shared)?.status, 'in-progress');

		// A second run under the same id throws before any stage.
		const thrown = await runAnalyze(hinted(shared), { signal: signalFailingAt(1) });
		assert.equal(thrown.ok, false);
		if (thrown.ok) return;
		assert.equal(thrown.error.code, 'internal-error');
		// The id is still live, and the shared record does NOT say failed: the run still going owns it.
		assert.equal(isRunLive(shared), true);
		const record = readRunRecord(shared);
		assert.deepEqual([record?.status, record?.error], ['in-progress', undefined]);

		// The first run goes on and writes its own end.
		release();
		const first = await going;
		assert.equal(first.ok, false);
		if (first.ok) return;
		assert.equal(first.error.code, 'scope-not-indexed');
		assert.deepEqual([readRunRecord(shared)?.status, readRunRecord(shared)?.error?.code], ['failed', 'scope-not-indexed']);
		assert.equal(isRunLive(shared), false);
	} finally {
		purgeRunForTests(shared);
	}
});
