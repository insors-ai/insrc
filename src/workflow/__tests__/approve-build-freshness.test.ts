import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { reviewBuildGap, reviewedBuildFingerprint } from '../code-review/build-freshness.js';
import { enforceCodeReviewGate } from '../code-review/gate.js';
import { createCompletionEvidence } from '../artifact-core/completion-evidence.js';
import { approveJson, approveTarget } from './helpers/approve.js';

const H = '3bc755af91d494a8';
const BEFORE = '2026-10-01T00:00:00.000Z';
const AFTER = '2026-10-02T00:00:00.000Z';
const build = () => ({ meta: { workflow: 'build', epicHash: H, storyId: 's1', authoredBy: 'controller', createdAt: BEFORE, updatedAt: BEFORE }, body: { commit: 'commit-a', changeLog: [{ target: { file: 'src/a.ts' }, timestamp: BEFORE }] } });
const review = (at = BEFORE) => ({ meta: { workflow: 'code-review', createdAt: at, reviewedBy: 'daemon' }, body: { verdict: 'pass', subject: { changedFiles: ['src/a.ts'] }, counts: { high: 0, med: 0, low: 0 } } });

test('legacy review is refused until a fresh bound review covers the latest build', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-freshness-'));
	try {
		const dir = join(repo, '.insrc/artifacts'); mkdirSync(dir, { recursive: true });
		const path = join(dir, `BUILD-${H}-s1.json`), crPath = join(dir, `CR-${H}-s1.json`);
		const b = build(); b.meta.updatedAt = AFTER;
		writeFileSync(path, JSON.stringify(b)); writeFileSync(crPath, JSON.stringify(review()));
		assert.equal(enforceCodeReviewGate(repo, H, 's1', { enforce: false }).status, 'blocked');
		assert.deepEqual(await createCompletionEvidence(repo, { enforce: false }).storyCodeReview(H, 's1'), { kind: 'blocked' });
		await assert.rejects(approveJson(path), /no BUILD binding/);
		assert.equal(JSON.parse(readFileSync(path, 'utf8')).meta.lifecycle?.approval, undefined);
		writeFileSync(crPath, JSON.stringify({ ...review(AFTER), body: { ...review(AFTER).body, subject: { changedFiles: ['src/a.ts'], buildFingerprint: reviewedBuildFingerprint(b) } } }));
		assert.equal(enforceCodeReviewGate(repo, H, 's1', { enforce: false }).status, 'pass');
		assert.deepEqual(await createCompletionEvidence(repo, { enforce: false }).storyCodeReview(H, 's1'), { kind: 'clean' });
		await approveJson(path);
		assert.equal(JSON.parse(readFileSync(path, 'utf8')).meta.lifecycle.status, 'approved');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a stale review can be explicitly overridden in both completion gates', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-build-override-'));
	try {
		const dir = join(repo, '.insrc/artifacts'); mkdirSync(dir, { recursive: true });
		const b = build(); b.meta.updatedAt = AFTER;
		const path = join(dir, `BUILD-${H}-s1.json`);
		writeFileSync(path, JSON.stringify(b)); writeFileSync(join(dir, `CR-${H}-s1.json`), JSON.stringify(review()));
		const overrideReview = 'User accepts the unreviewed rebuild';
		assert.equal(enforceCodeReviewGate(repo, H, 's1', { enforce: false, overrideReview }).status, 'overridden');
		assert.deepEqual(await createCompletionEvidence(repo, { overrideReview }).storyCodeReview(H, 's1'), { kind: 'overridden', overrideReason: overrideReview });
		await approveJson(path, overrideReview);
		assert.equal(JSON.parse(readFileSync(path, 'utf8')).meta.lifecycle.approval.override.reason, overrideReview);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('review coverage must include every BUILD path, with absolute and relative paths equivalent', () => {
	const b = build(), r = { ...review(AFTER), body: { ...review(AFTER).body, subject: { changedFiles: ['src/a.ts'], buildFingerprint: reviewedBuildFingerprint(b) } } };
	r.body.subject.changedFiles = [];
	assert.match(reviewBuildGap(b, r, '/repo')!, /does not cover BUILD file/);
	r.body.subject.changedFiles = ['/repo/src/a.ts'];
	assert.equal(reviewBuildGap(b, r, '/repo'), undefined);
});

test('a bound review detects changed commits and tasks even at the same timestamp, but survives approval bookkeeping', () => {
	const b = build();
	const r = { ...review(), body: { ...review().body, subject: { changedFiles: ['src/a.ts'], buildFingerprint: reviewedBuildFingerprint(b) } } };
	b.body.changeLog[0]!.timestamp = AFTER;
	assert.equal(reviewBuildGap(b, r, '/repo'), undefined, 'timestamp-only regeneration does not change the reviewed build');
	b.meta.updatedAt = AFTER;
	assert.match(reviewBuildGap(b, r, '/repo')!, /BUILD content has changed/, 'a new validation of unchanged paths and commit still needs review');
	b.meta.updatedAt = BEFORE;
	b.body.commit = 'commit-b';
	assert.match(reviewBuildGap(b, r, '/repo')!, /BUILD content has changed/);
	const tasksChanged = { ...build(), body: { ...build().body, tasks: [{ id: 't1', passed: true }] } };
	assert.match(reviewBuildGap(tasksChanged, r, '/repo')!, /BUILD content has changed/);
});

test('a dated BUILD rejects missing or invalid review timestamps instead of assuming freshness', () => {
	assert.match(reviewBuildGap(build(), { meta: {}, body: review().body }, '/repo')!, /freshness cannot be verified/);
	assert.match(reviewBuildGap(build(), review('not-a-date'), '/repo')!, /freshness cannot be verified/);
});


test('an existing structurally invalid BUILD cannot satisfy completion with a passing review', () => {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-invalid-build-'));
 try {
  const dir = join(repo, '.insrc/artifacts'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `CR-${H}-s1.json`), JSON.stringify(review()));
  for (const invalid of [null, [], false, 'build', {}, { meta: {}, body: null }, { meta: [], body: {} }]) {
   writeFileSync(join(dir, `BUILD-${H}-s1.json`), JSON.stringify(invalid));
   assert.match(reviewBuildGap(invalid, review(), repo)!, /BUILD structure cannot be verified/);
   assert.equal(enforceCodeReviewGate(repo, H, 's1', { enforce: false }).status, 'blocked');
  }
 } finally { rmSync(repo, { recursive: true, force: true }); }
});


