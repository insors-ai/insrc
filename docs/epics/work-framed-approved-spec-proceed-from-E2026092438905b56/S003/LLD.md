<!-- insrc:artifact LLD-38905b56cb44c4cf-s3 -->

# LLD: E2026092438905b56:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**HLD base run:** `wf-1790248075351-dbqnsq`
**HLD effective hash:** `b8f0f1bf4237...`

## HLD context

**Framework:** On-demand controller guidance is delivered by two independent read-only surfaces, each reading its source of truth WHERE THAT SOURCE ALREADY LIVES, plus a steering restructure that shrinks the injected block and points at those surfaces. sc-schema (S001) is an MCP-server-side read-only tool that serves the exact input contract for a requested insrc_* tool (+phase) by slicing the tool's own registered zod inputSchema — the same object the MCP SDK validates against — so there is no copy (k1) and no round-trip. sc-guide (S002) is the daemon-IPC-first + thin-MCP-wrapper shape proven by docgen: a daemon-owned guide.get / guide.list IPC reads the canonical steering content inside the daemon and returns one workflow's section, fronted by a thin insrc_guide MCP tool. Both surfaces are per-task (k2), read-only (k5), and return structured non-throwing results with the valid options on error (k3). S003 then authors, in the canonical steering source, a thin skeleton (front-door decision tree + a catalog of the available insrc_* / IPC calls, the insrc_build_step doc, the schema-first rule, and an insrc_schema self-entry) and moves each workflow's full procedural detail into the per-workflow sections sc-guide serves — propagated to every registered repo by the existing steering-refresh (k4).
**Rollout phase:** Phase B — thin steering skeleton (consumer)
**Consumes:** `sc1` (insrc_schema shape-lookup surface), `sc2` (insrc_guide per-workflow retrieval surface (MCP tool + daemon guide IPC + section addressing))

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Private to S001: how the MCP server enumerates its own registered tools and derives a JSON Schema slice from a tool's registered zod inputSchema; the tool/phase classification (which tools are phase-based and their phase names — analyze_step/workflow_step/review_step/code_review_step/build_step/triage[start,classify]/workflow_run[start,poll] vs the one-shot workflow_approve/docgen/analyze); the dynamic-envelope rule (return the static envelope + a description pointer to the run's own inline schema for runtime-generated inner payloads); and the exact structured-error shaping for omitted/unknown tool and omitted phase. None of this internal wiring is consumed by another Story — only the sc1 result surface is. — owns `sc1`
- `s2`: Private to S002: how the daemon reads the canonical steering content it already loads and partitions it into per-workflow sections; the guide.get/guide.list IPC handlers on the daemon method map; the thin insrc_guide MCP wrapper that forwards to those IPCs; and the structured-error shaping for an omitted/unknown workflow. Only the sc2 surface (the MCP tool result + the section-addressing key set) is consumed downstream; the partition/read mechanism stays private. — owns `sc2`

## Contract details

**Surface level:** internal

### `stripGuideSections`

```typescript
export function stripGuideSections(steeringText: string): string
```

**Parameters:**
- `steeringText: string` — The full canonical steering content (skeleton + per-workflow guide-marker sections).

**Returns:** `string` — The skeleton: steeringText with every authored guide-marker section (start..end inclusive) removed, leftover blank runs collapsed, trimmed. Pure — no I/O.

**Errors:**
- `none thrown` when A text with no guide sections returns unchanged (idempotent); malformed/half-marked sections are left intact (only complete pairs from listWorkflowGuides are stripped).

**Preconditions:**
- Depends only on its argument; reuses sc2's PUBLIC listWorkflowGuides(text) to enumerate the authored keys and guideMarkerStart(key)/guideMarkerEnd(key) to bound each removed section.

**Postconditions:**
- The result contains NO complete guide-marker pair (the injected skeleton excludes per-workflow detail, ac1).
- Applying it twice yields the same result (idempotent).

### `injectSteeringBlock`

```typescript
export function injectSteeringBlock(repoRoot: string, selection: SteeringSelection): Promise<{ files: SteeringFileOutcome[] }>  // reshaped: the block source is stripGuideSections(readSteeringBlock()) instead of readSteeringBlock()
```

**Parameters:**
- `repoRoot: string` — The repo whose CLAUDE.md/AGENTS.md receive the steering block.
- `selection: SteeringSelection` — Which files to write (unchanged).

