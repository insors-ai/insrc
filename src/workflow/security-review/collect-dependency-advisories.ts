/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * collectDependencyAdvisories (s2/t6), Epic add-dedicated-security-reviews.
 *
 * Orchestrates sc2's full dependency-advisory collection: pins contentIdentity
 * before any manager runs, enumerates every manager, audits each one (gated
 * by its required-input closure, checked both before and after its audit),
 * maps raw pkg_audit output into SecurityAdvisoryMatch[], and re-verifies
 * contentIdentity once more after the last manager completes. Entirely
 * controller-side, deterministic code -- no model, tool-loop or CLI session
 * is involved (HLD s2).
 */

import { dirname } from 'node:path';
import { rmSync } from 'node:fs';

import { pkgAuditTool, type Manager } from '../../daemon/tools/builtins/pkg/index.js';
import type { ToolDeps, ToolInput, ToolResult } from '../../daemon/tools/types.js';
import type { ReviewTargets } from '../artifact-core/types.js';
import { computeContentIdentity } from './content-identity.js';
import { enumerateManagers, verifyManagerClosureCoverage } from './dependency-advisories.js';
import { findVersionUncertainPipRequirements, generateLockfileExport } from './lockfile-export.js';

export interface SecurityAdvisoryMatch {
	readonly coordinate: string;
	readonly advisoryId: string;
	readonly affectedVersions: string;
	readonly severity: string;
	readonly provenance: string;
	readonly advisoryDestination: string;
}

export type PerManagerMode = 'manifest-scoped' | 'isolated-environment' | 'confined-source-copy' | 'unsupported';

export interface PerManagerModeEntry {
	readonly manager: string;
	readonly mode: PerManagerMode;
	readonly configuredDestination?: string;
}

export interface SecurityAdvisoryEvidence {
	readonly contentIdentity: string;
	readonly contentStable: boolean;
	readonly readOnly: true;
	readonly queriedCoordinates: readonly string[];
	readonly matches: readonly SecurityAdvisoryMatch[];
	readonly perManagerMode: readonly PerManagerModeEntry[];
	readonly unresolvedDependencies: readonly string[];
	readonly unavailableSources: readonly string[];
}

/** The per-manager input/mode mapping (HLD s2, a correctness/targeting
 *  concern, not an isolation one): npm/pnpm/yarn/cargo read their own
 *  manifest+lockfile; pip/pipenv/poetry are pointed at the repository's own
 *  resolved environment (never the ambient active one pip-audit defaults
 *  to); go analyzes the module's own source directly. */
const MANAGER_MODE: Record<Manager, PerManagerMode> = {
	npm: 'manifest-scoped', pnpm: 'manifest-scoped', yarn: 'manifest-scoped', cargo: 'manifest-scoped',
	pip: 'isolated-environment', pipenv: 'isolated-environment', poetry: 'isolated-environment',
	go: 'confined-source-copy',
};

/** The manager's own CONFIGURED advisory destination -- explicitly a
 *  configured value, never claimed as independently observed (pkg_audit's
 *  own output carries no network trace to observe from). */
const MANAGER_DESTINATION: Record<Manager, string> = {
	npm: 'https://registry.npmjs.org (npm audit)',
	pnpm: 'https://registry.npmjs.org (pnpm audit)',
	yarn: 'https://registry.npmjs.org (yarn audit)',
	cargo: 'https://rustsec.org (cargo-audit advisory database)',
	pip: 'PyPI Advisory Database (pip-audit)',
	pipenv: 'PyPI Advisory Database (pip-audit)',
	poetry: 'PyPI Advisory Database (pip-audit)',
	go: 'https://vuln.go.dev (govulncheck)',
};

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

/** pip-audit's JSON output: either a bare array of dependency entries, or
 *  `{ dependencies: [...] }`, each `{ name, version, vulns: [...] }`. A
 *  dependency with an empty `vulns` ARRAY is a cleanly-checked coordinate; a
 *  dependency carrying no `vulns` key at all (or a non-array value) was never
 *  actually checked by pip-audit -- an unresolved coordinate, not a clean
 *  one, so it must never be reported as cleanly audited. */
