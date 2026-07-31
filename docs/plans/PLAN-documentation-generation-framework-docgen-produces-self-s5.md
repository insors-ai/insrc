<!-- insrc:artifact PLAN-870ed3dd246225f4-s5 -->

# Plan: E20260731870ed3dd:S005

**Epic:** `documentation-generation-framework-docgen-produces-self`
**LLD run:** `wf-1785490467999-w4m1s6`
**LLD effective hash:** `cb5b27744db2...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add OVERSIZED_LIMIT + oversized() to new fallback.ts | S | — | unit: oversized(ir): false at count <= limit (boundary uses primary), true above it (ac4/ac1); the default OVERSIZED_LIMIT is applied when no limit passed | [[c1]] [[c9]] [[c13]] |
| 2 | **`t2`** Add toGraphvizDot() IR-to-DOT emitter to fallback.ts | S | `t1` | unit: toGraphvizDot(ir): a valid digraph over derived nodes/edges (n<i> aliases, one edge per IrEdge); DOT-hostile label chars are escaped | [[c2]] [[c10]] [[c15]] |
| 3 | **`t3`** Add SubprocessRenderResult/SubprocessRenderer + graphvizSubprocessRenderer to fallback.ts | M | `t1` | unit: graphvizSubprocessRenderer.renderSvg: probes dot then d2 with shell:false/fixed args/stdin-only DOT, maps dual-ENOENT to unavailable(triedBinaries), and maps nonzero-exit/timeout+SIGKILL to unavailable(reason) without throwing (uses a mocked child_process.spawn) | [[c3]] [[c4]] [[c7]] [[c16]] |
| 4 | **`t4`** Add assembleFallbackShell() to fallback.ts | S | `t1` | unit: assembleFallbackShell(ir, svg, ...): sc3 shape backend='fallback-subprocess', diagramFormat='svg', supportsZoomPan=true, inlinedRuntimeVersion=svgPanZoom version; the <svg> + svg-pan-zoom inlined, no <script src= (ac2) | [[c5]] [[c11]] [[c14]] |
| 5 | **`t5`** Extend assembleShell() with oversized primary-vs-fallback dispatch | M | `t2`, `t3`, `t4` | unit: assembleShell(small IR) -> primary path, backend='primary-inline', byte-identical to the pre-s5 output (ac4); unit: assembleShell(oversized IR, fake renderer returning ok svg) -> backend='fallback-subprocess', inlined SVG + svg-pan-zoom (ac1/ac2); unit: assembleShell(oversized IR, fake renderer returning unavailable) -> DocGenOutcome 'fallback-unavailable' naming the tried binaries + remedy (ac3) | [[c6]] [[c8]] [[c12]] [[c13]] [[c14]] |
| 6 | **`t6`** Add live-gated end-to-end test for oversized-scope fallback rendering | S | `t3`, `t5` | live: graphvizSubprocessRenderer.renderSvg(dot) with a real 'dot'/'d2' on PATH -> {status:'ok', svg} containing an <svg root; live: generateDocument for an oversized component-dependency scope -> ok fallback shell, self-contained offline HTML | [[c8]] |

### E20260731870ed3dd:S005:T001 — Add OVERSIZED_LIMIT + oversized() to new fallback.ts

Create src/docgen/render/fallback.ts (new module) and implement the fixed legibility threshold: the OVERSIZED_LIMIT constant and the pure oversized(ir, limit?) predicate over ir.derived node+edge counts.

**Acceptance checks:**
- oversized(ir) returns false when ir.derived.nodes.length + ir.derived.edges.length is exactly at OVERSIZED_LIMIT (strict > semantics, boundary keeps primary path)
- oversized(ir) returns true when the combined count exceeds OVERSIZED_LIMIT
- oversized(ir, limit) honors an explicitly injected limit, overriding the default OVERSIZED_LIMIT
- oversized() performs no I/O and is deterministic for a given IR

### E20260731870ed3dd:S005:T002 — Add toGraphvizDot() IR-to-DOT emitter to fallback.ts

Implement toGraphvizDot(ir) in fallback.ts: emits a Graphviz DOT digraph over ir.derived nodes/edges using short n0,n1,... aliases (never raw entity ids) with DOT-escaped labels.

**Acceptance checks:**
- toGraphvizDot(ir) emits one DOT node per ir.derived node using n<i> aliases and one 'from->to' edge per ir.derived edge
- node labels containing DOT-hostile characters (quotes, backslashes, newlines) are escaped and yield well-formed, parseable DOT
- toGraphvizDot() performs no I/O and only reflects graph-derived content (no narrated/invented text)

### E20260731870ed3dd:S005:T003 — Add SubprocessRenderResult/SubprocessRenderer + graphvizSubprocessRenderer to fallback.ts

Implement the s5-internal SubprocessRenderResult union, the SubprocessRenderer seam interface, and the production graphvizSubprocessRenderer that probes 'dot -Tsvg' then 'd2 - -' via child_process.spawn (shell:false, fixed args, DOT on stdin, bounded by a timeout with SIGKILL), returning ok/unavailable without throwing.

**Acceptance checks:**
- graphvizSubprocessRenderer.renderSvg spawns 'dot -Tsvg' first with shell:false and fixed literal args, feeding DOT only via stdin (no shell interpolation)
- on ENOENT from 'dot', the renderer probes 'd2 - -' next and returns {status:'ok', svg, tool:'d2'} on its success
- when both 'dot' and 'd2' fail with ENOENT, renderSvg returns {status:'unavailable', triedBinaries:['dot','d2']}
- a non-ENOENT failure (nonzero exit code, or a hang past the timeout killed with SIGKILL) resolves to {status:'unavailable', reason:<captured stderr/timeout>} rather than throwing or hanging the caller

### E20260731870ed3dd:S005:T004 — Add assembleFallbackShell() to fallback.ts

Implement assembleFallbackShell(ir, svg, svgPanZoom, svgPanZoomVersion) in fallback.ts: pure assembly of the sc3 RenderedDocumentShell shape with the given SVG inlined directly plus the svg-pan-zoom bundle and init call, no Mermaid.

**Acceptance checks:**
- assembleFallbackShell returns a RenderedDocumentShell with backend='fallback-subprocess', diagramFormat='svg', supportsZoomPan=true, inlinedRuntimeVersion=svgPanZoomVersion
- the returned shell inlines the given svg markup and svgPanZoom bundle directly with no <script src= (no CDN/network reference)
- assembleFallbackShell performs no I/O; title/docType-derived fields come from ir (docType + scopeDescription)

### E20260731870ed3dd:S005:T005 — Extend assembleShell() with oversized primary-vs-fallback dispatch

In src/docgen/render/shell.ts, add the optional renderer?: SubprocessRenderer param (defaulting to graphvizSubprocessRenderer) and the oversized(ir) branch ahead of the existing primary path: on !oversized(ir) keep the unchanged primary-inline path; on oversized(ir) call toGraphvizDot + renderer.renderSvg and map {status:'ok'} to ok(assembleFallbackShell(...)) or {status:'unavailable'} to the sc4 fallback-unavailable outcome naming tried binaries + remedy.

**Acceptance checks:**
- assembleShell(ir) with !oversized(ir) is byte-identical to the pre-s5 primary-inline path (backend='primary-inline'); the subprocess renderer is never invoked
- assembleShell(ir) with oversized(ir) true and a renderer returning {status:'ok'} returns ok(assembleFallbackShell(...)) with backend='fallback-subprocess'
- assembleShell(ir) with oversized(ir) true and a renderer returning {status:'unavailable'} returns the sc4 DocGenOutcome fallback-unavailable variant naming the tried binaries and an install remedy, emitting no document
- assembleShell accepts an injected renderer for tests and defaults to graphvizSubprocessRenderer when omitted
- the existing loadRuntime-missing failure path (svg-pan-zoom asset absent) is preserved unchanged and still maps to fallback-unavailable
- generateDocument's existing call to assembleShell(ir) in src/docgen/index.ts continues to compile and pass its own tests unchanged with the new optional renderer param, with no edit required to generateDocument's signature or behavior

### E20260731870ed3dd:S005:T006 — Add live-gated end-to-end test for oversized-scope fallback rendering

Write the testStrategy's 'live' test level: a test invoking graphvizSubprocessRenderer.renderSvg against a real dot/d2 binary on PATH, and a test running generateDocument end-to-end for an oversized component-dependency scope, both gated to skip cleanly (not fail) when neither binary is present, per the repo's live-test skip convention.

**Acceptance checks:**
- a live-gated test invokes graphvizSubprocessRenderer.renderSvg(dot) against a real dot or d2 binary on PATH and asserts {status:'ok'} with svg containing a well-formed <svg> root element
- a live-gated test runs generateDocument for an oversized component-dependency scope end-to-end and asserts an ok DocGenOutcome with backend='fallback-subprocess' is produced
- both live tests skip cleanly (not fail, not error) when neither dot nor d2 is present on PATH, following the repo's live-test env-var skip convention
- the live-gated suite does not run by default in the fast test sweep and requires no network access

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| oversized(ir): false at count <= limit (boundary uses primary), true above it (ac4/ac1); the default OVERSIZED_LIMIT is applied when no limit passed | `t1` |
| toGraphvizDot(ir): a valid digraph over derived nodes/edges (n<i> aliases, one edge per IrEdge); DOT-hostile label chars are escaped | `t2` |
| assembleFallbackShell(ir, svg, ...): sc3 shape backend='fallback-subprocess', diagramFormat='svg', supportsZoomPan=true, inlinedRuntimeVersion=svgPanZoom version; the <svg> + svg-pan-zoom inlined, no <script src= (ac2) | `t4` |
| assembleShell(small IR) -> primary path, backend='primary-inline', byte-identical to the pre-s5 output (ac4) | `t5` |
| assembleShell(oversized IR, fake renderer returning ok svg) -> backend='fallback-subprocess', inlined SVG + svg-pan-zoom (ac1/ac2) | `t5` |
| assembleShell(oversized IR, fake renderer returning unavailable) -> DocGenOutcome 'fallback-unavailable' naming the tried binaries + remedy (ac3) | `t5` |
| graphvizSubprocessRenderer.renderSvg(dot) with a real 'dot'/'d2' on PATH -> {status:'ok', svg} containing an <svg root | `t6` |
| generateDocument for an oversized component-dependency scope -> ok fallback shell, self-contained offline HTML | `t6` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s5 oversized-predicate definition` — "the fixed legibility threshold: the OVERSIZED_LIMIT constant and the pure oversized(ir, limit?) predicate over ir.derived node+edge counts"
- **[[c9]]** `prior-artifact` `LLD s5 oversized-predicate boundary semantics` — "oversized(ir) returns false when ir.derived.nodes.length + ir.derived.edges.length is exactly at OVERSIZED_LIMIT (strict > semantics, boundary keeps primary path)"
- **[[c13]]** `prior-artifact` `LLD s5 primary-path preservation guarantee` — "assembleShell(ir) with !oversized(ir) is byte-identical to the pre-s5 primary-inline path (backend='primary-inline'); the subprocess renderer is never invoked"
- **[[c2]]** `prior-artifact` `LLD s5 toGraphvizDot emitter spec` — "emits a Graphviz DOT digraph over ir.derived nodes/edges using short n0,n1,... aliases (never raw entity ids) with DOT-escaped labels"
- **[[c10]]** `prior-artifact` `LLD s5 DOT label escaping requirement` — "node labels containing DOT-hostile characters (quotes, backslashes, newlines) are escaped and yield well-formed, parseable DOT"
- **[[c15]]** `prior-artifact` `LLD s5 graph-derived-only content constraint` — "toGraphvizDot() performs no I/O and only reflects graph-derived content (no narrated/invented text)"
- **[[c3]]** `prior-artifact` `LLD s5 dot->d2 probe fallback order` — "on ENOENT from 'dot', the renderer probes 'd2 - -' next and returns {status:'ok', svg, tool:'d2'} on its success"
- **[[c4]]** `prior-artifact` `LLD s5 subprocess spawn safety (shell:false)` — "graphvizSubprocessRenderer.renderSvg spawns 'dot -Tsvg' first with shell:false and fixed literal args, feeding DOT only via stdin (no shell interpolation)"
- **[[c7]]** `prior-artifact` `LLD s5 timeout/SIGKILL failure mapping` — "a non-ENOENT failure (nonzero exit code, or a hang past the timeout killed with SIGKILL) resolves to {status:'unavailable', reason:<captured stderr/timeout>} rather than throwing or hanging the caller"
- **[[c16]]** `prior-artifact` `LLD s5 dual-ENOENT unavailable mapping` — "when both 'dot' and 'd2' fail with ENOENT, renderSvg returns {status:'unavailable', triedBinaries:['dot','d2']}"
- **[[c5]]** `prior-artifact` `LLD s5 assembleFallbackShell sc3 shape` — "assembleFallbackShell returns a RenderedDocumentShell with backend='fallback-subprocess', diagramFormat='svg', supportsZoomPan=true, inlinedRuntimeVersion=svgPanZoomVersion"
- **[[c11]]** `prior-artifact` `LLD s5 offline-inlining / no-CDN constraint` — "the returned shell inlines the given svg markup and svgPanZoom bundle directly with no <script src= (no CDN/network reference)"
- **[[c14]]** `prior-artifact` `LLD s5 renderer-injection seam (default graphvizSubprocessRenderer)` — "assembleShell accepts an injected renderer for tests and defaults to graphvizSubprocessRenderer when omitted"
- **[[c6]]** `prior-artifact` `LLD s5 assembleShell oversized-dispatch branch` — "add the optional renderer?: SubprocessRenderer param (defaulting to graphvizSubprocessRenderer) and the oversized(ir) branch ahead of the existing primary path"
- **[[c8]]** `prior-artifact` `LLD s5 live-test skip convention` — "both live tests skip cleanly (not fail, not error) when neither dot nor d2 is present on PATH, following the repo's live-test env-var skip convention"
- **[[c12]]** `prior-artifact` `LLD s5 sc4 fallback-unavailable outcome shape` — "assembleShell(ir) with oversized(ir) true and a renderer returning {status:'unavailable'} returns the sc4 DocGenOutcome fallback-unavailable variant naming the tried binaries and an install remedy, em"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 10 LOW** · model `client` · reviewed 2026-07-31T10:22:22.210Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| t1 | citation | LOW | manual | src/docgen/render/fallback.ts does NOT yet exist — t1 creates it as a new module. | src/docgen/render/fallback.ts read found:False; no OVERSIZED_LIMIT/oversized in src/. Correctly a NEW module t1 creates. Confirmed. | none |
| t5 | citation | LOW | manual | src/docgen/render/shell.ts today exports assembleShell taking a single DocumentIR arg; t5 extends it with an optional renderer param + oversized branch. | shell.ts:225 = `export async function assembleShell(ir: DocumentIR)` — single-arg today; t5's optional-renderer extension is a clean superset. Confirmed. | none |
| t5 | cross-artifact | LOW | manual | generateDocument in src/docgen/index.ts calls assembleShell(ir.value) and stays unchanged when assembleShell gains an optional renderer param. | src/docgen/index.ts:72 = `return assembleShell(ir.value);` — the single call site; an optional renderer param leaves it compiling unchanged. Confirmed. | none |
| t4 | semantic | LOW | manual | RenderedDocumentShell (src/docgen/types.ts) carries backend, diagramFormat, supportsZoomPan, inlinedRuntimeVersion fields, and RenderBackend already includes 'fallback-subprocess', so assembleFallbackShell can populate the sc3 shape without a type change. | types.ts:110 RenderBackend includes 'fallback-subprocess'; schema.ts:23 enum matches; diagramFormat/supportsZoomPan/inlinedRuntimeVersion are established sc3 fields (generate/schema tests). No type change needed. Confirmed. | none |
| t5 | citation | LOW | manual | src/docgen/outcome.ts exports fallbackUnavailable(reason, remedy) which t5's oversized-but-unavailable branch returns. | outcome.ts:49 = `export const fallbackUnavailable = <T>(reason, remedy)`; already unit-tested (outcome.test.ts:68). Confirmed. | none |
| t3 | external-contract | LOW | manual | Node child_process.spawn supports shell:false + fixed argv + stdin piping + an 'error' event carrying code ENOENT for a missing binary and SIGKILL termination — the contract graphvizSubprocessRenderer relies on; the pattern already exists at exec-detached.ts:115. | spawn(shell:false) at logs.ts/k8s/exec-detached.ts:115; ENOENT handling at cli-provider.ts:442; SIGKILL-on-timeout at cli-provider.ts:462. The Node spawn contract the renderer leans on is real and precedented. Confirmed. | none |
| tasks | inventory | LOW | manual | The plan enumerates exactly 6 tasks t1–t6, of which t1–t5 are implementation and t6 is the live-gated test. | Task sections T001–T006 present (6 tasks); t1–t5 implementation + t6 live test. Confirmed. | none |
| tasks | ordering | LOW | manual | The task dependency DAG is acyclic and well-formed: t1 has no deps; t2/t3/t4 depend on t1; t5 depends on t2,t3,t4; t6 depends on t3,t5. | DAG: t1(—); t2,t3,t4->t1; t5->t2,t3,t4; t6->t3,t5. Acyclic, every dep precedes its dependent, t5 correctly gathers the three fallback.ts pieces before the dispatch. Confirmed. | none |
| t2 | semantic | LOW | manual | The n0/n1 alias pattern toGraphvizDot mirrors exists in documentIRToMermaid at src/docgen/render/shell.ts:140. | shell.ts:140 = `ir.derived.nodes.forEach((n, i) => alias.set(n.id, `n${i}`));` — the n0/n1 aliasing toGraphvizDot mirrors. Confirmed. | none |
| t4 | semantic | LOW | manual | loadRuntime in shell.ts exposes the svg-pan-zoom bundle bytes + svgPanZoomVersion from the manifest, the inputs assembleFallbackShell requires. | shell.ts:33 RuntimeManifest.svgPanZoomVersion; runtime.json:3 '3.6.2'; loadRuntime returns {manifest,mermaid,svgPanZoom}. assembleFallbackShell's inputs are available. Confirmed. | none |
