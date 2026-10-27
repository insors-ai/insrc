import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { approveArtifactByJsonPath, approveWorkflowTarget, checkBuildReviewFreshness, ReviewBlockedError } from '../gates.js';
import { readReviewInputSnapshot, readStoredReviewFreshness } from '../code-review/input-fingerprint.js';
import { enforceCodeReviewGate } from '../code-review/gate.js';
import { persistBuildRecord } from '../runners/build/standalone-record.js';
import type { BuildRecord } from '../runners/build/standalone-record.js';
import { approve as approveTui } from '../../cli/services/workflow.js';

const epicHash = 'e1a2b3c4d5e6f708', at = '2026-10-27T00:00:00Z';
function fixture(stories = ['S001']) {
 const repo = mkdtempSync(join(tmpdir(), 'build-freshness-'));
 const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
 git('init', '-q'); git('config', 'user.name', 'Approval Test'); git('config', 'user.email', 'test@example.invalid');
 mkdirSync(join(repo, 'src')); writeFileSync(join(repo, 'src/a.ts'), 'export const a = 1;\n'); git('add', 'src'); git('commit', '-qm', 'base'); const base = git('rev-parse', 'HEAD');
 const path = (kind: string, storyId = stories[0]!) => join(repo, `.insrc/artifacts/${kind}-${epicHash}-${storyId}.json`);
 mkdirSync(join(repo, '.insrc/build-start'), { recursive: true }); mkdirSync(join(repo, '.insrc/artifacts'), { recursive: true });
 const records = new Map<string, BuildRecord>();
 for (const [i, storyId] of stories.entries()) {
  const file = `src/${storyId}.ts`; writeFileSync(join(repo, file), `export const value = ${i};\n`); git('add', file); git('commit', '-qm', `story ${storyId}`, '-m', `Insrc-Story: ${epicHash}/${storyId}`); const commit = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, `.insrc/build-start/${epicHash}-${storyId}.json`), JSON.stringify({ epicHash, storyId, rangeBase: base, stampedAt: at }));
  writeFileSync(path('TESTS', storyId), JSON.stringify({ meta: { workflow: 'tests', epicHash, storyId, createdAt: at, updatedAt: at, standalone: true }, body: { tasks: [{ taskId: 't1', ranAt: at, tests: [], files: [] }] } }));
  const record: BuildRecord = { meta: { workflow: 'build', epicHash, storyId, createdAt: at, updatedAt: at, authoredBy: 'controller', standalone: true }, body: { commit, summary: 'built', tasks: [{ id: 't1', passed: true }], changeLog: [{ target: { file, version: commit }, author: 'original', timestamp: at }] } };
  persistBuildRecord(repo, record); records.set(storyId, record);
 }
 const review = (storyId = stories[0]!) => {
  const fingerprint = readReviewInputSnapshot(repo, epicHash, storyId).fingerprint;
  const cr = { meta: { workflow: 'code-review', schemaVersion: 1, runId: 'cr-fixture', repoPath: fingerprint.repoPath, epicHash, storyId, createdAt: at, elapsedMs: 1, repoIndexedAt: null, reviewedBy: 'daemon', reviewInputSchemaVersion: 1, reviewInputFingerprint: fingerprint }, body: { kind: 'code-review', epicHash, storyId, groundingMode: 'full', subject: { changedFiles: [`src/${storyId}.ts`] }, dimensions: ['adherence', 'conventions', 'coverage', 'quality'].map(dimension => ({ dimension, findings: [] })), verdict: 'pass', counts: { high: 0, med: 0, low: 0 } } };
  writeFileSync(path('CR', storyId), JSON.stringify(cr, null, 2) + '\n'); return cr;
 };
 for (const story of stories) review(story);
 const read = (kind: string, storyId = stories[0]!) => JSON.parse(readFileSync(path(kind, storyId), 'utf8'));
 const change = (kind: 'tests' | 'source' | 'build', storyId = stories[0]!) => {
  if (kind === 'source') writeFileSync(join(repo, `src/${storyId}.ts`), 'source changed while awaiting approval\n');
  else { const value = read(kind === 'tests' ? 'TESTS' : 'BUILD', storyId); if (kind === 'tests') value.body.tasks[0].ranAt = 'new verdict-bearing time'; else value.body.summary = 'changed semantic BUILD evidence'; writeFileSync(path(kind === 'tests' ? 'TESTS' : 'BUILD', storyId), JSON.stringify(value, null, 2) + '\n'); }
 };
 return { repo, git, path, review, read, change, records, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}
