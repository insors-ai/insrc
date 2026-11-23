/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Dependency-advisory collection (sc2), Epic add-dedicated-security-reviews, s2.
 *
 * A standalone orchestration module OUTSIDE src/workflow/review-round/ (HLD
 * decision 8.2, a2): review-round stays generic; this module owns the
 * dependency-advisory pass and populates review-round's existing
 * SecurityFinding/EvidenceProvider shapes without redefining them.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import type { Manager } from '../../daemon/tools/builtins/pkg/index.js';
import type { ReviewTargets } from '../artifact-core/types.js';

// ---------------------------------------------------------------------------
// enumerateManagers (s2/t2)
// ---------------------------------------------------------------------------

/** One manager's manifest/lockfile found in a given directory. */
export interface ManagerLocation {
	readonly manager:     Manager;
	readonly manifestDir: string;
}

/** A directory where two or more managers of the SAME family (js: npm/pnpm/yarn;
 *  python: pip/pipenv/poetry) were found -- enumerateManagers never silently
 *  picks one. */
export interface ManagerAmbiguity {
	readonly directory: string;
	readonly managers:  readonly Manager[];
}

export interface ManagerEnumeration {
	readonly managers:   readonly ManagerLocation[];
	readonly ambiguities: readonly ManagerAmbiguity[];
}

/** Manager families: two or more detected in the SAME directory is an
 *  unresolved ambiguity, never resolved by precedence. */
const FAMILIES: ReadonlyArray<readonly Manager[]> = [
	['npm', 'pnpm', 'yarn'],
	['pip', 'pipenv', 'poetry'],
	['go'],
	['cargo'],
];

/** The file(s) that, on their own, identify a manager's manifest/lockfile in a
 *  directory -- mirrors src/daemon/tools/builtins/pkg/index.ts's own
 *  detectManager pairs, but every manager is checked independently (no
 *  first-match precedence) so two managers present together are never hidden. */
const MANIFEST_FILES: ReadonlyArray<readonly [string, Manager]> = [
	['pnpm-lock.yaml', 'pnpm'],
	['yarn.lock', 'yarn'],
	['package-lock.json', 'npm'],
	['poetry.lock', 'poetry'],
	['Pipfile.lock', 'pipenv'],
	['go.sum', 'go'],
	['Cargo.lock', 'cargo'],
];
/** A bare manifest with no lockfile still identifies its manager, checked only
 *  when no lockfile already did (so e.g. package.json does not also register
 *  as a second npm hit alongside package-lock.json). */
const BARE_MANIFEST_FILES: ReadonlyArray<readonly [string, Manager]> = [
	['package.json', 'npm'],
	['requirements.txt', 'pip'],
	['pyproject.toml', 'pip'],
	['go.mod', 'go'],
	['Cargo.toml', 'cargo'],
];

/** Directories never descended into: build/dependency output that would only
 *  ever yield spurious, out-of-scope manifests. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '__pycache__', '.venv', 'venv']);

function managersInDir(dir: string, entries: readonly string[]): Manager[] {
	const found = new Set<Manager>();
	for (const [file, manager] of MANIFEST_FILES) {
		if (entries.includes(file)) { found.add(manager); }
	}
	for (const [file, manager] of BARE_MANIFEST_FILES) {
		if (entries.includes(file) && !found.has(manager)) { found.add(manager); }
	}
	return [...found];
}

function familyOf(manager: Manager): readonly Manager[] {
	return FAMILIES.find(f => f.includes(manager)) ?? [manager];
}

/**
 * Walks repoPath to find every manager's manifest/lockfile. `targets` is
 * accepted for API symmetry with computeContentIdentity/collectDependencyAdvisories
 * (sc2's other functions all take the same (repoPath, targets) pair); enumeration
 * itself is a plain filesystem discovery pass over repoPath, not scoped by targets.
 *
 * Two managers of the SAME family found in one directory are never resolved by
 * precedence: that directory's family is recorded as an ambiguity instead of a
 * ManagerLocation.
 */
export function enumerateManagers(repoPath: string, _targets: ReviewTargets): ManagerEnumeration {
	const managers: ManagerLocation[] = [];
	const ambiguities: ManagerAmbiguity[] = [];

	const walk = (dir: string): void => {
		let entries: import('node:fs').Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		const fileNames = entries.filter(e => e.isFile()).map(e => e.name);
		const detected = managersInDir(dir, fileNames);
		const byFamily = new Map<readonly Manager[], Manager[]>();
		for (const manager of detected) {
			const family = familyOf(manager);
			const list = byFamily.get(family) ?? [];
			list.push(manager);
			byFamily.set(family, list);
		}
		for (const [, familyManagers] of byFamily) {
			if (familyManagers.length > 1) {
				ambiguities.push({ directory: dir, managers: familyManagers });
			} else {
				managers.push({ manager: familyManagers[0] as Manager, manifestDir: dir });
			}
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) { continue; }
			walk(join(dir, entry.name));
		}
	};

	walk(repoPath);
	return { managers, ambiguities };
}

// ---------------------------------------------------------------------------
// verifyManagerClosureCoverage (s2/t4)
// ---------------------------------------------------------------------------

export type ClosureCoverage =
	| { readonly covered: true }
	| { readonly covered: false; readonly missing: readonly string[] };

/** A requirements.txt-shaped file's own nested `-r <file>` / `-c <file>`
 *  references, resolved recursively and relative to the referencing file's
 *  own directory (pip's own convention). Re-reads from disk on every call --
 *  no caching, so a file added between two calls is always picked up fresh. */
