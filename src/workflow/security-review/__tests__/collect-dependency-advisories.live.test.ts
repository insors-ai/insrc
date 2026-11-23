/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t6: collectDependencyAdvisories,
 * live test against the real pip-audit CLI (requires pip, pip-audit on
 * PATH; gated behind INSRC_LIVE_TESTS=1, this codebase's convention for a
 * test that needs a real external binary rather than a mocked seam).
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test src/workflow/security-review/__tests__/collect-dependency-advisories.live.test.ts
 *
 * Builds a REAL wheel ("fakepkg") whose own install_requires names a
 * "privatelib" package -- a genuine, real transitive dependency, not a
 * hand-waved one. fakepkg is the poetry.lock entry that gets exported
 * (plain source, exact version); privatelib would be the OTHER poetry.lock
 * entry a real project might declare for it, but is excluded from the
 * export because it carries a git source.
 *
 * Two real scenarios, both run against the actual pip-audit/pip binaries:
 *
 * 1. privatelib does NOT exist anywhere pip can reach (no local wheel for
 *    it). Confirmed directly that pip-audit's own --no-deps flag does NOT
 *    stop it from trying to resolve fakepkg's real install_requires -- it
 *    fails identically with or without the flag. The actually-observed
 *    outcome: the whole pip-audit call fails to produce parseable output
 *    and is recorded as an execution gap -- not a silent, successful
 *    reintroduction of privatelib.
 *
 * 2. privatelib DOES exist as a real, separately-built wheel reachable via
 *    the same PIP_FIND_LINKS directory (simulating it being installable,
 *    e.g. from a private index a real project might configure). CONFIRMED
 *    DIRECTLY, and this is the more important finding: pip-audit's real
 *    output in this case lists BOTH fakepkg AND privatelib as audited
 *    dependency entries (each with a `skip_reason`, since neither is a
 *    real PyPI package) -- i.e. --no-deps does NOT prevent privatelib from
 *    being installed and appearing in pip-audit's own result when it is
 *    actually resolvable. This confirms the LLD's stated protection
 *    mechanism ('noDeps prevents an excluded entry from being silently
 *    reintroduced via another exported package's transitive dependency')
 *    does NOT hold in the general case for pip-audit 2.10.1's
 *    environment-audit mode. collectDependencyAdvisories' own mapping
 *    (missing 'vulns' key -> unresolvedCoordinates, never matches or
 *    queriedCoordinates) keeps this from becoming a false 'clean' or false
 *    'confirmed finding' report, but privatelib's NAME does still surface
 *    in unresolvedDependencies in this scenario -- this is a confirmed,
 *    real residual gap in the Epic's design, not a bug introduced by this
 *    Task's own code, and is flagged for the user/LLD maintainers as a
 *    follow-up (the fix would need to live upstream of t6, e.g. by not
 *    letting pip-audit perform any installation/resolution at all).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { collectDependencyAdvisories } from '../collect-dependency-advisories.js';
import { _setContentIdentityDepsForTests } from '../content-identity.js';

const live = process.env['INSRC_LIVE_TESTS'] === '1';

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-collect-advisories-live-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
	return repo;
}

function buildWheel(workDir: string, distDir: string, name: string, setupBody: string): void {
	const srcDir = join(workDir, `${name}-src`);
	mkdirSync(srcDir, { recursive: true });
	writeFileSync(join(srcDir, 'setup.py'), `from setuptools import setup\n${setupBody}\n`);
	writeFileSync(join(srcDir, `${name}.py`), '');
	execFileSync('pip', ['wheel', '.', '--no-deps', '-w', distDir], { cwd: srcDir, stdio: 'ignore' });
}

/** Builds a real wheel for a package whose install_requires names a
 *  package that does not exist on PyPI -- a genuine, undeclared-elsewhere
 *  transitive dependency, built with --no-deps so building it does not
 *  itself require resolving that missing dependency. */
