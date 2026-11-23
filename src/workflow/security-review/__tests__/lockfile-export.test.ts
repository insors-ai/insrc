/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t5: lockfile export.
 * Run: npx tsx --test src/workflow/security-review/__tests__/lockfile-export.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findVersionUncertainPipRequirements, generateLockfileExport } from '../lockfile-export.js';

function tmpDir(): string {
	return mkdtempSync(join(tmpdir(), 'insrc-lockfile-export-'));
}

const POETRY_LOCK = `
[[package]]
name = "requests"
version = "2.25.1"
description = "HTTP library"
optional = false
python-versions = "*"

[[package]]
name = "mylib"
version = "0.1.0"
description = "private git dependency"
optional = false
python-versions = "*"

[package.source]
type = "git"
url = "https://github.com/example/mylib.git"
reference = "main"
resolved_reference = "abc123"
`;

test('generateLockfileExport(poetry): a poetry.lock entry with a git/path/url source -> excluded, added to unresolvedDependencies', () => {
	const dir = tmpDir();
	try {
		writeFileSync(join(dir, 'poetry.lock'), POETRY_LOCK);
		const { requirementsPath, unresolvedDependencies } = generateLockfileExport('poetry', dir);
		const generated = readFileSync(requirementsPath, 'utf8');
		assert.ok(!generated.includes('mylib'), generated);
		assert.ok(unresolvedDependencies.some(d => d.includes('mylib')), JSON.stringify(unresolvedDependencies));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('generateLockfileExport(poetry): a poetry.lock entry with an exact PyPI pin is included in the generated requirementsPath', () => {
	const dir = tmpDir();
	try {
		writeFileSync(join(dir, 'poetry.lock'), POETRY_LOCK);
		const { requirementsPath } = generateLockfileExport('poetry', dir);
		const generated = readFileSync(requirementsPath, 'utf8');
		assert.ok(generated.includes('requests==2.25.1'), generated);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('findVersionUncertainPipRequirements: a plain pip requirements.txt entry with a version range -> recorded in unresolvedDependencies as version-uncertain', () => {
	const dir = tmpDir();
	try {
		const requirementsPath = join(dir, 'requirements.txt');
		const original = 'flask>=2.0.0\nrequests==2.25.1\n';
		writeFileSync(requirementsPath, original);
		const uncertain = findVersionUncertainPipRequirements(requirementsPath);
		assert.ok(uncertain.some(d => d.includes('flask')), JSON.stringify(uncertain));
		assert.ok(!uncertain.some(d => d.includes('requests')), JSON.stringify(uncertain));
		assert.equal(readFileSync(requirementsPath, 'utf8'), original, 'requirements.txt must never be rewritten');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("generateLockfileExport(poetry): a poetry.lock '[package.source]' using single-quoted TOML strings (type = 'git') is still excluded, not just double-quoted", () => {
	const dir = tmpDir();
	try {
		const lock = `
[[package]]
name = 'requests'
version = '2.25.1'

[[package]]
name = 'mylib'
version = '0.1.0'

[package.source]
type = 'git'
url = 'https://github.com/example/mylib.git'
`;
		writeFileSync(join(dir, 'poetry.lock'), lock);
		const { requirementsPath, unresolvedDependencies } = generateLockfileExport('poetry', dir);
		const generated = readFileSync(requirementsPath, 'utf8');
		assert.ok(!generated.includes('mylib'), generated);
		assert.ok(unresolvedDependencies.some(d => d.includes('mylib')), JSON.stringify(unresolvedDependencies));
		assert.ok(generated.includes('requests==2.25.1'), generated);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("generateLockfileExport(poetry): a '[package.source]' header with a trailing inline TOML comment is still recognized, not treated as an unknown section", () => {
	const dir = tmpDir();
	try {
		const lock = `
[[package]]
name = "requests"
version = "2.25.1"

[[package]]
name = "mylib"
version = "0.1.0"

[package.source] # origin
type = "git"
url = "https://github.com/example/mylib.git"
`;
		writeFileSync(join(dir, 'poetry.lock'), lock);
		const { requirementsPath, unresolvedDependencies } = generateLockfileExport('poetry', dir);
		const generated = readFileSync(requirementsPath, 'utf8');
		assert.ok(!generated.includes('mylib'), generated);
		assert.ok(unresolvedDependencies.some(d => d.includes('mylib')), JSON.stringify(unresolvedDependencies));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("generateLockfileExport(poetry): a poetry.lock entry with a 'markers' (environment-marker) condition is excluded, not exported as an unconditional pin", () => {
	const dir = tmpDir();
	try {
		const lock = `
[[package]]
name = "requests"
version = "2.25.1"

[[package]]
name = "colorama"
version = "0.4.4"
markers = "sys_platform == 'win32'"
`;
		writeFileSync(join(dir, 'poetry.lock'), lock);
		const { requirementsPath, unresolvedDependencies } = generateLockfileExport('poetry', dir);
		const generated = readFileSync(requirementsPath, 'utf8');
		assert.ok(!generated.includes('colorama'), generated);
		assert.ok(unresolvedDependencies.some(d => d.includes('colorama')), JSON.stringify(unresolvedDependencies));
		assert.ok(generated.includes('requests==2.25.1'), generated);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("generateLockfileExport(pipenv): an entry whose 'index' resolves (via _meta.sources) to the standard PyPI url is plain PyPI, NOT a private index", () => {
	const dir = tmpDir();
	try {
		const pipfileLock = JSON.stringify({
			_meta: { sources: [{ name: 'pypi', url: 'https://pypi.org/simple', verify_ssl: true }] },
			default: { requests: { version: '==2.25.1', index: 'pypi', hashes: [] } },
		});
		writeFileSync(join(dir, 'Pipfile.lock'), pipfileLock);
		const { requirementsPath, unresolvedDependencies } = generateLockfileExport('pipenv', dir);
		const generated = readFileSync(requirementsPath, 'utf8');
		assert.ok(generated.includes('requests==2.25.1'), generated);
		assert.deepEqual(unresolvedDependencies, []);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("generateLockfileExport(pipenv): an entry whose 'index' resolves to a DIFFERENT (non-PyPI) url is still excluded as a secondary index", () => {
	const dir = tmpDir();
	try {
		const pipfileLock = JSON.stringify({
			_meta: { sources: [{ name: 'pypi', url: 'https://pypi.org/simple', verify_ssl: true }, { name: 'internal', url: 'https://pkg.example.internal/simple', verify_ssl: true }] },
			default: { privatepkg: { version: '==1.0.0', index: 'internal', hashes: [] } },
		});
		writeFileSync(join(dir, 'Pipfile.lock'), pipfileLock);
		const { requirementsPath, unresolvedDependencies } = generateLockfileExport('pipenv', dir);
		const generated = readFileSync(requirementsPath, 'utf8');
		assert.ok(!generated.includes('privatepkg'), generated);
		assert.ok(unresolvedDependencies.some(d => d.includes('privatepkg')), JSON.stringify(unresolvedDependencies));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("generateLockfileExport(pipenv): a Pipfile.lock entry with both a 'url' and a 'version' is still excluded as a non-standard source", () => {
	const dir = tmpDir();
	try {
		const pipfileLock = JSON.stringify({
			default: {
				requests: { version: '==2.25.1', hashes: [] },
				wheel: { url: 'https://example.com/wheel-1.0-py3-none-any.whl', version: '==1.0' },
			},
		});
		writeFileSync(join(dir, 'Pipfile.lock'), pipfileLock);
		const { requirementsPath, unresolvedDependencies } = generateLockfileExport('pipenv', dir);
		const generated = readFileSync(requirementsPath, 'utf8');
		assert.ok(!generated.includes('wheel'), generated);
		assert.ok(unresolvedDependencies.some(d => d.includes('wheel')), JSON.stringify(unresolvedDependencies));
		assert.ok(generated.includes('requests==2.25.1'), generated);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("findVersionUncertainPipRequirements: a pip 'wildcard match' pin (e.g. '==2.*') is a range, not an exact pin -- also recorded as version-uncertain", () => {
	const dir = tmpDir();
	try {
		const requirementsPath = join(dir, 'requirements.txt');
		writeFileSync(requirementsPath, 'django==2.*\n');
		const uncertain = findVersionUncertainPipRequirements(requirementsPath);
		assert.ok(uncertain.some(d => d.includes('django')), JSON.stringify(uncertain));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
