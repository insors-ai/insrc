<!-- insrc:artifact LLD-1cd9a4c34f403a80-s4 -->

# LLD: E202607151cd9a4c3:S004

**Epic:** `add-plan-workflow-insrc-framework-4th`
**HLD base run:** `wf-1784121669696-i1rc6r`
**HLD effective hash:** `c7645d42a9f5...`

## HLD context

**Framework:** Implement `plan` as a new fine-grained instance of the shared workflow skeleton, peer to define/design.epic/design.story. A single runner module registers a fixed six-step recipe (context.assemble -> tasks.enumerate -> tasks.critique -> tasks.finalize -> test-strategy.write -> checklist.verify) whose outputs the orchestrator's three per-workflow arms turn into a persisted, cited PlanArtifact for exactly one Story. A new gate reads the Story's approved, non-stale LLD (adding requireApprovedLld by mirroring requireApprovedHld and reusing the existing effective-hash/staleness machinery), and a new storage helper writes the artifact under the as-built slug-md + hash-json convention. Nothing about the executor, state store, approval flow, or MCP phase loop changes except a single 'plan' arm added at each existing seam.
**Rollout phase:** Phase B — Gate, persistence, and test naming
**Owns:** `sc4` (TaskTestPlan)
**Consumes:** `sc1` (PlanTask)

## Contract details

**Surface level:** internal-shared

### `TaskTestRef`

```typescript
type TestLevel = 'unit' | 'integration' | 'live' | 'smoke';
interface TaskTestRef { readonly level: TestLevel; readonly name: string; }
```

**Returns:** `TaskTestRef` — One named test at a given level (unit/integration/live/smoke) that validates a Task; the test-strategy.write step fills each PlanTask.tests[] with these — sc4 verbatim.

**Preconditions:**
- level is one of the four TestLevel values
- name is a human-readable test subject drawn from the LLD testStrategy

**Postconditions:**
- each PlanTask carries >=1 TaskTestRef in its tests[] slot (which sc1 reserves for s4)

### `TestStrategyCoverage`

```typescript
interface TestStrategyCoverage { readonly lldStrategyItem: string; readonly coveredByTaskIds: readonly string[]; }
```

**Returns:** `TestStrategyCoverage` — One row of the coverage map: an item drawn from the approved LLD's testStrategy and the PlanTask ids whose tests[] cover it. The full list is PlanBody.testStrategyCoverage — sc4 verbatim.

**Preconditions:**
- lldStrategyItem is a verbatim item from the LLD's testStrategy (a testLevels.subject or acceptanceMapping.provingTest)
- every coveredByTaskId is a real PlanTask id

**Postconditions:**
- every LLD testStrategy item appears exactly once as an lldStrategyItem
- every lldStrategyItem has >=1 coveredByTaskId

### `checkTestStrategyCoverage`

```typescript
function checkTestStrategyCoverage(tasks: readonly PlanTask[], coverage: readonly TestStrategyCoverage[], lldTestStrategy: LldTestStrategy): readonly string[]
```

**Parameters:**
- `tasks: readonly PlanTask[]` — the finalized Task list (each with its tests[])
- `coverage: readonly TestStrategyCoverage[]` — the emitted coverage map
- `lldTestStrategy: LldTestStrategy` — the approved LLD's testStrategy (items to cover)

**Returns:** `readonly string[]` — A list of coverage issues (empty = ok): an uncovered LLD strategy item, a coverage row referencing an unknown Task id, or a Task id whose tests[] does not actually match its claimed coverage. Non-empty fails synthesize, mirroring the existing constraint/acceptance coverage checks.

**Preconditions:**
- the plan finalize has assembled tasks + coverage from the step outputs

**Postconditions:**
- an empty return means every LLD strategy item is covered by a real Task carrying matching tests (ac2)

## Data model changes

### `TaskTestRef` — new

New per-Task test reference (level + name) filling the sc1 PlanTask.tests[] slot; the TestLevel enum reuses the LLD's unit/integration/live/smoke vocabulary.

```
+ type TestLevel = 'unit'|'integration'|'live'|'smoke'
+ interface TaskTestRef { level: TestLevel; name: string }
```

**Call sites:**
- `src/workflow/artifacts/plan.ts (PlanTask.tests[] holds TaskTestRef[], defined in the new plan artifact module)`
- `src/workflow/orchestrator.ts (finalizePlan runs checkTestStrategyCoverage)`

### `TestStrategyCoverage` — new

New coverage-map row (lldStrategyItem -> coveredByTaskIds); the list is PlanBody.testStrategyCoverage. Its coverage-in-finalize validation mirrors the existing constraint-coverage / acceptance-mapping checks.

