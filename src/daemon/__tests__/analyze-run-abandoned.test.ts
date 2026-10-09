/**
 * A record with no live run is abandoned when it is read (Story s7, task t14).
 *
 * A run record that is 'in-progress' means a run is live. The daemon holds
 * the count of live runs, so its status request and its purge request can
 * tell a record whose run died: it is rewritten as failed with
 * 'run-abandoned' at the stage it had reached. Another process cannot know,
 * so purgeRun takes liveness as a parameter and refuses without it.
 *
 * The daemon's handlers are called directly; records are real files under the
 * run directory. A record that cannot be written is one made read-only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { dirname } from 'node:path';

import {
	purgeRun,
	purgeRunForTests,
	readRunRecord,
	runRecordPathFor,
	writeRunRecord,
	RUN_ABANDONED_MESSAGE,
} from '../../analyze/orchestrator/index.js';
import { lowerRunLive, raiseRunLive } from '../../analyze/orchestrator/live-runs.js';
import type { RunRecord } from '../../analyze/orchestrator/types.js';
import type { IpcStreamMessage } from '../../shared/types.js';
import { _setRunAnalyzeForTest, runPurge, runStart, runStatus } from '../analyze-rpc.js';

/** The fs module object itself: replacing a function on it, then syncing, reaches every importer. */
const fs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs');

const uniqueId = (tag: string): string => `run-abandoned-${tag}-${Math.floor(Math.random() * 1e9).toString(16)}`;

function stored(runId: string, extra: Partial<RunRecord> = {}): RunRecord {
	return {
		runId, createdAt: '2026-10-08T00:00:00.000Z', updatedAt: '2026-10-08T00:00:05.000Z',
		userPrompt: 'the earlier request', initialScopeRef: { kind: 'repo', value: '/r' },
		stage: 'execute', status: 'in-progress', tasksCompleted: 2, ...extra,
	};
}

/** The record as it lies on disk, read without any rule applied. */
const onDisk = (runId: string): RunRecord => JSON.parse(readFileSync(runRecordPathFor(runId), 'utf8')) as RunRecord;

/** Make the run's directory read-only, so no record can be written or replaced in it. Returns the undo. */
function lockRunDir(runId: string): () => void {
	const dir = dirname(runRecordPathFor(runId));
	chmodSync(dir, 0o555);
	return () => { try { chmodSync(dir, 0o755); } catch { /* already removed */ } };
}

async function status(runId: string): Promise<RunRecord> {
	const r = await runStatus({ runId });
	assert.equal(r.ok, true, JSON.stringify(r));
	if (!r.ok) throw new Error('unreachable');
	return r.record;
}

test("a record in progress with no live run is rewritten as 'run-abandoned' by the status request, on disk too (mutation: return the record as read)", async () => {
	for (const stage of ['classify', 'plan', 'execute'] as const) {
		const id = uniqueId(`status-${stage}`);
		try {
			const left = stored(id, { stage });
			writeRunRecord(left);

			const record = await status(id);
			// Returned as failed, at the stage it had reached, with the code and a message that says why.
			assert.deepEqual([record.status, record.stage, record.error?.code], ['failed', stage, 'run-abandoned']);
			assert.equal(record.error?.message, RUN_ABANDONED_MESSAGE);
			assert.match(record.error?.message ?? '', /no live run stands behind it/);
			// Everything else of the record is kept.
			assert.deepEqual({ ...record, status: left.status, error: undefined, updatedAt: left.updatedAt }, { ...left, error: undefined });
			assert.notEqual(record.updatedAt, left.updatedAt);
			// The file on disk is rewritten: it is the record that was returned.
			assert.deepEqual(onDisk(id), record);
			// A second request reads the failed record and returns it as it is.
			assert.deepEqual(await status(id), record);
		} finally {
			purgeRunForTests(id);
		}
	}
});

