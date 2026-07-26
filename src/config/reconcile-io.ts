/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The read / reconcile / write-once I/O side of config reconciliation.
 *
 * A plain module function (NOT a ConfigStore method — src/config/store.ts is
 * a deprecated LMDB row store with no fs access and is not the config.json
 * owner). It reads the whole document once, reconciles it against the catalog
 * (the pure reconcileConfig), and writes AT MOST ONCE and only when the
 * reconcile reports `changed`, via write-temp-then-rename with a
 * concurrent-modification re-stat guard. Every failure is returned as a
 * structured, NON-FATAL outcome — this function never throws at its caller.
 *
 * ── DEVIATION NOTE (recorded per the LLD; mirrored in the LLD amendment) ──
 *
 * (a) PATHS.config supersedes the `globalConfigDirs` contract entry and
 *     invariant c7. The LLD contract named `globalConfigDirs` (src/config/
 *     paths.ts) as the config resolver, but `globalConfigDirs()` returns
 *     `[templates, feedback, conventions]` — the config-DIRECTORY listing —
 *     and is NOT the config.json resolver. The daemon resolves the file
 *     solely through `PATHS.config` (src/shared/paths.ts), evidenced at
 *     src/daemon/index.ts:179 (existsSync(PATHS.config)) and the config.show/
 *     config.write handlers (src/daemon/index.ts:1118 / :1129 / :1144). So
 *     this wrapper resolves the path through PATHS.config, not globalConfigDirs.
 *
 * (b) Open question s8-sbdry3 — the CLI update path (maintenance.update, t12)
 *     writes ~/.insrc/config.json directly, in tension with the
 *     "daemon owns all on-disk state" rule. Alternative a4 (route the write
 *     through a daemon IPC) was REJECTED: update() runs to fast-forward and
 *     rebuild the daemon checkout and must work whether or not a daemon is
 *     currently listening (it may be mid-restart or stopped), so it cannot
 *     depend on the socket. The authoritative reconcile still runs at daemon
 *     boot (t9); the update-time reconcile is a best-effort convenience. The
 *     approver confirmed this direct-write deviation.
 */

import * as nodeFs from 'node:fs';

import { PATHS } from '../shared/paths.js';
import type { ConfigOption } from './config-catalog.js';
import {
	ConfigCatalogError,
	reconcileConfig,
	type ConfigReconcileResult,
} from './reconcile.js';

// ---------------------------------------------------------------------------
// fs seam — lets tests count writes / inject a changing stat, while the real
// bytes still land in a temp INSRC home.
// ---------------------------------------------------------------------------

export interface FsStat {
	readonly mtimeMs: number;
	readonly size:    number;
}

export interface ReconcileFsSeam {
	readFileSync(path: string, enc: 'utf-8'): string;
	statSync(path: string): FsStat;
	writeFileSync(path: string, data: string, enc: 'utf-8'): void;
	renameSync(from: string, to: string): void;
	unlinkSync(path: string): void;
}

const defaultFs: ReconcileFsSeam = {
	readFileSync: (p, enc) => nodeFs.readFileSync(p, enc),
	statSync:     (p) => { const s = nodeFs.statSync(p); return { mtimeMs: s.mtimeMs, size: s.size }; },
	writeFileSync: (p, data, enc) => nodeFs.writeFileSync(p, data, enc),
	renameSync:    (from, to) => nodeFs.renameSync(from, to),
	unlinkSync:    (p) => nodeFs.unlinkSync(p),
};

// ---------------------------------------------------------------------------
// Outcome — one structurally distinct kind per path, all non-fatal.
// ---------------------------------------------------------------------------

export type ConfigIoOutcome =
	/** Existing document reconciled and rewritten (1 writeFile + 1 rename). */
	| { readonly kind: 'written';     readonly result: ConfigReconcileResult }
	/** ENOENT — first boot: defaults written once (reconcileConfig(undefined)). */
	| { readonly kind: 'first-boot';  readonly result: ConfigReconcileResult }
	/** Reconcile reported no change → nothing written (steady state). */
	| { readonly kind: 'unchanged';   readonly result: ConfigReconcileResult }
	/** A non-ENOENT read errno (EACCES/EISDIR/…) — nothing written. */
	| { readonly kind: 'read-error';  readonly errno: string; readonly message: string }
	/** Corrupt/truncated/zero-byte JSON — aborts, NO default-fill fallback. */
	| { readonly kind: 'parse-error'; readonly message: string; readonly offset: number | undefined }
	/** Shipped-catalog bug (ConfigCatalogError) — distinct from user/I/O errors. */
	| { readonly kind: 'catalog-error'; readonly catalogPath: string; readonly message: string }
	/** writeFile/rename failed — temp unlinked, no partial doc; counts still in result. */
	| { readonly kind: 'write-error'; readonly message: string; readonly result: ConfigReconcileResult }
	/** File changed between the read stat and the pre-rename re-stat — write abandoned. */
	| { readonly kind: 'concurrent-modification'; readonly result: ConfigReconcileResult };

