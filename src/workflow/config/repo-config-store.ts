/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Strict reader and serialised writer for `~/.insrc/repo-config.json`.
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
import { constants, copyFileSync, linkSync, lstatSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { PATHS } from '../../shared/paths.js';
import { repoConfigPath } from './repo-config.js';
import type { RepoConfigFile, RepoConfigEntry } from './repo-config.js';

const log = getLogger('repo-config-store');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteError {
	readonly code: 'repo-config-unreadable' | 'file-changed' | 'write-failed';
	readonly message: string;
}

export type ReadResult =
	| { readonly ok: true; readonly file: RepoConfigFile; readonly entry: RepoConfigEntry | undefined }
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
	return { ok: false, error: { code: 'repo-config-unreadable', message: `${configPath}: ${detail}` } };
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
	let entry: RepoConfigEntry | undefined;
	if (repos !== undefined && Object.hasOwn(repos, repoPath)) {
		const own = repos[repoPath];
		if (!isPlainObject(own)) return unreadable(configPath, `repos["${repoPath}"] must be an object, found ${describe(own)}`);
		entry = own as RepoConfigEntry;
	}
	return { ok: true, file: parsed as RepoConfigFile, entry };
}

/**
 * Reads `repo-config.json` strictly. A missing file is an empty snapshot; an
 * unreadable file, invalid JSON, or a null/array/primitive at the top level,
 * `default`, `repos` or the repo's own entry is reported, naming the level.
 */
export function readRepoEntry(repoPath: string, configPath: string = repoConfigPath()): ReadResult {
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
	file: RepoConfigFile,
	repoPath: string,
	patch: EntryPatch,
): { readonly file: RepoConfigFile; readonly changed: boolean } {
	const repos = (file.repos ?? {}) as Record<string, RepoConfigEntry>;
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
	return { file: { ...file, repos: { ...repos, [repoPath]: next as RepoConfigEntry } }, changed: true };
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
 * Sets (or, with `null`, removes) keys of `repos[repoPath]` in `repo-config.json`.
 * Daemon-only. Calls run one at a time on a single in-process queue; the call
 * never rejects, and a failure never stalls the calls queued after it.
 */
export function writeRepoEntryKeys(
	repoPath: string,
	patch: EntryPatch,
	configPath: string = repoConfigPath(),
	seams: StoreSeams = DEFAULT_SEAMS,
): Promise<WriteResult> {
	const run = queueTail.then(async (): Promise<WriteResult> => {
		try {
			return await writeOnce(repoPath, patch, configPath, seams);
		} catch (e) {
			log.warn({ err: (e as Error).message }, 'repo-config.json write failed');
			return failed('write-failed', (e as Error).message);
		}
	});
	queueTail = run;
	return run;
}

// ---------------------------------------------------------------------------
// Move of the file's old name
// ---------------------------------------------------------------------------

/** What {@link moveLegacyRepoConfig} did. `note` explains `both-exist` and `failed`. */
export interface LegacyRepoConfigMove {
	readonly status: 'moved' | 'nothing-to-move' | 'both-exist' | 'failed';
	readonly note?: string;
}

/** Whether something is at `path`, a dangling symbolic link included; only ENOENT means absent. */
function present(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw e;
	}
}

/** Whether both paths are regular files (not links) holding the same bytes. */
function sameRegularContent(a: string, b: string): boolean {
	const sa = lstatSync(a);
	const sb = lstatSync(b);
	return sa.isFile() && sb.isFile() && sa.size === sb.size && readFileSync(a).equals(readFileSync(b));
}

/**
 * Creates `to` as a new name for the file at `from`, and fails with EEXIST, changing nothing, when `to` already exists.
 * `rename` replaces its destination on every platform (on Windows too), so it cannot be the move. A hard link is created
 * exclusively by the file system, which is the no-replace step this needs. A symbolic link is recreated as one (it needs
 * the privilege to make links on Windows, and is reported as failed without it). Where hard links are not supported
 * (FAT and exFAT volumes, some network shares), or fail for another reason, the new name is created by an exclusive copy,
 * which also refuses an existing destination; the copy is checked against the original, and a partial or wrong copy that
 * this call made is removed again.
 */
function createExclusively(from: string, to: string, hooks: { readonly link: (from: string, to: string) => void; readonly copy: (from: string, to: string) => void }): void {
	if (lstatSync(from).isSymbolicLink()) {
		symlinkSync(readlinkSync(from), to);
		return;
	}
	try {
		hooks.link(from, to);
		return;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw e;
	}
	try {
		hooks.copy(from, to);
		if (!sameRegularContent(from, to)) throw new Error(`the copy at ${to} does not match ${from}`);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'EEXIST') rmSync(to, { force: true });
		throw e;
	}
}

/**
 * Moves the settings file from its old name, `github.json`, to `repo-config.json` in `dir`, once, at daemon boot, before
 * anything reads it. The new name is created exclusively and then the old one is removed, so an existing `repo-config.json`
 * is never replaced, however another process interleaves: when one appears at any moment before the new name is created,
 * neither file is changed and the result is `both-exist`. Nothing is moved when there is no old file. A failure is the
 * `failed` result and the old file stays. Should the old name not be removable (Windows refuses to delete a file another
 * program has open), or the process die between the two steps, both files exist with the same content; the next boot
 * reports `both-exist` and touches neither, and the daemon uses `repo-config.json`, so a leftover `github.json` is harmless
 * and can be deleted by hand. Never throws.
 */
export function moveLegacyRepoConfig(
	dir: string = PATHS.insrc,
	seams: {
		/** Replaces the whole exclusive create, to fail it in a test. */
		readonly create?: (from: string, to: string) => void;
		/** Replaces the hard link step, to make a file system without hard links in a test. */
		readonly link?: (from: string, to: string) => void;
		/** Replaces the exclusive copy fallback, to fail it in a test. */
		readonly copy?: (from: string, to: string) => void;
		/** Runs between the presence checks and the create, to interleave another process in a test. */
		readonly beforeCreate?: () => void;
	} = {},
): LegacyRepoConfigMove {
	const from = join(dir, 'github.json');
	const to = join(dir, 'repo-config.json');
	const hooks = {
		link: seams.link ?? linkSync,
		copy: seams.copy ?? ((a: string, b: string): void => copyFileSync(a, b, constants.COPYFILE_EXCL)),
	};
	const bothExist = (): LegacyRepoConfigMove => {
		const note = `${from} and ${to} both exist; neither was changed and ${to} is the file in use`;
		log.warn({ from, to }, 'old and new settings files both exist');
		return { status: 'both-exist', note };
	};
	try {
		if (!present(from)) return { status: 'nothing-to-move' };
		if (present(to)) return bothExist();
		seams.beforeCreate?.();
		try {
			(seams.create ?? ((a: string, b: string) => createExclusively(a, b, hooks)))(from, to);
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === 'EEXIST') return bothExist();
			throw e;
		}
		try {
			unlinkSync(from);
		} catch (e) {
			const note = `${to} was created but ${from} could not be removed (${e instanceof Error ? e.message : String(e)}); both exist with the same content; the daemon uses the new one and the old one can be deleted`;
			log.warn({ from, to }, 'the settings file was created under its new name but the old name could not be removed');
			return { status: 'failed', note };
		}
		log.info({ from, to }, 'moved the settings file to its new name');
		return { status: 'moved' };
	} catch (e) {
		const note = e instanceof Error ? e.message : String(e);
		log.warn({ from, to, err: note }, 'could not move the settings file to its new name; it is tried again at the next boot');
		return { status: 'failed', note };
	}
}