function mapPipAuditOutput(parsed: unknown, advisoryDestination: string, coordinatePrefix: string): { matches: SecurityAdvisoryMatch[]; cleanCoordinates: string[]; unresolvedCoordinates: string[] } | undefined {
	const deps = Array.isArray(parsed) ? parsed : (isRecord(parsed) && Array.isArray(parsed.dependencies) ? parsed.dependencies : undefined);
	if (deps === undefined) { return undefined; }
	const matches: SecurityAdvisoryMatch[] = [];
	const cleanCoordinates: string[] = [];
	const unresolvedCoordinates: string[] = [];
	for (const dep of deps) {
		if (!isRecord(dep) || typeof dep.name !== 'string') { continue; }
		const version = typeof dep.version === 'string' ? dep.version : '';
		const coordinate = `${coordinatePrefix}${dep.name}@${version}`;
		if (!Array.isArray(dep.vulns)) { unresolvedCoordinates.push(coordinate); continue; }
		if (dep.vulns.length === 0) { cleanCoordinates.push(coordinate); continue; }
		// A non-empty vulns array whose entries are all malformed (not an
		// object -- e.g. [null]) carries no usable advisory data; it is NOT
		// a clean report (pip-audit reported something) and must not be
		// silently dropped -- route it to unresolved like any other
		// not-definitely-resolved coordinate.
		let matchedAny = false;
		for (const vuln of dep.vulns) {
			if (!isRecord(vuln)) { continue; }
			matchedAny = true;
			matches.push({
				coordinate,
				advisoryId: typeof vuln.id === 'string' ? vuln.id : 'unknown',
				affectedVersions: Array.isArray(vuln.fix_versions) && vuln.fix_versions.length > 0 ? `fixed in ${(vuln.fix_versions as unknown[]).join(', ')}` : version,
				severity: 'unknown',
				provenance: 'pip-audit',
				advisoryDestination,
			});
		}
		if (!matchedAny) { unresolvedCoordinates.push(coordinate); }
	}
	return { matches, cleanCoordinates, unresolvedCoordinates };
}

/** npm/pnpm's `audit --json` output: `{ vulnerabilities: { <pkgName>: { range, severity, via: [...] } } }`.
 *  Each `via` entry is EITHER an advisory object OR a bare string naming another
 *  vulnerable package this one depends on (npm's own "vulnerable via a dependency"
 *  chain notation) -- a `via` array that is non-empty but contains only strings
 *  still means this package IS vulnerable (transitively), just with no advisory
 *  details of its own in this entry; it must never be reported as cleanly audited. */
function mapNpmAuditOutput(parsed: unknown, advisoryDestination: string, provenance: string, coordinatePrefix: string): { matches: SecurityAdvisoryMatch[]; cleanCoordinates: string[]; unresolvedCoordinates: string[] } | undefined {
	if (!isRecord(parsed) || !isRecord(parsed.vulnerabilities)) { return undefined; }
	const matches: SecurityAdvisoryMatch[] = [];
	const cleanCoordinates: string[] = [];
	const unresolvedCoordinates: string[] = [];
	for (const [pkgName, rawInfo] of Object.entries(parsed.vulnerabilities)) {
		if (!isRecord(rawInfo)) { continue; }
		const range = typeof rawInfo.range === 'string' ? rawInfo.range : '';
		const coordinate = `${coordinatePrefix}${pkgName}@${range}`;
		const via = Array.isArray(rawInfo.via) ? rawInfo.via : [];
		const advisories = via.filter(isRecord);
		if (via.length === 0) { cleanCoordinates.push(coordinate); continue; }
		if (advisories.length === 0) { unresolvedCoordinates.push(coordinate); continue; }
		for (const advisory of advisories) {
			matches.push({
				coordinate,
				advisoryId: typeof advisory.url === 'string' ? advisory.url : String(advisory.source ?? pkgName),
				affectedVersions: typeof advisory.range === 'string' ? advisory.range : range,
				severity: typeof advisory.severity === 'string' ? advisory.severity : 'unknown',
				provenance,
				advisoryDestination,
			});
		}
	}
	return { matches, cleanCoordinates, unresolvedCoordinates };
}

/** cargo-audit's `--json` output: `{ vulnerabilities: { list: [ { package, advisory } ] } }`. cargo-audit does
 *  not list clean dependencies, only vulnerable ones -- no cleanCoordinates here. */
function mapCargoAuditOutput(parsed: unknown, advisoryDestination: string, coordinatePrefix: string): { matches: SecurityAdvisoryMatch[]; cleanCoordinates: string[]; unresolvedCoordinates: string[] } | undefined {
	if (!isRecord(parsed) || !isRecord(parsed.vulnerabilities) || !Array.isArray(parsed.vulnerabilities.list)) { return undefined; }
	const matches: SecurityAdvisoryMatch[] = [];
	for (const entry of parsed.vulnerabilities.list) {
		if (!isRecord(entry)) { continue; }
		const pkg = isRecord(entry.package) ? entry.package : {};
		const advisory = isRecord(entry.advisory) ? entry.advisory : {};
		matches.push({
			coordinate: `${coordinatePrefix}${typeof pkg.name === 'string' ? pkg.name : 'unknown'}@${typeof pkg.version === 'string' ? pkg.version : ''}`,
			advisoryId: typeof advisory.id === 'string' ? advisory.id : 'unknown',
			affectedVersions: typeof pkg.version === 'string' ? pkg.version : '',
			severity: typeof advisory.severity === 'string' ? advisory.severity : 'unknown',
			provenance: 'cargo audit',
			advisoryDestination,
		});
	}
	return { matches, cleanCoordinates: [], unresolvedCoordinates: [] };
}

