<!-- insrc:artifact LLD-71133869f31324f7-S001 -->

# LLD: E2026093071133869:S001

## Summary

**Epic:** `rework-site-getting-started-html-1`
**HLD base run:** `wf-1790767578514-liqlmh`
**HLD effective hash:** `71133869f313...`

Rework the public Getting Started page (site/getting-started.html). Restructure the Prerequisites section around Node + Ollama, making the Ollama role explicit: REQUIRED for embeddings (list the candidate embedding models — Ollama qwen3-embedding:0.6b, plus the no-Ollama ONNX nomic-embed-text-v1.5) and OPTIONAL for the core reasoning model (list qwen3.6:27b default, qwen3.6:35b-a3b larger, or cloud via the claude/codex CLI). Replace the three plain surface sections with one accessible sub-tab component (Terminal / VS Code / JetBrains) whose each panel leads with how to set the CORE model for that surface and links all other configuration to the settings guide. Built with the site's own idioms: a small tab controller added to js/tui.js beside the existing theme/copy handlers, tab CSS in css/tui.css, and a content-first no-JS fallback with the existing heading anchors preserved.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** public

## 3. Data model changes

### 3.1 `site/getting-started.html #prerequisites section` — invariant-change

Restructure the Prerequisites section (currently a Node/Ollama/claude+codex/git table + a 'pull two local models' tip) around Node + Ollama with an explicit Ollama split: (a) REQUIRED for embeddings — embeddings are always local; default Ollama model `qwen3-embedding:0.6b` (1024-dim), with the no-Ollama ONNX alternative `nomic-ai/nomic-embed-text-v1.5` (768-dim) selectable via the installer `--embedder onnx` / `models.local.embeddingModel`; (b) OPTIONAL for the core model — only needed when the core tier runs on Ollama (`models.tiers.core.runner: ollama`), local models `qwen3.6:27b` (default) or `qwen3.6:35b-a3b` (larger, higher-accuracy), OR drive the core tier through the `claude`/`codex` CLI and Ollama is embeddings-only. Keep `qwen3.6:27b` as the default (matches the code; do NOT change to 35b-a3b). Reuse the existing table + .tip + .code idioms; keep the `#prerequisites` anchor.

**Call sites:**
- `site/getting-started.html:49`
- `site/getting-started.html:60`
- `site/getting-started.html:80`

### 3.2 `site/getting-started.html surface sections (#cli / #vscode / #jetbrains) → sub-tab component` — invariant-change

Replace the three plain <h2> surface quick-start sections with ONE tab component: a `role=tablist` of three `role=tab` buttons (Terminal only / VS Code / JetBrains) + three `role=tabpanel` panels. Each panel HEADLINES the CORE model configuration for that surface — Terminal: the TUI Setup pane (provider & model config, key `a` apply recommended / `p` pull) + Tiers pane + `~/.insrc/config.json`; VS Code: `insrc: Set model tier` + native VS Code Settings; JetBrains: Settings → Tools → insrc live config editor — and ends with an 'all other configuration → settings guide' link to settings.html. Preserve the existing `#cli` / `#vscode` / `#jetbrains` anchor ids on the tab/panel elements so inbound deep-links from other pages still land. Content-first fallback: with JS off the panels render stacked and fully readable.

**Call sites:**
- `site/getting-started.html:70`
- `site/getting-started.html:177`
- `site/getting-started.html:196`
- `site/getting-started.html:193`
- `site/getting-started.html:211`

### 3.3 `site/css/tui.css — tab component styles` — field-add

Add additive, theme-aware CSS for the tab component (tablist row, tab buttons with selected/hover/focus states, panel show/hide, and a `.no-js`/default-visible fallback so panels are all shown until the controller activates). Scope the selectors to the tab component so no other page's layout changes.

**Call sites:**
- `site/css/tui.css`

### 3.4 `site/js/tui.js — tab controller (progressive enhancement)` — field-add

