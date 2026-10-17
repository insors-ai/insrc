/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Strict reader and serialised writer for `~/.insrc/github.json`.
 *
 * The daemon is the only process that writes the file. Writes are chained on one
 * in-process promise queue (no lock file). Each attempt reads and validates the
 * file, merges the patch, writes a temp file, and re-checks size, mtime and
 * content hash immediately before the rename; an outside change restarts the
 * attempt, and after a bounded number of attempts the call returns
 * `file-changed`. One window remains: an outside edit between the final check
 * and the rename is not detected, because rename cannot be made conditional.
 */

import { createHash } from 'node:crypto';
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';

import { getLogger } from '../../shared/logger.js';
import { githubConfigPath } from './github.js';
import type { GithubConfigFile, GithubEntry } from './github.js';

const log = getLogger('github-store');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteError {
	readonly code: 'github-json-unreadable' | 'file-changed' | 'write-failed';
	readonly message: string;
}

export type ReadResult =
	| { readonly ok: true; readonly file: GithubConfigFile; readonly entry: GithubEntry | undefined }
	| { readonly ok: false; readonly error: WriteError };

export type WriteResult =
	| { readonly ok: true; readonly changed: boolean }
	| { readonly ok: false; readonly error: WriteError };

export type EntryPatch = Readonly<Record<string, string | boolean | null>>;

/** File operations the writer uses; tests replace them to observe or fail a step. */
export interface StoreSeams {
	readonly writeFile: (path: string, content: string) => void | Promise<void>;
	readonly rename: (from: string, to: string) => void | Promise<void>;
	/** Runs after the temp file is written and before the verify step. */
	readonly afterTempWrite?: ((attempt: number) => void | Promise<void>) | undefined;
}

/** Number of read-merge-write-verify attempts before `file-changed`. */
export const MAX_WRITE_ATTEMPTS = 3;

const DEFAULT_SEAMS: StoreSeams = {
	writeFile: (path, content) => writeFileSync(path, content, 'utf8'),
	rename: (from, to) => renameSync(from, to),
};

// ---------------------------------------------------------------------------
// Strict reader
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function unreadable(configPath: string, detail: string): { ok: false; error: WriteError } {
	return { ok: false, error: { code: 'github-json-unreadable', message: `${configPath}: ${detail}` } };
}

/** Only ENOENT means the file is absent; EACCES on a parent and the like are real read failures. */
function isMissing(e: unknown): boolean {
	return (e as NodeJS.ErrnoException).code === 'ENOENT';
}

function describe(v: unknown): string {
	return v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v;
}

/** Validates a parsed file level by level and selects the repo's own entry. */
function validateSnapshot(parsed: unknown, repoPath: string, configPath: string): ReadResult {
	if (!isPlainObject(parsed)) return unreadable(configPath, `the top level must be an object, found ${describe(parsed)}`);
	if ('default' in parsed && !isPlainObject(parsed['default'])) {
		return unreadable(configPath, `"default" must be an object, found ${describe(parsed['default'])}`);
	}
	if ('repos' in parsed && !isPlainObject(parsed['repos'])) {
		return unreadable(configPath, `"repos" must be an object, found ${describe(parsed['repos'])}`);
	}
	const repos = parsed['repos'] as Record<string, unknown> | undefined;
	let entry: GithubEntry | undefined;
	if (repos !== undefined && Object.hasOwn(repos, repoPath)) {
		const own = repos[repoPath];
		if (!isPlainObject(own)) return unreadable(configPath, `repos["${repoPath}"] must be an object, found ${describe(own)}`);
		entry = own as GithubEntry;
	}
	return { ok: true, file: parsed as GithubConfigFile, entry };
}

/**
 * Reads `github.json` strictly. A missing file is an empty snapshot; an
 * unreadable file, invalid JSON, or a null/array/primitive at the top level,
 * `default`, `repos` or the repo's own entry is reported, naming the level.
 */
