<!-- insrc:artifact LLD-581e07f5fb79532c-S001 -->

# LLD: E20261030581e07f5:S001

## Summary

**Epic:** `shared-insors-branded-light-dark-mermaid`
**HLD base run:** `wf-1793373679644-3i614w`
**HLD effective hash:** `581e07f5fb79...`

One versioned Insors-branded theme policy module drives both artifact shells (workflow companions + docgen): exact brand tokens with coordinated light/dark variants and a persisted manual override, packaged Poppins 400/600/700 (offline, base64-inlined), semantic role colors with a legend only where the structured source carries roles, ER label contrast overrides, label wrapping and node sizing, a density policy with overview+detail for dense graphs, readable initial scale (>=16px labels) with fit as a separate action, keyboard-accessible controls, full-SVG export with embedded styling, honest error states, measured contrast pairs, and a theme version stamp — all offline with strict Mermaid security unchanged.

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

**Framework:** Standalone triage-routed feature story (no HLD): two artifact shells + shared theme module + asset pipeline.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `renderCompanionPage`

```typescript
(header: CompanionHeader, page: CompanionPageContent, runtime: CompanionRuntime) => string
```

**Parameters:**
- `header: CompanionHeader` — page header
- `page: CompanionPageContent` — kind content + visual
- `runtime: CompanionRuntime` — inlined runtimes

**Returns:** `string` — branded theme-aware version-stamped self-contained HTML

**Errors:**
- `DiagramGenerationError` when runtime asset unreadable

**Preconditions:**
- runtime assets under out/assets

**Postconditions:**
- no theme neutral/#f3f5f8; insrc-theme meta; legend iff roles present

### 2.2 `assembleShell`

```typescript
(ir: DocumentIR, renderer?: SubprocessRenderer) => Promise<DocGenOutcome<RenderedDocumentShell>>
```

**Parameters:**
- `ir: DocumentIR` — derived IR
- `renderer: SubprocessRenderer` _(optional)_ — oversized subprocess renderer

**Returns:** `Promise<DocGenOutcome<RenderedDocumentShell>>` — branded shell on primary + fallback paths

**Errors:**
- `fallback-unavailable` when runtime missing / no renderer for oversized IR

**Preconditions:**
- docgen runtime assets present

**Postconditions:**
- inlinedRuntimeVersion reported; insrc-theme meta added

### 2.3 `themePolicy (src/artifact-theme/theme.ts)`

```typescript
THEME_VERSION; BRAND; CONTRAST_PAIRS{light,dark}; ROLE_PALETTE; mermaidConfigFor(mode); pageCssFor(mode); DIAGRAM_OVERRIDES_CSS; LEGEND_CSS; FONT_FACE_CSS; viewerBootScript(opts); exportableSvg(svg,mode)
```

**Parameters:**
- `mode: "light"|"dark"` — variant

**Returns:** `object|string` — centralized policy pieces inlined by both shells

**Preconditions:**
- Poppins woff2 read from src/assets/fonts/poppins, embedded base64

**Postconditions:**
- no remote URL; CONTRAST_PAIRS documented (NFR1)

## 3. Data model changes

### 3.1 `ArtifactThemePolicy` — new

6 exact brand tokens; derived light/dark surfaces; per-mode Mermaid themeVariables (base theme, Poppins, fontSize); ROLE_PALETTE (internal/data-store/external/note) applied only when role metadata exists + legend markup; CONTRAST_PAIRS measured per mode (NFR1); DIAGRAM_OVERRIDES (ER relationshipLabel dark-on-Crayola both modes); FONT_FACE_CSS (3 base64 woff2); page CSS scoped under .insrc-artifact (R15); viewer boot: auto color-scheme + persisted override + safe re-render preserving pan/zoom + fonts.ready before run + readable initial scale (>=16px, fit separate) + density policy + export + error-with-source

**Call sites:**
- `src/workflow/artifacts/companion/shell.ts`
- `src/docgen/render/shell.ts`
- `src/docgen/render/fallback.ts`

### 3.2 `Poppins font assets` — new

src/assets/fonts/poppins/{400,600,700}.woff2 (OFL-1.1) shipped by copy-assets.mjs, embedded base64

