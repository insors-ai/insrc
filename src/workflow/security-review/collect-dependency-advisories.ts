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

import { dirname, join } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { satisfies as semverSatisfies, valid as semverValid, validRange as semverValidRange } from 'semver';

import { pkgAuditTool, type Manager } from '../../daemon/tools/builtins/pkg/index.js';
import type { ToolDeps, ToolInput, ToolResult } from '../../daemon/tools/types.js';
import type { ReviewTargets } from '../artifact-core/types.js';
import { computeContentIdentity } from './content-identity.js';
import { enumerateManagers, verifyManagerClosureCoverage } from './dependency-advisories.js';
import { findVersionUncertainPipRequirements, generateLockfileExport, normalizePythonPackageName } from './lockfile-export.js';

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
 *  own output carries no network trace to observe from). npm/pnpm/yarn's
 *  default here is overridden by resolveNpmRegistry whenever a project's
 *  own (or the user's) .npmrc sets a different `registry`. */
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

/** npm/pnpm/yarn's effective registry, resolved in npm's own precedence
 *  order: an `npm_config_registry` (or `NPM_CONFIG_REGISTRY`) environment
 *  override outranks EVERY `.npmrc` -- npm itself always prefers its env-var
 *  config over any file -- then a project-level `.npmrc` (in the manifest's
 *  own directory) overrides the user-level `~/.npmrc`, which overrides the
 *  documented default. Resolved per audit, not hardcoded, so an
 *  actually-configured private registry is reported honestly instead of
 *  the public default every manager falls back to when nothing overrides
 *  it. */
function resolveNpmRegistry(manifestDir: string, auditLabel: string): string {
	const envRegistry = process.env['npm_config_registry'] ?? process.env['NPM_CONFIG_REGISTRY'];
	if (envRegistry !== undefined && envRegistry.length > 0) { return `${envRegistry} (${auditLabel})`; }
	for (const configPath of [join(manifestDir, '.npmrc'), join(homedir(), '.npmrc')]) {
		try {
			const content = readFileSync(configPath, 'utf8');
			for (const rawLine of content.split('\n')) {
				const line = rawLine.replace(/\s*#.*$/, '').trim();
				const m = /^registry\s*=\s*(\S+)/.exec(line);
				if (m?.[1] !== undefined) { return `${m[1]} (${auditLabel})`; }
			}
		} catch { /* no .npmrc at this level -- fall through to the next, then the default */ }
	}
	return `https://registry.npmjs.org (${auditLabel})`;
}

function resolveConfiguredDestination(manager: Manager, manifestDir: string): string {
	if (manager === 'npm' || manager === 'pnpm' || manager === 'yarn') { return resolveNpmRegistry(manifestDir, `${manager} audit`); }
	return MANAGER_DESTINATION[manager];
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null;
}

/** Whether `version` falls inside `range`, per node-semver's own grammar --
 *  'unknown' (never silently treated as a match) when either side isn't a
 *  valid semver version/range npm's own tooling would recognize. */
function evaluateSemverRange(version: string, range: string): 'in' | 'out' | 'unknown' {
	if (semverValid(version) === null || semverValidRange(range) === null) { return 'unknown'; }
	try {
		return semverSatisfies(version, range, { includePrerelease: true }) ? 'in' : 'out';
	} catch {
		return 'unknown';
	}
}

/** pip-audit's JSON output: either a bare array of dependency entries, or
 *  `{ dependencies: [...] }`, each `{ name, version, vulns: [...] }`. A
 *  dependency with an empty `vulns` ARRAY is a cleanly-checked coordinate; a
 *  dependency carrying no `vulns` key at all (or a non-array value) was never
 *  actually checked by pip-audit -- an unresolved coordinate, not a clean
 *  one, so it must never be reported as cleanly audited. */
function mapPipAuditOutput(parsed: unknown, advisoryDestination: string, coordinatePrefix: string, allowedNames: ReadonlySet<string> | undefined): { matches: SecurityAdvisoryMatch[]; cleanCoordinates: string[]; unresolvedCoordinates: string[]; rejectedNames: string[] } | undefined {
	const deps = Array.isArray(parsed) ? parsed : (isRecord(parsed) && Array.isArray(parsed.dependencies) ? parsed.dependencies : undefined);
	if (deps === undefined) { return undefined; }
	const matches: SecurityAdvisoryMatch[] = [];
	const cleanCoordinates: string[] = [];
	const unresolvedCoordinates: string[] = [];
	const rejectedNames: string[] = [];
	for (const dep of deps) {
		if (!isRecord(dep) || typeof dep.name !== 'string') { continue; }
		// pip-audit returning a name never written into the requirementsPath
		// generated for it (t5's own export) means it was somehow resolved
		// anyway -- e.g. as another package's real, undeclared-on-PyPI
		// transitive dependency (a confirmed, real gap in pip-audit's own
		// --no-deps guarantee). Quarantined here rather than accepted as
		// evidence about the deliberately excluded source: it must never
		// become a false "clean" report or a fabricated "confirmed finding".
		// Compare PEP-503-normalized names -- pip-audit can return a package
		// under a different, but equivalent, spelling than the one the
		// lockfile/export used (e.g. 'typing-extensions' vs 'typing_extensions'),
		// which must not be mistaken for an unexpected/excluded package.
		if (allowedNames !== undefined && !allowedNames.has(normalizePythonPackageName(dep.name))) { rejectedNames.push(dep.name); continue; }
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
	return { matches, cleanCoordinates, unresolvedCoordinates, rejectedNames };
}

/** A manager's own lockfile inventory: every distinct (name, version)
 *  instance it carries -- NOT a single Map<name, version>, since the same
 *  package name can legitimately resolve to more than one installed
 *  version (e.g. a transitive dependency pinned to a different version
 *  than the top-level one) and collapsing them would both misreport an
 *  unrelated version as vulnerable and drop the other installed version
 *  from clean accounting entirely. `versionByPath` (npm/pnpm only) maps a
 *  lockfile's own `node_modules/...` install path -- the exact string
 *  `npm audit --json`'s own `vulnerabilities[name].nodes` array uses -- to
 *  that specific instance's locked version, so a vulnerability can be
 *  attributed to the actual affected instance(s), not a guessed one. */
interface LockfileInventory {
	readonly versionsByName: Map<string, Set<string>>;
	readonly versionByPath: Map<string, string>;
}

const EMPTY_INVENTORY: LockfileInventory = { versionsByName: new Map(), versionByPath: new Map() };

function addVersion(versionsByName: Map<string, Set<string>>, name: string, version: string): void {
	const existing = versionsByName.get(name);
	if (existing === undefined) { versionsByName.set(name, new Set([version])); } else { existing.add(version); }
}

/** npm/pnpm's own lockfile (package-lock.json/pnpm's own npm-shaped lock, when
 *  present) only lists what's INSTALLED, v2/v3 under `packages` (key
 *  `node_modules/<name>`, possibly nested, value `{ version }`), v1 under
 *  `dependencies` (key `<name>`, value `{ version }`, no path information).
 *  `npm audit --json` itself only reports VULNERABLE packages -- it never
 *  lists a clean one -- so the full installed-package inventory has to come
 *  from the lockfile to let a cleanly-audited (not vulnerable) package still
 *  be accounted for. */
function readNpmLockfileInventory(manifestDir: string): LockfileInventory {
	const versionsByName = new Map<string, Set<string>>();
	const versionByPath = new Map<string, string>();
	try {
		const data: unknown = JSON.parse(readFileSync(join(manifestDir, 'package-lock.json'), 'utf8'));
		if (!isRecord(data)) { return EMPTY_INVENTORY; }
		if (isRecord(data.packages)) {
			for (const [key, value] of Object.entries(data.packages)) {
				if (key === '' || !isRecord(value) || typeof value.version !== 'string') { continue; }
				const name = key.replace(/^.*node_modules\//, '');
				if (name.length === 0) { continue; }
				addVersion(versionsByName, name, value.version);
				versionByPath.set(key, value.version);
			}
		} else if (isRecord(data.dependencies)) {
			// v1's own nested shape: each dependency entry can carry its own
			// 'dependencies' sub-object for packages it bundles a DIFFERENT
			// version of than the top level -- walking only the top level
			// misses every such nested instance entirely (both its version,
			// for clean accounting, and its node_modules path, for resolving
			// which instance an audit finding actually names).
			const walk = (deps: Record<string, unknown>, parentPath: string): void => {
				for (const [name, value] of Object.entries(deps)) {
					if (!isRecord(value) || typeof value.version !== 'string') { continue; }
					const path = `${parentPath}node_modules/${name}`;
					addVersion(versionsByName, name, value.version);
					versionByPath.set(path, value.version);
					if (isRecord(value.dependencies)) { walk(value.dependencies, `${path}/`); }
				}
			};
			walk(data.dependencies, '');
		}
	} catch { /* no lockfile, or not JSON -- an empty inventory just means no clean coordinates get added */ }
	return { versionsByName, versionByPath };
}

/** Cargo.lock's own `[[package]]` blocks (name/version) -- the full,
 *  resolved dependency inventory, preserving every distinct version of a
 *  crate present in the lock (cargo allows more than one major version of
 *  the same crate to coexist); `cargo audit --json` itself only reports
 *  vulnerable packages, so this is the only source for a clean one. */
function readCargoLockVersions(manifestDir: string): Map<string, Set<string>> {
	const versionsByName = new Map<string, Set<string>>();
	try {
		const content = readFileSync(join(manifestDir, 'Cargo.lock'), 'utf8');
		let name: string | undefined;
		let version: string | undefined;
		const flush = (): void => { if (name !== undefined && version !== undefined) { addVersion(versionsByName, name, version); } };
		for (const rawLine of content.split('\n')) {
			const line = rawLine.trim();
			if (line === '[[package]]') { flush(); name = undefined; version = undefined; continue; }
			const m = /^(name|version)\s*=\s*"([^"]*)"/.exec(line);
			if (m?.[1] === 'name') { name = m[2]; } else if (m?.[1] === 'version') { version = m[2]; }
		}
		flush();
	} catch { /* no lockfile -- an empty inventory just means no clean coordinates get added */ }
	return versionsByName;
}

/** npm/pnpm's `audit --json` output: `{ vulnerabilities: { <pkgName>: { range, severity, via: [...] } } }`.
 *  Each `via` entry is EITHER an advisory object OR a bare string naming another
 *  vulnerable package this one depends on (npm's own "vulnerable via a dependency"
 *  chain notation) -- a `via` array that is non-empty but contains only strings
 *  still means this package IS vulnerable (transitively), just with no advisory
 *  details of its own in this entry; it must never be reported as cleanly audited. */
function mapNpmAuditOutput(parsed: unknown, advisoryDestination: string, provenance: string, coordinatePrefix: string, lockfile: LockfileInventory): { matches: SecurityAdvisoryMatch[]; cleanCoordinates: string[]; unresolvedCoordinates: string[]; rejectedNames: string[] } | undefined {
	if (!isRecord(parsed) || !isRecord(parsed.vulnerabilities)) { return undefined; }
	const matches: SecurityAdvisoryMatch[] = [];
	const unresolvedCoordinates: string[] = [];
	// A (name, version) instance that audit reported SOMETHING about, but
	// whose specific version falls outside every associated advisory's own
	// range -- genuinely not affected, not merely "audit never mentioned
	// it" (that latter case is handled below via the lockfile inventory).
	const cleanCoordinatesFromAudit: string[] = [];
	// Tracks every (name, version) INSTANCE audit actually reported on --
	// not just the bare name -- so a different installed version of the
	// same package name that audit never flagged still counts as clean.
	const accountedInstances = new Set<string>();
	for (const [pkgName, rawInfo] of Object.entries(parsed.vulnerabilities)) {
		if (!isRecord(rawInfo)) { continue; }
		const range = typeof rawInfo.range === 'string' ? rawInfo.range : '';
		// npm audit's own `nodes` array names the exact install path(s) of
		// the affected instance(s) (the SAME `node_modules/...` string the
		// lockfile's own `packages` keys use) -- resolve each to its real
		// locked version instead of guessing one. Only when no node path
		// resolves (a v1 lockfile with no path info, or no 'nodes' at all)
		// does this fall back to every version of that bare name the
		// lockfile carries.
		const nodes = Array.isArray(rawInfo.nodes) ? rawInfo.nodes.filter((n): n is string => typeof n === 'string') : [];
		const resolvedFromNodes = nodes.map(n => lockfile.versionByPath.get(n)).filter((v): v is string => v !== undefined);
		const instanceVersions = resolvedFromNodes.length > 0
			? [...new Set(resolvedFromNodes)]
			: [...(lockfile.versionsByName.get(pkgName) ?? new Set<string>())];
		const versionsToReport = instanceVersions.length > 0 ? instanceVersions : [range];
		const via = Array.isArray(rawInfo.via) ? rawInfo.via : [];
		const advisories = via.filter(isRecord);
		for (const version of versionsToReport) {
			accountedInstances.add(`${pkgName}@${version}`);
			if (via.length === 0) { continue; }
			const coordinate = `${coordinatePrefix}${pkgName}@${version}`;
			if (advisories.length === 0) { unresolvedCoordinates.push(coordinate); continue; }
			// Each advisory names its OWN affected range (distinct advisories
			// under one package name can cover disjoint version bands, e.g.
			// one for <2.0.0 and another for >=2.0.0 <3.0.0) -- this instance's
			// actual version must satisfy an advisory's own range before that
			// advisory is reported against it; applying every advisory to every
			// instance regardless of range would attribute a finding to a
			// version it never actually affects.
			let matchedAny = false;
			let uncertainAny = false;
			for (const advisory of advisories) {
				const advisoryRange = typeof advisory.range === 'string' ? advisory.range : range;
				const evaluation = evaluateSemverRange(version, advisoryRange);
				if (evaluation === 'unknown') { uncertainAny = true; continue; }
				if (evaluation === 'out') { continue; }
				matchedAny = true;
				matches.push({
					coordinate,
					advisoryId: typeof advisory.url === 'string' ? advisory.url : String(advisory.source ?? pkgName),
					affectedVersions: advisoryRange,
					severity: typeof advisory.severity === 'string' ? advisory.severity : 'unknown',
					provenance,
					advisoryDestination,
				});
			}
			if (!matchedAny) {
				// Either every advisory's range excludes this specific instance
				// (not actually affected -- clean) or at least one range/version
				// could not be evaluated (uncertain -- never silently clean).
				if (uncertainAny) { unresolvedCoordinates.push(coordinate); } else { cleanCoordinatesFromAudit.push(coordinate); }
			}
		}
	}
	// npm/pnpm's own audit output lists ONLY vulnerable packages -- the
	// lockfile is the only source for the full installed inventory, so
	// every (name, version) instance it carries that audit never flagged
	// is the cleanly-checked set -- preserving every instance, not just one
	// per name.
	const cleanCoordinates: string[] = [...cleanCoordinatesFromAudit];
	for (const [name, versions] of lockfile.versionsByName) {
		for (const version of versions) {
			if (!accountedInstances.has(`${name}@${version}`)) { cleanCoordinates.push(`${coordinatePrefix}${name}@${version}`); }
		}
	}
	return { matches, cleanCoordinates, unresolvedCoordinates, rejectedNames: [] };
}

/** cargo-audit's `--json` output: `{ vulnerabilities: { list: [ { package, advisory } ] } }`. Like npm audit,
 *  cargo-audit itself only reports vulnerable packages; Cargo.lock is the
 *  source for the clean (not-flagged) part of the inventory. Each entry's
 *  own `package.version` is cargo-audit's own report of the SPECIFIC
 *  affected instance -- used directly, never overridden by a lockfile
 *  lookup (which, with more than one locked version of the same crate,
 *  could silently substitute the wrong one). */
function mapCargoAuditOutput(parsed: unknown, advisoryDestination: string, coordinatePrefix: string, lockfileVersions: Map<string, Set<string>>): { matches: SecurityAdvisoryMatch[]; cleanCoordinates: string[]; unresolvedCoordinates: string[]; rejectedNames: string[] } | undefined {
	if (!isRecord(parsed) || !isRecord(parsed.vulnerabilities) || !Array.isArray(parsed.vulnerabilities.list)) { return undefined; }
	const matches: SecurityAdvisoryMatch[] = [];
	const accountedInstances = new Set<string>();
	for (const entry of parsed.vulnerabilities.list) {
		if (!isRecord(entry)) { continue; }
		const pkg = isRecord(entry.package) ? entry.package : {};
		const advisory = isRecord(entry.advisory) ? entry.advisory : {};
		const name = typeof pkg.name === 'string' ? pkg.name : 'unknown';
		const version = typeof pkg.version === 'string' ? pkg.version : '';
		accountedInstances.add(`${name}@${version}`);
		matches.push({
			coordinate: `${coordinatePrefix}${name}@${version}`,
			advisoryId: typeof advisory.id === 'string' ? advisory.id : 'unknown',
			affectedVersions: version,
			severity: typeof advisory.severity === 'string' ? advisory.severity : 'unknown',
			provenance: 'cargo audit',
			advisoryDestination,
		});
	}
	const cleanCoordinates: string[] = [];
	for (const [name, versions] of lockfileVersions) {
		for (const version of versions) {
			if (!accountedInstances.has(`${name}@${version}`)) { cleanCoordinates.push(`${coordinatePrefix}${name}@${version}`); }
		}
	}
	return { matches, cleanCoordinates, unresolvedCoordinates: [], rejectedNames: [] };
}

/** Maps one manager's raw pkg_audit output into SecurityAdvisoryMatch[] plus the
 *  coordinates that were cleanly checked with no match. Returns undefined when
 *  the output cannot be structurally mapped (yarn's NDJSON, go's plain-text
 *  govulncheck output) -- an execution gap, recorded in unavailableSources by
 *  the caller, never a thrown error. */
function mapAuditOutput(manager: Manager, manifestDir: string, parsed: unknown, advisoryDestination: string, allowedNames: ReadonlySet<string> | undefined): { matches: SecurityAdvisoryMatch[]; cleanCoordinates: string[]; unresolvedCoordinates: string[]; rejectedNames: string[] } | undefined {
	// Every coordinate is prefixed with its own manager: different ecosystems
	// can share a bare package name (npm's and PyPI's own "flask" are
	// different packages) without being the same coordinate, so the prefix
	// is what makes coordinate-string equality actually mean "the same
	// dependency", both for matching/deduplication here and for the
	// exclusivity reconciliation in collectDependencyAdvisories.
	const coordinatePrefix = `${manager}:`;
	if (manager === 'pip' || manager === 'pipenv' || manager === 'poetry') { return mapPipAuditOutput(parsed, advisoryDestination, coordinatePrefix, allowedNames); }
	if (manager === 'npm' || manager === 'pnpm') { return mapNpmAuditOutput(parsed, advisoryDestination, `${manager} audit`, coordinatePrefix, readNpmLockfileInventory(manifestDir)); }
	if (manager === 'cargo') { return mapCargoAuditOutput(parsed, advisoryDestination, coordinatePrefix, readCargoLockVersions(manifestDir)); }
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

	const { managers, ambiguities } = enumerateManagers(repoPath, targets);

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
	// A directory where enumerateManagers found two or more managers of the
	// SAME family (e.g. both pnpm-lock.yaml and yarn.lock) is never silently
	// resolved to one -- and never silently dropped from the evidence either.
	// It is recorded as its own coverage gap, same as a manager pkg_audit
	// cannot correctly target.
	const unavailableSources: string[] = ambiguities.map(
		a => `${a.directory}: ambiguous managers (${a.managers.join(', ')}) found together -- resolve to a single manager before auditing`,
	);
	const perManagerMode: PerManagerModeEntry[] = [];
	let closureRegressed = false;

	for (const { manager, manifestDir } of managers) {
		const mode = MANAGER_MODE[manager];
		const configuredDestination = resolveConfiguredDestination(manager, manifestDir);

		const preCoverage = await verifyManagerClosureCoverage(repoPath, targets, manager, manifestDir);
		if (!preCoverage.covered) {
			perManagerMode.push({ manager, mode: 'unsupported', configuredDestination });
			continue;
		}

		let requirementsPath: string | undefined;
		let noDeps = false;
		let cleanupDir: string | undefined;
		// Only set for pipenv/poetry: the exact package names t5 actually
		// wrote into the generated requirementsPath, so a pkg_audit response
		// naming anything else (e.g. a package excluded here that pip-audit
		// somehow still resolved and reported on) is rejected rather than
		// accepted as evidence about the deliberately excluded source.
		let allowedNames: ReadonlySet<string> | undefined;
		if (manager === 'pipenv' || manager === 'poetry') {
			try {
				const exported = generateLockfileExport(manager, manifestDir);
				requirementsPath = exported.requirementsPath;
				cleanupDir = dirname(exported.requirementsPath);
				noDeps = true;
				allowedNames = exported.includedNames;
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
				const mapped = mapAuditOutput(manager, manifestDir, data.parsed, configuredDestination, allowedNames);
				if (mapped === undefined) {
					unavailableSources.push(`${manager}: unparseable audit output`);
				} else {
					rawMatches.push(...mapped.matches);
					rawQueriedCoordinates.push(...mapped.cleanCoordinates);
					rawUnresolvedCoordinates.push(...mapped.unresolvedCoordinates);
					for (const name of mapped.rejectedNames) {
						unavailableSources.push(`${manager}: pkg_audit returned an unexpected dependency '${name}' not present in the generated export -- discarded, not accepted as evidence`);
					}
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
