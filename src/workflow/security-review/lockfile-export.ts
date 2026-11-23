/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Lockfile export (s2/t5), Epic add-dedicated-security-reviews.
 *
 * For pipenv/poetry, generates a requirementsPath from Pipfile.lock/poetry.lock
 * containing only plain-PyPI-sourced, faithfully-representable entries -- a
 * git/path/url-sourced (or otherwise non-default-source) entry is excluded and
 * recorded as a non-standard-source gap. For plain pip, requirements.txt is
 * used directly and never rewritten; an entry that is not an exact pin is
 * recorded as version-uncertain.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface LockfileExportResult {
	readonly requirementsPath: string;
	readonly unresolvedDependencies: readonly string[];
}

interface PoetryPackage {
	readonly name: string;
	readonly version: string;
	readonly excluded: boolean;
	readonly excludedReason: string;
}

/** Strips a trailing TOML comment (from the first unquoted '#' onward) --
 *  '#' inside a '...' or "..." string is not a comment marker. */
function stripTomlComment(line: string): string {
	let quote: '"' | '\'' | undefined;
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (quote !== undefined) {
			if (ch === quote) { quote = undefined; }
			continue;
		}
		if (ch === '"' || ch === '\'') { quote = ch; continue; }
		if (ch === '#') { return line.slice(0, i); }
	}
	return line;
}

/** poetry.lock's own regular, bounded shape: repeated `[[package]]` blocks each
 *  with `name`/`version` keys, optionally followed by a `[package.source]`
 *  sub-table (or an inline `source = { ... }` table on the block itself) when
 *  the package did not come from the default PyPI index. Not a general TOML
 *  parser -- scoped to exactly this file's known structure. */
