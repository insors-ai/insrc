<!-- insrc:artifact BUILD-fefa97b991537da7-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-08T16:59:13.219Z  ·  **Updated:** 2026-11-08T19:40:34.708Z

**Commit:** 0ed541b91

## Summary

The keys handlers read through the vault, keys.get treats an empty saved secret as existing, the vault module documents the cooldown and legacy retention, and the inventories match the changed sources. The live check was reported by the user on a real Keychain: no prompt at start and one prompt after a restart.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✗ `t6`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/fixtures/fake-keytar.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/__tests__/on-demand-open.test.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/connection-management-rpc.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/db-rpc.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/db/__tests__/fixtures/session-source-inventory.json` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/db/managed-store.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/db/management-defaults.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/db/management.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/db/secrets.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/index.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/mcp/__tests__/helpers/mcp-e2e.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/shared/keystore.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/threads/__tests__/fixtures/module-state-inventory.json` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/shared/__tests__/keystore-vault.test.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/__tests__/keystore-forwarding.test.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/threads/main-services.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/threads/worker-entry.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/bin/insrc-connection-maintenance.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/__tests__/keystore-guard.test.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/shared/paths.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/assets/connection-management-inventory.json` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/__tests__/keystore-consumers.test.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/handler-runtime.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/db/__tests__/fixtures/driver-field-matrix.json` — **insrc-build** (2026-11-08T19:40:34.708Z)
- `src/daemon/db/management-adoption.ts` — **insrc-build** (2026-11-08T19:40:34.708Z)
