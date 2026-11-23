/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic add-dedicated-security-reviews, s2/t7: createDependencySbomEvidenceProvider.
 * Run: npx tsx --test src/workflow/security-review/__tests__/dependency-sbom-evidence-provider.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { createDependencySbomEvidenceProvider } from '../dependency-sbom-evidence-provider.js';
import { _setPkgAuditExecuteForTests, _setConfigGetForTests } from '../collect-dependency-advisories.js';
import { _setContentIdentityDepsForTests } from '../content-identity.js';
import type { ToolInput, ToolResult } from '../../../daemon/tools/types.js';
import type { ShellResult } from '../../../daemon/tools/shell-helper.js';

function initRepo(): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-sbom-provider-'));
	execFileSync('git', ['init', '-q'], { cwd: repo });
	execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
	execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
	writeFileSync(join(repo, 'package.json'), '{}\n');
	writeFileSync(join(repo, 'package-lock.json'), '{}\n');
	execFileSync('git', ['add', '.'], { cwd: repo });
	execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repo });
	return repo;
}

function treatAsRegistered(repoPath: string): void {
	_setContentIdentityDepsForTests(async candidate => candidate === repoPath);
}

function okResult(data: { manager: string; exitCode: number | null; parsed: unknown }): ToolResult {
	return { output: 'ok', format: 'text', success: true, data: { stdout: '', stderr: '', ...data } };
}

async function defaultConfigGetStub(): Promise<ShellResult> {
	return { stdout: 'https://registry.npmjs.org/\n', stderr: '', code: 0, spawnError: false, timedOut: false, stdoutTruncated: false };
}
_setConfigGetForTests(defaultConfigGetStub);

function cleanup(repo: string): void {
	_setPkgAuditExecuteForTests();
	_setConfigGetForTests(defaultConfigGetStub);
	_setContentIdentityDepsForTests();
	rmSync(repo, { recursive: true, force: true });
}

test("createDependencySbomEvidenceProvider: category is 'dependency-sbom' and run() delegates to collectDependencyAdvisories with the captured repoPath", async () => {
	const repo = initRepo();
	treatAsRegistered(repo);
	try {
		_setPkgAuditExecuteForTests(async (input: ToolInput) => {
			assert.equal(input['manager'], 'npm');
			return okResult({ manager: 'npm', exitCode: 0, parsed: { vulnerabilities: { flask: { range: '2.0.0', via: [{ source: 1, severity: 'high', url: 'https://example.com/advisory' }] } } } });
		});
		const provider = createDependencySbomEvidenceProvider(repo);
		assert.equal(provider.category, 'dependency-sbom');

		const targets = { entries: [{ path: 'package.json' }, { path: 'package-lock.json' }] };
		const output = await provider.run({ category: 'dependency-sbom', targets });

		assert.equal(output.evidence.length, 1);
		assert.equal(output.evidence[0]?.providerCategory, 'dependency-sbom');
	} finally {
		cleanup(repo);
	}
});
