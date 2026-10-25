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
 * Validates src/assets/models unless INSRC_MODEL_CATALOG_DIR names another
 * directory. INSRC_MODEL_CATALOG_MODULE overrides the validator module (default:
 * the built out/daemon/model-catalog.js).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.INSRC_MODEL_CATALOG_DIR ??= resolve(root, 'src', 'assets', 'models');
const modulePath = process.env.INSRC_MODEL_CATALOG_MODULE ?? resolve(root, 'out', 'daemon', 'model-catalog.js');

const { validateModelCatalog } = await import(pathToFileURL(modulePath).href);
try {
	const file = validateModelCatalog();
	console.log(`[check-model-definitions] model definitions v${file.version} valid (${process.env.INSRC_MODEL_CATALOG_DIR})`);
} catch (err) {
	console.error(`[check-model-definitions] ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