/** Maps one manager's raw pkg_audit output into SecurityAdvisoryMatch[] plus the
 *  coordinates that were cleanly checked with no match. Returns undefined when
 *  the output cannot be structurally mapped (yarn's NDJSON, go's plain-text
 *  govulncheck output) -- an execution gap, recorded in unavailableSources by
 *  the caller, never a thrown error. */
function mapAuditOutput(manager: Manager, parsed: unknown, advisoryDestination: string): { matches: SecurityAdvisoryMatch[]; cleanCoordinates: string[]; unresolvedCoordinates: string[] } | undefined {
	// Every coordinate is prefixed with its own manager: different ecosystems
	// can share a bare package name (npm's and PyPI's own "flask" are
	// different packages) without being the same coordinate, so the prefix
	// is what makes coordinate-string equality actually mean "the same
	// dependency", both for matching/deduplication here and for the
	// exclusivity reconciliation in collectDependencyAdvisories.
	const coordinatePrefix = `${manager}:`;
	if (manager === 'pip' || manager === 'pipenv' || manager === 'poetry') { return mapPipAuditOutput(parsed, advisoryDestination, coordinatePrefix); }
	if (manager === 'npm' || manager === 'pnpm') { return mapNpmAuditOutput(parsed, advisoryDestination, `${manager} audit`, coordinatePrefix); }
	if (manager === 'cargo') { return mapCargoAuditOutput(parsed, advisoryDestination, coordinatePrefix); }
	return undefined;
}

interface PkgAuditResultData {
	readonly manager: string;
	readonly exitCode: number | null;
	readonly parsed: unknown;
	readonly stdout: string;
	readonly stderr: string;
}

function makeToolDeps(repoPath: string): ToolDeps {
	return { sessionId: 'security-review-s2', repoPath, send: () => undefined, requestId: 0, caller: 'workflow' };
}

/** The pkg_audit invocation, overridable for unit tests (so collectDependencyAdvisories'
 *  own orchestration logic can be exercised without a real subprocess). No argument
 *  resets to the real pkgAuditTool.execute. */
let runPkgAudit: (input: ToolInput, deps: ToolDeps) => Promise<ToolResult> = (input, deps) => pkgAuditTool.execute(input, deps);
export function _setPkgAuditExecuteForTests(fn?: (input: ToolInput, deps: ToolDeps) => Promise<ToolResult>): void {
	runPkgAudit = fn ?? ((input, deps) => pkgAuditTool.execute(input, deps));
}

/**
 * Orchestrates sc2's dependency-advisory collection for `repoPath` scoped to
 * `targets`. The FIRST computeContentIdentity call's own precondition
 * failure (e.g. repoPath not registered) propagates -- nothing has run yet,
 * so there is nothing to report gaps against. Every later failure (a
 * manager-level audit, closure-coverage check, or the post-collection
 * re-read) becomes an explicit perManagerMode entry, an unavailableSources
 * entry, or contentStable:false -- never an exception.
 */
