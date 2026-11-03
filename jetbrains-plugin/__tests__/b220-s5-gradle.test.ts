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

test('b220-s5-gradle.test.ts: ModelTiersModelTest offers the host family, labels its models cloud or local, offers efforts only where the model has them and writes the whole tier', LONG, () => {
	junitCase('settings.ModelTiersModelTest', 'offers the host family, labels its models cloud or local, offers efforts only where the model has them and writes the whole tier');
});

test("b220-s5-gradle.test.ts: ModelTiersModelTest notes an undeclared host-family model as not supported, the tier will not run, while a vendor or host-less family keeps today's note", LONG, () => {
	junitCase('settings.ModelTiersModelTest', "notes an undeclared host-family model as not supported, the tier will not run, while a vendor or host-less family keeps today's note");
});

test('b220-s5-gradle.test.ts: ModelTiersModelTest resolves a tier saved on the host family to its runner, model and effort on reopen', LONG, () => {
	junitCase('settings.ModelTiersModelTest', 'resolves a tier saved on the host family to its runner, model and effort on reopen');
});

test('b220-s5-gradle.test.ts: ModelCheckFlowTest keeps the host family out of Check model and offers it again when the answer has no host', LONG, () => {
	junitCase('settings.ModelCheckFlowTest', 'keeps the host family out of Check model and offers it again when the answer has no host');
});
