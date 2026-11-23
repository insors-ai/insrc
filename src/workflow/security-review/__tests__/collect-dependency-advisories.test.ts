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
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { collectDependencyAdvisories, _setPkgAuditExecuteForTests, _setConfigGetForTests } from '../collect-dependency-advisories.js';
import { _setContentIdentityDepsForTests } from '../content-identity.js';
import type { ToolInput, ToolResult } from '../../../daemon/tools/types.js';
import type { ShellResult } from '../../../daemon/tools/shell-helper.js';

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

function shellOk(stdout: string): ShellResult {
	return { stdout, stderr: '', code: 0, spawnError: false, timedOut: false, stdoutTruncated: false };
}

// Every test in this file exercises collectDependencyAdvisories' own
// orchestration, never the real npm/pnpm/yarn binary -- a fast, fixed
// default stub keeps the suite hermetic and deterministic (this codebase
// runs in environments that don't all guarantee npm on PATH); a test that
// cares about the actual configuredDestination value overrides it itself.
async function defaultConfigGetStub(): Promise<ShellResult> {
	return shellOk('https://registry.npmjs.org/\n');
}
_setConfigGetForTests(defaultConfigGetStub);

function cleanup(repo: string): void {
	_setPkgAuditExecuteForTests();
	_setConfigGetForTests(defaultConfigGetStub);
	_setContentIdentityDepsForTests();
	rmSync(repo, { recursive: true, force: true });
}