Add a small tab-init to the existing DOMContentLoaded layer (which already wires the theme toggle + .copy buttons), WITHOUT modifying those handlers: query the tablist, wire click + Left/Right/Home/End arrow-key selection, toggle `aria-selected` on tabs and `hidden` on panels, and mark the container active so the CSS collapses to the single-panel view. It must be a no-op when no tablist is present, so every OTHER page that also loads js/tui.js is unaffected.

**Call sites:**
- `site/js/tui.js`

## 4. Error paths

**Error cases**

- **JavaScript is disabled or js/tui.js fails to load, so the tab controller never runs.** (recoverable)
  - Detection: The tab-init runs on DOMContentLoaded; if it never executes, the tab container never receives its 'active' hook class, which the CSS keys the single-panel view off of.
  - Response: CSS defaults to showing ALL panels stacked and fully readable (the enhancement only collapses to one panel once the container is marked active). The tablist buttons are inert but harmless.
  - User impact: The reader still sees every surface's setup content, just not tabbed — no content is hidden behind broken JS.
- **The tab-init throws mid-setup (e.g. a tab has no matching panel, or the markup is malformed).** (recoverable)
  - Detection: The tab-init is a SEPARATE function feature-checked for the tablist (no-op when absent) and guarded so an exception does not propagate into the theme/copy initialisers that share the DOMContentLoaded layer.
  - Response: Skip the tab enhancement (panels remain stacked via the CSS fallback); the theme toggle + .copy buttons continue to initialise normally.
  - User impact: Degrades to the stacked-content fallback on that one page; the rest of the site's interactivity is unaffected.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An inbound deep-link to #cli / #vscode / #jetbrains (from another page's nav/card) or #prerequisites. | The anchor id is preserved on the panel/heading so the browser still scrolls to it; the controller activates the matching tab when location.hash names a panel (and the #prerequisites section is unchanged and still resolves). |