test("the daemon's purge request purges such a record without force; purgeRun with no liveness refuses it; a live run's record is returned unchanged and refused", async () => {
	// --- no live run: the daemon's purge request removes it without force ---
	const dead = uniqueId('purge-dead');
	try {
		writeRunRecord(stored(dead, { stage: 'plan' }));
		const dir = dirname(runRecordPathFor(dead));
		// purgeRun, as a caller that cannot know liveness calls it, refuses the same record ...
		assert.deepEqual(purgeRun(dead), { ok: false, code: 'run-in-progress', stage: 'plan' });
		assert.deepEqual(purgeRun(dead, {}), { ok: false, code: 'run-in-progress', stage: 'plan' });
		assert.equal(onDisk(dead).status, 'in-progress', 'and leaves it as it was');
		// ... and the daemon's request, which passes its count of live runs, purges it.
		assert.deepEqual(await runPurge({ runId: dead }), { ok: true, purged: true });
		assert.equal(existsSync(dir), false);
	} finally {
		purgeRunForTests(dead);
	}

	// purgeRun given liveness: not live -> rewritten as abandoned, then purged; the rewrite is seen by the check.
	const seen = uniqueId('purge-seen');
	try {
		writeRunRecord(stored(seen));
		let statusWhenAsked: string | undefined;
		const result = purgeRun(seen, { isLive: (id) => { statusWhenAsked = onDisk(id).status; return false; } });
		assert.deepEqual(result, { ok: true, purged: true });
		assert.equal(statusWhenAsked, 'in-progress', 'liveness is asked about the record as it was left');
		assert.equal(readRunRecord(seen), null);
	} finally {
		purgeRunForTests(seen);
	}

	// --- a live run: its record is returned unchanged by the status request and refused by the purge request ---
	const live = uniqueId('live');
	try {
		const going = stored(live, { stage: 'plan' });
		writeRunRecord(going);
		raiseRunLive(live);
		try {
			assert.deepEqual(await status(live), going);
			assert.deepEqual(onDisk(live), going, 'not rewritten');
			const refused = await runPurge({ runId: live });
			assert.equal(refused.ok, false);
			if (refused.ok) return;
			assert.equal(refused.error.code, 'run-in-progress');
			assert.deepEqual(refused.error.data, { stage: 'plan' });
			assert.deepEqual(onDisk(live), going, 'still there, still in progress');
			assert.deepEqual(purgeRun(live, { isLive: () => true }), { ok: false, code: 'run-in-progress', stage: 'plan' });
			// With two runs under the id, one returning does not make it abandoned.
			raiseRunLive(live);
			lowerRunLive(live);
			assert.deepEqual(await status(live), going);
		} finally {
			lowerRunLive(live);
		}
		// The run is over without having recorded its end: now it is abandoned.
		assert.equal((await status(live)).error?.code, 'run-abandoned');
	} finally {
		purgeRunForTests(live);
	}
});

test("the daemon's handler writes the record and sends its stage, not 'classify', for a runAnalyze that throws, and sends both frames when the record cannot be written", async () => {
	const params = (runId: string) => ({ runId, userPrompt: 'what is here', scopeRef: { kind: 'repo', value: '/r' } });
	const start = async (runId: string): Promise<IpcStreamMessage[]> => {
		const frames: IpcStreamMessage[] = [];
		await runStart(params(runId), (m) => { frames.push(m); }, new AbortController().signal);
		return frames;
	};
	interface ErrFrame { ok: boolean; runId: string; stage: string; error: { code: string; message: string } }

	try {
		// --- the run wrote its record at 'execute' and then threw past its own handler ---
		const id = uniqueId('handler');
		try {
			_setRunAnalyzeForTest(async (args) => {
				writeRunRecord(stored(args.runId, { stage: 'execute', userPrompt: args.userPrompt }));
				throw new Error('the run function failed outside its own guard');
			});
			const frames = await start(id);
			assert.deepEqual(frames.map(f => f.stream), ['analyze.result', 'done']);
			const result = frames[0]!.data as ErrFrame;
			assert.deepEqual([result.ok, result.runId, result.stage, result.error.code, result.error.message],
				[false, id, 'execute', 'internal-error', 'the run function failed outside its own guard']);
			// The record is written as failed, at its own stage, with the same failure.
			const record = onDisk(id);
			assert.deepEqual([record.status, record.stage, record.error?.code, record.error?.message],
				['failed', 'execute', 'internal-error', 'the run function failed outside its own guard']);
			assert.equal(record.userPrompt, 'what is here');
			// So the status request reads a failed record, not an abandoned one.
			assert.equal((await status(id)).error?.code, 'internal-error');
		} finally {
			purgeRunForTests(id);
		}

		// --- the run had already recorded its own failure: the record is not touched, its stage is sent ---
		const own = uniqueId('handler-own');
		try {
			const failed = stored(own, { stage: 'plan', status: 'failed', error: { code: 'planner-exhausted', message: 'three attempts' } });
			_setRunAnalyzeForTest(async () => { writeRunRecord(failed); throw new Error('thrown after its own record'); });
			const frames = await start(own);
			assert.deepEqual(frames.map(f => f.stream), ['analyze.result', 'done']);
			assert.equal((frames[0]!.data as ErrFrame).stage, 'plan');
			assert.deepEqual(onDisk(own), failed);
		} finally {
			purgeRunForTests(own);
		}

		// --- no record at all: 'classify', the first stage, and both frames ---
		const none = uniqueId('handler-none');
		_setRunAnalyzeForTest(async () => { throw new Error('thrown before any record'); });
		const noneFrames = await start(none);
		assert.deepEqual(noneFrames.map(f => f.stream), ['analyze.result', 'done']);
		assert.deepEqual([(noneFrames[0]!.data as ErrFrame).stage, (noneFrames[0]!.data as ErrFrame).error.code], ['classify', 'internal-error']);
		assert.equal(readRunRecord(none), null);

		// --- the record cannot be written: both frames are still sent, with the record's stage ---
		const locked = uniqueId('handler-locked');
		let unlock = (): void => {};
		try {
			_setRunAnalyzeForTest(async (args) => {
				writeRunRecord(stored(args.runId, { stage: 'plan' }));
				unlock = lockRunDir(args.runId);
				throw new Error('the disk is full');
			});
			const frames = await start(locked);
			assert.deepEqual(frames.map(f => f.stream), ['analyze.result', 'done']);
			const result = frames[0]!.data as ErrFrame;
			assert.deepEqual([result.stage, result.error.code, result.error.message], ['plan', 'internal-error', 'the disk is full']);
			assert.equal(onDisk(locked).status, 'in-progress', 'the write did fail: the record is as it was');
		} finally {
			unlock();
			purgeRunForTests(locked);
		}
	} finally {
		_setRunAnalyzeForTest(undefined);
	}
});