```
+ interface TestStrategyCoverage { lldStrategyItem: string; coveredByTaskIds: string[] }
```

**Call sites:**
- `src/workflow/artifacts/plan.ts (PlanBody.testStrategyCoverage)`
- `src/workflow/orchestrator.ts (the finalizePlan coverage check, mirroring checkConstraintCoverage/checkAcceptanceMapping)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | s4 owns and implements sc4: it defines TestLevel/TaskTestRef/TestStrategyCoverage, the test-strategy.write step that names per-Task tests from the LLD testStrategy, and checkTestStrategyCoverage in finalizePlan that proves every LLD strategy item is covered. How the strategy is decomposed into tests + the coverage computation stay private to s4. |
| `sc1` | consumes | s4 fills the tests[] slot that sc1's PlanTask reserves (owned by s1, filled by s4); it references PlanTask ids in coverageByTaskIds but never reshapes the PlanTask structure. |

## Error paths

### Error cases

- **An LLD testStrategy item is not covered by any Task's tests.** (recoverable)
  - Detection: checkTestStrategyCoverage diffs the set of LLD testStrategy items against the union of lldStrategyItem keys with >=1 coveredByTaskId and finds an uncovered item.
  - Response: Return a retryable synthesize failure naming the uncovered strategy item so tasks.finalize/test-strategy.write can add a covering test.
  - User impact: None visible; the run retries. A persisted plan never under-covers the design test strategy (ac2).
- **A TestStrategyCoverage row references a coveredByTaskId that is not a real PlanTask.** (recoverable)
  - Detection: checkTestStrategyCoverage checks each coveredByTaskId against the Task id set and finds an unknown id.
  - Response: Return a retryable schema failure listing the dangling task id.
  - User impact: None visible; internal retry.
- **A coverage row claims a Task covers an item, but that Task's tests[] contains no matching test.** (recoverable)
  - Detection: checkTestStrategyCoverage cross-checks the claimed Task's tests[] against the strategy item and finds no matching TaskTestRef.
  - Response: Return a retryable failure (the coverage claim is unsupported by the Task's own tests).
  - User impact: None visible; internal retry.
- **A Task has an empty tests[] after test-strategy.write.** (recoverable)
  - Detection: checkTestStrategyCoverage (or the plan finalize) finds a PlanTask whose tests[] is empty.
  - Response: Return a retryable failure requiring at least one TaskTestRef per Task (ac1).
  - User impact: None visible; internal retry.

### Edge cases

| Input | Expected |
| :--- | :--- |
| An LLD whose testStrategy has only unit-level items (no integration/live/smoke). | Only unit TaskTestRefs are named; coverage is total over the present items — absent levels are not treated as gaps. |
| A single strategy item legitimately covered by tests across several Tasks. | coveredByTaskIds lists all covering Task ids (a one-to-many mapping is valid). |
| One Task whose tests validate multiple distinct strategy items. | That Task id appears in several TestStrategyCoverage rows; a many-to-one mapping is valid. |

### Invariants to preserve

- The coverage check is deterministic and lives in the plan finalize, mirroring the existing constraint-coverage / acceptance-mapping checks; it must not be weakened to an LLM self-assertion. [[c1]]
- TestLevel reuses the LLD's own unit/integration/live/smoke vocabulary and lldStrategyItem is drawn verbatim from the approved LLD testStrategy; s4 must not invent new levels or paraphrase strategy items. [[c2]]
- s4 fills only the tests[] slot sc1 reserves and adds the PlanBody.testStrategyCoverage list; it must not reshape PlanTask or re-validate the Task graph (that is s1's responsibility). [[c3]]

## Test strategy

**Test framework:** `node:test (tsx --test), mirroring the coverage-check unit tests for define/HLD/LLD in src/workflow/__tests__`

### Test levels

- **unit** — Exercise checkTestStrategyCoverage over hand-built (tasks, coverage, lldTestStrategy) fixtures.
  - Subjects: `checkTestStrategyCoverage returns [] for a total coverage map`, `returns an issue for an uncovered LLD strategy item`, `returns an issue for a coverage row referencing an unknown task id`, `returns an issue when a coverage row claims a Task that has no matching TaskTestRef`, `returns an issue for a Task with an empty tests[]`, `accepts one-to-many (item covered by several tasks) and many-to-one (task covering several items)`
  - Fixtures: `a LLD testStrategy fixture`, `PlanTask[] fixtures with tests[] variants (full, empty, mismatched)`, `TestStrategyCoverage fixtures: total, gap, dangling-id, unsupported-claim`
- **integration** — Confirm the plan workflow emits per-Task tests + a total coverage map through the MCP loop.
  - Subjects: `a full plan run produces PlanTasks each with >=1 TaskTestRef and a PlanBody.testStrategyCoverage covering every LLD strategy item`, `a plan whose test-strategy.write leaves an item uncovered fails synthesize`
  - Fixtures: `seeded approved+non-stale LLD with a multi-level testStrategy`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: checkTestStrategyCoverage flags a Task with empty tests[]`, `integration: produced PlanTasks each carry >=1 TaskTestRef across the LLD's levels` |
