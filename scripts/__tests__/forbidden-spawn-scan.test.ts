/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t11: the forbidden-spawn scan reports every direct spawn and direct builtin
 * execute call outside src/daemon/tools, in report mode and failing mode.
 * Run: npx tsx --test scripts/__tests__/forbidden-spawn-scan.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'forbidden-spawn-scan.mjs');
const FIXTURES = join(HERE, 'fixtures');

interface Report {
	mode: string;
	violations: Array<{ file: string; line: number; form: string; text: string }>;
	exempt: Array<{ file: string; reason: string; sites: number }>;
	unscanned: Array<{ file: string; reason: string }>;
}

function scan(root: string, ...flags: string[]): { code: number | null; report: Report; stdout: string; stderr: string } {
	const json = spawnSync(process.execPath, [SCRIPT, '--root', root, '--json', ...flags], { encoding: 'utf8' });
	const plain = spawnSync(process.execPath, [SCRIPT, '--root', root, ...flags], { encoding: 'utf8' });
	assert.equal(json.status, plain.status, 'the json and plain runs end alike');
	return { code: json.status, report: JSON.parse(json.stdout) as Report, stdout: plain.stdout, stderr: plain.stderr };
}

test('forbidden-spawn-scan.test.ts: one positive-control fixture per form is reported with its file, line and form', () => {
	const { report } = scan(join(FIXTURES, 'forms'));
	const byFile = new Map(report.violations.map(v => [v.file, v]));
	assert.deepEqual([...byFile.keys()].sort(), ['builtin-execute.ts', 'direct-spawn.ts', 'injected-seam.ts', 'shell-helper.ts', 'wrapper-call.ts']);
	for (const form of ['builtin-execute', 'direct-spawn', 'injected-seam', 'shell-helper', 'wrapper-call']) {
		const v = byFile.get(`${form}.ts`)!;
		assert.equal(v.form, form);
		assert.equal(v.line, 2, `${form} is on line 2`);
	}
	assert.equal(report.violations.length, 5, 'one site per fixture');
});

test('forbidden-spawn-scan.test.ts: a command that is not git, gh or acli is not reported', () => {
	const { report, code } = scan(join(FIXTURES, 'clean'));
	assert.deepEqual(report.violations, []);
	assert.equal(code, 0);
});

test('forbidden-spawn-scan.test.ts: the exact installer and indexer exemptions are listed with their reasons and are not violations', () => {
	const { report, code, stdout } = scan(join(FIXTURES, 'exempt'), '--fail');
	assert.deepEqual(report.violations, []);
	assert.equal(code, 0, 'exempt sites do not fail failing mode');
	assert.deepEqual(report.exempt.map(e => e.file).sort(), ['indexer/file-filter.ts', 'installer/dev-git.ts']);
	assert.ok(report.exempt.every(e => e.reason.length > 20 && e.sites === 1));
	assert.match(stdout, /exempt indexer\/file-filter\.ts/);
});

test('forbidden-spawn-scan.test.ts: report mode exits 0 and failing mode exits 1 over the same sites', () => {
	const report = scan(join(FIXTURES, 'forms'));
	const failing = scan(join(FIXTURES, 'forms'), '--fail');
	assert.equal(report.code, 0);
	assert.equal(report.report.mode, 'report');
	assert.equal(failing.code, 1);
	assert.equal(failing.report.mode, 'failing');
	assert.deepEqual(failing.report.violations, report.report.violations);
	assert.match(report.stdout, /direct-spawn\.ts:2:\d+ direct-spawn/);
});

test('forbidden-spawn-scan.test.ts: an unparseable file is listed as unscanned and exits non-zero even in report mode', () => {
	const r = scan(join(FIXTURES, 'unparseable'));
	assert.notEqual(r.code, 0);
	assert.deepEqual(r.report.unscanned.map(u => u.file), ['bad.ts']);
	assert.match(r.stderr, /UNSCANNED bad\.ts/);
});

test('forbidden-spawn-scan.test.ts: current src has no forbidden sites outside the exact active exemptions', () => {
	const { report, code } = scan(join(ROOT, 'src'), '--fail');
	assert.equal(code, 0);
	assert.deepEqual(report.unscanned, []);
	assert.deepEqual(report.violations, []);
	assert.deepEqual(report.exempt.map(e => e.file).sort(), ['indexer/file-filter.ts', 'installer/dev-git.ts']);
});