test("with a record that cannot be written the status request still says 'run-abandoned' and the purge still removes the directory (mutation: let the rewrite's error escape)", async () => {
	// --- the status request ---
	const id = uniqueId('locked-status');
	let unlock = (): void => {};
	try {
		const left = stored(id, { stage: 'plan' });
		writeRunRecord(left);
		unlock = lockRunDir(id);

		const record = await status(id);
		assert.deepEqual([record.status, record.stage, record.error?.code], ['failed', 'plan', 'run-abandoned']);
		// The write did fail: the file is as it was left.
		assert.deepEqual(onDisk(id), left);
		// Asked again, the answer is the same.
		assert.equal((await status(id)).error?.code, 'run-abandoned');
	} finally {
		unlock();
		purgeRunForTests(id);
	}

	// --- the purge request: the rewrite fails, the purge follows all the same ---
	// A read-only directory would stop the removal too, so here the write is made
	// to fail at its last step: the rename that puts the record in place throws.
	const purged = uniqueId('locked-purge');
	const realRename = fs.renameSync;
	let renamesRefused = 0;
	try {
		writeRunRecord(stored(purged));
		const dir = dirname(runRecordPathFor(purged));
		fs.renameSync = ((from: string, to: string) => {
			if (to === runRecordPathFor(purged)) { renamesRefused += 1; throw new Error('ENOSPC: no space left on device'); }
			return realRename(from, to);
		}) as typeof fs.renameSync;
		syncBuiltinESMExports();

		const result = purgeRun(purged, { isLive: () => false });
		assert.equal(renamesRefused, 1, 'the rewrite was tried, once, and failed');
		assert.deepEqual(result, { ok: true, purged: true });
		assert.equal(existsSync(dir), false, 'the directory is gone although the abandoned record could not be written');
	} finally {
		fs.renameSync = realRename;
		syncBuiltinESMExports();
		purgeRunForTests(purged);
	}

	// The same through the daemon's purge request.
	const viaDaemon = uniqueId('locked-purge-daemon');
	try {
		writeRunRecord(stored(viaDaemon));
		fs.renameSync = ((from: string, to: string) => {
			if (to === runRecordPathFor(viaDaemon)) throw new Error('ENOSPC: no space left on device');
			return realRename(from, to);
		}) as typeof fs.renameSync;
		syncBuiltinESMExports();
		assert.deepEqual(await runPurge({ runId: viaDaemon }), { ok: true, purged: true });
		assert.equal(existsSync(dirname(runRecordPathFor(viaDaemon))), false);
	} finally {
		fs.renameSync = realRename;
		syncBuiltinESMExports();
		purgeRunForTests(viaDaemon);
	}
});

test("no reader changes a record that is 'ok' or 'failed'", async () => {
	const records: RunRecord[] = [
		stored(uniqueId('ok'), { stage: 'done', status: 'ok', finalReport: { summary: 'Complete.\n\ns', findings: [] } }),
		stored(uniqueId('failed'), { stage: 'plan', status: 'failed', error: { code: 'planner-exhausted', message: 'three attempts' } }),
		stored(uniqueId('aborted'), { stage: 'execute', status: 'failed', error: { code: 'aborted', message: 'aborted' } }),
	];
	for (const record of records) {
		const id = record.runId;
		try {
			writeRunRecord(record);
			const before = readFileSync(runRecordPathFor(id), 'utf8');
			// The status request returns it as it is, with no live run and with one.
			assert.deepEqual(await status(id), record);
			raiseRunLive(id);
			try { assert.deepEqual(await status(id), record); } finally { lowerRunLive(id); }
			assert.equal(readFileSync(runRecordPathFor(id), 'utf8'), before, `${record.status}: the file is byte for byte as it was`);
			// purgeRun asks nothing about liveness for it, and purges it as before.
			let asked = 0;
			assert.deepEqual(purgeRun(id, { isLive: () => { asked += 1; return false; } }), { ok: true, purged: true });
			assert.equal(asked, 0, `${record.status}: liveness is not asked for a record that is not in progress`);
		} finally {
			purgeRunForTests(id);
		}
	}
	// The daemon's purge request on a finished record: purged, as before.
	const viaDaemon = stored(uniqueId('ok-daemon'), { stage: 'done', status: 'ok' });
	try {
		writeRunRecord(viaDaemon);
		assert.deepEqual(await runPurge({ runId: viaDaemon.runId }), { ok: true, purged: true });
	} finally {
		purgeRunForTests(viaDaemon.runId);
	}
});
