<!-- insrc:artifact BUILD-a5d5b2bb021655d0-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-27T14:35:22.914Z  ·  **Updated:** 2026-11-27T19:54:57.983Z

**Commit:** 9c805a8bd

## Summary

Actual fresh UTM macOS slow-vm qualification passed on committed source 2fca011a69ec3b0ce5e9e53e9074928baec02495. Independent audit verifies live official Node acquisition, zero-network offline reuse, private Node22.22.1/npm10.9.4/native payload consumers and all 11 preflight, 9 outer and 25 worker command-group closures. Retired failed guest attempt remains retained unchanged after independently observed whole-guest shutdown; final scoped regression remains pending. No host daemon/Ollama mutation, release enablement or current Linux/Windows qualification is claimed.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `copy-assets.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/qualification-time-budgets.test.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/qualification-time-budgets.d.mts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/qualification-time-budgets.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t1.md` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t2.md` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `scripts/test-harness/context.d.mts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `scripts/test-harness/context.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `scripts/test-harness/process.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/dev-source-fixture.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/dev-toolchain-fixture.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/dev-toolchain.test.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/installed-dev-fixture.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/qualification-scopes.test.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/dev-git.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/dev-manager-fixture.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/qualification-manager.test.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t3.md` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/qualification-runtime-fixture.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/qualification-runtime.test.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/download.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/runtime-acquire.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/runtime-archive.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/runtime-metadata.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t4.md` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/qualification-worker-fixture.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/qualification-worker.test.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/dev-delivery.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/dev-worker.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `.github/workflows/ci.yml` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t5.md` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/testing.md` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `scripts/__tests__/qualification-containment-fixture.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `scripts/__tests__/qualification-containment.test.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `scripts/qualification-containment.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `scripts/qualify-runtime-foundation.mjs` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `src/installer/__tests__/qualification-installed.test.ts` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-prerequisite.json` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6.md` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-actual-budgets.json` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-audit.json` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-native-result.json` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-retired-vm-closure.json` — **insrc-build** (2026-11-27T19:54:57.983Z)
- `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/evidence/t6-supervisor.json` — **insrc-build** (2026-11-27T19:54:57.983Z)
