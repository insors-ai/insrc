<!-- insrc:artifact BUILD-5437d6e54c9e7d48-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-16T12:29:31.630Z  ·  **Updated:** 2026-10-16T12:36:16.256Z

**Commit:** 91892140

## Summary

New src/db/graph/__tests__/lmdb-txn-semantics.test.ts pins lmdb's behaviour (read back in a fresh node process after a reopen: root.transaction keeps a throwing callback's write, childTransaction and transactionSync discard it) and checks the store opens without writemap mode (a real childTransaction on a store-module store). Falsifying mutations recorded in docs/standalone/graph-store-write-transaction-whose-callback-E202610165437d6e5/S001/evidence/t3-suites.md: child case switched to root.transaction fails the pin; useWritemap: true fails the open test with lmdb's own message. src/db suites 520/520 at commit a6b80446. The lock-loss suites are unchanged files and pass.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/package-lock.json` — **insrc-build** (2026-10-16T12:36:16.256Z)