**Returns:** `Promise<{ files: SteeringFileOutcome[] }>` — Per-file upsert outcomes (unchanged shape); the injected block is now the skeleton only.

**Errors:**
- `none new` when The block-asset read still throws (caller guards); per-file I/O still recorded as skipped. Additive: only the block source is wrapped.

**Preconditions:**
- readSteeringBlock() returns the whole canonical file (unchanged); stripGuideSections derives the skeleton from it.

**Postconditions:**
- The upserted steering region contains the skeleton, not the per-workflow guide sections (ac1).
- readSteeringBlock is unchanged, so S002's guide.get still serves the full sections (no sc2 regression).

### `refreshSteeringAcrossRepos`

```typescript
export function refreshSteeringAcrossRepos(deps?: Partial<SteeringRefreshDeps>): Promise<SteeringRefreshReport>  // reshaped: the default readBlock is () => stripGuideSections(readSteeringBlock())
```

**Parameters:**
- `deps: Partial<SteeringRefreshDeps> | undefined` _(optional)_ — Injectable seams; only the DEFAULT readBlock changes (an explicit deps.readBlock override is still honoured verbatim).

**Returns:** `Promise<SteeringRefreshReport>` — Per-file refresh outcomes (unchanged shape); the re-stamped block is the skeleton only.

**Errors:**
- `none new` when readBlock/listRepos failures still propagate to the caller; per-file failures still recorded + walk continues.

**Preconditions:**
- The default readBlock composes stripGuideSections over readSteeringBlock; an injected deps.readBlock (tests) is used as-is.

**Postconditions:**
- Every registered repo that carries the markers is re-stamped with the skeleton (ac1, ac4).
- One canonical source; no per-repo hand-edit (ac4).

### `listWorkflowGuides`

```typescript
// CONSUMED from sc2 (src/daemon/guide-sections.ts): listWorkflowGuides(steeringText: string): string[]
```

**Parameters:**
- `steeringText: string` — The canonical steering content; stripGuideSections calls this to enumerate the authored guide keys to remove.

**Returns:** `string[]` — The workflow keys with a complete guide-marker pair — the set stripGuideSections removes.

**Errors:**
- `none` when Consumed as-is; S003 does not modify it.

**Preconditions:**
- sc2 shipped (S002).

**Postconditions:**
- Consumed read-only — S003 does not re-implement sc2's partition mechanism.

## Data model changes

### `src/prompts/steering-block.md (restructured: thin skeleton + per-workflow guide sections)` — field-modify

The canonical steering source is restructured: a COMPACT SKELETON (front-door decision tree mapping a controller's intent to the right tool/workflow; a CATALOG of all registered insrc_* tools + daemon IPC calls — one line each incl. insrc_build_step [previously zero coverage], insrc_schema, insrc_guide; the schema-first rule 'call insrc_schema before emitting a call whose shape you are unsure of'; the insrc_schema self-entry documenting its own call/response shape; and the pointer 'for a workflow's full step-by-step procedure call insrc_guide({workflow})') followed by the per-workflow DETAIL moved out of the current inline prose into sections wrapped in the sc2 guide-marker pairs guideMarkerStart(key)/guideMarkerEnd(key) for keys define/design.epic/design.story/plan/build/review/code-review/brainstorm/tracker/triage. Content-only; single canonical source (ac4).

```
~ steering-block.md: skeleton (catalog incl. insrc_build_step/insrc_schema/insrc_guide + schema-first rule + insrc_schema self-entry + insrc_guide pointer) + <!-- insrc:guide:<key>:start -->..<!-- insrc:guide:<key>:end --> per-workflow detail sections
```

**Call sites:**
- `src/prompts/steering-block.md`
- `src/daemon/steering-inject.ts (read + injected via stripGuideSections)`
- `src/daemon/guide-sections.ts (guide.get serves the marker sections)`

### `stripGuideSections (pure skeleton-extraction helper)` — new

A pure function in src/daemon/steering-inject.ts that removes every authored guide-marker section from the steering text, returning the skeleton. Built on sc2's PUBLIC listWorkflowGuides + guideMarkerStart/End — no new marker convention. Applied ONLY in the inject/refresh block-source path so the injected block is the skeleton while readSteeringBlock (guide.get) stays whole.

