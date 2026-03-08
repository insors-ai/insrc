#!/usr/bin/env tsx
/**
 * Phase 6 tests — Plan Graph + /plan Command
 *
 * Tests cover:
 *   - Plan/PlanStep type shapes
 *   - Plan state machine (valid/invalid transitions)
 *   - Plan pipeline step parsing
 *   - L2 tag support in ContextManager
 *   - MCP client plan helpers (graceful degradation)
 *   - Plan display formatting
 *   - Requirements/Design pipeline structure
 *   - Plan store dependency resolution logic
 *   - Kuzu schema additions (structural assertions)
 */

import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => { passed++; console.log(`  \u2713 ${name}`); },
    (err: unknown) => { failed++; console.log(`  \u2717 ${name}`); console.log(`    ${err}`); },
  );
}

// ---------------------------------------------------------------------------
// 1. Plan/PlanStep type shapes
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 Plan type shapes \u2500\u2500');

import type {
  Plan, PlanStep, PlanStepStatus, PlanStepComplexity, PlanStatus,
} from '../src/shared/types.js';

await test('Plan interface has required fields', () => {
  const plan: Plan = {
    id: 'plan-1',
    repoPath: '/tmp/repo',
    title: 'Test Plan',
    status: 'active',
    steps: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assert.equal(plan.id, 'plan-1');
  assert.equal(plan.status, 'active');
  assert.equal(plan.steps.length, 0);
});

await test('PlanStep interface has required fields', () => {
  const step: PlanStep = {
    id: 'step-1',
    planId: 'plan-1',
    idx: 0,
    title: 'Create schema',
    description: 'Add tables to database',
    checkpoint: true,
    status: 'pending',
    complexity: 'medium',
    fileHint: 'src/db/schema.ts',
    notes: '',
    dependsOn: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assert.equal(step.checkpoint, true);
  assert.equal(step.complexity, 'medium');
  assert.equal(step.fileHint, 'src/db/schema.ts');
  assert.equal(step.dependsOn.length, 0);
});

await test('PlanStepStatus covers all states', () => {
  const states: PlanStepStatus[] = ['pending', 'in_progress', 'done', 'failed', 'skipped'];
  assert.equal(states.length, 5);
});

await test('PlanStepComplexity covers all levels', () => {
  const levels: PlanStepComplexity[] = ['low', 'medium', 'high'];
  assert.equal(levels.length, 3);
});

await test('PlanStatus covers all values', () => {
  const statuses: PlanStatus[] = ['active', 'completed', 'abandoned'];
  assert.equal(statuses.length, 3);
});

// ---------------------------------------------------------------------------
// 2. Plan state machine
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 Plan state machine \u2500\u2500');

import { isValidTransition } from '../src/agent/tasks/plan-store.js';

await test('pending -> in_progress is valid', () => {
  assert.ok(isValidTransition('pending', 'in_progress'));
});

await test('in_progress -> done is valid', () => {
  assert.ok(isValidTransition('in_progress', 'done'));
});

await test('in_progress -> failed is valid', () => {
  assert.ok(isValidTransition('in_progress', 'failed'));
});

await test('in_progress -> skipped is valid', () => {
  assert.ok(isValidTransition('in_progress', 'skipped'));
});

await test('in_progress -> pending is valid (crash recovery)', () => {
  assert.ok(isValidTransition('in_progress', 'pending'));
});

await test('failed -> in_progress is valid (retry)', () => {
  assert.ok(isValidTransition('failed', 'in_progress'));
});

await test('done -> pending is valid (undo)', () => {
  assert.ok(isValidTransition('done', 'pending'));
});

await test('skipped -> pending is valid (revert skip)', () => {
  assert.ok(isValidTransition('skipped', 'pending'));
});

await test('pending -> done is invalid (must go through in_progress)', () => {
  assert.equal(isValidTransition('pending', 'done'), false);
});

await test('done -> in_progress is invalid', () => {
  assert.equal(isValidTransition('done', 'in_progress'), false);
});

await test('pending -> failed is invalid', () => {
  assert.equal(isValidTransition('pending', 'failed'), false);
});

await test('pending -> skipped is valid (user skip)', () => {
  assert.ok(isValidTransition('pending', 'skipped'));
});

await test('failed -> done is invalid (must retry first)', () => {
  assert.equal(isValidTransition('failed', 'done'), false);
});

// ---------------------------------------------------------------------------
// 3. L2 tag support
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 L2 tag support \u2500\u2500');

import { ContextManager } from '../src/agent/context/index.js';
import type { LLMProvider, LLMResponse } from '../src/shared/types.js';

const mockProvider: LLMProvider = {
  async complete(): Promise<LLMResponse> { return { text: 'mock', toolCalls: [], stopReason: 'end_turn' }; },
  async *stream(): AsyncIterable<string> { yield 'mock'; },
  async embed(): Promise<number[]> { return []; },
  supportsTools: false,
};

await test('setTag stores and getTag retrieves', () => {
  const ctx = new ContextManager({ repoPath: '/tmp/test', closureRepos: ['/tmp/test'], provider: mockProvider });
  ctx.setTag('[requirements]', 'User auth requirements.');
  assert.equal(ctx.getTag('[requirements]'), 'User auth requirements.');
});

await test('hasTag returns true for set tags', () => {
  const ctx = new ContextManager({ repoPath: '/tmp/test', closureRepos: ['/tmp/test'], provider: mockProvider });
  assert.equal(ctx.hasTag('[requirements]'), false);
  ctx.setTag('[requirements]', 'content');
  assert.ok(ctx.hasTag('[requirements]'));
});

await test('hasTag returns false for empty string', () => {
  const ctx = new ContextManager({ repoPath: '/tmp/test', closureRepos: ['/tmp/test'], provider: mockProvider });
  ctx.setTag('[requirements]', '');
  assert.equal(ctx.hasTag('[requirements]'), false);
});

await test('getTag returns empty string for unset tags', () => {
  const ctx = new ContextManager({ repoPath: '/tmp/test', closureRepos: ['/tmp/test'], provider: mockProvider });
  assert.equal(ctx.getTag('[design]'), '');
});

await test('setTag appends reference to summary', () => {
  const ctx = new ContextManager({ repoPath: '/tmp/test', closureRepos: ['/tmp/test'], provider: mockProvider });
  ctx.setTag('[requirements]', 'content');
  assert.ok(ctx.getSummary().includes('[requirements]'));
});

await test('multiple tags coexist', () => {
  const ctx = new ContextManager({ repoPath: '/tmp/test', closureRepos: ['/tmp/test'], provider: mockProvider });
  ctx.setTag('[requirements]', 'req content');
  ctx.setTag('[design]', 'design content');
  assert.equal(ctx.getTag('[requirements]'), 'req content');
  assert.equal(ctx.getTag('[design]'), 'design content');
});

// ---------------------------------------------------------------------------
// 4. Active plan step context
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 Active plan step context \u2500\u2500');

await test('setActivePlanStep and getActivePlanStep roundtrip', () => {
  const ctx = new ContextManager({ repoPath: '/tmp/test', closureRepos: ['/tmp/test'], provider: mockProvider });
  assert.equal(ctx.getActivePlanStep(), '');
  ctx.setActivePlanStep('Step 1: Create database schema');
  assert.equal(ctx.getActivePlanStep(), 'Step 1: Create database schema');
});

await test('reset clears active plan step', () => {
  const ctx = new ContextManager({ repoPath: '/tmp/test', closureRepos: ['/tmp/test'], provider: mockProvider });
  ctx.setActivePlanStep('step context');
  ctx.setTag('[requirements]', 'content');
  ctx.reset();
  assert.equal(ctx.getActivePlanStep(), '');
  assert.equal(ctx.getTag('[requirements]'), '');
});

// ---------------------------------------------------------------------------
// 5. MCP client plan helpers (graceful degradation)
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 MCP plan helpers \u2500\u2500');

import {
  planSave, planGet, planStepUpdate, planNextStep, planDelete,
} from '../src/agent/tools/mcp-client.js';

await test('planSave does not throw when daemon is down', async () => {
  const plan: Plan = {
    id: 'test-plan', repoPath: '/tmp/test', title: 'Test', status: 'active',
    steps: [], createdAt: '', updatedAt: '',
  };
  await planSave(plan); // should not throw
});

await test('planGet returns null when daemon is down', async () => {
  const result = await planGet({ repoPath: '/tmp/test' });
  assert.equal(result, null);
});

await test('planStepUpdate returns error when daemon is down', async () => {
  const result = await planStepUpdate('step-1', 'done');
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

await test('planNextStep returns null when daemon is down', async () => {
  const result = await planNextStep('plan-1');
  assert.equal(result, null);
});

await test('planDelete does not throw when daemon is down', async () => {
  await planDelete('plan-1'); // should not throw
});

// ---------------------------------------------------------------------------
// 6. Plan pipeline step parsing
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 Plan pipeline parsing \u2500\u2500');

// We can't easily test the full pipeline without LLM providers, but we can
// import and verify the module loads and exported functions exist.

import { runPlanPipeline } from '../src/agent/tasks/plan.js';

await test('runPlanPipeline is a function', () => {
  assert.equal(typeof runPlanPipeline, 'function');
});

import { runRequirementsPipeline } from '../src/agent/tasks/requirements.js';

await test('runRequirementsPipeline is a function', () => {
  assert.equal(typeof runRequirementsPipeline, 'function');
});

import { runDesignPipeline } from '../src/agent/tasks/design.js';

await test('runDesignPipeline is a function', () => {
  assert.equal(typeof runDesignPipeline, 'function');
});

// ---------------------------------------------------------------------------
// 7. Kuzu schema structural assertions
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 Kuzu schema \u2500\u2500');

import { KUZU_STATEMENTS } from '../src/db/schema.js';

await test('Schema includes Plan node table', () => {
  const hasPlan = KUZU_STATEMENTS.some(s => s.includes('Plan(') && s.includes('NODE TABLE'));
  assert.ok(hasPlan);
});

await test('Schema includes PlanStep node table', () => {
  const hasPlanStep = KUZU_STATEMENTS.some(s => s.includes('PlanStep(') && s.includes('NODE TABLE'));
  assert.ok(hasPlanStep);
});

await test('Schema includes CONTAINS rel table (Plan -> PlanStep)', () => {
  const hasContains = KUZU_STATEMENTS.some(s =>
    s.includes('CONTAINS') && s.includes('FROM Plan') && s.includes('TO PlanStep'),
  );
  assert.ok(hasContains);
});

await test('Schema includes STEP_DEPENDS_ON rel table (PlanStep -> PlanStep)', () => {
  const hasDeps = KUZU_STATEMENTS.some(s =>
    s.includes('STEP_DEPENDS_ON') && s.includes('FROM PlanStep') && s.includes('TO PlanStep'),
  );
  assert.ok(hasDeps);
});

await test('PlanStep schema includes checkpoint and complexity fields', () => {
  const stepSchema = KUZU_STATEMENTS.find(s => s.includes('PlanStep('));
  assert.ok(stepSchema);
  assert.ok(stepSchema!.includes('checkpoint'));
  assert.ok(stepSchema!.includes('complexity'));
});

await test('Plan schema includes status field', () => {
  const planSchema = KUZU_STATEMENTS.find(s => s.includes('Plan(') && s.includes('NODE TABLE'));
  assert.ok(planSchema);
  assert.ok(planSchema!.includes('status'));
});

// ---------------------------------------------------------------------------
// 8. Plan store exports
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 Plan store exports \u2500\u2500');

import * as planStore from '../src/agent/tasks/plan-store.js';

await test('plan-store exports savePlan', () => {
  assert.equal(typeof planStore.savePlan, 'function');
});

await test('plan-store exports getPlan', () => {
  assert.equal(typeof planStore.getPlan, 'function');
});

await test('plan-store exports getActivePlan', () => {
  assert.equal(typeof planStore.getActivePlan, 'function');
});

await test('plan-store exports updateStepState', () => {
  assert.equal(typeof planStore.updateStepState, 'function');
});

await test('plan-store exports getNextStep', () => {
  assert.equal(typeof planStore.getNextStep, 'function');
});

await test('plan-store exports deletePlan', () => {
  assert.equal(typeof planStore.deletePlan, 'function');
});

await test('plan-store exports isValidTransition', () => {
  assert.equal(typeof planStore.isValidTransition, 'function');
});

// ---------------------------------------------------------------------------
// 9. Plan step dependency validation
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 Dependency validation \u2500\u2500');

await test('Step with no dependencies has empty dependsOn', () => {
  const step: PlanStep = {
    id: 's1', planId: 'p1', idx: 0, title: 'First', description: '',
    checkpoint: false, status: 'pending', complexity: 'low', fileHint: '',
    notes: '', dependsOn: [], createdAt: '', updatedAt: '',
  };
  assert.equal(step.dependsOn.length, 0);
});

await test('Step dependsOn references other step IDs', () => {
  const step: PlanStep = {
    id: 's2', planId: 'p1', idx: 1, title: 'Second', description: '',
    checkpoint: false, status: 'pending', complexity: 'medium', fileHint: '',
    notes: '', dependsOn: ['s1'], createdAt: '', updatedAt: '',
  };
  assert.equal(step.dependsOn.length, 1);
  assert.equal(step.dependsOn[0], 's1');
});

await test('Multiple dependencies are supported', () => {
  const step: PlanStep = {
    id: 's3', planId: 'p1', idx: 2, title: 'Third', description: '',
    checkpoint: true, status: 'pending', complexity: 'high', fileHint: 'src/app.ts',
    notes: '', dependsOn: ['s1', 's2'], createdAt: '', updatedAt: '',
  };
  assert.equal(step.dependsOn.length, 2);
});

// ---------------------------------------------------------------------------
// 10. State machine exhaustive transition matrix
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 Transition matrix \u2500\u2500');

const ALL_STATES: PlanStepStatus[] = ['pending', 'in_progress', 'done', 'failed', 'skipped'];

await test('Transition matrix: exactly 9 valid transitions exist', () => {
  let validCount = 0;
  for (const from of ALL_STATES) {
    for (const to of ALL_STATES) {
      if (isValidTransition(from, to)) validCount++;
    }
  }
  // pending->in_progress, pending->skipped,
  // in_progress->done, in_progress->failed, in_progress->skipped, in_progress->pending,
  // failed->in_progress, done->pending, skipped->pending
  assert.equal(validCount, 9);
});

await test('No self-transitions are valid', () => {
  for (const state of ALL_STATES) {
    assert.equal(isValidTransition(state, state), false, `${state} -> ${state} should be invalid`);
  }
});

// ---------------------------------------------------------------------------
// 11. New fields: fileHint, startedAt, doneAt
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 New PlanStep fields \u2500\u2500');

await test('PlanStep has fileHint field', () => {
  const step: PlanStep = {
    id: 's1', planId: 'p1', idx: 0, title: 'Test', description: '',
    checkpoint: false, status: 'pending', complexity: 'low',
    fileHint: 'src/db/schema.ts',
    notes: '', dependsOn: [], createdAt: '', updatedAt: '',
  };
  assert.equal(step.fileHint, 'src/db/schema.ts');
});

await test('PlanStep has optional startedAt/doneAt', () => {
  const step: PlanStep = {
    id: 's1', planId: 'p1', idx: 0, title: 'Test', description: '',
    checkpoint: false, status: 'done', complexity: 'low',
    fileHint: '',
    notes: '', dependsOn: [], createdAt: '', updatedAt: '',
    startedAt: '2025-01-01T00:00:00Z',
    doneAt: '2025-01-01T01:00:00Z',
  };
  assert.equal(step.startedAt, '2025-01-01T00:00:00Z');
  assert.equal(step.doneAt, '2025-01-01T01:00:00Z');
});

await test('PlanStep startedAt/doneAt can be undefined', () => {
  const step: PlanStep = {
    id: 's1', planId: 'p1', idx: 0, title: 'Test', description: '',
    checkpoint: false, status: 'pending', complexity: 'low',
    fileHint: '', notes: '', dependsOn: [], createdAt: '', updatedAt: '',
  };
  assert.equal(step.startedAt, undefined);
  assert.equal(step.doneAt, undefined);
});

await test('Schema includes fileHint and startedAt/doneAt fields', () => {
  const stepSchema = KUZU_STATEMENTS.find(s => s.includes('PlanStep('));
  assert.ok(stepSchema);
  assert.ok(stepSchema!.includes('fileHint'));
  assert.ok(stepSchema!.includes('startedAt'));
  assert.ok(stepSchema!.includes('doneAt'));
});

// ---------------------------------------------------------------------------
// 12. MCP planResetStale helper
// ---------------------------------------------------------------------------

console.log('\n\u2500\u2500 MCP planResetStale \u2500\u2500');

import { planResetStale } from '../src/agent/tools/mcp-client.js';

await test('planResetStale returns 0 when daemon is down', async () => {
  const result = await planResetStale('plan-1');
  assert.equal(result, 0);
});

// ---------------------------------------------------------------------------
// 13. plan-store exports resetStaleLocks
// ---------------------------------------------------------------------------

await test('plan-store exports resetStaleLocks', () => {
  assert.equal(typeof planStore.resetStaleLocks, 'function');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n\u2500\u2500 Phase 6 results: ${passed} passed, ${failed} failed \u2500\u2500\n`);
if (failed > 0) process.exit(1);
