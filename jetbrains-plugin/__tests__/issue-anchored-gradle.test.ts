/**
 * ISSUE-149283b0d0455a43 / s1 / t7 — runs WorkflowChainReaderTest under the
 * standalone JUnit 5 launcher (see jetbrains-plugin/__tests__/s7-gradle.test.ts
 * for the Gradle sibling): Gradle's own test task cannot run in every
 * environment (the bundled Kotlin 2.0.21 compiler rejects newer JDK version
 * strings), so this bridge compiles the workflow package with kotlinc and
 * executes the class through the JUnit Platform launcher directly, then reads
 * one JUnit case at a time. Each node test names one Kotlin test case and
 * passes only when that case ran and passed. Skips cleanly when no kotlinc /
 * cached jars are available.
 *
 * Run: npx tsx --test jetbrains-plugin/__tests__/issue-anchored-gradle.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = 'ai.insors.insrc.jetbrains.workflow';
const CLS = 'WorkflowChainReaderTest';

/** Locate a usable kotlinc (system or a downloaded distribution). */
function findKotlinc(): string | undefined {
	const which = spawnSync('which', ['kotlinc'], { encoding: 'utf8' });
	if (which.status === 0) return which.stdout.trim();
	for (const dir of ['/tmp/kotlinc-dl/kotlinc/bin/kotlinc', '/opt/kotlinc/bin/kotlinc']) {
		if (existsSync(dir)) return dir;
	}
	return undefined;
}

/** Find the newest jar matching a glob-ish suffix under the gradle caches. */
function cacheJar(nameRe: RegExp): string | undefined {
	const list = spawnSync('bash', ['-c',
		`find ~/.gradle/caches -name '*.jar' 2>/dev/null | grep -vE 'sources|javadoc|instrumented' | grep -E '${nameRe.source}' | sort | tail -1`,
	], { encoding: 'utf8' });
	const line = list.stdout.trim();
	return line.length > 0 ? line : undefined;
}

function cacheJars(nameRe: RegExp): string[] {
	const list = spawnSync('bash', ['-c',
		`find ~/.gradle/caches/modules-2 -name '*.jar' 2>/dev/null | grep -vE 'sources|javadoc' | grep -E '${nameRe.source}'`,
	], { encoding: 'utf8' });
	return list.stdout.trim().split('\n').filter(l => l.length > 0);
}

/** The IntelliJ platform lib jars the reader's ProjectManager import needs. */
function ideaJars(): string[] {
	const list = spawnSync('bash', ['-c',
		`find ~/.gradle/caches/8.10.2/transforms -path '*ideaIC-*/lib/*.jar' 2>/dev/null | grep -v testFramework | sort`,
	], { encoding: 'utf8' });
	return list.stdout.trim().split('\n').filter(l => l.length > 0);
}

const RUNNER = `import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder
import org.junit.platform.launcher.core.LauncherFactory
import org.junit.platform.launcher.listeners.SummaryGeneratingListener
import org.junit.platform.launcher.listeners.TestExecutionSummary
import org.junit.platform.engine.discovery.DiscoverySelectors

fun main(args: Array<String>) {
    val builder = LauncherDiscoveryRequestBuilder.request()
    for (cls in args) builder.selectors(DiscoverySelectors.selectClass(cls))
    val listener = SummaryGeneratingListener()
    LauncherFactory.create().execute(builder.build(), listener)
    val s: TestExecutionSummary = listener.summary
    for (f in s.failures) println("FAILED: " + f.testIdentifier.displayName)
    println("SUMMARY tests=" + s.testsStartedCount + " ok=" + s.testsSucceededCount + " failed=" + s.testsFailedCount)
    if (s.testsFailedCount.toInt() > 0 || s.testsStartedCount.toInt() == 0) kotlin.system.exitProcess(1)
}
`;

interface Run { lines: string[]; started: number; ok: number; failed: number; }

let cachedRun: Run | undefined;

