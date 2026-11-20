<!-- insrc:artifact PLAN-9c2482c594fd8df5-s1 -->

# Plan: STORY-9c2482c594fd8df5-s1

## Summary

**Epic:** `exclude-live-store-from-directory-searches`
**LLD run:** `wf-1795160392350-y0gcd5`
**LLD effective hash:** `bf8e1e95dccc...`

Implement and prove pre-read live-store exclusion in shared grep, then validate compatibility and record evidence. Canonical store-containing roots use the guarded Node walker; ordinary roots retain explicitly non-following ripgrep. No public API or persistent-model change.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Guard shared grep admission and prove store read exclusion | M | — | — | integration: Protected direct roots refuse before backend or content access; integration: Store ancestor and directory aliases use guarded Node in bounded and complete modes; integration: Allowed roots retain real ripgrep without ambient configuration or symlink following | [[c1]] [[c2]] |
| 2 | **`t2`** Validate shared search compatibility and record Batch 03 evidence | S | — | `t1` | integration: Grep result shapes and Node/ripgrep omission rules remain truthful; integration: Complete-mode failure preserves allowed partial hits; smoke: Recorded focused validation reports actual coverage, baseline timing failures and closed actors | [[c1]] [[c2]] [[c3]] |

### 1.1 TASK-9c2482c594fd8df5-s1-t1 — Guard shared grep admission and prove store read exclusion

Implement approved canonical, component-safe root ancestry decision for both data and lock targets before either rg branch. Refuse direct protected roots, reuse guarded Node for containing roots, and enforce --no-config/--no-follow on rg elsewhere. Add isolated read/spawn instrumentation and alias/allowed controls without changing public APIs or generic file policy.

**Acceptance checks:**
- Direct protected roots and symlink aliases refuse before any backend spawn or protected content read.
- Containing roots and directory aliases choose Node before rg spawn in bounded and complete modes; data and lock targets are checked independently and Node skips protected content reads.
- Ordinary roots keep real rg, ignore ambient config and do not follow nested symlinks; allowed same-name files and component-prefix siblings remain searchable.
- usedRipgrep, excludedByRule, limits and failures accurately describe actual execution; no output-only filtering, new public options or storage/IPC shape changes.
- Instrument content reads and backend spawn in isolated fixtures; explicitly cover independently resolved lock target, canonical-prefix collision and aliases.

### 1.2 TASK-9c2482c594fd8df5-s1-t2 — Validate shared search compatibility and record Batch 03 evidence

Run focused serial safety and existing search/file/analyzer regressions under supported Node22 with clean owned output. Preserve complete-mode partial-failure semantics and report any existing startup timing failure distinctly; update audit and batch status with actual counts, closure evidence and limits.

**Acceptance checks:**
- ac1–ac4 have recorded focused test evidence, including original leak reproduction, protected read absence and allowed matches.
- Root typecheck and relevant focused checks are run with actual pass/fail/skip/cancel counts, runtime/backend details and confirmed cleanup; no overlapping broad sweep.
- Complete-mode timeout/exit failures preserve allowed partial hits; unchanged baseline 300ms fake-rg startup failure remains reported rather than skipped, disguised or fixed by enlarging deadlines.
- Document Node semantics for store-ancestor searches, existing path replacement/hardlink limits, unchanged public contract and unrefreshed qualification; assess visual relevance from the final change.
- A deterministic complete-mode nonzero-exit control emits an allowed hit before failing and verifies typed failure plus that partial hit independently of the existing startup-timed fixture.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Protected direct roots refuse before backend or content access | `t1` |
| Store ancestor and directory aliases use guarded Node in bounded and complete modes | `t1` |
| Allowed roots retain real ripgrep without ambient configuration or symlink following | `t1` |
| Grep result shapes and Node/ripgrep omission rules remain truthful | `t2` |
| Complete-mode failure preserves allowed partial hits | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/exclude-live-store-from-directory-searches-E202611209c2482c5/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/standalone/exclude-live-store-from-directory-searches-E202611209c2482c5/S001/LLD.md#3-error-paths`
- **[[c3]]** `prior-artifact` `docs/standalone/exclude-live-store-from-directory-searches-E202611209c2482c5/S001/LLD.md#5-migration`