function buildFakePackageWithUndeclaredDependency(workDir: string): string {
	const distDir = join(workDir, 'dist');
	mkdirSync(distDir, { recursive: true });
	buildWheel(workDir, distDir, 'fakepkg', 'setup(name="fakepkg", version="1.0.0", py_modules=["fakepkg"], install_requires=["privatelib"])');
	return distDir;
}

/** Builds the SAME fakepkg wheel, but also builds a real, separately
 *  installable 'privatelib' wheel reachable from the same dist directory --
 *  simulating privatelib being resolvable (e.g. from a private index a real
 *  project might configure), rather than simply absent everywhere. */
function buildFakePackageWithResolvableDependency(workDir: string): string {
	const distDir = join(workDir, 'dist');
	mkdirSync(distDir, { recursive: true });
	buildWheel(workDir, distDir, 'fakepkg', 'setup(name="fakepkg", version="1.0.0", py_modules=["fakepkg"], install_requires=["privatelib"])');
	buildWheel(workDir, distDir, 'privatelib', 'setup(name="privatelib", version="0.1.0", py_modules=["privatelib"])');
	return distDir;
}

test(
	'collectDependencyAdvisories against a real poetry project with an excluded private dependency that is also a transitive dependency of an exported package: the excluded package is NOT resolved or reported on',
	{ skip: !live },
	async () => {
		const workDir = mkdtempSync(join(tmpdir(), 'insrc-fakepkg-'));
		const repo = initRepo();
		_setContentIdentityDepsForTests(async candidate => candidate === repo);
		const previousFindLinks = process.env['PIP_FIND_LINKS'];
		try {
			const distDir = buildFakePackageWithUndeclaredDependency(workDir);
			// pip (inside pip-audit's own install --dry-run step) needs to find
			// fakepkg's wheel; PIP_FIND_LINKS is pip's own env-var convention for
			// an additional local package source, honored by the real pip
			// invocation pip-audit shells out to.
			process.env['PIP_FIND_LINKS'] = distDir;

			// fakepkg: plain source, exact-locked -> exported and really audited.
			// privatelib: a git source -> excluded from the export and recorded as
			// a gap by t5's generateLockfileExport, so it is never written into the
			// generated requirements.txt pip-audit is given at all. fakepkg's OWN
			// real install_requires names privatelib (built above) -- a genuine,
			// not hand-waved, transitive dependency.
			writeFileSync(join(repo, 'poetry.lock'), `
[[package]]
name = "fakepkg"
version = "1.0.0"
description = "a package whose real install_requires names a private dependency"
optional = false
python-versions = "*"

[[package]]
name = "privatelib"
version = "0.1.0"
description = "a private, non-PyPI dependency of fakepkg"
optional = false
python-versions = "*"

[package.source]
type = "git"
url = "https://github.com/example/privatelib.git"
reference = "main"
resolved_reference = "abc123"
`);
			execFileSync('git', ['add', '.'], { cwd: repo });
			execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });

			const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'poetry.lock' }] });

			// Proof, not just assertion: print the real result so a saved run log
			// shows privatelib was never even a candidate, and that the audit's
			// real, observed failure mode is an execution gap, not a silent pass.
			console.log('unresolvedDependencies:', JSON.stringify(result.unresolvedDependencies));
			console.log('matches:', JSON.stringify(result.matches));
			console.log('queriedCoordinates:', JSON.stringify(result.queriedCoordinates));
			console.log('unavailableSources:', JSON.stringify(result.unavailableSources));
			console.log('perManagerMode:', JSON.stringify(result.perManagerMode));

			assert.ok(result.unresolvedDependencies.some(d => d.includes('privatelib')), JSON.stringify(result.unresolvedDependencies));
			assert.ok(!result.matches.some(m => m.coordinate.includes('privatelib')), JSON.stringify(result.matches));
			assert.ok(!result.queriedCoordinates.some(c => c.includes('privatelib')), JSON.stringify(result.queriedCoordinates));
			// fakepkg's real install_requires (privatelib) cannot be resolved --
			// confirmed directly that --no-deps does not stop pip-audit from
			// trying anyway -- so the real, observed outcome is an execution gap
			// for this manager, never a confirmed finding or a clean report that
			// would imply privatelib was somehow accounted for.
			assert.ok(result.unavailableSources.some(s => s.includes('poetry') || s.includes('pip')), JSON.stringify(result.unavailableSources));
			assert.ok(!result.matches.some(m => m.coordinate.includes('fakepkg@')), JSON.stringify(result.matches));
			assert.ok(!result.queriedCoordinates.some(c => c.includes('fakepkg@')), JSON.stringify(result.queriedCoordinates));
			const poetryEntry = result.perManagerMode.find(e => e.manager === 'poetry');
			assert.equal(poetryEntry?.mode, 'isolated-environment');
		} finally {
			if (previousFindLinks === undefined) { delete process.env['PIP_FIND_LINKS']; } else { process.env['PIP_FIND_LINKS'] = previousFindLinks; }
			_setContentIdentityDepsForTests();
			rmSync(repo, { recursive: true, force: true });
			rmSync(workDir, { recursive: true, force: true });
		}
	},
);

