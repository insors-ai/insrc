/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The constraints the documents state on a topic, for an adherence check
 * that is given none.
 *
 * One enumeration is made per run, repository and topic, and kept as a
 * record in the run's directory:
 *   ~/.insrc/analyze/<runId>/constraints/<key>.json
 * A later check on the same topic reads the record, so the checks of one
 * run judge against the same list, and a reader can open what was found.
 * The plans of a tree share the run id, so they share the records.
 *
 * The enumeration is the shared one the docs task uses
 * (`runSharedDocConstraintEnumerate`), asked for the whole repository: the
 * rules for a piece of code are in the repository's documents, not beside
 * the code, so the check's own area is not handed on.
 *
 * Only a finished enumeration is recorded, with or without constraints. A
 * failed one throws on and writes nothing, so the next check tries again.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { DbClient } from '../../../db/client.js';
import { getLogger } from '../../../shared/logger.js';
import { PATHS } from '../../../shared/paths.js';
import { runSharedDocConstraintEnumerate } from '../../explore/doc-constraint-enumerate.js';
import type { RunDocConstraintEnumerateArgs } from '../../explore/doc-constraint-enumerate.js';
import type { DocConstraintEnumerateOutput } from '../../explore/types.js';

const log = getLogger('analyze:runtimes:shared:adherence-topic-constraints');

export const CONSTRAINT_RECORD_SCHEMA_VERSION = 1;

/** What a record file holds. */
export interface ConstraintRecord {
	readonly schemaVersion:    typeof CONSTRAINT_RECORD_SCHEMA_VERSION;
	readonly repoPath:         string;
	/** The topic as the first task that asked wrote it. */
	readonly topic:            string;
	readonly maxSources:       number | null;
	readonly enumeratedAt:     string;
	/** The task that made the enumeration. */
	readonly enumeratedByTask: string;
	readonly output:           DocConstraintEnumerateOutput;
}

export interface ConstraintsForTopicArgs {
	readonly runId:       string;
	readonly taskId:      string;
	readonly repoPath:    string;
	readonly topic:       string;
	readonly maxSources?: number | undefined;
	readonly db:          DbClient;
}

export interface ConstraintsForTopicResult {
	readonly output:  DocConstraintEnumerateOutput;
	/** The record's path; absent when the record could not be written. */
	readonly record?: string | undefined;
	/** True when the enumeration was read from a record and not made. */
	readonly reused:  boolean;
}

type Enumerate = (args: RunDocConstraintEnumerateArgs) => Promise<DocConstraintEnumerateOutput>;

/** Test seam: a stand-in for the shared enumeration. Pass undefined to go back to the real one. */
let enumerateForTest: Enumerate | undefined;
export function _setConstraintEnumerateForTest(fn: Enumerate | undefined): void {
	enumerateForTest = fn;
}

/** Two topics that differ only in case or spacing are one topic. */
export function normaliseTopic(topic: string): string {
	return topic.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The record's key: the repository, the normalised topic and the number of
 * sections the enumeration may read (which changes what it can find).
 */
export function constraintRecordKey(repoPath: string, topic: string, maxSources?: number | undefined): string {
	const parts = [repoPath, normaliseTopic(topic), maxSources === undefined ? '' : String(maxSources)];
	return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 16);
}

export function constraintRecordPathFor(runId: string, repoPath: string, topic: string, maxSources?: number | undefined): string {
	return PATHS.analyzeConstraintRecord(runId, constraintRecordKey(repoPath, topic, maxSources));
}

/**
 * The enumeration of the constraints on `topic` in the documents of
 * `repoPath`, for the run: the recorded one when there is one, else a new one,
 * which is recorded before it is returned.
 *
 * @throws whatever the enumeration throws (a `LookupFailedError` when the
 *         model that reads the retrieved sections cannot be called). Nothing
 *         is recorded then.
 */
