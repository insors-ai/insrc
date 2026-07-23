/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Repo-type detection — used to seed a repo's ignore config when it has no
 * `.gitignore`. Composed from marker files (the same signals the `pkg` tool +
 * the JVM manifest parser already key off): a repo can be more than one type
 * (e.g. a polyglot monorepo), so `detectRepoType` returns every match.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type RepoType = 'node' | 'python' | 'java' | 'go' | 'rust';

/** Marker files that identify each repo type at the repo root. */
const MARKERS: Record<RepoType, readonly string[]> = {
	node:   ['package.json'],
	python: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'],
	java:   ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle'],
	go:     ['go.mod'],
	rust:   ['Cargo.toml'],
};

/** Build-output / cache dirs to ignore, per repo type. */
const TYPE_IGNORE_DIRS: Record<RepoType, readonly string[]> = {
	node:   ['node_modules', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage'],
	python: ['__pycache__', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', 'build', 'dist', '*.egg-info'],
	java:   ['target', 'build', '.gradle', 'out'],
	go:     ['vendor', 'bin'],
	rust:   ['target'],
};

/** Detect every repo type whose marker file is present at `repoRoot`. */
export function detectRepoType(repoRoot: string): RepoType[] {
	const out: RepoType[] = [];
	for (const [type, markers] of Object.entries(MARKERS) as [RepoType, readonly string[]][]) {
		if (markers.some(m => existsSync(join(repoRoot, m)))) out.push(type);
	}
	return out;
}

/** Union of the ignore dirs for the given repo types (deduped, sorted). */
export function repoTypeIgnoreDirs(types: readonly RepoType[]): string[] {
	const set = new Set<string>();
	for (const t of types) for (const d of TYPE_IGNORE_DIRS[t]) set.add(d);
	return [...set].sort();
}
