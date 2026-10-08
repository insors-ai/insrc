<!-- insrc:artifact BUILD-b9d5c5c40df5a574-s7 -->

# Build (plan-driven) — Story s7

**Standalone:** no  ·  **Created:** 2026-10-08T14:37:06.508Z  ·  **Updated:** 2026-10-08T14:37:06.508Z

**Commit:** e6be8d5c

## Summary

Added resolveScopeForTarget beside resolveScope: it checks a kind of scope against the classifier's table and then resolves. stepScope calls it in place of its two lines, and prepareScope calls it in run mode only. ensureNonEmptyClosure takes its two readers as an optional second parameter and reads the real store when given none. The baseline of the analyze, mcp, daemon and workflow suites was taken at commit f56c9802 on an unchanged tree and is recorded under the Story's baseline folder.

## Tasks validated

- ✗ `t1`

## Changes

- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/README.md` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/analyze.txt` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/daemon.txt` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/mcp.txt` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `docs/epics/make-insrc-analysis-complete-used-right-E20261006b9d5c5c4/S007/baseline/workflow.txt` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `src/analyze/context/__tests__/invariants.test.ts` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `src/analyze/context/__tests__/prepare-scope.test.ts` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `src/analyze/context/driver.ts` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `src/analyze/context/scope.ts` — **insrc-build** (2026-10-08T14:37:06.508Z)
- `src/mcp/analyze-step/scope.ts` — **insrc-build** (2026-10-08T14:37:06.508Z)
