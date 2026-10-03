<!-- insrc:artifact PLAN-71133869f31324f7-S001 -->

# Plan: E2026093071133869:S001

## Summary

**Epic:** `rework-site-getting-started-html-1`
**LLD run:** `wf-1790767578514-liqlmh`
**LLD effective hash:** `71133869f313...`

Building this Story is a docs-page rework confined to three site/ files. First the Prerequisites section is rewritten around Node + Ollama with the required-embeddings / optional-core split and the grounded model lists. Then a small, accessible tab component is added the site's own way — additive theme-aware CSS in css/tui.css and a self-contained initTabs() beside the existing handlers in js/tui.js — and the three surface quick-starts are folded into its three panels, each leading with core-model setup while keeping the essential install steps and linking deeper config to the settings guide. Everything degrades to stacked, readable content with JS off; verification is manual/visual in a browser (the static site has no automated harness) plus a grep for the exact model ids.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Rewrite the #prerequisites section (Node + Ollama split + model lists) | S | — | smoke: #prerequisites shows Node + Ollama; Ollama REQUIRED for embeddings, OPTIONAL for core; smoke: embedding + core model lists render (qwen3-embedding:0.6b / nomic-embed-text-v1.5 / qwen3.6:27b default / 35b-a3b larger / cloud); smoke: grep getting-started.html confirms exact model ids + no 35b-a3b default substitution | [[c1]] |
| 2 | **`t2`** Add the tab component CSS to css/tui.css | S | — | smoke: no 'active' class -> all panels visible (fallback); active -> only selected panel shows; light+dark states; smoke: no horizontal overflow at mobile width; tablist wraps/scrolls | [[c3]] |
| 3 | **`t3`** Add the initTabs controller to js/tui.js | S | — | smoke: click each tab shows its panel + toggles aria-selected/hidden; keyboard Left/Right/Home/End + visible focus; smoke: initTabs no-ops on pages without a tablist (index.html, cli.html theme/copy unaffected); smoke: location.hash naming a panel activates that tab; else first tab (Terminal) | [[c4]] |
| 4 | **`t4`** Restructure the three surface sections into the tab markup | M | `t2`, `t3` | smoke: three tabpanels; each panel headlines core-model config + ends with settings.html link; smoke: JS-off: all panels render stacked + fully readable (content-first fallback); smoke: inbound deep-links #cli/#vscode/#jetbrains + #prerequisites still resolve to visible content | [[c2]] |
| 5 | **`t5`** Verify the page + no-regression in a browser | S | `t1`, `t2`, `t3`, `t4` | smoke: getting-started.html theme toggle + .copy buttons still work; other pages (index/cli) theme+copy intact; smoke: end-to-end: tabs + keyboard + JS-off + anchors + model-id grep + no mobile overflow | [[c1]] [[c2]] [[c3]] [[c4]] |

### 1.1 E2026093071133869:S001:T001 — Rewrite the #prerequisites section (Node + Ollama split + model lists)

In site/getting-started.html, restructure #prerequisites around Node + Ollama: Ollama REQUIRED for embeddings (Ollama qwen3-embedding:0.6b default + the no-Ollama ONNX nomic-ai/nomic-embed-text-v1.5) and OPTIONAL for the core model (qwen3.6:27b default / qwen3.6:35b-a3b larger / cloud via claude|codex CLI, models.tiers.core.runner). Reuse the existing table/.tip/.code idioms; keep the #prerequisites anchor; keep qwen3.6:27b as the default (do NOT switch to 35b-a3b).

**Acceptance checks:**
- #prerequisites frames Ollama as REQUIRED for embeddings and OPTIONAL for the core model.
- Embedding models listed: qwen3-embedding:0.6b (Ollama) + nomic-ai/nomic-embed-text-v1.5 (ONNX, no Ollama).
- Core models listed: qwen3.6:27b (default) + qwen3.6:35b-a3b (larger) + cloud via claude/codex CLI; 27b stays the default.
- The #prerequisites anchor + Node.js 20+/claude+codex/git rows are preserved; existing idioms reused.

### 1.2 E2026093071133869:S001:T002 — Add the tab component CSS to css/tui.css

Add an additive, theme-aware, component-scoped CSS block for the tabs: a [role=tablist] row, [role=tab] buttons (selected/hover/focus via theme tokens), and [role=tabpanel] show/hide keyed off an 'active' hook class the JS sets. Default (no active class) shows ALL panels stacked (the no-JS fallback). Scope selectors so no other page changes.