```
+ export function stripGuideSections(steeringText: string): string
```

**Call sites:**
- `src/daemon/steering-inject.ts (injectSteeringBlock + refreshSteeringAcrossRepos default readBlock)`

### `S002 Phase-A canary test (schema-registry.test.ts)` — field-modify

The S002 test asserting readWorkflowGuide returns null for every WorkflowKey in Phase A is flipped now that S003 authors real guide sections: it asserts each authored key now RESOLVES to non-empty guidance AND that stripGuideSections(steering) contains none of those sections (the injected skeleton excludes them).

```
~ schema-registry.test.ts: Phase-A null-for-every-key canary -> keys-resolve + skeleton-excludes-them
```

**Call sites:**
- `src/mcp/__tests__/schema-registry.test.ts`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | S003 CONSUMES sc1 (owned by s1) by NAME only: the skeleton's catalog lists insrc_schema, the schema-first rule instructs the controller to call insrc_schema before guessing a call's shape, and the insrc_schema self-entry documents its { tool, phase? } -> InsrcSchemaResult call/response so its own use never has to be guessed (ac3). No sc1 internals are touched or re-implemented. |
| `sc2` | consumes | S003 CONSUMES sc2 (owned by s2) two ways: (1) the authored per-workflow detail is written into sc2's guide-marker sections (guideMarkerStart/End) so insrc_guide serves it, and the skeleton directs controllers to insrc_guide({workflow}) for on-demand detail (ac2); (2) stripGuideSections reuses sc2's PUBLIC listWorkflowGuides + guideMarkerStart/End to derive the injected skeleton. S003 does not re-implement sc2's private partition/read mechanism — only its public surface is used. |

## Error paths

### Error cases

- **An authored guide section is malformed (a start marker with no matching end, or an inverted pair).** (recoverable)
  - Detection: stripGuideSections enumerates keys via sc2's listWorkflowGuides, which returns ONLY complete pairs; a half-marked/inverted section is not in that list, so it is not matched for removal.
  - Response: The malformed section is LEFT in the block and therefore remains visible in the injected skeleton rather than being silently dropped; a build-time authoring test asserts stripGuideSections(steering) contains no guide-start marker at all, so a half-marked section fails CI loudly.
  - User impact: An authoring mistake surfaces as leftover detail in the injected block (caught by the test), not as lost guidance.
- **A per-workflow section is authored under a key that is not one of the expected WorkflowKey values (typo, e.g. 'design_story' instead of 'design.story').** (recoverable)
  - Detection: listWorkflowGuides returns the section's key verbatim (spelling-driven); a test compares the authored key set against the expected WorkflowKey set from the HLD.
  - Response: stripGuideSections still removes it from the injected block (any complete pair is stripped), but the key-set test fails, flagging that guide.get would serve it only under the misspelled key.
  - User impact: A controller asking for the correctly-spelled workflow would get a not-found; the key-set test prevents shipping the typo.
- **The strip runs but leaves ragged blank-line runs where sections were removed, producing an ugly / ambiguous skeleton.** (recoverable)
  - Detection: stripGuideSections collapses consecutive blank lines and trims after removal; a unit test asserts no >2 consecutive newlines remain.
  - Response: The skeleton is normalized (blank runs collapsed) so the injected block reads cleanly.
  - User impact: The injected skeleton is tidy; no functional impact.

### Edge cases

| Input | Expected |
| :--- | :--- |
| steering-block.md BEFORE any guide sections are authored (or a build where they were removed). | listWorkflowGuides returns [] so stripGuideSections returns the text unchanged — the inject path behaves exactly as before S003 (backward-compatible; no accidental content loss). |
| A guide section whose body itself contains the literal insrc:steering markers or another key's guide markers. | stripGuideSections removes each key's section strictly by that key's OWN start/end markers (reusing sc2's exact-marker slicing), so nested/decoy marker-like text inside a body does not cause over- or under-removal. |
| refreshSteeringAcrossRepos re-run after S003 on a repo already carrying the new skeleton. | The stripped skeleton is byte-identical to what is already stamped, so refreshMarkedSection reports 'unchanged' and writes nothing (idempotent). |
| A test injects an explicit deps.readBlock into refreshSteeringAcrossRepos. | The injected readBlock is honoured verbatim (only the DEFAULT readBlock composes stripGuideSections), so existing steering-inject tests that inject a block are unaffected. |