test('a legacy review cannot establish freshness for an undated BUILD', () => {
 const b = { meta: {}, body: build().body };
 assert.match(reviewBuildGap(b, review(), '/repo')!, /no BUILD binding/);
 const bound = { ...review(), body: { ...review().body, subject: { changedFiles: ['src/a.ts'], buildFingerprint: reviewedBuildFingerprint(b) } } };
 assert.equal(reviewBuildGap(b, bound, '/repo'), undefined);
});


test('completion refuses a malformed review even when an empty BUILD has no file coverage to check', async () => {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-invalid-review-'));
 try {
  const dir = join(repo, '.insrc/artifacts'); mkdirSync(dir, { recursive: true });
  const b = build(); b.body.changeLog = [];
  const path = join(dir, `BUILD-${H}-s1.json`);
  writeFileSync(path, JSON.stringify(b));
  for (const malformed of [{ meta: { createdAt: AFTER } }, { ...review(AFTER), body: { verdict: 'unknown', subject: { changedFiles: [] } } }, { ...review(AFTER), body: { verdict: 'pass' } }]) {
   writeFileSync(join(dir, `CR-${H}-s1.json`), JSON.stringify(malformed));
   await assert.rejects(approveJson(path), /code review structure cannot be verified/);
  }
 } finally { rmSync(repo, { recursive: true, force: true }); }
});


test('a stale BUILD review does not prevent approval of a new PLAN', async () => {
 const repo = mkdtempSync(join(tmpdir(), 'insrc-plan-freshness-'));
 try {
  const dir = join(repo, '.insrc/artifacts'); mkdirSync(dir, { recursive: true });
  const b = build(); b.meta.updatedAt = AFTER;
  writeFileSync(join(dir, `BUILD-${H}-s1.json`), JSON.stringify(b));
  writeFileSync(join(dir, `CR-${H}-s1.json`), JSON.stringify(review()));
  const path = join(dir, `PLAN-${H}-s1.json`);
  writeFileSync(path, JSON.stringify({ meta: { ...b.meta, workflow: 'plan' }, body: { tasks: [] } }));
  const result = await approveTarget({ repoPath: repo, artifactPath: path }, { enforce: false });
  assert.equal(result.skipped.length, 0);
  assert.equal(result.approved.length, 1);
 } finally { rmSync(repo, { recursive: true, force: true }); }
});
