/**
 * The build runs the forbidden-spawn scan in failing mode (Story s9), and on the whole tree the scan finds nothing outside its exemptions.
 * Run: npx tsx --test-force-exit scripts/__tests__/build-script.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('build-script.test.ts: package.json build runs forbidden-spawn-scan.mjs --fail and the scan finds nothing outside the exemptions', () => {
	const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: { build: string } };
	assert.match(pkg.scripts.build, /node scripts\/forbidden-spawn-scan\.mjs --fail(?= &&)/);
	const run = spawnSync(process.execPath, [join(ROOT, 'scripts', 'forbidden-spawn-scan.mjs'), '--fail', '--json'], { encoding: 'utf8' });
	assert.equal(run.status, 0, run.stdout + run.stderr);
	const report = JSON.parse(run.stdout.trim().split('\n').pop()!) as { mode: string; violations: unknown[]; exempt: Array<{ file: string }>; unscanned: unknown[] };
	assert.equal(report.mode, 'failing');
	assert.deepEqual(report.violations, []);
	assert.deepEqual(report.unscanned, []);
	assert.deepEqual(report.exempt.map(e => e.file).sort(), ['cli/services/maintenance.ts', 'daemon/installed-commit.ts', 'indexer/index.ts']);
});
