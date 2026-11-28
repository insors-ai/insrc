<!-- insrc:artifact BUILD-446ae69566d352dd-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-26T07:40:02.075Z  ·  **Updated:** 2026-11-27T10:41:47.118Z

**Commit:** f5e9f2afe

## Summary

Corrected native UTM extraction timeout under Task3: durable extraction now shares the existing bounded600s acquisition signal, while read-only verification remains120s. All22 surrounding runtime acquisition/publication/store cases pass with strict12-group closure; official integrity, durability, cancellation and uncertainty checks remain intact. Native rerun and updated final scoped regression remain pending; no whole-story approval claimed.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`
- ✓ `t7`
- ✓ `t8`
- ✓ `t9`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t1.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/generate-runtime-profiles.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/runtime-policy.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/runtime-metadata.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/runtime-policy.json` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/runtime-policy.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t2.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/_runtime-profile-fixture.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/runtime-store.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/runtime-store.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t3.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/runtime-acquire.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/ollama-tar.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/runtime-acquire.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/runtime-archive.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/tar-primitives.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t4.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/runtime-install.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/controller-store.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/runtime-install.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t5.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/bootstrap-publish.cjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/install.ps1` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/install.sh` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/package-installer.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/render-installer-bootstrap.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/bootstrap-bundle-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/bootstrap-control.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/bootstrap.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/bootstrap-control.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/bootstrap-foundation.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/terminal-entry.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t6.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/installer-payload.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/application-payload.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/bundle-recovery.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/bundle.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/foundation-payload-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/foundation-payload.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/publisher.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/application-payload.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/bundle-delivery.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/bundle.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/distribution-artifacts.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/download.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/manager.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/ollama-catalog.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/release-descriptor.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/safe-zip.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t7.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/_dev-runtime-fixture.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-complete-payload-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-git-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-manager-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-manager-peers-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-manager.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-metadata.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-payload-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-payload.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-runtime.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-source-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-toolchain-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-toolchain.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-worker-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-worker.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/installed-dev-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/dev-delivery.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/dev-git.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/dev-payload.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/dev-toolchain.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/dev-worker.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/dev.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/production-peers.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t8.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/qualify-ollama.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/_installed-control-fixture.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/_ollama-fixture.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dependencies.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/installed-status.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-inspect-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-prepare.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-production-worker.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-service-worker-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-service.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-signal-fixture.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-signals.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/production-peers.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/terminal-install.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/dependencies.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/installed-control.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/installed-launcher.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/installed-receipt.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/manager-entry.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/ollama-prepare.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/ollama-service-worker.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/ollama-service.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/runtime-binding.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/terminal-install.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/plans/runtime-foundation-native-qualification.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/__tests__/installer-s2-qualification.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `scripts/qualify-runtime-foundation.mjs` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t9.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `.github/workflows/ci.yml` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-complete-payload.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dependency-integration.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-validation.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/ollama-service-snapshot.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t10.md` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/payload-source-links.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/t10-linux.json` — **insrc-build** (2026-11-27T10:41:47.118Z)
- `src/installer/__tests__/dev-git.test.ts` — **insrc-build** (2026-11-27T10:41:47.118Z)