export function readRepoEntry(repoPath: string, configPath: string = githubConfigPath()): ReadResult {
	let raw: string;
	try {
		raw = readFileSync(configPath, 'utf8');
	} catch (e) {
		if (isMissing(e)) return { ok: true, file: {}, entry: undefined };
		return unreadable(configPath, `cannot be read: ${(e as Error).message}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		return unreadable(configPath, `is not valid JSON: ${(e as Error).message}`);
	}
	return validateSnapshot(parsed, repoPath, configPath);
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Applies `patch` to `repos[repoPath]` of a validated snapshot. Only the named
 * keys change; `default`, other repos and unknown keys are kept. `null` removes
 * a key and is a no-op for an unset key. An entry is created only when a key is
 * actually set. Does not mutate its input.
 */
export function mergeRepoEntryKeys(
	file: GithubConfigFile,
	repoPath: string,
	patch: EntryPatch,
): { readonly file: GithubConfigFile; readonly changed: boolean } {
	const repos = (file.repos ?? {}) as Record<string, GithubEntry>;
	const existing = Object.hasOwn(repos, repoPath) ? repos[repoPath] : undefined;
	const next: Record<string, unknown> = { ...(existing ?? {}) };
	let changed = false;
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) {
			if (Object.hasOwn(next, key)) { delete next[key]; changed = true; }
		} else if (!Object.hasOwn(next, key) || next[key] !== value) {
			next[key] = value;
			changed = true;
		}
	}
	if (!changed) return { file, changed: false };
	return { file: { ...file, repos: { ...repos, [repoPath]: next as GithubEntry } }, changed: true };
}

// ---------------------------------------------------------------------------
// Serialised, verified writer
// ---------------------------------------------------------------------------

interface Fingerprint { readonly present: boolean; readonly size: number; readonly mtimeMs: number; readonly hash: string }

function fingerprint(configPath: string): Fingerprint {
	let content: Buffer;
	try {
		content = readFileSync(configPath);
	} catch (e) {
		if (isMissing(e)) return { present: false, size: 0, mtimeMs: 0, hash: '' };
		throw e;
	}
	const st = statSync(configPath);
	return { present: true, size: st.size, mtimeMs: st.mtimeMs, hash: createHash('sha256').update(content).digest('hex') };
}

function sameFingerprint(a: Fingerprint, b: Fingerprint): boolean {
	return a.present === b.present && a.size === b.size && a.mtimeMs === b.mtimeMs && a.hash === b.hash;
}

function failed(code: WriteError['code'], message: string): { ok: false; error: WriteError } {
	return { ok: false, error: { code, message } };
}

let queueTail: Promise<unknown> = Promise.resolve();
let tempCounter = 0;

async function writeOnce(repoPath: string, patch: EntryPatch, configPath: string, seams: StoreSeams): Promise<WriteResult> {
	for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
		const before = fingerprint(configPath);
		const read = readRepoEntry(repoPath, configPath);
		if (!read.ok) return read;
		const merged = mergeRepoEntryKeys(read.file, repoPath, patch);
		if (!merged.changed) return { ok: true, changed: false };

		const temp = `${configPath}.${process.pid}.${++tempCounter}.tmp`;
		try {
			await seams.writeFile(temp, JSON.stringify(merged.file, null, 2) + '\n');
			await seams.afterTempWrite?.(attempt);
			if (!sameFingerprint(before, fingerprint(configPath))) {
				rmSync(temp, { force: true });
				continue;
			}
			await seams.rename(temp, configPath);
			return { ok: true, changed: true };
		} catch (e) {
			rmSync(temp, { force: true });
			return failed('write-failed', (e as Error).message);
		}
	}
	return failed('file-changed', `${configPath} was changed by another process on each of ${MAX_WRITE_ATTEMPTS} attempts; nothing was written`);
}

/**
 * Sets (or, with `null`, removes) keys of `repos[repoPath]` in `github.json`.
 * Daemon-only. Calls run one at a time on a single in-process queue; the call
 * never rejects, and a failure never stalls the calls queued after it.
 */
export function writeRepoEntryKeys(
	repoPath: string,
	patch: EntryPatch,
	configPath: string = githubConfigPath(),
	seams: StoreSeams = DEFAULT_SEAMS,
): Promise<WriteResult> {
	const run = queueTail.then(async (): Promise<WriteResult> => {
		try {
			return await writeOnce(repoPath, patch, configPath, seams);
		} catch (e) {
			log.warn({ err: (e as Error).message }, 'github.json write failed');
			return failed('write-failed', (e as Error).message);
		}
	});
	queueTail = run;
	return run;
}
