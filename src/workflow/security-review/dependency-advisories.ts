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

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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
