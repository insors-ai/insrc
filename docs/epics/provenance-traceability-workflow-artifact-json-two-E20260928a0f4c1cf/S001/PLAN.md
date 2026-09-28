<!-- insrc:artifact PLAN-a0f4c1cfe262a497-s1 -->

# Plan: E20260928a0f4c1cf:S001

**Epic:** `provenance-traceability-workflow-artifact-json-two`
**LLD run:** `wf-1790588966488-erdnfu`
**LLD effective hash:** `96dce0c1944d...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Provenance vocabulary module (sc1 types) | S | — | unit: provenance/types: a FeedbackEntry carries author+timestamp field-aligned with ArtifactModelAttribution (no review-type import) (ac5) | [[c1]] |
| 2 | **`t2`** Append writer + production key-preserving artifact-JSON writer (sc2 core) | M | `t1` | unit: provenance/writer: appendFeedback mints id + timestamp, appends one entry, returns {entryId,total}; blank author/comment rejected; out-of-tree path rejected; malformed JSON rejected; unit: provenance/writer: writeArtifactJson round-trip preserves every meta/citations/body key and only grows body.feedback | [[c2]] |
| 3 | **`t3`** feedbackBodyLines render binding (sc3) | S | `t1` | unit: format/bindings: feedbackBodyLines non-empty → section lines with attribution; undefined/empty → [] (omit-slot) | [[c3]] |
| 4 | **`t4`** Add optional feedback? to the four document bodies (guards untouched) | S | `t1` | unit: artifacts/body-fields: isDefineBody/isHldBody/isLldBody/isPlanBody validate a body WITH feedback AND a legacy body WITHOUT it (guard untouched) | [[c4]] |
| 5 | **`t5`** Wire the Feedback section into the four renderers + DocumentFormats | M | `t3`, `t4` | unit: renderDefine/Hld/Lld/PlanMarkdown: with feedback → Feedback section present; without feedback → output byte-identical to the pre-change render | [[c3]] |
| 6 | **`t6`** Admit-but-never-emit feedback in the four document synthesizer body schemas | S | `t4` | unit: orchestrator synthesizer schemas: a document body carrying feedback validates; additionalProperties:false preserved | [[c4]] |
| 7 | **`t7`** Daemon tool + inline artifact.feedback.append IPC handler | M | `t2` | unit: artifact-feedback-handler-contract: source-scan proves 'artifact.feedback.append' registered in index.ts, delegates to appendFeedback, returns {error} not throw (repo-stats mould) | [[c2]] |
| 8 | **`t8`** Cross-cutting tests (renderer byte-identity + IPC contract + integration) | M | `t2`, `t3`, `t4`, `t5`, `t6`, `t7` | integration: append a feedback entry to a written DEF/HLD/LLD/PLAN JSON, re-read, assert the entry is present with full attribution and renders in the doc (ac1); integration: a legacy artifact (no feedback field) reads + re-renders unchanged, then accepts a first append that initialises the record (ac4) | [[c5]] |

### E20260928a0f4c1cf:S001:T001 — Provenance vocabulary module (sc1 types)

Create src/workflow/artifacts/provenance/types.ts declaring ProvenanceTarget, ProvenanceAuthorship, FeedbackEntry, FeedbackRecord (and ChangeLogEntry/ChangeLog for s2 to consume later), verbatim from the sc1 sketch; attribution fields (author/timestamp) named to align with ArtifactModelAttribution without importing it. Purely additive, imported by nothing yet. Co-locate a small type-shape unit test.

**Acceptance checks:**
- FeedbackEntry has id + author + timestamp + target{file,version?,segment?{startLine,endLine}} + comment + optional kind (k2)
- types compile under strict/exactOptionalPropertyTypes; FeedbackRecord = readonly FeedbackEntry[]

### E20260928a0f4c1cf:S001:T002 — Append writer + production key-preserving artifact-JSON writer (sc2 core)

Create src/workflow/artifacts/provenance/writer.ts with appendFeedback(req): read the artifact JSON (JSON.parse, readArtifact-style), guard the path is under the repo artifact root, validate non-empty author+comment, mint id+timestamp, append to body.feedback, and writeArtifactJson (JSON.stringify(...,null,2)) key-preservingly; ArtifactFeedbackError for out-of-tree/missing/malformed/blank-field. No render or daemon wiring here. Co-locate the writer's unit tests (round-trip + rejections) with this task.

**Acceptance checks:**
- appendFeedback appends exactly one entry, mints id + (missing) timestamp, returns {artifactPath,entryId,total} (ac3/lc1)
- writeArtifactJson preserves every meta/citations/other-body key; only body.feedback grows (k5)
- out-of-tree path, missing/malformed JSON, and blank author/comment each throw ArtifactFeedbackError before any write
- co-located unit tests for the round-trip + all three rejection paths are added with this task

### E20260928a0f4c1cf:S001:T003 — feedbackBodyLines render binding (sc3)

Add feedbackBodyLines(feedback: FeedbackRecord | undefined): string[] to src/workflow/artifacts/format/bindings.ts, mirroring companionBodyLines: return [] when undefined/empty (omit-slot), else render each entry's attribution (author, timestamp, target file+segment) + comment as markdown lines. Co-locate its unit test.

**Acceptance checks:**
- feedbackBodyLines(undefined) === [] and feedbackBodyLines([]) === [] (ac2/ac4)
- non-empty input renders attribution + comment lines from the record, never prose (k1)
- co-located unit test covers the present + absent branches

### E20260928a0f4c1cf:S001:T004 — Add optional feedback? to the four document bodies (guards untouched)

Append `readonly feedback?: FeedbackRecord | undefined;` near the tail of DefineBody/HldBody/LldBody/PlanBody (S002 summary? spelling). Leave every isXBody guard untouched so legacy bodies still validate. Co-locate the guard-tolerance unit test (body with + without feedback).

**Acceptance checks:**
- all four bodies carry the optional feedback? field
- isDefineBody/isHldBody/isLldBody/isPlanBody validate a body WITH feedback AND a legacy body WITHOUT it (guards unchanged)
- co-located guard-tolerance unit test added

### E20260928a0f4c1cf:S001:T005 — Wire the Feedback section into the four renderers + DocumentFormats

In each of renderDefine/Hld/Lld/PlanMarkdown, add a `feedback` key to the SectionBindings table handed to renderFromFormat using the omit-slot pattern (feedbackBodyLines(body.feedback) → {lines} else {omit:true}); add the `feedback` section to each DocumentFormat in format/formats.ts + template so the section has a place.

**Acceptance checks:**
- each renderer emits a Feedback section when feedback is present (ac1/ac2)
- each renderer output is byte-identical to pre-change when feedback is absent (ac2/ac4/k5)

### E20260928a0f4c1cf:S001:T006 — Admit-but-never-emit feedback in the four document synthesizer body schemas

In orchestrator.ts, add the optional feedback field to the four document synthesizer body JSON schemas so a body carrying it validates, keeping additionalProperties:false; HARD-RULE the model not to author feedback (it is API/post-hoc-populated).

**Acceptance checks:**
- synthesizer body schemas accept a body with feedback without loosening additionalProperties:false
- the model is instructed never to author feedback (admit-but-never-emit)

### E20260928a0f4c1cf:S001:T007 — Daemon tool + inline artifact.feedback.append IPC handler

Add registerArtifactFeedbackTool() (registerTool, registerDocgenTool idiom) in the provenance module, mount it in daemon/tools/builtins/index.ts; add an inline 'artifact.feedback.append' handler to the daemon/index.ts handler map delegating to appendFeedback and returning a typed {error} object (not a throw) on a bad/out-of-tree/malformed request.

**Acceptance checks:**
- registerArtifactFeedbackTool is mounted among the builtins
- 'artifact.feedback.append' is registered in the index.ts handler map, delegates to appendFeedback, and returns {error} (not throw) on a bad request (ac3)

### E20260928a0f4c1cf:S001:T008 — Cross-cutting tests (renderer byte-identity + IPC contract + integration)

With per-task unit tests already co-located (t1-t4/t7), add the CROSS-CUTTING tests: renderer byte-identity present-vs-absent per doc type; a source-scan contract test for the IPC handler (repo-stats mould); and an integration append→read→render + legacy forward-only test. Confirm ac1-ac5 all map to a passing test and the full sweep is green (tsc clean).

**Acceptance checks:**
- ac1-ac5 each have ≥1 passing proving test (unit co-located + cross-cutting here)
- renderer byte-identity present-vs-absent asserted per type; IPC contract test pins registration+delegation+append-only; integration append→read→render + legacy forward-only pass
- the full sweep passes (tsc clean; no regression in existing renderer output)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| feedbackBodyLines: non-empty feedback → section lines with attribution; undefined/empty → [] (omit-slot) | `t3` |
| appendFeedback: mints id + timestamp, appends one entry, returns {entryId,total}; blank author/comment rejected; out-of-tree path rejected; malformed JSON rejected | `t2` |
| writeArtifactJson: round-trip preserves every meta/citations/body key and only grows body.feedback | `t2` |
| isDefineBody/isHldBody/isLldBody/isPlanBody: a body WITH feedback still validates AND a legacy body WITHOUT it still validates (guard untouched) | `t4` |
| renderDefineMarkdown / renderHldMarkdown / renderLldMarkdown / renderPlanMarkdown: with feedback → Feedback section present; without feedback → output byte-identical to the pre-change render | `t5`, `t8` |
| artifact.feedback.append handler: registered in the daemon index.ts handler map; delegates to the provenance append fn; returns a typed {error} object (not a throw) on a bad/out-of-tree request | `t7`, `t8` |
| registerArtifactFeedbackTool: mounted among the builtins | `t7` |
| append a feedback entry to a written DEF/HLD/LLD/PLAN JSON, re-read, and assert the entry is present with full attribution and renders in the doc | `t8` |
| a legacy artifact (no feedback field) reads + re-renders unchanged, then accepts a first append that initialises the record | `t8` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s1 — sc1 vocabulary (ProvenanceTarget/ProvenanceAuthorship/FeedbackEntry/FeedbackRecord in new provenance module)`
- **[[c2]]** `prior-artifact` `LLD s1 — sc2 append API (appendFeedback + production key-preserving writeArtifactJson + registerArtifactFeedbackTool + inline artifact.feedback.append IPC handler)`
- **[[c3]]** `prior-artifact` `LLD s1 — sc3 render binding (feedbackBodyLines omit-slot in format/bindings.ts wired into the four renderers + DocumentFormats)`
- **[[c4]]** `prior-artifact` `LLD s1 — dataModelChanges: optional feedback? on DefineBody/HldBody/LldBody/PlanBody (guards untouched) + synthesizer admit-but-never-emit in orchestrator.ts`
- **[[c5]]** `prior-artifact` `LLD s1 — testStrategy: unit (vocab/writer/binding/guards) + renderer byte-identity + IPC contract + integration append→read→render/legacy forward-only`
