<!-- insrc:artifact BUILD-c3d71313f34bce71-s3 -->

# Build (plan-driven) — Story s3

**Standalone:** no  ·  **Created:** 2026-11-25T02:01:50.011Z  ·  **Updated:** 2026-11-25T19:41:56.944Z

**Commit:** 079a1f46f

## Summary

Implemented same-fd verified ZIP extraction with positive drain/close, preserved close uncertainty and bounded decoder output, and expanded archive boundary/cancellation coverage. Corrected actual traversal and dependency publication path assertions; surrounding 32 checks, focused six fd-ownership cases and nine matrix/prepare cases passed locally.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t11`
- ✓ `t9`
- ✓ `t10`
- ✓ `t12`
- ✓ `t13`
- ✓ `t14`
- ✓ `t15`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/installer/__tests__/dependency-policy.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/dependency-context.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-policy.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/peer-contracts.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/dependencies.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/dependencies.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `package-lock.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `package.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-tar.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-tar.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-zstd.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `scripts/package-installer.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/publisher.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-archive.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-archive.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-layout.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-zip.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/native.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/native/control.c` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/_ollama-fixture.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-prepare.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/download.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/durability.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-prepare.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-records.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/owned-file.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/safe-zip.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-inspect-fixture.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-process-fixture.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-service-worker-fixture.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-service.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-service-records.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-service-worker.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-service.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/terminal-entry.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/_manager-fixture.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/_private-runtime-test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/dependency-integration.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/manager.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/terminal-install.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/terminal-install.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/installed-dev-fixture.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/production-peers.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-catalog.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/production-peers.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/README.md` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/archive-layout.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/cold-inspection-failure.log` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/decline.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/fresh-inspection-warm.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/native-install.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/native-run.log` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/qualification.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/source-hashes.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/verification-after.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/verification-before.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `scripts/qualify-ollama.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/_ollama-read-sentinel.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-validation.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/native-no-rehash-decline.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/native-no-rehash-inspection-cold.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/native-no-rehash-inspection-warm.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/native-no-rehash-install.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/native-no-rehash-run.log` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/native-no-rehash-source-hashes.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-ollama-native-qualification-2026-11-25/readiness-probe-failure.log` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-catalog.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/sequence-diagram.html` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-dependency-setup-validation-2026-11-25-audit.log` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-dependency-setup-validation-2026-11-25.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-dependency-setup-validation-2026-11-25.log` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-dependency-setup-validation-2026-11-25.md` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t1.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t10.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t11.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t2.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t3.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t4.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t5.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t6.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t7.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t8.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t9.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASKS-c3d71313f34bce71-s3.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASKS-c3d71313f34bce71-s3.log.jsonl` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-manual-review-feedback-2026-11-25.md` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t12-owned-cleanup-validation-2026-11-25.md` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-recovery.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-cleanup.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/ollama-recovery.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t12-native-publication-2026-11-25.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t12-native-publication-driver-2026-11-25.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-close-uncertain-fixture.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t12.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t12-build-gate-2026-11-25.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t13.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t13-install-retry-validation-2026-11-25.md` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/bundle-recovery.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/install-retry.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/bundle-delivery.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/controller-store.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/install-retry-death-fixture.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t13-build-gate-2026-11-25.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t14.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t14-service-signal-validation-2026-11-25.md` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-production-worker.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-signal-fixture.mjs` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-signals.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/terminal-abort.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/terminal-abort.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t14-build-gate-2026-11-26.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `.insrc/artifacts/TASK-c3d71313f34bce71-s3-t15.json` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `docs/plans/s3-t15-archive-validation-2026-11-26.md` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/_archive-boundary-fixture.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-archive-matrix.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
- `src/installer/__tests__/ollama-zip-boundaries.test.ts` — **insrc-build** (2026-11-25T19:41:56.944Z)
