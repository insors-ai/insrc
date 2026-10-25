/**
 * Epic ce99b72065d03b1b, Story s3 · t9 — runs the JetBrains ModelTiersModel
 * unset-tier test under Gradle and reads its JUnit report, so the node build
 * gate can check a Kotlin test. Needs a JDK; it is outside the main src test sweep.
 *
 * Run: npx tsx --test jetbrains-plugin/__tests__/model-tiers-unset-gradle.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLASS = 'ai.insors.insrc.jetbrains.settings.ModelTiersModelTest';
const KOTLIN_NAME = 'an unset tier shows the default family runner, model and effort of a catalog built by buildConfigCatalog';

test("ModelTiersModelTest: an unset tier shows the fixture default family's values", { timeout: 600_000 }, () => {
	const run = spawnSync('./gradlew', ['test', '--tests', CLASS, '--rerun-tasks', '-q'], { cwd: PLUGIN, encoding: 'utf8', timeout: 590_000 });
	assert.equal(run.status, 0, `gradle test failed:\n${run.stdout}\n${run.stderr}`);
	const xml = readFileSync(join(PLUGIN, 'build', 'test-results', 'test', `TEST-${CLASS}.xml`), 'utf8');
	assert.match(xml, /failures="0" errors="0"/);
	const at = xml.indexOf(`<testcase name="${KOTLIN_NAME}()"`);
	assert.ok(at >= 0, 'the unset-tier test ran');
	const next = xml.indexOf('<testcase', at + 1);
	const block = xml.slice(at, next >= 0 ? next : undefined);
	assert.ok(!/<failure|<error|<skipped/.test(block), `the unset-tier test passed:\n${block}`);
});
