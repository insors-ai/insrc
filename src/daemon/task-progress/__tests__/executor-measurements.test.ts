import assert from 'node:assert/strict';
import test from 'node:test';
import { makeTokenAccumulator } from '../../workflow-rpc.js';
import { AnalysisMeasurements, WorkflowMeasurements, validateExecutorDetails } from '../executor-measurements.js';
import { validProgressMeasurement } from '../record.js';

function measurement(details: { kind: 'workflow' | 'analysis' }) {
  return {
    kind: details.kind, measuredAt: 100, meaningfulRevision: 1, lastMeaningfulAt: 100,
    phase: 'execute', activeUnit: null, counts: [], milestones: [], controls: [], details,
  };
}

test('S2 workflow measurements count provider output chunks and preserve legacy token batches', () => {
  const workflow = new WorkflowMeasurements();
  const legacy = makeTokenAccumulator();
  assert.equal(workflow.read(), null);
  workflow.onProgress({ phase: 'unknown', detail: 'private' });
  assert.equal(workflow.read(), null);
  workflow.onProgress({ phase: 'step-start', runner: 'design.compose', detail: 'private' });
  assert.equal(workflow.read()?.activeUnit, 'design.compose');
  assert.equal(workflow.read()?.production, null);

  for (let i = 1; i <= 17; i++) {
    workflow.onOutputChunk();
    const batch = legacy.push('s1', 'provider text');
    assert.equal(batch?.tokensTotal, i === 16 ? 16 : undefined);
    if (batch !== null) assert.equal(batch.tokensDelta, 16);
  }
  assert.deepEqual(legacy.flush(), {
    kind: 'token', operation: 'workflow.run', stageId: 's1', tokensDelta: 1, tokensTotal: 17,
  });
  assert.equal(legacy.flush(), null);

  workflow.onProgress({ phase: 'synthesize-retry', attempt: 42, detail: 'private', stepId: 'private text' });
  const details = workflow.read();
  assert.deepEqual(details, {
    kind: 'workflow', stageId: 'synthesize-retry', activeUnit: null, stagePosition: null,
    production: { unit: 'output-chunks', completed: 17, total: null },
  });
  assert.ok(details && validProgressMeasurement(measurement(details), validateExecutorDetails));
  assert.equal(validateExecutorDetails('workflow', { ...details, extra: 'private' }), false);
  assert.equal(validateExecutorDetails('workflow', { ...details, production: { unit: 'tokens', completed: 17, total: null } }), false);
});

test('S2 analysis measurements ignore previews and isolate nested task identities', () => {
  const analysis = new AnalysisMeasurements();
  analysis.onEvent({ type: 'stage-started', stage: 'plan' });
  analysis.onEvent({ type: 'plan-accepted', taskCount: 2, planId: 'p1' });
  analysis.onEvent({ type: 'stage-started', stage: 'execute' });
  analysis.onEvent({ type: 'llm-token', stage: 'execute', substep: 'emit', preview: 'private output' });
  assert.deepEqual(analysis.read(), {
    kind: 'analysis', stageId: 'execute', activeUnit: null, production: null,
    stagePosition: { unit: 'tasks', completed: 0, total: 2 },
  });

  const task = { taskId: 't1', template: 'private label', index: 1, total: 2 };
  analysis.onEvent({ type: 'task-started', ...task });
  analysis.onEvent({ type: 'task-started', ...task, parentTaskPath: 't1' });
  analysis.onEvent({ type: 'task-completed', taskId: 't1', status: 'ok', parentTaskPath: 't1' });
  assert.equal(analysis.read()?.stagePosition?.completed, 0);
  assert.equal(analysis.read()?.activeUnit, 't1');

  analysis.onEvent({ type: 'task-completed', taskId: 't1', status: 'ok' });
  analysis.onEvent({ type: 'task-started', ...task, index: 2 });
  analysis.onEvent({ type: 'task-completed', taskId: 't1', status: 'ok' });
  assert.equal(analysis.read()?.stagePosition?.completed, 1);
  analysis.onEvent({ type: 'task-started', ...task, taskId: 'wrong-plan', index: 2, total: 3 });
  assert.equal(analysis.read()?.activeUnit, null);
  analysis.onEvent({ type: 'task-started', ...task, taskId: 't2', index: 2 });
  analysis.onEvent({ type: 'task-completed', taskId: 't2', status: 'failed' });
  const details = analysis.read();
  assert.equal(details?.stagePosition?.completed, 2);
  assert.ok(details && validProgressMeasurement(measurement(details), validateExecutorDetails));
  assert.equal(validateExecutorDetails('workflow', details), false);
  assert.equal(validateExecutorDetails('analysis', {
    ...details, stagePosition: { unit: 'tasks', completed: 3, total: 2 },
  }), false);
});