### Invariants to preserve

- readSteeringBlock() stays unchanged (returns the WHOLE canonical steering-block.md), so S002's guide.get/readWorkflowGuide keep serving the full per-workflow sections — stripGuideSections is applied ONLY on the inject/refresh block-source path, never inside readSteeringBlock. [[c2]]
- The injected region stays bounded by the existing insrc:steering:start/end markers via upsertMarkedSection/refreshMarkedSection; stripGuideSections runs BEFORE the upsert so the steering region never contains guide-marker content. [[c2]]

## Test strategy

**Test framework:** `node:test via `npx tsx --test` (src/daemon/__tests__/ for stripGuideSections + the inject path, src/mcp/__tests__/ for the schema-registry canary flip — matching the S001/S002 tests).`

### Test levels

- **unit** — Prove the pure stripGuideSections over fixture text: skeleton retained, every complete guide section removed, malformed left intact, blank runs collapsed, idempotent, empty-safe.
  - Subjects: `stripGuideSections(text): removes every complete guide-marker section (start..end inclusive) so the result contains NO guide-start marker; the surrounding skeleton text is retained (ac1)`, `stripGuideSections leaves a malformed/half-marked section intact (only complete pairs from listWorkflowGuides are stripped) and collapses ragged blank runs (no >2 consecutive newlines)`, `stripGuideSections is idempotent (applying twice == once) and returns text with NO guide sections unchanged (empty-safe / backward-compatible)`
  - Fixtures: `A fixture steering string = skeleton + 2-3 complete guide sections + one half-marked section + a decoy inner marker`
- **unit** — Prove the inject/refresh block-source path injects the SKELETON while readSteeringBlock stays whole (no sc2 regression), over the existing steering-inject injected seams.
  - Subjects: `refreshSteeringAcrossRepos with the PRODUCTION default readBlock stamps a block that contains no guide-start marker (the skeleton) into a fixture repo file; readSteeringBlock (guide.get path) still returns the whole file incl. the guide sections`, `refreshSteeringAcrossRepos with an INJECTED deps.readBlock uses it verbatim (the default-only strip does not affect an explicit override) — existing steering-inject tests unaffected`
  - Fixtures: `The existing steering-inject injected seams (listRepos/readFile/writeFile/readBlock) + a fixture repo file`
