# VS Code plugin failing tests — fix plan (2026-11-27)

Complete table of every failing test located in `vscode-plugin` on branch `v2`,
its root cause, the tracked work item that owns it, and the fix action. Located
by running the suite both ways — bare `npx tsx --test 'src/**/__tests__/*.test.ts'`
from `vscode-plugin/` and the supported harness `npm test -- --suite=vscode <file>`
from the repo root under Node 22.22.1 — plus each suspect file individually, and
re-verified at HEAD with the chat-panel fix reverted (no failure is caused by
`8a26ef27d`; `chat-panel.test.ts` is 289/289 clean).

**How to read "verdict":** `real` = fails under the supported harness too;
`artifact` = only fails under a bare/parallel run from the wrong cwd (not a
defect).

## The table

| # | Failing test (location) | Verdict | Root cause | Tracked item | Status | Fix action |
|---|---|---|---|---|---|---|
| 1 | `manifest-catalog.test.ts:39` — "declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths" (extra: `insrc.models.security.runner/model/effort`) | real | Backend added `models.security.*` rows (`src/config/config-catalog.ts:142-144`, commit `84ae8300a`, #230) without re-syncing the plugin manifest | `ISSUE-1e2052060dec3efb` "Synchronize model settings and catalog contract tests" (`docs/standalone/synchronize-model-settings-catalog-contract-tests-E202611201e205206/`) | **draft — stuck at approve-define, never approved/built** | Approve the ISSUE, then build: regenerate `package.json` contributes + key-map from the catalog |
| 2 | `manifest-catalog.test.ts:62` — "each declared key's type/enum/default matches its ConfigOption, scope 'machine'" | real | same drift | same | draft | same |
| 3 | `per-role.test.ts:77` — "declared insrc.models.tasks.* keys EXACTLY cover the role taxonomy" (extra: `insrc.models.tasks.security.review`) | real | `security.review` role added to `src/config/role-taxonomy.ts:108` (`54c98e80f`, #229), plugin manifest not synced | same | draft | same |
| 4 | `per-role.test.ts:86` — "each per-role key is a machine-scoped enum with default = the role's defaultTier" (actual `mid`) | real | same drift | same | draft | same |
| 5 | `sync-manifest-catalog.test.ts:26` — "the committed manifest is in sync, idempotent on a stale copy" | real | committed `package.json` manifest stale vs `CONFIG_CATALOG` | same | draft | same |
| 6 | `vscode-bundle-catalog.test.ts:24` — bundled key map covers every settings-catalog row (41-row mismatch) | real | same drift | same | draft | same |
| 7–15 | `chat-theme.test.ts` lines 96, 147, 165, 212, 308, 328, 479, 498, 528 — style/token/selector/CSP snapshot assertions (9 tests) | real (fail at HEAD too) | shell CSS/markup changed by later stories; the test's frozen snapshots no longer match the rendered shell | `ISSUE-70276d53b0e62378` "Update chat theme tests for the current shell structure" (`docs/standalone/update-chat-theme-tests-current-shell-E2026112070276d53/`) | **draft — stuck at approve-define** | Approve the ISSUE, then rebuild the snapshots against the current shell (fix any real visual discrepancy found) |
| 16 | `docs-review-panel.test.ts` t3 "the 'absent' state carries NO member other than state" (~:2497) | real | `typecheckAgainstPanel` compile probe not isolated from dependency `.d.ts` errors — tsc surfaces `node_modules` errors (`@huggingface/transformers`, `lmdb`) and fails the accept-valid-code assertion | **new `ISSUE-ba80a780…`** (`docs/standalone/two-untracked-vs-code-plugin-test-E20261127ba80a780/`) | draft — presented, awaiting approval | Isolate the probe's tsc run (skipLibCheck/types scoping) so the assertion tests what it names |
| 17 | `docs-review-panel.test.ts` t3 "an unhandled companion kind is a COMPILE error" (~:2510) | real | same probe isolation gap | same new ISSUE | draft | same |
| 18 | `daemon/__tests__/commands.test.ts:129` — "VS Code daemon commands delegate install and lifecycle…" | real | test expects install argv `[bash, installer.sh, -y]`; controller now appends `--target <root>` (owned-runtime routing, `77c317a88`) — expectation never updated | same new ISSUE | draft | Update the argv expectation to the current `--target` contract (or fix the controller only if the product contract is wrong) |
| 19 | `hosts/__tests__/activation.test.ts:14` (assert at :23) — AiHostRegistry launch target | real | test expects `join(paths.daemonRoot, 'scripts', 'insrc-mcp')`; `extension.ts` now resolves via `selectedMcpRoot(paths) ?? paths.daemonRoot` | `ISSUE-c03a454b11fd5933` "Make the activation tests run to completion" (`docs/standalone/bug-test-vscode-plugin-src-tests-E20261012c03a454b/`) | **draft — stuck at approve-define** | Approve the ISSUE; update the expectation to the `selectedMcpRoot` resolution |
| 20 | `hosts/__tests__/activation.test.ts:46-51` — sync-assets steering-block byte-match | artifact when run bare; passes under the harness (which runs `sync-assets` first) | `src/prompts/steering-block.md` changed (`3297210a8`, added `insrc_security_review_step`) without a committed asset sync | — (harness pre-step covers it; commit the synced asset) | n/a | Run `npm run sync-assets --prefix vscode-plugin` and commit `assets/steering-block.md` |
| 21 | `connections/__tests__/privacy.test.ts:83` — esbuild "Could not resolve vscode-plugin/src/connections/host.ts" | artifact | entry path is cwd-relative; passes under the harness (repo-root cwd), fails when run bare from `vscode-plugin/` | — | n/a | Run from repo root via the harness; optionally make the entry path cwd-independent |
| 22 | file-level `1:1` "Promise resolution is still pending" kills for `docs-review-decision`, `link-markup`, `link-opener`, `review-frame-message`, `review-presenter`, `docs-review-panel`, `chat-theme` in a parallel glob run | artifact | parallel bare-run resource contention; each file passes individually (14/15, 11/12, 7/8, 4/5, 10/11, …) | `ISSUE-4b33600426ce1112` "Make the test sweep finish reliably without --test-force-exit" | **draft** | Use the harness (bounded, owned children) for sweeps |

## Why these weren't fixed before

- `ISSUE-dc557863fa52ecf5` "Fix 16 pre-existing VS Code extension test failures"
  (`fix-16-pre-existing-vs-code-E20261108dc557863/`, GH #103) was approved and
  built (`dcc0f03b3`): its sweep was green (1699 pass / 0 fail) **for the failure
  set as of 2026-11-08** (Tracker panel, approval prompter, renderer/UX tests).
  Its own close-out is incomplete: chain sits at `push-tracker`, #103 still OPEN.
- Everything failing now was **introduced after that sweep** — the
  security-review epic's config rows/role (#229, #230, 2026-11-23) and later
  chat-shell changes — and the follow-up issues that cover them
  (`1e2052060`, `70276d53`, `c03a454b`, `4b336004`) are all still **draft at the
  `approve-define` gate**: they were triaged and written up, but the explicit
  in-chat approval that advances them was never given, so they never reached
  build. The new `ISSUE-ba80a780…` covers the previously untracked remainder
  (docs-review-panel t3 probe isolation + commands `--target` argv).

## Order of operations

1. Approve `ISSUE-ba80a780…` (presented now) → build it (small bugfix, 2 test
   files + probe helper).
2. Approve the three stuck drafts in dependency order: `1e2052060` (manifest
   sync — unblocks 6 tests), `70276d53` (chat-theme snapshots — 9 tests),
   `c03a454b` (activation — 1 test).
3. Commit the synced `assets/steering-block.md` (or let the harness pre-step
   own it) and always run sweeps via the harness from the repo root.
4. Close out `dc557863` properly: push tracker (#103) and close it.
