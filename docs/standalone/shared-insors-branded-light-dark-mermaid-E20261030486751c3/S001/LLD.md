<!-- insrc:artifact LLD-486751c3411ceef9-S001 -->

# LLD: E20261030486751c3:S001

## Summary

**Epic:** `shared-insors-branded-light-dark-mermaid`
**HLD base run:** `wf-1793387884098-ijyj5y`
**HLD effective hash:** `486751c3411c...`

One versioned Insors-branded theme policy module drives both artifact shells under unclaimed shared DOM classes (.insrc-viewer page root, .insrc-viewer-diagram diagram wrapper in both shells), so the shared override CSS — including the ER relationship-label dark-on-Crayola fix — applies identically in both paths. Plus light/dark variants with persisted override, packaged Poppins, role palette + legend only when roles exist, wrap/sizing, density policy, readable initial scale with separate fit, keyboard controls, full-SVG export, error states, measured contrast pairs, version stamp — offline, strict security unchanged.

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

**Framework:** Standalone triage-routed feature story (round 4): two artifact shells + shared theme module + asset pipeline, with unclaimed shared DOM classes.
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

**Returns:** `string` — branded version-stamped HTML with .insrc-viewer root + .insrc-viewer-diagram wrapper

**Errors:**
- `DiagramGenerationError` when runtime asset unreadable

**Preconditions:**
- runtime assets under out/assets

**Postconditions:**
- no theme neutral/#f3f5f8; shared classes present; no .insrc-artifact class

### 2.2 `assembleShell`

```typescript
(ir: DocumentIR, renderer?: SubprocessRenderer) => Promise<DocGenOutcome<RenderedDocumentShell>>
```

**Parameters:**
- `ir: DocumentIR` — derived IR
- `renderer: SubprocessRenderer` _(optional)_ — oversized renderer

**Returns:** `Promise<DocGenOutcome<RenderedDocumentShell>>` — same branded shell on primary + fallback with shared classes

**Errors:**
- `fallback-unavailable` when runtime missing / no renderer

**Preconditions:**
- docgen runtime assets

**Postconditions:**
- insrc-theme meta; .insrc-viewer/.insrc-viewer-diagram present; #docgen-diagram kept

### 2.3 `themePolicy (src/artifact-theme/theme.ts)`

```typescript
THEME_VERSION; BRAND; CONTRAST_PAIRS{light,dark}; ROLE_PALETTE; mermaidConfigFor(mode); pageCssFor(mode); DIAGRAM_OVERRIDES_CSS; LEGEND_CSS; FONT_FACE_CSS; viewerBootScript(opts); exportableSvg(svg,mode)
```

**Parameters:**
- `mode: "light"|"dark"` — variant

**Returns:** `object|string` — policy pieces scoped to .insrc-viewer/.insrc-viewer-diagram

**Preconditions:**
- Poppins woff2 read + base64

**Postconditions:**
- no remote URL; selectors use unclaimed shared classes

## 3. Data model changes

### 3.1 `ArtifactThemePolicy` — new

