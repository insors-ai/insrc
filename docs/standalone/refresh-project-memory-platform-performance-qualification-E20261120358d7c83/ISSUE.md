<!-- insrc:artifact ISSUE-358d7c83530cde0b -->

# Refresh project-memory platform and performance qualification

## Reproduction

S001 Linux qualification and S002 macOS/Linux crash-proof checks compare archived source commits to current package/workflow paths and reject differences. The queue-cost proof also rejects the changed src/host-node.ts hash. The portable package tests passed in the audit; no new external native qualification run was performed.

## Root cause

Archived native and performance evidence predates the current implementation and workflow. The tests intentionally reject stale evidence before accepting qualification claims; this is not proof that a fresh platform run fails.

## Fix intent

Once relevant package changes are stable, execute the required native/crash/packed-consumer and performance studies on their actual supported platforms and record authentic evidence bound to the tested source. Acceptance: current-source evidence checks and negative stale-proof controls pass; Linux/ext4 claims come from Linux/ext4 execution and macOS/APFS claims from macOS/APFS execution. Keep this package-specific qualification separate from connection-management proof and do not copy hashes or invent external results.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `scripts/__tests__/project-memory-s2-qualification.test.ts`
