<!-- insrc:artifact LLD-60695d938905dd77-S001 -->

# LLD: E2026103060695d93:S001

## Summary

**Epic:** `shared-insors-branded-light-dark-mermaid`
**HLD base run:** `wf-1793374031177-9dg22y`
**HLD effective hash:** `60695d938905...`

One versioned Insors-branded theme policy module drives both artifact shells with a harmonized DOM: both shells render the page under .insrc-artifact and the diagram inside .insrc-diagram (companion keeps #stage, docgen keeps #docgen-diagram for pan/zoom wiring), so the shared override CSS — including the ER relationship-label dark-on-Crayola fix — applies identically in both paths. Plus light/dark variants with persisted override, packaged Poppins, role palette + legend only when roles exist, wrap/sizing, density policy, readable initial scale with separate fit, keyboard controls, full-SVG export, error states, measured contrast pairs, version stamp — offline, strict security unchanged.

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

**Framework:** Standalone triage-routed feature story (round 3): two artifact shells + shared theme module + asset pipeline + harmonized DOM classes.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `renderCompanionPage`

```typescript
(header: CompanionHeader, page: CompanionPageContent, runtime: CompanionRuntime) => string
```

**Parameters:**
- `header: CompanionHeader` — header
- `page: CompanionPageContent` — content+visual
- `runtime: CompanionRuntime` — inlined runtimes

**Returns:** `string` — branded version-stamped HTML with .insrc-artifact root + .insrc-diagram wrapper

**Errors:**
- `DiagramGenerationError` when runtime asset unreadable

**Preconditions:**
- runtime assets under out/assets

**Postconditions:**
- no theme neutral/#f3f5f8; shared classes present; insrc-theme meta

### 2.2 `assembleShell`

```typescript
(ir: DocumentIR, renderer?: SubprocessRenderer) => Promise<DocGenOutcome<RenderedDocumentShell>>
```

**Parameters:**
- `ir: DocumentIR` — derived IR
- `renderer: SubprocessRenderer` _(optional)_ — oversized renderer

**Returns:** `Promise<DocGenOutcome<RenderedDocumentShell>>` — same branded shell, primary + fallback, shared classes

**Errors:**
- `fallback-unavailable` when runtime missing / no renderer

**Preconditions:**
- docgen runtime assets

**Postconditions:**
- insrc-theme meta; shared classes present

### 2.3 `themePolicy (src/artifact-theme/theme.ts)`

```typescript
THEME_VERSION; BRAND; CONTRAST_PAIRS{light,dark}; ROLE_PALETTE; mermaidConfigFor(mode); pageCssFor(mode); DIAGRAM_OVERRIDES_CSS; LEGEND_CSS; FONT_FACE_CSS; viewerBootScript(opts); exportableSvg(svg,mode)
```

**Parameters:**
- `mode: "light"|"dark"` — variant

**Returns:** `object|string` — policy pieces scoped to .insrc-artifact/.insrc-diagram so they match both shells

**Preconditions:**
- Poppins woff2 read + base64

**Postconditions:**
- no remote URL; overrides use shared classes

## 3. Data model changes

### 3.1 `ArtifactThemePolicy` — new

6 brand tokens; derived surfaces; per-mode mermaid themeVariables; ROLE_PALETTE + legend iff roles; CONTRAST_PAIRS (NFR1); ER override (dark text on Crayola both modes); fonts; page CSS scoped under .insrc-artifact; diagram wrapper .insrc-diagram in both shells; viewer boot (auto theme + persist + safe re-render + fonts.ready + readable scale + fit action + export + error)

**Call sites:**
- `src/workflow/artifacts/companion/shell.ts`
- `src/docgen/render/shell.ts`
- `src/docgen/render/fallback.ts`

### 3.2 `Poppins font assets` — new

src/assets/fonts/poppins/{400,600,700}.woff2 (OFL-1.1) via copy-assets.mjs, base64-inlined

**Call sites:**
- `copy-assets.mjs`
- `src/artifact-theme/fonts.ts`

## 4. Error paths

**Error cases**

- **mermaid.run rejects** (recoverable)
  - Detection: run() rejects
  - Response: error + show-source (R13)
  - User impact: error+source visible
- **font asset missing** (recoverable)
  - Detection: fonts.ts read fails
  - Response: system-sans fallback, embedded, logged (NFR3)
  - User impact: typeface only
- **fonts.ready hangs** (recoverable)
  - Detection: timeout
  - Response: render fallback; re-frame when ready
  - User impact: brief fallback
- **theme switch mid-view** (recoverable)
  - Detection: toggle
  - Response: re-init + re-run same source; restore pan/zoom; persist (R9)
  - User impact: same-position re-render
- **export** (recoverable)
  - Detection: export control
  - Response: full svg + font style + background (R12)
  - User impact: standalone export
- **override CSS selector matches only one shell DOM** (recoverable)
  - Detection: regression test: both outputs carry .insrc-artifact/.insrc-diagram and the selector matches both
  - Response: build fails at test time (round-2 HIGH guard)
  - User impact: none

**Edge cases**

| Input | Expected |
| :--- | :--- |
| fit shrinks labels <16px | clamp readable; fit separate (R6/R11) |
| long labels | wrap + sized nodes (R7) |
| dense graph | density policy / overview+detail / disclosed truncation (R8) |
| narrow viewport | wrapping toolbar; keyboard focus (NFR2) |
| ER dark mode | dark-on-Crayola in both shells via shared class (R3) |
| host CSS | scoped under .insrc-artifact (R15) |
| malicious label/config | escape + strict + constant config (NFR6) |
| no role metadata | default style; no invented roles; no legend (R4) |

**Invariants to preserve**

- securityLevel strict; no author CSS/JS/config executed [[c4]]
- no remote URL; runtimes+fonts inlined [[c3]]
- semantics/entities/edges/labels/history untouched (NFR4) [[c4]]
- pan/zoom runtimes reused; #stage/#docgen-diagram ids kept [[c1]]
- old artifacts readable, never auto-rewritten (R14) [[c4]]

## 5. Test strategy

**Test framework:** `node:test via tsx`

**Test levels**

- **unit** — tokens/contrast/roles/variants/ER override/fonts/version/shared-class scoping
  - Subjects: `src/artifact-theme/__tests__/theme.test.ts`, `src/artifact-theme/__tests__/fonts.test.ts`, `src/artifact-theme/__tests__/contrast.test.ts`
- **unit** — both shell outputs contain shared classes and override selector matches both DOMs; no theme neutral/#f3f5f8; controls; no remote URLs; escaping
  - Subjects: `src/workflow/artifacts/companion/__tests__/shell.test.ts`, `src/docgen/render/__tests__/shell.test.ts`
- **unit** — readable clamp + density + oversized routing
  - Subjects: `src/artifact-theme/__tests__/viewer-script.test.ts`
- **integration** — boot node --check; export svg; structural preservation (NFR4)
  - Subjects: `src/artifact-theme/__tests__/viewer-script.test.ts`
- **live** — perf baselines (NFR5)
  - Subjects: `src/artifact-theme/__tests__/perf.integration.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `R1` | `single THEME_VERSION; both shells same module` |
| `R2` | `variants; toggle + persistence` |
| `R3` | `contrast pairs; ER override matches both DOMs via shared classes` |
| `R4` | `role palette + legend iff roles` |
| `R5` | `10.9.1-supported only; runtime.json unchanged` |
| `R6` | `fonts.test.ts; fonts.ready gate; readable clamp` |
| `R7` | `wrap/sizing + long-label fixture` |
| `R8` | `oversized routing; density; disclosed truncation` |
| `R9` | `theme switch re-runs same source; transform restored` |
| `R10` | `controls + keyboard + focus (NFR2)` |
| `R11` | `initial clamp; re-frame w/o overriding manual zoom` |
| `R12` | `export full svg + font style + background` |
| `R13` | `error + show-source` |
| `R14` | `insrc-theme meta; old artifact parses` |
| `R15` | `scoped CSS; no remote URL; malicious-label test` |
| `NFR1` | `contrast.test.ts ratios` |
| `NFR2` | `keyboard/focus; grayscale` |
| `NFR3` | `offline assets; no CDN` |
| `NFR4` | `structural preservation fixture` |
| `NFR5` | `perf.integration.test.ts` |
| `NFR6` | `negative injection tests; strict asserted` |

## 6. Migration

**State before:** theme neutral + fixed light CSS

**State after:** shared branded policy + shared DOM classes; fonts; contrast pairs; version stamp

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. theme module + fonts + shared classes in both shells — ↩ rollbackable
2. tests incl. cross-shell override-match regression — ↩ rollbackable
3. regenerate; old readable (R14) — ↩ rollbackable

**Backward compat:** old HTML unchanged; single file; presentation-only

## 7. Alternatives considered

### 7.1 a1: Shared policy module + shared DOM classes — **CHOSEN**

one module; .insrc-artifact/.insrc-diagram in both shells

src/artifact-theme + class adoption

### 7.2 a2: per-shell CSS copies

two selector variants

duplicated CSS

**Rejected because:** violates R1; round-2 HIGH pattern

### 7.3 a3: themeVariables only

no CSS overrides

vars

**Rejected because:** R3 defect stays

## 8. References

- **[[c1]]** `file` `src/workflow/artifacts/companion/shell.ts`
- **[[c2]]** `file` `src/docgen/render/shell.ts`
- **[[c3]]** `file` `src/assets/docgen/runtime.json`
- **[[c4]]** `doc` `plans/mermaid-theme-and-readability-requirements.md`
- **[[c5]]** `doc` `docs/previews/mermaid-themes/insors-mermaid-themes.json`

## 9. Open questions

- readable-scale formula extremes (default clamp >=16px)
- persistence scope (localStorage per origin)

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**1 do not hold · 0 could not be verified · 9 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T15:29:33.047Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| new-versus-reuse | MED | The `.insrc-artifact` / `.insrc-diagram` class names the design introduces as a brand-new harmonizing DOM convention do not already carry a different meaning elsewhere in the codebase. | `.insrc-artifact` (and `.insrc-artifact-*` subclasses) is already a live, styled CSS class used by the daemon's separate chat-embedded artifact-preview templates (src/assets/artifacts/templates/er.html etc., loaded via src/daemon/artifacts/template-loader.ts), with its own VS Code-themed styling (`.insrc-artifact-er { ... background: var(--vscode-editor-background, #12151e) ... }`) and its own `.insrc-artifact pre.mermaid` Mermaid selector (src/assets/artifacts/templates/_renderer.html:28). The LLD's citations ([[c1]]–[[c5]]) and data-model section never acknowledge this prior claim on the exact class name, so the design's framing of `.insrc-artifact` as a fresh, single-meaning selector for 'the shared override CSS' is not accurate — the name is already overloaded in the codebase (a different, unrelated artifact-kind template system). This is not a runtime collision today (the two never share a DOM — the chat-embed templates and the companion/docgen standalone HTML files are rendered in entirely separate documents), so it does not break anything as written, but it undermines the design's own stated goal (R1: 'Central visual policy... single source') of `.insrc-artifact` meaning one coherent thing, and risks future confusion if the chat-embed preview and a companion/docgen export are ever composed on the same page. [files: src/assets/artifacts/templates/er.html, src/assets/artifacts/templates/_renderer.html, src/daemon/artifacts/template-loader.ts] | Author should note the existing `.insrc-artifact*` usage in src/assets/artifacts/templates/ in the LLD's references/alternatives, and either pick a differently-scoped class (e.g. a two-token wrapper unique to this feature) or explicitly document why reusing the name for a disjoint document type is safe. |

#### Could not verify (does not block)

_None._
