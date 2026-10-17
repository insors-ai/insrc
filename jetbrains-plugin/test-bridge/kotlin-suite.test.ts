/**
 * Bridge from the TypeScript test runner to the Kotlin suite (Story E20261016315d510c:S003 / t9).
 *
 * The JetBrains plugin's tests are JUnit tests run by Gradle, which the build gate cannot run directly.
 * This file runs `./gradlew cleanTest test --no-build-cache --rerun-tasks` once (so results are never replayed from Gradle's cache) with a JDK 21 (the project's toolchain), then reports
 * each named Kotlin test as a test of its own by reading Gradle's JUnit XML. A Kotlin test that is
 * missing, failed, errored or skipped fails its case here; a missing JDK fails every case with the reason.
 *
 * JDK 21 is found from INSRC_JDK21 (a JDK home) or ~/.local/jdk21/jdk-21*.
 */
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, '..');
const REPORTS = join(PLUGIN, 'build', 'test-results', 'test');

function findJdk21(): string | undefined {
  const fromEnv = process.env['INSRC_JDK21'];
  if (fromEnv !== undefined && existsSync(join(fromEnv, 'bin', 'java'))) return fromEnv;
  const root = join(homedir(), '.local', 'jdk21');
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => d.startsWith('jdk-21') && existsSync(join(root, d, 'bin', 'java')));
  return dir === undefined ? undefined : join(root, dir);
}

let setupError: string | undefined;

before(() => {
  const jdk = findJdk21();
  if (jdk === undefined) {
    setupError = 'no JDK 21 found: set INSRC_JDK21 to a JDK 21 home or unpack one under ~/.local/jdk21/';
    return;
  }
  try {
    execFileSync('./gradlew', ['cleanTest', 'test', '--no-build-cache', '--rerun-tasks', '--console=plain', `-Dorg.gradle.java.home=${jdk}`], {
      cwd: PLUGIN,
      env: { ...process.env, JAVA_HOME: jdk, PATH: `${join(jdk, 'bin')}:${process.env['PATH'] ?? ''}` },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 25 * 60_000,
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    setupError = `gradlew test failed: ${(err.stdout ?? '').split('\n').slice(-25).join('\n')}${err.stderr ?? ''}` || err.message;
  }
}, { timeout: 30 * 60_000 });

interface Case { readonly cls: string; readonly name: string }

/** Parse one JUnit XML report into its test cases (name, failed, skipped). */
function readReport(cls: string): Array<{ name: string; failed: boolean; skipped: boolean }> {
  const file = join(REPORTS, `TEST-${cls}.xml`);
  assert.ok(existsSync(file), `no JUnit report for ${cls} under ${REPORTS}`);
  const xml = readFileSync(file, 'utf8');
  const out: Array<{ name: string; failed: boolean; skipped: boolean }> = [];
  for (const m of xml.matchAll(/<testcase name="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const body = m[2] ?? '';
    out.push({
      name: m[1]!.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\(\)$/, ''),
      failed: /<failure|<error/.test(body),
      skipped: /<skipped/.test(body),
    });
  }
  return out;
}

const CASES: readonly Case[] = [
  { cls: 'ai.insors.insrc.jetbrains.settings.InsrcSettingsTrackerTest', name: 'parseCatalog keeps repoFields and an older daemon without them gives an empty list' },
  { cls: 'ai.insors.insrc.jetbrains.settings.InsrcSettingsTrackerTest', name: 'readRepoSettings maps loaded, a daemon refusal and a transport fault' },
  { cls: 'ai.insors.insrc.jetbrains.settings.InsrcSettingsTrackerTest', name: 'writeRepoSetting calls repo_settings_set and maps saved, a refusal and a transport fault' },
  { cls: 'ai.insors.insrc.jetbrains.settings.InsrcSettingsTrackerTest', name: 'repo_settings_set keeps a null value on the wire as an explicit null while config_write still drops it' },
  { cls: 'ai.insors.insrc.jetbrains.settings.InsrcSettingsTrackerTest', name: "the page reads each repo's settings on the pooled thread and hands them with repoFields to PerRepoSection" },
  { cls: 'ai.insors.insrc.jetbrains.settings.InsrcSettingsTrackerTest', name: 'a ghHost edit goes to writeRepoSetting, a model-tier edit still goes to writeSetting' },
  { cls: 'ai.insors.insrc.jetbrains.settings.InsrcSettingsTrackerTest', name: "a refused tracker edit is reported with the daemon's message and stays pending" },
  { cls: 'ai.insors.insrc.jetbrains.daemon.SettingsCatalogDtoDefaultTest', name: 'the DTO built without repoFields defaults to an empty list' },
  { cls: 'ai.insors.insrc.jetbrains.daemon.SettingsCatalogDtoDefaultTest', name: 'the five settings tests build the DTO without repoFields and are unchanged' },
  { cls: 'ai.insors.insrc.jetbrains.settings.SettingsTreeModelTest', name: '*' },
  { cls: 'ai.insors.insrc.jetbrains.settings.SettingsTableModelTest', name: '*' },
  { cls: 'ai.insors.insrc.jetbrains.settings.ModelTiersModelTest', name: '*' },
  { cls: 'ai.insors.insrc.jetbrains.settings.SettingsEditModelTest', name: '*' },
  { cls: 'ai.insors.insrc.jetbrains.settings.SettingsViewTest', name: '*' },
  { cls: 'ai.insors.insrc.jetbrains.daemon.DaemonGatewayServiceTest', name: 'the service forwards readRepoSettings and writeRepoSetting to its delegate' },
  { cls: 'ai.insors.insrc.jetbrains.daemon.DaemonGatewayServiceTest', name: 'the gateway declares both methods and calls repo_settings_get and repo_settings_set, not config_write' },
  { cls: 'ai.insors.insrc.jetbrains.daemon.DaemonGatewayServiceTest', name: 'the four DaemonGateway test doubles implement both new methods' },
  { cls: 'ai.insors.insrc.jetbrains.settings.RepoFieldsContractTest', name: 'JetBrains rows equal the shared catalog fixture and a new row appears' },
  { cls: 'ai.insors.insrc.jetbrains.settings.RepoFieldsContractTest', name: "the rendered Tracker block shows each fixture row's label and note, and only local rows have a text field" },
  { cls: 'ai.insors.insrc.jetbrains.settings.PerRepoSectionTest', name: "one repo's failure shows its reason and the others still render" },
  { cls: 'ai.insors.insrc.jetbrains.settings.PerRepoSectionTest', name: 'the policy source is exposed for a team policy and absent otherwise' },
  { cls: 'ai.insors.insrc.jetbrains.settings.PerRepoSectionTest', name: 'the sign-in row is read-only for signed-in and every failure state' },
];

for (const c of CASES) {
  const short = c.cls.split('.').pop()!;
  const title = c.name === '*' ? `${short}: every test passes` : `${short}: ${c.name}`;
  test(title, () => {
    assert.equal(setupError, undefined, setupError);
    const cases = readReport(c.cls);
    if (c.name === '*') {
      assert.ok(cases.length > 0, `${short} has no test cases`);
      for (const k of cases) assert.ok(!k.failed && !k.skipped, `${short}: ${k.name} did not pass`);
      return;
    }
    const found = cases.find((k) => k.name === c.name);
    assert.ok(found, `Kotlin test not found in ${short}: ${c.name}`);
    assert.ok(!found.failed, `Kotlin test failed: ${short}: ${c.name}`);
    assert.ok(!found.skipped, `Kotlin test skipped: ${short}: ${c.name}`);
  });
}