test('collectDependencyAdvisories: a generated requirementsPath (poetry) is ALWAYS invoked with noDeps:true, using the actual generated file', async () => {
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
		const requirementsPath = captured[0]?.requirementsPath;
		assert.equal(typeof requirementsPath, 'string');
		assert.ok(String(requirementsPath).endsWith('requirements.txt'), String(requirementsPath));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: a generated requirementsPath (pipenv) is ALWAYS invoked with noDeps:true, using the actual generated file', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'Pipfile.lock'), JSON.stringify({ default: { requests: { version: '==2.25.1', hashes: [] } } }));
		const captured: ToolInput[] = [];
		_setPkgAuditExecuteForTests(async (input: ToolInput) => {
			captured.push(input);
			return okResult({ manager: 'pipenv', exitCode: 0, parsed: { dependencies: [] } });
		});
		await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'Pipfile.lock' }] });
		assert.equal(captured.length, 1);
		assert.equal(captured[0]?.noDeps, true);
		const requirementsPath = captured[0]?.requirementsPath;
		assert.equal(typeof requirementsPath, 'string');
		assert.ok(String(requirementsPath).endsWith('requirements.txt'), String(requirementsPath));
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
		assert.equal(captured[0]?.requirementsPath, join(repo, 'requirements.txt'));
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
		assert.ok(result.matches.some(m => m.coordinate.startsWith('pip:flask@')), JSON.stringify(result.matches));
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
		assert.ok(result.queriedCoordinates.includes('pip:flask@2.0.0'), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.matches.some(m => m.coordinate === 'pip:flask@2.0.0'), JSON.stringify(result.matches));
		assert.ok(!result.unresolvedDependencies.some(d => d.includes('flask')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: pkg_audit spawnError for a manager still checks post-audit closure coverage, not just pre-audit", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		_setPkgAuditExecuteForTests(async () => {
			// The closure grows mid-"audit" even though the audit itself failed to spawn.
			writeFileSync(join(repo, 'extra.txt'), 'pytest==7.0.0\n');
			appendFileSync(join(repo, 'requirements.txt'), '-r extra.txt\n');
			return spawnErrorResult('pip-audit not found: ENOENT');
		});
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(result.unavailableSources.some(s => s.includes('pip')), JSON.stringify(result.unavailableSources));
		assert.equal(result.contentStable, false, 'the post-audit closure regression must still be caught after a spawnError');
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: a version-uncertain pip pin is recorded in unresolvedDependencies as an input-fidelity gap, alongside (not instead of) the actually-audited coordinate in queriedCoordinates', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask>=2.0.0\n');
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'pip', exitCode: 0, parsed: { dependencies: [{ name: 'flask', version: '2.1.0', vulns: [] }] } }));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(result.unresolvedDependencies.some(d => d.toLowerCase().includes('flask')), JSON.stringify(result.unresolvedDependencies));
		// The gap note is about input-pinning fidelity (the requirement was a
		// range, not an exact pin); it does not contradict pip-audit's own
		// clean report of whatever version it actually resolved and checked --
		// the two are different, non-conflicting facts about the same package.
		assert.ok(result.queriedCoordinates.includes('pip:flask@2.1.0'), JSON.stringify(result.queriedCoordinates));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: a confirmed match is NEVER suppressed because an UNRELATED manager's directory recorded an unresolved gap for the same bare package name (different ecosystems can share a name without being the same coordinate)", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		// npm (at the repo root) reports a REAL confirmed vulnerability for its
		// own 'flask'-named package; a pip requirements.txt in a subdirectory
		// uses an unpinned range for PyPI's unrelated 'flask' package, recording
		// an input-fidelity gap. The two are different packages in different
		// ecosystems and must never be conflated.
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		mkdirSync(join(repo, 'sub'));
		writeFileSync(join(repo, 'sub', 'requirements.txt'), 'flask>=2.0.0\n');
		execFileSync('git', ['add', '.'], { cwd: repo });
		execFileSync('git', ['commit', '-q', '-m', 'add managers'], { cwd: repo });
		_setPkgAuditExecuteForTests(async (input: ToolInput) => {
			if (input['manager'] === 'npm') {
				return okResult({ manager: 'npm', exitCode: 0, parsed: { vulnerabilities: { flask: { range: '2.0.0', via: [{ source: 1, severity: 'high', url: 'https://example.com/advisory' }] } } } });
			}
			return okResult({ manager: 'pip', exitCode: 0, parsed: { dependencies: [] } });
		});
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }, { path: 'sub/requirements.txt' }] });
		assert.ok(result.matches.some(m => m.coordinate === 'npm:flask@2.0.0'), JSON.stringify(result.matches));
		assert.ok(result.unresolvedDependencies.some(d => d.toLowerCase().includes('flask')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: a pip-audit dependency entry with no 'vulns' key at all, alongside one with an exact-pin match, both reconcile correctly (regression for unresolvedCoordinates carrying the full coordinate instead of a bare name)", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\nrequests==2.25.1\n');
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'pip', exitCode: 0,
			parsed: { dependencies: [{ name: 'flask', version: '2.0.0' }, { name: 'requests', version: '2.25.1', vulns: [{ id: 'PYSEC-1' }] }] },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(result.unresolvedDependencies.some(d => d.toLowerCase().startsWith('pip:flask@')), JSON.stringify(result.unresolvedDependencies));
		assert.ok(result.matches.some(m => m.coordinate === 'pip:requests@2.25.1'), JSON.stringify(result.matches));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: the exact same coordinate reported BOTH clean and as a match (duplicate/conflicting entries) is kept only in matches, never also in queriedCoordinates', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'requests==2.25.1\n');
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'pip', exitCode: 0,
			parsed: { dependencies: [
				{ name: 'requests', version: '2.25.1', vulns: [{ id: 'PYSEC-1' }] },
				{ name: 'requests', version: '2.25.1', vulns: [] },
			] },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(result.matches.some(m => m.coordinate === 'pip:requests@2.25.1'), JSON.stringify(result.matches));
		assert.ok(!result.queriedCoordinates.includes('pip:requests@2.25.1'), JSON.stringify(result.queriedCoordinates));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: an npm audit entry whose 'via' names only OTHER vulnerable packages (no advisory objects of its own) is unresolved, never reported as cleanly audited", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'npm', exitCode: 0,
			// npm's own "transitively vulnerable via another package" shape:
			// via contains only a bare dependency-name STRING, no advisory object.
			parsed: { vulnerabilities: { lodash: { range: '4.0.0', via: ['some-other-package'] } } },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(!result.queriedCoordinates.some(c => c.startsWith('npm:lodash@')), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.matches.some(m => m.coordinate.startsWith('npm:lodash@')), JSON.stringify(result.matches));
		assert.ok(result.unresolvedDependencies.some(d => d.includes('npm:lodash@4.0.0')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: duplicate raw entries for the SAME coordinate -- one with no 'vulns' key (unresolved) and one with a confirmed vuln (match) -- reconcile to the match, never also unresolved", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'requests==2.25.1\n');
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'pip', exitCode: 0,
			parsed: { dependencies: [
				{ name: 'requests', version: '2.25.1' },
				{ name: 'requests', version: '2.25.1', vulns: [{ id: 'PYSEC-1' }] },
			] },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(result.matches.some(m => m.coordinate === 'pip:requests@2.25.1'), JSON.stringify(result.matches));
		assert.ok(!result.unresolvedDependencies.some(d => d.includes('pip:requests@2.25.1')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: duplicate raw entries for the SAME coordinate -- one with no 'vulns' key (unresolved) and one cleanly audited -- reconcile to clean, never also unresolved", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'requests==2.25.1\n');
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'pip', exitCode: 0,
			parsed: { dependencies: [
				{ name: 'requests', version: '2.25.1' },
				{ name: 'requests', version: '2.25.1', vulns: [] },
			] },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(result.queriedCoordinates.includes('pip:requests@2.25.1'), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.unresolvedDependencies.some(d => d.includes('pip:requests@2.25.1')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: npm audit only reports VULNERABLE packages -- a package in package-lock.json's own inventory that audit never flagged is still accounted for in queriedCoordinates", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({
			packages: {
				'': {},
				'node_modules/lodash': { version: '4.17.21' },
				'node_modules/leftpad': { version: '1.3.0' },
			},
		}));
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'npm', exitCode: 0,
			parsed: { vulnerabilities: { leftpad: { range: '1.3.0', via: [{ source: 1, severity: 'high', url: 'https://example.com/advisory' }] } } },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(result.matches.some(m => m.coordinate === 'npm:leftpad@1.3.0'), JSON.stringify(result.matches));
		assert.ok(result.queriedCoordinates.includes('npm:lodash@4.17.21'), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.queriedCoordinates.some(c => c.startsWith('npm:leftpad@')), JSON.stringify(result.queriedCoordinates));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: a pip-audit dependency entry with a non-empty but entirely malformed 'vulns' array (e.g. [null]) is unresolved, never silently dropped from every bucket", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'pip', exitCode: 0, parsed: { dependencies: [{ name: 'flask', version: '2.0.0', vulns: [null] }] } }));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(!result.queriedCoordinates.some(c => c.includes('flask')), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.matches.some(m => m.coordinate.includes('flask')), JSON.stringify(result.matches));
		assert.ok(result.unresolvedDependencies.some(d => d.includes('pip:flask@2.0.0')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: a pip-audit dependency entry with no 'vulns' key at all is unresolved, never reported as cleanly audited", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'requirements.txt'), 'flask==2.0.0\n');
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'pip', exitCode: 0, parsed: { dependencies: [{ name: 'flask', version: '2.0.0' }] } }));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'requirements.txt' }] });
		assert.ok(!result.queriedCoordinates.some(c => c.toLowerCase().includes('flask')), JSON.stringify(result.queriedCoordinates));
		assert.ok(result.unresolvedDependencies.some(d => d.toLowerCase().includes('flask')), JSON.stringify(result.unresolvedDependencies));
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
		_setConfigGetForTests(async () => shellOk('https://registry.npmjs.org/\n'));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(result.perManagerMode.length > 0, 'expected at least one perManagerMode entry');
		for (const entry of result.perManagerMode) {
			assert.ok(entry.configuredDestination !== undefined, JSON.stringify(entry));
		}
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: npm -- a vulnerable package name with TWO different locked instances only reports the affected node path, and the OTHER instance stays in queriedCoordinates as clean', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({
			packages: {
				'': {},
				'node_modules/demo': { version: '1.0.0' },
				'node_modules/other/node_modules/demo': { version: '2.0.0' },
			},
		}));
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'npm', exitCode: 0,
			parsed: { vulnerabilities: { demo: { range: '<2.0.0', nodes: ['node_modules/demo'], via: [{ source: 1, severity: 'high', url: 'https://example.com/advisory' }] } } },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(result.matches.some(m => m.coordinate === 'npm:demo@1.0.0'), JSON.stringify(result.matches));
		assert.ok(!result.matches.some(m => m.coordinate === 'npm:demo@2.0.0'), JSON.stringify(result.matches));
		assert.ok(result.queriedCoordinates.includes('npm:demo@2.0.0'), JSON.stringify(result.queriedCoordinates));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: cargo -- two locked versions of the same crate, only one reported vulnerable by cargo-audit -- the match uses the REPORTED version, the other stays clean', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'Cargo.toml'), '[package]\nname = "x"\n');
		writeFileSync(join(repo, 'Cargo.lock'), [
			'[[package]]', 'name = "demo"', 'version = "1.0.0"', '',
			'[[package]]', 'name = "demo"', 'version = "2.0.0"', '',
		].join('\n'));
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'cargo', exitCode: 0,
			parsed: { vulnerabilities: { list: [{ package: { name: 'demo', version: '1.0.0' }, advisory: { id: 'RUSTSEC-1', severity: 'high' } }] } },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'Cargo.toml' }, { path: 'Cargo.lock' }] });
		assert.ok(result.matches.some(m => m.coordinate === 'cargo:demo@1.0.0'), JSON.stringify(result.matches));
		assert.ok(!result.matches.some(m => m.coordinate === 'cargo:demo@2.0.0'), JSON.stringify(result.matches));
		assert.ok(result.queriedCoordinates.includes('cargo:demo@2.0.0'), JSON.stringify(result.queriedCoordinates));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: a pip-audit response naming a package EXCLUDED from the generated poetry export (not in includedNames) is rejected, never accepted as a clean coordinate', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'poetry.lock'), `