| Any OTHER site page (which also loads js/tui.js) with no tablist present. | The tab-init no-ops (feature-check finds no tablist); the theme toggle + copy buttons behave exactly as before — byte/behaviour of other pages unchanged. |
| A narrow (mobile) viewport. | The tablist row wraps or horizontally scrolls and the active panel stays readable; no horizontal page overflow (consistent with the site's responsive layout). |
| A reader lands with a specific tab active, then reloads or shares the URL. | Selection defaults deterministically (first tab = Terminal) when no hash targets a panel; a hash targeting a panel selects that tab. No reliance on storage. |

**Invariants to preserve**

- The change is confined to site/getting-started.html plus ADDITIVE blocks in css/tui.css and js/tui.js that no-op on other pages — every other site page's byte output and behaviour (theme toggle, copy buttons) is untouched. [[c1]]
- The site is content-first and crawled by GitHub Pages: all setup content must remain reachable and readable with JavaScript off (the tabs are a progressive enhancement, never a gate on the content). [[c2]]
- Model ids must match the code defaults: embeddings `qwen3-embedding:0.6b` (Ollama) / `nomic-ai/nomic-embed-text-v1.5` (ONNX), core `qwen3.6:27b` (default) / `qwen3.6:35b-a3b` (larger); keep 27b as the default rather than 'fixing' it to 35b-a3b. [[c3]]
- The existing heading anchors #cli / #vscode / #jetbrains (inbound deep-link targets from other pages' nav + cards) and #prerequisites must keep resolving to visible content after the restructure. [[c4]]

## 5. Test strategy

**Test framework:** `Manual/visual verification in a browser (convention.detect reports testFiles: none for site/ — there is no automated harness for the static site; every prior site/ change is verified the same way). Automated checks are limited to HTML well-formedness + a grep for the correct model ids.`

**Test levels**

- **smoke** — The reworked Prerequisites section reads correctly and names the right models.
  - Subjects: `#prerequisites shows Node + Ollama; Ollama is framed REQUIRED for embeddings and OPTIONAL for the core model`, `embedding models listed: Ollama qwen3-embedding:0.6b + the no-Ollama ONNX nomic-ai/nomic-embed-text-v1.5`, `core models listed: qwen3.6:27b (default) + qwen3.6:35b-a3b (larger) + cloud via claude/codex CLI; 27b remains the default`, `grep getting-started.html confirms the exact model ids and no stray 35b-a3b substitution for the default`
  - Fixtures: `open site/getting-started.html in a browser (file:// or the Pages build)`
- **smoke** — The three-surface sub-tab component works, is accessible, and degrades gracefully.
  - Subjects: `clicking each tab (Terminal only / VS Code / JetBrains) shows that panel and hides the others; aria-selected + hidden toggle correctly`, `keyboard: Left/Right/Home/End move selection; focus is visible`, `each panel headlines the CORE model configuration for its surface and ends with an 'all other configuration → settings guide' link to settings.html`, `JS-off (disable scripts): all panels render stacked + fully readable (content-first fallback)`, `inbound deep-links #cli / #vscode / #jetbrains and #prerequisites still resolve to visible content`
  - Fixtures: `a browser with a JS-disable toggle`, `keyboard-only navigation`
- **smoke** — No regression to the rest of the site.
  - Subjects: `other pages that load js/tui.js (e.g. index.html, cli.html) still theme-toggle + copy correctly (tab-init no-ops with no tablist)`, `getting-started.html theme toggle + .copy buttons still work`, `no horizontal overflow at mobile width; tablist wraps/scrolls`
  - Fixtures: `open a couple of other site pages to confirm the shared js/tui.js + css/tui.css additions are inert there`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `#prerequisites shows Node + Ollama; Ollama REQUIRED for embeddings, OPTIONAL for core (smoke)`, `embedding models listed: qwen3-embedding:0.6b + nomic-ai/nomic-embed-text-v1.5 (smoke)`, `grep confirms exact embedding model ids (smoke)` |
| `ac2` | `core models listed: qwen3.6:27b default + qwen3.6:35b-a3b larger + cloud claude/codex; 27b stays default (smoke)`, `grep confirms core model ids + no 35b-a3b default substitution (smoke)` |
| `ac3` | `clicking each of Terminal/VS Code/JetBrains shows its panel (smoke)`, `each panel headlines the CORE model config for its surface (smoke)`, `keyboard arrow-key selection + focus visible (smoke)` |
| `ac4` | `each panel ends with 'all other configuration → settings guide' link to settings.html (smoke)`, `JS-off: panels stacked + readable; #cli/#vscode/#jetbrains + #prerequisites anchors still resolve (smoke)`, `other pages' theme/copy still work; getting-started theme/copy still work; no mobile overflow (smoke)` |

## 6. Migration

**State before:** site/getting-started.html (s1 structural-map) is a static page whose #prerequisites section (lines 49-67) is a Node/Ollama/claude+codex/git table + a 'pull the two local models' tip that says Ollama is 'always required', and whose three surfaces are three plain <h2> sections #cli (70) / #vscode (177) / #jetbrains (196). There is NO tab mechanism anywhere in site/ (s1 how-does-it-work); js/tui.js only wires the theme toggle + .copy buttons; css/tui.css has no tab styles. The model-config prose already names qwen3.6:27b + qwen3-embedding:0.6b (s1 capability-facts).

**State after:** The #prerequisites section frames Ollama explicitly (REQUIRED for embeddings — qwen3-embedding:0.6b Ollama / nomic-ai/nomic-embed-text-v1.5 ONNX no-Ollama; OPTIONAL for the core model — qwen3.6:27b default / qwen3.6:35b-a3b larger / cloud via claude|codex CLI). The three surface sections become ONE accessible sub-tab component (Terminal / VS Code / JetBrains), each panel headlining core-model setup for that surface + an 'all other configuration → settings guide' link, with a stacked no-JS fallback and the #cli/#vscode/#jetbrains + #prerequisites anchors preserved. css/tui.css gains additive tab styles; js/tui.js gains an additive, no-op-elsewhere tab controller.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Rewrite the #prerequisites section content in getting-started.html (Node + Ollama split, embedding + core model lists), reusing the existing table/.tip/.code idioms and keeping the #prerequisites anchor. — ↩ rollbackable
2. Add additive, tab-scoped CSS to css/tui.css (tablist/tab/panel styles + a default-all-visible fallback keyed off an 'active' hook class), scoped so no other page changes. — ↩ rollbackable
3. Add an additive tab controller to js/tui.js inside the existing DOMContentLoaded layer, next to (not modifying) the theme + copy handlers; it no-ops when no tablist is present. — ↩ rollbackable
4. Restructure the three surface <h2> sections in getting-started.html into the tablist + three tabpanels, keeping the #cli/#vscode/#jetbrains ids, headlining each panel with core-model config, and ending each with the settings.html link. — ↩ rollbackable
5. Manually verify in a browser: tab switching + keyboard + JS-off stacked fallback + preserved anchors + other pages' theme/copy intact + correct model ids (no automated harness for site/). — ↩ rollbackable

**Backward compat:** No public code API changes — this is a static docs page. The additive css/tui.css + js/tui.js blocks are shared by every page but are inert without the tab markup (the tab-init no-ops when no tablist is present, and the tab CSS selectors match only the new component), so all other pages keep their exact byte output + behaviour. The #cli / #vscode / #jetbrains + #prerequisites anchors are preserved so inbound deep-links from other pages continue to resolve. Rollback is a straight revert of the three files.

## 7. Alternatives considered

### 7.1 a1: JS-toggle tabs that REPLACE the A/B/C surface sections, focused on core-model setup — **CHOSEN**

Fold the three surface quick-starts into one ARIA tab component (Terminal / VS Code / JetBrains) driven by a small init in js/tui.js; each panel leads with core-model config and links all other config to settings.html; prerequisites restructured for Node + Ollama.

Restructure getting-started.html: (1) rewrite #prerequisites so Ollama is framed as REQUIRED for embeddings and OPTIONAL for the core model with grounded model lists. (2) Replace the three plain <h2> surface sections with ONE tabbed block (role=tablist + three role=tabpanel), each panel headlined by the CORE model config for that surface and a 'settings guide' link; tab-init in js/tui.js + tab CSS in css/tui.css; content-first no-JS stacked fallback; preserve #cli/#vscode/#jetbrains anchors.

### 7.2 a2: Additive 'Set up your core model' tabbed block; keep the A/B/C sections

Insert a new compact tabbed block (Terminal / VS Code / JetBrains) after prerequisites whose sole job is per-surface core-model configuration + a settings link, leaving the existing A/B/C quick-starts intact.

Keep getting-started.html's #cli/#vscode/#jetbrains sections as-is. Restructure #prerequisites (same split as a1). Add ONE new tabbed block titled 'Set up your core model' with the same three tabs, each holding only the core-model-config steps + a settings link. Same JS toggle + CSS as a1.

**Rejected because:** c2 only partial: adds sub-tabs as an EXTRA widget beside the still-present A/B/C sections, so the page names Terminal/VS Code/JetBrains twice and duplicates the per-surface story — diverges from 'sub-tabs FOR the surfaces'.

### 7.3 a3: CSS-only tabs (no JS) via hidden radio + :checked

Same tabbed structure as a1 but implemented with hidden radio inputs + label 'tabs' and `:checked ~ panel` CSS, adding zero JavaScript.

Restructure prerequisites like a1. Build the three-surface tabs from three radio inputs + labels and sibling :checked CSS in css/tui.css that shows the matching panel — no js/tui.js change. Same panel content as a1.

**Rejected because:** c4 only partial: the radio/label hack lacks real tab/tabpanel roles + a clean keyboard model and a :target variant collides with the site's heading-id anchors; the site already uses JS progressive enhancement (theme, copy), so a small JS controller is the idiomatic, more-accessible choice.

## 8. References

- **[[c1]]** `code` `site/js/tui.js (progressive-enhancement layer: theme toggle + copy buttons; tab-init added here)`
- **[[c2]]** `code` `site/getting-started.html:70 (surface sections that become the sub-tabs; content-first site)`
- **[[c3]]** `code` `src/config/local.ts:51 (embeddingModel default qwen3-embedding:0.6b) + src/config/local.ts:53 (coreModel default qwen3.6:27b) + src/agent/providers/onnx-embedder.ts:52 (ONNX nomic-embed-text-v1.5)`
- **[[c4]]** `code` `site/getting-started.html:49 (#prerequisites) + :70/:177/:196 (#cli/#vscode/#jetbrains anchors)`
- **[[c5]]** `code` `site/css/tui.css (stylesheet the tab CSS is added to)`
- **[[c6]]** `code` `site/settings.html:52 (the 'all other configuration' link target)`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 8 LOW** · model `client` · reviewed 2026-09-30T11:34:20.377Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| p1 | citation | LOW | auto | The default embedding model is Ollama qwen3-embedding:0.6b, set as models.local.embeddingModel in src/config/local.ts around line 51. | read confirms `embeddingModel: 'qwen3-embedding:0.6b'` at src/config/local.ts:51. | Confirmed — no change. |
| p2 | citation | LOW | auto | The default local core model is qwen3.6:27b, set as models.local.coreModel in src/config/local.ts around line 53 (so the site's 27b is correct, not 35b-a3b). | read confirms `coreModel: 'qwen3.6:27b'` at src/config/local.ts:53 — the site's 27b default is correct (docs/daemon.md corroborates); do NOT change to 35b-a3b. | Confirmed — no change. |
| p3 | citation | LOW | auto | The ONNX (no-Ollama) embedding backend model is nomic-ai/nomic-embed-text-v1.5, exported as ONNX_EMBEDDING_MODEL in src/agent/providers/onnx-embedder.ts around line 52. | read confirms `export const ONNX_EMBEDDING_MODEL = 'nomic-ai/nomic-embed-text-v1.5';` at src/agent/providers/onnx-embedder.ts:52. | Confirmed — no change. |
| p4 | citation | LOW | auto | site/getting-started.html has a #prerequisites section (~line 49) and three surface heading anchors #cli (~70), #vscode (~177), #jetbrains (~196) that must be preserved. | read confirms #prerequisites at getting-started.html:49; grep confirms id="vscode" at :177, id="jetbrains" at :196, and id="cli" present in getting-started.html (line 70) alongside cli.html:38. | Confirmed — no change. |
| p5 | citation | LOW | auto | site/js/tui.js is the shared progressive-enhancement script (theme toggle + copy buttons) that the tab controller is added to. | The probe was broad (matched docs), but site/js/tui.js exists as the shared theme/copy progressive-enhancement script per the s1 structural-map and the page's `<script src="js/tui.js">` include; the tab controller is added there. | Confirmed — no change (probe broad but claim holds). |
| p6 | citation | LOW | auto | site/css/tui.css is the single site stylesheet the tab styles are added to, and site/settings.html is the 'all other configuration' link target. | Broad probe, but site/css/tui.css (the single stylesheet linked from every page) and site/settings.html both exist per the s1 structural-map; settings.html is the documented config-editor reference (link target). | Confirmed — no change (probe broad but claim holds). |
| p7 | closed-union | LOW | auto | There is NO existing tab/sub-tab component anywhere in site/ (no role=tab/tablist/tabpanel markup), so the sub-tabs are net-new. | grep for role="tab"/role="tablist"/role="tabpanel" returned 0 hits; data-tab matched only vscode-plugin tests (not site/). Confirms there is no existing tab component in site/ — the sub-tabs are net-new. | Confirmed — no change. |
| p8 | semantic | LOW | auto | The installer exposes an --embedder auto\|ollama\|onnx flag (the ONNX backend is a real selectable option), referenced in getting-started.html:80. | read confirms the `--embedder auto\|ollama\|onnx` installer option is documented at getting-started.html:80 (README + installer corroborate), so the ONNX embedding backend is a real selectable option. | Confirmed — no change. |