**Call sites:**
- `copy-assets.mjs`
- `src/artifact-theme/fonts.ts`

## 4. Error paths

**Error cases**

- **mermaid.run rejects** (recoverable)
  - Detection: run() rejects
  - Response: actionable error + show-source (R13)
  - User impact: error+source visible
- **font asset missing at generation** (recoverable)
  - Detection: fonts.ts read fails
  - Response: system-sans fallback, still embedded, logged (NFR3)
  - User impact: typeface only
- **fonts.ready hangs** (recoverable)
  - Detection: timeout race
  - Response: render fallback; re-frame when fonts resolve
  - User impact: brief fallback render
- **theme switch mid-view** (recoverable)
  - Detection: toggle
  - Response: re-init + re-run same source; restore pan/zoom; persist (R9)
  - User impact: same-position re-render
- **export** (recoverable)
  - Detection: export control
  - Response: full svg + embedded font style + explicit background (R12)
  - User impact: standalone readable export
- **huge diagram perf** (recoverable)
  - Detection: re-render guard + debounced resize
  - Response: no render loops (NFR5); oversized -> existing subprocess fallback (R8)
  - User impact: stable large diagrams

**Edge cases**

| Input | Expected |
| :--- | :--- |
| fit would shrink labels below 16px | initial scale clamps to readable; Fit stays separate (R6/R11) |
| long/multiline labels | wrap where supported; node/row sized to content; no clip/loss (R7) |
| dense graph | orientation/spacing/grouping; overview+detail or oversized fallback; truncation disclosed (R8) |
| narrow viewport | toolbar wraps; keyboard focus visible (NFR2); re-frame without overriding manual zoom |
| ER dark mode | relationship labels dark-on-Crayola via override; connectors >=3:1 (NFR1) |
| host page CSS | artifact CSS scoped under .insrc-artifact (R15) |
| malicious label/config | escapeHtml + strict + validated constant config; negative tests (NFR6) |
| no role metadata | coherent default style; no invented roles; no legend (R4) |

**Invariants to preserve**

- securityLevel strict; no author-supplied CSS/JS/config executed [[c4]]
- no remote URL; runtimes+fonts inlined [[c3]]
- entities/edges/labels/order/cardinalities/approval history untouched (NFR4) [[c4]]
- pan/zoom runtimes reused [[c1]]
- old saved artifacts readable, never auto-rewritten (R14) [[c4]]

## 5. Test strategy

**Test framework:** `node:test via tsx`

**Test levels**

- **unit** — tokens, contrast pairs (NFR1), role palette+legend, variants, ER override, fonts, version
  - Subjects: `src/artifact-theme/__tests__/theme.test.ts`, `src/artifact-theme/__tests__/fonts.test.ts`, `src/artifact-theme/__tests__/contrast.test.ts`
- **unit** — shells consume policy; scoped CSS; controls; no remote URLs; escaping negatives; legend iff roles
  - Subjects: `src/workflow/artifacts/companion/__tests__/shell.test.ts`, `src/docgen/render/__tests__/shell.test.ts`
- **unit** — readable-scale clamp + density config + oversized routing
  - Subjects: `src/artifact-theme/__tests__/viewer-script.test.ts`, `src/docgen/render/__tests__/shell.test.ts`
- **integration** — boot script node --check; export standalone svg; structural-preservation fixture (NFR4)
  - Subjects: `src/artifact-theme/__tests__/viewer-script.test.ts`, `src/workflow/artifacts/companion/__tests__/shell.test.ts`
