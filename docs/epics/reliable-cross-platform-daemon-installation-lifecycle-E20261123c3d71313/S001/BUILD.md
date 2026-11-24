<!-- insrc:artifact BUILD-c3d71313f34bce71-s1 -->

# Build (plan-driven) — Story s1

**Standalone:** no  ·  **Created:** 2026-11-23T18:39:45.419Z  ·  **Updated:** 2026-11-24T05:03:49.828Z

**Commit:** 5b92b40d6

## Summary

Protected owner forwarding with native-lock retention and exact original shutdown completion identity. Both task-named integration cases now directly cover their stated scenarios, including simultaneous duplicate success and an active preparing-phase refusal; surrounding tests passed. Full suite remains deferred until all S1 tasks are built.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/evidence/t1.md` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/bridge-protocol.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/contracts.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/location.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/bridge-protocol.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/contracts.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/location.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/schemas.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/evidence/t2.md` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/__tests__/build-script.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/__tests__/test-harness-commands.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/build-installer-control.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/test-harness/build.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/control-fixture.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/controller-store.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/controller-store.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/native-qualification.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/native.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/native/control.c` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/package-installer-control.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/evidence/t3.md` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/bootstrap-publish.cjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/install.ps1` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/install.sh` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/render-installer-bootstrap.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/bootstrap.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/runtime-policy.json` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/runtime-policy.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/evidence/t4.md` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `package-lock.json` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `package.json` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/installer-payload.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/package-installer.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/sync-client-runtime-assets.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/publisher.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/_runtime-fixture.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/publisher-bundle-fixture.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `scripts/__tests__/test-harness-coordinator.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/evidence/t5.md` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/bundle.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/bundle.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/download.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/release-descriptor.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/safe-zip.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/evidence/t6.md` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/_manager-fixture.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/manager-death-fixture.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/manager.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/bundle-delivery.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/manager-entry.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/manager.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/peer-contracts.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/production-peers.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/terminal-admission.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/terminal-entry.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S001/evidence/t7.md` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/operation-control-fixture.mjs` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/__tests__/operation-control.test.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
- `src/installer/operation-control.ts` — **insrc-build** (2026-11-24T05:03:49.828Z)
