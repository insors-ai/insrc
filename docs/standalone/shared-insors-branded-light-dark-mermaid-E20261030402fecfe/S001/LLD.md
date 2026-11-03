<!-- insrc:artifact LLD-402fecfe37bc6ad9-S001 -->

# LLD: E20261030402fecfe:S001

## Summary

**Epic:** `shared-insors-branded-light-dark-mermaid`
**HLD base run:** `wf-1793372632249-nt3rcw`
**HLD effective hash:** `402fecfe37bc...`

This story adds one versioned Insors-branded theme policy module for generated Mermaid artifacts and makes both rendering shells (workflow companions and docgen) consume it: brand palette with coordinated light/dark variants, packaged Poppins, ER label contrast overrides, readable initial scale with fit as a separate action, theme toggle, SVG export, and honest error states — all offline, strict Mermaid security unchanged.

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

**Framework:** Standalone triage-routed feature story (no HLD): scope is the two artifact rendering shells + a new shared theme module + the asset pipeline.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `renderCompanionPage`

```typescript
(header: CompanionHeader, page: CompanionPageContent, runtime: CompanionRuntime) => string
```

**Parameters:**
- `header: CompanionHeader` — page header block
- `page: CompanionPageContent` — kind-specific content incl. mermaid/html visual
- `runtime: CompanionRuntime` — inlined panzoom + mermaid bytes

**Returns:** `string` — self-contained branded, theme-aware, version-stamped HTML

**Errors:**
- `DiagramGenerationError` when runtime asset unreadable

**Preconditions:**
- runtime assets shipped under out/assets

**Postconditions:**
- no theme neutral, no fixed #f3f5f8 page CSS, insrc-theme meta version present

### 2.2 `assembleShell`

```typescript
(ir: DocumentIR, renderer?: SubprocessRenderer) => Promise<DocGenOutcome<RenderedDocumentShell>>
```

**Parameters:**
- `ir: DocumentIR` — derived document IR
- `renderer: SubprocessRenderer` _(optional)_ — oversized-diagram subprocess renderer

**Returns:** `Promise<DocGenOutcome<RenderedDocumentShell>>` — branded/theme-aware/version-stamped shell on primary and fallback paths

**Errors:**
- `fallback-unavailable` when runtime asset missing or no subprocess renderer for oversized IR

**Preconditions:**
- docgen runtime assets present

**Postconditions:**
- inlinedRuntimeVersion reported; theme version meta added

### 2.3 `themePolicy (src/artifact-theme/theme.ts)`

```typescript
THEME_VERSION: string; BRAND: Record<string,string>; mermaidConfigFor(mode: "light"|"dark"): object; pageCssFor(mode): string; DIAGRAM_OVERRIDES_CSS: string; FONT_FACE_CSS: string; viewerBootScript(opts): string; exportableSvg(svg, mode): string
```

**Parameters:**
- `mode: "light"|"dark"` — variant selection

**Returns:** `object|string` — centralized branded policy pieces both shells inline

**Preconditions:**
- Poppins woff2 under src/assets/fonts/poppins read at generation time, embedded base64

**Postconditions:**
- no remote URL in any output

## 3. Data model changes

### 3.1 `ArtifactThemePolicy` — new

Versioned policy: 6 exact brand tokens, derived light/dark surfaces, per-mode Mermaid themeVariables (base theme), ER relationshipLabel overrides, Poppins @font-face, page/viewport/toolbar CSS, viewer boot (auto theme + persist + safe re-render + readable initial scale + export + error state)

**Call sites:**
- `src/workflow/artifacts/companion/shell.ts`
- `src/docgen/render/shell.ts`
- `src/docgen/render/fallback.ts`

### 3.2 `Poppins font assets` — new

src/assets/fonts/poppins/{400,600,700}.woff2 (OFL), shipped by copy-assets.mjs, embedded base64 in generated HTML

**Call sites:**
- `copy-assets.mjs`
- `src/artifact-theme/fonts.ts`

## 4. Error paths

**Error cases**

- **mermaid.run rejects (bad diagram source)** (recoverable)
  - Detection: mermaid.run() promise rejects
  - Response: stage shows an actionable error plus a show-source toggle exposing the raw Mermaid source; no empty success (R13)
  - User impact: error + source shown instead of a blank/broken svg
- **Poppins woff2 missing at generation time** (recoverable)
  - Detection: font read fails in fonts.ts
  - Response: fall back to system sans stack and still embed; logged at generation (NFR3)
  - User impact: different typeface, no layout break
- **document.fonts.ready hangs in the viewer** (recoverable)
  - Detection: fonts.ready race with timeout
  - Response: render with fallback font; re-frame once fonts resolve (no clipped labels from early measurement)
  - User impact: brief fallback-font render, then correct metrics