test(
	"collectDependencyAdvisories: a SECOND real scenario -- privatelib IS resolvable via the same local index fakepkg uses -- confirms pip-audit's real output DOES include privatelib (not prevented by --no-deps), while collectDependencyAdvisories' own mapping still keeps it out of matches/queriedCoordinates",
	{ skip: !live },
	async () => {
		const workDir = mkdtempSync(join(tmpdir(), 'insrc-fakepkg-resolvable-'));
		const repo = initRepo();
		_setContentIdentityDepsForTests(async candidate => candidate === repo);
		const previousFindLinks = process.env['PIP_FIND_LINKS'];
		try {
			const distDir = buildFakePackageWithResolvableDependency(workDir);
			process.env['PIP_FIND_LINKS'] = distDir;

			writeFileSync(join(repo, 'poetry.lock'), `
[[package]]
name = "fakepkg"
version = "1.0.0"
description = "a package whose real install_requires names a private dependency"
optional = false
python-versions = "*"

[[package]]
name = "privatelib"
version = "0.1.0"
description = "a private, non-PyPI dependency of fakepkg, resolvable here on purpose"
optional = false
python-versions = "*"

[package.source]
type = "git"
url = "https://github.com/example/privatelib.git"
reference = "main"
resolved_reference = "abc123"
`);
			execFileSync('git', ['add', '.'], { cwd: repo });
			execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });

			const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'poetry.lock' }] });

			console.log('[resolvable scenario] unresolvedDependencies:', JSON.stringify(result.unresolvedDependencies));
			console.log('[resolvable scenario] matches:', JSON.stringify(result.matches));
			console.log('[resolvable scenario] queriedCoordinates:', JSON.stringify(result.queriedCoordinates));
			console.log('[resolvable scenario] unavailableSources:', JSON.stringify(result.unavailableSources));

			// Never a false "clean" report or a fabricated confirmed finding for
			// the excluded package, in either direction:
			assert.ok(!result.matches.some(m => m.coordinate.includes('privatelib')), JSON.stringify(result.matches));
			assert.ok(!result.queriedCoordinates.some(c => c.includes('privatelib')), JSON.stringify(result.queriedCoordinates));
			// The confirmed, real residual gap: privatelib's name DOES surface in
			// unresolvedDependencies here, because pip-audit's real output
			// genuinely includes it (as a 'skip_reason' entry pip-audit itself
			// could not audit, mapped by collectDependencyAdvisories to
			// unresolvedCoordinates) -- proving --no-deps did not keep pip from
			// installing/resolving it when it was actually reachable.
			assert.ok(result.unresolvedDependencies.some(d => d.includes('privatelib')), JSON.stringify(result.unresolvedDependencies));
		} finally {
			if (previousFindLinks === undefined) { delete process.env['PIP_FIND_LINKS']; } else { process.env['PIP_FIND_LINKS'] = previousFindLinks; }
			_setContentIdentityDepsForTests();
			rmSync(repo, { recursive: true, force: true });
			rmSync(workDir, { recursive: true, force: true });
		}
	},
);
