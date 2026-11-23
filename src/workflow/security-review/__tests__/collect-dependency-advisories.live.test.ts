/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t6: collectDependencyAdvisories,
 * live test against the real pip-audit CLI (requires pip-audit on PATH;
 * gated behind INSRC_LIVE_TESTS=1, this codebase's convention for a test
 * that needs a real external binary rather than a mocked seam).
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test src/workflow/security-review/__tests__/collect-dependency-advisories.live.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test(
	'collectDependencyAdvisories against a real poetry project with an excluded private dependency that is also a transitive dependency of an exported package: the excluded package is NOT resolved or reported on',
	{ skip: !live },
	async () => {
		const repo = initRepo();
		_setContentIdentityDepsForTests(async candidate => candidate === repo);
		try {
			// requests: plain PyPI, exact-locked -> exported and really audited by
			// pip-audit. privatelib: a git source -> excluded from the export,
			// recorded as a gap, and (because the real pip-audit runs with
			// --no-deps against ONLY the generated file) never resolved at all,
			// even though a real poetry project would list it as one of
			// requests' own transitive dependencies.
			writeFileSync(join(repo, 'poetry.lock'), `
[[package]]
name = "requests"
version = "2.25.1"
description = "HTTP library"
optional = false
python-versions = "*"

[package.dependencies]
privatelib = "*"

[[package]]
name = "privatelib"
version = "0.1.0"
description = "a private, non-PyPI dependency of requests"
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

			assert.ok(result.unresolvedDependencies.some(d => d.includes('privatelib')), JSON.stringify(result.unresolvedDependencies));
			assert.ok(!result.matches.some(m => m.coordinate.includes('privatelib')), JSON.stringify(result.matches));
			assert.ok(!result.queriedCoordinates.some(c => c.includes('privatelib')), JSON.stringify(result.queriedCoordinates));
			assert.ok(result.matches.some(m => m.coordinate.startsWith('requests@')), JSON.stringify(result.matches));
			const poetryEntry = result.perManagerMode.find(e => e.manager === 'poetry');
			assert.equal(poetryEntry?.mode, 'isolated-environment');
		} finally {
			_setContentIdentityDepsForTests();
			rmSync(repo, { recursive: true, force: true });
		}
	},
);