export interface ReconcileFileOpts {
	/** Config file path — defaults to PATHS.config. */
	readonly configPath?: string;
	/** Catalog to reconcile against — defaults to the built-in CONFIG_CATALOG. */
	readonly catalog?: readonly ConfigOption[];
	/** fs seam — defaults to node:fs. Tests pass a counting/injecting seam. */
	readonly fs?: ReconcileFsSeam;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** V8 SyntaxError messages carry `... at position N` / `... at line L column C
 *  (N)`; pull the byte offset out when present. */
function parseOffset(message: string): number | undefined {
	const m = message.match(/position (\d+)/) ?? message.match(/\((\d+)\)\s*$/);
	return m ? Number(m[1]) : undefined;
}

function reconcile(existing: unknown, catalog: readonly ConfigOption[] | undefined): ConfigReconcileResult {
	return catalog === undefined ? reconcileConfig(existing) : reconcileConfig(existing, catalog);
}

/** Serialize + write-temp-then-rename. `statBefore` is null for first-boot
 *  (no file to race). Returns 'written' / 'first-boot' / a failure kind. */
function commit(
	fs: ReconcileFsSeam,
	path: string,
	result: ConfigReconcileResult,
	kind: 'written' | 'first-boot',
	statBefore: FsStat | null,
): ConfigIoOutcome {
	const tmp = `${path}.tmp`;
	const serialized = `${JSON.stringify(result.config, null, 2)}\n`;

	// Concurrent-modification guard: re-stat right before writing and abandon
	// if the on-disk document changed under us (only meaningful when a file
	// existed at read time).
	if (statBefore !== null) {
		let statNow: FsStat | null = null;
		try { statNow = fs.statSync(path); } catch { statNow = null; }
		if (statNow !== null && (statNow.mtimeMs !== statBefore.mtimeMs || statNow.size !== statBefore.size)) {
			return { kind: 'concurrent-modification', result };
		}
	}

	try {
		fs.writeFileSync(tmp, serialized, 'utf-8');
	} catch (err) {
		try { fs.unlinkSync(tmp); } catch { /* best effort */ }
		return { kind: 'write-error', message: err instanceof Error ? err.message : String(err), result };
	}
	try {
		fs.renameSync(tmp, path);
	} catch (err) {
		try { fs.unlinkSync(tmp); } catch { /* best effort */ }
		return { kind: 'write-error', message: err instanceof Error ? err.message : String(err), result };
	}
	return { kind, result };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Read → reconcile → write-if-changed, once. Never throws: every failure is a
 * structured `ConfigIoOutcome`. Resolves the config path solely through
 * PATHS.config (no '~/.insrc' or 'config.json' string literal here).
 */
export function reconcileConfigFile(opts: ReconcileFileOpts = {}): ConfigIoOutcome {
	const path = opts.configPath ?? PATHS.config;
	const fs = opts.fs ?? defaultFs;

	// 1. Read the whole document once, stat'ing first so we can detect a
	//    concurrent modification before the rename.
	let statBefore: FsStat;
	let raw: string;
	try {
		statBefore = fs.statSync(path);
		raw = fs.readFileSync(path, 'utf-8');
	} catch (err) {
		const e = err as NodeJS.ErrnoException;
		if (e.code === 'ENOENT') {
			// First boot — no file. Reconcile undefined → catalog defaults, write once.
			return commit(fs, path, reconcile(undefined, opts.catalog), 'first-boot', null);
		}
		return { kind: 'read-error', errno: e.code ?? 'UNKNOWN', message: e.message };
	}

	// 2. Parse. A corrupt document ABORTS with nothing written — we do NOT
	//    fall back to reconcile(undefined), which would default-fill over (and
	//    destroy) the catalog-unenumerable dynamic namespaces.
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { kind: 'parse-error', message, offset: parseOffset(message) };
	}

	// 3. Reconcile. A ConfigCatalogError is a shipped-catalog bug — surface it
	//    as its own outcome kind, distinct from user-config and I/O failures.
	let result: ConfigReconcileResult;
	try {
		result = reconcile(parsed, opts.catalog);
	} catch (err) {
		if (err instanceof ConfigCatalogError) {
			return { kind: 'catalog-error', catalogPath: err.catalogPath, message: err.message };
		}
		return { kind: 'read-error', errno: 'RECONCILE', message: err instanceof Error ? err.message : String(err) };
	}

	// 4. Write only when changed.
	if (!result.changed) return { kind: 'unchanged', result };
	return commit(fs, path, result, 'written', statBefore);
}