export async function constraintsForTopic(args: ConstraintsForTopicArgs): Promise<ConstraintsForTopicResult> {
	const path = constraintRecordPathFor(args.runId, args.repoPath, args.topic, args.maxSources);
	const stored = readRecord(path, args);
	if (stored !== null) {
		return { output: stored.output, record: path, reused: true };
	}

	const output = await (enumerateForTest ?? runSharedDocConstraintEnumerate)({
		subject:    args.topic,
		repoPath:   args.repoPath,
		db:         args.db,
		runId:      args.runId,
		logContext: 'adherence check',
		...(args.maxSources !== undefined ? { maxSources: args.maxSources } : {}),
	});

	const record: ConstraintRecord = {
		schemaVersion:    CONSTRAINT_RECORD_SCHEMA_VERSION,
		repoPath:         args.repoPath,
		topic:            args.topic,
		maxSources:       args.maxSources ?? null,
		enumeratedAt:     new Date().toISOString(),
		enumeratedByTask: args.taskId,
		output,
	};
	try {
		atomicWriteJson(path, record);
	} catch (err) {
		// The enumeration in hand is still good; only the reuse is lost.
		log.warn(
			{ runId: args.runId, taskId: args.taskId, path, err: (err as Error).message },
			"the enumeration's record could not be written; a later check on this topic will enumerate again",
		);
		return { output, reused: false };
	}
	return { output, record: path, reused: false };
}

/** Remove every constraint record of a run. Best effort; used by tests. */
export function purgeConstraintRecords(runId: string): void {
	const dir = dirname(PATHS.analyzeConstraintRecord(runId, 'unused'));
	try { rmSync(dir, { recursive: true, force: true }); }
	catch (err) {
		log.debug({ dir, err: (err as Error).message }, 'purgeConstraintRecords: could not remove');
	}
}

/**
 * The record at `path` when it is one for this repository and topic. A file
 * that is absent, cannot be read or parsed, is of another schema version, or
 * holds another repository or topic is treated as absent: the caller
 * enumerates and overwrites it.
 */
function readRecord(path: string, args: ConstraintsForTopicArgs): ConstraintRecord | null {
	let text: string;
	try {
		text = readFileSync(path, 'utf8');
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
			log.warn({ path, err: (err as Error).message }, "the enumeration's record could not be read; enumerating again");
		}
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (err) {
		log.warn({ path, err: (err as Error).message }, "the enumeration's record is not JSON; enumerating again");
		return null;
	}
	const reason = notThisRecord(parsed, args);
	if (reason !== null) {
		log.warn({ path, reason }, "the enumeration's record is not usable; enumerating again");
		return null;
	}
	return parsed as ConstraintRecord;
}

function notThisRecord(parsed: unknown, args: ConstraintsForTopicArgs): string | null {
	if (typeof parsed !== 'object' || parsed === null) return 'it is not an object';
	const r = parsed as Record<string, unknown>;
	if (r['schemaVersion'] !== CONSTRAINT_RECORD_SCHEMA_VERSION) return `its schema version is ${String(r['schemaVersion'])}`;
	if (r['repoPath'] !== args.repoPath) return 'it is of another repository';
	if (typeof r['topic'] !== 'string' || normaliseTopic(r['topic']) !== normaliseTopic(args.topic)) return 'it is of another topic';
	if ((r['maxSources'] ?? null) !== (args.maxSources ?? null)) return 'it was made with another limit of sections';
	// The enumeration inside must be whole: a check reads its constraints, its
	// count of sections and its completeness, and must not fail on a part that is missing.
	const output = r['output'] as Record<string, unknown> | null | undefined;
	if (typeof output !== 'object' || output === null || !Array.isArray(output['constraints'])) return 'it holds no enumeration';
	if (typeof output['completeness'] !== 'object' || output['completeness'] === null) return "its enumeration has no completeness record";
	if (typeof output['retrievedSectionCount'] !== 'number') return 'its enumeration does not say how many sections were retrieved';
	for (const c of output['constraints'] as unknown[]) {
		if (typeof c !== 'object' || c === null || typeof (c as Record<string, unknown>)['constraint'] !== 'string') return 'one of its constraints has no text';
	}
	return null;
}

function atomicWriteJson(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	writeFileSync(tmp, JSON.stringify(value, null, '\t'), 'utf8');
	renameSync(tmp, path);
}
