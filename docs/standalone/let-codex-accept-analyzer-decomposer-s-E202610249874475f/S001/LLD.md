<!-- insrc:artifact LLD-9874475f902756f6-S001 -->

# LLD: E202610249874475f:S001

## Summary

**Epic:** `let-codex-accept-analyzer-decomposer-s`
**HLD base run:** `wf-1792845934467-09830t`
**HLD effective hash:** `9874475f9027...`

This fix lets the two analyzer calls that ask a model for a plan (the exploration decomposer and the task planner) run on codex, which today refuses both of their schemas. The decomposer's schema now lists each exploration type's params, and the planner sends, per call, a schema listing the params of each template in the catalog it is using. Codex's strict grammar can express both. Optional params may be null, and both decomposer entry points and the planner remove those nulls before the plan is used. Every provider gets the same schemas, runners and plan validation see exactly today's params, and nothing changes for callers. Acceptance criteria (from the ISSUE's fix intent): ac1, codex accepts both schemas (strict-form regression plus a live test); ac2, every provider gets the same plans and validation as today (documented and empty params, placeholders, supplied catalogs incl. open objects, INV-5 unchanged); ac3, a mismatched type/params pair cannot reach execution, and every exploration type and catalog template has its params branch.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `DECOMPOSE_SCHEMA`

```typescript
export const DECOMPOSE_SCHEMA: StructuredSchema  // explorations[].params: { anyOf: ExplorationParamsSchema[] } (one closed object per exploration type) instead of { type:'object', additionalProperties:true }
```

**Returns:** `StructuredSchema` — The decomposer's output schema. Each exploration's params is an anyOf with one branch per exploration type (one per EXPLORATION_TYPES entry, 20 today). Each branch is a closed object listing that type's params, none of them required and each typed T | null, so the documented empty-params case (the prompt: 'leave the exploration's params empty and add a note in purpose') stays valid. Every param also accepts a `$eN.<accessor>` placeholder string, since the executor resolves placeholders before dispatch. Codex accepted a two-type prototype of this shape (probed live 2026-10-24; evidence nullable-anyof-proto.md); acceptance of the complete schema is established by the planned live test.

**Postconditions:**
- codexStrictSchema(DECOMPOSE_SCHEMA) contains no object node without properties and no object whose additionalProperties is not false
- Every exploration type in EXPLORATION_TYPES has exactly one params branch
- A plan that was valid before (a known type with its documented params, or empty params) is still valid

### 2.2 `decompose`

```typescript
decompose(args: DecomposeArgs): Promise<ExplorationPlan>  // signature unchanged
```

**Parameters:**
- `args: DecomposeArgs` — Unchanged.

**Returns:** `Promise<ExplorationPlan>` — Unchanged shape. decompose and finalizeDecompose (the plan phase of the multi-turn insrc_analyze_step, src/analyze/context/decomposer.ts:266) share one params step, run before topology validation: each exploration's null-valued params are removed, and its remaining keys are checked against its own type's declared params, so neither entry point accepts another type's keys. Requiredness is not checked here: a missing required param still fails only that exploration at its runner, recorded by the executor as today.

**Errors:**
- `DecomposerSchemaUnrecoverable (existing classified error path)` when an exploration's params, after nulls are removed, carry a key its own type does not declare (wrong-type pairing), at either entry point

**Postconditions:**
- The plan handed to the executor carries no null param values, from decompose and from finalizeDecompose alike
- On codex, a decompose call no longer fails with invalid_json_schema
- For Ollama and claude, a plan that omits optional params is unchanged

### 2.3 `PLANNED_TASK_SCHEMA`

```typescript
export const PLANNED_TASK_SCHEMA  // unchanged: params stays { type:'object' } for validation; the schema SENT to the provider is derived per call (see runPlanner)
```

**Returns:** `JSON Schema` — Unchanged. It stays the planner's validation schema (with INV-5 checking each task's params against its template's full inputSchema). It is no longer what runPlanner sends to the provider: that wire schema is derived per call from the effective catalog (see runPlanner).

**Postconditions:**
- Validation of a returned plan is unchanged

### 2.4 `PLAN_TASK_SCHEMA`

```typescript
export const PLAN_TASK_SCHEMA  // unchanged; remains the planner's validation schema
```

**Returns:** `JSON Schema` — Unchanged: the planner's validation schema. runPlanner sends a wire schema derived from it per call, in which tasks[].params is an anyOf over the call's effective catalog.

**Postconditions:**
- Byte-identical; the codex-facing change is in the per-call wire schema

### 2.5 `runPlanner`