const stale = (err: unknown): boolean => err instanceof ReviewBlockedError && err.summary === 'stale-review' && err.freshness?.status === 'stale-review';

test('DIFF-APPROVE-COMMON: direct approval and reapproval preserve reviewed identity while stale source/BUILD/TESTS cannot be overridden', () => {
 const f = fixture();
 try {
  const initial = readReviewInputSnapshot(f.repo, epicHash, 'S001').fingerprint;
  approveArtifactByJsonPath(f.path('BUILD')); approveArtifactByJsonPath(f.path('BUILD'), { overrideReview: 'explicit review findings acceptance' });
  assert.equal(checkBuildReviewFreshness(f.path('BUILD'), f.read('BUILD').meta).status, 'fresh'); assert.equal(readReviewInputSnapshot(f.repo, epicHash, 'S001').fingerprint.digest, initial.digest);
  for (const kind of ['tests', 'source', 'build'] as const) {
   const g = fixture();
   try { g.change(kind); const before = readFileSync(g.path('BUILD'), 'utf8'); assert.throws(() => approveArtifactByJsonPath(g.path('BUILD'), { overrideReview: 'cannot accept a different snapshot' }), stale); assert.equal(readFileSync(g.path('BUILD'), 'utf8'), before); }
   finally { g.cleanup(); }
  }
 } finally { f.cleanup(); }
});

test('DIFF-PUBLISH-GATE: stale review is a distinct non-overridable outcome with reason and no fabricated findings/counts', () => {
 const f = fixture();
 try {
  f.change('source');
  for (const enforce of [true, false]) {
   const gate = enforceCodeReviewGate(f.repo, epicHash, 'S001', { enforce, overrideReview: 'ignored for stale identity' });
   assert.ok(gate.status === 'stale-review' && gate.reason === 'mismatch'); assert.equal('counts' in gate || 'verdict' in gate, false);
  }
 } finally { f.cleanup(); }
});

test('DIFF-APPROVE-WORKFLOW: single and batch approval project stale identity and leave fresh siblings approvable with no completion side effects', async () => {
 const f = fixture(['S001', 'S002']);
 try {
  f.change('tests', 'S001');
  const single = await approveWorkflowTarget({ repoPath: f.repo, artifactPath: f.path('BUILD', 'S001'), overrideReview: 'cannot bypass' }, { enforce: false });
  assert.equal(single.approved.length, 0); assert.equal(single.skipped.length, 1); assert.equal(single.codeReview[0]!.status, 'stale-review'); assert.equal('counts' in single.codeReview[0]!, false);
  const batch = await approveWorkflowTarget({ repoPath: f.repo, epicHash, overrideReview: 'cannot bypass' }, { enforce: false });
  assert.equal(batch.approved.length, 1, JSON.stringify(batch)); assert.equal(batch.skipped.length, 1); assert.equal(f.read('BUILD', 'S001').meta.approvedAt, undefined); assert.ok(f.read('BUILD', 'S002').meta.approvedAt); assert.equal('followOn' in batch, false);
 } finally { f.cleanup(); }
});

test('DIFF-APPROVE-TUI: the actual TUI service rejects stale identity before tracker/commit work even with override', () => {
 const f = fixture();
 try {
  const head = f.git('rev-parse', 'HEAD'); f.change('tests'); const before = readFileSync(f.path('BUILD'), 'utf8');
  assert.throws(() => approveTui(f.path('BUILD'), true, 'cannot bypass'), stale);
  assert.equal(f.git('rev-parse', 'HEAD'), head); assert.equal(readFileSync(f.path('BUILD'), 'utf8'), before); assert.equal(f.read('BUILD').meta.reviewOverride, undefined);
 } finally { f.cleanup(); }
});

