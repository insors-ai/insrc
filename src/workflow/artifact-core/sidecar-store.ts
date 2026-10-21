/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The durable sidecar (sc5, s4): the file-backed {@link SidecarIo} and the
 * SidecarStore that names an artifact's files. Each head has a log and a
 * feedback line file beside it, written by {@link appendSidecarLine} and read
 * here. Ordering, de-duplication and fragment handling are private to this
 * module; a TASK id shares the files of its Story's TASKS artifact.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ArtifactIds, InvalidArtifactKeyError } from '../artifact-ids.js';
import { getLogger } from '../../shared/logger.js';
import { ARTIFACTS_DIR } from '../storage.js';
import { JOURNAL_DIR } from './journal.js';
import { appendSidecarLine } from './sidecar.js';
import type { SidecarFile, SidecarIo } from './sidecar.js';
import { HistoryReadError } from './types.js';
import type { SidecarRecord } from './types.js';

const log = getLogger('sidecar-store');

/** The repository-relative paths of one artifact's files. */
export interface ArtifactFiles {
	readonly head:     string;
	readonly log:      string;
	readonly feedback: string;
}

/** The sidecar store of one repository (sc5). */
export interface SidecarStore extends SidecarIo {
	filesOf(id: string): ArtifactFiles;
	mergeAttributes(): string[];
}

const FRAME_RE = /^(\d+)\t(.*)$/s;

/** One decoded complete frame, or undefined for an abandoned fragment. */
function decodeFrame(line: string): string | undefined {
	const m = FRAME_RE.exec(line);
	if (m === null) return undefined;
	const json = m[2] as string;
	return Buffer.byteLength(json, 'utf8') === Number(m[1]) ? json : undefined;
}

function entryIdOf(entry: unknown): string {
	const id = (entry as { id?: unknown } | null)?.id;
	return typeof id === 'string' ? id : '';
}

/** When an entry happened, as a number, so differently written stamps of one instant ('…:00Z', '…:00.000Z') compare as equal; unparseable stamps sort first. */
function timeOf(entry: unknown): number {
	const t = (entry as { timestamp?: unknown } | null)?.timestamp;
	const ms = typeof t === 'string' ? Date.parse(t) : Number.NaN;
	return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** Order by time, then entry id: the one reader order shared by the log and feedback files. */
export function compareEntries(a: unknown, b: unknown): number {
	const ta = timeOf(a), tb = timeOf(b);
	if (ta !== tb) return ta < tb ? -1 : 1;
	const ia = entryIdOf(a), ib = entryIdOf(b);
	return ia === ib ? 0 : ia < ib ? -1 : 1;
}

export class FileSidecarStore implements SidecarStore {
	constructor(private readonly repoPath: string) {}

	filesOf(id: string): ArtifactFiles {
		const key = ArtifactIds.parse(id);
		if (key === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
		const sharedId = key.kind === 'TASK' && key.story !== undefined
			? ArtifactIds.make({ kind: 'TASKS', epicHash: key.epicHash, story: key.story })
			: id;
		return {
			head:     `${ARTIFACTS_DIR}/${id}.json`,
			log:      `${ARTIFACTS_DIR}/${sharedId}.log.jsonl`,
			feedback: `${ARTIFACTS_DIR}/${sharedId}.feedback.jsonl`,
		};
	}

	mergeAttributes(): string[] {
		return [`${ARTIFACTS_DIR}/*.log.jsonl merge=union`, `${ARTIFACTS_DIR}/*.feedback.jsonl merge=union`];
	}

	appendRecord<E>(file: SidecarFile, record: SidecarRecord<E>): Promise<void> {
		try {
			appendSidecarLine(join(this.repoPath, this.filesOf(record.artifactId)[file]), record);
			return Promise.resolve();
		} catch (err) { return Promise.reject(err instanceof Error ? err : new Error(String(err))); }
	}

	readRecords<E>(file: SidecarFile, artifactId: string): Promise<E[]> {
		try { return Promise.resolve(this.read<E>(file, artifactId)); }
		catch (err) { return Promise.reject(err instanceof Error ? err : new Error(String(err))); }
	}

	private read<E>(file: SidecarFile, artifactId: string): E[] {
		const rel = this.filesOf(artifactId)[file];
		const path = join(this.repoPath, rel);
		if (!existsSync(path)) return [];
		const lines = readFileSync(path, 'utf8').split('\n');
		// The text after the last newline is an unterminated line: a fragment, never a record.
		const unterminated = lines.pop() ?? '';
		if (unterminated !== '') log.warn({ file: rel, line: lines.length + 1 }, 'skipping an unterminated sidecar line (abandoned fragment)');

		const seen = new Map<string, { json: string; entry: E }>();
		lines.forEach((line, i) => {
			if (line === '') return;
			const where = `${rel}:${i + 1}`;
			const json = decodeFrame(line);
			if (json === undefined) { log.warn({ file: rel, line: i + 1 }, 'skipping an incomplete sidecar frame (abandoned fragment or merge debris)'); return; }
			let record: unknown;
			try { record = JSON.parse(json); }
			catch (err) { throw new HistoryReadError(`${where} holds a complete frame with invalid json (${(err as Error).message})`); }
			const r = record as { artifactId?: unknown; entry?: unknown } | null;
			if (typeof r !== 'object' || r === null || typeof r.artifactId !== 'string' || !('entry' in r)) {
				throw new HistoryReadError(`${where} is not a sidecar record with an artifactId and an entry`);
			}
			if (r.artifactId !== artifactId) return;
			const id = entryIdOf(r.entry);
			const prior = seen.get(id);
			if (prior !== undefined && id !== '') {
				if (prior.json !== json) throw new HistoryReadError(`${where} repeats entry '${id}' of ${artifactId} with different content`);
				return;
			}
			seen.set(id === '' ? `\u0000${i}` : id, { json, entry: r.entry as E });
		});
		return [...seen.values()].map(v => v.entry).sort(compareEntries);
	}
}

/** Append the lines of `wanted` that `file` lacks. True when it wrote; a file that cannot be read or written is a warning, not an error. */
function ensureLines(file: string, wanted: readonly string[]): boolean {
	try {
		const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
		const have = new Set(text.split('\n').map(l => l.trim()));
		const missing = wanted.filter(l => !have.has(l));
		if (missing.length === 0) return false;
		appendFileSync(file, (text !== '' && !text.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n', 'utf8');
		return true;
	} catch (err) {
		log.warn({ file, err: (err as Error).message }, 'could not add the sidecar rules to the file; add these lines yourself: ' + wanted.join(' | '));
		return false;
	}
}

/**
 * Add the two merge=union rules to the repository's .gitattributes and the journal folder to its .gitignore, adding
 * only the lines that are missing. Never rewrites a line; a file it cannot write is a warning and the store still works.
 */
export function ensureSidecarRepoRules(repoPath: string, store: SidecarStore): void {
	ensureLines(join(repoPath, '.gitattributes'), store.mergeAttributes());
	ensureLines(join(repoPath, '.gitignore'), [`${JOURNAL_DIR}/`]);
}

/** A file sidecar store whose repository carries the merge rules and the journal ignore entry. The way production creates one. */
export function createFileSidecarStore(repoPath: string): FileSidecarStore {
	const store = new FileSidecarStore(repoPath);
	ensureSidecarRepoRules(repoPath, store);
	return store;
}