[[package]]
name = "requests"
version = "2.25.1"

[[package]]
name = "privatelib"
version = "0.1.0"

[package.source]
type = "git"
url = "https://github.com/example/privatelib.git"
`);
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'poetry', exitCode: 0,
			parsed: { dependencies: [
				{ name: 'requests', version: '2.25.1', vulns: [] },
				{ name: 'privatelib', version: '0.1.0', vulns: [] },
			] },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'poetry.lock' }] });
		assert.ok(result.queriedCoordinates.includes('poetry:requests@2.25.1'), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.queriedCoordinates.some(c => c.includes('privatelib')), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.matches.some(m => m.coordinate.includes('privatelib')), JSON.stringify(result.matches));
		assert.ok(result.unavailableSources.some(s => s.includes('privatelib')), JSON.stringify(result.unavailableSources));
		assert.ok(result.unresolvedDependencies.some(d => d.includes('privatelib')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: npm's configuredDestination is resolved by shelling out to the manager's OWN 'config get registry' -- never a hand-parsed .npmrc", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		const captured: string[][] = [];
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'npm', exitCode: 0, parsed: { vulnerabilities: {} } }));
		_setConfigGetForTests(async (argv) => {
			captured.push([...argv]);
			return shellOk('https://registry.example.invalid/\n');
		});
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		const npmEntry = result.perManagerMode.find(e => e.manager === 'npm');
		assert.ok(npmEntry?.configuredDestination?.includes('registry.example.invalid'), JSON.stringify(npmEntry));
		assert.ok(!npmEntry?.configuredDestination?.includes('registry.npmjs.org'), JSON.stringify(npmEntry));
		assert.deepEqual(captured[0], ['npm', 'config', 'get', 'registry']);
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: npm's configuredDestination is reported 'unknown' (never silently the public default) when 'config get registry' itself fails to run", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'npm', exitCode: 0, parsed: { vulnerabilities: {} } }));
		_setConfigGetForTests(async () => ({ stdout: '', stderr: 'npm: command not found', code: null, spawnError: true, timedOut: false, stdoutTruncated: false }));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		const npmEntry = result.perManagerMode.find(e => e.manager === 'npm');
		assert.ok(npmEntry?.configuredDestination?.includes('unknown'), JSON.stringify(npmEntry));
		assert.ok(!npmEntry?.configuredDestination?.includes('registry.npmjs.org'), JSON.stringify(npmEntry));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: a genuine manager ambiguity (two lockfiles of the same family in one directory) is recorded as a coverage gap, never silently dropped from the evidence', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package-lock.json'), '{}\n');
		writeFileSync(join(repo, 'pnpm-lock.yaml'), '');
		_setPkgAuditExecuteForTests(async () => { throw new Error('pkg_audit must never run for an ambiguous directory'); });
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package-lock.json' }, { path: 'pnpm-lock.yaml' }] });
		assert.deepEqual(result.perManagerMode, []);
		assert.deepEqual(result.matches, []);
		assert.ok(result.unavailableSources.some(s => s.includes('npm') && s.includes('pnpm')), JSON.stringify(result.unavailableSources));
		assert.equal(result.contentStable, true);
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: npm -- two advisories under the SAME package name cover DISJOINT version ranges; each applies only to the installed instance its own range actually covers", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({
			packages: {
				'': {},
				'node_modules/demo': { version: '1.0.0' },
				'node_modules/other/node_modules/demo': { version: '2.0.0' },
			},
		}));
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'npm', exitCode: 0,
			parsed: { vulnerabilities: { demo: {
				range: '<3.0.0',
				nodes: ['node_modules/demo', 'node_modules/other/node_modules/demo'],
				via: [
					{ source: 1, severity: 'high', url: 'https://example.com/advisory-a', range: '<2.0.0' },
					{ source: 2, severity: 'moderate', url: 'https://example.com/advisory-b', range: '>=2.0.0 <3.0.0' },
				],
			} } },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		// Exactly two findings, not four: advisory A only against 1.0.0, advisory B only against 2.0.0.
		assert.equal(result.matches.length, 2, JSON.stringify(result.matches));
		assert.ok(result.matches.some(m => m.coordinate === 'npm:demo@1.0.0' && m.advisoryId.includes('advisory-a')), JSON.stringify(result.matches));
		assert.ok(result.matches.some(m => m.coordinate === 'npm:demo@2.0.0' && m.advisoryId.includes('advisory-b')), JSON.stringify(result.matches));
		assert.ok(!result.matches.some(m => m.coordinate === 'npm:demo@1.0.0' && m.advisoryId.includes('advisory-b')), JSON.stringify(result.matches));
		assert.ok(!result.matches.some(m => m.coordinate === 'npm:demo@2.0.0' && m.advisoryId.includes('advisory-a')), JSON.stringify(result.matches));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: npm -- an advisory whose range (or the instance's own version) is not valid semver is reported as unresolved, never silently matched or silently clean", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({
			packages: { '': {}, 'node_modules/demo': { version: 'not-a-semver-version' } },
		}));
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'npm', exitCode: 0,
			parsed: { vulnerabilities: { demo: { range: '<2.0.0', nodes: ['node_modules/demo'], via: [{ source: 1, severity: 'high', url: 'https://example.com/advisory' }] } } },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(!result.matches.some(m => m.coordinate.includes('demo')), JSON.stringify(result.matches));
		assert.ok(!result.queriedCoordinates.some(c => c.includes('demo')), JSON.stringify(result.queriedCoordinates));
		assert.ok(result.unresolvedDependencies.some(d => d.includes('demo')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: a pip-audit response naming a package under a DIFFERENT but PEP-503-equivalent spelling (typing_extensions vs typing-extensions) is NOT rejected as unexpected", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'poetry.lock'), `
