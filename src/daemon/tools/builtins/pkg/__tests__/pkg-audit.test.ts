/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t1: pkgAuditTool's additive
 * requirementsPath + noDeps fields, threaded through auditArgv.
 * Run: npx tsx --test src/daemon/tools/builtins/pkg/__tests__/pkg-audit.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { auditArgv, pkgAuditTool, _setPkgAuditShellForTests } from '../index.js';

function fakeShellOk(stdout = '{}'): ReturnType<typeof import('../../../shell-helper.js')['runShell']> {
	return Promise.resolve({ stdout, stderr: '', code: 0, spawnError: false, timedOut: false, stdoutTruncated: false });
}

test("pkgAuditTool.execute: noDeps:true -> argv includes --no-deps", async () => {
	let capturedArgv: readonly string[] = [];
	_setPkgAuditShellForTests((argv) => { capturedArgv = argv; return fakeShellOk(); });
	try {
		await pkgAuditTool.execute({ manager: 'pip', noDeps: true });
		assert.ok(capturedArgv.includes('--no-deps'), capturedArgv.join(' '));
	} finally {
		_setPkgAuditShellForTests();
	}
});

test("pkgAuditTool.execute: noDeps omitted/false -> argv is identical to today", async () => {
	let capturedArgv: readonly string[] = [];
	_setPkgAuditShellForTests((argv) => { capturedArgv = argv; return fakeShellOk(); });
	try {
		await pkgAuditTool.execute({ manager: 'pip' });
		assert.deepEqual(capturedArgv, ['pip-audit', '-f', 'json']);
		await pkgAuditTool.execute({ manager: 'pip', noDeps: false });
		assert.deepEqual(capturedArgv, ['pip-audit', '-f', 'json']);
	} finally {
		_setPkgAuditShellForTests();
	}
});

test("auditArgv('pip', {requirementsPath}) appends -r <requirementsPath>", () => {
	const { argv } = auditArgv('pip', { requirementsPath: '/tmp/x.txt' });
	assert.deepEqual(argv, ['pip-audit', '-f', 'json', '-r', '/tmp/x.txt']);
});

test("auditArgv('npm') with no new params is unchanged from today", () => {
	assert.deepEqual(auditArgv('npm'), { argv: ['npm', 'audit', '--json'], expectsJson: true, nonZeroOk: true });
	assert.deepEqual(auditArgv('npm', {}), auditArgv('npm'));
});

test('auditArgv: pipenv/poetry stay on their own native audit command when requirementsPath is omitted', () => {
	assert.deepEqual(auditArgv('pipenv').argv, ['pipenv', 'check', '--output', 'json']);
	assert.deepEqual(auditArgv('poetry').argv, ['poetry', 'audit']);
});

test('auditArgv: pipenv/poetry switch to pip-audit -r <requirementsPath> when a requirementsPath is given', () => {
	assert.deepEqual(auditArgv('pipenv', { requirementsPath: '/tmp/req.txt' }).argv, ['pip-audit', '-f', 'json', '-r', '/tmp/req.txt']);
	assert.deepEqual(auditArgv('poetry', { requirementsPath: '/tmp/req.txt', noDeps: true }).argv, ['pip-audit', '-f', 'json', '-r', '/tmp/req.txt', '--no-deps']);
});

test("pkgAuditTool's inputSchema declares requirementsPath and noDeps as optional (not in `required`)", () => {
	const schema = pkgAuditTool.inputSchema as { properties: Record<string, unknown>; required?: readonly string[] };
	assert.ok('requirementsPath' in schema.properties);
	assert.ok('noDeps' in schema.properties);
	assert.ok(!(schema.required ?? []).includes('requirementsPath'));
	assert.ok(!(schema.required ?? []).includes('noDeps'));
});
