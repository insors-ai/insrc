<!-- insrc:artifact PLAN-870ed3dd246225f4-s6 -->

# Plan: E20260731870ed3dd:S006

**Epic:** `documentation-generation-framework-docgen-produces-self`
**LLD run:** `wf-1785496342516-nu9vox`
**LLD effective hash:** `cb5b27744db2...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Centralize registered/indexed precondition in generateDocument | M | — | unit: generateDocument runs the registered+indexed precondition before extractor dispatch and returns source-not-ready pre-extraction, with not-found precedence over source-not-ready when both conditions hold; unit: generateDocument forwards the whole input to the resolved extractor (call-sequence {repo,symbol} and narrative {repo,base,question} reach parseScope, no longer dropped to {repo,path}); unit: a missing per-type required field (call-sequence without symbol) surfaces empty-scope with the extractor's reason; live: an unregistered repo path returns source-not-ready over the live IPC | [[c1]] |
| 2 | **`t2`** Add registry-derived input-schema builder helper | S | — | unit: schema-builder helper output enumerates exactly listDocTypes()'s docTypes with the union of extractorInputSchema fields (repo required, path optional, symbol/base/question/maxDepth included); unit: a docType registered later in docgenRegistry appears in the helper's output with zero edits to the helper | [[c2]] |
| 3 | **`t3`** Generalize the docgen_generate tool's schema and input threading | S | `t1`, `t2` | unit: docgen_generate tool execute() forwards the full validated input (including symbol/base/question/maxDepth) to generateDocument unmodified, without reconstructing {repo,path}; unit: backward-compat: a {docType:'type-structure', repo, path} request still validates and executes unchanged, rendering non-ok via describeOutcome | [[c3]] [[c6]] |
| 4 | **`t4`** Forward whole params through the docgen.generate IPC handler | S | `t1` | unit: docgen.generate IPC handler forwards every field of params (minus docType) through to generateDocument's input, with docgen.list unchanged; live: docgen.generate IPC returns an ok self-contained shell against a registered+indexed repo, matching the insrc_docgen MCP tool's result for the same request; live: an unregistered repo path returns source-not-ready over the live IPC | [[c4]] [[c6]] |
| 5 | **`t5`** Register the insrc_docgen MCP tool | M | `t2`, `t4` | unit: insrc_docgen handler resolves the repo via resolveRepoPath then calls docgen.generate/docgen.list over the IPC seam, never importing or invoking generateDocument in-process; unit: an ok DocGenOutcome from the seam is shaped by DOCGEN_OUTCOME_SCHEMA / RENDERED_DOCUMENT_SHELL_SCHEMA; unit: a non-ok outcome (source-not-ready/not-found/empty-scope) is returned as a CallToolResult isError carrying the reason; unit: a daemon-unreachable RPC rejection is caught and returned as isError rather than a fabricated document; live: insrc_docgen MCP tool returns an ok self-contained shell against a registered+indexed repo, matching docgen.generate IPC's result for the same request | [[c5]] [[c10]] |
| 6 | **`t6`** Add cross-surface contract and integration tests for docgen | M | `t3`, `t4`, `t5` | integration: tool inputSchema, docgen.list IPC output, and MCP tool inputSchema enumerate the identical docType set and per-type input fields (no drift); integration: docgen.list IPC returns exactly listDocTypes(); the three advertised capability sets are identical; integration: a doc type registered only in docgenRegistry but omitted from one surface fails the drift-guard parity assertion; integration: the same {docType,repo,scope} request through the tool execute(), the docgen.generate IPC handler, and the MCP handler over a fake in-process daemon yields the same DocGenOutcome status and (for ok) the same shell docType/backend; integration: call-sequence and narrative requests succeed identically across the tool, IPC, and MCP surfaces | [[c11]] [[c12]] |

### E20260731870ed3dd:S006:T001 — Centralize registered/indexed precondition in generateDocument

In src/docgen/index.ts, reshape generateDocument to run the registered+indexed precondition (repo registry membership + pinned graph revision) BEFORE dispatching to the resolved extractor, returning the existing source-not-ready DocGenOutcome variant on failure and not-found for an unknown docType. Not-found precedence wins over source-not-ready when both conditions hold (unknown docType against an unregistered/unindexed repo). This centralizes ac3 so every surface (tool, IPC, MCP) inherits it for free instead of re-checking per surface.

**Acceptance checks:**
- generateDocument returns sc4 source-not-ready before any extractor runs when the target repo is unregistered or has no pinned graph revision
- generateDocument still returns sc4 not-found when docgenRegistry.get(docType) is undefined
- the existing no-revision source-not-ready path already emitted by extractors is reused, not duplicated by a second/conflicting check
- an unknown docType requested against an unregistered/unindexed repo returns not-found, not source-not-ready, pinning not-found-first precedence
- a unit test asserts the registered/indexed precondition check runs before extractor resolution/dispatch for every registered docType

### E20260731870ed3dd:S006:T002 — Add registry-derived input-schema builder helper

Add a shared helper (in src/docgen/schema.ts) that derives a JSON-schema-shaped input descriptor from listDocTypes() — {docType} plus the union of each registration's extractorInputSchema properties (repo required, path optional, plus per-type fields like symbol/base/question/maxDepth) — so no surface hand-maintains its own doc-type list. This is the single derivation point tool.ts (t3) and the new MCP tool (t5) both call.

**Acceptance checks:**
- the helper's output enumerates exactly the docTypes returned by listDocTypes(), with no hard-coded doc-type list in the helper itself
- the union schema keeps repo required and path optional for doc types whose extractorInputSchema only declares those two fields (backward-compat shape)
- a doc type registered later in docgenRegistry appears in the helper's output with zero edits to the helper
- the union schema surfaces maxDepth alongside symbol/base/question for doc types whose extractorInputSchema declares it, matching the full per-type field set in the contract

### E20260731870ed3dd:S006:T003 — Generalize the docgen_generate tool's schema and input threading

In src/docgen/tool.ts, replace the hard-coded {docType, repo, path} inputSchema with the schema-builder helper's (t2) output, and change execute() to forward the whole validated input object to generateDocument instead of reconstructing {repo, path}. Keeps the DOCGEN_TOOL_ID / Tool contract stable and non-ok outcomes rendered via the existing describeOutcome.

**Acceptance checks:**
- docgenTool.inputSchema is built from the t2 helper rather than a fixed {docType, repo, path} literal
- execute() forwards the entire validated input object to generateDocument, making call-sequence (symbol) and narrative (base+question) reachable through the tool
- a {docType:'type-structure', repo, path} request still validates and executes unchanged (backward-compatible)
- non-ok DocGenOutcome values still render through the existing describeOutcome with ToolResult.success=false
- a unit test asserts execute() forwards the full validated input (including symbol/base/question/maxDepth fields) to generateDocument unmodified, without reconstructing a {repo,path} subset

### E20260731870ed3dd:S006:T004 — Forward whole params through the docgen.generate IPC handler

In src/daemon/index.ts, change the docgen.generate handler to forward the whole params object (minus docType) to generateDocument instead of destructuring only {docType, repo, path}, bringing the IPC surface to parity with the tool. docgen.list stays unchanged (already returns listDocTypes()). No IPC method rename.

**Acceptance checks:**
- the docgen.generate handler passes every field of params (other than docType) through to generateDocument's input argument
- docgen.list continues to return listDocTypes() unchanged
- IPC method names docgen.generate / docgen.list are unchanged so the IDE fork's mirrored types remain valid

### E20260731870ed3dd:S006:T005 — Register the insrc_docgen MCP tool

Add a new server.registerTool('insrc_docgen', ...) registration + handler in src/mcp/server.ts, following the existing per-tool-family pattern (analyze-step/, build-step/, etc.). The handler resolves the repo via resolveRepoPath, derives its inputSchema from the docgen.list IPC output via the t2 helper, and calls docgen.generate/docgen.list over the daemon socket only — it never imports generateDocument. Outcomes are shaped by DOCGEN_OUTCOME_SCHEMA / RENDERED_DOCUMENT_SHELL_SCHEMA (src/docgen/schema.ts), with non-ok/unreachable results returned as CallToolResult isError carrying an actionable reason. readOnlyHint=true, openWorldHint=false.

**Acceptance checks:**
- src/mcp/server.ts registers 'insrc_docgen' with an inputSchema derived from the docgen.list IPC output via the t2 helper, not a hand-written list
- the handler resolves the repo with resolveRepoPath and calls docgen.generate/docgen.list exclusively over the daemon IPC seam — no in-process import or invocation of generateDocument
- a non-ok DocGenOutcome (source-not-ready/not-found/empty-scope/fallback-unavailable) is returned as a CallToolResult with isError=true and an actionable reason
- a daemon-unreachable/rejected IPC call is caught and returned as isError rather than a fabricated document
- an ok outcome is shaped by DOCGEN_OUTCOME_SCHEMA / RENDERED_DOCUMENT_SHELL_SCHEMA
- a unit test asserts the MCP handler module imports only the daemon IPC client for docgen.generate/docgen.list and never imports generateDocument or any docgen extractor module directly

### E20260731870ed3dd:S006:T006 — Add cross-surface contract and integration tests for docgen

Add a contract-level parity/drift-guard test proving the tool (t3), IPC (t4), and MCP (t5) surfaces enumerate the identical docType set derived from listDocTypes(), and an integration-level test proving the same {docType, repo, scope} request yields the same DocGenOutcome across all three surfaces (in-process tool call, direct IPC call, and MCP tool call over the daemon socket).

**Acceptance checks:**
- a contract-level test asserts the tool's inputSchema, the IPC docgen.list output, and the MCP tool's inputSchema all enumerate the identical docType set with no drift
- an integration test issues the same {docType, repo, scope} request through the tool, IPC, and MCP surfaces and asserts all three return the same DocGenOutcome
- the test suite fails if a new docType is registered in docgenRegistry but any one of the three surfaces omits it (drift guard)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| The daemon tool's advertised docTypes + per-type input fields equal listDocTypes() (docType + capability.summary + extractorInputSchema union) | `t6` |
| The MCP tool's derived inputSchema is built from listDocTypes()/docgen.list output, not a hand-written list — same docType set + per-type fields as the tool | `t6` |
| docgen.list IPC returns exactly listDocTypes(); the three advertised capability sets are identical | `t6` |
| A doc type absent from one surface fails the parity assertion (drift guard) | `t6` |
| generateDocument forwards the WHOLE input to the resolved extractor, so a call-sequence request carrying {repo, symbol} and a narrative request carrying {repo, base, question} reach parseScope (no longer dropped to {repo,path}) | `t1` |
| generateDocument returns source-not-ready for an unregistered/unindexed repo BEFORE extraction (ac3), and not-found for an unknown docType | `t1` |
| a per-type required field missing (call-sequence without symbol) surfaces empty-scope with the extractor's reason | `t1` |
| the docgen_generate tool execute() forwards the full validated input (not just {repo,path}) and renders non-ok via describeOutcome | `t3` |
| backward-compat: a {docType:'type-structure', repo, path} request still validates + runs unchanged | `t3` |
| the insrc_docgen handler resolves the repo via resolveRepoPath then calls the docgen.generate/docgen.list IPC seam — it never imports/invokes generateDocument in-process (ac2) | `t5` |
| an ok DocGenOutcome from the seam is returned shaped by DOCGEN_OUTCOME_SCHEMA / RENDERED_DOCUMENT_SHELL_SCHEMA | `t5` |
| a non-ok outcome (source-not-ready/not-found/empty-scope) is surfaced as a CallToolResult isError carrying the reason (ac3) | `t5` |
| a daemon-unreachable RPC rejection becomes an actionable isError, not a fabricated document | `t5` |
| the same {docType, repo, scope} routed through the tool execute(), the docgen.generate IPC handler, and the MCP handler (over a fake in-process daemon) yields the SAME DocGenOutcome status + (for ok) the same shell docType/backend (ac1) | `t6` |
| call-sequence and narrative — previously unreachable on tool/IPC — now succeed identically on all three (ac1) | `t6` |
| against a registered+indexed repo, docgen.generate IPC + the insrc_docgen MCP tool each return an ok self-contained shell for the same request (ac1/ac2) | `t4`, `t5` |
| an unregistered repo path returns source-not-ready over the live IPC (ac3) | `t1`, `t4` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s6 ac3` — "generateDocument centralizes the registered+indexed precondition and returns source-not-ready before extractor dispatch"
- **[[c2]]** `prior-artifact` `LLD s6 a1` — "Chosen alternative a1: registry-driven whole-input pass-through, with the surface input schema derived from listDocTypes()"
- **[[c3]]** `prior-artifact` `LLD s6 ac1` — "The tool surface forwards the whole validated input so call-sequence and narrative requests reach parseScope"
- **[[c4]]** `prior-artifact` `LLD s6 ac1` — "The IPC surface forwards the whole params object so it reaches parity with the tool surface"
- **[[c5]]** `prior-artifact` `LLD s6 ac2` — "The MCP handler resolves the repo and calls docgen.generate/docgen.list over the daemon IPC seam only; it never imports generateDocument"
- **[[c6]]** `prior-artifact` `LLD s6 backward-compatible` — "Backward-compatible: repo required, path optional; no IPC/tool rename"
- **[[c10]]** `prior-artifact` `LLD s6 ac3` — "A non-ok DocGenOutcome is returned as a CallToolResult isError carrying an actionable reason"
- **[[c11]]** `prior-artifact` `LLD s6 ac1` — "The same {docType, repo, scope} request yields the same DocGenOutcome across the tool, IPC, and MCP surfaces"
- **[[c12]]** `prior-artifact` `LLD s6 ac4` — "A doc type registered in docgenRegistry must appear identically on all three surfaces (drift guard)"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 11 LOW** · model `client` · reviewed 2026-07-31T12:57:01.632Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | src/docgen/index.ts generateDocument exists and today dispatches to reg.extract(input) without a registered/indexed precondition ahead of it — t1 reshapes it to run the precondition before extractor dispatch. | index.ts:64 generateDocument, :68 docgenRegistry.get(docType), :70 reg.extract(input) — dispatches to the extractor with no precondition ahead of it today; t1's centralization is a clean insertion. Confirmed. | none |
| t2 | citation | LOW | manual | src/docgen/schema.ts is the module t2 adds the registry-derived input-schema builder helper to; it currently holds RENDERED_DOCUMENT_SHELL_SCHEMA + DOCGEN_OUTCOME_SCHEMA and no input-schema builder. | schema.ts:17 RENDERED_DOCUMENT_SHELL_SCHEMA + DOCGEN_OUTCOME_SCHEMA present; no input-schema builder exists there yet — t2 correctly adds one. Confirmed. | none |
| t2 | semantic | LOW | manual | listDocTypes() returns SerializableDocTypeRegistration entries carrying extractorInputSchema (via toSerializable), so the t2 helper can union per-type fields from the registry. | registry.ts:98 projects extractorInputSchema through toSerializable; index.ts:54 listDocTypes returns SerializableDocTypeRegistration[]. The helper can union per-type fields from the registry. Confirmed. | none |
| t3 | citation | LOW | manual | src/docgen/tool.ts today fixes docgenTool.inputSchema to {docType,repo,path} and execute() reconstructs extractInput={repo}(+path) — the literal t3 replaces with the t2 helper output + whole-input forwarding; describeOutcome + DOCGEN_TOOL_ID stay. | tool.ts:50 inputSchema literal, :68-69 extractInput={repo}(+path); DOCGEN_TOOL_ID='docgen_generate' (:25); describeOutcome present. The {docType,repo,path} literal + reconstruction t3 replaces is real. Confirmed. | none |
| t4 | citation | LOW | manual | src/daemon/index.ts docgen.generate handler currently destructures only {docType, repo, path} from params, and docgen.list returns listDocTypes() — t4 forwards the whole params (minus docType) with no method rename. | daemon/index.ts:1157 'docgen.generate', :1158 `const { docType, repo, path } = params`, :1165 'docgen.list', :1167 returns listDocTypes(). t4's whole-params forwarding target is precise. Confirmed. | none |
| t5 | citation | LOW | manual | src/mcp/server.ts registers MCP tools via server.registerTool(name, {...}, handler); t5 adds a new 'insrc_docgen' registration there (no docgen tool exists in src/mcp today). | mcp/server.ts:128 (+7) server.registerTool(; insrc_docgen has 0 hits in src/ (docs only) — genuinely a new registration. Confirmed. | none |
| t5 | citation | LOW | manual | src/mcp/resolve-repo.ts exports resolveRepoPath, the repo-resolution helper the insrc_docgen handler uses before its IPC call (ac2 daemon-owned read). | mcp/resolve-repo.ts:50 `export async function resolveRepoPath(explicit, deps)` — the repo-resolution helper the MCP handler uses. Confirmed. | none |
| tasks | inventory | LOW | manual | The plan enumerates exactly 6 tasks t1–t6. | Six task sections S006:T001–T006 present; t1–t5 implementation + t6 cross-surface tests. Confirmed. | none |
| tasks | ordering | LOW | manual | The task dependency DAG is acyclic and well-formed: t1(—), t2(—); t3->t1,t2; t4->t1; t5->t2,t4; t6->t3,t4,t5. | DAG: t1(—), t2(—); t3->t1,t2; t4->t1; t5->t2,t4; t6->t3,t4,t5. Acyclic, every dep precedes its dependent; t6 correctly gathers all three surfaces before the parity/equivalence tests. Confirmed. | none |
| t5 | semantic | LOW | manual | DOCGEN_OUTCOME_SCHEMA and RENDERED_DOCUMENT_SHELL_SCHEMA in src/docgen/schema.ts are the shapes the insrc_docgen MCP tool uses for its output. | schema.ts:34 DOCGEN_OUTCOME_SCHEMA (oneOf) + RENDERED_DOCUMENT_SHELL_SCHEMA — the MCP output shapes t5 uses. Confirmed. | none |
| t1 | semantic | LOW | manual | The sc4 DocGenOutcome source-not-ready variant already exists (sourceNotReady constructor), so t1 reuses it rather than adding a new variant. | outcome.ts:48 `sourceNotReady = <T>(reason) => ({ status: 'source-not-ready', reason })` — the sc4 variant t1 reuses; no new variant. Confirmed. | none |
