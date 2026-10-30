<!-- insrc:artifact PLAN-486751c3411ceef9-S001 -->

# Plan: E20261030486751c3:S001

## Summary

**Epic:** `shared-insors-branded-light-dark-mermaid`
**LLD run:** `wf-1793387884098-ijyj5y`
**LLD effective hash:** `486751c3411c...`

Six ordered tasks: package Poppins offline (t1), build the shared theme-policy module (t2), rewire the companion shell (t3) and the docgen shell + fallback (t4), add viewer behavior tests (t5), then run the full sweep + build + a regeneration smoke and document the regen route (t6).

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Package Poppins fonts as offline assets | S | — | unit: src/artifact-theme/__tests__/fonts.test.ts | [[c1]] [[c5]] |
| 2 | **`t2`** Shared theme-policy module (src/artifact-theme/theme.ts + fonts.ts) | L | `t1` | unit: src/artifact-theme/__tests__/theme.test.ts; unit: src/artifact-theme/__tests__/fonts.test.ts; unit: src/artifact-theme/__tests__/contrast.test.ts | [[c1]] [[c2]] |
| 3 | **`t3`** Rewire companion shell to the policy | M | `t2` | unit: src/workflow/artifacts/companion/__tests__/shell.test.ts | [[c1]] [[c3]] |
| 4 | **`t4`** Rewire docgen shell (+ fallback) to the policy | M | `t2` | unit: src/docgen/render/__tests__/shell.test.ts | [[c1]] [[c4]] |
| 5 | **`t5`** Viewer behavior tests | M | `t2` | integration: src/artifact-theme/__tests__/viewer-script.test.ts; live: src/artifact-theme/__tests__/perf.integration.test.ts | [[c1]] |
| 6 | **`t6`** Full sweep + build + regen smoke + docs | S | `t3`, `t4`, `t5` | smoke: regen smoke | [[c1]] [[c2]] |

### 1.1 E20261030486751c3:S001:T001 — Package Poppins fonts as offline assets

Add src/assets/fonts/poppins/{400,600,700}.woff2 (OFL-1.1) with provenance; copy-assets.mjs ships src/assets wholesale.

**Acceptance checks:**
- woff2 under src/assets/fonts/poppins and out/assets/fonts after build
- OFL note present

### 1.2 E20261030486751c3:S001:T002 — Shared theme-policy module (src/artifact-theme/theme.ts + fonts.ts)

THEME_VERSION; 6 exact brand tokens; light/dark surfaces; CONTRAST_PAIRS (NFR1); ROLE_PALETTE + legend; mermaidConfigFor(mode); pageCssFor(mode) under .insrc-viewer; DIAGRAM_OVERRIDES_CSS under .insrc-viewer-diagram (ER dark-on-Crayola); FONT_FACE_CSS base64; viewerBootScript; exportableSvg.

**Acceptance checks:**
- theme/fonts/contrast tests pass
- no CDN, no .insrc-artifact selector

### 1.3 E20261030486751c3:S001:T003 — Rewire companion shell to the policy

companion/shell.ts: .insrc-viewer root + .insrc-viewer-diagram wrapper (keep #stage); drop theme neutral + fixed STYLE; policy CSS/fonts/overrides/boot; toolbar + error+source + meta stamp.

**Acceptance checks:**
- shell.test.ts branded-output assertions

### 1.4 E20261030486751c3:S001:T004 — Rewire docgen shell (+ fallback) to the policy

docgen/render/shell.ts + fallback.ts: shared classes (#docgen-diagram kept); policy on primary + fallback paths.

**Acceptance checks:**
- docgen shell.test.ts: shared classes both outputs, override matches both DOMs

### 1.5 E20261030486751c3:S001:T005 — Viewer behavior tests

boot node --check; scale clamp floor 16px; re-frame w/o overriding manual zoom; theme switch restores transform; export standalone svg; structural preservation (NFR4); perf baselines (NFR5).

**Acceptance checks:**
- viewer-script + perf tests pass

### 1.6 E20261030486751c3:S001:T006 — Full sweep + build + regen smoke + docs

Full backend test sweep, npm run build, regen smoke of one companion + one docgen doc, document the regeneration route (R14).

**Acceptance checks:**
- sweep green, build green, smoke artifacts branded

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/artifact-theme/__tests__/theme.test.ts | `t2` |
| src/artifact-theme/__tests__/fonts.test.ts | `t1`, `t2` |
| src/artifact-theme/__tests__/contrast.test.ts | `t2` |
| src/workflow/artifacts/companion/__tests__/shell.test.ts | `t3` |
| src/docgen/render/__tests__/shell.test.ts | `t4` |
| src/artifact-theme/__tests__/viewer-script.test.ts | `t5` |
| src/artifact-theme/__tests__/perf.integration.test.ts | `t5` |

## 3. References

- **[[c1]]** `file` `.insrc/artifacts/LLD-486751c3411ceef9-S001.json`
- **[[c2]]** `doc` `plans/mermaid-theme-and-readability-requirements.md`
- **[[c3]]** `file` `src/workflow/artifacts/companion/shell.ts`
- **[[c4]]** `file` `src/docgen/render/shell.ts`
- **[[c5]]** `file` `copy-assets.mjs`