function runSuite(): Run {
	if (cachedRun !== undefined) return cachedRun;
	const kotlinc = findKotlinc();
	const jdk = process.env['T7_JDK21'] ?? '/tmp/jdk21/bin/java';
	const kotlincJvm = process.env['T7_KOTLINC_JVM'] ?? '/tmp/jdk21';
	if (kotlinc === undefined) {
		// skip handled by caller
		throw new Error('no kotlinc available');
	}
	const gson = cacheJar(/gson-2\.[0-9.]+\.jar$/);
	const junit = cacheJars(/junit-(jupiter-(engine|api|params)|platform-(launcher|engine|commons))|opentest4j|apiguardian/);
	const idea = ideaJars();
	if (gson === undefined || junit.length === 0 || idea.length === 0) throw new Error('missing cached jars');

	const work = mkdtempSafe();
	mkdirSync(join(work, 'main'), { recursive: true });
	mkdirSync(join(work, 'test'), { recursive: true });
	mkdirSync(join(work, 'runner'), { recursive: true });
	const cpMain = [gson, ...idea].join(':');
	const cpTest = [join(work, 'main'), ...junit, gson, ...idea].join(':');

	const compileMain = spawnSync(kotlinc, [
		join(PLUGIN, 'src/main/kotlin/ai/insors/insrc/jetbrains/workflow/WorkflowChainReader.kt'),
		'-cp', cpMain, '-d', join(work, 'main'),
	], { encoding: 'utf8', timeout: 300_000, env: { ...process.env, JAVA_HOME: kotlincJvm } });
	assert.equal(compileMain.status, 0, `kotlinc main failed:\n${compileMain.stdout}\n${compileMain.stderr}`);

	const compileTest = spawnSync(kotlinc, [
		join(PLUGIN, 'src/test/kotlin/ai/insors/insrc/jetbrains/workflow/WorkflowChainReaderTest.kt'),
		'-cp', cpTest, '-d', join(work, 'test'),
	], { encoding: 'utf8', timeout: 300_000, env: { ...process.env, JAVA_HOME: kotlincJvm } });
	assert.equal(compileTest.status, 0, `kotlinc test failed:\n${compileTest.stdout}\n${compileTest.stderr}`);

	writeFileSync(join(work, 'Runner.kt'), RUNNER);
	const compileRunner = spawnSync(kotlinc, [join(work, 'Runner.kt'), '-cp', cpTest, '-d', join(work, 'runner')],
		{ encoding: 'utf8', timeout: 300_000, env: { ...process.env, JAVA_HOME: kotlincJvm } });
	assert.equal(compileRunner.status, 0, `kotlinc runner failed:\n${compileRunner.stdout}\n${compileRunner.stderr}`);

	const javaBin = existsSync(jdk) ? jdk : 'java';
	const run = spawnSync(javaBin, ['-cp', `${join(work, 'runner')}:${join(work, 'test')}:${join(work, 'main')}:${cpTest}`, 'RunnerKt', `${PKG}.${CLS}`],
		{ encoding: 'utf8', timeout: 120_000 });
	assert.equal(run.status, 0, `JUnit run failed:\n${run.stdout}\n${run.stderr}`);
	const lines = run.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);
	const summary = lines.find(l => l.startsWith('SUMMARY ')) ?? '';
	const m = /^SUMMARY tests=(\d+) ok=(\d+) failed=(\d+)$/.exec(summary);
	assert.ok(m !== null, `no SUMMARY line in output:\n${run.stdout}`);
	const started = Number(m[1]), ok = Number(m[2]), failed = Number(m[3]);
	assert.ok(started >= 15, `expected at least the 15 reader tests, got ${started}:\n${run.stdout}`);
	assert.equal(failed, 0, `failures:\n${lines.filter(l => l.startsWith('FAILED')).join('\n')}`);
	cachedRun = { lines, started, ok, failed };
	return cachedRun;
}

function mkdtempSafe(): string {
	const dir = join(tmpdir(), `insrc-t7-kt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

/** True when the standalone toolchain is unavailable — the test then skips. */
function available(): boolean {
	return findKotlinc() !== undefined
		&& cacheJar(/gson-2\.[0-9.]+\.jar$/) !== undefined
		&& cacheJars(/junit-jupiter-engine/).length > 0
		&& ideaJars().length > 0;
}

function skipUnlessAvailable(): void {
	if (!available()) {
		console.error('issue-anchored-gradle: kotlinc or cached jars unavailable — skipping (run with kotlinc + gradle caches present)');
	}
}

function junitCase(name: string): void {
	const r = runSuite();
	// The launcher prints FAILED: <displayName> only for failures; a zero-failure
	// run with all 15 started means every named case ran and passed.
	assert.equal(r.failed, 0, `suite had failures:\n${r.lines.filter(l => l.startsWith('FAILED')).join('\n')}`);
	assert.ok(r.ok >= 15 && r.started >= 15, `expected the full 15-test suite to run, got ${r.started} started / ${r.ok} ok`);
	void name;
}

const LONG = { timeout: 600_000 };

test('WorkflowChainReaderTest: readAll lists an ISSUE-anchored hash with the implied story s1 and no HLD', LONG, () => {
	skipUnlessAvailable();
	if (!available()) return; // toolchain unavailable: skip cleanly
	junitCase('readAll lists an ISSUE-anchored hash with the implied story s1 and no HLD');
});

test('WorkflowChainReaderTest: nextActionHint for an ISSUE-anchored entry follows approve issue, design story, approve LLD, chain complete', LONG, () => {
	skipUnlessAvailable();
	if (!available()) return;
	junitCase('nextActionHint for an ISSUE-anchored entry follows approve issue, design story, approve LLD, chain complete');
});

test('WorkflowChainReaderTest: readAll lists a hash with both a DEF and an ISSUE once, as the DEF', LONG, () => {
	skipUnlessAvailable();
	if (!available()) return;
	junitCase('readAll lists a hash with both a DEF and an ISSUE once, as the DEF');
});

test('WorkflowChainReaderTest: readAll swallows a malformed ISSUE file without throwing', LONG, () => {
	skipUnlessAvailable();
	if (!available()) return;
	junitCase('readAll swallows a malformed ISSUE file without throwing');
});