```typescript
runPlanner(args: RunPlannerArgs): Promise<PlanTask>  // signature unchanged
```

**Parameters:**
- `args: RunPlannerArgs` — Unchanged: the planner input (intent, context bundle, parent task path, catalog) and options.

**Returns:** `Promise<PlanTask>` — Unchanged. runPlanner sends a WIRE schema derived from PLAN_TASK_SCHEMA for its EFFECTIVE catalog (the catalog the caller supplied, PlanBuilderInput.catalog, when non-empty, otherwise getTemplatesForTarget(intent.target), as selected today at src/analyze/planner/driver.ts:161). In it, tasks[].params is an anyOf with one branch per effective template. (a) A template WITH an inputSchema gets its wire form: every object the inputSchema closes (additionalProperties:false) keeps its structure, with optional properties nullable and not required; every object it leaves open (no declared properties, or additionalProperties not false) becomes a string slot holding that object's JSON. A slot is used only where the original schema admits nothing but an object at that position, so a string there can only mean encoded JSON and decoding is unambiguous; and a root anyOf-of-required (the adherence one-of-three) is left out of the branch. (b) A template WITHOUT an inputSchema (allowed by AnalyzeTaskTemplate, src/shared/analyze-types.ts:119, and skipped by INV-5), and a template whose inputSchema anywhere uses a reference or identity keyword ($ref, $defs, definitions, $id, $anchor), whose pointers would resolve against the plan root once embedded, or a union or conditional keyword or multi-type value (anyOf, oneOf, allOf, not, if/then/else, type: [..]) anywhere other than the root anyOf-of-required (where a string might be a legitimate value or an encoded object), or whose derived branch fails a trial compile in the wire validators' own dialects (the codex reply check's Ajv 2020 on the codexStrictSchema copy, and validateAgainstSchema's Ajv) — this catches draft-specific forms such as tuple items: [..] that INV-5's draft-07 Ajv accepts, without enumerating them, gets a branch in which the whole params is one JSON-string slot: round-tripped losslessly, with INV-5 still validating it against the template's original root inputSchema. No built-in template uses these keywords. Identity: the wire schema carries no $id (PLAN_TASK_SCHEMA's fixed $id would collide in the singleton Ajv registries of validateAgainstSchema and validateCodexReply on the second compile), and it is built once per distinct effective catalog and reused, keyed by a fingerprint (SHA-256 of the canonical JSON) of the catalog's templates' ids, revisions and inputSchemas, so two catalogs that share template ids but differ in any schema get different wire schemas and slot paths, so each catalog's validator compiles once per process, as the compile cache expects (src/agent/providers/structured-output.ts:79). Messages: the initial output-shape block prints this call's wire schema instead of PLAN_TASK_SCHEMA; the catalog keeps rendering each template's original inputSchema and adds, per template, the list of paths sent as JSON strings; and the system prompt states the encoding explicitly, distinguishing the emitted wire value from the decoded object: in a slot, the emitted value is the JSON text of the object (e.g. an aggregator task, whose whole params is a slot, emits "params": "{}"); everywhere else params is an object; an optional value may be null, meaning absent. The prompt's HARD 'params is an object literal' rule is amended to name the slot exception. On a correction retry, the rejected plan echoed as the assistant turn and the offending-task snippet are re-encoded to the wire form, so the retry example matches what the model must emit. After the reply, for each task (its template field names the branch), the JSON strings at the recorded slot paths are parsed back into objects and null values on non-nullable keys are removed; then the existing validation (INV-5, against the same effective catalog's full inputSchemas, still skipping templates without one) runs as today.

**Errors:**
- `existing plan-builder-schema-unrecoverable / invariant errors` when a task's params, after decoding and null removal, fail its template's inputSchema (unchanged behaviour), or a JSON-encoded open object is not valid JSON

**Postconditions:**
- The planner no longer fails on codex with invalid_json_schema
- A caller-supplied template, including one without an inputSchema or with open/dictionary-like objects (e.g. scopeRef {kind, value}), is expressible in the wire schema, round-trips losslessly, and is validated by INV-5 exactly as today
- A supplied template whose inputSchema uses local references round-trips as a whole-params slot and is validated by INV-5 against its original root schema
- A native string at a union position (e.g. value: anyOf[open object, string] given 'hello' or '{"x":1}') is never decoded: such a template is a whole-params slot, so the value round-trips exactly
- A supplied template whose branch would not compile in the wire validators' dialects (e.g. tuple items: [{type:'string'},{type:'integer'}]) falls back to a whole-params slot, and {pair:['x',7]} round-trips and is validated by INV-5 against the original schema as today
- A cached wire schema is reused only for a catalog with the same ids, revisions and inputSchemas
- Repeated and recursive runPlanner calls, with the same or different catalogs, compile their wire schemas without an id collision
- The prompt, the output-shape block and every correction retry describe and show the wire form the model must emit
- Every template rule (including the adherence one-of-three) is still enforced by INV-5

