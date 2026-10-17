<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T08:18:18.094Z

**Commit:** 7fc29ed3

## Summary

Re-validate after code review round 1 (222cc3f0): testsReaching entries now carry the caller's test file (`<file>#<caller>`, grounding.ts) and the coverage rule judges a reaching entry by its test file's latest run in the test record, never by matching a caller name to a title (round 1's 6 MEDs came from helper names matched against titles). New case: buildCoveragePrompt join test; grounding.test.ts updated for the entry format. Two falsifying mutations each fail them. Earlier t2 behaviour (latest run by ranAt, barriers, BUILD per-task passed) unchanged; the named t2 test still passes.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/CR-1102dc7125ad0c07-S001.json` — **insrc-build** (2026-10-17T08:18:18.094Z)
- `docs/standalone/ground-code-review-coverage-story-s-E202610171102dc71/S001/CR.md` — **insrc-build** (2026-10-17T08:18:18.094Z)