DOM contract: .insrc-viewer page root + .insrc-viewer-diagram diagram wrapper in both shells (names verified free; .insrc-artifact remains the chat-embed templates' namespace). Brand tokens, light/dark surfaces, per-mode mermaid themeVariables, ROLE_PALETTE+legend iff roles, CONTRAST_PAIRS (NFR1), ER overrides scoped to the shared classes, FONT_FACE_CSS, page CSS scoped under .insrc-viewer (R15), viewer boot (auto theme + persist + safe re-render + fonts.ready + readable scale + fit action + export + error)

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
  - Response: full svg + font style + background rect (R12)
  - User impact: standalone export
- **override selector matches only one shell DOM or uses the .insrc-artifact namespace** (recoverable)
  - Detection: regression tests: both outputs carry .insrc-viewer/.insrc-viewer-diagram; selectors match both DOMs; artifact HTML contains no .insrc-artifact class
  - Response: build fails at test time
  - User impact: none

**Edge cases**

| Input | Expected |
| :--- | :--- |
| fit shrinks labels <16px | clamp readable; fit separate (R6/R11) |
| long labels | wrap + sized nodes (R7) |
| dense graph | density policy / overview+detail / disclosed truncation (R8) |
| narrow viewport | wrapping toolbar; keyboard focus (NFR2) |
| ER dark mode | dark-on-Crayola in both shells via .insrc-viewer-diagram (R3) |
| host CSS | scoped under .insrc-viewer (R15) |
| malicious label/config | escape + strict + constant config (NFR6) |
| no role metadata | default style; no invented roles; no legend (R4) |

**Invariants to preserve**

- securityLevel strict; no author CSS/JS/config executed [[c4]]
- no remote URL; runtimes+fonts inlined [[c3]]
- semantics/entities/edges/labels/history untouched (NFR4) [[c4]]
- pan/zoom runtimes reused; #stage/#docgen-diagram ids kept [[c1]]
- .insrc-artifact namespace stays with the chat-embed templates; shells use .insrc-viewer [[c6]]
- old artifacts readable, never auto-rewritten (R14) [[c4]]

## 5. Test strategy

**Test framework:** `node:test via tsx`

**Test levels**

- **unit** — tokens/contrast/roles/variants/ER override/fonts/version + class-freedom scan
  - Subjects: `src/artifact-theme/__tests__/theme.test.ts`, `src/artifact-theme/__tests__/fonts.test.ts`, `src/artifact-theme/__tests__/contrast.test.ts`
- **unit** — both shell outputs: shared classes present, override matches both DOMs, no .insrc-artifact leakage, no theme neutral/#f3f5f8, controls, no remote URLs, escaping
  - Subjects: `src/workflow/artifacts/companion/__tests__/shell.test.ts`, `src/docgen/render/__tests__/shell.test.ts`
- **unit** — readable clamp + density + oversized routing
  - Subjects: `src/artifact-theme/__tests__/viewer-script.test.ts`
- **integration** — boot node --check; export svg; structural preservation (NFR4)
  - Subjects: `src/artifact-theme/__tests__/viewer-script.test.ts`
- **live** — perf baselines 3 sizes (NFR5)
  - Subjects: `src/artifact-theme/__tests__/perf.integration.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `R1` | `single THEME_VERSION; both shells same module` |
| `R2` | `variants; toggle + persistence` |
| `R3` | `contrast pairs; ER override matches both DOMs via .insrc-viewer-diagram` |
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
| `R15` | `scoped CSS under .insrc-viewer; no remote URL; no .insrc-artifact leakage; malicious-label test` |
| `NFR1` | `contrast.test.ts ratios` |
| `NFR2` | `keyboard/focus; grayscale` |
| `NFR3` | `offline assets; no CDN` |
| `NFR4` | `structural preservation fixture` |
| `NFR5` | `perf.integration.test.ts` |
| `NFR6` | `negative injection tests; strict asserted` |

## 6. Migration

**State before:** theme neutral + fixed light CSS; no fonts/version/roles/contrast

**State after:** shared versioned branded policy + .insrc-viewer shared classes in both shells; fonts; contrast pairs; version stamp

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. theme module + fonts + shared classes in both shells — ↩ rollbackable
2. tests incl. cross-shell override-match + namespace-freedom regression — ↩ rollbackable
3. regenerate; old artifacts readable (R14) — ↩ rollbackable

**Backward compat:** old HTML unchanged; single file; presentation-only

## 7. Alternatives considered

### 7.1 a1: Shared policy module + .insrc-viewer shared DOM classes — **CHOSEN**

one module; unclaimed class names in both shells

src/artifact-theme + class adoption

### 7.2 a2: reuse .insrc-artifact

adopt the existing class name

shared class = .insrc-artifact

**Rejected because:** namespace already owned by src/assets/artifacts/templates

### 7.3 a3: per-shell CSS copies

duplicate override CSS

two selector variants

**Rejected because:** violates R1; round-2 HIGH pattern

## 8. References

- **[[c1]]** `file` `src/workflow/artifacts/companion/shell.ts`
- **[[c2]]** `file` `src/docgen/render/shell.ts`
- **[[c3]]** `file` `src/assets/docgen/runtime.json`
- **[[c4]]** `doc` `plans/mermaid-theme-and-readability-requirements.md`
- **[[c5]]** `doc` `docs/previews/mermaid-themes/insors-mermaid-themes.json`
- **[[c6]]** `file` `src/assets/artifacts/templates/_renderer.html`

## 9. Open questions

- readable-scale formula extremes (default clamp >=16px)
- persistence scope (localStorage per origin)

## Resolved questions

- `q1bbb76e1` — readable-scale formula extremes (default clamp >=16px)
  - **resolved**: Configurable clamp bounds (default floor 16px) — Satisfies the LLD >=16px label floor by default and stays simple/deterministic; the ceiling stays unset so huge diagrams just pan instead of scaling absurdly. _(2026-10-30T19:27:16.182Z)_
- `qa4ccd42c` — persistence scope (localStorage per origin)
  - **resolved**: Per-origin localStorage (webview default) — The artifacts are standalone self-contained HTML files with no extension host, so webview/file-origin localStorage is the only persistence available; the theme choice is per-artifact-view and non-critical. _(2026-10-30T19:28:12.106Z)_

## Citations

- **[[c1]]** `file` `src/workflow/artifacts/companion/shell.ts`
- **[[c2]]** `file` `src/docgen/render/shell.ts`
- **[[c3]]** `file` `src/assets/docgen/runtime.json`
- **[[c4]]** `doc` `plans/mermaid-theme-and-readability-requirements.md`
- **[[c5]]** `doc` `docs/previews/mermaid-themes/insors-mermaid-themes.json`
- **[[c6]]** `file` `src/assets/artifacts/templates/_renderer.html`
