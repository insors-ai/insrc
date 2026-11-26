<!-- insrc:artifact BUILD-8812fdd9dd65534a-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-25T13:14:24.797Z  ·  **Updated:** 2026-11-25T13:29:25.025Z

**Commit:** 02fa0a28a

## Scope

Ship GPT-6.2 Astra and Sol as Codex core and mid defaults. Map sonnet to Claude Sonnet 5.5 and list Fable 5.2. Keep prior IDs selectable, preserve explicit pins and effort during update, and verify live CLI availability, built asset delivery, installer defaults, and update reconciliation.

## Summary

Captured live CLI output and installer step-4b dry-run output are in docs/standalone/refresh-shipped-gpt-claude-models-E202611258812fdd9/S001/verification.md. Both GPT models and both Claude models completed with matching CLI-reported identity. Both canonical installer dry runs exited zero with expected defaults. The full installer suite separately fails the pre-existing byte equality check between installer script copies.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/daemon.md` — **insrc-build** (2026-11-25T13:29:25.025Z)
- `src/assets/models/cloud-model-catalog.json` — **insrc-build** (2026-11-25T13:29:25.025Z)
- `src/config/__tests__/config-reconcile-smoke.test.ts` — **insrc-build** (2026-11-25T13:29:25.025Z)
- `src/daemon/__tests__/model-catalog-asset.test.ts` — **insrc-build** (2026-11-25T13:29:25.025Z)
- `src/daemon/__tests__/models-daemon-s3.test.ts` — **insrc-build** (2026-11-25T13:29:25.025Z)
- `src/daemon/steps/build-step/phases/validate.ts` — **insrc-build** (2026-11-25T13:29:25.025Z)
