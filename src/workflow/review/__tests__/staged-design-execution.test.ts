import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { designFixture } from '../design-review/__tests__/fixtures.js';
import { assertDesignSubjectUnchanged } from '../design-review/subject.js';
import { designPlanningPrompt, designChunkPrompt, designImpactPrompt } from '../design-review/policy.js';
import { PreparedViewReader, PreparedViewWriter } from '../prepared-views.js';
import { ReviewMemoryBudget } from '../preparation-memory.js';
import { ReviewPreparationCapacity } from '../source-session.js';
import { reviewPreparationLimits } from '../../../config/review.js';
import { preparationDigest } from '../prepared-context.js';
import { StagedTaskExecution } from '../staged-task-execution.js';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import type { DesignReviewSubject, DesignChunk } from '../design-review/contracts.js';

test('bounded design DEF HLD LLD policies preserve latest-path scope across epic standalone and issue routes', async t => {
 const f = designFixture(t), limits = reviewPreparationLimits('/tmp/no-design-window-config'), memory = new ReviewMemoryBudget(limits.memoryMaxBytes), capacity = new ReviewPreparationCapacity(limits.cacheMaxBytes), d = preparationDigest('design-window');
 const writer = await PreparedViewWriter.create({ key: { project: f.repo, family: 'design', reviewId: 'design-window' }, attempt: 1, validatorVersion: 2, inputDigest: d, sourceIdentity: d, routeDigest: d, scopeDigest: d, testDocumentDigest: d }, limits, capacity, memory);
 const subjects: [string, DesignReviewSubject][] = [];
 for (const kind of ['DEF', 'HLD', 'LLD'] as const) for (const route of ['epic', 'standalone', 'issue'] as const) {
  const id = `${kind}-${route}`, subject = { ...f.prepared.subject, kind, workflow: { ...f.prepared.subject.workflow, kind: route } };
  subjects.push([id, subject]); await writer.add(id, 'view', subject);
 }
 const receipt = await writer.seal(), reader = await PreparedViewReader.open(receipt, limits, memory, async () => {}, async () => {}), execution = new StagedTaskExecution(reader);
 const assertCurrent = async () => assertDesignSubjectUnchanged(f.prepared.subject, f.prepared.baseline);
 const chunk: DesignChunk = { id: 'c1', title: 'Requirements', purpose: 'substantive', selectors: [f.md], concerns: ['Functional completeness'], dependsOn: [] };
 try {
  for (const [id, subject] of subjects) {
   for (const phase of ['planning', 'impact', 'chunk'] as const) {
    const unit = phase === 'planning' ? { phase } : phase === 'impact' ? { phase, attempt: 2 } : { phase, chunk };
    const prompt = await execution.designUnit(id, f.path, unit, assertCurrent);
    const oracle = phase === 'planning' ? designPlanningPrompt(subject, f.path) : phase === 'impact' ? designImpactPrompt(subject, f.path, 2) : designChunkPrompt(subject, chunk, f.path);
    assert.equal(prompt.prompt, oracle); assert.ok(prompt.prompt.includes(f.md)); assert.ok(!prompt.prompt.includes('The feature works'));
    prompt.release();
   }
  }
  const prompt = await execution.designUnit('LLD-standalone', f.path, { phase: 'chunk', chunk }, assertCurrent);
  await writeFile(f.md, '# Changed while waiting for dispatch\n');
  const provider = new CliProvider({ kind: 'codex' }); let called = false;
  Reflect.set(provider, 'activityReview', async () => { called = true; });
  await assert.rejects(execution.dispatch(provider, prompt, { type: 'object' }, { mode: 'activity', cwd: f.repo, inactivityMs: 1800000, internalRetry: false, signal: new AbortController().signal, onActivity: () => {}, onCandidate: async () => ({ accepted: true }) }));
  assert.equal(called, false); prompt.release();
 } finally { reader.close(); }
 assert.equal(memory.snapshot().bytes, 0);
});
