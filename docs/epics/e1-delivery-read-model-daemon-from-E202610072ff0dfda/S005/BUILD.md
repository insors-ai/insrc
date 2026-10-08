<!-- insrc:artifact BUILD-2ff0dfdadb1c8d1c-s5 -->

# Build (plan-driven) — Story s5

**Standalone:** no  ·  **Created:** 2026-10-08T16:34:46.213Z  ·  **Updated:** 2026-10-08T17:18:02.881Z

**Commit:** 84ddd615

## Summary

Published the delivery read model over IPC: workflow.delivery (one snapshot of every work item) and workflow.deliveryEvidence (one record's meta, body and markdown), with the shared markdown port and docs/ containment, and the VS Code and JetBrains client mirrors.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✗ `t3`
- ✓ `t4`
- ✓ `t5`

## Changes

- `src/daemon/__tests__/delivery-handler-contract.test.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/daemon/index.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/artifact-content.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/__tests__/contract.test.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/__tests__/currency.test.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/__tests__/fixtures/delivery-snapshot.sample.json` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/__tests__/handlers.test.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/__tests__/load.test.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/__tests__/snapshot.test.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/__tests__/types.test.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/handlers.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/load.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/markdown.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/read.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/snapshot.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/delivery/types.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `src/workflow/pending.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `vscode-plugin/src/delivery/delivery-contract.ts` — **insrc-build** (2026-10-08T17:18:02.881Z)
- `vscode-plugin/tsconfig.delivery-contract.json` — **insrc-build** (2026-10-08T17:18:02.881Z)