function resolveRequirementsClosure(file: string, seen: Set<string>): string[] {
	if (seen.has(file)) { return []; }
	seen.add(file);
	const result = [file];
	let content: string;
	try {
		content = readFileSync(file, 'utf8');
	} catch {
		return result;
	}
	// pip joins a line ending in a trailing '\' with the physical line that
	// follows it before parsing -- a '-r' directive split across lines with a
	// line-continuation backslash names one logical reference, not a literal
	// path ending in '\'.
	const logicalLines = content.split('\n').reduce<string[]>((lines, raw) => {
		const prev = lines.at(-1);
		if (prev !== undefined && prev.endsWith('\\')) {
			lines[lines.length - 1] = prev.slice(0, -1) + raw;
		} else {
			lines.push(raw);
		}
		return lines;
	}, []);
	for (const line of logicalLines) {
		// pip accepts both `-r file` and the glued `-rfile` form for -r/-c.
		const m = /^\s*-(?:r|c)\s*(\S.*)$/.exec(line);
		if (m?.[1] !== undefined) {
			// requirements.txt allows a trailing inline comment on any line
			// (` # note`); strip it before treating the remainder as the path,
			// so e.g. `-r more.txt  # dev deps` resolves to `more.txt`, not the
			// literal, nonexistent `more.txt  # dev deps`.
			const ref = m[1].replace(/\s+#.*$/, '').trim();
			if (ref.length > 0) {
				result.push(...resolveRequirementsClosure(resolve(dirname(file), ref), seen));
			}
		}
	}
	return result;
}

/** The only directory never part of a go module's required-input closure:
 *  VCS metadata, which the go build never reads. Deliberately NOT 'vendor'
 *  (a vendored dependency IS compiled by `go build` when present -- excluding
 *  it would under-report the closure the same way an extension allowlist
 *  did) and NOT src/daemon/tools/builtins/pkg's or this module's own
 *  enumerateManagers SKIP_DIRS (build/dist/target are JS/Rust output-directory
 *  conventions, not reserved names in Go). */
const GO_CLOSURE_SKIP_DIRS = new Set(['.git']);

/**
 * A go module's full source tree under manifestDir: EVERY regular file,
 * recursively, except .git/vendor. Deliberately not an extension allowlist
 * (.go/.s/.c/.h/... can never be exhaustive -- Go/cgo also link .S, .cc,
 * .m, .f90 and others; go:embed can name any file at all) -- any such list
 * is always one more real extension away from an incomplete closure. A full
 * walk also trivially includes every //go:embed-referenced file: Go itself
 * forbids an embed pattern from reaching outside the package's own directory
 * ('..' and a leading '/' are rejected), so an embedded file is always
 * already somewhere under manifestDir.
 */
function resolveGoClosure(manifestDir: string): string[] {
	const files: string[] = [];
	const walk = (dir: string): void => {
		let entries: import('node:fs').Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (!GO_CLOSURE_SKIP_DIRS.has(entry.name)) { walk(join(dir, entry.name)); }
				continue;
			}
			files.push(join(dir, entry.name));
		}
	};
	walk(manifestDir);
	return files;
}

const DEFAULT_CLOSURE_FILES: Partial<Record<Manager, readonly string[]>> = {
	npm:   ['package.json', 'package-lock.json'],
	pnpm:  ['package.json', 'pnpm-lock.yaml'],
	yarn:  ['package.json', 'yarn.lock'],
	cargo: ['Cargo.toml', 'Cargo.lock'],
};

/** This manager's own required-input closure, re-resolved fresh (never cached)
 *  on every call: nested -r/-c references for pip-family, the full source
 *  tree for go, the manifest+lockfile pair for the rest.
 *
 *  Only the GUESSED default names (npm/pnpm/yarn/cargo's own manifest+lockfile
 *  pair, which this function does not know for certain both exist) are
 *  filtered by existsSync. pip/go's own closures are actually DISCOVERED (a
 *  real -r/-c reference the manifest names, or a file readdirSync found) --
 *  filtering those by existence would silently drop a genuinely-referenced
 *  but missing file from the closure instead of correctly reporting it as
 *  missing from targets.entries. */
function resolveClosure(manager: Manager, manifestDir: string): string[] {
	if (manager === 'go') { return resolveGoClosure(manifestDir); }
	if (manager === 'pip') { return resolveRequirementsClosure(join(manifestDir, 'requirements.txt'), new Set()); }
	if (manager === 'pipenv') { return [join(manifestDir, 'Pipfile.lock')]; }
	if (manager === 'poetry') { return [join(manifestDir, 'poetry.lock')]; }
	return (DEFAULT_CLOSURE_FILES[manager] ?? []).map(name => join(manifestDir, name)).filter(existsSync);
}

/**
 * Re-resolves `manager`'s required-input closure AT THE TIME OF THE CALL (not
 * a cached result) and checks whether every file currently in it is present
 * in targets.entries. Never mutates targets.entries, manifestDir or any other
 * input -- purely a read-only coverage check.
 */
export async function verifyManagerClosureCoverage(repoPath: string, targets: ReviewTargets, manager: Manager, manifestDir: string): Promise<ClosureCoverage> {
	const closure = resolveClosure(manager, manifestDir);
	const scoped = new Set(targets.entries.map(e => resolve(repoPath, e.path)));
	const missing = closure.filter(f => !scoped.has(resolve(f))).map(f => relative(repoPath, f));
	return missing.length === 0 ? { covered: true } : { covered: false, missing };
}
