/**
 * Epic b220bb6174a2f5ed, Story s5 — runs the Story's JetBrains JUnit tests under Gradle
 * and reads their JUnit reports, so the node build gate can check Kotlin tests (the
 * pattern of s7-gradle.test.ts). Each node test names Kotlin test cases and passes only
 * when every one of them ran and passed. Needs a JDK; it is outside the main src sweep.
 *
 * Run: npx tsx --test jetbrains-plugin/__tests__/b220-s5-gradle.test.ts
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
	const escaped = name.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	let at = xml.indexOf(`<testcase name="${escaped}()"`);
	if (at < 0) at = xml.indexOf(`<testcase name="${name}()"`);
	assert.ok(at >= 0, `${cls}: '${name}' did not run`);
	const next = xml.indexOf('<testcase', at + 1);
	const block = xml.slice(at, next >= 0 ? next : undefined);
	assert.ok(!/<failure|<error|<skipped/.test(block), `${cls}: '${name}' did not pass:\n${block}`);
}

const LONG = { timeout: 600_000 };

test("b220-s5-gradle.test.ts: ModelDefinitionsGatewayTest parses a family's host and its models' hosting, and null when the answer has neither", LONG, () => {
	junitCase('daemon.ModelDefinitionsGatewayTest', "parses a family's host and its models' hosting, and null when the answer has neither");
});
