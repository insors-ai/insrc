<!-- insrc:artifact BUILD-ce99b72065d03b1b-s4 -->

# Build (plan-driven) — Story s4

**Standalone:** no  ·  **Created:** 2026-10-26T08:16:23.074Z  ·  **Updated:** 2026-10-26T11:05:56.917Z

**Commit:** d631359a0

## Summary

Added the Claude procedure (recognised-unconfirmed effort names from --help, a --print run decided only on exit 0 plus a success envelope, is_error as refusal, input limit from modelUsage). Fix f6f34de5f: the installed CLI wraps the --effort value list onto the next line; the parser now reads a wrapped list but never past the next option.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t6`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/model-registry.test.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/model-registry.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/__tests__/model-check.test.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/model-check.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/__tests__/handler-runtime.test.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/threads/method-class.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S004/evidence/model-check-live.txt` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/__tests__/model-check.live.test.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `src/daemon/__tests__/models-daemon-s4.test.ts` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `.insrc/artifacts/CR-ce99b72065d03b1b-s4.json` — **insrc-build** (2026-10-26T11:05:56.917Z)
- `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S004/CR.md` — **insrc-build** (2026-10-26T11:05:56.917Z)
