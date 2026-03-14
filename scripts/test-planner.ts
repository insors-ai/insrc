/**
 * Planner module smoke test — exercises core library functions.
 *
 * Run: npx tsx scripts/test-planner.ts
 */

import {
  generateId,
  detectCycles,
  updateStepStatus,
  validateDependencies,
  detectBlockedSteps,
  computePlanStatus,
  getProgressSummary,
  getStatusHistory,
  toMarkdown,
  fromMarkdown,
  updateStepInMarkdown,
  type Plan,
  type Step,
  type ImplementationStepData,
  type ImplementationPlan,
} from '../src/agent/planner/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function section(name: string): void {
  console.log(`\n── ${name} ──`);
}

// ---------------------------------------------------------------------------
// Build a test plan
// ---------------------------------------------------------------------------

function makeTestPlan(): ImplementationPlan {
  const now = new Date().toISOString();
  const ids = Array.from({ length: 5 }, () => generateId());

  const steps: Step<ImplementationStepData>[] = [
    {
      id: ids[0]!, title: 'Create schema', description: 'Add database tables',
      status: 'pending', dependencies: [],
      metadata: { createdAt: now, updatedAt: now },
      data: { filePaths: ['src/db/schema.ts'], estimatedComplexity: 'low' },
    },
    {
      id: ids[1]!, title: 'Implement model', description: 'User model with validation',
      status: 'pending', dependencies: [ids[0]!],
      metadata: { createdAt: now, updatedAt: now },
      data: { filePaths: ['src/models/user.ts'], estimatedComplexity: 'medium' },
    },
    {
      id: ids[2]!, title: 'Add API routes', description: 'REST endpoints for users',
      status: 'pending', dependencies: [ids[1]!],
      metadata: { createdAt: now, updatedAt: now },
      data: { filePaths: ['src/routes/users.ts'], estimatedComplexity: 'medium' },
    },
    {
      id: ids[3]!, title: 'Write tests', description: 'Unit and integration tests',
      status: 'pending', dependencies: [ids[1]!, ids[2]!],
      metadata: { createdAt: now, updatedAt: now },
      data: { filePaths: ['tests/users.test.ts'], estimatedComplexity: 'medium' },
    },
    {
      id: ids[4]!, title: 'Update docs', description: 'API documentation',
      status: 'pending', dependencies: [ids[2]!],
      metadata: { createdAt: now, updatedAt: now },
      data: { filePaths: ['docs/api.md'], estimatedComplexity: 'low' },
    },
  ];

  return {
    id: generateId(),
    repoPath: '/test/repo',
    title: 'User Management Feature',
    description: 'Implement user CRUD with tests',
    status: 'active',
    steps,
    metadata: { createdAt: now, updatedAt: now, author: 'test' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('Planner Module — Smoke Tests');

// --- ID generation ---
section('ID Generation');
const id1 = generateId();
const id2 = generateId();
assert(typeof id1 === 'string' && id1.length > 0, 'generates non-empty string');
assert(id1 !== id2, 'generates unique IDs');

// --- Cycle detection ---
section('Cycle Detection');

const plan = makeTestPlan();
assert(detectCycles(plan) === null, 'no cycle in valid plan');

// Create a plan with a cycle
const cyclePlan = makeTestPlan();
const step0Id = cyclePlan.steps[0]!.id;
const step2Id = cyclePlan.steps[2]!.id;
cyclePlan.steps[0]!.dependencies = [step2Id]; // 0 depends on 2, 2 depends on 1, 1 depends on 0
const cycleResult = detectCycles(cyclePlan);
assert(cycleResult !== null, 'detects cycle in plan');
if (cycleResult) {
  assert(cycleResult.length >= 2, `cycle path has ${cycleResult.length} nodes`);
}

// --- Status transitions ---
section('Status Transitions');

let p = makeTestPlan();
// Move step 0 to in_progress
p = updateStepStatus(p, p.steps[0]!.id, 'in_progress', 'starting work');
assert(p.steps[0]!.status === 'in_progress', 'step 0 → in_progress');

// Move step 0 to done
p = updateStepStatus(p, p.steps[0]!.id, 'done', 'completed');
assert(p.steps[0]!.status === 'done', 'step 0 → done');

// Validate dependencies: step 1 deps are met (step 0 is done)
assert(validateDependencies(p, p.steps[1]!.id), 'step 1 deps met after step 0 done');

// Step 3 deps NOT met (needs step 1 and 2)
assert(!validateDependencies(p, p.steps[3]!.id), 'step 3 deps not met');

// Try invalid transition: pending → done (should throw)
let threwError = false;
try {
  updateStepStatus(p, p.steps[1]!.id, 'done');
} catch (e) {
  threwError = true;
}
assert(threwError, 'blocks pending → done (invalid transition)');

// Try marking done with unmet deps
p = updateStepStatus(p, p.steps[1]!.id, 'in_progress');
let threwDeps = false;
try {
  // step 2 depends on step 1 which is in_progress (not done)
  const p2 = updateStepStatus(p, p.steps[1]!.id, 'done');
  // step 1 depends on step 0 (done) — should work
  assert(p2.steps[1]!.status === 'done', 'step 1 → done (deps met)');
} catch {
  threwDeps = true;
}
// Step 1 depends on step 0 which is done, so this should succeed
assert(!threwDeps, 'step 1 can complete (step 0 is done)');

// --- Status history ---
section('Status History');
const history = getStatusHistory(p, p.steps[0]!.id);
assert(history.length >= 2, `step 0 has ${history.length} transitions`);

// --- Blocked step detection ---
section('Blocked Step Detection');
let bp = makeTestPlan();
bp = updateStepStatus(bp, bp.steps[0]!.id, 'in_progress');
bp = updateStepStatus(bp, bp.steps[0]!.id, 'failed', 'build error');
const blocked = detectBlockedSteps(bp);
assert(blocked.length > 0, `${blocked.length} blocked steps found`);

// --- Plan status computation ---
section('Plan Status');
assert(computePlanStatus(bp) === 'active', 'plan with pending+failed = active');

let cp = makeTestPlan();
for (const s of cp.steps) {
  cp = updateStepStatus(cp, s.id, 'in_progress');
  cp = updateStepStatus(cp, s.id, 'done');
}
assert(computePlanStatus(cp) === 'completed', 'all done = completed');

// --- Progress summary ---
section('Progress Summary');
const prog = getProgressSummary(cp);
assert(prog.total === 5, `total = ${prog.total}`);
assert(prog.pctComplete === 100, `pct = ${prog.pctComplete}%`);
assert(prog.byStatus.done === 5, `done = ${prog.byStatus.done}`);

// --- Markdown serialization ---
section('Markdown Serialization');
const original = makeTestPlan();
const md = toMarkdown(original);
assert(md.includes('---'), 'has frontmatter');
assert(md.includes(original.title), 'includes title');
assert(md.includes('[ ]'), 'has pending checkboxes');
assert(md.includes(`id: ${original.id}`), 'includes plan ID');

// Round-trip
const parsed = fromMarkdown<ImplementationStepData>(md);
assert(parsed.title === original.title, 'round-trip preserves title');
assert(parsed.id === original.id, 'round-trip preserves ID');
assert(parsed.steps.length === original.steps.length, `round-trip preserves ${parsed.steps.length} steps`);

// In-place update
const updated = updateStepInMarkdown(md, original.steps[0]!.id, 'done');
assert(updated.includes('[x]'), 'in-place update changes checkbox to done');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
