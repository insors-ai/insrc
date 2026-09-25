<!-- insrc:artifact PLAN-38905b56cb44c4cf-s3 -->

# Plan: E2026092438905b56:S003

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790253820995-le02sv`
**LLD effective hash:** `b8f0f1bf4237...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add + wire stripGuideSections (pure) into the inject/refresh block source | S | — | unit: guide-strip.test.ts: stripGuideSections over a self-contained fixture — removes every complete guide section (no guide-start marker remains, skeleton retained); malformed/half pair left intact; ragged blank runs collapsed (no >2 newlines); idempotent; empty-safe (no sections -> unchanged) | [[c2]] |
| 2 | **`t2`** Restructure steering-block.md into skeleton + per-workflow guide sections | M | — | integration: schema-registry.test.ts (real-asset): readWorkflowGuide over the REAL steering-block.md resolves non-empty guidance for every expected WorkflowKey (ac2); the skeleton (stripGuideSections output) mentions all 12 registered insrc_* tools incl. insrc_build_step/insrc_schema/insrc_guide + the schema-first rule + the insrc_schema self-entry (ac3) | [[c1]] [[c3]] [[c4]] |
| 3 | **`t3`** Flip the S002 Phase-A canary + add strip/inject/real-asset tests | S | `t1`, `t2` | integration: schema-registry.test.ts: the flipped canary — stripGuideSections(REAL steering) has no guide-start marker and is strictly shorter than the whole file (ac1); unit: guide-strip.test.ts (inject path): refreshSteeringAcrossRepos with the PRODUCTION default readBlock stamps a guide-marker-free skeleton into a fixture repo file via the injected seams while readSteeringBlock stays whole (guide.get unaffected); an injected deps.readBlock is honoured verbatim; a re-run is idempotent (unchanged) | [[c1]] [[c2]] [[c4]] |

### E2026092438905b56:S003:T001 — Add + wire stripGuideSections (pure) into the inject/refresh block source

Add export function stripGuideSections(steeringText: string): string to src/daemon/steering-inject.ts: for each key in listWorkflowGuides(steeringText) (sc2 public), remove the region from guideMarkerStart(key) to guideMarkerEnd(key) inclusive; collapse >2 consecutive blank lines; trim. Pure, no I/O; idempotent; empty-safe (no sections -> unchanged); malformed/half pairs left intact (listWorkflowGuides returns complete pairs only). Import listWorkflowGuides/guideMarkerStart/guideMarkerEnd from ./guide-sections.js. Wire it at the TWO block-source callsites: injectSteeringBlock line ~198 `const block = stripGuideSections(readSteeringBlock())`; refreshSteeringAcrossRepos default readBlock (~line 247) `readBlock: () => stripGuideSections(readSteeringBlock())`. readSteeringBlock stays unchanged (guide.get path).

**Acceptance checks:**
- src/daemon/steering-inject.ts exports stripGuideSections; it removes every complete guide-marker section, collapses ragged blank runs, is idempotent, and returns text with no guide sections unchanged.
- The two block-source callsites (injectSteeringBlock + refreshSteeringAcrossRepos default readBlock) wrap readSteeringBlock() with stripGuideSections; readSteeringBlock itself is unchanged.
- stripGuideSections is pure (no node:fs) and reuses sc2's public listWorkflowGuides + guideMarkerStart/End — no new marker convention.
- tsc clean.

### E2026092438905b56:S003:T002 — Restructure steering-block.md into skeleton + per-workflow guide sections

Rewrite src/prompts/steering-block.md: (1) a COMPACT SKELETON — a front-door decision tree (intent -> tool/workflow), a CATALOG of all 12 registered insrc_* tools (one line each: purpose + 'call insrc_schema for its exact shape') INCLUDING the previously-uncovered insrc_build_step, plus insrc_schema + insrc_guide; the schema-first rule ('call insrc_schema before emitting a call whose shape you are unsure of'); the insrc_schema self-entry (its { tool, phase? } -> InsrcSchemaResult call/response); and the pointer 'for a workflow's full step-by-step procedure call insrc_guide({workflow})'. (2) The current heavy per-workflow procedural detail MOVED into sections wrapped in the exact sc2 marker pairs '<!-- insrc:guide:<key>:start -->'..'<!-- insrc:guide:<key>:end -->' for the 10 WorkflowKeys define/design.epic/design.story/plan/build/review/code-review/brainstorm/tracker/triage (keys spelled EXACTLY so insrc_guide resolves).

**Acceptance checks:**
- steering-block.md contains a guide-marker section for EACH of the 10 WorkflowKeys, each key spelled exactly (design.epic, code-review, etc.) with a complete start/end pair and non-empty body.
- The skeleton (content outside the guide sections) names all 12 registered insrc_* tools incl. insrc_build_step, insrc_schema, insrc_guide, and contains the schema-first rule + the insrc_schema self-entry + the insrc_guide({workflow}) pointer (ac3).
- No per-workflow procedural detail remains inline in the skeleton (it lives in the guide sections); the file is a single canonical source (ac4).

