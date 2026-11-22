<!-- insrc:artifact BUILD-a03e99e17a364550-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T17:48:45.684Z  ·  **Updated:** 2026-11-22T07:34:23.781Z

**Commit:** e44452302

## Summary

Tasks t1–t5 supply authenticated staging, qualified predecessor recovery, durable Linux selection and native ownership, and independent installer/shell delivery. Task t6 routes TUI and startup/MCP through selected source owners, acknowledges detached updates before preparation, preserves independent updater/replacement lifetimes and durable committed/rolled-back/recovery-required results, and refuses historical incumbent build delegation. Controlled official-runtime fixtures and regression evidence are recorded; actual historical application/native/data qualification remains t9–t11.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/node-runtime-evidence/source-upgrade-bootstrap.md` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/source-upgrade-qualification-native.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/bundle-release-bootstrap.mjs` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/prepare-source-release.mjs` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/bin/insrc-release-bootstrap.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/__tests__/managed-release-bootstrap.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/__tests__/source-release-promotion.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/managed-release-staging.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/release-compatibility.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/source-release-qualification.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/source-release-compatibility.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/source-release-target.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `.insrc/artifacts/TASKS-a03e99e17a364550-s1.log.jsonl` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `docs/plans/node-runtime-evidence/source-installation-state.md` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/__tests__/source-installation.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/managed-source-release.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/source-installation.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `docs/plans/node-runtime-evidence/source-predecessor-recovery.md` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/source-predecessor-native.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/bin/insrc-runtime-smoke.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/bin/insrc-source-recovery.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/source-predecessor.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `docs/plans/node-runtime-evidence/source-update-transaction.md` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/__tests__/helpers/source-linux.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/__tests__/source-update-transaction.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/source-update-transaction.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `build-process-broker.mjs` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `docs/plans/node-runtime-evidence/source-entrypoints.md` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/bin/insrc-source-startup-barrier.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/native/source-actor/main.c` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/__tests__/source-actor-native.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/source-actor-client.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/source-bootstrap-inventory.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/source-store-inspection.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/source-store-probe.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/__tests__/source-transaction-host.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/source-transaction-host.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/__tests__/source-actor-boot.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/source-entrypoints-native.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/bin/insrc-source-control.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `docs/plans/node-runtime-evidence/source-consumers.md` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/source-routing.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/helpers/owned-source-fixture.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/helpers/source-entrypoint-authority.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/node-runtime-cli-native.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/package-daemon-candidate.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/package-linux-daemon-candidate.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/__tests__/source-consumers-native.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/insrc` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/insrc-mcp` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/package-daemon-candidate.mjs` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `scripts/source-selection-env.sh` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/cli/__tests__/maintenance-source.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/cli/services/__tests__/maintenance-install-marker.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/cli/services/__tests__/maintenance-reconcile.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/cli/services/__tests__/maintenance-steering-refresh.test.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/managed-update-ipc.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/daemon/source-update-launch.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/source-update-outcomes.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-22T07:34:23.781Z)
