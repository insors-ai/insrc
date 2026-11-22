<!-- insrc:artifact BUILD-a03e99e17a364550-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-21T17:48:45.684Z  ·  **Updated:** 2026-11-22T07:54:52.210Z

**Commit:** df2897dc1

## Summary

Tasks t1–t5 provide authenticated staging, qualified recovery, Linux selection/native ownership, and independent installer/shell delivery. Task t6 adds selected TUI/start/MCP routing, acknowledgment before detached preparation, independent updater/replacement lifetimes and durable terminal update results without incumbent build delegation. The first gate consumed stale out/ after a final interface correction; canonical run a78df1c3 rebuilt and passed both consumers. Upstream was then merged cleanly and canonical run de30806c rebuilt the merged ca736d71b tree and passed six upstream test files. Actual historical application/native/data qualification remains t9–t11; BUILD approval is deferred until all story tasks complete.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/plans/node-runtime-evidence/source-upgrade-bootstrap.md` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/source-upgrade-qualification-native.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/bundle-release-bootstrap.mjs` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/prepare-source-release.mjs` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/bin/insrc-release-bootstrap.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/__tests__/managed-release-bootstrap.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/__tests__/source-release-promotion.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/managed-release-staging.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/managed-update-preparation.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/release-compatibility.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/source-release-qualification.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/source-release-compatibility.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/source-release-target.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `.insrc/artifacts/TASKS-a03e99e17a364550-s1.log.jsonl` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `docs/plans/node-runtime-evidence/source-installation-state.md` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/__tests__/source-installation.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/managed-source-release.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/source-installation.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `docs/plans/node-runtime-evidence/source-predecessor-recovery.md` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/source-predecessor-native.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/bin/insrc-runtime-smoke.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/bin/insrc-source-recovery.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/source-predecessor.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `docs/plans/node-runtime-evidence/source-update-transaction.md` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/__tests__/helpers/source-linux.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/__tests__/source-update-transaction.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/source-update-transaction.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `build-process-broker.mjs` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `docs/plans/node-runtime-evidence/source-entrypoints.md` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/bin/insrc-source-startup-barrier.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/native/source-actor/main.c` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/__tests__/source-actor-native.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/source-actor-client.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/source-bootstrap-inventory.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/source-store-inspection.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/source-store-probe.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/__tests__/source-transaction-host.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/source-transaction-host.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/__tests__/source-actor-boot.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/source-entrypoints-native.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/daemon-ctl.sh` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/insrc-daemon-install.sh` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/bin/insrc-source-control.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `docs/plans/node-runtime-evidence/source-consumers.md` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/source-routing.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/helpers/owned-source-fixture.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/helpers/source-entrypoint-authority.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/node-runtime-cli-native.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/package-daemon-candidate.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/package-linux-daemon-candidate.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/__tests__/source-consumers-native.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/insrc` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/insrc-mcp` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/package-daemon-candidate.mjs` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `scripts/source-selection-env.sh` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/cli/__tests__/maintenance-source.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/cli/services/__tests__/maintenance-install-marker.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/cli/services/__tests__/maintenance-reconcile.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/cli/services/__tests__/maintenance-steering-refresh.test.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/cli/services/daemon.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/cli/services/maintenance.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/admin-handlers.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/managed-update-ipc.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/daemon/source-update-launch.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/source-update-outcomes.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
- `src/shared/types.ts` — **insrc-build** (2026-11-22T07:54:52.210Z)