- **integration** — Prove over the REAL shipped steering-block.md that the authored content is well-formed end-to-end: every expected workflow key resolves via the reader, and the injected skeleton excludes them + covers every registered tool.
  - Subjects: `readWorkflowGuide over the REAL steering asset returns non-empty guidance for EVERY expected WorkflowKey (define/design.epic/design.story/plan/build/review/code-review/brainstorm/tracker/triage) — the flipped S002 canary (ac2)`, `stripGuideSections(REAL steering) contains NO guide-start marker (the injected skeleton excludes per-workflow detail) AND is strictly shorter than the whole file (ac1)`, `the skeleton (stripGuideSections output) mentions every registered insrc_* tool incl. insrc_build_step, insrc_schema, insrc_guide + the schema-first rule text (ac3)`
  - Fixtures: `The real shipped src/prompts/steering-block.md + the registered tool-name set (EXPECTED_TOOLS)`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: stripGuideSections removes every complete guide section so the result has no guide-start marker (the injected skeleton excludes detail)`, `unit: refreshSteeringAcrossRepos default readBlock stamps a guide-marker-free skeleton`, `integration: stripGuideSections(REAL steering) has no guide-start marker and is strictly shorter than the whole file` |
| `ac2` | `integration: readWorkflowGuide over the REAL steering asset resolves non-empty guidance for every expected WorkflowKey (the skeleton's insrc_guide pointer has real sections to serve)` |
| `ac3` | `integration: the skeleton mentions every registered insrc_* tool incl. insrc_build_step / insrc_schema / insrc_guide and contains the schema-first rule + the insrc_schema self-entry` |
| `ac4` | `unit: refreshSteeringAcrossRepos re-stamps the single canonical skeleton into a fixture repo (one source, existing refresh) and is idempotent on a re-run (unchanged)`, `unit: readSteeringBlock stays whole (guide.get unaffected) — the strip is inject-path-only, so the single canonical source drives both surfaces` |

## Alternatives considered

### a1: Subtractive: strip guide sections from the injected block (reuse sc2's public surface) — **CHOSEN**

steering-block.md holds the skeleton + the per-workflow guide-marker sections; readSteeringBlock stays whole (for guide.get), and the inject path applies a pure stripGuideSections(block) so only the skeleton is injected.

Author steering-block.md as: (1) a compact SKELETON — the front-door decision tree + a catalog of ALL registered insrc_* tools / daemon IPC calls (each with a one-line purpose and 'call insrc_schema for its exact shape'), the insrc_build_step doc, the schema-first rule, the insrc_schema self-entry, and a pointer 'for a workflow's full step-by-step procedure call insrc_guide({workflow})'; followed by (2) the per-workflow DETAIL sections (the current classify->define/design/plan/build/review/code-review + workflow-authoring procedural prose) each wrapped in the sc2 guide-marker pair for its key. Add a pure stripGuideSections(text): string built on sc2's PUBLIC listWorkflowGuides(text) + guideMarkerStart(key)/guideMarkerEnd(key) that removes each authored guide section, returning the skeleton. Apply stripGuideSections in the block-source path of injectSteeringBlock + the refreshSteeringAcrossRepos default readBlock so the INJECTED block is the skeleton only (ac1); readSteeringBlock is unchanged, so guide.get still serves the full sections from the same canonical file (ac2, single-source ac4). Flip the S002 Phase-A canary test to assert the keys now resolve + the injected block excludes them.

### a2: Additive: an explicit skeleton-region marker injected instead of the whole file

Wrap the skeleton portion of steering-block.md in a new '<!-- insrc:skeleton:start/end -->' region; the inject path injects only that region, guide.get reads the guide sections.

Introduce a SECOND marker convention delimiting the skeleton: '<!-- insrc:skeleton:start -->' / ':end -->' around the front-door tree + catalog. The inject path extracts only the skeleton region (rather than the whole file) and injects it; guide.get keeps reading the guide-marker sections. steering-block.md = skeleton region + guide sections.

**Rejected because:** Functionally satisfies ac1-ac4 but is only partial on sc2 consumption: it introduces a second S003-specific skeleton-region marker convention overlapping sc2's guide markers, and positive delimiting is brittle (skeleton text authored outside the region silently never ships). a1 reaches the identical outcome by reusing sc2's existing public markers with no new convention — strictly simpler and safer.

### a3: No strip: author guide sections but inject the whole file unchanged

Move detail into guide-marker sections and add the catalog, but leave the inject path untouched so the whole file is injected.

Author the skeleton + guide sections in steering-block.md and rely on the existing refresh to inject the file as-is, with no strip step — the guide sections are simply also present in the injected block.

**Rejected because:** VIOLATES ac1 (the core acceptance): with no strip the injected block grows rather than shrinks, so the controller still carries every workflow's full detail (violates k2) and insrc_guide only duplicates injected content. Cheapest but defeats the epic's purpose.

## Citations

- **[[c1]]** `analyze-bundle` `s1 structural-map: steering-block.md structure (291 lines, 4 topic sections) + the zero-coverage tools (insrc_build_step/insrc_schema/insrc_guide) the catalog must add` — "steering-block.md is 291 lines with 4 ## topic sections; insrc_build_step = 0, insrc_schema = 0, insrc_guide = 0 coverage; the heavy per-workflow procedural detail moves into per-workflow guide sectio"
- **[[c2]]** `analyze-bundle` `s1 how-does-it-work: the injected block is sourced from readSteeringBlock (shared with S002's guide.get) so shrinking it requires stripping guide sections at INJECT time (src/daemon/steering-inject.ts)` — "injectSteeringBlock + refreshSteeringAcrossRepos source the block from readSteeringBlock(); S002's guide.get ALSO reads the whole file via readSteeringBlock, so readSteeringBlock CANNOT change — S003 "
- **[[c3]]** `prior-artifact` `HLD consumed contract sc1 (insrc_schema): the { tool, phase? } -> InsrcSchemaResult surface S003 references in the catalog + schema-first rule + self-entry` — "insrc_schema is the read-only shape-lookup S003 documents in the skeleton so a controller looks up a call's exact shape before emitting one (ac3)."
- **[[c4]]** `prior-artifact` `HLD consumed contract sc2 (insrc_guide) + its shipped public surface (guideMarkerStart/End, listWorkflowGuides) S003 authors detail into + strips by` — "sc2's per-workflow marker sections are where S003 authors the detail insrc_guide serves; stripGuideSections consumes sc2's public listWorkflowGuides + guideMarkerStart/End to derive the injected skele"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-24T12:53:17.575Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| c2 | citation | LOW | manual | injectSteeringBlock and refreshSteeringAcrossRepos both source the injected block from readSteeringBlock() in src/daemon/steering-inject.ts — the shared block source S003 wraps with stripGuideSections. | Confirmed: src/daemon/steering-inject.ts:198 `const block = readSteeringBlock()` inside injectSteeringBlock (186), and :247 `readBlock: readSteeringBlock` is the refreshSteeringAcrossRepos (272) default — both inject paths source the block from readSteeringBlock, the exact wrap point S003 uses. | No change — citation resolves. |
| c2 | cross-artifact | LOW | manual | S002's shipped guide.get / readWorkflowGuide also call readSteeringBlock() to read the WHOLE steering-block.md, so readSteeringBlock must stay unchanged (the strip is inject-path-only). | Confirmed cross-artifact: src/daemon/index.ts:1379/1383 the 'guide.get'/'guide.list' handlers call guideGetResult(readSteeringBlock,...) / guideListResult(readSteeringBlock) — so S002's guide surface reads the WHOLE file via readSteeringBlock; therefore readSteeringBlock must stay unchanged and the strip is correctly inject-path-only. | No change — the shared-reader constraint holds. |
| sc2 | citation | LOW | manual | sc2 (S002) exports the PUBLIC surface stripGuideSections consumes: listWorkflowGuides, guideMarkerStart, guideMarkerEnd in src/daemon/guide-sections.ts. | Confirmed: src/daemon/guide-sections.ts exports guideMarkerStart (43), guideMarkerEnd (46), listWorkflowGuides (75) — the exact sc2 PUBLIC surface stripGuideSections consumes (no re-implementation of sc2's private mechanism). | No change — citation resolves. |
| c2 | citation | LOW | manual | The injected region is bounded by the existing insrc:steering:start/end markers via upsertMarkedSection / refreshMarkedSection in steering-inject.ts. | Confirmed: src/daemon/steering-inject.ts:41 STEERING_MARKER_START, :91 upsertMarkedSection, :142 refreshMarkedSection — the injected region stays bounded by the insrc:steering markers, and the strip runs before the upsert. | No change — citation resolves. |
| c1 | citation | LOW | manual | insrc_build_step, insrc_schema, and insrc_guide currently have zero coverage in the canonical steering source src/prompts/steering-block.md (the catalog gap S003 fills). | Confirmed: grep over src/prompts/steering-block.md returns 0 for insrc_build_step, insrc_schema, insrc_guide — the zero-coverage catalog gap the skeleton must fill (ac3). | No change — the coverage-gap claim resolves. |
| dataModel | closed-union | LOW | manual | stripGuideSections is net-new — no such symbol exists in the codebase yet. | Confirmed net-new: no stripGuideSections symbol exists anywhere in src/ (every match is in the epic's own docs). The helper is new work in steering-inject.ts. | No change — net-new claim resolves. |
| test | cross-artifact | LOW | manual | The S002 Phase-A canary test exists in schema-registry.test.ts asserting readWorkflowGuide returns null for every WorkflowKey — the test S003 flips. | Confirmed: src/mcp/__tests__/schema-registry.test.ts:113 PHASE_A_WORKFLOW_KEYS + :118 the canary test 'readWorkflowGuide over the REAL steering asset returns null for every key in Phase A' — the exact S002 test S003 flips once real guide sections are authored. | No change — the test-flip target resolves. |
| boundary | ordering | LOW | manual | S003 depends on sc1 (s1) and sc2 (s2), both of which are shipped (Phase A complete) before S003 (Phase B). | Ordering holds: the DEF frames s3 dependsOn [s1,s2]; both Phase-A stories are shipped (S001 main 025c6f4, S002 main 99c2dc5) before S003 (Phase B), so the consumed sc1/sc2 surfaces exist. | No change — ordering resolves. |
