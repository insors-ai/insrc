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
 * Runs after tsc and model-definition checks in `npm run build`. Compiler
 * input maps also bind the generated deployment manifest to these sources.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here    = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, 'src');
const outRoot = resolve(here, 'out');

const DIRS = ['prompts', 'assets'];
// tsc does not emit MJS resources; installed consumers import this adjacent copy.
const RUNTIME_FILES = ['installer/qualification-time-budgets.mjs', 'installer/operation-time-budgets.mjs'];

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
for (const name of RUNTIME_FILES) {
	const source = resolve(srcRoot, name), destination = resolve(outRoot, name);
	mkdirSync(dirname(destination), { recursive: true });
	cpSync(source, destination);
	if (!readFileSync(source).equals(readFileSync(destination))) throw new Error(`Runtime resource differs: ${name}`);
}

// Deployment-code attestation only; no repository inputs, settings or Session data.
// Emitted after tsc, so a later source edit cannot reuse an earlier compiled proof.
const sourceFiles = {}, compiledFiles = {};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function attest(directory, prefix = '') {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === '__tests__' || entry.name === '__type-tests__') continue;   // not emitted by tsc (tsconfig excludes them; typecheck:tools checks them)
		const name = prefix + entry.name, path = resolve(directory, entry.name);
		if (entry.isDirectory()) attest(path, name + '/');
		else if (entry.isFile() && /\.tsx?$/.test(name) && !/\.(?:d|test)\.tsx?$/.test(name)) {
			const compiled = name.replace(/\.tsx?$/, '.js');
			const source = readFileSync(path), map = JSON.parse(readFileSync(resolve(outRoot, compiled + '.map'), 'utf8'));
			if (!Array.isArray(map.sourcesContent) || map.sourcesContent.length !== 1 || map.sourcesContent[0] !== source.toString('utf8')) throw new Error(`Compiled source differs for ${name}; run npm run build.`);
			sourceFiles[name] = digest(source);
			compiledFiles[compiled] = digest(readFileSync(resolve(outRoot, compiled)));
		}
	}
}
attest(srcRoot);
for (const name of RUNTIME_FILES) {
	sourceFiles[name] = digest(readFileSync(resolve(srcRoot, name)));
	compiledFiles[name] = digest(readFileSync(resolve(outRoot, name)));
}
mkdirSync(resolve(outRoot, 'assets'), { recursive: true });
writeFileSync(resolve(outRoot, 'assets/connection-management-build.json'), JSON.stringify({ version: 1, producerDigest: digest(readFileSync(fileURLToPath(import.meta.url))), sourceFiles, compiledFiles }, null, 2) + '\n');
