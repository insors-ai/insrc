/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Persistence for the orchestrator's RunRecord (<runRoot>/run.json).
 *
 * The orchestrator stamps a fresh record at run start, then patches
 * the same file at every stage transition + at the terminal end.
 * Atomic write via tmp+rename so partial files never leak.
 */

import { assertAnalysisConnectionExecution } from '../connection-access.js';
import { assertSessionReuseNow } from '../session-reuse.js';
import { ConnectionExecutionError } from '../../shared/step-context.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';

import type { RunRecord } from './types.js';

const log = getLogger('analyze:orchestrator:persistence');
const sessionRecords = new WeakMap<RunRecord, ConnectionExecutionContext>();
/** An existing Session record cannot be laundered through an unattached Saved call. */
export function assertRunRecordSource(record: RunRecord, execution?: ConnectionExecutionContext): void {
	assertSessionReuseNow(execution);
	const owner = sessionRecords.get(record);
	if (owner !== undefined && owner !== execution) throw new ConnectionExecutionError('session-expired');
}

export function runRecordPathFor(runId: string, execution?: ConnectionExecutionContext): string {
	assertPersistentRunExecution(execution);
	return PATHS.analyzeRunRecord(runId);
}

export function readRunRecord(runId: string, execution?: ConnectionExecutionContext): RunRecord | null {
	assertPersistentRunExecution(execution);
	const path = runRecordPathFor(runId, execution);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as RunRecord;
	} catch (err) {
		log.warn({ path, err: (err as Error).message }, 'run record unreadable; treating as miss');
		return null;
	}
}

export function writeRunRecord(record: RunRecord, execution?: ConnectionExecutionContext): string {
	assertPersistentRunExecution(execution);
	assertRunRecordSource(record, execution);
	const path = runRecordPathFor(record.runId, execution);
	atomicWriteJson(path, record);
	log.debug(
		{ runId: record.runId, stage: record.stage, status: record.status },
		'wrote run record',
	);
	return path;
}

/**
 * Remove the entire run directory (~/.insrc/analyze/<runId>/) including
 * plan.json, plan.attempts/, tasks/, run.json, and the context cache.
 *
 * Safety: by default refuses to purge a run whose record shows
 * status='in-progress' -- nuking a running run's directory mid-pipeline
 * would cause the orchestrator to crash on its next disk write +
 * leak partial state. Pass `force: true` to override (e.g. to clear
 * a stale in-progress record from a crashed daemon).
 *
 * Returns:
 *   { ok: true, purged: true }                -- run dir existed + removed
 *   { ok: true, purged: false }               -- nothing on disk to purge
 *                                                (run.json + dir both missing)
 *   { ok: false, code: 'run-in-progress' }    -- record shows status='in-progress'
 *                                                and force was not set, and the
 *                                                run is live or its liveness is
 *                                                not known (no `isLive` given)
 *
 * Filesystem errors propagate -- the orchestrator RPC turns them into
 * 'internal-error' at the wire.
 */
export interface PurgeRunResult {
	readonly ok:      true;
	readonly purged:  boolean;
}

export interface PurgeRunRefused {
	readonly ok:    false;
	readonly code:  'run-in-progress';
	readonly stage: import('./types.js').RunStage;
}

/** What an abandoned record's error says. */
export const RUN_ABANDONED_MESSAGE =
	"The run record was left 'in-progress' and no live run stands behind it: the run stopped without recording how it ended.";

/**
 * The abandoned rule. A record that is 'in-progress' means a run is live;
 * one with no live run behind it is abandoned. This rewrites such a record as
 * failed at the stage it had reached, with 'run-abandoned', and returns the
 * rewritten record.
 *
 * The caller has established that the record is 'in-progress' and that its
 * run is not live. Liveness is known only in the process that started the
 * run, so it is never decided here.
 *
 * The write is best effort: when it fails (a full disk may be why the run
 * died) the failure is logged and the abandoned record is returned all the
 * same, so the reader still says what is true.
 */
