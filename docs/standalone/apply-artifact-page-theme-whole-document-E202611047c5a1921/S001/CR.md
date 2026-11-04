<!-- insrc:artifact CR-7c5a1921cb45a8d8-s1 -->

# Code review: s1

Status: **passed** · task-based schema version 2

## code-review-7c5a1921cb45a8d8-s1-r1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-04T19:41:45.915Z

1 selected task assessment(s): passed.

### Submitted scope

- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/artifact-theme/__tests__/theme-browser.live.test.ts` — [{"after":[1,166]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/artifact-theme/__tests__/theme.test.ts` — [{"after":[85,85]},{"after":[137,138]},{"after":[150,179]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/artifact-theme/__tests__/viewer-script.test.ts` — [{"after":[20,20]},{"after":[74,115]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/artifact-theme/theme.ts` — [{"after":[275,275]},{"after":[299,303]},{"after":[320,320]},{"after":[351,353]},{"after":[381,381]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/docgen/render/__tests__/fallback.test.ts` — [{"after":[241,259]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/docgen/render/__tests__/shell.test.ts` — [{"after":[209,225]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/docgen/render/fallback.ts` — [{"after":[242,242]},{"after":[281,282]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/docgen/render/shell.ts` — [{"deletionAt":203},{"after":[261,262]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/workflow/artifacts/companion/__tests__/shell.test.ts` — [{"after":[109,109]},{"after":[221,250]}]
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/workflow/artifacts/companion/shell.ts` — [{"after":[190,190]},{"after":[246,248]},{"after":[260,260]}]

### s1: passed

The Task correctly applies the artifact page theme to the whole document across all three shells (companion, docgen primary, docgen fallback): the body is now the .insrc-viewer theme root with min-height:100vh/padding-top:56px/box-sizing:border-box, no rule paints html so the body background propagates to the canvas, pages default to light (prefers-color-scheme dropped from both the shared boot script and the fallback shell's own script), font-face rules are wrapped in a <style> element, the theme switch is a fixed 32px top-right #iv-theme button that is a direct child of <body> in all three shells, and the companion header/table shrink via a max-width:480px media rule. All claimed unit tests (62 pass, 3 pre-existing live tests skipped without INSRC_LIVE_TESTS=1) were independently re-run against the pinned commit e673bdfb5 and pass; tsc --noEmit is clean.

Coverage: **verified** — Re-ran all five non-live unit test files (theme.test.ts, viewer-script.test.ts, companion/shell.test.ts, docgen/render/shell.test.ts, docgen/render/fallback.test.ts) against the pinned commit e673bdfb5; 62 pass, 0 fail, 3 skipped (the pre-existing live suites that correctly skip without INSRC_LIVE_TESTS=1/a Chrome binary). Each acceptance criterion (ac1-ac4) maps to at least one unit test plus a live browser check; the unit assertions were read line-by-line against the implementation (e.g. pageCssFor's min-height/padding-top/no-html-background checks, the viewer-script stub-DOM localStorage throw/invalid-value/missing-button cases, the companion direct-child-of-body and 480px media-rule checks, the docgen no-'.insrc-viewer html'-rule check, and the fallback script's shared-storage-key/no-prefers-color-scheme check) and each correctly exercises the behavior it claims to.


Optional verification and advice (nonblocking):

- Optional execution: did not run the live headless-Chrome suite (theme-browser.live.test.ts); it requires INSRC_LIVE_TESTS=1 plus a google-chrome/chromium binary and the builder already reported it passing with a screenshot artifact.
- The fallback shell's structural CSS still carries a bare `html, body { margin:0; height:100%; }` rule (unchanged by this Task, pre-existing, not scoped under .insrc-viewer). It sets no background so it does not reintroduce the white-canvas defect the LLD fixes, but worth a follow-up cleanup for consistency with the other two shells which carry no html rule at all.

Inspected references:

- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/artifact-theme/theme.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/artifact-theme/__tests__/theme.test.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/artifact-theme/__tests__/viewer-script.test.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/artifact-theme/__tests__/theme-browser.live.test.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/workflow/artifacts/companion/shell.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/workflow/artifacts/companion/__tests__/shell.test.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/docgen/render/shell.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/docgen/render/__tests__/shell.test.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/docgen/render/fallback.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:src/docgen/render/__tests__/fallback.test.ts`
- `e673bdfb5a7c4366c7430ce70a0045c2026c485e:docs/standalone/apply-artifact-page-theme-whole-document-E202611047c5a1921/S001/LLD.md`

Test: `npx tsx --test src/artifact-theme/__tests__/theme.test.ts src/artifact-theme/__tests__/viewer-script.test.ts src/workflow/artifacts/companion/__tests__/shell.test.ts src/docgen/render/__tests__/shell.test.ts src/docgen/render/__tests__/fallback.test.ts` — pass
Reviewer-executed at working tree HEAD (e673bdfb5 is an ancestor); all 3 cases passed

Test: `npx tsx --test src/artifact-theme/__tests__/theme.test.ts src/artifact-theme/__tests__/viewer-script.test.ts src/workflow/artifacts/companion/__tests__/shell.test.ts src/docgen/render/__tests__/shell.test.ts src/docgen/render/__tests__/fallback.test.ts` — pass
Reviewer-executed; both cases passed

Test: `npx tsx --test src/artifact-theme/__tests__/theme.test.ts src/artifact-theme/__tests__/viewer-script.test.ts src/workflow/artifacts/companion/__tests__/shell.test.ts src/docgen/render/__tests__/shell.test.ts src/docgen/render/__tests__/fallback.test.ts` — pass
Reviewer-executed; all 4 cases passed

Test: `npx tsx --test src/artifact-theme/__tests__/theme.test.ts src/artifact-theme/__tests__/viewer-script.test.ts src/workflow/artifacts/companion/__tests__/shell.test.ts src/docgen/render/__tests__/shell.test.ts src/docgen/render/__tests__/fallback.test.ts` — pass
Reviewer-executed; case passed

Test: `npx tsx --test src/artifact-theme/__tests__/theme.test.ts src/artifact-theme/__tests__/viewer-script.test.ts src/workflow/artifacts/companion/__tests__/shell.test.ts src/docgen/render/__tests__/shell.test.ts src/docgen/render/__tests__/fallback.test.ts` — pass
Reviewer-executed; both cases passed (plus 3 unrelated pre-existing live tests in the same files correctly skipped without INSRC_LIVE_TESTS=1)

Test: `INSRC_LIVE_TESTS=1 npx tsx --test src/artifact-theme/__tests__/theme-browser.live.test.ts` — not_run
Not executed by the reviewer (optional); relying on the builder's reported pass with screenshot evidence
