<!-- insrc:artifact PLAN-9874475f902756f6-S001 -->

# Plan: E202610249874475f:S001

## Summary

**Epic:** `let-codex-accept-analyzer-decomposer-s`
**LLD run:** `wf-1792845934467-09830t`
**LLD effective hash:** `9874475f9027...`

Building this fix makes the analyzer's two plan-making calls expressible for codex. The decomposer gets a params table and a per-type schema, plus one shared step in both of its entry points that removes nulls and rejects keys a type does not declare. The planner gets a wire-schema builder: per template, with JSON-string slots for open objects and fallbacks for shapes that cannot be embedded. Its prompt, output shape and correction retries are updated to show that wire form. The build ends with a live codex check of the complete schemas, one full test sweep and a daemon rollout confirmed by a one-shot analysis on codex.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Exploration params table | M | — | unit: every exploration type has exactly one params branch, derived from EXPLORATION_TYPES; unit: each branch is closed, requires no param, and admits null and a placeholder string for every value; unit: every documented params example in the decomposer prompt validates against its type's branch | [[c1]] |
| 2 | **`t2`** Reshape DECOMPOSE_SCHEMA and share the decomposer params step | M | `t1` | unit: the codex strict copy of DECOMPOSE_SCHEMA contains no object without properties and no object whose additionalProperties is not false; unit: decompose and finalizeDecompose remove null params, so the executor receives today's params; unit: an exploration carrying a key its type does not declare fails with DecomposerSchemaUnrecoverable at decompose and at finalizeDecompose, and the one-shot driver runs the freeform.probe fallback instead of the plan; unit: empty params, a placeholder string where an array is expected, and a plan omitting optional params validate against DECOMPOSE_SCHEMA | [[c2]] [[c3]] [[c4]] [[c7]] |
| 3 | **`t3`** Planner wire schema: per-template wire form | M | — | unit: the 27 built-in templates yield a branch each, with exactly their 9 slot sets at the expected paths; unit: a slot is placed only at a position the original schema restricts to an object, and the adherence root one-of-three is left out of the branch | [[c5]] |
| 4 | **`t4`** Planner wire schema: fallbacks, identity and cache | M | `t3` | unit: no inputSchema, a local reference, a union with a string, and a draft-07 tuple each yield a whole-params slot, and no built-in template falls back; unit: repeated and recursive wire-schema builds with identical and different catalogs compile through validateAgainstSchema and validateCodexReply without an id collision; unit: two catalogs sharing a template id with different inputSchemas get different wire schemas; unit: the codex strict copy of the built-in planner wire schema for every target contains no open object | [[c5]] [[c6]] |
| 5 | **`t5`** runPlanner sends the wire schema and decodes the reply | M | `t4` | unit: runPlanner sends a wire schema covering exactly its effective catalog, and a supplied scopeRef round-trips through a slot into INV-5 unchanged; unit: supplied templates with no inputSchema, local references, a union with a string, and a draft-07 tuple round-trip as whole-params slots and pass INV-5 as today; unit: null params including nested ones are removed before INV-5, and the adherence one-of-three rule still fails a task with none of the three; unit: invalid JSON in a slot is reported through the planner failure path and nothing partial reaches INV-5 | [[c6]] [[c7]] |
| 6 | **`t6`** Planner messages show the wire form | M | `t5` | unit: the planner's output-shape block is the call's wire schema and the catalog lists each template's slot paths; unit: a correction retry echoes the rejected plan and the offending task in wire form; unit: the planner system prompt names the slot exception with the aggregator example and allows null for absent optional values | [[c8]] |
| 7 | **`t7`** Live codex check and the recorded refusals | S | `t2`, `t6` | live: codex accepts the complete DECOMPOSE_SCHEMA and every built-in planner wire schema, and the replies pass the reply check | [[c9]] [[c11]] |
| 8 | **`t8`** Full sweep and daemon rollout | S | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7` | smoke: a one-shot insrc_analyze on the rebuilt daemon's codex tier returns a plan | [[c10]] |

### 1.1 E202610249874475f:S001:T001 — Exploration params table

Add a params table beside the explorations: one entry per EXPLORATION_TYPES type (20 today) listing each param's name and value type, from src/prompts/analyze/decompose.system.md and the runners' reads. From it, build each type's closed params branch: every param optional, typed T | null | `$eN...` placeholder string.

**Acceptance checks:**
- Every EXPLORATION_TYPES entry has exactly one table entry, checked against the type list rather than a hard-coded count
- Each branch is a closed object with no required param, and each value admits null and a placeholder string
- Each documented params example in the decomposer prompt validates against its type's branch

### 1.2 E202610249874475f:S001:T002 — Reshape DECOMPOSE_SCHEMA and share the decomposer params step

DECOMPOSE_SCHEMA's params becomes the anyOf of the t1 branches. decompose and finalizeDecompose share one step, run before topology validation, that removes null params and rejects keys the exploration's type does not declare (DecomposerSchemaUnrecoverable). The decomposer prompt gains the line that an optional param may be null, meaning absent.

**Acceptance checks:**
- codexStrictSchema(DECOMPOSE_SCHEMA) has no object without properties and none whose additionalProperties is not false
- decompose and finalizeDecompose drop null params, and reject an undeclared key with DecomposerSchemaUnrecoverable
- In the one-shot driver that failure takes the freeform.probe fallback without executing the plan
- Empty params and placeholder strings stay valid

### 1.3 E202610249874475f:S001:T003 — Planner wire schema: per-template wire form

Add the builder that turns one template's inputSchema into its wire branch: closed objects keep their structure with optional properties nullable and not required; open objects at object-only positions become JSON-string slots whose paths are recorded; a root anyOf-of-required is left out of the branch.

**Acceptance checks:**
- Each of the 27 built-in templates yields a branch, and exactly 9 of them have slots, at the expected paths
- A slot is placed only where the original schema admits nothing but an object
- The adherence templates' root one-of-three is absent from their branches

### 1.4 E202610249874475f:S001:T004 — Planner wire schema: fallbacks, identity and cache

Assemble the per-call wire schema from PLAN_TASK_SCHEMA and the effective catalog, without $id. Fall back to a whole-params JSON-string slot for a template with no inputSchema, with $ref/$defs/definitions/$id/$anchor, with a union/conditional/multi-type keyword other than the root anyOf-of-required, or whose branch fails a trial compile under the wire validators' dialects. Build each catalog's schema once, keyed by a SHA-256 fingerprint of its templates' ids, revisions and inputSchemas.

**Acceptance checks:**
- Each fallback condition yields a whole-params slot, and no built-in template falls back
- Repeated and recursive builds compile through validateAgainstSchema and validateCodexReply without an id collision
- Catalogs that share template ids but differ in schema get different wire schemas
- The codex strict copy of the built-in wire schema for every target has no open object

### 1.5 E202610249874475f:S001:T005 — runPlanner sends the wire schema and decodes the reply

runPlanner sends the t4 wire schema for its effective catalog. After the reply, for each task, it parses the JSON strings at its template's recorded slot paths back into objects (a parse failure is reported through the existing planner failure path) and removes nulls on non-nullable keys, then runs INV-5 as today.

**Acceptance checks:**
- A supplied template's scopeRef {kind:'repo', value:'/r'} round-trips through a slot into INV-5 unchanged
- Supplied templates with no inputSchema, with local $ref/definitions, with a union of open object and string (native 'hello' and '{"x":1}'), and with a draft-07 tuple ({pair:['x',7]}) each round-trip as a whole-params slot and pass INV-5 as today
- Null params, including nested ones, are removed before INV-5
- The adherence one-of-three rule still fails a task with none of the three
- Invalid JSON in a slot is reported, and nothing partial reaches INV-5

### 1.6 E202610249874475f:S001:T006 — Planner messages show the wire form

Amend the planner system prompt's params rule (the slot exception with the aggregator example, and nulls mean absent); print the call's wire schema as the output shape; list each template's slot paths in the rendered catalog; re-encode the echoed rejected plan and the offending-task snippet to wire form on correction retries.

**Acceptance checks:**
- The output-shape block is the call's wire schema, not PLAN_TASK_SCHEMA
- The catalog lists each template's slot paths and marks whole-params slots
- A correction retry echoes the rejected plan in wire form
- The prompt names the slot exception with the aggregator example

### 1.7 E202610249874475f:S001:T007 — Live codex check and the recorded refusals

Add the live test (INSRC_LIVE_TESTS=1) that sends the complete DECOMPOSE_SCHEMA and each built-in target's planner wire schema to codex and checks the reply passes, then run it. Record the refused schemas left out of scope (workflow step and tracker schemas) in the evidence and on ISSUE-7d346e0dcbafc70e.

**Acceptance checks:**
- Live: codex accepts the complete DECOMPOSE_SCHEMA and every built-in planner wire schema, and the replies pass the reply check
- The out-of-scope refused schemas are recorded with their probe results

### 1.8 E202610249874475f:S001:T008 — Full sweep and daemon rollout

Run the full test sweep once, rebuild and restart the installed daemon, and confirm a one-shot insrc_analyze on the codex tier returns a plan.

**Acceptance checks:**
- Full sweep passes, with any pre-existing failures named
- A one-shot insrc_analyze on the rebuilt daemon's codex tier returns a plan

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| DECOMPOSE_SCHEMA | `t2`, `t7` |
| Planner wire schema (per call) | `t3`, `t4`, `t7` |
| codexStrictSchema | `t2`, `t4` |
| Exploration params table | `t1` |
| decompose | `t2` |
| finalizeDecompose | `t2` |
| one-shot analysis driver fallback | `t2` |
| runPlanner | `t5`, `t6` |
| PLANNED_TASK_SCHEMA.params | `t5` |
| Planner messages | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 dataModelChanges Exploration params table`
- **[[c2]]** `prior-artifact` `LLD S001 contractDetails.api DECOMPOSE_SCHEMA`
- **[[c3]]** `prior-artifact` `LLD S001 contractDetails.api decompose (shared params step with finalizeDecompose)`
- **[[c4]]** `prior-artifact` `LLD S001 dataModelChanges Decomposer prompt`
- **[[c5]]** `prior-artifact` `LLD S001 dataModelChanges Planner wire schema (per call)`
- **[[c6]]** `prior-artifact` `LLD S001 contractDetails.api runPlanner`
- **[[c7]]** `prior-artifact` `LLD S001 dataModelChanges Plan params after the reply`
- **[[c8]]** `prior-artifact` `LLD S001 dataModelChanges Planner messages`
- **[[c9]]** `prior-artifact` `LLD S001 testStrategy live level (complete DECOMPOSE_SCHEMA and planner wire schema on codex)`
- **[[c10]]** `prior-artifact` `LLD S001 migration (full sweep, rebuild and restart the daemon, one-shot insrc_analyze on codex)`
- **[[c11]]** `prior-artifact` `LLD S001 openQuestions (scope: refused non-analyzer schemas recorded for ISSUE-7d346e0dcbafc70e)`
