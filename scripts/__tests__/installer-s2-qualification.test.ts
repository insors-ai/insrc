import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fingerprint, inputFingerprint, REQUIRED_ARTIFACTS } from '../test-harness/build.mjs';

// Explicit post-run qualification, outside routine backend test discovery. A
// live suite cannot certify its own final cleanup; all installer tests run first.
test('combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup', () => {
  const root = realpathSync('.'), directory = 'src/installer/__tests__';
  const expected = [...readdirSync(join(root, directory))
    .filter(name => name.endsWith('.test.ts'))
    .map(name => `${directory}/${name}`), 'src/shared/__tests__/installation-home.test.ts',
    'scripts/__tests__/build-script.test.ts', 'scripts/__tests__/forbidden-spawn-scan.test.ts',
    'scripts/__tests__/test-harness-coordinator.test.ts'].sort();
  const foundation = process.env['INSRC_RUNTIME_FOUNDATION_REGRESSION'] === '1';
  const pointer = JSON.parse(readFileSync(join(root, `.insrc/tmp/${foundation ? 'runtime-foundation' : 's2'}-final-regression.json`), 'utf8'));
  assert.match(pointer.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const workspace = join(root, '.insrc/tmp/test-harness/runs', pointer.runId);
  const read = (name: string) => JSON.parse(readFileSync(join(workspace, name), 'utf8'));
  const report = read('results.json'), prepared = read('prepared.json'), cleanup = read('cleanup.json');
  assert.equal(report.runId, pointer.runId); assert.equal(prepared.runId, pointer.runId);
  assert.equal(report.incomplete, false); assert.equal(report.error, undefined);
  // Ordinary installer fixtures make no live LLM calls. The foundation sweep
  // uses two independently owned test processes; retain S2's serial contract.
  assert.equal(report.effectiveConcurrency, foundation ? 2 : 1);
  // These names describe the parent environment; the coordinator clears their
  // values for children. Recording an inherited DEBUG flag is not a failure.
  assert.ok(Array.isArray(report.diagnosticFlags) && report.diagnosticFlags.every((flag: unknown) => typeof flag === 'string'));
  assert.deepEqual(report.selectedFiles, expected);
  assert.deepEqual(report.results.map((result: { file: string }) => result.file).sort(), expected);
  assert.equal(report.cleanupPath, relative(root, join(workspace, 'cleanup.json')));
  assert.equal(prepared.canonicalRoot, root); assert.equal(prepared.buildExitCode, 0);
  assert.equal(prepared.runtimeExecutable, report.runtime.executable);
  assert.match(report.runtime.version, /^v22\./);
  assert.equal(prepared.inputFingerprint, inputFingerprint(root), 'source must match the complete regression');
  assert.equal(prepared.outputFingerprint, fingerprint(root, ['out', 'packages/project-memory/dist']));
  assert.deepEqual(prepared.requiredArtifacts, REQUIRED_ARTIFACTS);
  for (const path of REQUIRED_ARTIFACTS) assert.ok(existsSync(join(root, path)));
  const totals = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0 };
  for (const result of report.results) {
    assert.equal(result.code, 0, result.file); assert.equal(result.signal, null, result.file);
    for (const flag of ['timedOut', 'interrupted', 'unconfirmed', 'coverageIncomplete']) assert.ok(!result[flag], `${result.file}: ${flag}`);
    assert.equal(result.coverage.status, 'reported', result.file);
    assert.match(result.log, new RegExp(`^\\.insrc/tmp/test-harness/runs/${pointer.runId}/[^/]+\\.log$`));
    const text = readFileSync(join(root, result.log), 'utf8');
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      const value = result.coverage.counts[key]; assert.ok(Number.isSafeInteger(value) && value >= 0, `${result.file}: ${key}`);
      assert.equal(value, Number([...text.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))].at(-1)?.[1]));
      totals[key] += value;
    }
    assert.ok(result.coverage.counts.tests > 0); assert.equal(result.coverage.counts.pass, result.coverage.counts.tests);
  }
  assert.equal(totals.fail + totals.cancelled + totals.skipped + totals.todo, 0);
  assert.equal(cleanup.confirmedClosed, true); assert.equal(cleanup.interrupted, false);
  assert.equal(cleanup.closureMode, 'owned-groups');
  assert.deepEqual(cleanup.cancellationErrors, []); assert.deepEqual(cleanup.evidenceErrors, []);
  if (existsSync(join(workspace, 'actors'))) assert.deepEqual(readdirSync(join(workspace, 'actors')), []);
  const journal = (name: string): Array<{ runId: string; childId: string }> => readFileSync(join(workspace, name), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const admitted = journal('child-admissions.jsonl'), closed = journal('child-results.jsonl'), disposed = journal('child-disposals.jsonl');
  assert.ok(admitted.length > expected.length);
  for (const entry of [...admitted, ...closed, ...disposed]) assert.equal(entry.runId, pointer.runId);
  assert.equal(new Set(admitted.map(entry => entry.childId)).size, admitted.length);
  assert.equal(new Set(closed.map(entry => entry.childId)).size, closed.length);
  assert.equal(new Set(disposed.map(entry => entry.childId)).size, disposed.length);
  assert.deepEqual(closed.map(entry => entry.childId).sort(), admitted.map(entry => entry.childId).sort());
  assert.deepEqual(disposed.map(entry => entry.childId).sort(), admitted.map(entry => entry.childId).sort());
  for (const entry of disposed) assert.ok('state' in entry && ['closed', 'not-started'].includes(String(entry.state)));
  const active = join(root, '.insrc/tmp/test-harness/active/run.json');
  if (existsSync(active)) assert.notEqual(JSON.parse(readFileSync(active, 'utf8')).runId, pointer.runId);
  process.stdout.write(`# completed regression ${pointer.runId}: ${expected.length} files; ${JSON.stringify(totals)}\n`);
});
