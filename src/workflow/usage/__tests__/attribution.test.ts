/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { DefaultUsageAttributionPolicy, validateAttribution } from '../attribution.js';
import { binding } from './fixtures/domain-fixtures.js';
import type { UsageAttributionInput } from '../types.js';

const hash = '0123456789abcdef';
const cases: [string, string][] = [
  ['definition-author', `DEF-${hash}`], ['definition-review', `DEF-${hash}`],
  ['epic-design', `HLD-${hash}`], ['epic-design-review', `HLD-${hash}`],
  ['story-design', `LLD-${hash}-s1`], ['story-revision', `LLD-${hash}-s1`], ['design-review', `LLD-${hash}-s1`],
  ['plan-author', `PLAN-${hash}-s1`], ['plan-refine', `PLAN-${hash}-s1`],
  ['task-implement', `TASK-${hash}-s1-t1`], ['task-repair', `TASK-${hash}-s1-t1`], ['task-probe', `TASK-${hash}-s1-t1`], ['task-validate', `TASK-${hash}-s1-t1`],
  ['shared-validate', `BUILD-${hash}-s1`], ['code-review', `BUILD-${hash}-s1`],
  ['issue-framing', `ISSUE-${hash}`], ['spec-framing', `SPEC-${hash}`],
];
function input(activity: string, chargedArtifactId: string): UsageAttributionInput {
  return { activity, chargedArtifactId, subjectArtifactId: chargedArtifactId,
    ...(['definition-review', 'epic-design-review', 'design-review'].includes(activity) ? { reviewedArtifactId: chargedArtifactId } : {}),
    ...(activity.startsWith('task-') ? { taskId: chargedArtifactId } : {}),
    ...(['shared-validate', 'code-review'].includes(activity) ? { storyBuildId: chargedArtifactId } : {}),
  };
}

test('mandatory activity table charges each exact authored or reviewed subject', () => {
  const policy = new DefaultUsageAttributionPolicy();
  for (const [activity, charge] of cases) {
    const valid = input(activity, charge);
    assert.deepEqual(policy.validate(valid), [], activity);
    assert.ok(policy.validate({ ...valid, subjectArtifactId: charge.replace(hash, 'fedcba9876543210') }).length, `${activity}: wrong hash`);
    assert.ok(validateAttribution({ ...valid, chargedArtifactId: `CR-${hash}-s1` }).length, `${activity}: reference cannot receive charge`);
    assert.ok(validateAttribution({ ...valid, chargedArtifactId: `TASKS-${hash}-s1` }).length, `${activity}: summary cannot receive charge`);
  }
  assert.deepEqual(validateAttribution(input('issue-framing', 'ISSUE-01234567')), [], 'existing canonical run-hash syntax remains valid');
});

test('attribution refuses missing or conflicting review, task and BUILD evidence', () => {
  const review = input('design-review', `LLD-${hash}-s1`);
  assert.ok(validateAttribution({ ...review, reviewedArtifactId: undefined }).length);
  assert.ok(validateAttribution({ ...review, reviewedArtifactId: `LLD-${hash}-s2` }).length);
  const task = input('task-validate', `TASK-${hash}-s1-t1`);
  for (const evidence of [undefined, 't1', `TASK-${hash}-s2-t1`, `TASK-${hash}-s1-t2`, 'TASK-fedcba9876543210-s1-t1', `PLAN-${hash}-s1`]) assert.ok(validateAttribution({ ...task, taskId: evidence }).length);
  const build = input('code-review', `BUILD-${hash}-s1`);
  for (const evidence of [undefined, `BUILD-${hash}-s2`, `CR-${hash}-s1`, 'BUILD-fedcba9876543210-s1']) assert.ok(validateAttribution({ ...build, storyBuildId: evidence }).length);
  for (const activity of ['build-summary', 'code-review-summary', 'background-index', 'TASK-VALIDATE', 'unknown']) assert.ok(validateAttribution({ ...task, activity }).length);
  assert.ok(validateAttribution({ ...task, extra: true }).length);
  assert.ok(validateAttribution({ ...task, chargedArtifactId: `TASK-${hash}-S1-t1` }).length);
});

test('workflow context inherits explicit parent binding and never falls back to a root or summary', () => {
  for (const [, charge] of cases) {
    const value: UsageAttributionInput = { activity: 'workflow-context', chargedArtifactId: charge, subjectArtifactId: charge, parentBinding: { ...binding, artifactId: charge } };
    assert.deepEqual(validateAttribution(value), [], charge);
    assert.ok(validateAttribution({ ...value, parentBinding: undefined }).length);
    assert.ok(validateAttribution({ ...value, parentBinding: { ...value.parentBinding!, artifactId: `LLD-${hash}-s2` } }).length);
    assert.ok(validateAttribution({ ...value, parentBinding: { ...value.parentBinding!, rootArtifactId: `HLD-${hash}` } }).length);
    assert.ok(validateAttribution({ ...value, parentBinding: { ...value.parentBinding!, rootArtifactId: 'EPIC-fedcba9876543210' } }).length);
    assert.ok(validateAttribution({ ...value, parentBinding: { ...value.parentBinding!, workflowRunId: '' } }).length);
  }
  for (const charge of [`CR-${hash}-s1`, `TASKS-${hash}-s1`, `STORY-${hash}-s1`, `EPIC-${hash}`]) assert.ok(validateAttribution({ activity: 'workflow-context', chargedArtifactId: charge, subjectArtifactId: charge, parentBinding: { ...binding, artifactId: charge } }).length);
  let calls = 0;
  const bad = Object.defineProperty({}, 'activity', { enumerable: true, get() { calls++; return 'task-validate'; } });
  assert.ok(validateAttribution(bad).length);
  assert.equal(calls, 0);
  assert.equal(binding.rootArtifactId, `EPIC-${hash}`, 'supplied binding is not mutated');
});