| `ac2` | `unit: checkTestStrategyCoverage returns an issue for an uncovered strategy item and [] for a total map`, `integration: the produced PlanBody.testStrategyCoverage covers every LLD testStrategy item` |

## Migration

**State before:** Today the LLD carries a testStrategy (testLevels/acceptanceMapping/testFramework) and finalize enforces coverage-style invariants for define/HLD/LLD (constraint coverage, acceptance mapping) [[c1]] — but there is NO TaskTestPlan: no TestLevel/TaskTestRef/TestStrategyCoverage types and no checkTestStrategyCoverage, and Tasks have no per-Task test naming. Test planning for a Task tier does not exist.

**State after:** The plan artifact gains the sc4 types (TestLevel/TaskTestRef in each PlanTask.tests[] + PlanBody.testStrategyCoverage), the plan recipe's test-strategy.write step names per-Task tests from the LLD testStrategy, and finalizePlan gains checkTestStrategyCoverage (mirroring the existing coverage checks) so every LLD strategy item maps to a Task's tests. All existing artifacts + coverage checks are untouched.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add TestLevel/TaskTestRef/TestStrategyCoverage to the new artifacts/plan.ts (PlanTask.tests[] + PlanBody.testStrategyCoverage). Pure addition within the plan module s3 introduces. — ↩ rollbackable
2. Add the test-strategy.write step prompt/schema to the plan runner module, naming per-Task TaskTestRefs from the LLD testStrategy. Additive step registration; other workflows unaffected. — ↩ rollbackable
3. Add checkTestStrategyCoverage to the plan finalize (finalizePlan), invoked exactly like the existing checkConstraintCoverage/checkAcceptanceMapping. Additive; existing coverage checks unchanged. — ↩ rollbackable
4. No data backfill: existing LLDs already carry the testStrategy s4 reads; no existing artifact is rewritten. — ↩ rollbackable

**Backward compat:** No existing public API changes: the LLD testStrategy shape, the existing checkConstraintCoverage/checkAcceptanceMapping validators, and every other artifact keep their signatures + behaviour. The sc4 types + checkTestStrategyCoverage live only in the new plan module + plan finalize arm and are reached only for the 'plan' workflow.

## Alternatives considered

### a1: Per-Task TaskTestRef[] + a top-level TestStrategyCoverage[], validated in finalize — **CHOSEN**

test-strategy.write fills each PlanTask.tests[] with TaskTestRef{level,name} and emits a TestStrategyCoverage[] mapping every LLD testStrategy item to the Task ids that cover it; finalizePlan checks the mapping is total.

The test-strategy.write step reads the approved LLD's testStrategy (testLevels.subjects + acceptanceMapping.provingTests) and, for each PlanTask, names the TaskTestRef{level,name} that validate it (satisfying ac1). It then emits PlanBody.testStrategyCoverage: one TestStrategyCoverage{lldStrategyItem, coveredByTaskIds} per LLD strategy item. finalizePlan runs checkTestStrategyCoverage: every lldStrategyItem must have >=1 coveredByTaskId AND every coveredByTaskId must be a real Task carrying >=1 matching test (satisfying ac2), mirroring the existing constraint/acceptance coverage checks; a gap is a retryable failure.

### a2: Coverage derived implicitly from Task tests (no explicit TestStrategyCoverage list)

Only fill PlanTask.tests[]; compute coverage on the fly in finalize by matching test names to LLD strategy items, without persisting a TestStrategyCoverage[].

test-strategy.write fills each Task's tests[] but does not emit a separate coverage list; finalizePlan derives coverage by fuzzy-matching each Task test name against the LLD testStrategy items and fails if any item is unmatched. sc4's TestStrategyCoverage would then be a computed view rather than a persisted field.

**Rejected because:** Violates sc4 (drops the declared TestStrategyCoverage field) and only partially meets ac2 via unreliable, non-auditable fuzzy matching; not viable without an HLD amendment, so a1 wins on contract-fidelity + traceability.