- **theme switch mid-view** (recoverable)
  - Detection: user toggles light/dark
  - Response: re-init mermaid with the other mode and re-run the same source; restore pan/zoom transform; persist choice in localStorage (R9)
  - User impact: diagram re-renders in the new variant at the same position
- **SVG export** (recoverable)
  - Detection: export control activated
  - Response: serialize the full svg (not the viewport) with embedded @font-face style and an explicit theme background rect (R12)
  - User impact: export opens standalone with brand styling and readable text

**Edge cases**

| Input | Expected |
| :--- | :--- |
| diagram so large fit-to-view would shrink labels below 16px | initial scale clamps to the readable threshold (labels >= 16px); Fit remains a separate overview action (R6/R11) |
| narrow viewport | toolbar wraps; controls keyboard-reachable; framing recalculates on resize without overriding manual zoom |
| ER diagram in dark mode | relationship labels keep dark-green text on Crayola boxes via explicit override |
| host page with its own CSS (VS Code webview) | artifact CSS scoped under the artifact root class; no leakage (R15) |
| malicious label with script/config injection | escapeHtml on source + securityLevel strict + validated constant theme config; negative tests (NFR6) |

**Invariants to preserve**

- mermaid securityLevel stays strict; no author-supplied CSS/JS/config executed [[c4]]
- no remote URL in generated artifacts; runtimes + fonts inlined [[c3]]
- diagram semantics, entities, edges, labels and approval history untouched [[c4]]
- existing pan/zoom runtimes reused, not duplicated [[c1]]
- saved old artifacts remain readable and are never auto-rewritten (R14) [[c4]]

## 5. Test strategy

**Test framework:** `node:test via tsx (npx tsx --test)`

**Test levels**

- **unit** — theme module: exact brand hex tokens, both variants, per-mode mermaid config, ER override rule, font-face with 3 base64 weights, THEME_VERSION
  - Subjects: `src/artifact-theme/__tests__/theme.test.ts`, `src/artifact-theme/__tests__/fonts.test.ts`
- **unit** — both shells consume the policy: no theme neutral / no fixed #f3f5f8, theme meta stamp, toolbar controls, no remote URLs, escaping intact
  - Subjects: `src/workflow/artifacts/companion/__tests__/shell.test.ts`, `src/docgen/render/__tests__/shell.test.ts`