### 2.6 `codexStrictSchema`

```typescript
codexStrictSchema(schema: StructuredSchema): StructuredSchema  // unchanged; consumed
```

**Parameters:**
- `schema: StructuredSchema` — Unchanged.

**Returns:** `StructuredSchema` — Unchanged: the strict copy codex is given. This Story does not change it; the general open-object and optional-field handling stays with ISSUE-7d346e0dcbafc70e.

**Postconditions:**
- Byte-identical output for every schema other than the two reshaped here

## 3. Data model changes

### 3.1 `Exploration params table` — new

One params schema per exploration type (20 entries keyed by EXPLORATION_TYPES), holding each type's param names, value types and which are required, as documented in src/prompts/analyze/decompose.system.md and read by the runners (about 35 keys in total; class.hierarchy and usage.example take symbolName or entityId; db.connections.list takes none). Each value schema also admits a `$eN...` placeholder string, and each optional param admits null. DECOMPOSE_SCHEMA's params anyOf is built from it, and decompose's post-reply pairing check reads it. It lives beside the explorations it describes (src/analyze/explore/).

```
explorations[].params: {type:'object', additionalProperties:true} -> {anyOf:[{type:'object', additionalProperties:false, required:[<required keys>], properties:{<key>: <type|placeholder|null>}} x 20]}
```

**Call sites:**
- `src/analyze/context/decomposer.ts:125`
- `src/analyze/context/decomposer.ts:142`
- `src/analyze/explore/executor.ts`
- `src/analyze/explore/types.ts:97`

### 3.2 `Planner wire schema (per call)` — new

