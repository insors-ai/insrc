# Build (plan-driven) — Story S001

**Standalone:** no  ·  **Created:** 2026-09-30T11:55:40.425Z  ·  **Updated:** 2026-09-30T12:01:46.834Z

## Summary

Reworked site/getting-started.html plus additive blocks in site/css/tui.css and site/js/tui.js. (t1) The Prerequisites section is reframed around Node + Ollama: Ollama REQUIRED for embeddings (Ollama qwen3-embedding:0.6b default / ONNX nomic-ai/nomic-embed-text-v1.5 no-Ollama) and OPTIONAL for the core model (qwen3.6:27b default / qwen3.6:35b-a3b larger / cloud via cli-claude|cli-codex); 27b kept as the default. (t2) Additive theme-aware tab CSS keyed off a .gs-tabs--ready hook class; default shows all panels stacked. (t3) A self-contained initTabs() added beside the existing DOMContentLoaded handlers (theme/copy unchanged); no-ops without a tablist, wires click + Left/Right/Home/End + aria-selected/hidden, and activates the hash-matching tab on load AND on hashchange. (t4) The three surface sections became one accessible tablist + 3 role=tabpanel sections (Terminal only / VS Code / JetBrains); each panel leads with a 'Core model — the key setting' tip, keeps its install/onboarding steps, and links deeper config to settings.html; the #cli/#vscode/#jetbrains + #prerequisites anchors are preserved. Verified locally (site/ has no automated harness): div 44/44 + section 3/3 + <p> 32/32 balanced (an early stray </p> in the three tips was caught by the validate gate and fixed), node --check js/tui.js OK, model ids grep matches the code defaults with no 35b-a3b default substitution, and .gs-tabs appears only in getting-started.html so every other page is inert. NOTE: the daemon validate gate returned passed:false only because npx/tsc/tsx are refused by the in-sandbox permission gate; it reported scopeRespected:true (anchors preserved, correct model ids, genuine no-JS fallback, only the three named files changed). Static-site change — ships to GitHub Pages on push to main; no daemon/plugin rebuild.

## Tasks validated

- ✓ `S001`

## Changes

- `site/css/tui.css` — **insrc-build** (2026-09-30T12:01:46.834Z)
- `site/getting-started.html` — **insrc-build** (2026-09-30T12:01:46.834Z)
- `site/js/tui.js` — **insrc-build** (2026-09-30T12:01:46.834Z)
