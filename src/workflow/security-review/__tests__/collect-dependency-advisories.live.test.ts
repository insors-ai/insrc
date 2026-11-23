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
 * "privatelib" package that does not exist on PyPI -- a genuine, real
 * transitive dependency, not a hand-waved one. fakepkg is the poetry.lock
 * entry that gets exported (plain source, exact version); privatelib would
 * be the OTHER poetry.lock entry a real project might declare for it, but
 * is excluded from the export because it carries a git source. Confirmed
 * directly (see the comment below the pip-audit invocation) that
 * pip-audit's own --no-deps flag does NOT stop it from trying to resolve
 * fakepkg's real install_requires -- it fails identically with or without
 * the flag. So the actually-observed, provably-real outcome this test
 * exercises is: the excluded package is never written into the generated
 * requirements.txt at all (t5's own job), the whole pip-audit call for that
 * manager then fails to produce parseable output (because fakepkg's real,
 * undeclared-on-PyPI dependency cannot be resolved) and is recorded as an
 * execution gap -- NOT a silent, successful reintroduction of privatelib.
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

/** Builds a real wheel for a package whose install_requires names a
 *  package that does not exist on PyPI -- a genuine, undeclared-elsewhere
 *  transitive dependency, built with --no-deps so building it does not
 *  itself require resolving that missing dependency. */
function buildFakePackageWithUndeclaredDependency(workDir: string): string {
	const srcDir = join(workDir, 'fakepkg-src');
	const distDir = join(workDir, 'dist');
	mkdirSync(srcDir, { recursive: true });
	mkdirSync(distDir, { recursive: true });
	writeFileSync(join(srcDir, 'setup.py'), [
		'from setuptools import setup',
		'setup(name="fakepkg", version="1.0.0", py_modules=["fakepkg"], install_requires=["privatelib"])',
		'',
	].join('\n'));
	writeFileSync(join(srcDir, 'fakepkg.py'), '');
	execFileSync('pip', ['wheel', '.', '--no-deps', '-w', distDir], { cwd: srcDir, stdio: 'ignore' });
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