Derived from PLAN_TASK_SCHEMA and an effective catalog (the supplied catalog, else the target's registered templates), without $id, built once per distinct catalog and reused, keyed by a SHA-256 fingerprint of the canonical JSON of the templates' ids, revisions and inputSchemas. tasks[].params becomes an anyOf with one branch per template: closed objects stay structural (optional properties nullable), open objects become JSON-string slots at recorded paths, and the root anyOf-of-required is dropped from the branch. Slots are used only at positions the original schema restricts to an object. A template with no inputSchema, or whose inputSchema uses $ref/$defs/definitions/$id/$anchor or any union/conditional/multi-type keyword other than the root anyOf-of-required, or whose derived branch fails a trial compile under the wire validators' dialects (Ajv 2020 on the codex strict copy, and validateAgainstSchema's Ajv), is a single whole-params JSON-string slot. The trial compile is the general guard; the keyword rules make the common cases explicit. Of the 27 built-in templates none falls back to whole-params; 9 have slots (the 5 aggregators' empty root input, the 3 adherence constraints[] items, docs.subrun.deep-dive upstreamContext). PLAN_TASK_SCHEMA, PLANNED_TASK_SCHEMA and each template's full inputSchema are unchanged and remain the validation source (INV-5).

```
sent schema: tasks[].params {type:'object'} -> {anyOf:[<wire form of template.inputSchema: closed objects structural, open objects as JSON strings> for each template in the effective catalog]}
```

**Call sites:**
- `src/analyze/planner/driver.ts:161`
- `src/analyze/planner/driver.ts:352`
- `src/analyze/planner/schema.ts`
- `src/analyze/planner/validate.ts:257`
- `src/agent/providers/structured-output.ts:79`
- `src/shared/analyze-types.ts:119`

### 3.3 `Plan params after the reply` — invariant-change

Decomposer (decompose and finalizeDecompose, one shared step): a null param value is removed; nothing else is rewritten. Planner (runPlanner, per task): JSON strings at the recorded open-object paths of the task's template are parsed back into objects, then null values on keys whose own schema does not permit null are removed, including inside nested declared objects.

**Call sites:**
- `src/analyze/context/decomposer.ts:195`
- `src/analyze/context/decomposer.ts:266`
- `src/analyze/planner/driver.ts`

### 3.4 `Planner messages` — field-modify

The planner system prompt's HARD params rule (src/prompts/analyze/planner.system.md:45, 'params is an object literal ... never null') is amended to distinguish wire values from decoded objects: params is an object except where it, or a value inside it, is a JSON-string slot, whose emitted value is the JSON text of the object (example: an aggregator task emits "params": "{}"); an optional value may be null, meaning absent. buildInitialMessages prints the call's wire schema as the OUTPUT SHAPE (src/analyze/planner/driver.ts:352). renderCatalog keeps each template's original inputSchema and lists its slot paths, noting a whole-params slot. appendCorrectionTurn and the offending-task snippet echo the rejected plan in wire form.

**Call sites:**
- `src/prompts/analyze/planner.system.md:45`
- `src/analyze/planner/driver.ts:322`
- `src/analyze/planner/driver.ts:364`
- `src/analyze/planner/render-catalog.ts:30`

### 3.5 `Decomposer prompt` — field-modify

src/prompts/analyze/decompose.system.md gains one line: an optional param may be given as null, meaning absent (the codex strict copy requires every listed key). The output shape the decomposer is held to is DECOMPOSE_SCHEMA itself, which has no $id.

**Call sites:**
- `src/prompts/analyze/decompose.system.md`

## 4. Error paths

**Error cases**

- **A model gives an exploration keys that its type does not declare (e.g. another type's params; the anyOf is not bound to the sibling type field)** (recoverable)
  - Detection: After the reply and the null removal, the shared params step (in decompose and finalizeDecompose) compares each exploration's remaining keys with its own type's declared params and finds an undeclared key.
  - Response: decompose throws DecomposerSchemaUnrecoverable naming the exploration id, its type and the failing params (classifyError, src/analyze/context/decomposer.ts:390). In the one-shot analysis, the driver keeps today's behaviour for that error: it logs 'decomposer failed; using freeform.probe fallback' and runs the fallback plan instead (src/analyze/context/driver.ts:1460). The mismatched plan itself is never executed. In the multi-turn plan phase, finalizeDecompose throws the same error back to the controller, as it does today for a schema failure.
  - User impact: Nothing from the invalid plan runs. A one-shot analysis degrades to the freeform.probe fallback, as for any decomposer schema failure today, and the controller path reports the precise error.
- **An exploration arrives with a required param missing, including the documented empty-params case** (recoverable)
  - Detection: Not detected before execution: the schema requires no param. The runner throws its missing-param error, and the executor records a failed output for that exploration (src/analyze/explore/executor.ts) and continues with the others.
  - Response: Unchanged: per-exploration failure.
  - User impact: None new: identical to today.
- **A planner task's JSON-encoded open object is not valid JSON** (recoverable)
  - Detection: runPlanner's decode step fails to parse the string at a recorded open-object path of the task's template.
  - Response: Reported through the existing plan-builder schema/invariant failure for that task, with the path and the parse error.
  - User impact: The planner's existing failure handling applies; no partial object reaches INV-5.
- **A planner task's params, after nulls are removed, break its template's full inputSchema (e.g. an adherence check with none of constraintTopic, constraints or constraintIds)** (recoverable)
  - Detection: The existing invariant validation INV-5 (src/analyze/planner/validate.ts:247) validates params against the template's own inputSchema, which still holds the one-of-three rule the closed branch leaves out.
  - Response: Unchanged: the planner's existing invariant failure and retry handling.
  - User impact: None new: the same rule is enforced at the same place as today.
- **A new exploration type or planner template is added without a params entry** (recoverable)
  - Detection: A unit test asserts that every EXPLORATION_TYPES entry has exactly one params branch, and that the planner branch set matches the registered template catalog; the strict-copy scan test asserts that no open object remains.
  - Response: The build fails at test time, before a codex call can be refused.
  - User impact: None at runtime.
- **Codex still refuses a reshaped schema (an unprobed keyword combination)** (recoverable)
  - Detection: The live test (INSRC_LIVE_TESTS=1) sends both reshaped schemas to codex and fails on invalid_json_schema; in production the decomposer's existing error path reports the refusal.
  - Response: The analysis fails as it does today; the test pins the regression.
  - User impact: Same as today's failure, but caught before release.
- **Two wire schemas for different catalogs, or the same one built twice, are compiled in one process** (recoverable)
  - Detection: Prevented by construction: a wire schema has no $id, and a catalog's schema object is reused, so neither singleton Ajv sees a duplicate id; a test compiles several, through validateAgainstSchema and validateCodexReply.
  - Response: None needed at runtime.
  - User impact: Repeated and recursive planner calls do not fail local reply validation.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An exploration whose param is a `$eN.<accessor>` placeholder string where the type expects an array (e.g. names: "$e2.profile.exports[0..2]") | Valid: every param's value schema admits a placeholder string, and the executor resolves it before dispatch as today. |
| db.connections.list with params {} | Valid: its branch is a closed object with no properties, which codex accepts as an object with an empty properties map. |
| class.hierarchy or usage.example given entityId instead of symbolName | Valid: both keys are optional in the branch (each nullable), and the runner keeps its own either-or check. |
| A codex reply with every optional param null | After null removal the params hold only the required keys, which is identical to a claude or Ollama plan that omitted them. |
| An optional param whose own schema permits null | None exist today; the removal only drops nulls on keys whose own schema does not permit null, so such a null would be kept. |
| The multi-turn insrc_analyze_step plan phase, where the controller emits the plan | Validated against the same DECOMPOSE_SCHEMA (src/daemon/steps/analyze-step/phases/plan.ts). A controller plan that omits optional params is valid, as before. |
| A planner template whose inputSchema has additionalProperties:true objects (aggregators, adherence constraints items, docs.subrun.deep-dive upstreamContext) | Each open object is sent as a JSON-string slot and parsed back after the reply, so every key it carries reaches INV-5 and the runtime, as today. Closed objects keep their structure. |
| runPlanner given a non-empty supplied catalog containing a template that is not registered (e.g. one whose input requires customValue) | Its branch is in the wire schema, so codex can express {customValue: ...}; INV-5 validates it against that template's full inputSchema, as today. |
| A supplied template whose inputSchema has scopeRef: {type:'object'} (a dictionary read as kind/value by readScopeRef) | scopeRef is sent as a JSON string, codex emits '{"kind":"repo","value":"/r"}', and runPlanner decodes it back to {kind:'repo', value:'/r'} before INV-5; an empty-object collapse cannot happen. |
| An exploration with empty params, as the decomposer prompt documents when a param cannot be expressed | Valid against DECOMPOSE_SCHEMA (no param is required). The runner fails that exploration as today; the other explorations run. |
| A supplied template with no inputSchema | Its branch is one whole-params JSON-string slot; codex emits the params as JSON text, runPlanner parses it back to the object, and INV-5 skips the template as today. |
| A correction retry after INV-5 rejects a task whose template has JSON-string slots | The echoed assistant plan and the offending-task snippet show those values re-encoded as JSON strings, matching the wire schema the retry is held to. |
| A supplied template whose inputSchema uses customValue: {$ref:'#/definitions/Value'} with definitions.Value {type:'string'} | Its branch is a whole-params JSON-string slot (no reference is embedded, so codexStrictSchema finds no dangling ref); the params is decoded and INV-5 validates it against the template's own root schema, where the reference resolves as today. |
| Two supplied catalogs that both contain custom.template, one with customValue: string and the other with customValue: integer | Their fingerprints differ, so each call gets its own wire schema and slot paths; {customValue: 7} is valid only in the second, matching INV-5 for each. |
| A supplied template whose value property is anyOf [{type:'object', additionalProperties:true}, {type:'string'}], given value 'hello' or '{"x":1}' (a native string) | The union makes the template a whole-params slot, so the model emits the whole params as JSON text and the native string comes back exactly as given; nothing is parsed at the union position. |
| A built-in aggregator task (inputSchema properties:{} with additionalProperties:true) | Its whole params is a slot: the model emits "params": "{}" (or the JSON of any keys it sets), which decodes to the object INV-5 and the runtime see today; the prompt and catalog say so. |
| A supplied closed template with pair: {type:'array', items:[{type:'string'},{type:'integer'}]} (a draft-07 tuple) | Its branch fails the Ajv 2020 trial compile, so the template becomes a whole-params slot; {pair:['x',7]} round-trips as JSON text and INV-5 accepts it against the original draft-07 schema, as today. |

**Invariants to preserve**

- Runners keep receiving params as an untyped record with today's keys and values; placeholder substitution in the executor is unchanged. [[c5]]
- codexStrictSchema and its output for every other schema are unchanged; the general strict-copy normalisation stays with ISSUE-7d346e0dcbafc70e. [[c2]]
- decompose keeps its single structured call and its classified error path; the one-shot driver's freeform.probe fallback on DecomposerSchemaUnrecoverable is unchanged. [[c3]]
- Planner tasks are still validated against each template's full inputSchema (INV-5), including the adherence one-of-three rule. [[c10]]
- Every provider receives the same schema; a plan valid under today's documented params stays valid. [[c1]]
- runPlanner's catalog selection (supplied catalog, else the target's registered templates) is unchanged, and both the wire schema and INV-5 use that same effective catalog. [[c15]]
- INV-5 keeps skipping templates without an inputSchema, and each compiled schema object is reused (the compile cache is keyed by object). [[c21]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test), assert/strict; fake codex binaries as in src/agent/providers/__tests__/cli-codex-strict-schema.test.ts; live codex suites gated on INSRC_LIVE_TESTS=1`

**Test levels**

- **unit** — Strict-form regression: the codex strict copy of DECOMPOSE_SCHEMA, and of the planner wire schema for each built-in target's catalog, contains no object without properties and no object whose additionalProperties is not false (the two rules codex enforces).
  - Subjects: `DECOMPOSE_SCHEMA`, `Planner wire schema (per call)`, `codexStrictSchema`
- **unit** — Coverage: every EXPLORATION_TYPES entry (derived, not a hard-coded count) has exactly one params branch, and the planner wire schema has exactly one branch per template of its effective catalog.
  - Subjects: `Exploration params table`, `Planner wire schema (per call)`
- **unit** — Same plan as today: each documented params example in src/prompts/analyze/decompose.system.md, a params value that is a `$eN` placeholder string where an array is expected, and empty params for any type validate against DECOMPOSE_SCHEMA; a plan omitting optional params validates for non-codex providers.
  - Subjects: `DECOMPOSE_SCHEMA`
- **unit** — Null removal and pairing at both entry points: decompose and finalizeDecompose drop null params, so the executor sees today's params; a plan whose exploration carries a key its type does not declare fails with DecomposerSchemaUnrecoverable at both, and in the one-shot driver that failure takes the freeform.probe fallback without executing the plan; a plan with empty params for a type stays valid and fails only that exploration at its runner.
  - Subjects: `decompose`, `finalizeDecompose`, `one-shot analysis driver fallback`
  - Fixtures: `fake provider returning a plan with null optionals`, `fake provider returning a mismatched type/params pair`, `a controller plan with a mismatched pair for finalizeDecompose`
- **unit** — Planner wire schema and decoding: runPlanner sends a schema whose params anyOf covers exactly its effective catalog (incl. a supplied unregistered template); open objects (e.g. a supplied scopeRef {type:'object'}) go out as JSON strings and come back as the same objects, so {scopeRef:{kind:'repo',value:'/r'}} reaches INV-5 intact; null params (incl. nested) are dropped before INV-5; the adherence one-of-three rule still fails a task with none of the three.
  - Subjects: `runPlanner`, `PLANNED_TASK_SCHEMA.params`
  - Fixtures: `fake provider capturing the sent schema`, `a supplied catalog with an unregistered template using scopeRef {type:'object'}`, `fake provider returning an adherence task with all three constraint sources null`
- **live** — Live codex accepts the strict copy of the complete DECOMPOSE_SCHEMA (all 20 types) and of the complete planner wire schema for each built-in target's catalog, and returns a plan that passes the reply check. This is what establishes complete-schema acceptance; the committed two-type prototype probe is supporting evidence only.
  - Subjects: `DECOMPOSE_SCHEMA`, `Planner wire schema (per call)`
  - Fixtures: `INSRC_LIVE_TESTS=1`, `installed codex CLI`
- **unit** — Planner identity, prompt and retry: repeated and recursive runPlanner calls with identical and different catalogs compile through validateAgainstSchema and validateCodexReply without an id collision; the output-shape block is the call's wire schema; the catalog lists each template's JSON-string slot paths; a correction retry echoes the rejected plan in wire form; a supplied template without an inputSchema round-trips its params. A supplied template with local $ref/definitions round-trips as a whole-params slot and is validated by INV-5 against its root schema; two supplied catalogs with the same template id but different inputSchemas get different wire schemas (no stale reuse). A supplied template with a union of open object and string round-trips native strings ('hello', '{"x":1}') unchanged via the whole-params fallback; the 27 built-in templates produce no whole-params fallback and exactly their 9 slot sets; the prompt names the slot exception with the aggregator example. A supplied template with a draft-07 tuple falls back to a whole-params slot via the trial compile; both the wire reply check and INV-5 accept {pair:['x',7]}.
  - Subjects: `runPlanner`, `Planner wire schema (per call)`, `Planner messages`
  - Fixtures: `two catalogs (built-in and supplied) for repeated calls`, `a supplied template without an inputSchema`, `a fake provider that fails INV-5 once, to drive a correction retry`, `a supplied template whose inputSchema uses #/definitions references`, `two supplied catalogs sharing a template id with different inputSchemas`, `a supplied template with value anyOf [open object, string]`, `a supplied template with tuple items`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `the codex strict copy of DECOMPOSE_SCHEMA and of the planner wire schema contains no object without properties and no object whose additionalProperties is not false`, `live: codex accepts the strict copy of DECOMPOSE_SCHEMA and of the planner wire schema and returns a plan that passes the reply check` |
| `ac2` | `every documented decomposer params example, a placeholder string where an array is expected, and empty params validate against DECOMPOSE_SCHEMA`, `decompose and finalizeDecompose remove null params, so the executor receives today's params, and empty params still fail only that exploration at its runner`, `runPlanner's wire schema covers its effective catalog, incl. a supplied template with an open scopeRef, which round-trips intact; null params are removed before INV-5; the adherence one-of-three rule still fails a task with none of the three`, `repeated and recursive planner calls with the same and different catalogs compile without an id collision; a supplied template without an inputSchema round-trips; the output shape and correction retries show the wire form`, `a supplied template with local references round-trips and is validated by INV-5 against its root schema; catalogs sharing a template id but differing in schema get different wire schemas`, `a native string at a union position round-trips unchanged; built-in templates keep their 9 slot sets with no whole-params fallback`, `a supplied template with a draft-07 tuple falls back to a whole-params slot and passes both the wire reply check and INV-5` |
| `ac3` | `a plan whose exploration carries a key its type does not declare fails with DecomposerSchemaUnrecoverable at decompose and at finalizeDecompose, and the one-shot driver then runs the freeform.probe fallback instead of the plan`, `every exploration type has exactly one params branch, and the planner wire schema has one branch per template of its effective catalog` |

## 6. Migration

**State before:** DECOMPOSE_SCHEMA declares explorations[].params as an open object (src/analyze/context/decomposer.ts:142), and PLANNED_TASK_SCHEMA declares params as {type:'object'} (src/analyze/planner/schema.ts). The codex strict copy passes both through (src/agent/providers/structured-output.ts:381), and live codex refuses both with invalid_json_schema. 113 of 113 decomposer calls failed in the 2026-10-16..24 survey. Runners read params untyped (src/analyze/explore/types.ts:97); the planner checks params against each template's inputSchema afterwards (INV-5).

**State after:** DECOMPOSE_SCHEMA declares params per exploration type as closed objects with nullable optionals, and runPlanner sends a per-call schema whose params cover its effective catalog the same way; live codex accepts both. Both plan entry points of the decomposer, and runPlanner, remove nulls on non-nullable keys before validation, so runners, INV-5 and the exploration cache see today's params. Other providers get the same schemas, and their plans are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the exploration params table (one entry per EXPLORATION_TYPES type, 20 today) beside the explorations, from the documented params and the runners' reads; no param is marked required in the schema. — ↩ rollbackable
2. Reshape DECOMPOSE_SCHEMA's params into the per-type anyOf; give decompose and finalizeDecompose one shared params step (remove null params, reject keys the exploration's type does not declare) before topology validation. — ↩ rollbackable
3. In runPlanner, build the wire schema once per effective catalog (no $id): tasks[].params as an anyOf over the catalog's templates in wire form (closed objects structural with nullable optionals; open objects, and the whole params of a template without inputSchema, as JSON-string slots at recorded paths). Print it as the output shape, list slot paths in the catalog, amend the system prompt's params rule, and re-encode the echoed plan on correction retries. After the reply, decode the slots and remove nulls before INV-5. PLAN_TASK_SCHEMA and PLANNED_TASK_SCHEMA stay unchanged. — ↩ rollbackable
4. Add the strict-form regression tests and the live codex test; record the remaining refused schemas (workflow step and tracker schemas, reachable only through workflow.run) in the evidence and on ISSUE-7d346e0dcbafc70e. — ↩ rollbackable
5. Rebuild and restart the installed daemon, then confirm a one-shot insrc_analyze on the codex tier returns a plan. — ↩ rollbackable

