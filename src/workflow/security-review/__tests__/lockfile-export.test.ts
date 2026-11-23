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