export function abandonRunRecord(record: RunRecord, execution?: ConnectionExecutionContext): RunRecord {
	assertPersistentRunExecution(execution);
	assertRunRecordSource(record, execution);
	const abandoned: RunRecord = {
		...record,
		status:    'failed',
		error:     { code: 'run-abandoned', message: RUN_ABANDONED_MESSAGE },
		updatedAt: new Date().toISOString(),
	};
	try {
		writeRunRecord(abandoned, execution);
		log.info({ runId: record.runId, stage: record.stage }, 'run record rewritten as abandoned: in-progress with no live run');
	} catch (err) {
		log.warn({ runId: record.runId, err: (err as Error).message }, 'the abandoned run record could not be written; it is reported as abandoned all the same');
	}
	return abandoned;
}

export function purgeRun(
	runId: string,
	opts:  {
		readonly force?: boolean;
		/** Says whether a run is live. Only a caller in the process that starts
		 *  the runs can know; one that cannot passes nothing, and an
		 *  'in-progress' record is then refused. */
		readonly isLive?: ((runId: string) => boolean) | undefined;
	} = {},
	execution?: ConnectionExecutionContext,
): PurgeRunResult | PurgeRunRefused {
	assertPersistentRunExecution(execution);
	const dir = dirname(runRecordPathFor(runId, execution));

	if (opts.force !== true) {
		const record = readRunRecord(runId, execution);
		if (record !== null && record.status === 'in-progress' && opts.isLive !== undefined && !opts.isLive(runId)) {
			// No live run stands behind the record: it is abandoned, and is
			// purged without force. The rewrite is best effort; the purge follows.
			abandonRunRecord(record, execution);
		} else if (record !== null && record.status === 'in-progress') {
			log.info(
				{ runId, stage: record.stage },
				'purgeRun refused: run is in-progress (use force=true to override)',
			);
			return { ok: false, code: 'run-in-progress', stage: record.stage };
		}
	}

	try {
		rmSync(dir, { recursive: true });
		log.info({ runId, dir }, 'purgeRun: run directory removed');
		return { ok: true, purged: true };
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return { ok: true, purged: false };
		}
		throw err;
	}
}

/** Test-only -- unconditionally remove the run dir; never refuses. */
export function purgeRunForTests(runId: string): void {
	const result = purgeRun(runId, { force: true });
	void result;
}

function atomicWriteJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	const json = JSON.stringify(value, null, '\t');
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	writeFileSync(tmp, json, 'utf8');
	renameSync(tmp, path);
}

/** Durable helpers refuse before paths, record properties, serialization or repair. */
function assertPersistentRunExecution(execution: ConnectionExecutionContext | undefined): void {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory') throw new ConnectionExecutionError('unsupported-temporary');
}

export interface RunRecordPort {
	read(): RunRecord | null;
	write(record: RunRecord): string;
	close(): void;
}
const recordPortAuthorities = new WeakMap<RunRecordPort, ConnectionExecutionContext | undefined>();

/** Each Session invocation owns at most one record. No completed result cache. */
export function createRunRecordPort(runId: string, execution?: ConnectionExecutionContext): RunRecordPort {
	assertSessionReuseNow(execution);
	let record: RunRecord | null = null;
	let closed = false;
	const guard = () => { assertSessionReuseNow(execution); if (closed) throw new ConnectionExecutionError('session-expired'); };
	const close = () => { closed = true; record = null; execution?.lifetime.signal.removeEventListener('abort', close); };
	const port: RunRecordPort = Object.freeze({
		read() { guard(); return execution?.mode === 'session-memory' ? record : readRunRecord(runId, execution); },
		write(value: RunRecord) {
			guard();
			assertRunRecordSource(value, execution);
			if (value.runId !== runId) throw new ConnectionExecutionError('session-expired');
			if (execution?.mode !== 'session-memory') return writeRunRecord(value, execution);
			sessionRecords.set(value, execution);
			record = value;
			return '';
		},
		close,
	});
	recordPortAuthorities.set(port, execution);
	if (execution?.mode === 'session-memory') execution.lifetime.signal.addEventListener('abort', close, { once: true });
	return port;
}
/** Exact port identity prevents a supplied callback from replacing owner memory with disk. */
export function assertRunRecordPort(port: RunRecordPort, execution?: ConnectionExecutionContext): void {
	assertSessionReuseNow(execution);
	if (!recordPortAuthorities.has(port) || recordPortAuthorities.get(port) !== execution) throw new ConnectionExecutionError('session-expired');
}