function parsePoetryLock(content: string): PoetryPackage[] {
	const packages: PoetryPackage[] = [];
	let current: { name?: string; version?: string; excluded: boolean; excludedReason: string } | undefined;
	let inSourceSection = false;

	const flush = (): void => {
		if (current?.name !== undefined && current.version !== undefined) {
			packages.push({ name: current.name, version: current.version, excluded: current.excluded, excludedReason: current.excludedReason });
		}
	};
	const exclude = (reason: string): void => {
		if (current !== undefined && !current.excluded) { current.excluded = true; current.excludedReason = reason; }
	};

	for (const rawLine of content.split('\n')) {
		const line = stripTomlComment(rawLine).trim();
		if (line === '[[package]]') {
			flush();
			current = { excluded: false, excludedReason: '' };
			inSourceSection = false;
			continue;
		}
		if (current === undefined) { continue; }
		if (line === '[package.source]') {
			inSourceSection = true;
			continue;
		}
		if (line.startsWith('[')) {
			inSourceSection = false;
			continue;
		}
		// TOML allows a basic string in either "double" or 'single' quotes --
		// a [package.source]/inline source table using either must still be
		// recognized as naming a source type.
		if (inSourceSection) {
			if (/^type\s*=\s*['"]/.test(line)) { exclude('non-standard source (not plain PyPI)'); }
			continue;
		}
		if (/^source\s*=\s*\{/.test(line) && /type\s*=\s*['"]/.test(line)) {
			exclude('non-standard source (not plain PyPI)');
			continue;
		}
		// A 'markers' key (poetry's environment-marker condition on the
		// package) means a bare 'name==version' line would drop the
		// condition the lock recorded it under -- not faithfully
		// representable in plain requirements.txt syntax.
		if (/^markers\s*=\s*['"]/.test(line)) {
			exclude('environment-marker-conditional, not faithfully representable as a plain pin');
			continue;
		}
		const m = /^(\w[\w.-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/.exec(line);
		const value = m?.[2] ?? m?.[3];
		if (value === undefined) { continue; }
		if (m?.[1] === 'name') { current.name = value; }
		else if (m?.[1] === 'version') { current.version = value; }
	}
	flush();
	return packages;
}

interface PipenvPackage {
	readonly name: string;
	readonly spec: string | undefined;
	readonly excluded: boolean;
	readonly excludedReason: string;
}

/** A Pipfile.lock-named index is the default PyPI source -- not a private
 *  one -- when `_meta.sources` resolves that name to the standard PyPI
 *  simple-index URL. Pipenv writes an explicit `index: "pypi"` on an
 *  ordinary entry whenever the Pipfile names its source at all (a common,
 *  normal shape -- not evidence of a private index on its own); only a name
 *  resolving to a DIFFERENT url is actually non-default. */
function resolvePypiSourceNames(data: Record<string, unknown>): ReadonlySet<string> {
	const names = new Set<string>();
	const meta = isRecord(data._meta) ? data._meta : undefined;
	const sources = Array.isArray(meta?.sources) ? meta.sources : [];
	for (const source of sources) {
		if (!isRecord(source) || typeof source.name !== 'string' || typeof source.url !== 'string') { continue; }
		if (/^https?:\/\/pypi\.org\/simple\/?$/i.test(source.url.trim())) { names.add(source.name); }
	}
	return names;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

/** Pipfile.lock is plain JSON -- no custom parsing needed. An entry carrying
 *  'git' / 'path' / 'file' / 'url' is a non-default source regardless of
 *  whether it also carries a 'version'; an 'index' key names a secondary
 *  (private) package index UNLESS it resolves, via `_meta.sources`, to the
 *  standard PyPI url; a 'markers' key (an environment-marker condition) is
 *  not faithfully representable as a bare pin either. */
function parsePipfileLock(content: string): PipenvPackage[] {
	const data = JSON.parse(content) as Record<string, unknown>;
	const pypiSourceNames = resolvePypiSourceNames(data);
	const packages: PipenvPackage[] = [];
	for (const section of ['default', 'develop']) {
		const group = data[section];
		if (group === null || typeof group !== 'object') { continue; }
		for (const [name, raw] of Object.entries(group as Record<string, unknown>)) {
			if (raw === null || typeof raw !== 'object') { continue; }
			const entry = raw as Record<string, unknown>;
			const spec = typeof entry.version === 'string' ? entry.version : undefined;
			let excluded = false;
			let excludedReason = '';
			if (typeof entry.git === 'string' || typeof entry.path === 'string' || typeof entry.file === 'string' || typeof entry.url === 'string') {
				excluded = true;
				excludedReason = 'non-standard source (not plain PyPI)';
			} else if (typeof entry.index === 'string' && !pypiSourceNames.has(entry.index)) {
				excluded = true;
				excludedReason = 'resolved from a secondary package index (not plain PyPI)';
			} else if (typeof entry.markers === 'string') {
				excluded = true;
				excludedReason = 'environment-marker-conditional, not faithfully representable as a plain pin';
			}
			packages.push({ name, spec, excluded, excludedReason });
		}
	}
	return packages;
}

/**
 * Generates a fresh, per-call-unique requirements.txt from `manager`'s
 * lockfile in manifestDir, containing only plain-PyPI-sourced, exactly-locked
 * entries. Every excluded (non-standard-source) entry is recorded in
 * unresolvedDependencies rather than silently dropped.
 */
export function generateLockfileExport(manager: 'pipenv' | 'poetry', manifestDir: string): LockfileExportResult {
	const lockFile = manager === 'poetry' ? join(manifestDir, 'poetry.lock') : join(manifestDir, 'Pipfile.lock');
	const content = readFileSync(lockFile, 'utf8');
	const lines: string[] = [];
	const unresolvedDependencies: string[] = [];

	if (manager === 'poetry') {
		for (const pkg of parsePoetryLock(content)) {
			if (pkg.excluded) {
				unresolvedDependencies.push(`${pkg.name}: ${pkg.excludedReason} -- excluded from generated requirements export`);
				continue;
			}
			lines.push(`${pkg.name}==${pkg.version}`);
		}
	} else {
		for (const pkg of parsePipfileLock(content)) {
			if (pkg.excluded || pkg.spec === undefined) {
				unresolvedDependencies.push(`${pkg.name}: ${pkg.excludedReason || 'non-standard source (not plain PyPI)'} -- excluded from generated requirements export`);
				continue;
			}
			lines.push(`${pkg.name}${pkg.spec}`);
		}
	}

	const dir = mkdtempSync(join(tmpdir(), 'insrc-requirements-export-'));
	const requirementsPath = join(dir, 'requirements.txt');
	writeFileSync(requirementsPath, lines.length > 0 ? `${lines.join('\n')}\n` : '');
	return { requirementsPath, unresolvedDependencies };
}

/**
 * Scans plain pip's own requirements.txt (never rewritten) for an entry that
 * is not an exact '==' pin, recording each as version-uncertain.
 */
export function findVersionUncertainPipRequirements(requirementsPath: string): string[] {
	const content = readFileSync(requirementsPath, 'utf8');
	const uncertain: string[] = [];
	for (const rawLine of content.split('\n')) {
		const line = rawLine.replace(/\s+#.*$/, '').trim();
		if (line.length === 0 || line.startsWith('#') || line.startsWith('-')) { continue; }
		const withoutMarker = (line.split(';')[0] ?? line).trim();
		const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(.*)$/.exec(withoutMarker);
		if (m?.[1] === undefined) { continue; }
		const [, name, , rest] = m;
		// '==2.*' is pip's wildcard match syntax, not an exact pin -- a '*'
		// anywhere in the version makes it a range, however it is spelled.
		const isExactPin = /^==\s*[^,;\s*]+$/.test((rest ?? '').trim());
		if (!isExactPin) {
			uncertain.push(`${name}: version-uncertain (${line})`);
		}
	}
	return uncertain;
}