test('DIFF-APPROVE-IDENTITY: invalid/partial/unsupported/unreadable identities fail closed while genuinely unrecorded fingerprint fields remain explicitly legacy', () => {
 const changes: ((cr: ReturnType<ReturnType<typeof fixture>['review']>) => unknown)[] = [cr => { delete (cr.meta as Partial<typeof cr.meta>).reviewInputFingerprint; }, cr => { delete (cr.meta as Partial<typeof cr.meta>).reviewInputSchemaVersion; }, cr => { cr.meta.reviewInputSchemaVersion = 99; }, cr => { cr.meta.reviewInputFingerprint.digest = '0'.repeat(64); }, cr => { cr.meta.reviewedBy = 'controller'; }, cr => { cr.meta.storyId = 'S002'; }];
 for (const mutate of changes) {
  const f = fixture(); try { const cr = f.read('CR'); mutate(cr); writeFileSync(f.path('CR'), JSON.stringify(cr)); assert.throws(() => approveArtifactByJsonPath(f.path('BUILD'), { overrideReview: 'ignored' }), stale); assert.equal(f.read('BUILD').meta.approvedAt, undefined); } finally { f.cleanup(); }
 }
 const f = fixture();
 try {
  writeFileSync(f.path('CR'), '{ invalid JSON'); assert.throws(() => approveArtifactByJsonPath(f.path('BUILD'), { overrideReview: 'ignored' }), stale);
  rmSync(f.path('CR')); mkdirSync(f.path('CR')); assert.equal(readStoredReviewFreshness(f.repo, epicHash, 'S001').status, 'stale-review'); assert.throws(() => approveArtifactByJsonPath(f.path('BUILD')), stale); rmSync(f.path('CR'), { recursive: true });
  const legacy = f.review(); delete (legacy.meta as Partial<typeof legacy.meta>).reviewInputFingerprint; delete (legacy.meta as Partial<typeof legacy.meta>).reviewInputSchemaVersion; writeFileSync(f.path('CR'), JSON.stringify(legacy));
  assert.deepEqual(readStoredReviewFreshness(f.repo, epicHash, 'S001'), { status: 'legacy' }); approveArtifactByJsonPath(f.path('BUILD'));
 } finally { f.cleanup(); }
});

test('DIFF-APPROVE-IDENTITY: canonical BUILD path, metadata, repository and independent author must agree; file aliases cannot bypass checks', () => {
 for (const field of ['epicHash', 'storyId', 'repoPath', 'authoredBy']) {
  const f = fixture();
  try { const b = f.read('BUILD'); b.meta[field] = field === 'authoredBy' ? 'daemon' : field === 'repoPath' ? '/different-repository' : 'different-target'; writeFileSync(f.path('BUILD'), JSON.stringify(b)); const alias = join(f.repo, 'alias.json'); symlinkSync(f.path('BUILD'), alias); assert.throws(() => approveArtifactByJsonPath(alias, { overrideReview: 'ignored' }), stale); assert.equal(lstatSync(alias).isSymbolicLink(), true); assert.equal(f.read('BUILD').meta.approvedAt, undefined); }
  finally { f.cleanup(); }
 }
 const f = fixture(); try { const alias = join(f.repo, 'alias.json'); symlinkSync(f.path('BUILD'), alias); const out = approveArtifactByJsonPath(alias); assert.equal(out.path, realpathSync(f.path('BUILD'))); assert.ok(f.read('BUILD').meta.approvedAt); assert.ok(lstatSync(alias).isSymbolicLink()); } finally { f.cleanup(); }
});

