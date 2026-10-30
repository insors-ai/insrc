<!-- insrc:artifact BUILD-4bfefb556f0dc560-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-10-30T09:51:03.769Z  ·  **Updated:** 2026-10-30T10:50:36.072Z

**Commit:** 61f43754a

## Summary

Actual installed Claude v2 source-only and indexed-impact probes completed on03959efd1 with independently exported candidates and no missing checks; real controls, two durable ACKs and SIGKILL exit verified. Canonical probe records ISSUE-9ff1c86fdd7adcbc and ISSUE-f29a3e27b3282f6e are prepared, not approved. Earlier attempts failed solely from host-only diagnostic text being mischarged as model context; corrected without changing128K cap or byte bounds.16 focused regression tests/build passed. Readiness and real new-engine acceptance remain pending.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/agent/providers/__tests__/claude-investigation-v2.test.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/__tests__/investigation-session.test.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/__tests__/native-investigation-fixtures.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/claude-investigation-policy.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/claude-investigation-probe.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/claude-investigation-session.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/investigation-session.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/native-investigation-probe.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/daemon/review-investigation-probe-export.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/daemon/review-investigation-probe-fixtures.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/shared/review-investigation-probe.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/shared/review-isolation-evidence.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/__tests__/native-investigation-probe.test.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/claude-investigation-diagnostics.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/claude-investigation-qualification.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/__tests__/claude-investigation-session.test.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `src/agent/providers/native-investigation-session.ts` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/PLAN-4bfefb556f0dc560-s1.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/PLAN-4bfefb556f0dc560-s1.log.jsonl` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/TASK-4bfefb556f0dc560-s1-t1.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/TASK-4bfefb556f0dc560-s1-t2.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/TASK-4bfefb556f0dc560-s1-t3.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/TASK-4bfefb556f0dc560-s1-t4.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/TASK-4bfefb556f0dc560-s1-t5.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/TASK-4bfefb556f0dc560-s1-t6.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/TASKS-4bfefb556f0dc560-s1.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/TASKS-4bfefb556f0dc560-s1.log.jsonl` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `docs/review-investigation.md` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/ISSUE-9ff1c86fdd7adcbc.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `.insrc/artifacts/ISSUE-f29a3e27b3282f6e.json` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `docs/standalone/verify-installed-native-review-qualification-indexed-E20261030f29a3e27/ISSUE.md` — **insrc-build** (2026-10-30T10:50:36.072Z)
- `docs/standalone/verify-installed-native-review-qualification-source-E202610309ff1c86f/ISSUE.md` — **insrc-build** (2026-10-30T10:50:36.072Z)
