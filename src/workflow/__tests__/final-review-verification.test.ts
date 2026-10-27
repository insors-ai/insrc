/** Audit the final verification evidence without rerunning a full sweep at every task validation. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const evidence = 'docs/standalone/split-oversized-diff-evidence-into-lossless-E2026102734798d20/S001/evidence';
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
interface Report {
 snapshotCommit: string; node: string; testFileCount: number; testFiles: string[]; argv: string[];
 sourceBefore: Record<string, string>; sourceDrift: string[]; finishedAt: string; outerTimeout: boolean;
 archivedBuildLog: string; build: { exitCode: number; logSha256: string };
 archivedLog: string; logSha256: string; exitCode: number; releaseReady: boolean; runtimeActivation: string;
 startedAfterAllImplementationTasks: boolean; implementationTasksPassed: number;
 counts: Record<'tests' | 'pass' | 'fail' | 'cancelled' | 'skipped' | 'todo', number>;
 failureTitles: string[];
 remainingIssues?: { title: string; classification: 'known-baseline-failure' | 'unresolved-timeout' | 'external-service-failure'; evidence: string }[];
}
function read(kind: 'regression' | 'full-sweep'): Report {
 return JSON.parse(readFileSync(join(root, evidence, `task22-final-${kind}.json`), 'utf8')) as Report;
}
function check(report: Report): void {
 assert.match(report.snapshotCommit, /^[a-f0-9]{40}$/); assert.match(report.node, /^v22\./);
 assert.equal(report.startedAfterAllImplementationTasks, true); assert.equal(report.implementationTasksPassed, 21);
 assert.equal(report.outerTimeout, false); assert.ok(Date.parse(report.finishedAt)); assert.deepEqual(report.sourceDrift, []);
 assert.equal(report.releaseReady, false); assert.equal(report.runtimeActivation, 'not performed');
 assert.equal(report.build.exitCode, 0); assert.ok(report.archivedBuildLog.startsWith(evidence + '/'));
 assert.equal(digest(readFileSync(join(root, report.archivedBuildLog))), report.build.logSha256);
 assert.equal(report.testFiles.length, report.testFileCount); assert.equal(new Set(report.testFiles).size, report.testFileCount);
 assert.deepEqual(report.argv.filter(arg => arg.endsWith('.test.ts')), report.testFiles);
 assert.ok(report.archivedLog.startsWith(evidence + '/')); assert.equal(report.archivedLog.includes('..'), false);
 const bytes = readFileSync(join(root, report.archivedLog)); assert.equal(digest(bytes), report.logSha256, 'complete unmodified TAP log');
 const log = bytes.toString('utf8');
 for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'] as const) {
  const matches = [...log.matchAll(new RegExp('^# ' + key + ' (\\d+)\\s*$', 'gm'))]; assert.ok(matches.length > 0, key);
  assert.equal(Number(matches.at(-1)![1]), report.counts[key], key); assert.ok(Number.isSafeInteger(report.counts[key]) && report.counts[key] >= 0);
 }
 assert.equal(report.counts.tests, report.counts.pass + report.counts.fail + report.counts.cancelled + report.counts.skipped + report.counts.todo);
 assert.deepEqual([...log.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(match => match[1]), report.failureTitles);
 assert.equal(report.exitCode, report.counts.fail + report.counts.cancelled > 0 ? 1 : 0);
}

test('DIFF-FINAL-REGRESSION: archived combined affected-area run preserves complete log, exact outcomes and zero introduced failures', () => {
 const report = read('regression'); check(report);
 assert.equal(report.counts.fail, 0); assert.equal(report.counts.cancelled, 0); assert.ok(report.testFileCount >= 99);
 for (const required of ['src/mcp/__tests__/controller-review.test.ts', 'src/workflow/__tests__/build-review-freshness.test.ts', 'src/daemon/db/__tests__/session-release-gate.test.ts', 'src/daemon/__tests__/client-family.test.ts', 'src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts']) assert.ok(report.testFiles.includes(required), required);
});

test('DIFF-FULL-SWEEP: archived complete sweep binds every source byte and test file to its Git snapshot and retains failures/skips/pending evidence honestly', () => {
 const report = read('full-sweep'); check(report); assert.equal(report.snapshotCommit, read('regression').snapshotCommit);
 const names = execFileSync('git', ['ls-tree', '-r', '--name-only', report.snapshotCommit, '--', 'src'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
 assert.deepEqual([...report.testFiles].sort(), names.filter(path => path.includes('/__tests__/') && path.endsWith('.test.ts')).sort());
 assert.deepEqual(Object.keys(report.sourceBefore).sort(), [...names].sort(), 'source manifest has no missing or foreign paths');
 // One Git batch verifies all bytes, including assets/tests, without thousands of subprocesses.
 const objects = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: names.map(path => report.snapshotCommit + ':' + path + '\n').join(''), maxBuffer: 128 * 1024 * 1024 });
 let offset = 0;
 for (const path of names) {
  const end = objects.indexOf(10, offset); assert.ok(end >= offset);
  const header = objects.subarray(offset, end).toString('utf8').match(/^[a-f0-9]+ blob (\d+)$/); assert.ok(header, path);
  const size = Number(header[1]); offset = end + 1; assert.equal(digest(objects.subarray(offset, offset + size)), report.sourceBefore[path], path); offset += size + 1;
 }
 assert.equal(offset, objects.length);
 const issues = report.remainingIssues ?? []; assert.deepEqual(issues.map(issue => issue.title), report.failureTitles);
 const raw = readFileSync(join(root, report.archivedLog), 'utf8');
 const baseline = JSON.parse(readFileSync(join(root, 'docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S003/evidence/task34-final-source-sweep.json'), 'utf8')) as { failureTitles: string[] };
 for (const issue of issues) {
  assert.ok(issue.evidence.length > 40);
  if (issue.classification === 'known-baseline-failure') assert.ok(baseline.failureTitles.includes(issue.title), 'baseline exception needs recorded prior failure');
  else if (issue.classification === 'external-service-failure') {
   assert.match(issue.title, /^CM-S2-A4: Oracle actual service/);
   const at = raw.indexOf(' - ' + issue.title + '\n'); assert.ok(at >= 0);
   assert.match(raw.slice(at, at + 2500), /docker stop.*[a-f0-9]{64}/, 'service exception retains its actual cleanup diagnostic');
  } else {
   assert.equal(issue.classification, 'unresolved-timeout');
   assert.match(issue.title, /^src\/.*\.test\.ts$/);
   const at = raw.indexOf(' - ' + issue.title + '\n'); assert.ok(at >= 0);
   assert.match(raw.slice(at, at + 2500), /timeout|timed out|cancelled/i, 'timeout exception needs the actual TAP diagnostic');
  }
 }
 const gate = JSON.parse(readFileSync(join(root, 'src/assets/connection-management-gates.json'), 'utf8'));
 assert.equal(gate.ready, false); assert.deepEqual(gate.scopes, []);
});