test('DIFF-APPROVE-RACE: prewrite changes stamp nothing; postwrite TESTS/source changes roll back only this approval metadata and preserve foreign BUILD edits', () => {
 for (const phase of ['before', 'after'] as const) for (const kind of ['tests', 'source'] as const) {
  const f = fixture();
  try {
   const initial = f.read('BUILD'); initial.meta.rejectedAt = 'previous rejection'; initial.meta.rejectReason = 'old reason'; writeFileSync(f.path('BUILD'), JSON.stringify(initial, null, 2) + '\n'); f.review();
   const mutate = () => { f.change(kind); if (phase === 'after') { const latest = f.read('BUILD'); latest.body.summary = 'FOREIGN BODY MUST SURVIVE'; latest.meta.foreignAudit = 'preserve foreign metadata'; writeFileSync(f.path('BUILD'), JSON.stringify(latest)); } };
   assert.throws(() => approveArtifactByJsonPath(f.path('BUILD'), { overrideReview: 'ignored' }, phase === 'before' ? { beforeWrite: mutate } : { afterWrite: mutate }), stale);
   const restored = f.read('BUILD'); assert.equal(restored.meta.approvedAt, undefined); assert.equal(restored.meta.rejectedAt, 'previous rejection'); assert.equal(restored.meta.rejectReason, 'old reason');
   if (phase === 'after') { assert.equal(restored.body.summary, 'FOREIGN BODY MUST SURVIVE'); assert.equal(restored.meta.foreignAudit, 'preserve foreign metadata'); }
  } finally { f.cleanup(); }
 }
});

test('DIFF-APPROVE-RACE: framework BUILD writers share synchronous ownership and cannot overwrite a concurrent approval transaction', () => {
 const f = fixture(); let blocked = false;
 try {
  approveArtifactByJsonPath(f.path('BUILD'), undefined, { beforeWrite: () => { try { const original = f.records.get('S001')!; persistBuildRecord(f.repo, { ...original, body: { ...original.body, summary: 'must not overwrite active approval' } }); } catch (err) { blocked = (err as { code?: string }).code === 'approval-writer-busy'; } } });
  assert.equal(blocked, true); assert.equal(f.read('BUILD').body.summary, 'built'); assert.ok(f.read('BUILD').meta.approvedAt);
 } finally { f.cleanup(); }
});

test('DIFF-APPROVE-TESTS: TESTS appearance, disappearance, malformed replacement, result ordering and ranAt-only changes invalidate approval independently of BUILD/source', () => {
 for (const mutation of ['absent', 'malformed', 'ranAt', 'order', 'appeared'] as const) {
  const f = fixture();
  try {
   if (mutation === 'appeared') { rmSync(f.path('TESTS')); f.review(); }
   if (mutation === 'order') { const tests = f.read('TESTS'); tests.body.tasks.push({ ...tests.body.tasks[0], taskId: 't2' }); writeFileSync(f.path('TESTS'), JSON.stringify(tests)); f.review(); }
   const before = readFileSync(f.path('BUILD'), 'utf8'), head = f.git('rev-parse', 'HEAD');
   if (mutation === 'absent') rmSync(f.path('TESTS'));
   else if (mutation === 'malformed') writeFileSync(f.path('TESTS'), '{ malformed');
   else { const tests = mutation === 'appeared' ? { meta: { workflow: 'tests', epicHash, storyId: 'S001', createdAt: at, updatedAt: at }, body: { tasks: [] as unknown[] } } : f.read('TESTS'); if (mutation === 'order') tests.body.tasks.reverse(); else if (mutation === 'ranAt') tests.body.tasks[0].ranAt = 'new ranAt only'; writeFileSync(f.path('TESTS'), JSON.stringify(tests)); }
   assert.throws(() => approveArtifactByJsonPath(f.path('BUILD'), { overrideReview: 'ignored' }), stale); assert.equal(readFileSync(f.path('BUILD'), 'utf8'), before); assert.equal(f.git('rev-parse', 'HEAD'), head);
  } finally { f.cleanup(); }
 }
});
