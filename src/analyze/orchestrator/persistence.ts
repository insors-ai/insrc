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

export function runRecordPathFor(runId: string): string {
	return PATHS.analyzeRunRecord(runId);
}

export function readRunRecord(runId: string): RunRecord | null {
	const path = runRecordPathFor(runId);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as RunRecord;
	} catch (err) {
		log.warn({ path, err: (err as Error).message }, 'run record unreadable; treating as miss');
		return null;
	}
}

export function writeRunRecord(record: RunRecord): string {
	const path = runRecordPathFor(record.runId);
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
 *                                                and force was not set
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

export function purgeRun(
	runId: string,
	opts:  { readonly force?: boolean } = {},
): PurgeRunResult | PurgeRunRefused {
	const dir = dirname(runRecordPathFor(runId));

	if (opts.force !== true) {
		const record = readRunRecord(runId);
		if (record !== null && record.status === 'in-progress') {
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
