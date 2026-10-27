/**
 * Epic ce99b72065d03b1b, Story s7 — runs the Story's JetBrains JUnit tests under Gradle
 * and reads their JUnit reports, so the node build gate can check Kotlin tests. Each
 * node test names one Kotlin test case and passes only when that case ran and passed.
 * Needs a JDK; it is outside the main src test sweep.
 *
 * Run: npx tsx --test jetbrains-plugin/__tests__/s7-gradle.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = 'ai.insors.insrc.jetbrains';

/** Each test class runs once per process; later cases read the same report. */
const ran = new Map<string, string>();

function report(cls: string): string {
	const cached = ran.get(cls);
	if (cached !== undefined) return cached;
	const run = spawnSync('./gradlew', ['test', '--tests', `${PKG}.${cls}`, '--rerun-tasks', '-q'], { cwd: PLUGIN, encoding: 'utf8', timeout: 590_000 });
	assert.equal(run.status, 0, `gradle test ${cls} failed:\n${run.stdout}\n${run.stderr}`);
	const xml = readFileSync(join(PLUGIN, 'build', 'test-results', 'test', `TEST-${PKG}.${cls}.xml`), 'utf8');
	ran.set(cls, xml);
	return xml;
}

/** Assert the Kotlin test `name` of `cls` ran and passed. */
function junitCase(cls: string, name: string): void {
	const xml = report(cls);
	const at = xml.indexOf(`<testcase name="${name}()"`);
	assert.ok(at >= 0, `${cls}: '${name}' did not run`);
	const next = xml.indexOf('<testcase', at + 1);
	const block = xml.slice(at, next >= 0 ? next : undefined);
	assert.ok(!/<failure|<error|<skipped/.test(block), `${cls}: '${name}' did not pass:\n${block}`);
}

const LONG = { timeout: 600_000 };

test('SettingsWriteGatewayTest: Saved(restartRequired) and Rejected(reason, detail) from config-write', LONG, () => {
	junitCase('daemon.SettingsWriteGatewayTest', 'Saved(restartRequired) and Rejected(reason, detail) from config-write');
});

test("UnixSocketDaemonRpcParseTest: parse with resultErrorIsFailure=false keeps a not-run check's error, checkId and efforts, default parse unchanged", LONG, () => {
	junitCase('daemon.UnixSocketDaemonRpcParseTest', "parse with resultErrorIsFailure=false keeps a not-run check's error, checkId and efforts, default parse unchanged");
});

test('ModelDefinitionsGatewayTest: modelDefinitions, checkModel and decideModel parse their answers and classify failures', LONG, () => {
	junitCase('daemon.ModelDefinitionsGatewayTest', 'modelDefinitions, checkModel and decideModel parse their answers and classify failures');
	junitCase('daemon.ModelDefinitionsGatewayTest', 'DaemonGatewayService forwards modelDefinitions, checkModel and decideModel to its delegate');
});
