/**
 * Story E20261023a27df028:S001 / t7 — runs the JetBrains model-tiers JUnit test
 * under Gradle and reads its JUnit report, so the node build gate can check a
 * Kotlin test. Needs a JDK; it is outside the main src test sweep.
 *
 * Run: npx tsx --test jetbrains-plugin/__tests__/model-tiers-effort-gradle.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASS = 'ai.insors.insrc.jetbrains.settings.ModelTiersModelTest';
/** The Kotlin test's name: the plan's name with commas, since a Kotlin identifier cannot contain ';'. */
const KOTLIN_NAME = "JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write, ModelTiersSection shows an effort combo per tier, with no effort row in the daemon's catalog it shows no effort combo and emits no effort write";

test("JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write; ModelTiersSection shows an effort combo per tier; with no effort row in the daemon's catalog it shows no effort combo and emits no effort write", { timeout: 600_000 }, () => {
	const run = spawnSync('./gradlew', ['test', '--tests', CLASS, '--rerun-tasks', '-q'], { cwd: PLUGIN, encoding: 'utf8', timeout: 590_000 });
	assert.equal(run.status, 0, `gradle test failed:\n${run.stdout}\n${run.stderr}`);
	const xml = readFileSync(join(PLUGIN, 'build', 'test-results', 'test', `TEST-${CLASS}.xml`), 'utf8');
	assert.match(xml, /failures="0" errors="0"/);
	const at = xml.indexOf(`<testcase name="${KOTLIN_NAME}()"`);
	assert.ok(at >= 0, 'the effort test ran');
	const next = xml.indexOf('<testcase', at + 1);
	const block = xml.slice(at, next >= 0 ? next : undefined);
	assert.ok(!/<failure|<error|<skipped/.test(block), `the effort test passed:\n${block}`);
});
