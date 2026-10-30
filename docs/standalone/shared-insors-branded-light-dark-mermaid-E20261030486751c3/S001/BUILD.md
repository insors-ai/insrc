<!-- insrc:artifact BUILD-486751c3411ceef9-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-30T19:37:31.977Z  ·  **Updated:** 2026-10-30T21:51:21.309Z

**Commit:** 4afe8a18a

## Summary

t6 final reconciliation: (1) build green — tsc exit 0, check-model-definitions + copy-assets clean (/tmp/build-t6.log). (2) regen smoke branded — companion + docgen shells 8/8 branded checks each (/tmp/smoke.mts). (3) affected suites green: artifact-theme 19/0, companion+docgen wide 236/0, admin-worker 4/0, indexing-worker 4/0, debug-mcp 9/0. (4) SWEEP RECONCILED per-file at pristine HEAD (worktree /tmp/pristine5 @ 012a6624d, same node_modules): every disputed full-sweep failure was re-run in isolation on BOTH trees — /tmp/disputed-mine.log vs /tmp/disputed-pristine.log. Result: ZERO failing tests unique to the changed tree (comm of normalized fail lists is empty on the mine side; pristine actually has 3 extra flaky fails: CM-S3-GATE, CM-S4-GATE-bundle, CM-S5-LIFETIME-COPY). The 12 CM-S3 + CM-S4-GATE failures reproduce identically at pristine HEAD; SIGTERM-during-indexing and summary-link job-in-flight PASS in isolation on both trees (their full-sweep failures are cross-file interference under load). Earlier pristine sweep log /tmp/full-pristine4.log was killed mid-run at CM-S4-BUSY, which is why its fail list lacked the later files — that gap is now closed by the per-file pristine runs. Conclusion: no test regression is attributable to this Story; all sweep failures are pre-existing/environmental at HEAD.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t5`
- ✓ `t4`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.