- **integration** — extracted boot script passes node --check; export serializer produces standalone svg with background + font style
  - Subjects: `src/artifact-theme/__tests__/viewer-script.test.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `R1` | `theme.test.ts single THEME_VERSION; both shell tests reference the same module` |
| `R2` | `theme.test.ts variant coverage; shell tests assert data-theme + toggle` |
| `R3` | `theme.test.ts ER override + token pairs` |
| `R6` | `fonts.test.ts 3 woff2 + base64 @font-face + no fonts CDN reference` |
| `R10-R12` | `shell tests assert zoom/fit/1:1/reset/theme/export; viewer-script export test` |
| `R13` | `shell tests assert error element + show-source` |
| `R14` | `shell tests assert insrc-theme meta = THEME_VERSION` |
| `NFR6` | `no-remote-URL assertions + malicious label escape test` |

## 6. Migration

**State before:** Both shells hard-code theme neutral and fixed light page CSS; no packaged fonts; no theme version stamp.

**State after:** Both shells inline the shared branded theme policy (light/dark), packaged Poppins, overrides, viewer controls and a theme version stamp. Existing saved artifacts are not rewritten.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add src/artifact-theme/{theme.ts,fonts.ts} + src/assets/fonts/poppins/*.woff2 (copy-assets.mjs ships src/assets wholesale) — ↩ rollbackable
2. Rewire companion + docgen (+fallback) shells to the policy module; update their tests — ↩ rollbackable
3. Regenerate artifacts for new outputs; old saved HTML stays readable (R14) — ↩ rollbackable

**Backward compat:** Old saved self-contained HTML files open unchanged; output remains a single HTML file; only presentation internals change.

## 7. Alternatives considered

### 7.1 a1: Shared theme-policy module inlined by both shells — **CHOSEN**

One versioned module owns tokens, variants, overrides, fonts, boot; both shells inline its output.

src/artifact-theme module + assets; shells import it.

### 7.2 a2: Shared JSON only, per-shell CSS

Ship theme JSON; each shell keeps its own page CSS.

assets JSON + local CSS

**Rejected because:** leaves per-shell drift the plan forbids

### 7.3 a3: Mermaid built-in themes only

theme dark/neutral + few variables.

built-in switch

**Rejected because:** does not meet R1-R3/R6/R12

## 8. References

- **[[c1]]** `file` `src/workflow/artifacts/companion/shell.ts`
- **[[c2]]** `file` `src/docgen/render/shell.ts`
- **[[c3]]** `file` `src/assets/docgen/runtime.json`
- **[[c4]]** `doc` `plans/mermaid-theme-and-readability-requirements.md`
- **[[c5]]** `doc` `docs/previews/mermaid-themes/insors-mermaid-themes.json`

## 9. Open questions

- Readable-scale formula for very large diagrams: default = clamp initial scale so labels >= 16px, fit as separate action
- Theme persistence scope: localStorage per artifact origin

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**3 do not hold · 1 could not be verified · 9 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T15:14:55.571Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | The change-site inventory (§3.1, listing only companion/shell.ts, docgen/render/shell.ts and docgen/render/fallback.ts as call sites) is complete for a single shared `DIAGRAM_OVERRIDES_CSS` string to apply correctly in both shells. | The companion shell wraps the rendered diagram in `<div class="stage" id="stage">` (src/workflow/artifacts/companion/shell.ts:251), while docgen's primary and fallback shells wrap it in `<div id="docgen-diagram">` (src/docgen/render/shell.ts:235 and src/docgen/render/fallback.ts:242) — two different container selectors. The design's own reference override CSS [[c5]] (docs/previews/mermaid-themes/insors-diagram-overrides.css) is scoped to `.stage svg .relationshipLabel`/`.relationshipLabelBox`, which only matches the companion shell's DOM. The LLD never lists a DOM-harmonization change (a shared wrapper class/id) to either shell as part of §3.1's call sites, so a single DIAGRAM_OVERRIDES_CSS string built on that reference would silently fail to apply in the docgen shells, reproducing exactly the R3 ER-contrast defect the story exists to fix in one of the two rendering paths. [files: src/workflow/artifacts/companion/shell.ts, src/docgen/render/shell.ts, src/docgen/render/fallback.ts, docs/previews/mermaid-themes/insors-diagram-overrides.css] | Read the exact container markup in all three shell/fallback files and the reference override CSS, and compared selectors. |
| coverage-of-intent | MED | The upstream doc's 'Decisions for design' explicitly lists 'Runtime upgrade need, version stamping, and regeneration workflow for saved artifacts' as a decision this design must make (R5: 'Evaluate whether a runtime update is necessary'); the LLD makes that decision. | plans/mermaid-theme-and-readability-requirements.md, 'Decisions for design' bullet 6, requires an explicit evaluation of whether the Mermaid runtime needs upgrading. The LLD's contract (§2), migration (§6) and open questions (§9) never mention the shipped Mermaid version (10.9.1, per src/assets/docgen/runtime.json) or whether it is sufficient for the new themeVariables/base-theme usage; it is silently dropped rather than resolved or deferred as an open question. [files: plans/mermaid-theme-and-readability-requirements.md, src/assets/docgen/runtime.json] | Read plans/mermaid-theme-and-readability-requirements.md 'Decisions for design' and src/assets/docgen/runtime.json, then searched the whole LLD for any runtime-version discussion. |
| tests | MED | The acceptance-mapping table in §5 maps every acceptance criterion from plans/mermaid-theme-and-readability-requirements.md to a proving test, including NFR1 (contrast ≥4.5:1/3:1) and the doc's numbered acceptance criterion 2 ('labels ... meet the contrast targets'). | plans/mermaid-theme-and-readability-requirements.md's NFR1 row explicitly requires measuring 'actual theme pairs in representative rendered states'. The LLD's §5 acceptance-mapping table has no row for NFR1 or for numbered criterion 2; the only related test it cites, `theme.test.ts` (R3 row: 'ER override + token pairs'), asserts the configured hex tokens equal fixed values — it does not compute or assert a rendered contrast ratio. No test file named anywhere in §5 (src/artifact-theme/__tests__/theme.test.ts, src/workflow/artifacts/companion/__tests__/shell.test.ts, src/docgen/render/__tests__/shell.test.ts) performs a contrast measurement, so NFR1 has no proving test despite being a stated non-functional acceptance target. [files: src/artifact-theme/__tests__/theme.test.ts, src/workflow/artifacts/companion/__tests__/shell.test.ts, src/docgen/render/__tests__/shell.test.ts, plans/mermaid-theme-and-readability-requirements.md] | Read the LLD §5 acceptance-mapping table in full and compared it against every R/NFR/numbered criterion in plans/mermaid-theme-and-readability-requirements.md; confirmed the three named test files exist today (via Glob) but cannot contain the missing contrast assertions on the evidence in §5. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| error-paths | 'document.fonts.ready hangs in the viewer', handled by a timeout fallback that re-frames once fonts resolve, is grounded in an existing or at-least-planned mechanism in the current viewer scripts. | Neither shell's current boot script references `document.fonts` at all (confirmed by reading the full init/bootScript bodies in both shell.ts files), since no font loading exists yet. The response is plausible as new client-side logic, but I found no existing timeout/race pattern in this codebase to confirm how it would be wired in, and the LLD does not point to one. [files: src/workflow/artifacts/companion/shell.ts, src/docgen/render/shell.ts] | Searched both shells' boot/init scripts for any `document.fonts` or timeout-race pattern; found none to compare against. |