**Acceptance checks:**
- Tab styles are additive + scoped to the tab component (no other page's layout changes).
- Selected/hover/focus states use the site's theme tokens (work in light + dark).
- With no 'active' hook class, all [role=tabpanel] are visible (fallback); once active, only the selected panel shows.

### 1.3 E2026093071133869:S001:T003 — Add the initTabs controller to js/tui.js

Add a self-contained initTabs() to the IIFE, appended to the existing DOMContentLoaded call list beside initTheme/initCopy WITHOUT modifying them. It queries the tablist, returns early (no-op) when absent, marks the container active, wires tab click + Left/Right/Home/End arrow-key selection, toggles aria-selected on tabs + hidden on panels, defaults to the first tab (Terminal), and activates the tab matching location.hash when it names a panel.

**Acceptance checks:**
- initTabs no-ops when no [role=tablist] is present (every other page is unaffected).
- Click + arrow-key (Left/Right/Home/End) selection toggles aria-selected + panel hidden correctly; focus is visible.
- The existing initTheme/initCopy/initAnchors handlers are unchanged and still run.
- A location.hash naming a panel activates that tab; otherwise the first tab is active.

### 1.4 E2026093071133869:S001:T004 — Restructure the three surface sections into the tab markup

Replace the three plain <h2> surface sections (#cli/#vscode/#jetbrains) in getting-started.html with one tab component: a role=tablist of three role=tab buttons (Terminal only / VS Code / JetBrains) + three role=tabpanel panels. Each panel LEADS with the CORE model config step for its surface, KEEPS that surface's essential install/onboarding steps, and routes only DEEPER configuration to the settings.html guide. Keep the top-level #cli/#vscode/#jetbrains ids on the tab/panel elements and preserve existing sub-anchors where practical.

**Acceptance checks:**
- The three surfaces are a single tablist + 3 tabpanels (Terminal only / VS Code / JetBrains).
- Each panel LEADS with the CORE model configuration step AND retains that surface's essential install/onboarding steps; only deeper config links to settings.html.
- The #cli/#vscode/#jetbrains top-level anchor ids are preserved on the tab/panel elements (and existing sub-anchors kept where practical).
- With JS off the panels render stacked + fully readable (content-first).

### 1.5 E2026093071133869:S001:T005 — Verify the page + no-regression in a browser

Manual/visual verification (no automated harness for site/): open getting-started.html — tab switching + keyboard + JS-off stacked fallback + preserved #cli/#vscode/#jetbrains/#prerequisites anchors + correct model ids (grep); open a couple of other pages (index.html, cli.html) to confirm the shared js/tui.js + css/tui.css additions are inert (theme/copy still work); check no horizontal overflow at mobile width.

**Acceptance checks:**
- Tabs switch on click + keyboard; JS-off shows all panels stacked; anchors still resolve.
- grep getting-started.html confirms qwen3-embedding:0.6b / nomic-ai/nomic-embed-text-v1.5 / qwen3.6:27b / qwen3.6:35b-a3b and no 35b-a3b default substitution.
- Other pages' theme toggle + copy still work; getting-started theme/copy still work; no mobile horizontal overflow.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| #prerequisites shows Node + Ollama; Ollama is framed REQUIRED for embeddings and OPTIONAL for the core model | `t1` |
| embedding models listed: Ollama qwen3-embedding:0.6b + the no-Ollama ONNX nomic-ai/nomic-embed-text-v1.5 | `t1` |
| core models listed: qwen3.6:27b (default) + qwen3.6:35b-a3b (larger) + cloud via claude/codex CLI; 27b remains the default | `t1` |
| grep getting-started.html confirms the exact model ids and no stray 35b-a3b substitution for the default | `t1`, `t5` |
| clicking each tab (Terminal only / VS Code / JetBrains) shows that panel and hides the others; aria-selected + hidden toggle correctly | `t3`, `t4` |
| keyboard: Left/Right/Home/End move selection; focus is visible | `t3` |
| each panel headlines the CORE model configuration for its surface and ends with an 'all other configuration → settings guide' link to settings.html | `t4` |
| JS-off (disable scripts): all panels render stacked + fully readable (content-first fallback) | `t2`, `t4` |
| inbound deep-links #cli / #vscode / #jetbrains and #prerequisites still resolve to visible content | `t4`, `t3` |
| other pages that load js/tui.js (e.g. index.html, cli.html) still theme-toggle + copy correctly (tab-init no-ops with no tablist) | `t3`, `t5` |
| getting-started.html theme toggle + .copy buttons still work | `t5` |
| no horizontal overflow at mobile width; tablist wraps/scrolls | `t2`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 #prerequisites section rework (site/getting-started.html:49/60/80; model defaults local.ts:51/53, onnx-embedder.ts:52)`
- **[[c2]]** `prior-artifact` `LLD S001 surface sections → sub-tab component (site/getting-started.html:70/177/196/193/211)`
- **[[c3]]** `prior-artifact` `LLD S001 tab component CSS (site/css/tui.css)`
- **[[c4]]** `prior-artifact` `LLD S001 tab controller / initTabs (site/js/tui.js)`
