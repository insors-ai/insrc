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
import { linkSync, lstatSync, readFileSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
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

/** What identifies a file as the one that was looked at: an atomic replacement changes the inode, an edit the size or time. */
interface FileIdentity { readonly dev: bigint; readonly ino: bigint; readonly size: bigint; readonly mtimeNs: bigint }

function identityOf(path: string): FileIdentity {
	const st = lstatSync(path, { bigint: true });
	return { dev: st.dev, ino: st.ino, size: st.size, mtimeNs: st.mtimeNs };
}

function sameIdentity(a: FileIdentity, b: FileIdentity): boolean {
	return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs;
}

/** Error codes of a file system that cannot hard-link (FAT, exFAT, some shares). */
const NO_HARD_LINKS = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EMLINK']);

/**
 * Moves the settings file from its old name, `github.json`, to `repo-config.json` in `dir`, once, at daemon boot, before
 * anything reads it. The new name is published atomically and without replacing anything: a hard link, which the file system
 * refuses when the destination exists (NTFS and ReFS support it, so this holds on Windows too), or, for a symbolic-link
 * `github.json`, a new symbolic link to the same target (on Windows that needs the privilege to create links). `rename`
 * replaces its destination on every platform, Windows included, so it never publishes the new name, and nothing is copied: a
 * copy cannot be published both completely and without replacing an existing file with the calls Node has.
 *
 * The old name is then removed by claiming it: it is renamed to a name only this call knows, and only that name is ever
 * deleted, so no check can be interleaved with the removal. If the claimed file is still the one that was published (same
 * device, inode, size and time as before) it is deleted. If it is not, an editor replaced `github.json` in the meantime and
 * the claimed file is its newer one: it is linked back under `github.json`, which is exclusive, and both names are kept; if
 * even that is refused (a newer `github.json` appeared again, or links fail) the newer file stays under the claimed name and
 * the result says where. `github.json` is absent for the length of two calls while claimed. This code never deletes
 * `repo-config.json`.
 *
 * When a `repo-config.json` appears at any moment before it is published, neither file is changed and the result is
 * `both-exist`. Nothing is moved when there is no old file. A failure is the `failed` result and the old file stays; on a
 * volume without hard links its note says to rename the file by hand. Should the old name not be claimable (Windows refuses
 * to rename a file another program has open), both files exist with the same content; the next boot reports `both-exist` and
 * touches neither, and the daemon uses `repo-config.json`, so the leftover `github.json` is harmless and can be deleted by
 * hand. Never throws.
 */
export function moveLegacyRepoConfig(
	dir: string = PATHS.insrc,
	seams: {
		/** Replaces the hard link step, to fail it (or make a file system without hard links) in a test. */
		readonly link?: (from: string, to: string) => void;
		/** Replaces claiming the old name (the rename), to fail it in a test. */
		readonly rename?: (from: string, to: string) => void;
		/** Replaces deleting the claimed name, to fail it in a test. */
		readonly unlink?: (path: string) => void;
		/** Runs between the presence checks and publishing, to interleave another process in a test. */
		readonly beforeCreate?: () => void;
		/** Runs after the new name was published and before the old name is claimed. */
		readonly beforeClaim?: () => void;
		/** Runs after the old name was claimed and before the claimed file is judged. */
		readonly afterClaim?: () => void;
	} = {},
): LegacyRepoConfigMove {
	const from = join(dir, 'github.json');
	const to = join(dir, 'repo-config.json');
	const bothExist = (why?: string): LegacyRepoConfigMove => {
		const note = `${from} and ${to} both exist${why === undefined ? '' : ` (${why})`}; neither was changed and ${to} is the file in use`;
		log.warn({ from, to }, 'old and new settings files both exist');
		return { status: 'both-exist', note };
	};
	try {
		if (!present(from)) return { status: 'nothing-to-move' };
		if (present(to)) return bothExist();
		const before = identityOf(from);
		seams.beforeCreate?.();
		try {
			if (lstatSync(from).isSymbolicLink()) symlinkSync(readlinkSync(from), to);
			else (seams.link ?? linkSync)(from, to);
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if (code === 'EEXIST') return bothExist();
			if (code !== undefined && NO_HARD_LINKS.has(code)) {
				const note = `${dir} does not support hard links (${(e as Error).message}); rename ${from} to ${to} by hand`;
				log.warn({ from, to, code }, 'the settings file cannot be moved on this volume: no hard links');
				return { status: 'failed', note };
			}
			throw e;
		}
		seams.beforeClaim?.();
		// claim the old name: after this rename the path is ours alone, so nothing can replace it between a check and a delete
		const claimed = join(dir, `.github.json.${process.pid}.${Math.random().toString(36).slice(2, 10)}.removing`);
		try {
			(seams.rename ?? renameSync)(from, claimed);
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if (code === 'ENOENT') {
				log.info({ from, to }, 'moved the settings file to its new name; the old name was already gone');
				return { status: 'moved' };
			}
			const note = `${to} was created but ${from} could not be set aside to be removed (${e instanceof Error ? e.message : String(e)}); both exist with the same content; the daemon uses the new one and the old one can be deleted`;
			log.warn({ from, to }, 'the settings file was created under its new name but the old name could not be claimed');
			return { status: 'failed', note };
		}
		seams.afterClaim?.();
		if (sameIdentity(before, identityOf(claimed))) {
			try {
				(seams.unlink ?? unlinkSync)(claimed);
			} catch (e) {
				const note = `${to} was created and ${from} was set aside as ${claimed} but that could not be deleted (${e instanceof Error ? e.message : String(e)}); it is a copy of the settings and can be deleted by hand`;
				log.warn({ from, to, claimed }, 'the settings file was moved but its old name could not be deleted');
				return { status: 'moved', note };
			}
			log.info({ from, to }, 'moved the settings file to its new name');
			return { status: 'moved' };
		}
		// an editor replaced github.json before it was claimed: what was claimed is its newer file, so give the name back
		try {
			linkSync(claimed, from);
			unlinkSync(claimed);
			return bothExist(`${from} changed while it was being moved and was left in place`);
		} catch {
			const note = `${from} changed while it was being moved and ${to} holds the earlier settings; the newer settings are kept as ${claimed} because ${from} could not be restored; rename it back by hand`;
			log.warn({ from, to, claimed }, 'a newer settings file was set aside and could not be restored under its name');
			return { status: 'both-exist', note };
		}
	} catch (e) {
		const note = e instanceof Error ? e.message : String(e);
		log.warn({ from, to, err: note }, 'could not move the settings file to its new name; it is tried again at the next boot');
		return { status: 'failed', note };
	}
}
