#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Post-tsc copy of non-TS runtime resources -- `assets/` and `prompts/` --
 * from `src/` into the tsc outDir `out/`.
 *
 * Background: tsc only emits compiled .js / .d.ts. The analyze framework's
 * boot validator + the artifact runtimes resolve prompt + asset paths
 * relative to import.meta.url, so the .md / asset trees MUST sit next to
 * the compiled .js or the daemon's startup fails with
 * AnalyzePromptValidationError.
 *
 * Wired into `npm run build` as `tsc && node copy-assets.mjs`.
 */

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here    = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, 'src');
const outRoot = resolve(here, 'out');

const DIRS = ['prompts', 'assets'];

let copied = 0;
for (const dir of DIRS) {
	const src = resolve(srcRoot, dir);
	if (!existsSync(src)) {
		console.log(`[copy-assets] skipping ${dir} (not present under src/)`);
		continue;
	}
	const dst = resolve(outRoot, dir);
	mkdirSync(dst, { recursive: true });
	cpSync(src, dst, { recursive: true });
	console.log(`[copy-assets] copied ${dir}/ -> ${dst}`);
	copied++;
}

if (copied === 0) {
	console.log('[copy-assets] no runtime resources to copy');
}