**Backward compat:** No public API change: decompose, finalizeDecompose and runPlanner keep their signatures and outputs; PLAN_TASK_SCHEMA and PLANNED_TASK_SCHEMA are unchanged. Plans valid under today's documented params stay valid, and the multi-turn insrc_analyze_step controller plans still validate (they now also get the pairing check). A supplied planner catalog keeps working, including unregistered templates. Exploration cache keys are unchanged, because cached plans carry today's params, without nulls. Plans may no longer carry undeclared extra param keys, which no runtime reads.

## 7. Alternatives considered

### 7.1 a1: Per-type params schemas, nullable optionals, nulls dropped by the owner — **CHOSEN**

Declare each exploration type's (and each planner template's) params as a closed object with its real keys, optional keys nullable, under an anyOf keyed by type; the decomposer/planner drop null params after the reply.



### 7.2 a2: One flat closed params object (union of all keys, all nullable)

Replace the open params object with one closed object listing every param key any exploration type uses, each nullable; drop nulls after the reply.



**Rejected because:** Accepted by codex but weaker validation (partial on fi3: per-type requiredness is not in the schema, and cross-type key meanings are flattened) and a large mostly-null output per exploration.

### 7.3 a3: Params as a JSON-encoded string

Declare params as a string holding JSON; parse it and validate it per type after the reply.



