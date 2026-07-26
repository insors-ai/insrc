/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Standalone loader for the FRESHLY-BUILT config catalog.
 *
 * WHY THIS EXISTS (the stale-catalog hazard): `maintenance.update` runs
 * inside a long-lived CLI process that already holds the PRE-update
 * CONFIG_CATALOG in its module graph. `npm run build` rewrites `out/`
 * underneath it, but the resident module binding does not change — so an
 * in-process `reconcileConfig` against the statically-imported catalog is a
 * no-op for exactly the schema change an update is meant to apply, and is
 * indistinguishable from "already normalized".
 *
 * RESOLUTION (a, with fallback b): after the build, load the freshly built
 * catalog module via dynamic `import()` of the build output and pass it as
 * reconcileConfig's injectable `catalog` argument. On import rejection fall
 * back to (b) — the update path reports only and DEFERS the authoritative
 * reconcile to the next daemon boot (src/daemon/index.ts step 2b), never
 * claiming a confident no-change against the stale in-memory catalog.
 *
 * This helper implements (a): it returns the freshly imported catalog or
 * `null` on any failure (missing/moved output, malformed module). The
 * call-site wiring + fallback (b) live in maintenance.update (t12).
 */

import { pathToFileURL } from 'node:url';
import type { ConfigOption } from './config-catalog.js';

/** Shallow shape check — a non-empty array of `{ path, type, default, desc }`
 *  rows. Guards against importing a module that resolved but does not export
 *  a real catalog. */
function looksLikeCatalog(v: unknown): v is readonly ConfigOption[] {
	if (!Array.isArray(v) || v.length === 0) return false;
	return v.every(row =>
		row !== null && typeof row === 'object'
		&& typeof (row as { path?: unknown }).path === 'string'
		&& typeof (row as { type?: unknown }).type === 'string'
		&& 'default' in (row as object)
		&& typeof (row as { desc?: unknown }).desc === 'string');
}

/**
 * Import the built catalog module at `builtCatalogPath` (an absolute fs path
 * to the compiled `config-catalog.js`) and return its CONFIG_CATALOG. Returns
 * `null` — never throws — when the output is missing/moved or the module does
 * not export a well-formed, non-empty catalog, so the caller can defer to
 * boot rather than trust a stale in-memory catalog.
 */
export async function loadBuiltCatalog(builtCatalogPath: string): Promise<readonly ConfigOption[] | null> {
	try {
		const mod = await import(pathToFileURL(builtCatalogPath).href) as { CONFIG_CATALOG?: unknown };
		return looksLikeCatalog(mod.CONFIG_CATALOG) ? mod.CONFIG_CATALOG : null;
	} catch {
		return null;
	}
}