[[package]]
name = "typing_extensions"
version = "4.0.0"
`);
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'poetry', exitCode: 0,
			// pip-audit itself returns the PyPI-canonical spelling, which can
			// differ from how the lockfile spells the same package.
			parsed: { dependencies: [{ name: 'typing-extensions', version: '4.0.0', vulns: [] }] },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'poetry.lock' }] });
		assert.ok(result.queriedCoordinates.includes('poetry:typing-extensions@4.0.0'), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.unavailableSources.some(s => s.includes('typing')), JSON.stringify(result.unavailableSources));
	} finally {
		cleanup(repo);
	}
});

test('collectDependencyAdvisories: npm v1 lockfile -- a nested dependency (a different version bundled under a parent) is still part of the clean inventory, not just the top-level one', async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({
			dependencies: {
				parent: { version: '1.0.0', dependencies: { child: { version: '2.0.0' } } },
			},
		}));
		_setPkgAuditExecuteForTests(async () => okResult({ manager: 'npm', exitCode: 0, parsed: { vulnerabilities: {} } }));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(result.queriedCoordinates.includes('npm:parent@1.0.0'), JSON.stringify(result.queriedCoordinates));
		assert.ok(result.queriedCoordinates.includes('npm:child@2.0.0'), JSON.stringify(result.queriedCoordinates));
	} finally {
		cleanup(repo);
	}
});

test("collectDependencyAdvisories: npm -- an instance whose version is outside every advisory OBJECT's range, but whose 'via' ALSO carries an unexplained transitive STRING entry, is unresolved, never silently clean", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		writeFileSync(join(repo, 'package.json'), '{}\n');
		writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({
			packages: {
				'': {},
				'node_modules/demo': { version: '1.0.0' },
				'node_modules/other/node_modules/demo': { version: '2.0.0' },
			},
		}));
		_setPkgAuditExecuteForTests(async () => okResult({
			manager: 'npm', exitCode: 0,
			// npm's own mixed shape: a direct advisory object (affecting only
			// 1.0.0) PLUS a bare string naming a transitive chain that carries
			// no range of its own at all -- 2.0.0 is listed in 'nodes' (so npm
			// itself considers it affected, via that chain) but no advisory
			// object's range covers it.
			parsed: { vulnerabilities: { demo: {
				range: '<3.0.0',
				nodes: ['node_modules/demo', 'node_modules/other/node_modules/demo'],
				via: [
					{ source: 1, severity: 'high', url: 'https://example.com/advisory-direct', range: '<2.0.0' },
					'child',
				],
			} } },
		}));
		const result = await collectDependencyAdvisories(repo, { entries: [{ path: 'app.ts' }, { path: 'package.json' }, { path: 'package-lock.json' }] });
		assert.ok(result.matches.some(m => m.coordinate === 'npm:demo@1.0.0'), JSON.stringify(result.matches));
		assert.ok(!result.queriedCoordinates.includes('npm:demo@2.0.0'), JSON.stringify(result.queriedCoordinates));
		assert.ok(!result.matches.some(m => m.coordinate === 'npm:demo@2.0.0'), JSON.stringify(result.matches));
		assert.ok(result.unresolvedDependencies.some(d => d.includes('npm:demo@2.0.0')), JSON.stringify(result.unresolvedDependencies));
	} finally {
		cleanup(repo);
	}
});

