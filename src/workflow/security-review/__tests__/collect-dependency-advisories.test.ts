/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t6: collectDependencyAdvisories.
 * Run: npx tsx --test src/workflow/security-review/__tests__/collect-dependency-advisories.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { collectDependencyAdvisories, _setPkgAuditExecuteForTests } from '../collect-dependency-advisories.js';
import { _setContentIdentityDepsForTests } from '../content-identity.js';
import type { ToolInput, ToolResult } from '../../../daemon/tools/types.js';

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-collect-advisories-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
	writeFileSync(join(repo, 'app.ts'), 'export const x = 1;\n');
	execFileSync('git', ['add', '.'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
	return repo;
}

function treatAsRegistered(repoPath: string): void {
	_setContentIdentityDepsForTests(async candidate => candidate === repoPath);
}

function okResult(data: { manager: string; exitCode: number | null; parsed: unknown; stdout?: string; stderr?: string }): ToolResult {
	return { output: 'ok', format: 'text', success: true, data: { stdout: '', stderr: '', ...data } };
}

function spawnErrorResult(message: string): ToolResult {
	return { output: message, format: 'text', success: false, error: message };
}

function cleanup(repo: string): void {
	_setPkgAuditExecuteForTests();
	_setContentIdentityDepsForTests();
	rmSync(repo, { recursive: true, force: true });
}

test('collectDependencyAdvisories: a generated requirementsPath (pipenv/poetry) is ALWAYS invoked with noDeps:true', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'poetry.lock'), '[[package]]\nname = "requests"\nversion = "2.25.1"\n');
		const captured: ToolInput[] = [];
		_setPkgAuditExecuteForTests(async (input: ToolInput) => {
			captured.push(input);
			return okResult({ manager: 'poetry', exitCode: 0, parsed: { dependencies: [] } });
		});
		await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'poetry.lock' }] });
		assert.equal(captured.length, 1);
		assert.equal(captured[0]?.noDeps, true);
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: plain pip's own requirements.txt is NEVER invoked with noDeps:true", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		const captured: ToolInput[] = [];
		_setPkgAuditExecuteForTests(async (input: ToolInput) => {
			captured.push(input);
			return okResult({ manager: 'pip', exitCode: 0, parsed: { dependencies: [] } });
		});
		await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.equal(captured.length, 1);
		assert.equal(captured[0]?.noDeps, undefined);
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: a manager\'s closure is covered:true pre-audit and covered:true post-audit -> no effect on contentStable', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'npm', exitCode: 0, parsed: { vulnerabilities: {} } }));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.equal(result.contentStable, true);
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: a manager\'s closure is covered:true pre-audit but covered:false post-audit (a new file appeared during the audit and was never removed) -> contentStable:false, the manager\'s own results are still returned', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		_setPkgAuditExecuteForTests(async () => {
			// Simulate a file appearing mid-audit: the closure grows to include
			// extra.txt, which is never added to targets.entries.
			writeFileSync(join(repo, 'extra.txt'), 'pytest==7.0.0\n');
			appendFileSync(join(repo, 'requirements.txt'), '-r extra.txt\n');
			return okResult({ manager: 'pip', exitCode: 0, parsed: { dependencies: [{ name: 'flask', version: '2.0.0', vulns: [{ id: 'PYSEC-1', fix_versions: ['2.0.1'] }] }] } });
		});
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.equal(result.contentStable, false);
		assert.ok(result.matches.some(m => m.coordinate.startsWith('flask@')), JSON.stringify(result.matches));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: a targets.entries file is deleted between the pre- and post-collection computeContentIdentity calls -> contentStable:false, no exception escapes collectDependencyAdvisories', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		_setPkgAuditExecuteForTests(async () => {
			unlinkSync(join(repo, 'app.ts'));
			return okResult({ manager: 'npm', exitCode: 0, parsed: { vulnerabilities: {} } });
		});
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.equal(result.contentStable, false);
	} finally {
		writeFileSync(join(repo, 'app.ts'), 'export const x = 1;\n');
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: the FIRST computeContentIdentity call fails its own repoPath-level precondition -> the error DOES propagate (distinct from the second-call case)", async () => {
	const repo = initRepo();
	_setContentIdentityDepsForTests(async () => false);
	try {
		await assert.rejects(() => collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }] }));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: a cleanly-audited coordinate with no advisory match -> appears in queriedCoordinates only', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'pip', exitCode: 0, parsed: { dependencies: [{ name: 'flask', version: '2.0.0', vulns: [] }] } }));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(result.queriedCoordinates.includes('flask@2.0.0'), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.matches.some(m => m.coordinate === 'flask@2.0.0'), JSON.stringify(result.matches));
		assert.ok(!result.unresolvedDependencies.some(d => d.includes('flask')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: pkg_audit spawnError for a manager -> recorded in unavailableSources', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		_setPkgAuditExecuteForTests(async () => spawnErrorResult('npm not found: ENOENT'));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(result.unavailableSources.some(s => s.includes('npm')), JSON.stringify(result.unavailableSources));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: every attempted manager's perManagerMode entry carries a configuredDestination", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'npm', exitCode: 0, parsed: { vulnerabilities: {} } }));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(result.perManagerMode.length > 0, 'expected at least one perManagerMode entry');
		for (const entry of result.perManagerMode) {
			assert.ok(entry.configuredDestination !== undefined, JSON.stringify(entry));
		}
	} finally {
		cleanup(repo);
	}
});