export async function collectDependencyAdvisories(repoPath: string, targets: ReviewTargets): Promise<SecurityAdvisoryEvidence> {
	const contentIdentity = await computeContentIdentity(repoPath, targets);

	const { managers } = enumerateManagers(repoPath, targets);

	// A coordinate (manager-specific name@version string) is either a
	// lockfile-export gap/version-uncertain pin (recorded directly into
	// unresolvedDependencies, and -- for a lockfile-export exclusion --
	// structurally never reaches pkg_audit's own output at all, since t5
	// never writes it into the generated file) or one of pkg_audit's own
	// actually-audited outcomes (clean, a confirmed finding, or itself
	// unresolved per mapAuditOutput). The only EXACT-coordinate collision
	// that can occur within pkg_audit's own output is the same literal
	// coordinate string appearing as both a match and a clean report
	// (duplicate/conflicting raw entries); that is deduplicated after the
	// loop, below -- a confirmed finding always outranks a clean report of
	// the IDENTICAL coordinate. A bare package NAME shared between an
	// unresolved gap and an unrelated manager's own confirmed finding is
	// never suppressed: different managers/ecosystems can share a package
	// name without being the same coordinate (e.g. npm's and PyPI's own
	// "flask" are different packages), and a real finding must never be
	// dropped because of an unrelated input-fidelity note elsewhere.
	const rawMatches: SecurityAdvisoryMatch[] = [];
	const rawQueriedCoordinates: string[] = [];
	// Coordinates pkg_audit itself reported as unresolved (a missing 'vulns'
	// key, or a 'via' naming only other packages) -- tracked separately from
	// unresolvedDependencies' own free-text gap notes so an exact-coordinate
	// collision with a match or a clean report (duplicate/conflicting raw
	// entries for the identical coordinate, however unlikely) can still be
	// reconciled below by the SAME match > clean > unresolved priority.
	const rawUnresolvedCoordinates: string[] = [];
	const unresolvedDependencies: string[] = [];
	const unavailableSources: string[] = [];
	const perManagerMode: PerManagerModeEntry[] = [];
	let closureRegressed = false;

	for (const { manager, manifestDir } of managers) {
		const mode = MANAGER_MODE[manager];
		const configuredDestination = MANAGER_DESTINATION[manager];

		const preCoverage = await verifyManagerClosureCoverage(repoPath, targets, manager, manifestDir);
		if (!preCoverage.covered) {
			perManagerMode.push({ manager, mode: 'unsupported', configuredDestination });
			continue;
		}

		let requirementsPath: string | undefined;
		let noDeps = false;
		let cleanupDir: string | undefined;
		if (manager === 'pipenv' || manager === 'poetry') {
			try {
				const exported = generateLockfileExport(manager, manifestDir);
				requirementsPath = exported.requirementsPath;
				cleanupDir = dirname(exported.requirementsPath);
				noDeps = true;
				unresolvedDependencies.push(...exported.unresolvedDependencies);
			} catch (err) {
				perManagerMode.push({ manager, mode: 'unsupported', configuredDestination });
				unavailableSources.push(`${manager}: could not generate requirementsPath from its lockfile (${err instanceof Error ? err.message : String(err)})`);
				continue;
			}
		} else if (manager === 'pip') {
			requirementsPath = `${manifestDir}/requirements.txt`;
			unresolvedDependencies.push(...findVersionUncertainPipRequirements(requirementsPath));
		}

		try {
			const result = await runPkgAudit(
				{ cwd: manifestDir, manager, ...(requirementsPath !== undefined ? { requirementsPath } : {}), ...(noDeps ? { noDeps: true } : {}) },
				makeToolDeps(repoPath),
			);
			const data = result.data as PkgAuditResultData | undefined;
			if (data === undefined) {
				unavailableSources.push(`${manager}: ${result.error ?? 'audit execution failed'}`);
			} else {
				const mapped = mapAuditOutput(manager, data.parsed, configuredDestination);
				if (mapped === undefined) {
					unavailableSources.push(`${manager}: unparseable audit output`);
				} else {
					rawMatches.push(...mapped.matches);
					rawQueriedCoordinates.push(...mapped.cleanCoordinates);
					rawUnresolvedCoordinates.push(...mapped.unresolvedCoordinates);
				}
			}
			perManagerMode.push({ manager, mode, configuredDestination });
		} finally {
			if (cleanupDir !== undefined) { rmSync(cleanupDir, { recursive: true, force: true }); }
		}

		const postCoverage = await verifyManagerClosureCoverage(repoPath, targets, manager, manifestDir);
		if (!postCoverage.covered) { closureRegressed = true; }
	}

	let contentStable: boolean;
	try {
		const after = await computeContentIdentity(repoPath, targets);
		contentStable = after === contentIdentity && !closureRegressed;
	} catch {
		contentStable = false;
	}

	// A coordinate string reported under more than one outcome (duplicate or
	// conflicting raw entries for the exact same coordinate -- unusual, but
	// not impossible) is reconciled by priority: a confirmed finding (match)
	// outranks a clean report, which outranks an unresolved report. This
	// never touches unresolvedDependencies' OTHER entries (lockfile-export
	// gaps, version-uncertain pins): those are free-text, by-name/range
	// input-fidelity notes, not the audited coordinate itself, so they
	// coexist with whatever pkg_audit reports for the coordinate it actually
	// resolved -- see the module-level comment above.
	const matches = rawMatches;
	const matchedCoordinates = new Set(matches.map(m => m.coordinate));
	const queriedCoordinates = [...new Set(rawQueriedCoordinates)].filter(c => !matchedCoordinates.has(c));
	const queriedCoordinateSet = new Set(queriedCoordinates);
	for (const coordinate of new Set(rawUnresolvedCoordinates)) {
		if (matchedCoordinates.has(coordinate) || queriedCoordinateSet.has(coordinate)) { continue; }
		unresolvedDependencies.push(`${coordinate}: pkg_audit did not report a definite result for this dependency`);
	}

	return {
		contentIdentity,
		contentStable,
		readOnly: true,
		queriedCoordinates,
		matches,
		perManagerMode,
		unresolvedDependencies,
		unavailableSources,
	};
}
