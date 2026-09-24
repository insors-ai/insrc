<!-- insrc:artifact PLAN-38905b56cb44c4cf-s2 -->

# Plan: E2026092438905b56:S002

**Epic:** `work-framed-approved-spec-proceed-from`
**LLD run:** `wf-1790251312157-sf22t7`
**LLD effective hash:** `b8f0f1bf4237...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Pure guide-sections module (src/daemon/guide-sections.ts) | S | — | unit: guide-sections.test.ts: readWorkflowGuide hit/unknown/half-present/inverted-pair + decoy-inner-marker; listWorkflowGuides complete-pairs-only in document order + [] empty; guideMarkerStart/End exact strings | [[c1]] [[c2]] |
| 2 | **`t2`** Daemon guide.get/guide.list IPC + daemon-stream clients | M | `t1` | unit: guide-handlers.test.ts: the guide.get/guide.list handler logic over an injected read seam — known key -> {workflow,guidance}; unknown/omitted -> {error,validWorkflows}; read-seam throws -> guide.get {error,validWorkflows:[]} and guide.list {workflows:[]} (never escapes); unit: guide-handlers.test.ts: guide.list returns {workflows} from listWorkflowGuides over injected fixture text (document order) | [[c1]] [[c3]] |
| 3 | **`t3`** Thin insrc_guide MCP tool + registration | M | `t1`, `t2` | unit: guide-handler.test.ts: handleInsrcGuide({workflow}) forwards to guideGet and wraps InsrcGuideOk in {content:[{type:'text',text}]} (ac1) over an injected UnaryRpc dep; handleInsrcGuide({}) forwards to guideList and returns a structured InsrcGuideError {error,validWorkflows} envelope, never throws (ac2); integration: schema-registry.test.ts (extended): buildInsrcMcpServerWithRegistry() registry includes 'insrc_guide' (phaseless, no phases) and the EXPECTED_TOOLS key-set is updated to include it; readWorkflowGuide over the REAL shipped steering asset returns null for each WorkflowKey in Phase A and does not throw | [[c1]] [[c4]] |

### E2026092438905b56:S002:T001 — Pure guide-sections module (src/daemon/guide-sections.ts)

Add src/daemon/guide-sections.ts: the sc2 types (InsrcGuideInput { workflow?: string }, InsrcGuideOk { workflow; guidance }, InsrcGuideError { error; validWorkflows }, InsrcGuideResult union), the marker builders guideMarkerStart(key)/guideMarkerEnd(key) producing '<!-- insrc:guide:<key>:start|end -->', and the PURE readWorkflowGuide(steeringText, workflow): string|null + listWorkflowGuides(steeringText): string[]. readWorkflowGuide slices strictly between the requested key's own start/end markers (trimmed), null on a missing/half-present/inverted pair; listWorkflowGuides returns only keys with a COMPLETE pair, in document order.

**Acceptance checks:**
- src/daemon/guide-sections.ts exports InsrcGuideInput/Ok/Error/Result, guideMarkerStart/guideMarkerEnd, readWorkflowGuide, listWorkflowGuides, matching the LLD signatures verbatim.
- readWorkflowGuide is pure (no imports of node:fs) — depends only on its args; a half-present/inverted marker pair returns null.
- listWorkflowGuides returns keys for COMPLETE pairs only, in document order; [] for text with no pairs.
- tsc passes under strict + exactOptionalPropertyTypes.

### E2026092438905b56:S002:T002 — Daemon guide.get/guide.list IPC + daemon-stream clients

Add 'guide.get' and 'guide.list' read-only entries to the object-literal method map in src/daemon/index.ts, beside docgen.generate/docgen.list. Each reuses the EXPORTED readSteeringBlock() from steering-inject.ts (the single-source canonical-asset reader) wrapped in try/catch: guide.get returns readWorkflowGuide(text, workflow) shaped as { workflow, guidance } or { error, validWorkflows: listWorkflowGuides(text) } (also on omitted key / read failure -> { error, validWorkflows: [] }); guide.list returns { workflows: listWorkflowGuides(text) } (or { workflows: [] } on read failure). Add the thin unaryRpc client wrappers guideGet(params, deps)/guideList(deps) to src/mcp/daemon-stream.ts, mirroring docgenGenerate/docgenList, importing the InsrcGuideResult type from ../daemon/guide-sections.js.

**Acceptance checks:**
- src/daemon/index.ts registers 'guide.get' and 'guide.list' read-only handlers that reuse readSteeringBlock() + t1's reader; a steering-read throw is caught and shaped as a structured result, never escaping the IPC (k3/k5) — PROVEN by a test injecting a throwing reader.
- src/mcp/daemon-stream.ts exports guideGet(params, deps?) over unaryRpc('guide.get',...) and guideList(deps?) over unaryRpc('guide.list', {}, ...), returning InsrcGuideResult / { workflows }.
- The daemon guide handlers are read-only — no writes, no cloud/REST (k5).
- Existing daemon methods + daemon-stream clients are unchanged (additive).

### E2026092438905b56:S002:T003 — Thin insrc_guide MCP tool + registration

Add src/mcp/guide/schema.ts (GUIDE_INPUT = { workflow: z.string().optional() } — workflow optional so an omitted workflow is the ac2 structured path; re-export InsrcGuideInput) and src/mcp/guide/handler.ts (handleInsrcGuide(args, deps?): forwards a present workflow to guideGet and wraps the InsrcGuideResult as { content:[{type:'text',text}] }; an omitted workflow calls guideList and returns a structured InsrcGuideError { error, validWorkflows } envelope; never throws for a miss). Register insrc_guide in src/mcp/server.ts via the s1 registerAndRecord recorder (readOnlyHint:true, phaseless) so it also lands in the insrc_schema registry.

**Acceptance checks:**
- src/mcp/guide/handler.ts exports handleInsrcGuide importing ONLY the daemon guide clients (guideGet/guideList) + resolveRepoPath — no direct file/DB access.
- insrc_guide is registered via registerAndRecord (phaseless) and appears in buildInsrcMcpServerWithRegistry()'s registry; GUIDE_INPUT.workflow is optional.
- handleInsrcGuide never throws for a miss — an omitted/unknown workflow yields a structured InsrcGuideError envelope (k3, ac2).
- tsc clean; full MCP suite green (the schema-registry key-set test updated for the added tool).

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| readWorkflowGuide(text, key): hit returns the trimmed section between the key's start/end markers (ac1); unknown key returns null; half-present pair (start only / end only / end-before-start) returns null; inner text resembling another key's marker is returned verbatim, not mis-sliced | `t1` |
| listWorkflowGuides(text): returns only keys with a COMPLETE pair, in document order; returns [] for text with no pairs (Phase-A empty case) | `t1` |
| guideMarkerStart(key)/guideMarkerEnd(key) produce the exact '<!-- insrc:guide:<key>:start\|end -->' strings the reader keys on | `t1` |
| guide.get handler: known key -> { workflow, guidance }; unknown/omitted key -> { error, validWorkflows }; asset-read throws -> { error, validWorkflows: [] } (never escapes the IPC) | `t2` |
| guide.list handler: returns { workflows } from listWorkflowGuides over the injected text; asset-read throws -> { workflows: [] } | `t2` |
| handleInsrcGuide({ workflow }) -> forwards to guideGet and wraps InsrcGuideOk in { content:[{type:'text',text}] } | `t3` |
| handleInsrcGuide({}) (omitted workflow) -> forwards to guideList and returns a structured InsrcGuideError { error, validWorkflows } envelope (ac2), never throws | `t3` |
| buildInsrcMcpServerWithRegistry(): the registry now includes 'insrc_guide' (phaseless: no phases); the schema-registry key-set test count reflects the added tool | `t3` |
| readWorkflowGuide over the REAL canonical steering asset returns null for every WorkflowKey in Phase A (no marker pairs authored yet) and does not throw | `t3` |

## Citations

- **[[c1]]** `analyze-bundle` `plan s1 how-does-it-work: the docgen thin-wrapper + daemon-stream client + method-map shapes to mirror, and readSteeringBlock reuse (src/mcp/daemon-stream.ts, src/daemon/index.ts, src/daemon/steering-inject.ts)` — "docgenGenerate is a one-liner over unaryRpc('docgen.generate',...); the daemon method map has 'docgen.generate'/'docgen.list'; steering-inject.ts EXPORTS readSteeringBlock() which the daemon guide han"
- **[[c2]]** `prior-artifact` `LLD s2 dataModelChanges: the sc2 types (InsrcGuide*) + the GUIDE_MARKER convention (guideMarkerStart/End) + the pure readWorkflowGuide/listWorkflowGuides reader` — "per-workflow marker pair '<!-- insrc:guide:<key>:start/end -->' mirroring STEERING_MARKER_START/END; readWorkflowGuide slices between markers (null on absent/half-present), listWorkflowGuides returns "
- **[[c3]]** `prior-artifact` `LLD s2 contractDetails + errorPaths: the daemon guide.get/guide.list IPC + guideGet/guideList clients + the read-failure structured-error path` — "guide.get/guide.list read-only handlers reuse the canonical-asset reader; a read failure is caught and shaped as { error, validWorkflows: [] } / { workflows: [] }, never escaping the IPC (k3/k5)."
- **[[c4]]** `step-output` `LLD s3 alternatives.judge (a1 chosen): marker-pair partitioning of the single canonical asset; insrc_guide is phaseless and rides the s1 registerAndRecord recorder into the insrc_schema registry` — "a1 is the only alternative that scores 'satisfies' on ALL of ac1-ac4 and sc2; insrc_guide registers via registerAndRecord (phaseless) so it also lands in the insrc_schema registry."