- **live** — perf baseline render/theme-switch on 3 fixture sizes (NFR5)
  - Subjects: `src/artifact-theme/__tests__/perf.integration.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `R1` | `theme.test.ts single THEME_VERSION; both shells same module` |
| `R2` | `variants; data-theme + toggle + persistence` |
| `R3` | `contrast.test.ts pairs both modes; ER override` |
| `R4` | `ROLE_PALETTE+legend tests; legend iff roles; no invented roles` |
| `R5` | `config only 10.9.1-supported settings; runtime.json unchanged` |
| `R6` | `fonts.test.ts; fonts.ready gate; readable-scale clamp test` |
| `R7` | `wrap/sizing config + long-label fixture assertions` |
| `R8` | `oversized routing intact; density config; disclosed truncation` |
| `R9` | `theme switch re-runs same source; transform restored; definition unchanged` |
| `R10` | `controls + keyboard + focus (NFR2)` |
| `R11` | `initial scale clamp; re-frame without overriding manual zoom` |
| `R12` | `export test: full svg, font style, background, complete` |
| `R13` | `error + show-source; no empty success` |
| `R14` | `insrc-theme meta = THEME_VERSION; old artifact parses` |
| `R15` | `scoped CSS; no remote URL; malicious-label escape` |
| `NFR1` | `contrast.test.ts computed ratios incl. notes/labels/states` |
| `NFR2` | `keyboard/focus tests; grayscale documented` |
| `NFR3` | `offline font assets; no CDN reference in html` |
| `NFR4` | `structural-preservation fixture pre/post theme` |
| `NFR5` | `perf.integration.test.ts timings 3 sizes` |
| `NFR6` | `negative tests: label/config/link injection; strict asserted` |

## 6. Migration

**State before:** theme neutral + fixed light CSS; no fonts/version/roles/contrast record

**State after:** both shells inline the versioned branded policy incl. fonts, role palette+legend, contrast pairs, controls, export, version stamp

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. add theme module + font assets — ↩ rollbackable
2. rewire shells + tests — ↩ rollbackable
3. regenerate new artifacts; old ones readable (R14) — ↩ rollbackable

**Backward compat:** old saved HTML unchanged; single-file output; presentation-only

## 7. Alternatives considered

### 7.1 a1: Shared versioned theme-policy module inlined by both shells — **CHOSEN**

one module owns the whole policy

src/artifact-theme + assets

### 7.2 a2: shared JSON + per-shell CSS

theme JSON only

asset JSON

**Rejected because:** violates R1/R2/R6

### 7.3 a3: built-in themes only

dark/neutral switch

init config

**Rejected because:** fails R1-R4/R12

## 8. References

- **[[c1]]** `file` `src/workflow/artifacts/companion/shell.ts`
- **[[c2]]** `file` `src/docgen/render/shell.ts`
- **[[c3]]** `file` `src/assets/docgen/runtime.json`
- **[[c4]]** `doc` `plans/mermaid-theme-and-readability-requirements.md`
- **[[c5]]** `doc` `docs/previews/mermaid-themes/insors-mermaid-themes.json`

## 9. Open questions

- exact readable-scale formula for extreme sizes (default: clamp so labels >=16px; fit separate)
- theme persistence scope (localStorage per origin)

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 do not hold · 0 could not be verified · 8 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T15:23:34.503Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | The change-site inventory (§3.1: companion/shell.ts, docgen/render/shell.ts, docgen/render/fallback.ts) is complete for one shared DIAGRAM_OVERRIDES_CSS string (notably the ER relationship-label dark-on-Crayola override) to apply correctly in both rendering shells. | The companion shell wraps the diagram in `<div class="stage" id="stage">` (src/workflow/artifacts/companion/shell.ts:251), while docgen's primary shell wraps it in `<div id="docgen-diagram">` (src/docgen/render/shell.ts:235) — two different container selectors. A single shared override CSS scoped (per the design's own reference, c5) to `.stage svg .relationshipLabel`/`.relationshipLabelBox` only matches the companion DOM. Nothing in §2.3/§3.1/§4 of this LLD adds a DOM-harmonization change (a shared wrapper class/id) to either shell, so the shared CSS would silently fail to apply the ER contrast fix in one of the two rendering paths — reproducing exactly the R3 defect the story exists to fix. This exact HIGH defect was already raised against the immediately-prior draft of this same story (LLD-402fecfe37bc6ad9-S001, claim change-sites.2) and remains unaddressed in this draft. [files: src/workflow/artifacts/companion/shell.ts, src/docgen/render/shell.ts, src/docgen/render/fallback.ts] | Read the exact container markup in companion/shell.ts and docgen/render/shell.ts (both already read in full) and compared selectors; cross-checked against the prior sibling draft's recorded review finding for the same gap. |

#### Could not verify (does not block)

_None._
