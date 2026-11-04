/**
 * Epic c2ba6fa6, Story s10, t10 -- runs the Story's JetBrains JUnit test under
 * Gradle and reads its JUnit report, so the node build gate can check it. Needs
 * a JDK; it is outside the main src test sweep.
 *
 * Run: npx tsx --test jetbrains-plugin/__tests__/s10-gradle.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = 'ai.insors.insrc.jetbrains';

function junitCase(cls: string, name: string): void {
	const run = spawnSync('./gradlew', ['test', '--tests', `${PKG}.${cls}`, '--rerun-tasks', '-q'], { cwd: PLUGIN, encoding: 'utf8', timeout: 590_000 });
	assert.equal(run.status, 0, `gradle test ${cls} failed:\n${run.stdout}\n${run.stderr}`);
	const xml = readFileSync(join(PLUGIN, 'build', 'test-results', 'test', `TEST-${PKG}.${cls}.xml`), 'utf8');
	const at = xml.indexOf(`<testcase name="${name}()"`);
	assert.ok(at >= 0, `${cls}: '${name}' did not run`);
	const next = xml.indexOf('<testcase', at + 1);
	const block = xml.slice(at, next >= 0 ? next : undefined);
	assert.ok(!/<failure|<error|<skipped/.test(block), `${cls}: '${name}' did not pass:\n${block}`);
}

test('s10 t10: JetBrains RepoStatusDialog renders docRelations states', { timeout: 600_000 }, () => {
	junitCase('actions.DocRelationsRowsTest', 'the Document links group shows the switch, the figures and why new documents are not examined, and nothing without the field');
});