**Rejected because:** Violates fi2 (changes the plan's wire shape for every provider and for the insrc_analyze_step controller path) and fi3 (the schema checks nothing inside params).

## 8. References

- **[[c1]]** `code` `src/analyze/context/decomposer.ts:142` — "params:  { type: 'object', additionalProperties: true },"
- **[[c2]]** `code` `src/agent/providers/structured-output.ts:381` — "const copy = processSchemaForOpenAIStrict(keepCodexKeywords(schema) as StructuredSchema);"
- **[[c3]]** `code` `src/analyze/context/decomposer.ts:195` — "if (errClass instanceof DecomposerLlmUnavailableError) throw errClass;"
- **[[c4]]** `code` `src/config/role-taxonomy.ts:86` — "{ id: 'analyze.decompose',             criticality: 'peripheral', defaultTier: 'mid'  },"
- **[[c5]]** `code` `src/analyze/explore/types.ts:97` — "readonly params:   Readonly<Record<string, unknown>>;"
- **[[c6]]** `code` `src/analyze/explore/executor.ts:158`
- **[[c7]]** `prior-artifact` `docs/standalone/stop-codex-review-calls-stalling-keep-E20261023697b9f8f/S001/evidence/call-type-survey.md:18` — "ERROR analyze: exploration decomposer: 113x"
- **[[c8]]** `prior-artifact` `ISSUE-7d346e0dcbafc70e`
- **[[c9]]** `prior-artifact` `docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610248d39ef09/evidence/open-object-probe.md`
- **[[c10]]** `code` `src/analyze/planner/validate.ts:247` — "// INV-5: params validate against template inputSchema"
- **[[c11]]** `code` `src/analyze/planner/schema.ts:55` — "params:   { type: 'object' },"
- **[[c12]]** `doc` `src/prompts/analyze/decompose.system.md:50`
- **[[c13]]** `code` `src/analyze/planner/driver.ts:144` — "export async function runPlanner(args: RunPlannerArgs): Promise<PlanTask> {"
- **[[c14]]** `prior-artifact` `ISSUE-8d39ef09031e75d3`
- **[[c15]]** `code` `src/analyze/planner/driver.ts:161` — "const catalog = catalogArg.length > 0"
- **[[c16]]** `code` `src/analyze/context/decomposer.ts:266` — "export function finalizeDecompose(raw: unknown): ExplorationPlan {"
- **[[c17]]** `code` `src/analyze/context/driver.ts:1460` — "plan = steps.fallbackFreeformPlan(intent, args.shaperId);"
- **[[c18]]** `prior-artifact` `docs/standalone/let-codex-accept-analyzer-decomposer-s-E202610248d39ef09/evidence/nullable-anyof-proto.md` — "prototype support only (two types); complete-schema acceptance is established by the live test"
- **[[c19]]** `doc` `src/prompts/analyze/decompose.system.md:166` — "leave the exploration's `params` empty and add a note in `purpose`"
- **[[c20]]** `code` `src/daemon/analyze-rpc.ts:503` — "const catalog = getTemplatesForTarget(intent.target);"
- **[[c21]]** `code` `src/analyze/planner/validate.ts:257` — "if (tmpl.inputSchema === undefined) continue; // no schema declared -> nothing to validate"
- **[[c22]]** `code` `src/prompts/analyze/planner.system.md:45` — "`params` is an object literal."
- **[[c23]]** `code` `src/agent/providers/structured-output.ts:79` — "ajv-compiled validators are cached on the singleton; the same schema"

## 9. Open questions

- Scope (user decision 2026-10-24, option 2): this Story fixes the analyzer schemas only. The other refused schemas are recorded, not fixed: frameworkWriteSchema, contractDetailSchema, the ER/UX definition schemas, trackerPushExecuteSchema, trackerSyncExecuteSchema and STUB_ARTIFACT_JSON_SCHEMA, which reach codex only through the daemon-driven workflow.run (src/daemon/workflow-rpc.ts:211), plus AGGREGATOR_OUTPUT_SCHEMA, a template runtime schema that is never sent to a model. They belong with ISSUE-7d346e0dcbafc70e's strict-copy work.