### E2026092438905b56:S003:T003 — Flip the S002 Phase-A canary + add strip/inject/real-asset tests

Update src/mcp/__tests__/schema-registry.test.ts: flip the Phase-A canary ('readWorkflowGuide null for every key') to assert each expected WorkflowKey (the EXACT WorkflowKey set) now RESOLVES to non-empty guidance over the REAL steering asset, and that stripGuideSections(realSteering) contains no guide-start marker + is strictly shorter than the whole file + mentions every registered insrc_* tool incl. insrc_build_step. Add src/daemon/__tests__/guide-strip.test.ts: stripGuideSections unit tests over a SELF-CONTAINED fixture (not the real steering file) — remove complete sections/skeleton retained/malformed intact/blank-run collapse/idempotent/empty-safe; plus an inject-path test (refreshSteeringAcrossRepos default readBlock stamps a guide-marker-free skeleton via the injected seams, while readSteeringBlock stays whole; an injected deps.readBlock is honoured verbatim).

**Acceptance checks:**
- The S002 Phase-A canary is replaced by assertions that every expected WorkflowKey (the exact set, catching a t2 typo) resolves + the stripped skeleton excludes them (ac1, ac2).
- The stripGuideSections unit tests use a self-contained fixture so t1's helper is provable independently of t2's authored content; new tests also cover the inject-path skeleton-only behaviour + the injected-readBlock-honoured edge (ac1, ac4).
- Full daemon + MCP suites green; tsc clean.

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| stripGuideSections(text): removes every complete guide-marker section (start..end inclusive) so the result contains NO guide-start marker; the surrounding skeleton text is retained (ac1) | `t1` |
| stripGuideSections leaves a malformed/half-marked section intact (only complete pairs from listWorkflowGuides are stripped) and collapses ragged blank runs (no >2 consecutive newlines) | `t1` |
| stripGuideSections is idempotent (applying twice == once) and returns text with NO guide sections unchanged (empty-safe / backward-compatible) | `t1` |
| refreshSteeringAcrossRepos with the PRODUCTION default readBlock stamps a block that contains no guide-start marker (the skeleton) into a fixture repo file; readSteeringBlock (guide.get path) still returns the whole file incl. the guide sections | `t3` |
| refreshSteeringAcrossRepos with an INJECTED deps.readBlock uses it verbatim (the default-only strip does not affect an explicit override) — existing steering-inject tests unaffected | `t3` |
| readWorkflowGuide over the REAL steering asset returns non-empty guidance for EVERY expected WorkflowKey (define/design.epic/design.story/plan/build/review/code-review/brainstorm/tracker/triage) — the flipped S002 canary (ac2) | `t2`, `t3` |
| stripGuideSections(REAL steering) contains NO guide-start marker (the injected skeleton excludes per-workflow detail) AND is strictly shorter than the whole file (ac1) | `t3` |
| the skeleton (stripGuideSections output) mentions every registered insrc_* tool incl. insrc_build_step, insrc_schema, insrc_guide + the schema-first rule text (ac3) | `t2` |

## Citations

- **[[c1]]** `analyze-bundle` `plan s1 structural-map: steering-block.md structure (291 lines, 4 topic sections) + the 12 registered tools + zero-coverage of insrc_build_step/schema/guide + the S002 canary to flip` — "steering-block.md 291 lines / 4 sections; 12 registered tools; insrc_build_step/insrc_schema/insrc_guide = 0 coverage; the S002 Phase-A canary (schema-registry.test.ts:113/118) must be flipped once re"
- **[[c2]]** `analyze-bundle` `plan s1 how-does-it-work: the two block-source wrap points (steering-inject.ts:198 injectSteeringBlock + :247 refreshSteeringAcrossRepos default readBlock) + readSteeringBlock shared with guide.get + sc2 public listWorkflowGuides/guideMarkerStart/End` — "injectSteeringBlock:198 `const block = readSteeringBlock()` and refreshSteeringAcrossRepos:247 default `readBlock: readSteeringBlock` are the two wrap points; readSteeringBlock is what guide.get uses "
- **[[c3]]** `prior-artifact` `LLD s3 interactionWithShared sc1 (insrc_schema): the { tool, phase? } -> InsrcSchemaResult surface named in the catalog + schema-first rule + self-entry` — "S003 consumes sc1 by name: the catalog lists insrc_schema, the schema-first rule tells the controller to call it before guessing, and the self-entry documents its call/response (ac3)."
- **[[c4]]** `prior-artifact` `LLD s3 alternatives.judge (a1 chosen) + sc2 consumption: subtractive strip of the single canonical asset via sc2's public listWorkflowGuides + guideMarkerStart/End; detail authored into sc2's marker sections` — "a1 satisfies ac1-ac4 and both consumed contracts; stripGuideSections reuses sc2's public surface and the detail is authored into sc2's guide-marker sections — no new convention, no re-implementation o"
