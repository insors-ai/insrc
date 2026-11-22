<!-- insrc:artifact BUILD-a03e99e17a364550-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T17:48:45.684Z  ·  **Updated:** 2026-11-22T05:02:13.772Z

**Commit:** 3b4af8ead

## Summary

Story t1–t5 provide independent authenticated source staging and qualified predecessor recovery, durable Linux selection/rollback and retained native subtree ownership, plus current packaged installer and shell routing. Controlled arm64/x64 fixtures retain the exact a30aa7f91 shell updater and exercise legacy/bound roots, missing authenticated material, absolute owned Node/npm, running/stopped and unchanged lifecycle semantics, malformed-state refusal and profile-change admission. macOS source routing retains its lifecycle and issuer owner. Production historical native/data qualification and other clients remain pending tasks.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/node-runtime-evidence/source-upgrade-bootstrap.md` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `scripts/__tests__/source-upgrade-qualification-native.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `scripts/bundle-release-bootstrap.mjs` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `scripts/prepare-source-release.mjs` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/bin/insrc-release-bootstrap.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/__tests__/managed-release-bootstrap.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/__tests__/source-release-promotion.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/managed-release-staging.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/release-compatibility.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/source-release-qualification.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/shared/source-release-compatibility.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/shared/source-release-target.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `.insrc/artifacts/TASKS-a03e99e17a364550-s1.log.jsonl` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `docs/plans/node-runtime-evidence/source-installation-state.md` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/shared/__tests__/source-installation.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/shared/managed-source-release.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/shared/source-installation.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `docs/plans/node-runtime-evidence/source-predecessor-recovery.md` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `scripts/__tests__/source-predecessor-native.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/bin/insrc-runtime-smoke.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/bin/insrc-source-recovery.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/source-predecessor.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `docs/plans/node-runtime-evidence/source-update-transaction.md` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/__tests__/helpers/source-linux.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/__tests__/source-update-transaction.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/source-update-transaction.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `build-process-broker.mjs` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `docs/plans/node-runtime-evidence/source-entrypoints.md` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/bin/insrc-source-startup-barrier.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/native/source-actor/main.c` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/shared/__tests__/source-actor-native.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/shared/source-actor-client.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `scripts/__tests__/source-bootstrap-inventory.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/source-store-inspection.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/source-store-probe.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/__tests__/source-transaction-host.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/daemon/source-transaction-host.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/shared/__tests__/source-actor-boot.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `scripts/__tests__/source-entrypoints-native.test.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-11-22T05:02:13.772Z)
- `src/bin/insrc-source-control.ts` — **insrc-build** (2026-11-22T05:02:13.772Z)
