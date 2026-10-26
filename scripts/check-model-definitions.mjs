#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Build gate: validate the shipped model definitions structurally with the
 * daemon's own validator (Epic ce99b72065d03b1b, s3).
 *
 * Wired into `npm run build` as `tsc && node scripts/check-model-definitions.mjs
 * && node copy-assets.mjs`. tsc already rejects a syntactically broken file (it
 * is imported as a JSON module); this catches a structurally invalid one, so the
 * build — and the installer, which runs it under `set -euo pipefail` — fails
 * before a daemon is configured or started.
 *
 * Validates src/assets/models with the built out/daemon/model-catalog.js. The
 * environment cannot redirect it: the build always checks the shipped file.
 * Tests pass `--dir <dir>` and `--module <validator module>` explicitly.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
// Set, not defaulted: an inherited INSRC_MODEL_CATALOG_DIR must not redirect the build's check.
process.env.INSRC_MODEL_CATALOG_DIR = resolve(arg('--dir') ?? resolve(root, 'src', 'assets', 'models'));
const modulePath = resolve(arg('--module') ?? resolve(root, 'out', 'daemon', 'model-catalog.js'));

const { validateModelCatalog } = await import(pathToFileURL(modulePath).href);
try {
	const file = validateModelCatalog();
	console.log(`[check-model-definitions] model definitions v${file.version} valid (${process.env.INSRC_MODEL_CATALOG_DIR})`);
} catch (err) {
	console.error(`[check-model-definitions] ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
